'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
function open(missing) {
  const nodes = new Map(), pending = [];
  const document = {body: {style: {}}, activeElement: null, createElement() {}, getElementById: id => id === missing ? null : nodes.get(id)};
  for (const id of ['gallery','gallery-image','gallery-prev','gallery-next','gallery-status','gallery-trigger']) {
    const attrs = {}, listeners = {}, classes = new Set();
    nodes.set(id, {hidden: false, style: {}, attrs, listeners,
      setAttribute(k,v) { attrs[k] = v; },
      classList: {toggle(c, value) { value ? classes.add(c) : classes.delete(c); }},
      addEventListener(k,v) { listeners[k] = v; },
      focus() { document.activeElement = this; },
      closest() { return nodes.get('gallery-trigger'); },
      click() { listeners.click(); }});
  }
  const window = {scrollX: 0, scrollY: 123, scrollTo(p) { this.scrollY = p.top; }};
  class Image { constructor() { pending.push(this); } }
  const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
  vm.runInNewContext(script, {document,window,Image});
  return {get: id => nodes.get(id),pending,window,document};
}
test('图片窗：五图固定顺序、双向循环、每图重复还原和请求隔离', () => {
  const p = open(), image = p.get('gallery-image'), trigger = p.get('gallery-trigger');
  const sequence = [];
  for (let i = 0; i < 5; i++) {
    sequence.push(image.src); assert.match(image.src, /^https:\/\/images.pexels.com\//); assert.ok(image.alt);
    p.pending.at(-1).onload(); assert.equal(image.hidden, false);
    for (let repeat = 0; repeat < 2; repeat++) {
      trigger.focus(); trigger.click(); assert.equal(trigger.attrs['aria-expanded'], 'true');
      p.get('gallery-next').click(); assert.equal(image.src, sequence[i]);
      trigger.click(); assert.equal(trigger.attrs['aria-expanded'], 'false');
      assert.equal(p.document.activeElement, trigger); assert.equal(p.window.scrollY, 123);
    }
    p.get('gallery-next').click();
  }
  assert.equal(new Set(sequence).size, 5); assert.equal(image.src, sequence[0]);
  for (let i = 4; i >= 0; i--) { p.get('gallery-prev').click(); assert.equal(image.src, sequence[i]); }
  const stale = p.pending.at(-1); stale.onerror(); assert.equal(image.hidden, true);
  assert.match(p.get('gallery-status').textContent, /失败/);
  for (let i = 0; i < 12; i++) p.get('gallery-next').click();
  p.pending.at(-1).onload(); const status = p.get('gallery-status').textContent;
  for (const old of p.pending.slice(0,-1)) { old.onerror(); old.onload(); }
  assert.equal(p.get('gallery-status').textContent, status); assert.equal(image.hidden, false);
  assert.equal(open().get('gallery-image').src, sequence[0]);
});
test('图片窗：必要节点缺失安全退出', () => {
  for (const id of ['gallery','gallery-image','gallery-prev','gallery-next','gallery-status']) assert.equal(open(id).pending.length, 0);
});
