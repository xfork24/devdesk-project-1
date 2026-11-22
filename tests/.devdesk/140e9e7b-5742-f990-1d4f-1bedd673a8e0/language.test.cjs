'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = path.resolve(__dirname, '../../..', 'index.html');
assert.ok(fs.existsSync(source), 'actual index.html exists at the resolved project root');
const html = fs.readFileSync(source, 'utf8');

// A dependency-free DOM adapter executes every actual inline script together.
function open() {
  const all = [], pending = [];
  let document;
  class Node {
    constructor(tag, attrs = {}, text = '') { this.tagName = tag.toUpperCase(); this.attrs = attrs; this.children = []; this.parentNode = null; this.data = text; this.style = {}; this.listeners = {}; this.hidden = 'hidden' in attrs; }
    get textContent() { return this.data + this.children.map(n => n.textContent).join(''); }
    set textContent(v) { this.data = String(v); this.children = []; }
    get childNodes() { return this.children; }
    get parentElement() { return this.parentNode; }
    get id() { return this.attrs.id; }
    get lang() { return this.attrs.lang; } set lang(v) { this.attrs.lang = v; }
    get title() { return this.attrs.title; } set title(v) { this.attrs.title = v; }
    get classList() { return {toggle: (c,v) => { const s = new Set((this.attrs.class || '').split(/\s+/)); const on = v === undefined ? !s.has(c) : v; on ? s.add(c) : s.delete(c); this.attrs.class = [...s].join(' '); }, contains: c => (this.attrs.class || '').split(/\s+/).includes(c)}; }
    setAttribute(k,v) { this.attrs[k] = String(v); } getAttribute(k) { return this.attrs[k] ?? null; }
    removeAttribute(k) { delete this.attrs[k]; }
    appendChild(n) { n.parentNode = this; this.children.push(n); return n; }
    append(...ns) { ns.forEach(n => this.appendChild(typeof n === 'string' ? new Node('#text',{},n) : n)); }
    replaceChildren(...ns) { this.data = ''; this.children = []; this.append(...ns); }
    matches(s) { return s.startsWith('#') ? this.id === s.slice(1) : s.startsWith('.') ? this.classList.contains(s.slice(1)) : this.tagName.toLowerCase() === s.toLowerCase(); }
    querySelectorAll(s) { const parts = s.trim().split(/\s+/); let roots = [this]; for (const part of parts) { roots = roots.flatMap(r => { const out = []; function visit(n) { for (const c of n.children) { if (c.matches(part)) out.push(c); visit(c); } } visit(r); return out; }); } return roots; }
    querySelector(s) { return this.querySelectorAll(s)[0] || null; }
    closest(s) { return this.matches(s) ? this : this.parentNode?.closest(s); }
    addEventListener(k,fn) { (this.listeners[k] ||= []).push(fn); }
    click() { for (const fn of this.listeners.click || []) fn({target:this, preventDefault(){}}); }
    focus() { document.activeElement = this; }
  }
  const root = new Node('root'), stack = [root];
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
  for (const m of markup.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/([\w-]+)\s*>|<([\w-]+)\b([^>]*)>|([^<]+)/g)) {
    if (m[1]) { if (stack.at(-1).tagName === m[1].toUpperCase()) stack.pop(); }
    else if (m[2]) { const attrs = {}; for (const a of m[3].matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[a[1]] = a[2] ?? a[3] ?? a[4] ?? ''; const n = new Node(m[2],attrs); all.push(n); stack.at(-1).appendChild(n); if (!/^(img|meta|link|br|input|hr)$/i.test(m[2])) stack.push(n); }
    else if (m[4]) stack.at(-1).appendChild(new Node('#text',{},m[4]));
  }
  document = {getElementById: id => all.find(n => n.id === id), querySelector: s => root.querySelector(s), querySelectorAll: s => root.querySelectorAll(s), createElement: t => new Node(t), createTextNode: t => new Node('#text',{},t), activeElement:null};
  document.body = root.querySelector('body'); document.documentElement = root.querySelector('html');
  Object.defineProperty(document,'title',{get: () => root.querySelector('title').textContent, set: v => { root.querySelector('title').textContent = v; }});
  const window = {scrollX:0, scrollY:123, scrollTo(p,y) { this.scrollY = typeof p === 'object' ? p.top : y; }};
  class Image { constructor() { pending.push(this); } }
  const context = vm.createContext({document,window,Image,console});
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) vm.runInContext(script[1],context,{timeout:1000});
  return {document,window,pending,get: id => document.getElementById(id),toggle() { this.get('language-toggle').click(); }};
}
const han = /[\u3400-\u9fff]/;
function english(text, pattern) { assert.ok(text.trim(), 'English text is nonempty'); assert.doesNotMatch(text,han); assert.doesNotMatch(text,/undefined|\[object Object\]|NaN/); assert.match(text,pattern); }
function check(p,en,phase='loading',index=1,expanded=false) {
  const d=p.document, g=p.get('gallery'), b=p.get('language-toggle');
  assert.equal(b.textContent,en?'中文':'English');
  assert.equal(b.getAttribute('title'),en?'Switch to Chinese (Simplified)':'切换到英文');
  assert.equal(b.getAttribute('lang'),en?'zh':'en');
  assert.match(d.documentElement.lang,en?/^en(?:-|$)/:/^zh(?:-|$)/);
  const title=d.title, heading=d.querySelector('h1').textContent;
  if(en) { english(title,/welcome/i); english(heading,/welcome/i); english(g.getAttribute('aria-label'),/nature|landscape|scenery|photo|image|gallery/i); english(p.get('gallery-prev').textContent,/prev|back/i); english(p.get('gallery-next').textContent,/next/i); }
  else { assert.equal(title,'欢迎来到这里'); assert.equal(heading,'欢迎来到这里'); assert.equal(g.getAttribute('aria-label'),'自然风景图片窗'); assert.equal(p.get('gallery-prev').textContent,'上一张'); assert.equal(p.get('gallery-next').textContent,'下一张'); }
  const link=g.querySelector('a'); assert.equal(link.textContent,'Pexels'); assert.equal(link.getAttribute('href'),'https://www.pexels.com/zh-cn/');
  if(en) english(link.parentNode.textContent,/click.*(?:enlarge|expand|zoom)|(?:enlarge|expand|zoom).*click/i);
  else { assert.match(link.parentNode.textContent,/图片来自/); assert.match(link.parentNode.textContent,/点击图片放大或还原/); }
  const label=p.get('gallery-trigger').getAttribute('aria-label');
  if(en) english(label,expanded?/restore|reduce|exit|shrink|collapse|zoom out/i:/enlarge|expand|zoom/i);
  else assert.equal(label,expanded?'还原图片':'放大图片，再次点击还原');
  const alt=p.get('gallery-image').alt;
  if(en) english(alt,[/lake|mountain|tree/i,/forest|path|walk/i,/snow|mountain|cloud/i,/snow|peak|mountain/i,/dusk|twilight|mountain|dawn/i][index-1]);
  else assert.equal(alt,['湖水倒映着群山和树林','行人走在绿色森林的小径中','云雾环绕的雪山','白雪覆盖的山峰','暮光中的层叠山峦'][index-1]);
  const status=p.get('gallery-status').textContent;
  assert.match(status,new RegExp(`${index}\\s*/\\s*5`));
  if(en) english(status,phase==='loading'?/load/i:phase==='error'?/fail|error|unable/i:/James Wheeler|Luis del Río|eberhard grossgasteiger|Stephan Seeber/);
  else assert.match(status,phase==='loading'?/正在加载/:phase==='error'?/加载失败.*切换.*重试/:/James Wheeler|Luis del Río|eberhard grossgasteiger|Stephan Seeber/);
  if(phase==='error'&&en) assert.match(status,/retry|try again/i);
}
test('AC-1/3 whole-page bidirectional switch, parity, state and refresh',()=>{
  const p=open(); check(p,false);
  const button=p.get('language-toggle'); button.focus();
  const src=p.get('gallery-image').src, count=p.pending.length;
  for(let i=1;i<=49;i++) { p.toggle(); check(p,i%2===1); assert.equal(p.get('language-toggle'),button); assert.equal(p.document.activeElement,button); assert.equal(p.window.scrollY,123); assert.equal(p.pending.length,count); assert.equal(p.get('gallery-image').src,src); }
  assert.equal(button.listeners.click.length,1); check(open(),false);
});
test('AC-2 all five photos and current-language load success',()=>{
  const p=open();
  for(let i=1;i<=5;i++) { check(p,false,'loading',i); p.toggle(); check(p,true,'loading',i); p.pending.at(-1).onload(); check(p,true,'ready',i); assert.equal(p.get('gallery-image').hidden,false); p.toggle(); check(p,false,'ready',i); p.get('gallery-next').click(); }
});
test('AC-2 expanded language switch, current failure recovery and retry',()=>{
  const p=open(), trigger=p.get('gallery-trigger'), prev=p.get('gallery-prev');
  p.document.body.style.overflow='auto'; prev.focus(); trigger.click(); p.toggle(); check(p,true,'loading',1,true);
  assert.equal(trigger.getAttribute('aria-expanded'),'true'); assert.equal(p.document.body.style.overflow,'hidden'); assert.equal(p.document.activeElement,prev); assert.equal(p.pending.length,1);
  p.window.scrollY=0; p.pending[0].onerror(); check(p,true,'error');
  assert.equal(trigger.getAttribute('aria-expanded'),'false'); assert.equal(p.document.body.style.overflow,'auto'); assert.equal(p.document.activeElement,prev); assert.equal(p.window.scrollY,123); assert.equal(p.get('gallery-image').hidden,true);
  p.toggle(); check(p,false,'error'); p.get('gallery-next').click(); p.toggle(); p.pending.at(-1).onload(); check(p,true,'ready',2);
  trigger.click(); check(p,true,'ready',2,true); p.toggle(); check(p,false,'ready',2,true); trigger.click(); check(p,false,'ready',2);
});
test('AC-2 stale success/error cannot alter language, request or expansion',()=>{
  const p=open(), stale=p.pending[0]; p.get('gallery-next').click(); p.toggle(); p.get('gallery-trigger').click();
  const before=p.get('gallery-status').textContent; stale.onload(); stale.onerror(); assert.equal(p.get('gallery-status').textContent,before); check(p,true,'loading',2,true); assert.equal(p.get('gallery-trigger').getAttribute('aria-expanded'),'true');
  p.pending.at(-1).onload(); check(p,true,'ready',2,true); stale.onerror(); check(p,true,'ready',2,true); assert.equal(p.get('gallery-image').hidden,false);
});
