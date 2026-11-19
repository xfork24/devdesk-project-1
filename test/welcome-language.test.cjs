'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];

function load(missing) {
  const nodes = new Map();
  const listeners = [];
  for (const id of ['welcome-message', 'language-toggle']) {
    const match = html.match(new RegExp('<(p|button)\\b([^>]*id="' + id + '"[^>]*)>([^<]*)</\\1>'));
    assert.ok(match, `实际页面包含 ${id}`);
    const attributes = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    nodes.set(id, {
      textContent: match[3], attributes,
      setAttribute(name, value) { attributes[name] = value; },
      addEventListener(type, callback) { listeners.push({type, callback}); }
    });
  }
  const context = vm.createContext({document: {
    getElementById(id) { return id === missing ? null : nodes.get(id); }
  }});
  assert.ok(scripts.length > 0, '页面包含可执行脚本');
  for (const script of scripts) vm.runInContext(script[1], context, {timeout: 1000});
  return {nodes, listeners};
}

test('静态中文降级及连续切换、重新装载', () => {
  assert.match(html, /id="welcome-message"[^>]*>欢迎<\/p>/);
  assert.match(html, /id="language-toggle"[^>]*>English<\/button>/);
  const {nodes, listeners} = load();
  const welcome = nodes.get('welcome-message');
  const button = nodes.get('language-toggle');
  assert.equal(button.attributes.type, 'button');
  assert.equal(welcome.textContent, '欢迎');
  assert.equal(button.textContent, 'English');
  assert.equal(listeners.length, 1);
  assert.equal(listeners[0].type, 'click');
  for (let i = 0; i < 21; i++) {
    listeners[0].callback();
    const english = i % 2 === 0;
    assert.equal(welcome.textContent, english ? 'Welcome' : '欢迎');
    assert.equal(button.textContent, english ? '中文' : 'English');
    assert.equal(welcome.attributes.lang, english ? 'en' : 'zh');
    assert.equal(button.attributes.lang, english ? 'zh' : 'en');
    assert.equal(listeners.length, 1);
  }
  const refreshed = load();
  assert.equal(refreshed.nodes.get('welcome-message').textContent, '欢迎');
  assert.equal(refreshed.nodes.get('language-toggle').textContent, 'English');
});

test('任一节点缺失时停止绑定', () => {
  for (const id of ['welcome-message', 'language-toggle']) {
    assert.equal(load(id).listeners.length, 0);
  }
});
