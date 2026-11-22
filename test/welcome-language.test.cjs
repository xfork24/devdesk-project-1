'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {open: load, html} = require('./page.cjs');

test('静态中文降级及连续切换、重新装载', () => {
  assert.doesNotMatch(html, /id="(?:welcome-message|language-hint)"/);
  assert.match(html, /id="language-toggle"[^>]*>English<\/button>/);
  const {nodes, listeners} = load();
  const button = nodes.get('language-toggle');
  assert.equal(button.attributes.type, 'button');
  assert.equal(button.textContent, 'English');
  assert.equal(listeners.length, 1);
  assert.equal(listeners[0].type, 'click');
  for (let i = 0; i < 21; i++) {
    listeners[0].callback();
    const english = i % 2 === 0;
    assert.equal(button.textContent, english ? '中文' : 'English');
    assert.equal(button.attributes.lang, english ? 'zh' : 'en');
    assert.equal(listeners.length, 1);
  }
  const refreshed = load();
  assert.equal(refreshed.nodes.get('language-toggle').textContent, 'English');
});

test('按钮缺失时停止绑定', () => {
  for (const id of ['language-toggle']) {
    assert.equal(load(id).listeners.length, 0);
  }
});

test('整页文字及五图异步状态随当前语言更新，切换不发起请求', () => {
  const p = load(), button = p.get('language-toggle');
  const toggle = () => button.click();
  function check(en, phase) {
    assert.equal(p.document.title, en ? 'Welcome here' : '欢迎来到这里');
    assert.equal(p.document.documentElement.lang, en ? 'en' : 'zh-CN');
    assert.equal(p.document.querySelector('h1').textContent, p.document.title);
    for (const id of ['gallery-credit', 'gallery-help', 'gallery-prev', 'gallery-next', 'gallery-status']) {
      assert.ok(p.get(id).textContent);
      if (en) assert.doesNotMatch(p.get(id).textContent, /[\u3400-\u9fff]|undefined/);
    }
    assert.match(p.get('gallery-status').textContent, phase);
    assert.equal(p.get('gallery').attrs['aria-label'], en ? 'Nature photo gallery' : '自然风景图片窗');
  }
  for (let i = 0; i < 5; i++) {
    const count = p.pending.length;
    toggle(); check(true, /Loading/);
    assert.equal(p.pending.length, count);
    assert.doesNotMatch(p.get('gallery-image').alt, /[\u3400-\u9fff]/);
    p.pending.at(-1).onload(); check(true, /Image.*·/);
    toggle(); check(false, /第.*·/);
    assert.match(p.get('gallery-image').alt, /[\u3400-\u9fff]/);
    p.get('gallery-next').click();
  }
  const stale = p.pending.at(-1);
  p.get('gallery-next').click(); toggle();
  p.get('gallery-trigger').click();
  check(true, /Loading/);
  assert.equal(p.get('gallery-trigger').attrs['aria-label'], 'Restore image');
  stale.onerror(); stale.onload();
  assert.equal(p.get('gallery-trigger').attrs['aria-expanded'], 'true');
  p.pending.at(-1).onerror(); check(true, /failed.*retry/);
  assert.equal(p.get('gallery-trigger').attrs['aria-expanded'], 'false');
  toggle(); check(false, /加载失败.*重试/);
});
