'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
function open() {
  const nodes = new Map();
  for (const m of html.matchAll(/<(p|button)\b([^>]*)>([^<]*)<\/\1>/g)) {
    const attrs = Object.fromEntries([...m[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], a[2]]));
    if (attrs.id) nodes.set(attrs.id, {textContent: m[3], attrs, listeners: [],
      setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(type, fn) { this.listeners.push({type, fn}); }});
  }
  const context = vm.createContext({document: {getElementById: id => nodes.get(id)}});
  for (const s of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) vm.runInContext(s[1], context);
  return nodes;
}
function check(nodes, english) {
  for (const [id, text, lang] of [
    ['language-hint', english ? 'Language switching supports keyboard controls' : '语言切换支持键盘操作', english ? 'en' : 'zh'],
    ['welcome-message', english ? 'Welcome' : '欢迎', english ? 'en' : 'zh'],
    ['language-toggle', english ? '中文' : 'English', english ? 'zh' : 'en']]) {
    assert.equal(nodes.get(id).textContent, text);
    assert.equal(nodes.get(id).attrs.lang, lang);
  }
}
function click(nodes) {
  const listeners = nodes.get('language-toggle').listeners;
  assert.equal(listeners.length, 1);
  assert.equal(listeners[0].type, 'click');
  listeners[0].fn();
}
test('提示静态默认中文，位于欢迎段落之后且唯一', () => {
  assert.equal([...html.matchAll(/id="language-hint"/g)].length, 1);
  assert.match(html, /id="welcome-message"[^>]*>欢迎<\/p>\s*<p id="language-hint" lang="zh">语言切换支持键盘操作<\/p>/);
  check(open(), false);
});
test('提示及既有内容连续双向切换，复用原节点', () => {
  const nodes = open();
  const hint = nodes.get('language-hint');
  for (let i = 1; i <= 24; i++) {
    click(nodes);
    check(nodes, i % 2 === 1);
    assert.strictEqual(nodes.get('language-hint'), hint);
  }
});
test('英文与切回中文后全新装载均恢复默认中文', () => {
  for (const count of [1, 2]) {
    const nodes = open();
    for (let i = 0; i < count; i++) click(nodes);
    check(nodes, count === 1);
    const reloaded = open();
    check(reloaded, false);
    assert.notStrictEqual(reloaded.get('language-hint'), nodes.get('language-hint'));
  }
});
