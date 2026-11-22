'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM, ResourceLoader, VirtualConsole} = require(path.join(process.env.DEVDESK_RUNTIME_DIR || '/tmp/devdesk-runtime', 'node/node_modules/jsdom'));
const ROOT = path.resolve(__dirname, '../../..');
const A = {id:'11111111-1111-4111-8111-111111111111',createdAt:'2026-11-21T01:00:00.000Z',width:800,height:600,url:'/api/screenshots/11111111-1111-4111-8111-111111111111/image'};
const B = {id:'22222222-2222-4222-8222-222222222222',createdAt:'2026-11-22T01:00:00.000Z',width:640,height:480,url:'/api/screenshots/22222222-2222-4222-8222-222222222222/image'};
const delay = () => new Promise(r => setTimeout(r, 10));
const deferred = () => { let resolve; const promise = new Promise(r => resolve=r); return {promise,resolve}; };
async function until(fn, message) { for(let i=0;i<100;i++) { if(fn()) return; await delay(); } assert.fail(message); }
function response(status, body) { return {ok:status>=200&&status<300,status,headers:new Headers({'content-type':'application/json'}),json:async()=>body,text:async()=>JSON.stringify(body)}; }
async function open(t, initial = [], setup = {}) {
  const state = {items:initial, calls:[], errors:[], list: null, post:null, del:null, images:[], ...setup};
  class LocalResources extends ResourceLoader {
    fetch(url) {
      const u = new URL(url);
      if(u.origin !== 'http://localhost') return null;
      const target = path.resolve(ROOT, '.'+decodeURIComponent(u.pathname));
      assert.ok(target.startsWith(ROOT+path.sep), 'resource stays in project');
      if(!fs.existsSync(target)) { state.errors.push(new Error('missing page resource: '+u.pathname)); return null; }
      return Promise.resolve(fs.readFileSync(target));
    }
  }
  const vc = new VirtualConsole(); vc.on('jsdomError', error=>state.errors.push(error));
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT,'index.html'),'utf8'), {
    url:'http://localhost/',runScripts:'dangerously',resources:new LocalResources(),virtualConsole:vc,pretendToBeVisual:true,
    beforeParse(w) {
      w.Headers=Headers; w.Request=Request; w.Response=Response;
      w.scrollTo = (x,y) => { w.scrollX=typeof x==='object'?x.left:x; w.scrollY=typeof x==='object'?x.top:y; };
      w.Image = class { constructor(){state.images.push(this);} set src(v){this._src=v; queueMicrotask(()=>this.onload?.());} get src(){return this._src;} };
      w.fetch = async (input, options={}) => {
        const url = new URL(typeof input==='string'?input:input.url,w.location.href);
        const method=(options.method||'GET').toUpperCase();
        const call={url:url.pathname,method,options}; state.calls.push(call);
        if(url.pathname==='/api/screenshots' && method==='GET') return state.list ? state.list(call) : response(200,{items:state.items});
        if(url.pathname==='/api/screenshots' && method==='POST') return state.post ? state.post(call) : response(201,{item:B});
        if(url.pathname.startsWith('/api/screenshots/') && method==='DELETE') return state.del ? state.del(call) : response(204,null);
        // Session bootstrap is outside the frozen API; permit token acquisition without testing its shape.
        return response(200,{token:'independent-token',csrfToken:'independent-token'});
      };
    }
  });
  t.after(()=>dom.window.close());
  await until(()=>dom.window.document.readyState==='complete','page must finish loading');
  assert.deepEqual(state.errors,[], 'script/resource failures are environment errors, not business Red');
  const d=dom.window.document;
  const visible=n=>!!n&&!n.closest('[hidden]')&&!n.closest('[aria-hidden="true"]');
  const buttons=()=>[...d.querySelectorAll('button,[role="tab"]')];
  function button(pattern, root=d) { const n=[...root.querySelectorAll('button,[role="tab"]')].find(n=>visible(n)&&pattern.test((n.getAttribute('aria-label')||n.textContent).trim())); assert.ok(n,'visible control '+pattern); return n; }
  const tab=kind=>button(kind==='screenshots'?/^(截图|Screenshots?)$/i:/^(欢迎|Welcome)$/i);
  const panel=()=> {const s=tab('screenshots'); const id=s.getAttribute('aria-controls'); return (id&&d.getElementById(id))||[...d.querySelectorAll('[role="tabpanel"]')].find(visible)||d.querySelector('main');};
  const pictures=()=>[...panel().querySelectorAll('img')].filter(n=>n.getAttribute('src')?.includes('/api/screenshots/'));
  const has=item=>pictures().some(n=>new URL(n.src).pathname===item.url);
  const text=()=>panel().textContent;
  async function screenshots() {tab('screenshots').click(); await delay();}
  const capture=()=>button(/截图|capture|take screenshot|screen capture/i,panel());
  function image(item){const n=pictures().find(n=>new URL(n.src).pathname===item.url); assert.ok(n,'record image '+item.id);return n;}
  function remove(item) {let n=image(item).parentElement; while(n&&n!==panel()) { const b=[...n.querySelectorAll('button')].find(b=>/删除|delete|remove/i.test(b.textContent+' '+b.getAttribute('aria-label'))); if(b)return b; n=n.parentElement;} assert.fail('record-specific delete control'); }
  return {dom,d,state,tab,panel,pictures,has,text,screenshots,capture,image,remove,button};
}
const posts=p=>p.state.calls.filter(c=>c.method==='POST'&&c.url==='/api/screenshots');

