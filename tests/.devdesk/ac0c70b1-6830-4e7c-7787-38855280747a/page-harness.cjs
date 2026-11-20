'use strict';
// Dependency-free DOM event harness. Geometry and native keyboard activation are
// deliberately delegated to the maintained browser acceptance entry point.
const vm = require('node:vm');
function open(html, missing) {
  const nodes = [], images = [];
  let document;
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase(); this.attrs = {}; this.children = [];
      this.parentNode = null; this.listeners = {}; this.style = {
        setProperty(k, v) { this[k] = String(v); }, removeProperty(k) { delete this[k]; }
      };
      this.dataset = {}; this.textContent = ''; this.hidden = false;
      this.disabled = false; this.complete = false; this.naturalWidth = 0;
      this.classList = {
        contains: c => this.className.split(/\s+/).includes(c),
        add: (...cs) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...cs])].join(' '); },
        remove: (...cs) => { this.className = this.className.split(/\s+/).filter(c => !cs.includes(c)).join(' '); },
        toggle: (c, force) => { const yes = force === undefined ? !this.classList.contains(c) : force; this.classList[yes ? 'add' : 'remove'](c); return yes; }
      };
    }
    get id() { return this.attrs.id || ''; }
    set id(v) { this.attrs.id = String(v); }
    get className() { return this.attrs.class || ''; }
    set className(v) { this.attrs.class = v; }
    get src() { return this.attrs.src || ''; }
    set src(v) { this.attrs.src = String(v); }
    get currentSrc() { return this.src; }
    get alt() { return this.attrs.alt || ''; }
    set alt(v) { this.attrs.alt = String(v); }
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'hidden') this.hidden = true; if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    removeAttribute(k) { delete this.attrs[k]; if (k === 'hidden') this.hidden = false; }
    hasAttribute(k) { return k in this.attrs; }
    addEventListener(type, fn, options) { (this.listeners[type] ||= []).push({fn, once: !!options?.once}); }
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(x => x.fn !== fn); }
    dispatchEvent(e) {
      e.target ||= this; e.currentTarget = this;
      e.preventDefault ||= () => {}; e.stopPropagation ||= () => { e.stopped = true; };
      for (const entry of [...(this.listeners[e.type] || [])]) { entry.fn.call(this, e); if (entry.once) this.removeEventListener(e.type, entry.fn); }
      this['on' + e.type]?.call(this, e);
      if (e.bubbles && !e.stopped) this.parentNode?.dispatchEvent(e);
      return true;
    }
    click() { if (!this.disabled) this.dispatchEvent({type: 'click', bubbles: true}); }
    focus() { document.activeElement = this; }
    appendChild(n) { n.parentNode = this; this.children.push(n); return n; }
    append(...ns) { ns.forEach(n => this.appendChild(n)); }
    insertBefore(n, ref) { n.parentNode = this; const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, n); return n; }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(n => n !== this); this.parentNode = null; }
    get parentElement() { return this.parentNode; }
    get nextSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] || null; }
    matches(s) { return s.startsWith('#') ? this.id === s.slice(1) : s.startsWith('.') ? this.classList.contains(s.slice(1)) : this.tagName.toLowerCase() === s.toLowerCase(); }
    closest(s) { return this.matches(s) ? this : this.parentNode?.closest(s) || null; }
    querySelector(s) { return this.querySelectorAll(s)[0] || null; }
    querySelectorAll(s) { return this.children.flatMap(n => [...(n.matches(s) ? [n] : []), ...n.querySelectorAll(s)]); }
    getBoundingClientRect() { return {x: 0, y: 0, top: 0, left: 0, width: 720, height: 360, right: 720, bottom: 360}; }
    get offsetWidth() { return 720; } get offsetHeight() { return 360; }
  }
  const root = new Element('document'), stack = [root];
  for (const m of html.matchAll(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<\/([\w-]+)\s*>|<([\w-]+)\b([^>]*)>|([^<]+)/gi)) {
    if (m[1]) { if (stack.length > 1) stack.pop(); }
    else if (m[2]) {
      const n = new Element(m[2]);
      for (const a of m[3].matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) n.setAttribute(a[1], a[2] ?? a[3] ?? a[4] ?? '');
      nodes.push(n); stack.at(-1).appendChild(n);
      if (!/^(img|input|meta|link|br|hr|source)$/i.test(m[2])) stack.push(n);
    } else if (m[4]) stack.at(-1).textContent += m[4];
  }
  document = {
    getElementById: id => id === missing ? null : nodes.find(n => n.id === id) || null,
    querySelector: s => s.startsWith('#') ? document.getElementById(s.slice(1)) : root.querySelector(s),
    querySelectorAll: s => root.querySelectorAll(s),
    createElement: tag => { const n = new Element(tag); nodes.push(n); return n; },
    body: nodes.find(n => n.tagName === 'BODY'), documentElement: nodes.find(n => n.tagName === 'HTML'),
    addEventListener() {}, activeElement: null
  };
  class Image extends Element { constructor() { super('img'); images.push(this); } }
  const window = {document, scrollX: 0, scrollY: 100, innerWidth: 1280, innerHeight: 720,
    scrollTo(x, y) { this.scrollX = typeof x === 'object' ? x.left : x; this.scrollY = typeof x === 'object' ? x.top : y; }, addEventListener() {}};
  const context = vm.createContext({document, window, Image, console, URL, setTimeout, clearTimeout,
    requestAnimationFrame: fn => fn(), getComputedStyle: n => n.style});
  for (const s of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) vm.runInContext(s[1], context, {timeout: 1000});
  const get = id => document.getElementById(id);
  const captureCurrent = () => {
    const targets = [get('gallery-image'), ...images.filter(n => n.src === get('gallery-image')?.src)].filter(Boolean);
    const captured = targets.map(n => ({n, listeners: Object.fromEntries(['load', 'error'].map(t => [t, [...(n.listeners[t] || [])].map(e => e.fn)])), load: n.onload, error: n.onerror}));
    return type => { for (const c of captured) { const e = {type, target: c.n, currentTarget: c.n}; c.listeners[type].forEach(fn => fn.call(c.n, e)); c[type]?.call(c.n, e); } };
  };
  return {get, captureCurrent, loadCurrent(type) {
    const img = get('gallery-image');
    for (const n of [img, ...images.filter(n => n.src === img?.src)].filter(Boolean)) {
      n.complete = true; n.naturalWidth = type === 'load' ? 1200 : 0;
      n.dispatchEvent({type});
    }
  }};
}
module.exports = {open};
