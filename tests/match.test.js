// 執行：node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeText, matchBlocks } = require('../match.js');

// 'H2 P P H3 LI' → [{tag:'H2'}, {tag:'P'}, ...]
const B = s => s.split(' ').map(tag => ({ tag, text: tag }));

test('normalizeText: 拿掉 icon font 字元、合併空白', () => {
  assert.equal(normalizeText('\n  Hello   world '), 'Hello world');
  assert.equal(normalizeText('AB'), 'AB');
  assert.equal(normalizeText(''), '');
  assert.equal(normalizeText(null), '');
});

test('matchBlocks: 結構完全相同 → 逐段配對', () => {
  const r = matchBlocks(B('LI H1 P H2 P LI'), B('LI H1 P H2 P LI'));
  assert.equal(r.mode, 'exact');
  assert.deepEqual(r.pairs, [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5]]);
});

test('matchBlocks: 某章節多一段 → 只跳過那一節', () => {
  const src = B('H1 P H2 P P H2 P');
  const tgt = B('H1 P H2 P H2 P');
  const r = matchBlocks(src, tgt);
  assert.equal(r.mode, 'sections');
  assert.equal(r.skipped, 1);
  assert.deepEqual(r.pairs, [[0, 0], [1, 1], [5, 4], [6, 5]]);
});

test('matchBlocks: 清單項目數不同 → 只跳過那一節', () => {
  const r = matchBlocks(B('H2 LI LI LI H2 P'), B('H2 LI LI H2 P'));
  assert.equal(r.mode, 'sections');
  assert.deepEqual(r.pairs, [[4, 3], [5, 4]]);
});

test('matchBlocks: 標題數量不同 → 整頁不配對', () => {
  const r = matchBlocks(B('H1 P H2 P H2 P'), B('H1 P H2 P'));
  assert.equal(r.mode, 'mismatch');
  assert.deepEqual(r.pairs, []);
});

test('matchBlocks: 標題層級不同 → 整頁不配對', () => {
  const r = matchBlocks(B('H1 P H2 P'), B('H1 P H3 P'));
  assert.equal(r.mode, 'mismatch');
});

test('matchBlocks: 目標頁是 404（H1 P）→ 不配對', () => {
  const r = matchBlocks(B('LI LI H1 P LI LI P LI'), B('H1 P'));
  assert.deepEqual(r.pairs, []);
});

test('matchBlocks: 任一邊是空的 → 不配對', () => {
  assert.deepEqual(matchBlocks([], B('P')).pairs, []);
  assert.deepEqual(matchBlocks(B('P'), []).pairs, []);
});

test('matchBlocks: 第一個標題前的內容自成一節', () => {
  const r = matchBlocks(B('LI LI H1 P'), B('LI H1 P'));
  assert.equal(r.mode, 'sections');
  assert.deepEqual(r.pairs, [[2, 1], [3, 2]]);
});
