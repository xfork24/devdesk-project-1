'use strict';
// Independent acceptance assertions for Task 5e70bee0-7ed6-1b8b-a7b5-15557c7e2d8d
// (screenshot-history-aria-busy): #history-status must expose aria-busy="true"
// while a history read is in flight and aria-busy="false" once it settles.
//
// Self-contained by design: no file under test/ is imported, so this file stays
// valid while the implementation author maintains the formal project regression.
// Node >=22; jsdom@26.1.0 is taken from the frozen recipe (JSDOM_MODULE) or from
// the shared runtime cache declared by the repository.
// Run: node --test tests/.devdesk/5e70bee0-7ed6-1b8b-a7b5-15557c7e2d8d/aria-busy.screenshots-history.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require(process.env.JSDOM_MODULE || path.join(process.env.DEVDESK_RUNTIME_CACHE || '/tmp/devdesk-runtime/shared', 'frontend-jsdom-26.1.0/node_modules/jsdom'));

// The repository root is three levels up: <root>/tests/.devdesk/<task-uuid>/.
const root = path.resolve(__dirname, '..', '..', '..');

const A = {id: '11111111-1111-4111-8111-111111111111', createdAt: '2026-11-21T01:00:00.000Z', width: 800, height: 600, url: '/api/screenshots/11111111-1111-4111-8111-111111111111/image'};
const B = {...A, id: '22222222-2222-4222-8222-222222222222', createdAt: '2026-11-22T01:00:00.000Z', url: '/api/screenshots/22222222-2222-4222-8222-222222222222/image'};

const GUIDE_ZH = '暂无截图。点击“区域截图”创建第一张截图。';
const GUIDE_EN = 'No screenshots yet. Select “Capture region” to create your first screenshot.';
const LOADING_ZH = '正在加载历史…';
const LOADING_EN = 'Loading history…';
const ERROR_ZH = '历史加载失败：存储失败，请检查后台磁盘后重试。';

const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return {promise, resolve}; };
const response = (body, status = 200) => ({ok: status < 400, status, json: async () => body});

// Completion is judged by the existing panel request ending, never by the busy attribute.
async function settle(check, message) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise(r => setTimeout(r, 10));
  }
  assert.fail(message || 'UI did not reach the expected state within 5000ms');
}

function createApp(t, data = [A, B]) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
    url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true
  });
  t.after(() => dom.window.close());
  const w = dom.window, d = w.document, calls = [], errors = [];
  w.scrollTo = p => { w.scrollY = p.top; w.scrollX = p.left; };
  w.Image = class { set src(v) { queueMicrotask(() => this.onload?.()); } };
  const state = {list: () => response({items: data}), post: () => response({item: B}, 201), del: () => response(null, 204)};
  w.fetch = async (url, options = {}) => {
    calls.push({url, ...options});
    if (url === '/api/session') return response({csrfToken: 'independent-session'});
    return options.method === 'POST' ? state.post() : options.method === 'DELETE' ? state.del() : state.list();
  };
  w.addEventListener('error', event => errors.push(event.error));
  for (const script of d.querySelectorAll('script')) {
    w.eval(script.src ? fs.readFileSync(path.join(root, 'public/screenshots.js'), 'utf8') : script.textContent);
  }
  const $ = id => d.getElementById(id);
  const status = () => $('history-status');
  return {
    w, d, $, state, calls, errors,
    click: id => $(id).click(),
    // A synthetic dispatch reaches the handler even while the control is disabled,
    // which is how a repeated trigger is observed against the internal guards.
    dispatch: id => $(id).dispatchEvent(new w.MouseEvent('click', {bubbles: true, cancelable: true})),
    enter: () => $('screenshots-tab').click(),
    toggleLanguage: () => $('language-toggle').click(),
    status,
    busy: () => status().getAttribute('aria-busy'),
    images: () => [...$('screenshots-list').querySelectorAll('img')],
    reads: () => calls.filter(c => c.url === '/api/screenshots'),
    // The panel request has ended: the refresh control is enabled again.
    finished: () => calls.some(c => c.url === '/api/screenshots') && !$('reload-screenshots').disabled
  };
}