test('AC-01: tabs preserve welcome gallery and global language control',async t=>{
  const p=await open(t); const gallery=p.d.getElementById('gallery'); const trigger=p.d.getElementById('gallery-trigger');
  assert.ok(gallery); assert.ok(trigger); const language=p.d.getElementById('language-toggle');
  assert.ok(!language.closest('[role="tabpanel"]'),'language is outside tab panels');
  await p.screenshots(); p.tab('welcome').click();
  assert.strictEqual(p.d.getElementById('gallery'),gallery); assert.strictEqual(p.d.getElementById('gallery-trigger'),trigger);
  assert.match(p.d.querySelector('h1').textContent,/欢迎/);
  const src=p.d.getElementById('gallery-image').src; p.d.getElementById('gallery-next').click(); assert.notEqual(p.d.getElementById('gallery-image').src,src);
  trigger.click(); assert.equal(trigger.getAttribute('aria-expanded'),'true'); trigger.click();assert.equal(trigger.getAttribute('aria-expanded'),'false');
});

test('AC-03: history, duplicate IDs, tab return and fresh page reload',async t=>{
  const p=await open(t,[B,A,B]); await p.screenshots(); await until(()=>p.has(A)&&p.has(B),'all persisted records visible');
  assert.equal(p.pictures().length,2,'deduplicate by id'); p.tab('welcome').click(); await p.screenshots(); assert.equal(p.pictures().length,2);
  const q=await open(t,[B,A]); await q.screenshots(); await until(()=>q.has(A)&&q.has(B),'fresh page reloads API history');
  assert.ok(q.state.calls.some(c=>c.url==='/api/screenshots'&&c.method==='GET'));
});

test('AC-03: empty history, failed reload preserves records and retry recovers',async t=>{
  const empty=await open(t); await empty.screenshots(); assert.equal(empty.pictures().length,0); assert.match(empty.text(),/暂无|还没有|没有截图|无截图|no screenshots|empty/i);
  const p=await open(t,[A]); await p.screenshots();await until(()=>p.has(A),'initial history');
  p.state.list=()=>response(500,{error:{code:'STORAGE_FAILED'}});
  p.tab('welcome').click();await p.screenshots();
  // If history is cached on tab return, use the explicit reload action.
  if(!/失败|failed|error/i.test(p.text())) {p.button(/刷新|重新加载|reload|refresh/i,p.panel()).click();await delay();}
  await until(()=>/失败|failed|error/i.test(p.text()),'load failure feedback');assert.ok(p.has(A),'retain prior history');
  p.state.list=()=>response(200,{items:[B,A]});p.button(/重试|retry/i,p.panel()).click();await until(()=>p.has(B),'retry history');assert.ok(p.has(A));
});

test('AC-04: image zoom round trip and tab exit preserve records, scroll and focus',async t=>{
  const p=await open(t,[A,B]);await p.screenshots();await until(()=>p.has(A),'history loaded');
  const n=p.image(A), click=n.closest('button')||n;click.focus();p.dom.window.scrollTo(0,57);const before=p.d.body.style.overflow;
  click.click();assert.equal(p.d.body.style.overflow,'hidden','expanded locks scroll'); assert.ok(p.has(A)&&p.has(B));
  click.click();assert.equal(p.d.body.style.overflow,before);assert.equal(p.dom.window.scrollY,57);assert.strictEqual(p.d.activeElement,click);
  click.click();p.tab('welcome').click();assert.equal(p.d.body.style.overflow,before);await p.screenshots();assert.ok(p.has(A)&&p.has(B));assert.equal(posts(p).length,0);
});

test('AC-05-06-07-UI: directed delete failure retains image; success removes only target and exits zoom',async t=>{
  const p=await open(t,[B,A]);await p.screenshots();await until(()=>p.has(A),'history');
  p.state.del=()=>response(500,{error:{code:'STORAGE_FAILED'}});p.remove(A).click();await delay();assert.ok(p.has(A)&&p.has(B));assert.match(p.text(),/失败|failed|error/i);
  p.state.del=()=>response(204,null);const n=p.image(A);(n.closest('button')||n).click();p.remove(A).click();await until(()=>!p.has(A),'successful deletion removes target');assert.ok(p.has(B));assert.notEqual(p.d.body.style.overflow,'hidden');
  const calls=p.state.calls.filter(c=>c.method==='DELETE');assert.equal(calls.length,2);assert.ok(calls.every(c=>c.url==='/api/screenshots/'+A.id));assert.ok(p.d.activeElement?.isConnected);
});

