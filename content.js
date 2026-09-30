(() => {
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

  const SEL = 'main h1, main h2, main h3, main h4, main p, main li';
  const LOG = '[Parallel Reader]';
  let visible = true;
  let running = false;
  let lastUrl = '';

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

  async function waitForContent(getList, minCount = 1, tries = 30) {
    for (let i = 0; i < tries; i++) {
      const list = getList();
      if (list.length >= minCount) return list;
      await sleep(300);
    }
    return getList();
  }

  // 網站的箭頭、錨點等圖示是 icon font 字元（私用區 U+E000–U+F8FF），
  // 包在 aria-hidden 的 span 裡。直接取 innerText 會把它們一起抓進來，
  // 換成我們的字型後就變成奇怪符號，所以先拿掉裝飾元素再取文字。
  function cleanText(el) {
    const c = el.cloneNode(true);
    c.querySelectorAll('[aria-hidden="true"], svg, .bi-en').forEach(n => n.remove());
    return (c.textContent || '')
      .replace(/[-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ── 載入目標語言頁面 ───────────────────────────────────────
  // 課程內容是伺服器端輸出的，直接抓 HTML 解析就好，不用開 iframe
  // 跑整個網站的 JS。任何失敗（逾時、非 200、被轉到別的語系）都回傳
  // null，讓呼叫端安靜放棄，不重試。
  const FETCH_TIMEOUT_MS = 10000;

  async function loadDocument(url, signal) {
    if (!url) return null;
    const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        credentials: 'same-origin',
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
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

  async function apply() {
    if (running) return;
    running = true;
    try {
      document.querySelectorAll('.bi-en').forEach(e => e.remove());
      const zh = await waitForContent(() => [...document.querySelectorAll(SEL)]);

      const doc = await loadDocument(PRLocale.buildTargetUrl(location.href));
      if (!doc) return;
      const en = [...doc.querySelectorAll(SEL)];

      if (en.length !== zh.length) {
        console.warn(`${LOG} 段落數不一致 source=${zh.length} target=${en.length}`);
      }

      zh.forEach((z, i) => {
        const e = en[i];
        if (!e) return;
        const t = cleanText(e);
        if (!t || t === cleanText(z)) return;
        const d = document.createElement('div');
        d.className = 'bi-en';
        d.textContent = t;
        d.hidden = !visible;
        z.appendChild(d);
      });
    } catch (err) {
      console.error(`${LOG} 失敗`, err);
    } finally {
      running = false;
    }
  }

  // 左下角切換按鈕
  const btn = document.createElement('button');
  btn.id = 'bi-toggle';
  btn.textContent = 'EN';
  btn.title = '顯示 / 隱藏英文原文';
  btn.onclick = () => {
    visible = !visible;
    btn.classList.toggle('bi-off', !visible);
    document.querySelectorAll('.bi-en').forEach(e => (e.hidden = !visible));
  };
  document.body.appendChild(btn);

  // SPA 換頁偵測
  setInterval(() => {
    if (location.href !== lastUrl && PRLocale.detectLocale(location.href)) {
      lastUrl = location.href;
      setTimeout(apply, 800);
    }
  }, 1000);
})();
