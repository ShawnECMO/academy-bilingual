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

  return { DEFAULT_LOCALE, detectLocale, buildTargetUrl, sameLanguage };
})();

if (typeof module === 'object') module.exports = PRLocale;