test('AC-1/AC-3: a settled non-empty history exposes aria-busy="false" on #history-status and renders its entries', async t => {
  const p = createApp(t, [A, B]);
  p.enter();
  await settle(() => p.finished() && p.images().length === 2, 'the history entries were not rendered');
  assert.equal(p.busy(), 'false', '#history-status must expose aria-busy="false" once no read is in flight');
  assert.equal(p.status().textContent, '', 'a non-empty history keeps the existing empty status text');
  assert.equal(p.reads().length, 1, 'the first read is issued exactly once');
});

test('AC-2: the first history read marks #history-status busy immediately and issues exactly one read', async t => {
  const p = createApp(t, [A, B]);
  const hold = deferred();
  p.state.list = () => hold.promise;
  p.enter();
  assert.equal(p.reads().length, 1, 'entering the screenshot history issues exactly one read');
  assert.equal(p.busy(), 'true', '#history-status must expose aria-busy="true" while the first read is in flight');
  assert.equal(p.$('reload-screenshots').disabled, true, 'the refresh control stays disabled while loading');
  assert.equal(p.status().textContent, LOADING_ZH, 'the existing loading text is kept');
  hold.resolve(response({items: []}));
  await settle(() => p.finished(), 'the pending read did not settle');
  assert.equal(p.busy(), 'false', '#history-status must expose aria-busy="false" after the read settles');
});

test('AC-4: a settled empty history exposes aria-busy="false" and keeps the existing empty-state guide', async t => {
  const p = createApp(t, []);
  p.enter();
  await settle(() => p.finished(), 'the empty history read did not settle');
  assert.equal(p.busy(), 'false', '#history-status must expose aria-busy="false" once the empty read settles');
  assert.equal(p.status().textContent, GUIDE_ZH, 'the existing empty-state guide is kept');
});

test('AC-5: a failed history read exposes aria-busy="false" and keeps the error text and a usable retry control', async t => {
  const p = createApp(t, [A]);
  p.state.list = () => response({error: {code: 'STORAGE_FAILED'}}, 500);
  p.enter();
  await settle(() => !p.$('retry-history').hidden, 'the failure never surfaced a retry control');
  assert.equal(p.busy(), 'false', '#history-status must expose aria-busy="false" after the failed read settles');
  assert.equal(p.status().textContent, ERROR_ZH, 'the existing failure text is kept');
  assert.equal(p.$('retry-history').hidden, false, 'the retry control stays visible');
  assert.equal(p.$('retry-history').disabled, false, 'the retry control stays interactive');
});

test('AC-6: retrying after a failure exposes aria-busy="true" at once and issues exactly one extra read', async t => {
  const p = createApp(t, [A]);
  p.state.list = () => response({error: {code: 'STORAGE_FAILED'}}, 500);
  p.enter();
  await settle(() => !p.$('retry-history').hidden, 'the failure never surfaced a retry control');
  const before = p.reads().length;
  const hold = deferred();
  p.state.list = () => hold.promise;
  p.click('retry-history');
  assert.equal(p.reads().length, before + 1, 'the retry issues exactly one additional read');
  assert.equal(p.busy(), 'true', '#history-status must expose aria-busy="true" as soon as the retry starts');
  assert.equal(p.status().textContent, LOADING_ZH, 'the existing loading text is kept during the retry');
  hold.resolve(response({items: []}));
  await settle(() => p.finished(), 'the retried read did not settle');
  assert.equal(p.busy(), 'false', '#history-status must expose aria-busy="false" after the retry settles');
});

test('AC-7: switching language during a pending read keeps aria-busy="true" and switches the loading text', async t => {
  const p = createApp(t, [A]);
  const hold = deferred();
  p.state.list = () => hold.promise;
  p.enter();
  assert.equal(p.busy(), 'true', '#history-status must expose aria-busy="true" while the read is in flight');
  p.toggleLanguage();
  assert.equal(p.busy(), 'true', 'the language switch must not clear the busy marker');
  assert.equal(p.status().textContent, LOADING_EN, 'the existing bilingual loading text still switches');
  assert.equal(p.reads().length, 1, 'the language switch does not issue another read');
  hold.resolve(response({items: []}));
  await settle(() => p.finished(), 'the pending read did not settle');
  assert.equal(p.busy(), 'false', '#history-status must expose aria-busy="false" after the read settles');
});

