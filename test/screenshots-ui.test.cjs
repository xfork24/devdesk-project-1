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
function open(t, data=[A,B], overrides={}) {
  const dom = new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});
  t.after(()=>dom.window.close());
  const w=dom.window, d=w.document, calls=[], errors=[];
  w.scrollTo = p => {w.scrollY=p.top; w.scrollX=p.left;};
  w.Image = class { set src(v) {queueMicrotask(()=>this.onload?.());} };
  const state = {list:()=>response({items:data}),post:()=>response({item:B},201),del:()=>response(null,204)};
  // An optional list response is installed before the tab is entered, so a case can observe the first read while it is pending.
  if (overrides.list) state.list = overrides.list;
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

for (const zoom of [false,true]) test(`layout arrow navigation, boundaries and focus recovery zoom=${zoom}`, async t => {
  const data = Array.from({length:5}, (_,i) => { const id = String(i+1).repeat(8)+'-1111-4111-8111-111111111111'; return {...A,id,createdAt:`2026-11-${20-i}T01:00:00.000Z`,url:`/api/screenshots/${id}/image`}; });
  const p = open(t,data); await settle(()=>p.images().length===5);
  const roots = [...p.$('screenshots-list').children], bs = roots.map(r=>r.querySelector('button'));
  const layout = columns => roots.forEach((r,i)=>r.getBoundingClientRect=()=>({left:i%columns*220,top:Math.floor(i/columns)*180,width:200,height:160}));
  layout(3);
  const key = (b,k) => { const e = new p.w.KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}); b.dispatchEvent(e); return e.defaultPrevented; };
  bs[0].focus(); p.w.scrollY=123; if(zoom)bs[0].click();
  for(const [from,k,to] of [[0,'ArrowRight',1],[1,'ArrowDown',4],[4,'ArrowRight',4],[4,'ArrowLeft',3],[3,'ArrowUp',0]]) {
    assert.equal(key(bs[from],k),true); assert.equal(p.d.activeElement,bs[to]);
    assert.deepEqual(bs.map(b=>b.getAttribute('aria-expanded')),bs.map((_,i)=>String(zoom&&i===to)));
  }
  layout(2); key(bs[0],'ArrowDown'); assert.equal(p.d.activeElement,bs[2]);
  p.$('capture-screenshot').focus(); assert.equal(key(bs[2],'ArrowRight'),false);
  bs[2].focus(); key(bs[2],'ArrowDown'); assert.equal(p.d.activeElement,bs[4]);
  if(zoom) { key(bs[4],'Escape'); assert.equal(p.d.activeElement,bs[4]); assert.equal(p.w.scrollY,123); assert.ok(roots.every(r=>r.style.minHeight==='')); }
});

for (const count of [0,1]) test(`arrow boundaries with ${count} screenshot`, async t => {
  const p=open(t,count?[A]:[]); await settle(()=>!p.$('reload-screenshots').disabled);
  const b=count?p.card(A.id).querySelector('button'):p.$('capture-screenshot');
  if(count)p.card(A.id).getBoundingClientRect=()=>({top:0,left:0,width:200,height:160});
  for(const zoom of count?[false,true]:[false]) {
    b.focus();if(zoom)b.click();
    for(const key of ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown']) {
      const e=new p.w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true});b.dispatchEvent(e);
      assert.equal(e.defaultPrevented,Boolean(count));assert.equal(p.d.activeElement,b);
      if(count)assert.equal(b.getAttribute('aria-expanded'),String(zoom));
    }
    if(zoom)b.click();
  }
});

// Empty-state guide: #history-status shows the full bilingual call to action,
// while loading, error and non-empty history keep their existing text.
const GUIDE_ZH='暂无截图。点击“区域截图”创建第一张截图。';
const GUIDE_EN='No screenshots yet. Select “Capture region” to create your first screenshot.';
const LOADING_ZH='正在加载历史…';
const ERROR_ZH='历史加载失败：存储失败，请检查后台磁盘后重试。';
const GUIDE_PATTERN=/暂无截图|No screenshots yet/;
const reads=p=>p.calls.filter(c=>c.url==='/api/screenshots');
// Completion is judged by the panel request ending, not by an empty list length.
async function openEmpty(t){const p=open(t,[]);await settle(()=>!p.$('reload-screenshots').disabled);return p;}

