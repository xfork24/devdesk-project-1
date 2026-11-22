'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
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
function check(nodes, english) {
  const button = nodes.get('language-toggle');
  assert.ok(button, '语言按钮必须存在');
  assert.equal(button.attrs.title, english ? 'Switch to Chinese (Simplified)' : '切换到英文');
  assert.equal(button.attrs['aria-describedby'], undefined);
  assert.equal(nodes.has('welcome-message'), false);
  assert.equal(nodes.has('language-hint'), false);
  for (const [id, text, lang] of [
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
test('静态与初始化均删除描述及占位', () => {
  assert.doesNotMatch(html, /id="(?:welcome-message|language-hint)"/);
  check(open(), false);
});
test('删除描述后连续双向切换，复用按钮', () => {
  const nodes = open();
  for (let i = 1; i <= 24; i++) {
    click(nodes);
    check(nodes, i % 2 === 1);
  }
});
test('英文与切回中文后全新装载均恢复默认中文', () => {
  for (const count of [1, 2]) {
    const nodes = open();
    for (let i = 0; i < count; i++) click(nodes);
    check(nodes, count === 1);
    const reloaded = open();
    check(reloaded, false);
    assert.notStrictEqual(reloaded.get('language-toggle'), nodes.get('language-toggle'));
  }
});
test('脚本执行前无悬空关联且默认中文', () => {
  check(open(false), false);
});

test('目标 title 随24组完整往返更新并复用节点', () => {
  const nodes = open();
  const original = new Map(nodes);
  check(nodes, false);
  for (let round = 0; round < 24; round++) {
    click(nodes); check(nodes, true);
    click(nodes); check(nodes, false);
    for (const [id, node] of original) assert.strictEqual(nodes.get(id), node);
  }
});

// Keep gallery behavior in the frozen three-file regression entry point.
require('./gallery.test.cjs');
