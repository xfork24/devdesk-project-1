'use strict';
/**
 * 独立验收断言：截图历史空状态的双语指引
 * Task d5280b56-c4ff-dde3-59e2-c80634ea7298 / key screenshots-empty-history-guide
 *
 * 设计要点
 * - 独立运行只使用 Node 内置模块（node:test / node:assert / node:fs / node:path / node:vm / node:crypto）。
 *   本容器与独立隔离容器都没有可用的 jsdom（冻结配方未声明第三方依赖），因此这里内置一个
 *   最小 DOM 替身，沿用仓库既有做法（README 第 31 行：正式语言测试“使用最小 DOM 替身”）。
 * - 被测对象始终是磁盘上的真实文件：真实 index.html 与真实 public/screenshots.js，
 *   在运行时读取，因此同一份断言可以分别对冻结基线（Red）和实现版本（Green）执行。
 * - 只观察可观察行为：可见文本、控件集合、请求次数/路径/选项。DOM 布局不在断言范围。
 * 运行：node --test tests/.devdesk/d5280b56-c4ff-dde3-59e2-c80634ea7298/screenshot-empty-guide.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

// ---------------------------------------------------------------------------
// 期望可见文案（冻结于 AC-01 / AC-02 / AC-04 / AC-05）
// 中文引号使用 U+201C / U+201D，中文句号 U+3002，英文句号 U+002E。
// ---------------------------------------------------------------------------
const GUIDE_ZH = '暂无截图\u3002点击\u201c区域截图\u201d创建第一张截图\u3002';
const GUIDE_EN = 'No screenshots yet. Select \u201cCapture region\u201d to create your first screenshot.';
const LOADING_ZH = '正在加载历史\u2026';
const LOADING_EN = 'Loading history\u2026';
const ERROR_ZH = '历史加载失败：存储失败，请检查后台磁盘后重试。';
const ERROR_EN = 'History loading failed: Storage failed. Check the backend disk and retry.';
const CAPTURE_ZH = '区域截图';
const CAPTURE_EN = 'Capture region';
const RECORD = {
  id: '11111111-1111-4111-8111-111111111111',
  createdAt: '2026-11-21T01:00:00.000Z',
  width: 800,
  height: 600,
  url: '/api/screenshots/11111111-1111-4111-8111-111111111111/image'
};

// ---------------------------------------------------------------------------
// 项目根定位：默认从本文件向上查找同时含 public/screenshots.js 与 index.html 的目录，
// PROJECT_ROOT 仅用于本地自检（例如在 /tmp 的副本上验证 Green），平台执行时不设置。
// ---------------------------------------------------------------------------
function findProjectRoot(start) {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'public', 'screenshots.js')) && fs.existsSync(path.join(dir, 'index.html'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('cannot locate project root containing index.html and public/screenshots.js');
}
const ROOT = process.env.PROJECT_ROOT ? path.resolve(process.env.PROJECT_ROOT) : findProjectRoot(__dirname);
const SOURCE_FILE = path.join(ROOT, 'public', 'screenshots.js');
const PAGE_FILE = path.join(ROOT, 'index.html');
if (!fs.existsSync(SOURCE_FILE) || !fs.existsSync(PAGE_FILE)) {
  throw new Error(`project files missing under ${ROOT}: ${SOURCE_FILE} / ${PAGE_FILE}`);
}
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// ---------------------------------------------------------------------------
// 最小 DOM 替身
// ---------------------------------------------------------------------------
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

function matchesSelector(element, selector) {
  const text = String(selector).trim();
  const match = /^([a-zA-Z][\w-]*)?((?:\[[^\]]*\])*)$/.exec(text);
  if (!match) return false;
  if (match[1] && element.tag !== match[1].toLowerCase()) return false;
  for (const part of match[2].match(/\[[^\]]*\]/g) || []) {
    const inner = part.slice(1, -1);
    const eq = inner.indexOf('=');
    if (eq === -1) {
      if (!element.hasAttribute(inner)) return false;
      continue;
    }
    const name = inner.slice(0, eq).trim();
    let value = inner.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (element.getAttribute(name) !== value) return false;
  }
  return true;
}

class TextNode {
  constructor(data) {
    this.nodeType = 3;
    this.data = String(data);
    this.parentNode = null;
  }
  get textContent() { return this.data; }
  set textContent(value) { this.data = String(value); }
}

class Element {
  constructor(tag, attrs = {}, ownerDocument = null) {
    this.nodeType = 1;
    this.tag = String(tag).toLowerCase();
    this.ownerDocument = ownerDocument;
    this.attrs = {...attrs};
    this.childNodes = [];
    this.parentNode = null;
    this.style = {};
    this.listeners = new Map();
    this.classes = new Set(String(this.attrs.class || '').split(/\s+/).filter(Boolean));
    this.className = this.attrs.class || '';
    this.hidden = Object.hasOwn(this.attrs, 'hidden');
    this.disabled = Object.hasOwn(this.attrs, 'disabled');
    this.tabIndex = this.attrs.tabindex === undefined ? 0 : Number(this.attrs.tabindex);
    this.value = this.attrs.value || '';
  }
  get id() { return this.attrs.id || ''; }
  get type() { return this.attrs.type || ''; }
  set type(value) { this.attrs.type = String(value); }
  get src() { return this.attrs.src || ''; }
  set src(value) { this.attrs.src = String(value); }
  get alt() { return this.attrs.alt || ''; }
  set alt(value) { this.attrs.alt = String(value); }
  getAttribute(name) { return Object.hasOwn(this.attrs, name) ? this.attrs[name] : null; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  hasAttribute(name) { return Object.hasOwn(this.attrs, name); }
  removeAttribute(name) { delete this.attrs[name]; }
  get classList() {
    const owner = this;
    return {
      add(name) { owner.classes.add(name); },
      remove(name) { owner.classes.delete(name); },
      contains(name) { return owner.classes.has(name); },
      toggle(name, force) {
        const on = force === undefined ? !owner.classes.has(name) : !!force;
        if (on) owner.classes.add(name); else owner.classes.delete(name);
        return on;
      }
    };
  }
  get textContent() {
    let out = '';
    for (const child of this.childNodes) out += child.textContent;
    return out;
  }
  set textContent(value) {
    this.childNodes = [];
    this.appendChild(new TextNode(value));
  }
  get innerHTML() { return this.textContent; }
  set innerHTML(value) { this.textContent = String(value).replace(/<[^>]*>/g, ''); }
  get children() { return this.childNodes.filter(node => node.nodeType === 1); }
  appendChild(node) {
    const child = typeof node === 'string' ? new TextNode(node) : node;
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
  append(...nodes) { for (const node of nodes) this.appendChild(node); }
  insertBefore(node, reference) {
    const index = reference ? this.childNodes.indexOf(reference) : -1;
    if (index === -1) return this.appendChild(node);
    const child = typeof node === 'string' ? new TextNode(node) : node;
    child.parentNode = this;
    this.childNodes.splice(index, 0, child);
    return child;
  }
  remove() {
    const parent = this.parentNode;
    if (!parent) return;
    const index = parent.childNodes.indexOf(this);
    if (index >= 0) parent.childNodes.splice(index, 1);
    this.parentNode = null;
  }
  get isConnected() {
    let node = this;
    while (node.parentNode) node = node.parentNode;
    return node.nodeType === 9;
  }
  contains(other) {
    let node = other;
    while (node) {
      if (node === this) return true;
      node = node.parentNode;
    }
    return false;
  }
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  blur() { if (this.ownerDocument && this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body; }
  getBoundingClientRect() { return {x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0}; }
  addEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    list.push(handler);
    this.listeners.set(type, list);
  }
  removeEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    const index = list.indexOf(handler);
    if (index >= 0) list.splice(index, 1);
  }
  dispatchEvent(event) {
    const list = this.listeners.get(event.type) || [];
    for (const handler of [...list]) handler.call(this, event);
    return !event.defaultPrevented;
  }
  click() {
    this.dispatchEvent({type: 'click', target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}});
  }
  closest(selector) {
    let node = this;
    while (node && node.nodeType === 1) {
      if (matchesSelector(node, selector)) return node;
      node = node.parentNode;
    }
    return null;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const found = [];
    const walk = node => {
      for (const child of node.childNodes) {
        if (child.nodeType !== 1) continue;
        if (matchesSelector(child, selector)) found.push(child);
        walk(child);
      }
    };
    walk(this);
    return found;
  }
}

class Document {
  constructor() {
    this.nodeType = 9;
    this.childNodes = [];
    this.documentElement = null;
    this.body = null;
    this.title = '';
    this.activeElement = null;
    this.byId = new Map();
  }
  appendChild(node) {
    node.parentNode = this;
    this.childNodes.push(node);
    if (node.nodeType === 1) {
      if (node.tag === 'html') this.documentElement = node;
      if (node.tag === 'body') this.body = node;
    }
    return node;
  }
  createElement(tag) { return new Element(tag, {}, this); }
  getElementById(id) { return this.byId.get(id) || null; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const found = [];
    const walk = node => {
      for (const child of node.childNodes) {
        if (child.nodeType !== 1) continue;
        if (matchesSelector(child, selector)) found.push(child);
        walk(child);
      }
    };
    walk(this.documentElement || {childNodes: []});
    return found;
  }
  register(element) { if (element.attrs.id) this.byId.set(element.attrs.id, element); }
}

function findTagEnd(html, start) {
  let quote = null;
  for (let i = start + 1; i < html.length; i++) {
    const char = html[i];
    if (quote) { if (char === quote) quote = null; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '>') return i;
  }
  return html.length;
}

function parseAttributes(source) {
  const attrs = {};
  const pattern = /([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;
  let match;
  while ((match = pattern.exec(source))) {
    const value = match[2] !== undefined ? match[2] : match[3] !== undefined ? match[3] : match[4] !== undefined ? match[4] : '';
    attrs[match[1].toLowerCase()] = value;
  }
  return attrs;
}

function parseHtml(html) {
  const doc = new Document();
  const stack = [];
  const parent = () => (stack.length ? stack[stack.length - 1] : doc);
  let index = 0;
  const addText = text => { if (text) parent().appendChild(new TextNode(text)); };
  while (index < html.length) {
    const lt = html.indexOf('<', index);
    if (lt === -1) { addText(html.slice(index)); break; }
    if (lt > index) addText(html.slice(index, lt));
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt);
      index = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith('<!', lt)) {
      const end = html.indexOf('>', lt);
      index = end === -1 ? html.length : end + 1;
      continue;
    }
    if (html.startsWith('</', lt)) {
      const end = html.indexOf('>', lt);
      const name = html.slice(lt + 2, end === -1 ? html.length : end).trim().toLowerCase();
      for (let s = stack.length - 1; s >= 0; s--) {
        if (stack[s].tag === name) { stack.length = s; break; }
      }
      index = end === -1 ? html.length : end + 1;
      continue;
    }
    const end = findTagEnd(html, lt);
    const raw = html.slice(lt + 1, end);
    const match = /^([a-zA-Z][\w:-]*)([\s\S]*)$/.exec(raw);
    if (!match) { index = end + 1; continue; }
    const tag = match[1].toLowerCase();
    const element = new Element(tag, parseAttributes(match[2]), doc);
    parent().appendChild(element);
    doc.register(element);
    if (VOID_TAGS.has(tag)) { index = end + 1; continue; }
    if (tag === 'script' || tag === 'style') {
      const close = html.toLowerCase().indexOf('</' + tag, end);
      const content = html.slice(end + 1, close === -1 ? html.length : close);
      if (tag === 'script') element.appendChild(new TextNode(content));
      index = close === -1 ? html.length : html.indexOf('>', close) + 1;
      continue;
    }
    stack.push(element);
    index = end + 1;
  }
  return doc;
}

// ---------------------------------------------------------------------------
// 页面装配：真实 index.html + 真实 public/screenshots.js
// ---------------------------------------------------------------------------
class ImageStub {
  constructor() { this.onload = null; this.onerror = null; this._src = ''; }
  set src(value) { this._src = String(value); }
  get src() { return this._src; }
}

function jsonResponder(body, status = 200) {
  return async (url, options, state) => ({
    ok: status < 400,
    status,
    json: async () => { state.consumed += 1; return body; }
  });
}

function createPage(handler) {
  const doc = parseHtml(fs.readFileSync(PAGE_FILE, 'utf8'));
  const calls = [];
  const state = {consumed: 0, handler};
  const win = {
    scrollX: 0,
    scrollY: 0,
    crypto: {randomUUID: () => crypto.randomUUID()},
    scrollTo(position) {
      if (!position) return;
      if (position.left !== undefined) this.scrollX = position.left;
      if (position.top !== undefined) this.scrollY = position.top;
    }
  };
  const sandbox = {
    console,
    document: doc,
    window: win,
    Image: ImageStub,
    AbortController,
    crypto: win.crypto,
    setTimeout(handler_, delay, ...args) {
      const timer = setTimeout(handler_, delay, ...args);
      if (timer && typeof timer.unref === 'function') timer.unref();
      return timer;
    },
    clearTimeout,
    async fetch(url, options = {}) {
      calls.push({
        url,
        method: options.method || 'GET',
        credentials: options.credentials,
        headers: options.headers || {},
        body: options.body
      });
      return state.handler(url, options, state);
    }
  };
  vm.createContext(sandbox);
  for (const script of doc.querySelectorAll('script')) {
    const source = script.getAttribute('src');
    const code = source ? fs.readFileSync(path.join(ROOT, source.replace(/^\/+/, '')), 'utf8') : script.textContent;
    vm.runInContext(code, sandbox, {filename: source || 'index.html:inline-script', timeout: 10000});
  }
  return {
    doc,
    calls,
    state,
    byId: id => doc.getElementById(id),
    text: id => (doc.getElementById(id) || {textContent: ''}).textContent
  };
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

async function waitFor(predicate, message, timeoutMs = 3000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) assert.fail(message);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

const listCalls = page => page.calls.filter(call => call.url === '/api/screenshots');

test('独立断言基线：期望文案的字符与冻结需求逐字一致', () => {
  assert.equal(GUIDE_ZH, '暂无截图\u3002点击\u201c区域截图\u201d创建第一张截图\u3002');
  assert.equal(GUIDE_EN, 'No screenshots yet. Select \u201cCapture region\u201d to create your first screenshot.');
  assert.equal([...GUIDE_ZH].filter(char => char === '\u201c').length, 1);
  assert.equal([...GUIDE_ZH].filter(char => char === '\u201d').length, 1);
  assert.ok(GUIDE_ZH.endsWith('\u3002'));
  assert.ok(!/[「」]/.test(GUIDE_ZH));
  assert.ok(!/[「」]/.test(GUIDE_EN));
  assert.ok(GUIDE_EN.endsWith('.'));
});

test('AC-01 中文空历史：读取成功后 #history-status 可见全文严格等于中文指引全文', async () => {
  const page = createPage(jsonResponder({items: []}));
  page.byId('screenshots-tab').click();
  await waitFor(() => page.state.consumed >= 1, '空历史响应未被真实脚本消费');
  await tick();
  const status = page.byId('history-status');
  assert.equal(page.byId('screenshots-panel').hidden, false, '面板应处于可见状态');
  assert.equal(status.textContent, GUIDE_ZH);
  assert.equal(status.children.length, 0, '指引必须是纯文本，不得引入子元素');
  assert.equal(listCalls(page).length, 1);
});

test('AC-02 英文空历史：切换到英文后 #history-status 可见全文严格等于英文指引全文', async () => {
  const page = createPage(jsonResponder({items: []}));
  page.byId('screenshots-tab').click();
  await waitFor(() => page.state.consumed >= 1, '空历史响应未被真实脚本消费');
  await tick();
  page.byId('language-toggle').click();
  await tick();
  assert.equal(page.byId('history-status').textContent, GUIDE_EN);
  assert.equal(page.byId('history-status').children.length, 0);
});

test('AC-03 可见空历史在中英文之间往返切换，文本跟随当前语言且历史请求数不增加', async () => {
  const page = createPage(jsonResponder({items: []}));
  page.byId('screenshots-tab').click();
  await waitFor(() => page.state.consumed >= 1, '空历史响应未被真实脚本消费');
  await tick();
  const before = page.calls.length;
  for (const expected of [GUIDE_EN, GUIDE_ZH, GUIDE_EN, GUIDE_ZH]) {
    page.byId('language-toggle').click();
    await tick();
    assert.equal(page.byId('history-status').textContent, expected);
  }
  assert.equal(page.calls.length, before, '语言切换不得产生新的历史请求');
  assert.equal(listCalls(page).length, 1);
});

test('AC-04 历史请求未决时显示既有加载文案，中英文两条指引均不可见', async () => {
  const page = createPage(() => new Promise(() => {}));
  page.byId('screenshots-tab').click();
  await waitFor(() => page.calls.length >= 1, '历史读取请求未发出');
  await tick();
  assert.equal(page.byId('history-status').textContent, LOADING_ZH);
  let panelText = page.byId('screenshots-panel').textContent;
  assert.ok(!panelText.includes(GUIDE_ZH), '加载中不得出现中文指引');
  assert.ok(!panelText.includes(GUIDE_EN), '加载中不得出现英文指引');
  page.byId('language-toggle').click();
  await tick();
  assert.equal(page.byId('history-status').textContent, LOADING_EN);
  panelText = page.byId('screenshots-panel').textContent;
  assert.ok(!panelText.includes(GUIDE_ZH));
  assert.ok(!panelText.includes(GUIDE_EN));
  assert.equal(page.state.consumed, 0, '未决响应不得被标记为已消费');
});

test('AC-05 历史请求失败时维持既有错误提示与重试表现，两条指引均不可见', async () => {
  const page = createPage(jsonResponder({error: {code: 'STORAGE_FAILED'}}, 500));
  page.byId('screenshots-tab').click();
  await waitFor(() => page.state.consumed >= 1, '失败响应未被真实脚本消费');
  await tick();
  const status = page.byId('history-status');
  assert.equal(status.textContent, ERROR_ZH);
  assert.equal(page.byId('retry-history').hidden, false, '既有重试控件应可见');
  assert.ok(!status.textContent.includes(GUIDE_ZH));
  assert.ok(!status.textContent.includes(GUIDE_EN));
  const panelText = page.byId('screenshots-panel').textContent;
  assert.ok(!panelText.includes(GUIDE_ZH));
  assert.ok(!panelText.includes(GUIDE_EN));
  page.byId('language-toggle').click();
  await tick();
  assert.equal(page.byId('history-status').textContent, ERROR_EN);
  page.state.handler = jsonResponder({items: []});
  page.byId('retry-history').click();
  await waitFor(() => page.state.consumed >= 2, '重试后未重新读取历史');
  await tick();
  assert.equal(page.byId('history-status').textContent, GUIDE_EN, '重试成功后应回到当前语言的空历史指引');
  page.byId('language-toggle').click();
  await tick();
  assert.equal(page.byId('history-status').textContent, GUIDE_ZH, '恢复后的空历史指引随语言切换');
});

test('AC-06 读取到记录时渲染既有列表，#history-status 为空且两条指引均不可见', async () => {
  const page = createPage(jsonResponder({items: [RECORD]}));
  page.byId('screenshots-tab').click();
  await waitFor(() => page.state.consumed >= 1, '非空历史响应未被真实脚本消费');
  await tick();
  const list = page.byId('screenshots-list');
  assert.equal(list.children.length, 1);
  assert.equal(list.querySelector('img').getAttribute('src'), RECORD.url);
  assert.equal(page.byId('history-status').textContent, '');
  const panelText = page.byId('screenshots-panel').textContent;
  assert.ok(!panelText.includes(GUIDE_ZH));
  assert.ok(!panelText.includes(GUIDE_EN));
});

test('AC-07 面板控件与既有截图流程保持不变，指引为纯文本且不新增可点击控件', async () => {
  const page = createPage(async (url, options, state) => {
    if (url === '/api/session') return jsonResponder({csrfToken: 'independent-session'})(url, options, state);
    if (options.method === 'POST') return jsonResponder({cancelled: true})(url, options, state);
    return jsonResponder({items: []})(url, options, state);
  });
  page.byId('screenshots-tab').click();
  await waitFor(() => page.state.consumed >= 1, '空历史响应未被真实脚本消费');
  await tick();
  const panel = page.byId('screenshots-panel');
  assert.deepEqual(panel.querySelectorAll('button').map(button => button.id).sort(),
    ['capture-screenshot', 'reload-screenshots', 'retry-history'], '面板内可点击控件集合必须与冻结页面一致');
  assert.equal(page.byId('capture-screenshot').textContent, CAPTURE_ZH);
  page.byId('language-toggle').click();
  await tick();
  assert.equal(page.byId('capture-screenshot').textContent, CAPTURE_EN);
  assert.equal(page.byId('history-status').textContent, GUIDE_EN);
  assert.equal(page.byId('history-status').children.length, 0);
  const writes = page.calls.filter(call => call.method === 'POST');
  page.byId('capture-screenshot').click();
  await waitFor(() => page.calls.some(call => call.method === 'POST'), '既有截图写请求未发出');
  await tick();
  const after = page.calls.filter(call => call.method === 'POST');
  assert.equal(after.length, 1, '既有截图流程必须只发出一次写请求');
  assert.equal(after[0].url, '/api/screenshots');
  assert.equal(after[0].headers['X-CSRF-Token'], 'independent-session');
  assert.match(JSON.parse(after[0].body).requestId, /^[0-9a-f-]{36}$/i);
  assert.equal(writes.length, 0);
});

test('AC-08 空与非空历史的读取次数、路径与请求选项与基线一致，空态与切换不产生额外请求', async () => {
  const empty = createPage(jsonResponder({items: []}));
  empty.byId('screenshots-tab').click();
  await waitFor(() => empty.state.consumed >= 1, '空历史响应未被真实脚本消费');
  await tick();
  assert.equal(listCalls(empty).length, 1);
  assert.equal(empty.calls.length, 1, '空历史下除历史读取外不得有其它请求');
  assert.equal(listCalls(empty)[0].method, 'GET');
  assert.equal(listCalls(empty)[0].credentials, 'same-origin');
  const before = empty.calls.length;
  empty.byId('language-toggle').click();
  empty.byId('language-toggle').click();
  await tick();
  assert.equal(empty.calls.length, before, '语言切换不得产生额外请求');
  empty.byId('welcome-tab').click();
  empty.byId('screenshots-tab').click();
  await tick();
  assert.equal(empty.calls.length, before, '面板往返不得强制重读已加载历史');
  assert.equal(listCalls(empty).length, 1);

  const filled = createPage(jsonResponder({items: [RECORD]}));
  filled.byId('screenshots-tab').click();
  await waitFor(() => filled.state.consumed >= 1, '非空历史响应未被真实脚本消费');
  await tick();
  assert.equal(listCalls(filled).length, 1);
  assert.equal(filled.calls.length, 1);
  assert.equal(listCalls(filled)[0].method, 'GET');
  assert.equal(listCalls(filled)[0].credentials, 'same-origin');
  assert.equal(listCalls(filled)[0].url, listCalls(empty)[0].url, '空与非空历史必须使用同一路径');
});

test.after(() => {
  console.log(`independent assertions source: ${SOURCE_FILE}`);
  console.log(`independent assertions sha256(public/screenshots.js)=${digest(SOURCE_FILE)}`);
  console.log(`independent assertions sha256(index.html)=${digest(PAGE_FILE)}`);
});
