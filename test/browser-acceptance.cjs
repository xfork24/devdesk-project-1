'use strict';
// A supervisor bounds the worker, including font waits and browser shutdown.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const {spawn} = require('node:child_process');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const bounded = (promise, ms) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('operation timeout')), ms);
  })]).finally(() => clearTimeout(timer));
};

async function worker() {
  let server, browser;
  const records = [];
  try {
    const runtime = process.env.DEVDESK_RUNTIME_DIR || '/tmp/devdesk-runtime';
    const {chromium} = require(process.env.PLAYWRIGHT_MODULE || path.join(runtime, 'node/node_modules/playwright'));
    const source = path.resolve(__dirname, '../index.html');
    const baseline = process.argv[2] || process.env.BROWSER_BASELINE;
    const baselinePath = baseline && path.resolve(baseline);
    const output = process.env.BROWSER_OUTPUT || path.join(runtime, 'browser-acceptance');
    fs.mkdirSync(output, {recursive: true});
    const identity = file => ({path: file, url: pathToFileURL(file).href, sha256: hash(fs.readFileSync(file))});
    const sourceIdentity = identity(source);
    const baselineIdentity = baselinePath ? identity(baselinePath) : null;
    // Register the browser PID before exec, even if Playwright launch never resolves.
    const wrapper = path.join(process.env.TMPDIR, 'launch-browser');
    fs.writeFileSync(wrapper, '#!/bin/sh\nprintf \'%s\' \"$$\" > \"$BROWSER_ACCEPTANCE_PIDFILE\"\nexec \"$BROWSER_ACCEPTANCE_EXECUTABLE\" \"$@\"\n', {mode: 0o700});
    server = await chromium.launchServer({headless: true,
      executablePath: wrapper, timeout: 15000,
      env: {...process.env, BROWSER_ACCEPTANCE_PIDFILE: path.join(process.env.TMPDIR, 'browser.pid'),
        BROWSER_ACCEPTANCE_EXECUTABLE: process.env.BROWSER_EXECUTABLE || chromium.executablePath()},
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--renderer-process-limit=1']});
    process.send({browserPid: server.process().pid});
    browser = await chromium.connect(server.wsEndpoint(), {timeout: 10000});
    for (const width of [320, 1280]) {
      const page = await browser.newPage({viewport: {width, height: 720}});
      page.setDefaultTimeout(5000);
      page.setDefaultNavigationTimeout(10000);
      try {
        const layout = () => page.locator('body, .language-controls, #language-toggle, main, h1, #welcome-message, #language-hint')
          .evaluateAll(nodes => nodes.map(n => ({tag: n.tagName, rect: n.getBoundingClientRect().toJSON(), font: getComputedStyle(n).font})));
        const load = async url => { await page.goto(url); await bounded(page.evaluate(() => document.fonts.ready.then(() => true)), 5000); };
        let before, baselineShot;
        if (baselineIdentity) {
          await load(baselineIdentity.url);
          before = await layout();
          baselineShot = await page.screenshot({path: path.join(output, `baseline-${width}.png`), fullPage: true});
        }
        const staticContext = await browser.newContext({javaScriptEnabled: false, viewport: {width, height: 720}});
        try {
          const staticPage = await staticContext.newPage();
          await staticPage.goto(sourceIdentity.url, {timeout: 10000});
          assert.equal(await staticPage.locator('#language-toggle').getAttribute('title', {timeout: 5000}), '切换到英文');
        } finally { await bounded(staticContext.close(), 3000); }
        await load(sourceIdentity.url);
        const updatedShot = await page.screenshot({path: path.join(output, `updated-${width}.png`), fullPage: true});
        if (baselineIdentity) {
          assert.deepEqual(await layout(), before, 'baseline layout');
          assert.equal(hash(updatedShot), hash(baselineShot), 'baseline screenshot');
        }
        const remember = () => page.evaluate(() => { window.originalHint = document.getElementById('language-hint'); });
        const check = async english => {
          assert.equal(await page.locator('#language-toggle').getAttribute('title'), english ? 'Switch to Chinese (Simplified)' : '切换到英文');
          assert.equal(await page.locator('#language-toggle').getAttribute('aria-describedby'), 'language-hint');
          assert.equal(await page.locator('*').evaluateAll(ns => ns.filter(n => n.id === 'language-hint').length), 1);
          assert.equal(await page.evaluate(() => window.originalHint === document.getElementById('language-hint')), true);
          for (const [id, text, lang] of [
            ['welcome-message', english ? 'Welcome' : '欢迎', english ? 'en' : 'zh'],
            ['language-toggle', english ? '中文' : 'English', english ? 'zh' : 'en'],
            ['language-hint', english ? 'Language switching supports keyboard controls' : '语言切换支持键盘操作', english ? 'en' : 'zh']]) {
            assert.equal(await page.locator('#' + id).textContent(), text);
            assert.equal(await page.locator('#' + id).getAttribute('lang'), lang);
          }
        };
        await remember(); await check(false);
        await page.locator('#language-toggle').click(); await check(true);
        await page.reload(); await remember(); await check(false);
        await page.keyboard.press('Tab');
        assert.equal(await page.locator('#language-toggle').evaluate(n => n === document.activeElement), true);
        await page.keyboard.press('Enter'); await check(true);
        await page.keyboard.press('Space'); await check(false);
        for (let i = 1; i <= 24; i++) { await page.locator('#language-toggle').click(); await check(i % 2 === 1); }
        for (let round = 0; round < 24; round++) {
          await page.locator('#language-toggle').click(); await check(true);
          await page.locator('#language-toggle').click(); await check(false);
        }
        await page.reload(); await remember(); await check(false);
        records.push({width, height: 720, mouse: true, tab: true, enter: true, space: true,
          staticTitle: true, title: true, roundTrips: 24, repeatedToggles: 24, refreshFromEnglish: true, refreshFromChinese: true,
          association: true, uniqueHint: true, reusedHint: true,
          baselineComparison: baselineIdentity ? 'passed' : 'not_requested'});
      } finally { await bounded(page.close(), 3000); }
    }
    assert.equal(hash(fs.readFileSync(source)), sourceIdentity.sha256, 'source changed during acceptance');
    if (baselineIdentity) assert.equal(hash(fs.readFileSync(baselinePath)), baselineIdentity.sha256);
    process.send({result: {source: sourceIdentity, baseline: baselineIdentity, browser: browser.version(),
      playwright: require(path.join(path.dirname(require.resolve(process.env.PLAYWRIGHT_MODULE || path.join(runtime, 'node/node_modules/playwright'))), 'package.json')).version,
      entrySha256: hash(fs.readFileSync(__filename)), node: process.version, records}});
  } finally {
    try { if (browser) await bounded(browser.close(), 3000); }
    finally { if (server) await bounded(server.close(), 3000); }
  }
}

async function supervise() {
  const startedAt = new Date().toISOString();
  const timeout = Number(process.env.BROWSER_TIMEOUT_MS || 90000);
  assert.ok(Number.isInteger(timeout) && timeout >= 100 && timeout <= 300000, 'BROWSER_TIMEOUT_MS: 100..300000');
  const runtime = path.resolve(process.env.DEVDESK_RUNTIME_DIR || '/tmp/devdesk-runtime');
  const temp = fs.mkdtempSync(path.join(runtime, 'browser-acceptance-'));
  let child, browserPid, result, error, timedOut = false, signal;
  const readBrowserPid = () => {
    try { const pid = Number(fs.readFileSync(path.join(temp, 'browser.pid'), 'utf8')); if (Number.isSafeInteger(pid) && pid > 1) browserPid = pid; }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  };
  const kill = (pid, sig) => { if (pid) { try { process.kill(-pid, sig); } catch (e) { if (e.code !== 'ESRCH') throw e; } } };
  try {
    child = spawn(process.execPath, [__filename, ...process.argv.slice(2)], {
      detached: true, stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      env: {...process.env, BROWSER_ACCEPTANCE_WORKER: '1', TMPDIR: temp,
        PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(process.env.DEVDESK_RUNTIME_CACHE || path.join(runtime, 'shared'), 'browsers'),
        XDG_CACHE_HOME: process.env.XDG_CACHE_HOME || path.join(runtime, 'cache')}});
    child.on('message', message => { if (message.browserPid) browserPid = message.browserPid; if (message.result) result = message.result; if (message.error) error = message.error; });
    const stop = () => { readBrowserPid(); kill(browserPid, 'SIGKILL'); kill(child.pid, 'SIGKILL'); };
    const onSignal = s => { signal = s; stop(); };
    const term = () => onSignal('SIGTERM'), interrupt = () => onSignal('SIGINT');
    process.on('SIGTERM', term); process.on('SIGINT', interrupt);
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeout);
    let exit;
    try { exit = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, sig) => resolve({code, signal: sig})); }); }
    finally { clearTimeout(timer); process.off('SIGTERM', term); process.off('SIGINT', interrupt); }
    if (exit.code !== 0 || !result || timedOut || signal) throw new Error(error || `worker terminated: ${JSON.stringify(exit)}`);
  } catch (e) { error = e.stack || String(e); }
  finally {
    readBrowserPid(); kill(browserPid, 'SIGKILL'); if (child) kill(child.pid, 'SIGKILL');
    await sleep(100);
    fs.rmSync(temp, {recursive: true, force: true});
  }
  const report = {schemaVersion: 1, status: error ? 'failed' : 'passed', startedAt,
    finishedAt: new Date().toISOString(), timedOut, signal: signal || null, ...result, error: error || null};
  const output = process.env.BROWSER_OUTPUT || path.join(runtime, 'browser-acceptance');
  fs.mkdirSync(output, {recursive: true});
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
  process.exitCode = error ? 1 : 0;
}
if (process.env.BROWSER_ACCEPTANCE_WORKER === '1') {
  worker().then(() => process.disconnect()).catch(e => { process.send({error: e.stack || String(e)}); process.exitCode = 1; process.disconnect(); });
} else supervise().catch(e => { console.error(JSON.stringify({status: 'failed', error: e.stack})); process.exitCode = 1; });
