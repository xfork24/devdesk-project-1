'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const pagePath = path.resolve(__dirname, '../../../index.html');
assert.ok(fs.existsSync(pagePath), '欢迎页必须存在');
const html = fs.readFileSync(pagePath, 'utf8');
function open(execute = true) {
  const nodes = new Map();
  const allNodes = [];
  for (const m of html.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi)) {
    const attrs = Object.fromEntries([...m[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], a[2]]));
    const node = {textContent: html.slice(m.index + m[0].length).split('<')[0], attrs, listeners: [],
      setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(type, fn) { this.listeners.push({type, fn}); }};
    allNodes.push(node);
    if (attrs.id && !nodes.has(attrs.id)) nodes.set(attrs.id, node);
  }
  nodes.allNodes = allNodes;
  const context = vm.createContext({document: {getElementById: id => nodes.get(id)}});
  if (execute) for (const s of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) vm.runInContext(s[1], context);
  return nodes;
}
function association(nodes) {
  const targets = nodes.allNodes.filter(node => node.attrs.id === 'language-hint');
  assert.equal(targets.length, 1, '全部元素中语言提示 ID 必须唯一');
  const button = nodes.get('language-toggle');
  assert.ok(button, '语言按钮存在');
  assert.equal(button.attrs['aria-describedby'], 'language-hint', '按钮必须精确关联现有语言提示');
  assert.strictEqual(nodes.get(button.attrs['aria-describedby']), targets[0], '关联目标必须为现有提示节点');
}
function check(nodes, english) {
  association(nodes);
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

test('脚本执行前静态关联有效且默认中文', () => {
  check(open(false), false);
});
