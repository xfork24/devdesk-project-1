'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = '/work';
const files = ['index.html', 'README.md', 'tests/welcome.test.cjs', 'tests/.devdesk/2a8fe6ff-6e36-0c9f-77b9-453e26bfc88f/acceptance.test.cjs'];
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
const before = Object.fromEntries(files.map(file => [file, hash(file)]));
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;
delete env.NODE_OPTIONS;
function run(label, file, cwd, pass, fail, reason) {
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], { cwd, env, encoding: 'utf8', timeout: 8000 });
  console.log(JSON.stringify({ label, command: [process.execPath, '--test', '--test-reporter=tap', file], cwd, exitCode: result.status, signal: result.signal }));
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, fail ? 1 : 0);
  for (const [key, n] of Object.entries({ tests: 2, pass, fail, skipped: 0, todo: 0 })) {
    assert.match(result.stdout, new RegExp(`^# ${key} ${n}\\s*$`, 'm'));
  }
  if (reason) assert.match(result.stdout, reason);
  return result.stdout;
}
console.log(JSON.stringify({ environment: process.version, platform: process.platform, arch: process.arch, snapshot: before }));
run('根目录第一次', 'tests/welcome.test.cjs', root, 2, 0);
run('根目录第二次', 'tests/welcome.test.cjs', root, 2, 0);
run('异目录绝对路径', path.join(root, 'tests/welcome.test.cjs'), __dirname, 2, 0);
const dir = fs.mkdtempSync(path.join(__dirname, 'scenario-'));
try {
  fs.mkdirSync(path.join(dir, 'tests'));
  const suite = path.join(dir, 'tests/welcome.test.cjs');
  const page = path.join(dir, 'index.html');
  const html = fs.readFileSync(path.join(root, 'index.html'));
  fs.copyFileSync(path.join(root, 'tests/welcome.test.cjs'), suite);
  fs.writeFileSync(page, html);
  run('隔离有效页面', suite, dir, 2, 0);
  fs.writeFileSync(page, ' \n\t');
  run('空白页面业务 Red', suite, dir, 0, 2, /ERR_ASSERTION/);
  fs.writeFileSync(page, html);
  run('空白页面恢复 Green', suite, dir, 2, 0);
  fs.unlinkSync(page);
  const missing = run('页面缺失', suite, dir, 0, 2, /ENOENT/);
  assert.ok(missing.includes(page));
  fs.writeFileSync(page, html);
  run('页面恢复', suite, dir, 2, 0);
  fs.writeFileSync(page, html.toString('utf8').replaceAll('欢迎来到这里', '测试替代文案'));
  run('移除文案业务 Red', suite, dir, 1, 1, /欢迎标题/);
  fs.writeFileSync(page, html);
  run('文案恢复 Green', suite, dir, 2, 0);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
for (const file of files) assert.equal(hash(file), before[file]);
console.log('全部原生场景检查通过；正式交付与独立测试原件哈希未改变。');
