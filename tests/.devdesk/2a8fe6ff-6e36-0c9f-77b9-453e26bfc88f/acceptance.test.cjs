'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../../..');
const pagePath = path.join(root, 'index.html');
const suitePath = path.join(root, 'tests/welcome.test.cjs');
const title = /<h1\b[^>]*>\s*欢迎来到这里\s*<\/h1\s*>/iu;

function read(relative) {
  const target = path.join(root, relative);
  assert.ok(fs.existsSync(target), `交付文件必须存在：${relative}`);
  return fs.readFileSync(target, 'utf8');
}

function run(file, cwd) {
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], {
    cwd, encoding: 'utf8', timeout: 8000,
    env: { ...process.env, NODE_OPTIONS: '', NODE_TEST_CONTEXT: '' },
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, '测试不得超时或被信号终止');
  const output = `${result.stdout}\n${result.stderr}`;
  assert.doesNotMatch(output, /(?:SyntaxError|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND)/u,
    '加载或语法错误不能作为业务失败');
  return { status: result.status, output };
}

function count(output, key, expected) {
  assert.match(output, new RegExp(`^# ${key} ${expected}\\s*$`, 'm'),
    `原生 TAP 统计必须为 ${key}=${expected}：\n${output}`);
}

function green(result) {
  assert.equal(result.status, 0, result.output);
  for (const [key, n] of Object.entries({ tests: 2, pass: 2, fail: 0, skipped: 0, todo: 0 })) {
    count(result.output, key, n);
  }
}

function isolated(action) {
  const html = read('index.html');
  const source = read('tests/welcome.test.cjs');
  const dir = fs.mkdtempSync(path.join(__dirname, 'scenario-'));
  try {
    fs.mkdirSync(path.join(dir, 'tests'));
    const page = path.join(dir, 'index.html');
    const suite = path.join(dir, 'tests/welcome.test.cjs');
    fs.writeFileSync(page, html);
    fs.writeFileSync(suite, source);
    action({ dir, page, suite, html });
    assert.equal(read('index.html'), html, '隔离场景不能改变原页面');
    assert.equal(read('tests/welcome.test.cjs'), source, '隔离场景不能改变原测试');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('AC-01：实际 HTML 具有完整欢迎标题及约定的静态文档结构', () => {
  const html = read('index.html');
  assert.doesNotThrow(() => new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(pagePath)),
    '实际页面字节必须是有效 UTF-8');
  assert.ok(html.trim(), '页面内容不能为空');
  assert.match(html, /^\s*<!doctype\s+html\s*>/iu);
  assert.match(html, /<html\b[^>]*\blang\s*=\s*['"]zh-CN['"]/iu);
  assert.match(html, /<meta\b[^>]*\bcharset\s*=\s*['"]?utf-8\b/iu);
  assert.match(html, /<meta\b(?=[^>]*\bname\s*=\s*['"]viewport['"])(?=[^>]*\bcontent\s*=\s*['"][^'"]*width\s*=\s*device-width)[^>]*>/iu);
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/iu);
  assert.ok(body, '页面须有 body 正文');
  assert.match(body[1].replace(/<!--[\s\S]*?-->/gu, ''), title, '正文须含完整 h1 欢迎标题');
  assert.doesNotMatch(html, /<(?:script|img|iframe|audio|video|source|embed)\b[^>]*\bsrc\s*=\s*['"][^'"]+['"]/iu,
    '页面不得加载外部资源');
  assert.doesNotMatch(html, /<link\b[^>]*\bhref\s*=\s*['"][^'"]+['"]|@import\b|url\(\s*['"]?(?!data:|#)[^\s)'"]/iu,
    '页面不得引用外部样式或 CSS 资源');
});

test('AC-01、AC-03：README 提供打开方式、前提及精确运行命令', () => {
  const readme = read('README.md');
  assert.match(readme, /index\.html/u);
  assert.match(readme, /浏览器|browser/iu);
  assert.match(readme, /打开|open/iu);
  assert.match(readme, /Node(?:\.js)?[^\n]*(?:≥\s*22|>=\s*22|22\s*\+|22[^\n]*(?:以上|及以上|或更高))/iu);
  assert.match(readme, /读取权限|读权限|read\s+(?:access|permission)/iu);
  assert.match(readme, /node --test tests\/welcome\.test\.cjs/u);
  assert.match(readme, /项目根目录|project root/iu);
  assert.match(readme, /无需安装依赖|不需要安装依赖|no dependencies|no (?:dependency )?installation/iu);
});

test('AC-02：正式测试使用冻结内置接口且独立于启动目录', () => {
  const source = read('tests/welcome.test.cjs');
  for (const module of ['node:test', 'node:assert/strict', 'node:fs', 'node:path']) {
    assert.ok(source.includes(module), `正式测试应使用 ${module}`);
  }
  assert.match(source, /\b__dirname\b/u, '页面路径须由 __dirname 定位');
  read('index.html');
  green(run(suitePath, __dirname));
});

test('AC-03：根目录固定命令运行两次，恰好两项通过且页面不变', () => {
  const before = read('index.html');
  read('tests/welcome.test.cjs');
  assert.ok(Number(process.versions.node.split('.')[0]) >= 22, '运行前提为 Node.js ≥22');
  green(run('tests/welcome.test.cjs', root));
  green(run('tests/welcome.test.cjs', root));
  assert.equal(read('index.html'), before, '重复测试必须只读页面');
});

test('AC-02：隔离空页面触发非空断言失败，恢复后通过', () => {
  isolated(({ dir, page, suite, html }) => {
    green(run(suite, dir));
    fs.writeFileSync(page, ' \n\t');
    const failed = run(suite, dir);
    assert.notEqual(failed.status, 0, failed.output);
    count(failed.output, 'tests', 2);
    count(failed.output, 'pass', 0);
    count(failed.output, 'fail', 2);
    assert.match(failed.output, /ERR_ASSERTION/u, '空页面须因内容断言失败');
    fs.writeFileSync(page, html);
    green(run(suite, dir));
  });
});

test('AC-04：隔离删除页面，报告路径与原始错误码，恢复后通过', () => {
  isolated(({ dir, page, suite, html }) => {
    green(run(suite, dir));
    fs.unlinkSync(page);
    const failed = run(suite, dir);
    assert.notEqual(failed.status, 0, failed.output);
    count(failed.output, 'tests', 2);
    count(failed.output, 'fail', 2);
    assert.match(failed.output, /ENOENT/u, '读取异常须保留原始错误码');
    assert.ok(failed.output.includes(page), '读取异常须保留页面路径');
    fs.writeFileSync(page, html);
    green(run(suite, dir));
  });
});

test('AC-04：隔离移除欢迎文案，仅标题检查失败，恢复后通过', () => {
  isolated(({ dir, page, suite, html }) => {
    assert.match(html, title);
    green(run(suite, dir));
    fs.writeFileSync(page, html.replaceAll('欢迎来到这里', '测试替代文案'));
    const failed = run(suite, dir);
    assert.notEqual(failed.status, 0, failed.output);
    count(failed.output, 'tests', 2);
    count(failed.output, 'pass', 1);
    count(failed.output, 'fail', 1);
    assert.match(failed.output, /ERR_ASSERTION/u);
    assert.match(failed.output, /欢迎|标题/u, '内容断言原因须可辨认');
    fs.writeFileSync(page, html);
    green(run(suite, dir));
  });
});