test('AC-05-06-07-UI: pending capture prevents duplicate requests, cancellation adds nothing, success deduplicates',async t=>{
  const p=await open(t,[A]);await p.screenshots();await until(()=>p.has(A),'history');const hold=deferred();p.state.post=()=>hold.promise;
  const b=p.capture();b.click();b.click();await delay();assert.equal(posts(p).length,1);assert.ok(b.disabled||b.getAttribute('aria-disabled')==='true','capture disabled while pending');
  const payload=JSON.parse(posts(p)[0].options.body);assert.match(payload.requestId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  hold.resolve(response(200,{cancelled:true}));await delay();assert.equal(p.pictures().length,1);assert.ok(p.has(A));assert.match(p.text(),/取消|cancel/i);
  p.state.post=()=>response(201,{item:B});p.capture().click();await until(()=>p.has(B),'saved capture appears');assert.equal(p.pictures().length,2);
  p.capture().click();await delay();assert.equal(p.pictures().length,2,'same server id must not duplicate');
});

for(const code of ['INVALID_INPUT','FORBIDDEN','BUSY','UNSUPPORTED_PLATFORM','CAPTURE_TIMEOUT','CAPTURE_FAILED','STORAGE_FAILED']) {
  test('AC-05-06-07-UI: '+code+' is localized, retains history and permits retry',async t=>{
    const p=await open(t,[A]);await p.screenshots();await until(()=>p.has(A),'history');
    p.state.post=()=>response(({INVALID_INPUT:400,FORBIDDEN:403,BUSY:409,UNSUPPORTED_PLATFORM:501,CAPTURE_TIMEOUT:504})[code]||500,{error:{code}});
    p.capture().click();await delay();assert.ok(p.has(A));assert.equal(p.pictures().length,1);assert.match(p.text(),/[\u3400-\u9fff]/);
    const zh=p.text();p.d.getElementById('language-toggle').click();await delay();assert.notEqual(p.text(),zh);assert.doesNotMatch(p.text(),/[\u3400-\u9fff]|undefined/);assert.doesNotMatch(p.text(),new RegExp(code));
    const meaning={INVALID_INPUT:/invalid|request|input/i,FORBIDDEN:/permission|forbidden|access|allow|screen.*record/i,BUSY:/busy|progress|already|processing/i,UNSUPPORTED_PLATFORM:/macOS|Mac|unsupported|not supported/i,CAPTURE_TIMEOUT:/timed? ?out|timeout|too long/i,CAPTURE_FAILED:/failed|not complete|unable/i,STORAGE_FAILED:/sav|storage|disk|writ/i};
    assert.match(p.text(),meaning[code],'error feedback explains the particular failure');assert.equal(posts(p).length,1,'language does not recapture');
    p.state.post=()=>response(201,{item:B});p.capture().click();await until(()=>p.has(B),'retry can capture');
  });
}

test('AC-05-06-07-UI: global language applies to pending async completion without rebuilding welcome',async t=>{
  const p=await open(t,[A]);const gallery=p.d.getElementById('gallery'), trigger=p.d.getElementById('gallery-trigger');await p.screenshots();await until(()=>p.has(A),'history');
  const hold=deferred();p.state.post=()=>hold.promise;p.capture().click();await delay();p.d.getElementById('language-toggle').click();
  assert.doesNotMatch(p.text(),/[\u3400-\u9fff]|undefined/);hold.resolve(response(201,{item:B}));await until(()=>p.has(B),'async success');assert.doesNotMatch(p.text(),/[\u3400-\u9fff]|undefined/);
  p.tab('welcome').click();assert.strictEqual(p.d.getElementById('gallery'),gallery);assert.strictEqual(p.d.getElementById('gallery-trigger'),trigger);assert.equal(p.d.querySelector('h1').textContent,'Welcome here');assert.equal(posts(p).length,1);
  const q=await open(t,[A,B]);assert.equal(q.d.documentElement.lang,'zh-CN');
});

test('AC-05-06-07-UI: disconnected capture is not retried automatically and history remains',async t=>{
  const p=await open(t,[A]);await p.screenshots();await until(()=>p.has(A),'history');p.state.post=()=>Promise.reject(new TypeError('network disconnected'));p.capture().click();await delay();await delay();
  assert.equal(posts(p).length,1);assert.ok(p.has(A));assert.equal(p.pictures().length,1);assert.match(p.text(),/连接|网络|connection|network/i);assert.match(p.text(),/重试|retry/i);
});


test('AC-03 and AC-05-06-07-UI: delayed initial history uses current language and failure can retry',async t=>{
  const hold=deferred();const p=await open(t,[],{list:()=>hold.promise});await p.screenshots();
  p.d.getElementById('language-toggle').click();hold.resolve(response(500,{error:{code:'STORAGE_FAILED'}}));
  await until(()=>/failed|error|unable/i.test(p.text()),'history failure is rendered in current language');assert.doesNotMatch(p.text(),/[\u3400-\u9fff]|undefined/);
  p.state.list=()=>response(200,{items:[B]});p.button(/retry/i,p.panel()).click();await until(()=>p.has(B),'retry after initial history failure');assert.doesNotMatch(p.text(),/[\u3400-\u9fff]|undefined/);
});
