'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pagePath = path.resolve(__dirname, '../index.html');

test('页面可读取且非空', () => {
  const html = fs.readFileSync(pagePath, 'utf8');
  assert.ok(html.trim().length > 0, '实际页面去除空白后不能为空');
});

test('包含欢迎标题', () => {
  const html = fs.readFileSync(pagePath, 'utf8');
  assert.match(html, /<h1\b[^>]*>\s*欢迎来到这里\s*<\/h1\s*>/iu,
    '实际页面必须包含完整的 h1 欢迎标题：欢迎来到这里');
});
