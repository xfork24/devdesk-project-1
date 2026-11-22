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
  let server, browser, appServer, storage;
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
    storage = fs.mkdtempSync(path.join(process.env.TMPDIR, 'screenshots-browser-'));
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64');
    const app = await require('../server.cjs').createScreenshotServer({storageDirectory: storage,
      captureRegion: async ({destination}) => { await sleep(80); fs.writeFileSync(destination, png); return {status:'captured'}; }});
    appServer = app.server;
    await bounded(new Promise((resolve,reject) => { appServer.once('error',reject); appServer.listen(0,'127.0.0.1',resolve); }), 3000);
    sourceIdentity.url = `http://127.0.0.1:${appServer.address().port}/`;
    const imageDirectory = process.env.BROWSER_IMAGE_DIRECTORY;
    const photoIds = [417074,15286,691668,1366919,1261728];
    const imageFiles = imageDirectory ? photoIds.map(id => identity(path.join(imageDirectory, id + '.jpg'))) : null;
    const executable = process.env.BROWSER_EXECUTABLE || chromium.executablePath();
    fs.accessSync(executable, fs.constants.X_OK);
    if (process.env.FONTCONFIG_FILE) fs.accessSync(process.env.FONTCONFIG_FILE, fs.constants.R_OK);
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
        const layout = () => page.locator('body, .language-controls, #language-toggle, main, h1, #gallery')
          .evaluateAll(nodes => nodes.map(n => ({tag: n.tagName, rect: n.getBoundingClientRect().toJSON(), font: getComputedStyle(n).font})));
        // Deterministic image fixtures test contain with landscape and portrait ratios.
        // Production CDN availability is a separate network observation.
        await page.addInitScript(() => {
          const NativeImage = window.Image;
          window.galleryRequests = [];
          window.Image = function (...args) {
            if (!window.controlGalleryRequests) return new NativeImage(...args);
            const request = {};
            window.galleryRequests.push(request);
            return request;
          };
        });
        let failImages = false;
        const imageRequests = [];
        await page.route('https://images.pexels.com/**', async route => {
          const id = new URL(route.request().url()).pathname.split('/')[2];
          imageRequests.push(id);
          if (failImages) return route.abort();
          if (imageDirectory) return route.fulfill({contentType: 'image/jpeg', body: fs.readFileSync(path.join(imageDirectory, id + '.jpg'))});
          const sizes = {'417074': [4226,2847], '15286': [2500,1667], '691668': [5472,3648], '1366919': [1200,1800], '1261728': [6016,4016]};
          const [w,h] = sizes[id];
          return route.fulfill({contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#31586b"/><text x="10%" y="50%" font-size="100" fill="white">Fixture ${id}</text></svg>`});
        });
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
          assert.equal(await staticPage.locator('#welcome-message, #language-hint, main > p').count(), 0);
        } finally { await bounded(staticContext.close(), 3000); }
        await load(sourceIdentity.url);
        const fontSession = await page.context().newCDPSession(page);
        let renderedFonts;
        try {
          await fontSession.send('DOM.enable');
          await fontSession.send('CSS.enable');
          const {root} = await fontSession.send('DOM.getDocument');
          const {nodeId} = await fontSession.send('DOM.querySelector', {nodeId:root.nodeId, selector:'h1'});
          ({fonts:renderedFonts} = await fontSession.send('CSS.getPlatformFontsForNode', {nodeId}));
          assert.ok(renderedFonts.some(font => font.glyphCount > 0), 'heading must render with a real font');
        } finally { await fontSession.detach(); }
        const updatedShot = await page.screenshot({path: path.join(output, `updated-${width}.png`), fullPage: true});
        if (baselineIdentity) {
          const after = await layout();
          for (const i of [1, 2, 4]) assert.deepEqual(after[i], before[i], 'retained controls and heading layout');
          const oldGallery = before.at(-1), newGallery = after.at(-1);
          assert.equal(newGallery.font, oldGallery.font);
          for (const key of ['x', 'width', 'height']) assert.equal(newGallery.rect[key], oldGallery.rect[key]);
          assert.ok(newGallery.rect.y < oldGallery.rect.y, 'gallery naturally moves up after removal');
        }
        const remember = () => page.evaluate(() => { window.originalButton = document.getElementById('language-toggle'); });
        const check = async english => {
          const button = page.locator('#language-toggle');
          assert.equal(await button.getAttribute('title'), english ? 'Switch to Chinese (Simplified)' : '切换到英文');
          assert.equal(await button.getAttribute('aria-describedby'), null);
          assert.equal(await page.locator('#welcome-message, #language-hint').count(), 0);
          assert.equal(await page.evaluate(() => window.originalButton === document.getElementById('language-toggle')), true);
          assert.equal(await button.textContent(), english ? '中文' : 'English');
          assert.equal(await button.getAttribute('lang'), english ? 'zh' : 'en');
          assert.equal(await page.locator('h1').textContent(), english ? 'Welcome here' : '欢迎来到这里');
          assert.equal(await page.title(), english ? 'Welcome here' : '欢迎来到这里');
          assert.equal(await page.locator('html').getAttribute('lang'), english ? 'en' : 'zh-CN');
          assert.equal(await page.locator('#gallery-prev').textContent(), english ? 'Previous' : '上一张');
          assert.equal(await page.locator('#gallery-next').textContent(), english ? 'Next' : '下一张');
          assert.match(await page.locator('#gallery-help').textContent(), english ? /Click.*enlarge/ : /点击图片放大或还原/);
          assert.equal(await page.locator('#gallery').getAttribute('aria-label'), english ? 'Nature photo gallery' : '自然风景图片窗');
          if (english) {
            for (const selector of ['#gallery-credit', '#gallery-help', '#gallery-status']) {
              assert.doesNotMatch(await page.locator(selector).textContent(), /[\u3400-\u9fff]|undefined/);
            }
            assert.doesNotMatch(await page.locator('#gallery-image').getAttribute('alt'), /[\u3400-\u9fff]/);
          }
          assert.equal(await page.locator('main > p').count(), 0, 'no dedicated paragraph placeholders');
        };
        await remember(); await check(false);
        await page.locator('#language-toggle').click(); await check(true);
        await page.reload(); await remember(); await check(false);
        await page.keyboard.press('Tab');
        assert.equal(await page.locator('#language-toggle').evaluate(n => n === document.activeElement), true);
        assert.equal(await page.locator('#language-toggle').evaluate(n => getComputedStyle(n).outlineStyle), 'solid');
        assert.equal(await page.locator('#language-toggle').evaluate(n => getComputedStyle(n).outlineWidth), '3px');
        await page.keyboard.press('Enter'); await check(true);
        await page.keyboard.press('Space'); await check(false);
        for (let i = 1; i <= 24; i++) { await page.locator('#language-toggle').click(); await check(i % 2 === 1); }
        for (let round = 0; round < 24; round++) {
          await page.locator('#language-toggle').click(); await check(true);
          await page.locator('#language-toggle').click(); await check(false);
        }
        await page.reload(); await remember(); await check(false);
        const image = page.locator('#gallery-image');
        const trigger = page.locator('#gallery-trigger');
        const status = page.locator('#gallery-status');
        const ready = () => page.waitForFunction(() => !document.getElementById('gallery-image').hidden);
        await ready();
        const sequence = [];
        for (let i = 0; i < 5; i++) {
          await ready();
          const src = await image.getAttribute('src'); sequence.push(src);
          await trigger.focus();
          await page.evaluate(() => window.scrollTo(0, 80));
          const scroll = await page.evaluate(() => window.scrollY);
          const rect = await trigger.boundingBox();
          assert.equal(rect.height, 360); assert.equal(rect.width, Math.min(width - 24, 720));
          const fits = await image.evaluate(n => {
            const box = n.getBoundingClientRect();
            const scale = Math.min(box.width / n.naturalWidth, box.height / n.naturalHeight);
            return n.naturalWidth > 0 && getComputedStyle(n).objectFit === 'contain' &&
              n.naturalWidth * scale <= box.width + 0.1 && n.naturalHeight * scale <= box.height + 0.1;
          });
          assert.equal(fits, true);
          for (let repeat = 0; repeat < 2; repeat++) {
            await trigger.press(repeat ? 'Space' : 'Enter');
            assert.deepEqual(await trigger.boundingBox(), {x: 0, y: 0, width, height: 720});
            assert.equal(await page.locator('.gallery-slot').evaluate(n => n.getBoundingClientRect().height), 360);
            assert.equal(await page.locator('.gallery-controls').evaluate(n => getComputedStyle(n).visibility), 'hidden');
            assert.equal(await image.getAttribute('src'), src);
            assert.equal(await image.evaluate(n => getComputedStyle(n).objectFit), 'contain');
            await trigger.click();
            assert.deepEqual(await trigger.boundingBox(), rect);
            assert.equal(await page.evaluate(() => window.scrollY), scroll);
            assert.equal(await trigger.evaluate(n => n === document.activeElement), true);
            assert.equal(await page.locator('.gallery-controls').evaluate(n => getComputedStyle(n).visibility), 'visible');
            assert.equal(await image.getAttribute('src'), src);
          }
          await page.locator('#gallery-next').click();
        }
        assert.equal(new Set(sequence).size, 5);
        assert.equal(await image.getAttribute('src'), sequence[0]);
        await page.locator('#gallery-prev').click(); await ready();
        assert.equal(await image.getAttribute('src'), sequence[4]);
        await page.evaluate(() => { for (let i = 0; i < 12; i++) document.getElementById('gallery-next').click(); });
        await ready(); assert.equal(await image.getAttribute('src'), sequence[1]);
        // Disable browser cache through routing, then force a new request to fail.
        failImages = true;
        await page.reload(); await remember();
        await page.waitForFunction(() => document.getElementById('gallery-status').textContent.includes('失败'));
        assert.equal(await image.isVisible(), false);
        assert.equal((await trigger.boundingBox()).height, 360);
        await page.locator('#language-toggle').click(); await check(true);
        failImages = false;
        await page.locator('#gallery-next').click(); await ready();
        assert.equal((await status.textContent()).includes('失败'), false);
        // Control preloader callbacks while keeping the real DOM, CSS and image element.
        await page.evaluate(() => { window.controlGalleryRequests = true; document.body.style.overflow = 'auto'; });
        await page.locator('#gallery-next').click();
        await page.locator('#gallery-prev').focus();
        await page.evaluate(() => window.scrollTo(0, 80));
        const savedScroll = await page.evaluate(() => window.scrollY);
        const savedRect = await trigger.boundingBox();
        await trigger.evaluate(n => n.click());
        assert.deepEqual(await trigger.boundingBox(), {x: 0, y: 0, width, height: 720});
        assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
        await page.locator('#language-toggle').evaluate(n => n.click()); await check(false);
        assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
        await page.locator('#language-toggle').evaluate(n => n.click()); await check(true);
        assert.equal(await trigger.getAttribute('aria-label'), 'Restore image');
        await page.evaluate(() => window.galleryRequests[0].onerror());
        assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
        assert.equal(await page.evaluate(() => document.body.style.overflow), 'auto');
        assert.equal(await page.evaluate(() => window.scrollY), savedScroll);
        assert.deepEqual(await trigger.boundingBox(), savedRect);
        assert.equal(await page.locator('#gallery-prev').evaluate(n => n === document.activeElement), true);
        assert.equal(await page.locator('.gallery-controls').evaluate(n => getComputedStyle(n).visibility), 'visible');
        assert.equal(await image.isVisible(), false);
        assert.match(await status.textContent(), /failed.*retry/);
        await page.locator('#gallery-next').click();
        await page.locator('#gallery-next').click();
        await trigger.evaluate(n => n.click());
        const loadingStatus = await status.textContent();
        await page.evaluate(() => { window.galleryRequests[1].onerror(); window.galleryRequests[1].onload(); });
        assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
        assert.equal(await status.textContent(), loadingStatus);
        assert.equal(await image.isVisible(), false);
        await page.evaluate(() => window.galleryRequests[2].onload());
        assert.equal(await image.isVisible(), true);
        assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
        await trigger.click();
        await page.evaluate(() => { window.controlGalleryRequests = false; });
        await page.locator('#gallery-next').click(); await ready();
        await page.screenshot({path: path.join(output, `gallery-${width}.png`), fullPage: true});
        // Exercise the actual page, cookies, CSRF, script delivery and HTTP API together.
        await page.reload();
        await page.evaluate(() => { window.savedGallery = document.getElementById('gallery-image'); });
        await page.locator('#screenshots-tab').click();
        await page.waitForFunction(() => !document.getElementById('reload-screenshots').disabled);
        const cards = page.locator('#screenshots-list img');
        const initial = await cards.count();
        await page.locator('#capture-screenshot').click();
        await page.locator('#language-toggle').click();
        await page.waitForFunction(() => !document.getElementById('capture-screenshot').disabled);
        assert.match(await page.locator('#capture-status').textContent(), /Screenshot saved/);
        assert.equal(await cards.count(), initial + 1);
        const screenshot = page.locator('#screenshots-list button').first();
        await screenshot.focus(); await screenshot.press('Enter');
        assert.equal(await screenshot.getAttribute('aria-expanded'), 'true');
        await screenshot.press('Space');
        assert.equal(await screenshot.getAttribute('aria-expanded'), 'false');
        assert.equal(await screenshot.evaluate(n => n === document.activeElement), true);
        await page.locator('#screenshots-tab').press('Home');
        assert.equal(await page.locator('#welcome-panel').isVisible(), true);
        assert.equal(await page.evaluate(() => window.savedGallery === document.getElementById('gallery-image')), true);
        await page.reload(); await page.locator('#screenshots-tab').click();
        await page.waitForFunction(n => document.querySelectorAll('#screenshots-list img').length === n, initial + 1);
        await page.locator('.screenshot-delete').first().click();
        await page.waitForFunction(n => document.querySelectorAll('#screenshots-list img').length === n, initial);
        records.push({renderedFonts, screenshots: {http: true, captureFixture: true, asyncLanguage: true, keyboardZoom: true, reload: true, delete: true}, imageMode: imageDirectory ? 'cached Pexels JPEGs' : 'controlled SVG fixtures; CDN not verified', width, height: 720, mouse: true, tab: true, enter: true, space: true,
          staticTitle: true, title: true, roundTrips: 24, repeatedToggles: 24, refreshFromEnglish: true, refreshFromChinese: true,
          noDanglingDescription: true, removedDescriptions: true, reusedButton: true, visibleFocus: true, gallery: {photos: 5, cycles: true, repeatedRestore: true, ratio: true, failureRecovery: true, expandedFailureRecovery: true, staleExpandedCallbacks: true, rapidSwitch: true, keyboard: true, imageRequests},
          baselineComparison: baselineIdentity ? 'passed; natural gallery shift allowed' : 'not_requested'});
      } finally { await bounded(page.close(), 3000); }
    }
    assert.equal(hash(fs.readFileSync(source)), sourceIdentity.sha256, 'source changed during acceptance');
    if (baselineIdentity) assert.equal(hash(fs.readFileSync(baselinePath)), baselineIdentity.sha256);
    process.send({result: {imageFiles, source: sourceIdentity, baseline: baselineIdentity, browser: browser.version(),
      playwright: require(path.join(path.dirname(require.resolve(process.env.PLAYWRIGHT_MODULE || path.join(runtime, 'node/node_modules/playwright'))), 'package.json')).version,
      applicationFiles: ['server.cjs','backend/capture.cjs','backend/store.cjs','public/screenshots.js'].map(file => identity(path.resolve(__dirname,'..',file))),
      entrySha256: hash(fs.readFileSync(__filename)), node: process.version, records}});
  } finally {
    try { if (browser) await bounded(browser.close(), 3000); }
    finally {
      try { if (server) await bounded(server.close(), 3000); }
      finally {
        try { if (appServer) { appServer.closeAllConnections(); await bounded(new Promise(r => appServer.close(r)), 3000); } }
        finally { if (storage) fs.rmSync(storage, {recursive:true,force:true}); }
      }
    }
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
