'use strict';
// Minimal DOM for application state assertions, not browser layout or browser security.
const vm = require('node:vm');
const {randomUUID} = require('node:crypto');
const assert = require('node:assert/strict');
async function open(base) {
  const response = await fetch(base, {signal:AbortSignal.timeout(2000)});
  assert.equal(response.status,200);
  const html = await response.text(), cookie = response.headers.getSetCookie()[0]?.split(';')[0];
  const nodes = [], ids = new Map(), timers = new Set(), pending = new Set(), calls = [];
  const document = {activeElement:null};
  class Node {
    constructor(tag,attrs={}) {this.tag=tag;this.attrs=attrs;this.children=[];this.style={overflow:''};this.listeners={};this.hidden=false;this.disabled=false;nodes.push(this);this.classList={toggle:()=>{}};}
    get id(){return this.attrs.id;} get content(){return this.attrs.content;}
    get isConnected(){return true;}
    set src(v){this.attrs.src=v;} get src(){return this.attrs.src;}
    setAttribute(k,v){this.attrs[k]=String(v);} getAttribute(k){return this.attrs[k]??null;}
    addEventListener(k,f){(this.listeners[k]??=[]).push(f);}
    click(){if(!this.disabled)for(const f of this.listeners.click||[])f({});}
    focus(){document.activeElement=this;}
    closest(s){for(let n=this;n;n=n.parent)if(matches(n,s))return n;return null;}
    append(...children){for(const c of children)this.insertBefore(c,null);}
    insertBefore(c,b){c.remove();const i=b?this.children.indexOf(b):-1;this.children.splice(i<0?this.children.length:i,0,c);c.parent=this;}
    remove(){if(this.parent){const a=this.parent.children;a.splice(a.indexOf(this),1);this.parent=null;}}
    contains(n){return this===n||this.children.some(c=>c.contains(n));}
    querySelector(s){return this.children.flatMap(c=>[c,...c.descendants()]).find(c=>matches(c,s));}
    descendants(){return this.children.flatMap(c=>[c,...c.descendants()]);}
  }
  const matches=(n,s)=>s.startsWith('.')?n.className===s.slice(1):s.startsWith('[role=')?n.attrs.role===s.match(/"(.*?)"/)[1]:s.startsWith('meta[')?n.tag==='meta'&&n.attrs.name==='csrf-token':n.tag===s;
  const stack=[];
  for(const m of html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').matchAll(/<(\/?)([a-z][\w:-]*)\b([^>]*)>/gi)) {
    if(m[1]){while(stack.length){if(stack.pop().tag===m[2])break;}continue;}
    const attrs=Object.fromEntries([...m[3].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]]));
    const n=new Node(m[2],attrs);n.hidden=/\bhidden\b/.test(m[3]);if(n.id)ids.set(n.id,n);stack.at(-1)?.append(n);
    if(!['meta','img','link','input','br','hr'].includes(n.tag))stack.push(n);
  }
  document.body=nodes.find(n=>n.tag==='body');document.documentElement=nodes.find(n=>n.tag==='html');
  document.getElementById=id=>ids.get(id);document.querySelector=s=>nodes.find(n=>matches(n,s));document.createElement=tag=>new Node(tag);
  const window={crypto:{randomUUID},scrollX:0,scrollY:95,scrollTo(p){this.scrollX=p.left;this.scrollY=p.top;}};
  const request=(url,opts={})=>{
    calls.push({url,...opts});const p=fetch(new URL(url,base),{...opts,signal:AbortSignal.timeout(2000),headers:{...opts.headers,Origin:base,Cookie:cookie||''}});
    pending.add(p);p.then(()=>pending.delete(p),()=>pending.delete(p));return p;
  };
  const context=vm.createContext({document,window,fetch:request,AbortController,Image:class{set src(v){queueMicrotask(()=>this.onload?.());}},
    setTimeout(fn,ms){const id=setTimeout(()=>{timers.delete(id);fn();},ms);timers.add(id);return id;},clearTimeout(id){timers.delete(id);clearTimeout(id);}});
  try {
    for(const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      const src=script[1].match(/src="([^"]+)"/);let code=script[2];
      if(src){const r=await request(src[1]);assert.equal(r.status,200);code=await r.text();}
      vm.runInContext(code,context,{timeout:1000});
    }
  } catch(e){for(const id of timers)clearTimeout(id);throw e;}
  const $=id=>ids.get(id);
  return {window,document,$,calls,click:id=>$(id).click(),cards:()=>$('screenshots-list').children,
    close:async()=>{for(const id of timers)clearTimeout(id);await Promise.allSettled([...pending]);}};
}
module.exports={open};
