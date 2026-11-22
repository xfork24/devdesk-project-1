'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
function open(missing, execute = true) {
  const nodes = new Map(), allNodes = [], pending = [];
  const document = {body: {style: {}}, documentElement: {}, activeElement: null,
    createElement() {}, getElementById: id => id === missing ? null : nodes.get(id),
    querySelector: tag => allNodes.find(n => n.tag === tag)};
  for (const m of html.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi)) {
    const attrs = Object.fromEntries([...m[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], a[2]]));
    const listeners = [], classes = new Set();
    const node = {tag: m[1], textContent: html.slice(m.index + m[0].length).split('<')[0], attrs, attributes: attrs, listeners, style: {}, hidden: /\bhidden\b/.test(m[2]),
      setAttribute(k,v) { attrs[k] = v; },
      classList: {toggle(c,v) { v ? classes.add(c) : classes.delete(c); }},
      addEventListener(type, fn) { listeners.push({type, fn, callback: fn}); },
      focus() { document.activeElement = this; },
      closest() { return document.getElementById('gallery-trigger'); },
      click() { for (const event of listeners) if (event.type === 'click') event.fn(); }};
    allNodes.push(node);
    if (attrs.id) nodes.set(attrs.id, node);
  }
  document.body = {...allNodes.find(n => n.tag === 'body'), style: {}};
  document.documentElement = allNodes.find(n => n.tag === 'html');
  const window = {scrollX: 0, scrollY: 123, scrollTo(p) { this.scrollY = p.top; }};
  class Image { constructor() { pending.push(this); } }
  if (execute) for (const s of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) vm.runInNewContext(s[1], {document, window, Image}, {timeout: 1000});
  nodes.allNodes = allNodes;
  return {nodes, get: id => nodes.get(id), pending, window, document, listeners: nodes.get('language-toggle').listeners};
}
module.exports = {open, html};

// The frozen language entries load this helper; register formal integration once.
if (process.env.NODE_TEST_CONTEXT) require('./screenshots-integration.test.cjs');