test('empty history shows the full Chinese guide as plain text',async t=>{
  const p=await openEmpty(t);
  assert.equal(p.$('history-status').textContent,GUIDE_ZH);
  assert.equal(p.$('history-status').children.length,0);
});
test('the empty-history guide follows the language switch',async t=>{
  const p=await openEmpty(t);
  p.click('language-toggle');
  assert.equal(p.$('history-status').textContent,GUIDE_EN);
  assert.equal(p.$('history-status').children.length,0);
});
test('the empty-history guide round-trips between languages without extra history reads',async t=>{
  const p=await openEmpty(t);
  const before=reads(p).length;
  for(const expected of [GUIDE_EN,GUIDE_ZH,GUIDE_EN,GUIDE_ZH]){p.click('language-toggle');assert.equal(p.$('history-status').textContent,expected);}
  assert.equal(reads(p).length,before);
});
test('a pending history request keeps the loading text and hides both guides',async t=>{
  const p=await openEmpty(t);
  const hold=deferred();p.state.list=()=>hold.promise;p.click('reload-screenshots');
  assert.equal(p.$('history-status').textContent,LOADING_ZH);
  assert.doesNotMatch(p.$('screenshots-panel').textContent,GUIDE_PATTERN);
  p.click('language-toggle');
  assert.equal(p.$('history-status').textContent,'Loading history…');
  assert.doesNotMatch(p.$('screenshots-panel').textContent,GUIDE_PATTERN);
  hold.resolve(response({items:[]}));
  await settle(()=>!p.$('reload-screenshots').disabled);
  assert.equal(p.$('history-status').textContent,GUIDE_EN);
});
test('a failed history request keeps the error text, the retry control and no guide',async t=>{
  const p=await openEmpty(t);
  p.state.list=()=>response({error:{code:'STORAGE_FAILED'}},500);p.click('reload-screenshots');
  await settle(()=>!p.$('retry-history').hidden);
  assert.equal(p.$('history-status').textContent,ERROR_ZH);
  assert.doesNotMatch(p.$('screenshots-panel').textContent,GUIDE_PATTERN);
  p.click('language-toggle');
  assert.equal(p.$('history-status').textContent,'History loading failed: Storage failed. Check the backend disk and retry.');
  p.state.list=()=>response({items:[]});p.click('retry-history');
  await settle(()=>!p.$('reload-screenshots').disabled);
  assert.equal(p.$('history-status').textContent,GUIDE_EN);
});
test('a non-empty history renders the existing list and hides both guides',async t=>{
  const p=open(t,[A]);await settle(()=>p.images().length===1);
  assert.equal(p.$('history-status').textContent,'');
  assert.doesNotMatch(p.$('screenshots-panel').textContent,GUIDE_PATTERN);
});
test('the guide adds no control and the existing capture flow is unchanged',async t=>{
  const p=await openEmpty(t);
  assert.deepEqual([...p.$('screenshots-panel').querySelectorAll('button')].map(b=>b.id).sort(),
    ['capture-screenshot','reload-screenshots','retry-history']);
  assert.equal(p.$('capture-screenshot').textContent,'区域截图');
  assert.equal(p.$('history-status').children.length,0);
  p.click('capture-screenshot');
  await settle(()=>p.calls.some(c=>c.method==='POST'));
  const writes=p.calls.filter(c=>c.method==='POST');
  assert.equal(writes.length,1);
  assert.equal(writes[0].url,'/api/screenshots');
  assert.equal(writes[0].headers['X-CSRF-Token'],'formal-session');
  assert.match(JSON.parse(writes[0].body).requestId,/^[0-9a-f-]{36}$/i);
});
test('empty and non-empty history keep one identical history read',async t=>{
  const empty=await openEmpty(t);
  assert.equal(reads(empty).length,1);
  assert.equal(reads(empty)[0].method??'GET','GET');
  assert.equal(reads(empty)[0].credentials,'same-origin');
  const before=empty.calls.length;
  empty.click('language-toggle');empty.click('language-toggle');
  empty.click('welcome-tab');empty.click('screenshots-tab');
  assert.equal(empty.calls.length,before);
  assert.equal(reads(empty).length,1);
  const filled=open(t,[A]);await settle(()=>filled.images().length===1);
  assert.equal(reads(filled).length,1);
  assert.equal(reads(filled)[0].url,reads(empty)[0].url);
  assert.equal(reads(filled)[0].credentials,'same-origin');
});

