'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
require('./vendor/basichtml.cjs');
const pagePath = path.resolve(__dirname, '../../..', 'index.html');

function event(type) {
  // basicHTML's browser bundle has no Node hrtime shim for createEvent.
  // Its native dispatchEvent accepts this standard event-shaped record.
  return { type, bubbles: true, cancelable: true, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
}
function load(storage = new Map()) {
  assert.ok(fs.existsSync(pagePath), '交付页面 index.html 必须存在');
  const html = fs.readFileSync(pagePath, 'utf8');
  const window = global.basicHTML.init({window: {}});
  global.basicHTML.EventTarget.init(window);
  const {document} = window;
  Object.defineProperty(document, 'defaultView', {value: window});
  const root = /<html\b([^>]*)>([\s\S]*?)<\/html\s*>/i.exec(html);
  assert.ok(root, '页面须包含 html 根节点');
  document.documentElement.innerHTML = root[2];
  for (const attr of root[1].matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g)) {
    document.documentElement.setAttribute(attr[1], attr[2]);
  }
  const effects = {requests: 0, navigations: 0, clickBindings: 0};
  for (const node of [document, ...document.querySelectorAll('*')]) {
    const add = node.addEventListener;
    node.addEventListener = function(type, ...args) {
      if (type === 'click') effects.clickBindings++;
      return add.call(this, type, ...args);
    };
  }
  const storageAPI = {getItem: k => storage.has(k) ? storage.get(k) : null,
    setItem: (k,v) => storage.set(k,String(v)), removeItem: k => storage.delete(k), clear: () => storage.clear()};
  Object.assign(window, {window, self: window, console, localStorage: storageAPI,
    sessionStorage: storageAPI, location: {reload() { effects.navigations++; },
      assign() { effects.navigations++; }, replace() { effects.navigations++; }},
    fetch() { effects.requests++; return Promise.resolve({ok:true}); },
    XMLHttpRequest: class {open() {} send() {effects.requests++;}},
    setTimeout, clearTimeout});
  const context = vm.createContext(window);
  for (const script of document.querySelectorAll('script')) {
    assert.ok(!script.getAttribute('src'), '设计要求无外部脚本依赖');
    vm.runInContext(script.textContent, context, {filename: 'index.html:inline', timeout: 1000});
  }
  document.dispatchEvent(event('DOMContentLoaded'));
  return {document, effects, storage};
}
const elements = doc => Array.from(doc.querySelectorAll('*'));
const exactText = (doc, value) => elements(doc).filter(n =>
  n.children.length === 0 && n.textContent.trim() === value);
function welcome(doc, language) {
  const matches = exactText(doc, language === 'zh' ? '欢迎' : 'Welcome');
  assert.equal(matches.length, 1, '须有且仅有一个独立欢迎节点，文案精确匹配');
  return matches[0];
}
function button(doc, target) {
  const matches = Array.from(doc.querySelectorAll('button')).filter(n => n.textContent.trim() === target);
  assert.equal(matches.length, 1, '原生语言按钮须准确显示目标语言');
  assert.equal(matches[0].getAttribute('type'), 'button');
  return matches[0];
}
function preserved(doc) {
  assert.equal(doc.querySelectorAll('h1').length, 1);
  assert.equal(doc.querySelector('h1').textContent, '欢迎来到这里');
  assert.equal(doc.querySelector('title').textContent, '欢迎来到这里');
  assert.equal(doc.documentElement.getAttribute('lang'), 'zh-CN');
}

test('AC-1：初始欢迎中文与目标语言 English', () => {
  const {document} = load();
  welcome(document, 'zh');
  button(document, 'English');
});

test('AC-1：切换后重新加载仍恢复中文', () => {
  const first = load();
  button(first.document, 'English').dispatchEvent(event('click'));
  welcome(first.document, 'en');
  button(first.document, '中文');
  const refreshed = load(first.storage);
  welcome(refreshed.document, 'zh');
  button(refreshed.document, 'English');
});

test('AC-2/AC-3：连续双向点击即时更新，复用节点与监听器并保留原标题', () => {
  const {document, effects} = load();
  const text = welcome(document, 'zh');
  const control = button(document, 'English');
  const initialNodes = elements(document);
  const initialBindings = effects.clickBindings;
  for (let i = 0; i < 20; i++) {
    control.dispatchEvent(event('click'));
    const english = i % 2 === 0;
    assert.equal(welcome(document, english ? 'en' : 'zh'), text);
    assert.equal(button(document, english ? '中文' : 'English'), control);
    const currentNodes = elements(document);
    assert.equal(currentNodes.length, initialNodes.length, '点击不得增加元素');
    currentNodes.forEach((node, index) => assert.equal(node, initialNodes[index], '点击不得替换元素'));
    assert.equal(effects.clickBindings, initialBindings, '点击不得新增监听器');
    assert.equal(effects.requests, 0, '初始化与切换不得发起网络请求');
    assert.equal(effects.navigations, 0, '切换不得调用页面导航或刷新');
    preserved(document);
  }
});

test('AC-3：基线 h1、title、lang 保留', () => {
  preserved(load().document);
});
