'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const pagePath = path.resolve(__dirname, '../../../index.html');
assert.ok(fs.existsSync(pagePath), '实际页面必须存在');
const html = fs.readFileSync(pagePath, 'utf8');
const zh = '语言切换支持键盘操作';
const en = 'Language switching supports keyboard controls';

function parseNodes() {
  const nodes = new Map();
  for (const match of html.matchAll(/<(p|button)\b([^>]*)>([^<]*)<\/\1\s*>/gi)) {
    const attributes = Object.fromEntries([...match[2].matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g)].map(m => [m[1], m[2]]));
    if (!attributes.id) continue;
    const listeners = [];
    nodes.set(attributes.id, {
      tagName: match[1].toUpperCase(), textContent: match[3], attributes, listeners,
      setAttribute(name, value) { attributes[name] = String(value); },
      getAttribute(name) { return attributes[name] ?? null; },
      addEventListener(type, callback) { listeners.push({type, callback}); }
    });
  }
  return nodes;
}
function load(missing) {
  const nodes = parseNodes();
  const context = vm.createContext({document: {
    getElementById(id) { return id === missing ? null : nodes.get(id) ?? null; }
  }});
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];
  assert.ok(scripts.length, '实际页面须包含交互脚本');
  for (const script of scripts) vm.runInContext(script[1], context, {timeout: 1000});
  return nodes;
}
function state(nodes, english) {
  const hint = nodes.get('language-hint');
  assert.ok(hint, '页面必须交付 language-hint 提示段落');
  assert.equal(hint.textContent, english ? en : zh);
  assert.equal(hint.getAttribute('lang'), english ? 'en' : 'zh');
  assert.equal(nodes.get('welcome-message').textContent, english ? 'Welcome' : '欢迎');
  assert.equal(nodes.get('welcome-message').getAttribute('lang'), english ? 'en' : 'zh');
  assert.equal(nodes.get('language-toggle').textContent, english ? '中文' : 'English');
  assert.equal(nodes.get('language-toggle').getAttribute('lang'), english ? 'zh' : 'en');
}
function click(nodes) {
  const listeners = nodes.get('language-toggle').listeners.filter(l => l.type === 'click');
  assert.equal(listeners.length, 1, '按钮应仅绑定一个切换监听器');
  listeners[0].callback();
}

test('AC-1: 静态中文提示唯一且位于欢迎文字之后，初始化保留既有内容', () => {
  assert.equal([...html.matchAll(/\bid\s*=\s*["']language-hint["']/g)].length, 1, '提示 ID 必须唯一');
  const nodes = parseNodes();
  const hint = nodes.get('language-hint');
  assert.ok(hint, '提示必须是实际页面中的段落');
  assert.equal(hint.tagName, 'P');
  assert.equal(hint.textContent, zh, '脚本不可用时仍有准确中文提示');
  assert.ok(html.indexOf('id="welcome-message"') < html.indexOf('id="language-hint"'), '提示位于欢迎文字后');
  assert.match(html, /<title>欢迎来到这里<\/title>/);
  assert.match(html, /<h1\b[^>]*>\s*欢迎来到这里\s*<\/h1>/);
  assert.equal(nodes.get('language-toggle').getAttribute('type'), 'button');
  state(load(), false);
});

test('AC-2: 连续双向切换同步文案和语言，并复用提示节点', () => {
  const nodes = load();
  state(nodes, false);
  const hint = nodes.get('language-hint');
  for (let i = 1; i <= 24; i++) {
    click(nodes);
    state(nodes, i % 2 === 1);
    assert.strictEqual(nodes.get('language-hint'), hint);
    assert.equal(nodes.get('language-toggle').listeners.length, 1);
  }
});

test('AC-3: 英文和切回中文后重新执行页面上下文均恢复默认中文', () => {
  for (const clicks of [1, 2]) {
    const before = load();
    for (let i = 0; i < clicks; i++) click(before);
    state(before, clicks === 1);
    const refreshed = load();
    assert.notStrictEqual(refreshed.get('language-hint'), before.get('language-hint'));
    state(refreshed, false);
  }
});

test('兼容边界: 提示缺失仍可切换，原必需节点缺失安全退出', () => {
  const withoutHint = load('language-hint');
  click(withoutHint);
  assert.equal(withoutHint.get('welcome-message').textContent, 'Welcome');
  click(withoutHint);
  assert.equal(withoutHint.get('welcome-message').textContent, '欢迎');
  for (const missing of ['welcome-message', 'language-toggle']) {
    const nodes = load(missing);
    assert.equal(nodes.get('language-toggle').listeners.length, 0);
  }
});
