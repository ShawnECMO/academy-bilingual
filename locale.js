// ── 語系偵測與網址轉換 ─────────────────────────────────────
// 純函式，不碰 DOM，可以直接用 `node --test` 測。
//
// Claude Academy 的網址規則（2026-09 實測）：
//   英文      /courses/...          （沒有前綴，/en/... 會轉址到這裡）
//   其他語系  /zh-TW/... /ja/... /ko/... /fr/... /de/... /es/... /zh-CN/...
// 所以不維護支援清單：第一段路徑長得像語系代碼就當成語系，
// 萬一誤判，對應的英文頁會 404，content.js 會直接放棄，不會插錯內容。
var PRLocale = (() => {
  // 網站預設語系：網址不帶前綴
  const DEFAULT_LOCALE = 'en';

  // BCP 47 的常見形狀：ja、zh-TW、zh-Hant、es-419
  const LOCALE_RE = /^[a-z]{2}(?:-(?:[A-Za-z]{2}|[A-Za-z]{4}|\d{3}))?$/;

  function toUrl(url) {
    try {
      return new URL(url);
    } catch {
      return null;
    }
  }

  function firstSegment(pathname) {
    return pathname.split('/')[1] || '';
  }

  // 從網址取出語系；沒有語系前綴（英文頁）或網址無效時回傳 null
  function detectLocale(url) {
    const u = toUrl(url);
    if (!u) return null;
    const seg = firstSegment(u.pathname);
    return LOCALE_RE.test(seg) ? seg : null;
  }

  // 同一頁在 targetLocale 的網址（保留 query，去掉 hash）；網址無效時回傳 null
  function buildTargetUrl(url, targetLocale = DEFAULT_LOCALE) {
    const u = toUrl(url);
    if (!u) return null;
    let rest = u.pathname;
    if (detectLocale(u.href)) rest = rest.slice(firstSegment(rest).length + 1);
    if (!rest.startsWith('/')) rest = '/' + rest;
    const prefix = sameLanguage(targetLocale, DEFAULT_LOCALE) ? '' : '/' + targetLocale;
    // 語系首頁是 /ja 而不是 /ja/
    const path = prefix && rest === '/' ? prefix : prefix + rest;
    return u.origin + path + u.search;
  }

  // 只比主要語言：zh-TW 和 zh-tw 相同，zh-TW 和 zh-CN 不同，en 和 en-US 相同
  function sameLanguage(a, b) {
    if (!a || !b) return false;
    const [pa, ra] = a.toLowerCase().split('-');
    const [pb, rb] = b.toLowerCase().split('-');
    if (pa !== pb) return false;
    return pa === 'en' || !ra || !rb || ra === rb;
  }

  // ── 語言設定 ───────────────────────────────────────────────
  // 這裡只放「顯示用」的資料，不決定哪些語系會啟用；沒列到的語系
  // 一樣會運作，只是介面文字退回英文。之後做語言選單也從這裡擴充。
  //   label   目標語言按鈕上的縮寫
  //   toggle  按鈕提示文字，依「使用者目前的頁面語系」顯示
  const LANGUAGES = {
    en: { name: 'English', label: 'EN', toggle: 'Show / hide English' },
    'zh-TW': { name: '繁體中文', toggle: '顯示 / 隱藏英文原文' },
    'zh-CN': { name: '简体中文', toggle: '显示 / 隐藏英文原文' },
    ja: { name: '日本語', toggle: '英語の原文を表示 / 非表示' },
    ko: { name: '한국어', toggle: '영어 원문 표시 / 숨기기' },
  };

  // 找語系設定：先找完全相同，再找主要語言相同（ja-JP → ja），最後退回英文
  function languageInfo(locale) {
    if (!locale) return LANGUAGES[DEFAULT_LOCALE];
    const key = Object.keys(LANGUAGES).find(k => k.toLowerCase() === locale.toLowerCase())
      || Object.keys(LANGUAGES).find(k => sameLanguage(k, locale) && !k.includes('-'));
    return { ...LANGUAGES[DEFAULT_LOCALE], ...(key && LANGUAGES[key]) };
  }

  return { DEFAULT_LOCALE, LANGUAGES, detectLocale, buildTargetUrl, sameLanguage, languageInfo };
})();

if (typeof module === 'object') module.exports = PRLocale;
