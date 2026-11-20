'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {open} = require('./page-harness.cjs');
const page = path.resolve(__dirname, '../../..', 'index.html');
assert.equal(page, '/work/index.html', 'independent page path');
const html = fs.readFileSync(page, 'utf8');
const required = ['gallery', 'gallery-image', 'gallery-prev', 'gallery-next', 'gallery-status'];
function boot(missing) {
  for (const id of required) assert.match(html, new RegExp('id=["\u0027]' + id + '["\u0027]'), `页面交付 DOM 接口 ${id}`);
  return open(html, missing);
}
function source(p) { return p.get('gallery-image').src; }
function status(p) { return p.get('gallery-status').textContent.trim(); }
function loaded(p) { p.loadCurrent('load'); }
function expanded(p) {
  const g = p.get('gallery');
  const trigger = p.get('gallery-image').closest('button');
  return [g, trigger].filter(Boolean).some(n => n.getAttribute('aria-expanded') === 'true' || n.getAttribute('data-expanded') === 'true' || /(?:expanded|fullscreen|full-screen)/i.test(n.className));
}
function imageClick(p) {
  const img = p.get('gallery-image');
  const trigger = img.closest('button');
  assert.ok(trigger, '图片使用原生按钮触发，键盘行为由浏览器复核');
  trigger.focus();
  img.click();
}
test('AC-1: 初始图像、欢迎内容与双向按钮', () => {
  const p = boot();
  assert.match(source(p), /^https:\/\//);
  assert.ok(p.get('gallery-image').alt.trim(), '图片有替代文字');
  for (const id of ['gallery-prev', 'gallery-next']) {
    assert.equal(p.get(id).tagName, 'BUTTON');
    assert.equal(p.get(id).disabled, false);
  }
  assert.equal(p.get('welcome-message').textContent, '欢迎');
  p.get('language-toggle').click();
  assert.equal(p.get('welcome-message').textContent, 'Welcome');
  assert.equal(source(boot()), source(p), '刷新初始图片一致');
});
test('AC-2: 两个方向每次一张、五张不同、固定顺序与循环边界', () => {
  const p = boot(), sequence = [source(p)];
  for (let i = 0; i < 4; i++) { p.get('gallery-next').click(); sequence.push(source(p)); }
  assert.equal(new Set(sequence).size, 5, '五次位置是五个不同图片');
  p.get('gallery-next').click(); assert.equal(source(p), sequence[0]);
  for (let round = 0; round < 3; round++) {
    for (let i = 4; i >= 0; i--) { p.get('gallery-prev').click(); assert.equal(source(p), sequence[i]); }
    for (let i = 1; i <= 5; i++) { p.get('gallery-next').click(); assert.equal(source(p), sequence[i % 5]); }
  }
  const fresh = boot();
  for (let i = 0; i < 5; i++) { assert.equal(source(fresh), sequence[i]); fresh.get('gallery-next').click(); }
});
test('AC-3/4: 逐张重复展开还原保留图片，按钮恢复并可继续切换', () => {
  const p = boot();
  for (let i = 0; i < 5; i++) {
    loaded(p);
    const before = source(p);
    for (let repeat = 0; repeat < 2; repeat++) {
      assert.equal(expanded(p), false);
      imageClick(p);
      assert.equal(expanded(p), true, '点击进入展开状态');
      assert.equal(source(p), before);
      imageClick(p);
      assert.equal(expanded(p), false, '再次点击退出');
      assert.equal(source(p), before);
      assert.equal(p.get('gallery-prev').disabled, false);
      assert.equal(p.get('gallery-next').disabled, false);
    }
    p.get('gallery-next').click(); assert.notEqual(source(p), before);
  }
});
test('failure-recovery: 加载、失败反馈、切换恢复与过期回调隔离', () => {
  const p = boot();
  assert.ok(status(p), '加载时有反馈');
  const old = p.captureCurrent();
  p.loadCurrent('error');
  const failed = status(p);
  assert.ok(failed, '失败有明确反馈');
  p.get('gallery-next').click();
  assert.notEqual(status(p), failed, '新请求离开失败状态');
  loaded(p);
  const currentSource = source(p), currentStatus = status(p);
  old('error'); old('load');
  assert.equal(source(p), currentSource);
  assert.equal(status(p), currentStatus, '旧请求事件不覆盖当前反馈');
  p.get('gallery-prev').click(); loaded(p);
  assert.notEqual(status(p), failed, '失败图片重新请求可恢复');
});
test('failure-recovery: 快速切换只接受最新请求', () => {
  const p = boot(), pending = [];
  for (let i = 0; i < 12; i++) { pending.push(p.captureCurrent()); p.get('gallery-next').click(); }
  loaded(p);
  const src = source(p), text = status(p);
  for (const callback of pending.reverse()) { callback('error'); callback('load'); }
  assert.equal(source(p), src); assert.equal(status(p), text);
});
test('failure-recovery: 各必需节点缺失安全退出，原语言功能可用', () => {
  // Missing-node compatibility must also run on baseline without requiring new markup.
  for (const id of required) {
    const p = open(html, id);
    p.get('language-toggle').click();
    assert.equal(p.get('welcome-message').textContent, 'Welcome');
  }
});
