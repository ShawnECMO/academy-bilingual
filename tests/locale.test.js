// 執行：node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const { detectLocale, buildTargetUrl, sameLanguage, languageInfo } = require('../locale.js');

const O = 'https://academy.claude.com';

test('detectLocale: 各語系前綴', () => {
  assert.equal(detectLocale(`${O}/zh-TW/courses/x`), 'zh-TW');
  assert.equal(detectLocale(`${O}/ja/courses/x`), 'ja');
  assert.equal(detectLocale(`${O}/ko/courses/x`), 'ko');
  assert.equal(detectLocale(`${O}/zh-CN/courses/x`), 'zh-CN');
  assert.equal(detectLocale(`${O}/fr`), 'fr');
  assert.equal(detectLocale(`${O}/zh-TW`), 'zh-TW');
  assert.equal(detectLocale(`${O}/zh-TW/`), 'zh-TW');
  assert.equal(detectLocale(`${O}/zh-Hant/x`), 'zh-Hant');
  assert.equal(detectLocale(`${O}/es-419/x`), 'es-419');
});

test('detectLocale: 英文頁與非語系路徑回傳 null', () => {
  assert.equal(detectLocale(`${O}/courses/x`), null);
  assert.equal(detectLocale(`${O}/`), null);
  assert.equal(detectLocale(`${O}/all`), null);
  assert.equal(detectLocale(`${O}/webinars`), null);
  assert.equal(detectLocale(`${O}/EN/courses`), null);
  assert.equal(detectLocale(`${O}/zh-TWN/x`), null);
});

test('detectLocale: 無效網址回傳 null，不丟例外', () => {
  assert.equal(detectLocale('not a url'), null);
  assert.equal(detectLocale(''), null);
  assert.equal(detectLocale(undefined), null);
  assert.equal(detectLocale('/zh-TW/courses'), null);
});

test('buildTargetUrl: 語系頁 → 英文（去掉前綴）', () => {
  assert.equal(buildTargetUrl(`${O}/zh-TW/courses/x/y`), `${O}/courses/x/y`);
  assert.equal(buildTargetUrl(`${O}/ja/courses/x`), `${O}/courses/x`);
  assert.equal(buildTargetUrl(`${O}/ko/courses/x`), `${O}/courses/x`);
  assert.equal(buildTargetUrl(`${O}/zh-TW/all`), `${O}/all`);
});

test('buildTargetUrl: 語系首頁 → 英文首頁', () => {
  assert.equal(buildTargetUrl(`${O}/zh-TW`), `${O}/`);
  assert.equal(buildTargetUrl(`${O}/zh-TW/`), `${O}/`);
});

test('buildTargetUrl: 保留 query、去掉 hash', () => {
  assert.equal(buildTargetUrl(`${O}/ja/courses/x?tab=2#sec`), `${O}/courses/x?tab=2`);
});

test('buildTargetUrl: 英文 → 其他語系（為未來語言選單預留）', () => {
  assert.equal(buildTargetUrl(`${O}/courses/x`, 'ja'), `${O}/ja/courses/x`);
  assert.equal(buildTargetUrl(`${O}/zh-TW/courses/x`, 'ko'), `${O}/ko/courses/x`);
  assert.equal(buildTargetUrl(`${O}/`, 'ja'), `${O}/ja`);
  assert.equal(buildTargetUrl(`${O}/ja/x`, 'en-US'), `${O}/x`);
});

test('buildTargetUrl: 無效網址回傳 null', () => {
  assert.equal(buildTargetUrl('garbage'), null);
  assert.equal(buildTargetUrl(''), null);
});

test('sameLanguage', () => {
  assert.equal(sameLanguage('zh-TW', 'zh-tw'), true);
  assert.equal(sameLanguage('zh-TW', 'zh-CN'), false);
  assert.equal(sameLanguage('ja', 'ja-JP'), true);
  assert.equal(sameLanguage('en', 'en-US'), true);
  assert.equal(sameLanguage('ko', 'ja'), false);
  assert.equal(sameLanguage('', 'en'), false);
  assert.equal(sameLanguage(null, 'en'), false);
});

test('languageInfo: 已列出的語系', () => {
  assert.equal(languageInfo('zh-TW').toggle, '顯示 / 隱藏英文原文');
  assert.equal(languageInfo('ja').name, '日本語');
  assert.equal(languageInfo('ko').name, '한국어');
  assert.equal(languageInfo('en').label, 'EN');
});

test('languageInfo: 地區變體退回主要語言、沒列到的退回英文', () => {
  assert.equal(languageInfo('ja-JP').name, '日本語');
  assert.equal(languageInfo('zh-tw').name, '繁體中文');
  assert.equal(languageInfo('zh-HK').toggle, 'Show / hide English');
  assert.equal(languageInfo('fr').toggle, 'Show / hide English');
  assert.equal(languageInfo(null).label, 'EN');
});
