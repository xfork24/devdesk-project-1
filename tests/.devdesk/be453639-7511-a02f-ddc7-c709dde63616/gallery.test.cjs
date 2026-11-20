'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = path.resolve(__dirname, '../../..', 'index.html');
assert.ok(fs.existsSync(source), '欢迎页必须交付');
const html = fs.readFileSync(source, 'utf8');
// Parse real IDs rather than inventing the gallery in the fixture. This fixture
// models events and request completion; CSS geometry belongs to browser acceptance.
function open(omit) {
  const nodes = new Map(), requests = [];
  const document = {body: {style: {overflow: 'auto'}}, activeElement: null,
    createElement() { return {}; }, getElementById(id) { return nodes.get(id) || null; }};
  for (const m of html.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi)) {
    const attrs = Object.fromEntries([...m[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], a[2]]));
    if (!attrs.id || attrs.id === omit) continue;
    const handlers = {}, classes = new Set((attrs.class || '').split(/\s+/));
    const node = {tagName: m[1].toUpperCase(), attrs, style: {}, hidden: /\bhidden\b/.test(m[2]),
      textContent: html.slice(m.index + m[0].length).split('<')[0],
      setAttribute(k,v) { attrs[k] = String(v); }, getAttribute(k) { return attrs[k]; },
      addEventListener(k, fn) { (handlers[k] ||= []).push(fn); },
      dispatch(k, event = {}) { for (const fn of handlers[k] || []) fn(event); },
      click() { this.dispatch('click'); }, focus() { document.activeElement = this; },
      classList: {toggle(k, on) { if (on) classes.add(k); else classes.delete(k); }, contains(k) { return classes.has(k); }},
      closest(selector) { if (selector !== 'button') return null; return nodes.get('gallery-trigger') || null; }};
    nodes.set(attrs.id, node);
  }
  const window = {scrollX: 7, scrollY: 91, scrollTo(p, y) { this.scrollX = typeof p === 'object' ? p.left : p; this.scrollY = typeof p === 'object' ? p.top : y; }};
  class Image { constructor() { requests.push(this); } }
  const context = vm.createContext({document, window, Image});
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) vm.runInContext(script[1], context, {timeout: 1000});
  return {nodes, document, window, requests, get(id) { const n = nodes.get(id); assert.ok(n, `缺少 DOM 接口 ${id}`); return n; }};
}
function loaded(p) {
  assert.ok(p.requests.length, '应请求当前图片');
  assert.equal(typeof p.requests.at(-1).onload, 'function');
  p.requests.at(-1).onload();
  assert.equal(p.get('gallery-image').hidden, false);
}
function sequence(p) {
  const urls = [];
  for (let i = 0; i < 5; i++) { urls.push(p.get('gallery-image').src); p.get('gallery-next').click(); }
  assert.equal(new Set(urls).size, 5, '必须恰有五张不同图片');
  assert.equal(p.get('gallery-image').src, urls[0], '第五张后回到第一张');
  return urls;
}
test('AC-1 初始图片、原生控件、替代文字及加载反馈', () => {
  const p = open();
  for (const id of ['gallery-prev', 'gallery-next', 'gallery-trigger']) assert.equal(p.get(id).tagName, 'BUTTON');
  p.get('gallery');
  assert.equal(p.get('gallery-image').tagName, 'IMG');
  assert.match(p.get('gallery-image').src, /^https:\/\/images\.pexels\.com\//);
  assert.ok(p.get('gallery-image').alt.trim());
  assert.match(p.get('gallery-status').textContent, /加载/);
  loaded(p);
  assert.doesNotMatch(p.get('gallery-status').textContent, /加载|失败/);
  const urls = sequence(p);
  for (const url of urls) assert.match(url, /^https:\/\/images\.pexels\.com\//);
  assert.equal(open().get('gallery-image').src, urls[0], '刷新恢复第一张');
});
test('AC-2 双向完整循环与连续快速切换每次仅一张', () => {
  const p = open(), urls = sequence(p);
  for (let round = 0; round < 3; round++) {
    for (let i = 4; i >= 0; i--) { p.get('gallery-prev').click(); assert.equal(p.get('gallery-image').src, urls[i]); }
    for (let i = 1; i <= 5; i++) { p.get('gallery-next').click(); assert.equal(p.get('gallery-image').src, urls[i % 5]); }
  }
});
test('AC-3/4 五张图片重复展开还原、身份、焦点、滚动和恢复切换', () => {
  const p = open(), urls = sequence(p), image = p.get('gallery-image'), trigger = p.get('gallery-trigger');
  for (let i = 0; i < 5; i++) {
    loaded(p);
    for (let repeat = 0; repeat < 2; repeat++) {
      trigger.focus(); p.window.scrollX = 7; p.window.scrollY = 91;
      const beforeAlt = image.alt;
      trigger.click();
      assert.equal(trigger.attrs['aria-expanded'], 'true');
      assert.ok(p.get('gallery').classList.contains('expanded'));
      assert.equal(image.src, urls[i]); assert.equal(image.alt, beforeAlt);
      assert.equal(p.document.body.style.overflow, 'hidden');
      p.window.scrollY = 0;
      trigger.click();
      assert.equal(trigger.attrs['aria-expanded'], 'false');
      assert.equal(p.get('gallery').classList.contains('expanded'), false);
      assert.equal(image.src, urls[i]); assert.equal(image.alt, beforeAlt);
      assert.equal(p.window.scrollX, 7); assert.equal(p.window.scrollY, 91);
      assert.equal(p.document.activeElement, trigger);
      assert.equal(p.document.body.style.overflow, 'auto');
    }
    p.get('gallery-next').click(); assert.equal(image.src, urls[(i + 1) % 5]);
  }
});
test('failure-recovery 失败保留控件、切换恢复及过期成功/失败隔离', () => {
  const p = open(), image = p.get('gallery-image'), status = p.get('gallery-status');
  const first = p.requests.at(-1);
  assert.equal(typeof first.onerror, 'function'); first.onerror();
  assert.match(status.textContent, /失败/); assert.equal(image.hidden, true);
  p.get('gallery'); p.get('gallery-prev'); p.get('gallery-next').click();
  assert.match(status.textContent, /加载/);
  const pendingText = status.textContent;
  first.onload(); first.onerror();
  assert.equal(status.textContent, pendingText); assert.equal(image.hidden, true);
  loaded(p); const readyText = status.textContent;
  first.onerror(); first.onload();
  assert.equal(status.textContent, readyText); assert.equal(image.hidden, false);
  for (let i = 0; i < 12; i++) p.get('gallery-next').click();
  loaded(p); const finalText = status.textContent, finalSrc = image.src;
  for (const old of p.requests.slice(0, -1).reverse()) { old.onload(); old.onerror(); }
  assert.equal(status.textContent, finalText); assert.equal(image.src, finalSrc); assert.equal(image.hidden, false);
});
test('failure-recovery 缺少任一必需节点时安全退出并保留语言交互', () => {
  for (const id of ['gallery', 'gallery-image', 'gallery-prev', 'gallery-next', 'gallery-status', 'gallery-trigger']) {
    let p;
    assert.doesNotThrow(() => { p = open(id); }, id);
    assert.equal(p.requests.length, 0, id);
    p.get('language-toggle').click(); assert.equal(p.get('welcome-message').textContent, 'Welcome');
  }
});
