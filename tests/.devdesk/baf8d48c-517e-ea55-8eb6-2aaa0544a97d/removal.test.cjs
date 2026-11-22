'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = path.resolve(__dirname, '../../../index.html');
function read() {
  assert.ok(fs.existsSync(source), '实际页面必须存在');
  return fs.readFileSync(source, 'utf8');
}
function open({execute = true, buttonOnly = false, missingButton = false} = {}) {
  const html = read();
  const nodes = new Map();
  for (const m of html.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi)) {
    const attrs = Object.fromEntries([...m[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], a[2]]));
    if (/\sdisabled(?:\s|=|$)/i.test(m[2])) attrs.disabled = '';
    if (!attrs.id || (buttonOnly && attrs.id !== 'language-toggle') || (missingButton && attrs.id === 'language-toggle')) continue;
    nodes.set(attrs.id, {tag: m[1].toLowerCase(), attrs,
      textContent: html.slice(m.index + m[0].length).split('<')[0], listeners: [],
      setAttribute(k, v) { this.attrs[k] = String(v); },
      addEventListener(type, fn) { this.listeners.push({type, fn}); }});
  }
  const context = vm.createContext({document: {getElementById: id => nodes.get(id) || null}});
  if (execute) {
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];
    assert.ok(scripts.length, '实际页面包含脚本');
    for (const script of scripts) vm.runInContext(script[1], context, {timeout: 1000});
  }
  return nodes;
}
function removed(nodes) {
  assert.equal(nodes.has('welcome-message'), false, '欢迎段落及其占位节点应删除');
  assert.equal(nodes.has('language-hint'), false, '键盘提示及其占位节点应删除');
  const described = nodes.get('language-toggle').attrs['aria-describedby'];
  assert.ok(!described || described.trim().split(/\s+/).every(id => nodes.has(id)), '不能有悬空描述关联');
}
function state(nodes, english) {
  const button = nodes.get('language-toggle');
  assert.ok(button, '语言按钮仍存在');
  assert.equal(button.textContent, english ? '中文' : 'English');
  assert.equal(button.attrs.title, english ? 'Switch to Chinese (Simplified)' : '切换到英文');
  assert.equal(button.attrs.lang, english ? 'zh' : 'en');
}
function click(nodes) {
  const handlers = nodes.get('language-toggle').listeners.filter(x => x.type === 'click');
  assert.equal(handlers.length, 1, '语言按钮必须绑定一次切换');
  handlers[0].fn();
}

test('AC-01/02 静态与初始化状态删除目标段落并解除描述关联', () => {
  for (const execute of [false, true]) { const nodes = open({execute}); removed(nodes); state(nodes, false); }
  assert.match(read(), /<h1\b[^>]*>\s*欢迎来到这里\s*<\/h1\s*>/u);
  assert.match(read(), /<title>欢迎来到这里<\/title>/u);
});
test('AC-01/02/03 连续切换及两种状态刷新维持删除与按钮状态', () => {
  const nodes = open();
  const original = nodes.get('language-toggle');
  for (let i = 1; i <= 48; i++) {
    click(nodes); state(nodes, i % 2 === 1); removed(nodes);
    assert.strictEqual(nodes.get('language-toggle'), original);
    if (i <= 2) { const refreshed = open(); state(refreshed, false); removed(refreshed); }
  }
});
test('AC-03 已删节点不再是切换前提，按钮缺失时安全退出', () => {
  const nodes = open({buttonOnly: true});
  state(nodes, false); click(nodes); state(nodes, true); click(nodes); state(nodes, false);
  assert.doesNotThrow(() => open({missingButton: true}));
});
test('AC-03 原生键盘激活所需按钮语义保留', () => {
  const button = open().get('language-toggle');
  assert.equal(button.tag, 'button');
  assert.equal(button.attrs.type, 'button');
  assert.equal(Object.hasOwn(button.attrs, 'disabled'), false);
  assert.ok(button.attrs.tabindex === undefined || Number(button.attrs.tabindex) >= 0);
  assert.equal(button.attrs['aria-disabled'], undefined);
  // Real Tab/Enter/Space, focus rendering, gallery and layout are checked by
  // the maintained browser acceptance entry, not simulated by this DOM fixture.
});
