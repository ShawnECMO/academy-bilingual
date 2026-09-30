// ── 段落擷取與配對 ─────────────────────────────────────────
// 原則：寧可不插，也不要把錯的英文放到使用者眼前。
//
// 目前 Claude Academy 各語系是同一套模板產生的，段落的標籤順序
// 完全一致，所以大多數頁面走第 1 層就結束。後面兩層是給翻譯落後、
// 某語系多一段 / 少一段這種情況用的。
//
//   1. 整頁標籤順序相同      → 逐段配對
//   2. 不同，但標題結構相同  → 以標題切成章節，只配對標籤順序相同的章節
//   3. 連標題結構都不同      → 整頁不配對
//
// matchBlocks / normalizeText 是純函式，可以直接用 `node --test` 測。
var PRMatch = (() => {
  const SELECTOR = 'main h1, main h2, main h3, main h4, main p, main li';
  const HEADING = /^H[1-4]$/;

  // 網站的箭頭、錨點等圖示是 icon font 字元（私用區 U+E000–U+F8FF），
  // 包在 aria-hidden 的 span 裡，換成我們的字型就變成怪符號，要拿掉。
  const ICON_GLYPHS = /[-]/g;
  const DECORATION = '[aria-hidden="true"], svg, [data-pr]';

  function normalizeText(s) {
    return (s || '').replace(ICON_GLYPHS, '').replace(/\s+/g, ' ').trim();
  }

  function cleanText(el) {
    const c = el.cloneNode(true);
    c.querySelectorAll(DECORATION).forEach(n => n.remove());
    return normalizeText(c.textContent);
  }

  // 只留最內層：<li><p>…</p></li> 只取 <p>，避免同一段插兩次
  function extractBlocks(root) {
    const els = [...root.querySelectorAll(SELECTOR)];
    return els
      .filter(el => !els.some(o => o !== el && el.contains(o)))
      .map(el => ({ el, tag: el.tagName, text: cleanText(el) }));
  }

  const tagsOf = blocks => blocks.map(b => b.tag).join(',');

  // 以標題切章節；第一個標題之前的內容（麵包屑等）自成一節
  function sections(blocks) {
    const out = [];
    let cur = { start: 0, blocks: [] };
    blocks.forEach((b, i) => {
      if (HEADING.test(b.tag) && cur.blocks.length) {
        out.push(cur);
        cur = { start: i, blocks: [] };
      }
      cur.blocks.push(b);
    });
    if (cur.blocks.length) out.push(cur);
    return out;
  }

  // 回傳 { pairs: [[sourceIndex, targetIndex], ...], mode }
  function matchBlocks(source, target) {
    if (!source.length || !target.length) return { pairs: [], mode: 'empty' };

    if (tagsOf(source) === tagsOf(target)) {
      return { pairs: source.map((_, i) => [i, i]), mode: 'exact' };
    }

    const ss = sections(source);
    const ts = sections(target);
    const headings = secs => secs.map(s => s.blocks[0].tag).join(',');
    if (ss.length !== ts.length || headings(ss) !== headings(ts)) {
      return { pairs: [], mode: 'mismatch' };
    }

    const pairs = [];
    let skipped = 0;
    ss.forEach((s, k) => {
      const t = ts[k];
      if (tagsOf(s.blocks) !== tagsOf(t.blocks)) {
        skipped++;
        return;
      }
      s.blocks.forEach((_, j) => pairs.push([s.start + j, t.start + j]));
    });
    return { pairs, mode: 'sections', skipped };
  }

  return { SELECTOR, normalizeText, cleanText, extractBlocks, matchBlocks };
})();

if (typeof module === 'object') module.exports = PRMatch;