test('AC-8: a manual refresh exposes aria-busy="true" at once, repeated triggers keep a single read, and the value settles to "false"', async t => {
  const p = createApp(t, [A]);
  p.state.list = () => response({error: {code: 'STORAGE_FAILED'}}, 500);
  p.enter();
  await settle(() => !p.$('retry-history').hidden, 'the failure never surfaced a retry control');
  const before = p.reads().length;
  const hold = deferred();
  p.state.list = () => hold.promise;
  p.click('reload-screenshots');
  assert.equal(p.reads().length, before + 1, 'the manual refresh issues exactly one read');
  assert.equal(p.busy(), 'true', '#history-status must expose aria-busy="true" as soon as the refresh starts');
  assert.equal(p.$('reload-screenshots').disabled, true, 'the refresh control stays disabled while loading');
  assert.equal(p.$('retry-history').disabled, true, 'the retry control stays disabled while loading');
  // Repeated triggers on the single in-flight read, including synthetic events that
  // reach the handlers behind the disabled controls.
  p.click('reload-screenshots');
  p.click('retry-history');
  p.dispatch('reload-screenshots');
  p.dispatch('retry-history');
  p.toggleLanguage();
  assert.equal(p.reads().length, before + 1, 'no repeated trigger may start a second read');
  assert.equal(p.busy(), 'true', 'the busy marker survives repeated triggers and the language switch');
  assert.equal(p.status().textContent, LOADING_EN, 'the existing bilingual loading text still switches');
  hold.resolve(response({items: []}));
  await settle(() => p.finished(), 'the pending refresh did not settle');
  assert.equal(p.busy(), 'false', '#history-status must expose aria-busy="false" after the refresh settles');
});

test('AC-9: the status semantics, bilingual text, retry interaction and read request shape stay unchanged, and aria-busy is the only added ARIA attribute', async t => {
  const p = createApp(t, []);
  p.enter();
  await settle(() => p.finished(), 'the empty history read did not settle');
  const status = p.status();
  assert.equal(status.getAttribute('role'), 'status', 'the existing role is kept');
  assert.equal(status.getAttribute('aria-live'), 'polite', 'the existing live region is kept');
  assert.deepEqual(
    [...status.attributes].map(a => a.name).filter(n => n.startsWith('aria-')).sort(),
    ['aria-busy', 'aria-live'],
    'aria-busy is the only ARIA attribute added to #history-status'
  );
  assert.equal(p.$('screenshots-panel').getAttribute('aria-busy'), 'false', 'the pre-existing panel busy attribute is untouched');
  assert.equal(status.textContent, GUIDE_ZH, 'the existing empty-state guide is kept in Chinese');
  p.toggleLanguage();
  assert.equal(status.textContent, GUIDE_EN, 'the existing empty-state guide follows the language switch');
  assert.equal(p.reads().length, 1, 'the language switch does not issue another read');
  assert.equal(p.reads()[0].url, '/api/screenshots', 'the history read path is unchanged');
  assert.equal(p.reads()[0].method ?? 'GET', 'GET', 'the history read is still a GET');
  assert.equal(p.reads()[0].credentials, 'same-origin', 'the history read keeps same-origin credentials');
  p.state.list = () => response({error: {code: 'STORAGE_FAILED'}}, 500);
  p.click('reload-screenshots');
  await settle(() => !p.$('retry-history').hidden, 'the failure never surfaced a retry control');
  assert.equal(p.$('retry-history').hidden, false, 'the retry control stays visible');
  assert.equal(p.$('retry-history').disabled, false, 'the retry control stays interactive');
  const before = p.reads().length;
  p.state.list = () => response({items: []});
  p.click('retry-history');
  assert.equal(p.reads().length, before + 1, 'the retry still issues exactly one additional read');
  await settle(() => p.finished(), 'the retried read did not settle');
  assert.equal(status.textContent, GUIDE_EN, 'the retried empty history keeps the current language');
  assert.deepEqual(p.errors, [], 'no uncaught page error occurred');
});
