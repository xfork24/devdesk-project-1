'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const page = path.resolve(__dirname, '../../../index.html');

function load({execute = true, missing} = {}) {
  assert.ok(fs.existsSync(page), '实际欢迎页必须存在');
  const html = fs.readFileSync(page, 'utf8');
  const all = [...html.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi)].map(match => ({
    tag: match[1].toLowerCase(),
    attrs: Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], a[2]])),
    textContent: html.slice(match.index + match[0].length).split('<')[0],
    listeners: [],
    setAttribute(key, value) { this.attrs[key] = value; },
    addEventListener(type, callback) { this.listeners.push({type, callback}); }
  }));
  const nodes = new Map(all.filter(n => n.attrs.id).map(n => [n.attrs.id, n]));
  for (const id of ['language-toggle', 'welcome-message', 'language-hint']) {
    assert.equal(all.filter(n => n.attrs.id === id).length, 1, `${id} 必须唯一`);
  }
  if (execute) {
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];
    assert.ok(scripts.length, '实际页面必须包含脚本');
    const context = vm.createContext({document: {getElementById: id => id === missing ? null : nodes.get(id)}});
    for (const script of scripts) vm.runInContext(script[1], context, {timeout: 1000});
  }
  return {all, nodes};
}
function click(state) {
  const handlers = state.nodes.get('language-toggle').listeners;
  assert.equal(handlers.length, 1, '仅保留原生按钮的一个 click 绑定');
  assert.equal(handlers[0].type, 'click');
  handlers[0].callback();
}
function title(state, english) {
  assert.equal(state.nodes.get('language-toggle').attrs.title,
    english ? 'Switch to Simplified Chinese' : '切换为英语');
}
function compatible(state, english) {
  const button = state.nodes.get('language-toggle');
  assert.equal(button.tag, 'button');
  assert.equal(button.attrs.type, 'button');
  assert.equal(button.attrs['aria-describedby'], 'language-hint');
  assert.equal(state.nodes.get('welcome-message').attrs['aria-live'], 'polite');
  assert.equal(state.all.find(n => n.tag === 'h1').textContent, '欢迎来到这里');
  for (const [id, text, lang] of [
    ['welcome-message', english ? 'Welcome' : '欢迎', english ? 'en' : 'zh'],
    ['language-toggle', english ? '中文' : 'English', english ? 'zh' : 'en'],
    ['language-hint', english ? 'Language switching supports keyboard controls' : '语言切换支持键盘操作', english ? 'en' : 'zh']
  ]) {
    assert.equal(state.nodes.get(id).textContent, text);
    assert.equal(state.nodes.get(id).attrs.lang, lang);
  }
}

test('AC-1: 脚本执行前的静态目标 title 精确匹配', () => {
  const state = load({execute: false});
  title(state, false);
  compatible(state, false);
});
test('AC-2: 初始化及24组完整往返的目标 title 和节点身份', () => {
  const state = load();
  const original = [...state.nodes];
  title(state, false);
  for (let round = 0; round < 24; round++) {
    click(state); title(state, true);
    click(state); title(state, false);
    for (const [id, node] of original) assert.strictEqual(state.nodes.get(id), node);
  }
});
test('AC-2: 英文和中文状态重新装载均恢复中文目标 title', () => {
  for (const clicks of [1, 2]) {
    const before = load();
    for (let i = 0; i < clicks; i++) click(before);
    title(before, clicks === 1);
    const after = load();
    title(after, false);
    compatible(after, false);
    assert.notStrictEqual(after.nodes.get('language-toggle'), before.nodes.get('language-toggle'));
  }
});
test('AC-3: 静态与24组往返保留文案、ARIA、唯一性和原生按钮', () => {
  compatible(load({execute: false}), false);
  const state = load();
  compatible(state, false);
  const original = [...state.nodes];
  for (let round = 0; round < 24; round++) {
    click(state); compatible(state, true);
    click(state); compatible(state, false);
    for (const [id, node] of original) assert.strictEqual(state.nodes.get(id), node);
  }
});
test('设计兼容边界: 必要节点缺失时安全返回，提示缺失仍能切换', () => {
  for (const missing of ['welcome-message', 'language-toggle']) {
    assert.equal(load({missing}).nodes.get('language-toggle').listeners.length, 0);
  }
  const state = load({missing: 'language-hint'});
  click(state); title(state, true);
  click(state); title(state, false);
});
