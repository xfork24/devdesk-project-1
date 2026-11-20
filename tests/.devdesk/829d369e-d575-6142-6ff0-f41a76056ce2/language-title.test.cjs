'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = path.resolve(__dirname, '../../../index.html');

// Execute the actual page script with only the DOM operations used by this page.
function open({execute = true, withoutHint = false} = {}) {
  assert.ok(fs.existsSync(source), 'actual index.html must exist');
  const html = fs.readFileSync(source, 'utf8');
  const nodes = new Map();
  const all = [];
  for (const match of html.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi)) {
    const attrs = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], a[2]]));
    const handlers = [];
    const node = {attrs, handlers,
      textContent: html.slice(match.index + match[0].length).split('<')[0],
      setAttribute(key, value) { attrs[key] = String(value); },
      addEventListener(type, handler) { handlers.push({type, handler}); }};
    all.push(node);
    if (attrs.id) {
      assert.ok(!nodes.has(attrs.id), `duplicate id: ${attrs.id}`);
      nodes.set(attrs.id, node);
    }
  }
  if (withoutHint) nodes.delete('language-hint');
  if (execute) {
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
    assert.ok(scripts.length > 0, 'page script must exist');
    const context = vm.createContext({document: {getElementById: id => nodes.get(id) || null}});
    for (const script of scripts) vm.runInContext(script[1], context, {timeout: 1000});
  }
  return {nodes, all};
}
function check(page, english) {
  const button = page.nodes.get('language-toggle');
  assert.ok(button, 'language button must exist');
  assert.equal(button.attrs.title, english ? 'Switch to Chinese' : '切换为英文', 'title must describe target language exactly');
  assert.equal(button.attrs['aria-describedby'], 'language-hint');
  for (const [id, text, lang] of [
    ['language-toggle', english ? '中文' : 'English', english ? 'zh' : 'en'],
    ['welcome-message', english ? 'Welcome' : '欢迎', english ? 'en' : 'zh'],
    ['language-hint', english ? 'Language switching supports keyboard controls' : '语言切换支持键盘操作', english ? 'en' : 'zh']]) {
    if (id === 'language-hint' && !page.nodes.has(id)) continue;
    assert.ok(page.nodes.has(id), `${id} must exist`);
    assert.equal(page.nodes.get(id).textContent, text);
    assert.equal(page.nodes.get(id).attrs.lang, lang);
  }
  if (page.nodes.has('language-hint')) {
    assert.equal(page.all.filter(n => n.attrs.id === 'language-hint').length, 1);
    assert.strictEqual(page.nodes.get(button.attrs['aria-describedby']), page.nodes.get('language-hint'));
  }
}
function click(page) {
  const button = page.nodes.get('language-toggle');
  assert.ok(button, 'language button must exist');
  assert.equal(button.handlers.length, 1, 'one existing event binding');
  assert.equal(button.handlers[0].type, 'click');
  button.handlers[0].handler();
}
test('AC-1 static title before script execution', () => {
  check(open({execute: false}), false);
});
test('AC-1 initialized title and existing language state', () => {
  check(open(), false);
});
test('AC-1/AC-2 title follows 24 complete Chinese-English-Chinese round trips', () => {
  const page = open();
  const original = new Map(page.nodes);
  check(page, false);
  for (let round = 0; round < 24; round++) {
    click(page); check(page, true);
    click(page); check(page, false);
    for (const [id, node] of original) assert.strictEqual(page.nodes.get(id), node, `${id} reused`);
  }
});
test('AC-1 reload from each language restores Chinese title and state', () => {
  for (const toggles of [1, 2]) {
    const page = open();
    for (let i = 0; i < toggles; i++) click(page);
    check(page, toggles === 1);
    const reloaded = open();
    check(reloaded, false);
    assert.notStrictEqual(reloaded.nodes.get('language-toggle'), page.nodes.get('language-toggle'));
  }
});
test('AC-2 optional missing hint does not prevent title updates', () => {
  const page = open({withoutHint: true});
  check(page, false);
  click(page); check(page, true);
  click(page); check(page, false);
});
