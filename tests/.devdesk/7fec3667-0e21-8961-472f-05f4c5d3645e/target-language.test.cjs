'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(execute = true) {
  const pagePath = path.resolve(process.cwd(), 'index.html');
  console.log(`Independent page: ${pagePath}`);
  assert.ok(fs.existsSync(pagePath), `Page must exist: ${pagePath}`);
  const html = fs.readFileSync(pagePath, 'utf8');
  const nodes = [];
  for (const tag of html.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi)) {
    const attrs = Object.fromEntries([...tag[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    nodes.push({tag: tag[1].toLowerCase(), attrs,
      textContent: html.slice(tag.index + tag[0].length).split('<')[0],
      listeners: [],
      setAttribute(name, value) { this.attrs[name] = String(value); },
      addEventListener(type, callback) { this.listeners.push({type, callback}); }
    });
  }
  const get = id => nodes.find(node => node.attrs.id === id);
  for (const id of ['language-toggle', 'welcome-message', 'language-hint']) {
    assert.equal(nodes.filter(node => node.attrs.id === id).length, 1, `${id} must exist exactly once`);
  }
  if (execute) {
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];
    assert.ok(scripts.length, 'Actual page must contain its language script');
    const context = vm.createContext({document: {getElementById: get}});
    for (const script of scripts) vm.runInContext(script[1], context, {timeout: 1000});
  }
  return {get};
}

function check(page, english) {
  const button = page.get('language-toggle');
  assert.equal(button.attrs.title, english ? 'Switch to Chinese (Simplified)' : '切换到英文', 'Title must name the target language exactly');
  assert.equal(button.tag, 'button');
  assert.equal(button.attrs.type, 'button');
  assert.equal(button.attrs['aria-describedby'], 'language-hint');
  for (const [id, text, lang] of [
    ['language-toggle', english ? '中文' : 'English', english ? 'zh' : 'en'],
    ['welcome-message', english ? 'Welcome' : '欢迎', english ? 'en' : 'zh'],
    ['language-hint', english ? 'Language switching supports keyboard controls' : '语言切换支持键盘操作', english ? 'en' : 'zh']
  ]) {
    assert.equal(page.get(id).textContent, text);
    assert.equal(page.get(id).attrs.lang, lang);
  }
  assert.equal(page.get('welcome-message').attrs['aria-live'], 'polite');
}

function click(page) {
  const handlers = page.get('language-toggle').listeners.filter(listener => listener.type === 'click');
  assert.equal(handlers.length, 1, 'One click must cause one language transition');
  handlers[0].callback();
}

test('static target title and Chinese content before script execution', () => {
  check(load(false), false);
});

test('initialized target title and Chinese content', () => {
  check(load(), false);
});

test('target title tracks each transition for 24 full round trips without replacing nodes', () => {
  const page = load();
  const ids = ['language-toggle', 'welcome-message', 'language-hint'];
  const originals = ids.map(id => page.get(id));
  check(page, false);
  for (let round = 0; round < 24; round++) {
    click(page); check(page, true);
    click(page); check(page, false);
    ids.forEach((id, index) => assert.strictEqual(page.get(id), originals[index]));
  }
});

test('fresh page execution resets both previous language states to Chinese', () => {
  for (const count of [1, 2]) {
    const previous = load();
    for (let i = 0; i < count; i++) click(previous);
    check(previous, count === 1);
    const refreshed = load();
    check(refreshed, false);
    assert.notStrictEqual(refreshed.get('language-toggle'), previous.get('language-toggle'));
    click(refreshed); check(refreshed, true);
  }
});