// Assistive-technology busy marker on #history-status: "true" while a history
// read is in flight and "false" once that read settles, whichever way it ends.
test('the history status exposes aria-busy while a read is in flight and after it settles',async t=>{
  const hold=deferred();
  const p=open(t,[A,B],{list:()=>hold.promise});
  assert.equal(p.$('history-status').getAttribute('aria-busy'),'true');
  assert.equal(p.$('history-status').textContent,LOADING_ZH);
  assert.equal(p.$('reload-screenshots').disabled,true);
  assert.equal(reads(p).length,1);
  hold.resolve(response({items:[A,B]}));
  await settle(()=>!p.$('reload-screenshots').disabled);
  assert.equal(p.$('history-status').getAttribute('aria-busy'),'false');
  assert.equal(p.$('history-status').textContent,'');
  assert.equal(p.images().length,2);
  p.state.list=()=>response({items:[]});
  p.click('reload-screenshots');
  await settle(()=>!p.$('reload-screenshots').disabled);
  assert.equal(p.$('history-status').getAttribute('aria-busy'),'false');
  assert.equal(p.$('history-status').textContent,GUIDE_ZH);
  p.state.list=()=>response({error:{code:'STORAGE_FAILED'}},500);
  p.click('reload-screenshots');
  await settle(()=>!p.$('retry-history').hidden);
  assert.equal(p.$('history-status').getAttribute('aria-busy'),'false');
  assert.equal(p.$('history-status').textContent,ERROR_ZH);
  assert.equal(p.$('retry-history').hidden,false);
  assert.equal(p.$('retry-history').disabled,false);
  assert.deepEqual(p.errors,[]);
});

// The busy marker survives a language switch and repeated triggers: one read
// stays in flight, the marker stays "true", and it settles to "false".
test('the busy marker survives a language switch and repeated triggers with a single read',async t=>{
  const p=await openEmpty(t);
  p.state.list=()=>response({error:{code:'STORAGE_FAILED'}},500);
  p.click('reload-screenshots');
  await settle(()=>!p.$('retry-history').hidden);
  const before=reads(p).length;
  const hold=deferred();
  p.state.list=()=>hold.promise;
  p.click('retry-history');
  assert.equal(reads(p).length,before+1);
  assert.equal(p.$('history-status').getAttribute('aria-busy'),'true');
  assert.equal(p.$('history-status').textContent,LOADING_ZH);
  assert.equal(p.$('reload-screenshots').disabled,true);
  assert.equal(p.$('retry-history').disabled,true);
  p.click('language-toggle');
  assert.equal(p.$('history-status').getAttribute('aria-busy'),'true');
  assert.equal(p.$('history-status').textContent,'Loading history…');
  assert.equal(reads(p).length,before+1);
  p.click('reload-screenshots');
  p.click('retry-history');
  p.$('reload-screenshots').dispatchEvent(new p.w.MouseEvent('click',{bubbles:true,cancelable:true}));
  p.$('retry-history').dispatchEvent(new p.w.MouseEvent('click',{bubbles:true,cancelable:true}));
  p.click('language-toggle');
  assert.equal(reads(p).length,before+1);
  assert.equal(p.$('history-status').getAttribute('aria-busy'),'true');
  assert.equal(p.$('history-status').textContent,LOADING_ZH);
  hold.resolve(response({items:[]}));
  await settle(()=>!p.$('reload-screenshots').disabled);
  assert.equal(p.$('history-status').getAttribute('aria-busy'),'false');
  assert.equal(p.$('history-status').textContent,GUIDE_ZH);
  assert.deepEqual(p.errors,[]);
});
