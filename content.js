(() => {
  // 擴充功能重新載入 / 更新時，舊的 content script 可能還留在頁面上。
  // 用一個全域旗標確保同一頁只跑一份。
  if (window.__parallelReader) return;
  window.__parallelReader = true;

  // ── 配色設定（想換色只改這裡）────────────────────────────────
  // 亮色模式用深一點的磚紅，暗色模式用柔和的淺橘，
  // 在黑底上不刺眼，也不會跟正文搶焦點。
  const THEME = {
    light: { text: '#a1522d', btnBg: '#a1522d', btnFg: '#ffffff', btnBorder: '#a1522d' },
    dark:  { text: '#e0a17d', btnBg: '#e0a17d', btnFg: '#1f1e1d', btnBorder: '#e0a17d' },
  };
  // 其他可選配色（把上面整個 THEME 換掉即可）：
  //   中性灰   light:#4b5563 / dark:#a8a29e
  //   青綠     light:#0f766e / dark:#5eead4
  //   原本的藍 light:#2563eb / dark:#7ea6f5
  // ────────────────────────────────────────────────────────────

  const LOG = '[Parallel Reader]';
  // 對照語言。目前固定英文，之後做語言選單時改成使用者的選擇即可。
  const TARGET_LOCALE = PRLocale.DEFAULT_LOCALE;
  let visible = true;
  let lastUrl = '';
  let lastHeading = ''; // 上一頁的 h1，用來判斷 SPA 換頁後內容換好了沒
  let current = null; // 目前這一輪的 AbortController

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ── 主題偵測 ───────────────────────────────────────────────
  // 先看網站自己標記的 dark（class / data-theme），都沒有再退回
  // 實際背景色亮度，最後才看系統偏好。
  function isDark() {
    const html = document.documentElement;
    const body = document.body;
    for (const el of [html, body]) {
      if (!el) continue;
      if (el.classList.contains('dark')) return true;
      if (el.classList.contains('light')) return false;
      const t = (el.dataset.theme || el.dataset.mode || el.getAttribute('data-color-mode') || '').toLowerCase();
      if (t.includes('dark')) return true;
      if (t.includes('light')) return false;
    }
    const bg = getComputedStyle(body || html).backgroundColor;
    const m = bg && bg.match(/\d+(\.\d+)?/g);
    if (m && m.length >= 3 && (m.length < 4 || parseFloat(m[3]) > 0)) {
      const [r, g, b] = m.map(Number);
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 128;
    }
    return matchMedia('(prefers-color-scheme: dark)').matches;
  }

  // 用 CSS 變數 + 一張 style sheet 統一上色，切主題時只改變數即可
  const style = document.createElement('style');
  style.textContent = `
    .bi-en {
      color: var(--bi-text);
      font-size: 0.9em;
      font-weight: normal;
      font-style: italic;
      margin-top: 2px;
    }
    .bi-en[hidden] { display: none; }
    #bi-toggle {
      position: fixed;
      left: 16px;
      bottom: 16px;
      z-index: 99999;
      padding: 6px 10px;
      border-radius: 8px;
      border: 1px solid var(--bi-btn-border);
      background: var(--bi-btn-bg);
      color: var(--bi-btn-fg);
      font: 600 12px sans-serif;
      cursor: pointer;
    }
    #bi-toggle.bi-off {
      background: transparent;
      color: var(--bi-btn-border);
    }
  `;
  document.documentElement.appendChild(style);

  function paint() {
    const c = isDark() ? THEME.dark : THEME.light;
    const s = document.documentElement.style;
    s.setProperty('--bi-text', c.text);
    s.setProperty('--bi-btn-bg', c.btnBg);
    s.setProperty('--bi-btn-fg', c.btnFg);
    s.setProperty('--bi-btn-border', c.btnBorder);
  }
  paint();

  // 網站切換主題 / 系統切換深淺色時，跟著重新上色
  new MutationObserver(paint).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-theme', 'data-mode', 'data-color-mode'],
  });
  if (document.body) {
    new MutationObserver(paint).observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme', 'data-mode'],
    });
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paint);

  // SPA 換頁時網址會先變，內容晚一點才換。等 main 裡的 h1 跟上一頁
  // 不同再開始；上一頁沒有 h1 就退回 v1.0 的固定等待。最多等約 9 秒。
  async function waitForContent(prevHeading, isFirst, signal) {
    if (!isFirst && !prevHeading) await sleep(800);
    for (let i = 0; i < 30; i++) {
      if (signal.aborted) return false;
      const ready = document.querySelector(PRMatch.SELECTOR);
      if (ready && (isFirst || !prevHeading || headingText() !== prevHeading)) return true;
      await sleep(300);
    }
    return !signal.aborted && !!document.querySelector(PRMatch.SELECTOR);
  }

  // 首次載入時網站會在伺服器輸出之後再改一輪文字（例如麵包屑從
  // "Courses" 換成「課程」）。太早讀會拿到英文，跟目標頁一樣就被當成
  // 「不用顯示」。等 main 安靜一小段時間再讀，最多等 3 秒。
  const QUIET_MS = 400;
  const QUIET_MAX_MS = 3000;

  function waitForQuiet(signal) {
    const main = document.querySelector('main');
    if (!main) return Promise.resolve();
    return new Promise(resolve => {
      let timer;
      const done = () => {
        clearTimeout(timer);
        clearTimeout(cap);
        observer.disconnect();
        signal.removeEventListener('abort', done);
        resolve();
      };
      const observer = new MutationObserver(muts => {
        // 我們自己插的英文不算
        if (muts.every(m => [...m.addedNodes, ...m.removedNodes].every(n => n.dataset?.pr !== undefined))) return;
        clearTimeout(timer);
        timer = setTimeout(done, QUIET_MS);
      });
      observer.observe(main, { childList: true, subtree: true, characterData: true });
      timer = setTimeout(done, QUIET_MS);
      const cap = setTimeout(done, QUIET_MAX_MS);
      signal.addEventListener('abort', done);
    });
  }

  // 用 cleanText 排除我們自己插的英文，否則 clear() 之後標題就「變了」
  function headingText() {
    const h1 = document.querySelector('main h1');
    return h1 ? PRMatch.cleanText(h1) : '';
  }


  // ── 載入目標語言頁面 ───────────────────────────────────────
  // 先抓 HTML 直接解析：大部分課程內容是伺服器端輸出的，這樣最快，
  // 也不用跑網站的 JS。但互動練習（[data-living-embed]）是載入後
  // 才由 JS 畫出來的，HTML 裡沒有，結構會對不上。這時才退回 v1.0 的
  // 做法：開一個看不見的 iframe 讓英文頁完整跑完再讀。
  // 任何失敗（逾時、非 200）都回傳 null，讓呼叫端安靜放棄，不重試。
  const FETCH_TIMEOUT_MS = 10000;
  const FRAME_TIMEOUT_MS = 15000;

  async function fetchDocument(url, signal) {
    const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        credentials: 'same-origin',
        signal: AbortSignal.any([signal, timeout]),
      });
      if (!res.ok) return null;
      return new DOMParser().parseFromString(await res.text(), 'text/html');
    } catch (err) {
      if (err.name !== 'AbortError' && err.name !== 'TimeoutError') {
        console.warn(`${LOG} 無法載入 ${url}`, err.message);
      }
      return null;
    }
  }

  // 等 iframe 裡的段落數追上目前頁面（或逾時）再交出 document。
  // 回傳 { doc, dispose }，讀完要呼叫 dispose 把 iframe 移掉。
  function frameDocument(url, wantBlocks, signal) {
    return new Promise(resolve => {
      const f = document.createElement('iframe');
      f.setAttribute('aria-hidden', 'true');
      f.tabIndex = -1;
      f.style.cssText = 'position:fixed;left:-9999px;top:0;width:1200px;height:900px;visibility:hidden';
      let poll;
      const finish = ok => {
        clearInterval(poll);
        clearTimeout(cap);
        signal.removeEventListener('abort', abort);
        const doc = ok ? f.contentDocument : null;
        resolve({ doc, dispose: () => f.remove() });
        if (!doc) f.remove();
      };
      const abort = () => finish(false);
      const cap = setTimeout(() => finish(true), FRAME_TIMEOUT_MS);
      signal.addEventListener('abort', abort);
      f.onload = () => {
        poll = setInterval(() => {
          const d = f.contentDocument;
          if (d && d.querySelectorAll(PRMatch.SELECTOR).length >= wantBlocks) finish(true);
        }, 300);
      };
      f.src = url;
      document.body.appendChild(f);
    });
  }

  const hasLiveWidgets = () => !!document.querySelector('main [data-living-embed]');

  // 互動練習以外的段落，依序對回伺服器 HTML 裡同標籤的段落，用那邊的文字
  function useServerText(framed, serverDoc) {
    const server = PRMatch.extractBlocks(serverDoc);
    let k = 0;
    for (const b of framed) {
      if (b.el.closest('[data-living-embed]')) continue;
      while (k < server.length && server[k].tag !== b.tag) k++;
      if (k >= server.length) return;
      b.text = server[k++].text;
    }
  }

  // ── 顯示 ───────────────────────────────────────────────────
  function clear() {
    document.querySelectorAll('[data-pr]').forEach(e => e.remove());
  }

  function render(source, target, pairs) {
    for (const [i, j] of pairs) {
      const s = source[i];
      const t = target[j];
      // 專有名詞、程式碼這種兩邊一樣的就不重複顯示
      if (!t.text || t.text === s.text) continue;
      const d = document.createElement('div');
      d.className = 'bi-en';
      d.dataset.pr = '';
      d.textContent = t.text;
      d.hidden = !visible;
      s.el.appendChild(d);
    }
  }

  const signature = blocks => blocks.map(b => b.tag + b.text).join('\n');
  const STALE_RETRIES = 2;

  // 每次換頁都取消上一輪，確保最後停下來的那一頁一定會跑
  async function apply(prevHeading, isFirst, retries = STALE_RETRIES) {
    current?.abort();
    const ctrl = new AbortController();
    current = ctrl;
    const { signal } = ctrl;
    clear();
    let frame = null;
    try {
      if (!(await waitForContent(prevHeading, isFirst, signal))) return;
      await waitForQuiet(signal);
      if (signal.aborted) return;
      const url = location.href;
      const targetUrl = PRLocale.buildTargetUrl(url, TARGET_LOCALE);
      const source = PRMatch.extractBlocks(document);
      const fetched = await fetchDocument(targetUrl, signal);
      let doc = fetched;
      // 這頁有互動練習時，HTML 裡沒有練習的文字，改用 iframe 等英文頁畫完
      if (doc && hasLiveWidgets() && !signal.aborted) {
        frame = await frameDocument(targetUrl, source.length, signal);
        doc = frame.doc;
      }
      // 載入期間使用者可能又換頁了
      if (!doc || signal.aborted || location.href !== url) return;

      // 快速連續換頁時，網址已經是新的但畫面可能還是上一頁。載入期間
      // 標題變了就代表剛才讀到的是舊頁面，以它為基準重新等一次。
      // 只看標題：首次載入時網站會把伺服器輸出的英文麵包屑換成在地語言，
      // 那是同一頁，不該觸發重試。
      const sourceHeading = source.find(b => b.tag === 'H1')?.text || '';
      if (headingText() !== sourceHeading) {
        if (retries > 0) apply(sourceHeading, false, retries - 1);
        return;
      }
      // 同一頁但段落有變（例如上面說的麵包屑），用最新的內容
      const latest = PRMatch.extractBlocks(document);
      if (signature(latest) !== signature(source)) source.splice(0, source.length, ...latest);
      const target = PRMatch.extractBlocks(doc);
      // iframe 裡的英文頁會跟著使用者的語系設定，把麵包屑等介面文字換成
      // 在地語言。那些段落以伺服器輸出的 HTML（fetch 結果）為準。
      if (frame) useServerText(target, fetched);

      const { pairs, mode, skipped } = PRMatch.matchBlocks(source, target);
      if (mode === 'mismatch') {
        console.info(`${LOG} 頁面結構不同，這頁不顯示對照 source=${source.length} target=${target.length}`);
      } else if (skipped) {
        console.info(`${LOG} ${skipped} 個章節結構不同，已略過`);
      }
      clear();
      render(source, target, pairs);
    } catch (err) {
      console.error(`${LOG} 失敗`, err);
    } finally {
      frame?.dispose();
      if (current === ctrl) current = null;
    }
  }

  // 左下角切換按鈕
  const btn = document.createElement('button');
  btn.id = 'bi-toggle';
  btn.textContent = PRLocale.languageInfo(TARGET_LOCALE).label;
  btn.hidden = true;
  btn.onclick = () => {
    visible = !visible;
    btn.classList.toggle('bi-off', !visible);
    document.querySelectorAll('[data-pr]').forEach(e => (e.hidden = !visible));
  };
  document.body.appendChild(btn);

  // ── SPA 換頁偵測 ───────────────────────────────────────────
  // 網站點課程連結不會整頁重新載入，所以輪詢網址變化。
  // hash 變化（頁內錨點）不算換頁。
  const pageKey = () => location.origin + location.pathname + location.search;

  // 只對整頁載入有效；SPA 換到不存在的頁面時，交給 matchBlocks 的結構檢查擋
  function pageNotFound() {
    const nav = performance.getEntriesByType('navigation')[0];
    return !!nav && nav.responseStatus >= 400;
  }

  function onRouteChange() {
    const key = pageKey();
    if (key === lastUrl) {
      lastHeading = headingText();
      return;
    }
    const isFirst = lastUrl === '';
    lastUrl = key;
    const locale = PRLocale.detectLocale(location.href);
    // 英文頁（或已經是對照語言的頁面）不用對照，按鈕也收起來。
    // 網址像語系但頁面本身是 404（例如 /ja-JP/...）也一樣不動作。
    // 註：<html lang> 不能拿來確認，網站在英文頁和 404 頁也會標成使用者的語系。
    if (!locale || PRLocale.sameLanguage(locale, TARGET_LOCALE) || (isFirst && pageNotFound())) {
      current?.abort();
      clear();
      btn.hidden = true;
      return;
    }
    btn.title = PRLocale.languageInfo(locale).toggle;
    btn.hidden = false;
    apply(lastHeading, isFirst);
  }

  onRouteChange();
  setInterval(onRouteChange, 500);
})();
