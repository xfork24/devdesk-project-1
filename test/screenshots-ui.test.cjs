'use strict';
// Formal UI tests. Node >=22; pre-provision jsdom@26.1.0 outside the source tree.
// JSDOM_MODULE may name that module; default uses the configured shared runtime cache.
// Run: node --test test/screenshots-ui.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require(process.env.JSDOM_MODULE || path.join(process.env.DEVDESK_RUNTIME_CACHE || '/tmp/devdesk-runtime/shared', 'frontend-jsdom-26.1.0/node_modules/jsdom'));
const root = path.resolve(__dirname, '..');
const A = {id:'11111111-1111-4111-8111-111111111111',createdAt:'2026-11-21T01:00:00.000Z',width:800,height:600,url:'/api/screenshots/11111111-1111-4111-8111-111111111111/image'};
const B = {...A,id:'22222222-2222-4222-8222-222222222222',createdAt:'2026-11-22T01:00:00.000Z',url:'/api/screenshots/22222222-2222-4222-8222-222222222222/image'};
const deferred = () => { let resolve; const promise = new Promise(r=>resolve=r); return {promise,resolve}; };
const response = (body, status=200) => ({ok:status<400,status,json:async()=>body});
async function settle(check) {
  for (let i=0;i<100;i++) { if(check()) return; await new Promise(r=>setTimeout(r,5)); }
  assert.fail('UI did not reach expected state within 500ms');
}
function open(t, data=[A,B]) {
  const dom = new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});
  t.after(()=>dom.window.close());
  const w=dom.window, d=w.document, calls=[], errors=[];
  w.scrollTo = p => {w.scrollY=p.top; w.scrollX=p.left;};
  w.Image = class { set src(v) {queueMicrotask(()=>this.onload?.());} };
  const state = {list:()=>response({items:data}),post:()=>response({item:B},201),del:()=>response(null,204)};
  w.fetch = async (url, options={}) => {
    calls.push({url, ...options});
    if (url==='/api/session') return response({csrfToken:'formal-session'});
    return options.method==='POST' ? state.post() : options.method==='DELETE' ? state.del() : state.list();
  };
  w.addEventListener('error',event=>errors.push(event.error));
  for (const script of d.querySelectorAll('script')) w.eval(script.src ? fs.readFileSync(path.join(root,'public/screenshots.js'),'utf8') : script.textContent);
  const $=id=>d.getElementById(id), click=id=>$(id).click();
  click('screenshots-tab');
  return {w,d,$,click,calls,state,errors,images:()=>[...$('screenshots-list').querySelectorAll('img')],card:id=>[...$('screenshots-list').children].find(c=>c.querySelector('img').getAttribute('src').includes(id))};
}
test('history validates records, deduplicates, orders, and recovers without dropping existing images', async t=>{
  const p=open(t,[A,B,A]); await settle(()=>p.images().length===2);
  assert.deepEqual(p.images().map(n=>n.getAttribute('src')),[B.url,A.url]);
  p.state.list=()=>response({items:[{...A,url:'https://foreign.invalid/image'}]}); p.click('reload-screenshots');
  await settle(()=>!p.$('retry-history').hidden);assert.equal(p.images().length,2);
  p.state.list=()=>response({items:[]});p.click('retry-history');await settle(()=>p.images().length===0);
  assert.match(p.$('history-status').textContent,/暂无/);assert.deepEqual(p.errors,[]);
});
test('pending capture has a single UUID write, CSRF protection, and cancellation preserves history', async t=>{
  const p=open(t,[A]);await settle(()=>p.images().length===1);const hold=deferred();p.state.post=()=>hold.promise;
  p.click('capture-screenshot');p.click('capture-screenshot');await settle(()=>p.calls.some(c=>c.method==='POST'));
  const writes=p.calls.filter(c=>c.method==='POST');assert.equal(writes.length,1);
  assert.match(JSON.parse(writes[0].body).requestId,/^[0-9a-f-]{36}$/i);assert.equal(writes[0].headers['X-CSRF-Token'],'formal-session');
  assert.equal(writes[0].headers['Content-Type'],'application/json');assert.equal(writes[0].credentials,'same-origin');
  p.click('language-toggle');hold.resolve(response({cancelled:true}));await settle(()=>!p.$('capture-screenshot').disabled);
  assert.match(p.$('capture-status').textContent,/cancelled/);assert.equal(p.images().length,1);assert.deepEqual(p.errors,[]);
});
test('zoom preserves scroll, focus, and image nodes across language changes; keyboard tabs exit zoom', async t=>{
  const p=open(t);await settle(()=>p.images().length===2);const image=p.card(A.id).querySelector('button');
  image.focus();p.w.scrollY=84;image.click();assert.equal(p.d.body.style.overflow,'hidden');
  p.click('language-toggle');assert.equal(p.card(A.id).querySelector('button'),image);image.click();
  assert.equal(p.w.scrollY,84);assert.equal(p.d.activeElement,image);assert.equal(p.d.body.style.overflow,'');
  image.click();p.$('screenshots-tab').dispatchEvent(new p.w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));
  assert.equal(p.$('screenshots-panel').hidden,true);assert.equal(p.d.body.style.overflow,'');assert.equal(p.d.activeElement,p.$('welcome-tab'));
});
test('delete failure retains target, successful deletion restores usable focus and only removes target', async t=>{
  const p=open(t);await settle(()=>p.images().length===2);p.state.del=()=>response({error:{code:'STORAGE_FAILED'}},500);
  p.card(A.id).querySelector('.screenshot-delete').click();await settle(()=>/失败/.test(p.$('capture-status').textContent));assert.equal(p.images().length,2);
  p.state.del=()=>response(null,204);const image=p.card(A.id).querySelector('button');image.focus();image.click();
  p.card(A.id).querySelector('.screenshot-delete').click();await settle(()=>p.images().length===1);
  assert.equal(p.images()[0].getAttribute('src'),B.url);assert.equal(p.d.body.style.overflow,'');assert.equal(p.d.activeElement,p.$('capture-screenshot'));
});
test('a stale list cannot undo a capture or resurrect a deleted record', async t=>{
  const p=open(t,[A]);await settle(()=>p.images().length===1);const hold=deferred();p.state.list=()=>hold.promise;p.click('reload-screenshots');
  p.click('capture-screenshot');await settle(()=>p.images().length===2);hold.resolve(response({items:[A]}));await settle(()=>!p.$('reload-screenshots').disabled);
  assert.equal(p.images().length,2);const second=deferred();p.state.list=()=>second.promise;p.click('reload-screenshots');
  p.card(A.id).querySelector('.screenshot-delete').click();await settle(()=>p.images().length===1);second.resolve(response({items:[A,B]}));
  await settle(()=>!p.$('reload-screenshots').disabled);assert.equal(p.images().length,1);assert.equal(p.images()[0].getAttribute('src'),B.url);
});
test('each error is localized, network failures do not retry, malformed success cannot add an image', async t=>{
  const p=open(t,[A]);await settle(()=>p.images().length===1);
  for (const code of ['INVALID_INPUT','FORBIDDEN','BUSY','UNSUPPORTED_PLATFORM','CAPTURE_TIMEOUT','CAPTURE_FAILED','STORAGE_FAILED']) {
    p.state.post=()=>response({error:{code}},500);p.click('capture-screenshot');await settle(()=>!p.$('capture-screenshot').disabled);
    assert.match(p.$('capture-status').textContent,/[\u3400-\u9fff]/);p.click('language-toggle');
    assert.doesNotMatch(p.$('screenshots-panel').textContent,/[\u3400-\u9fff]|undefined/);p.click('language-toggle');
  }
  const count=p.calls.filter(c=>c.method==='POST').length;p.state.post=()=>Promise.reject(new TypeError('offline'));
  p.click('capture-screenshot');await settle(()=>!p.$('capture-screenshot').disabled);assert.match(p.$('capture-status').textContent,/连接失败/);
  assert.equal(p.calls.filter(c=>c.method==='POST').length,count+1);
  p.state.post=()=>response(null);p.click('capture-screenshot');await settle(()=>!p.$('capture-screenshot').disabled);
  assert.equal(p.images().length,1);assert.doesNotMatch(p.$('capture-status').textContent,/undefined/);assert.deepEqual(p.errors,[]);
});
