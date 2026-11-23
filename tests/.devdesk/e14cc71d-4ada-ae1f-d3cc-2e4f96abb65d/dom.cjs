'use strict';
// Built-in-only event/DOM fixture. Geometry is supplied by tests, not a browser claim.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
class Element {
  constructor(tag, document) {
    this.tagName = tag.toUpperCase(); this.document = document; this.children = [];
    this.attributes = {}; this.style = {overflow:''}; this.listeners = new Map();
    this.hidden = false; this.textContent = ''; this.classes = new Set();
    this.classList = {add:(...cs)=>cs.forEach(c=>this.classes.add(c)), remove:(...cs)=>cs.forEach(c=>this.classes.delete(c)), contains:c=>this.classes.has(c), toggle:(c,v)=>{v ??= !this.classes.has(c); v?this.classes.add(c):this.classes.delete(c); return v;}};
  }
  set className(v) { this.classes = new Set(v.split(/\s+/)); }
  get className() { return [...this.classes].join(' '); }
  set id(v) { this.setAttribute('id',v); }
  get id() { return this.getAttribute('id') || ''; }
  set src(v) { this.setAttribute('src',v); }
  get src() { return this.getAttribute('src') || ''; }
  setAttribute(k,v) { this.attributes[k]=String(v); if(k==='class') this.className=v; }
  getAttribute(k) { return this.attributes[k] ?? null; }
  removeAttribute(k) { delete this.attributes[k]; }
  get isConnected() { return this===this.document.documentElement || !!this.parentElement?.isConnected; }
  get parentNode() { return this.parentElement; }
  append(...nodes) { for(const n of nodes) this.insertBefore(n,null); }
  appendChild(n) { this.append(n); return n; }
  insertBefore(n,before) { n.remove(); const i=before?this.children.indexOf(before):-1; this.children.splice(i<0?this.children.length:i,0,n); n.parentElement=this; return n; }
  remove() { if(this.parentElement) { const a=this.parentElement.children; a.splice(a.indexOf(this),1); this.parentElement=null; } }
  contains(n) { return n===this || this.children.some(c=>c.contains(n)); }
  matches(s) { return s[0]==='.'?this.classes.has(s.slice(1)):s[0]==='#'?this.id===s.slice(1):s==='[role="tablist"]'?this.getAttribute('role')==='tablist':this.tagName.toLowerCase()===s; }
  querySelectorAll(s) { return this.children.flatMap(c=>[...(c.matches(s)?[c]:[]),...c.querySelectorAll(s)]); }
  querySelector(s) { return this.querySelectorAll(s)[0] || null; }
  closest(s) { return this.matches(s)?this:this.parentElement?.closest(s)||null; }
  addEventListener(type,fn) { const a=this.listeners.get(type)||[]; a.push(fn); this.listeners.set(type,a); }
  dispatchEvent(e) { e.target??=this; e.currentTarget=this; for(const fn of this.listeners.get(e.type)||[]) fn(e); if(e.bubbles && !e.stopped) this.parentElement?.dispatchEvent(e); return !e.defaultPrevented; }
  click() { this.dispatchEvent({type:'click',bubbles:true}); }
  focus(options) { this.document.activeElement=this; this.focusOptions=options; }
  getBoundingClientRect() {
    // Expanded button rect is deliberately unrelated to its figure's grid slot.
    if(this.getAttribute('aria-expanded')==='true') return {x:0,y:0,left:0,top:0,width:1200,height:800,right:1200,bottom:800};
    const r=this.rect || this.parentElement?.rect || {left:0,top:0,width:100,height:80};
    return {...r,x:r.left,y:r.top,right:r.left+r.width,bottom:r.top+r.height};
  }
  get offsetWidth() { return this.getBoundingClientRect().width; }
  get offsetHeight() { return this.getBoundingClientRect().height; }
}
function open({photoCount}={}) {
  const document={activeElement:null};
  document.createElement=tag=>new Element(tag,document);
  const outer=document.createElement('document'); document.documentElement=null;
  const stack=[outer];
  const markup=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
  for(const m of markup.matchAll(/<\/?([\w-]+)\b([^>]*)>/g)) {
    if(m[0][1]==='/') { if(stack.length>1) stack.pop(); continue; }
    const n=document.createElement(m[1]);
    for(const a of m[2].matchAll(/([\w-]+)="([^"]*)"/g)) n.setAttribute(a[1],a[2]);
    n.hidden=/\bhidden\b/.test(m[2]); stack.at(-1).append(n);
    if(m[1]==='html') document.documentElement=n;
    if(m[1]==='body') document.body=n;
    if(!['meta','link','img','input','br','hr'].includes(m[1])) stack.push(n);
  }
  document.querySelector=s=>document.documentElement.matches(s)?document.documentElement:document.documentElement.querySelector(s);
  document.querySelectorAll=s=>document.documentElement.querySelectorAll(s);
  document.getElementById=id=>document.querySelector('#'+id);
  document.activeElement=document.body;
  const pending=[], calls=[];
  const window={scrollX:7,scrollY:123,scrollTo(p){this.scrollX=p.left;this.scrollY=p.top;calls.push(p);},crypto:require('node:crypto').webcrypto};
  const state={items:[]};
  const context=vm.createContext({document,window,Image:class {constructor(){pending.push(this);}},AbortController,setTimeout,clearTimeout,
    fetch:async()=>({ok:true,status:200,json:async()=>({items:state.items})}),getComputedStyle:n=>n.style});
  for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    let source=m[1].includes('src=')?fs.readFileSync(path.join(root,'public/screenshots.js'),'utf8'):m[2];
    if(photoCount!==undefined && source.includes('const photos = [')) {
      // Only replace input data. Empty fixtures omit initial paint, which requires a photo;
      // all production key handlers and navigation functions execute without alteration.
      source=source.replace(/const photos = (\[[\s\S]*?\n\]);/,(_,data)=>'const photos = '+JSON.stringify(JSON.parse(data).slice(0,photoCount))+';');
      if(photoCount===0) source=source.replace(/\n      show\(\);\s*\n    \}\)\(\);/,'\n    })();');
    }
    vm.runInContext(source,context,{timeout:1000});
  }
  const get=id=>document.getElementById(id);
  return {document,window,get,pending,calls,state,load:()=>pending.at(-1)?.onload?.()};
}
function key(node,value) {
  const e={type:'keydown',key:value,bubbles:true,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;}};
  node.dispatchEvent(e); return e;
}
async function screenshots(count=5) {
  const p=open();
  p.state.items=Array.from({length:count},(_,i)=>{const id=String(i+1).padStart(8,'0')+'-1111-4111-8111-111111111111';return {id,createdAt:`2026-11-${String(20-i).padStart(2,'0')}T00:00:00.000Z`,width:800,height:600,url:`/api/screenshots/${id}/image`};});
  p.get('screenshots-tab').click();
  for(let i=0;i<20 && p.get('reload-screenshots').disabled;i++) await new Promise(r=>setImmediate(r));
  if(p.get('reload-screenshots').disabled) throw new Error('fixture startup: history did not settle');
  p.cards=()=>p.get('screenshots-list').children;
  p.buttons=()=>p.cards().map(c=>c.querySelector('button'));
  p.layout=columns=>p.cards().forEach((c,i)=>{c.rect={left:(i%columns)*230,top:Math.floor(i/columns)*180,width:210,height:160};});
  p.layout(3); return p;
}
module.exports={open,key,screenshots,root};
