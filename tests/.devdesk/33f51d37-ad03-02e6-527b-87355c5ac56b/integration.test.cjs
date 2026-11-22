'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs/promises'), os=require('node:os'), path=require('node:path');
const {createScreenshotServer}=require('../../../server.cjs');
const {open}=require('./page.cjs');
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==','base64');
async function wait(check){for(let n=0;n<200;n++){if(check())return;await new Promise(r=>setTimeout(r,10));}assert.fail('application state not reached within 2 seconds');}
async function fixture(t){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'independent-integration-'));let server;
  const pages=[], state={mode:'good',captures:0};
  async function stop(){if(server){server.closeAllConnections();await new Promise(r=>server.close(r));server=null;}}
  t.after(async()=>{try{for(const p of pages)await p.close();await stop();}finally{await fs.rm(directory,{recursive:true,force:true});}});
  async function start(){
    const app=await createScreenshotServer({storageDirectory:directory,platform:'darwin',captureTimeoutMs:40,captureRegion:async({destination,signal})=>{
      state.captures++;
      if(state.mode==='cancel')return {status:'cancelled'};
      if(state.mode==='denied')throw Error('permission denied');
      if(state.mode==='timeout')await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));
      await fs.writeFile(destination,state.mode==='invalid'?Buffer.from('broken'):PNG);return {status:'captured'};
    }});server=app.server;
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    state.base=`http://127.0.0.1:${server.address().port}`;
  }
  async function page(){const p=await open(state.base);pages.push(p);p.click('screenshots-tab');await wait(()=>!p.$('reload-screenshots').disabled);return p;}
  await start();return {directory,state,page,stop,start};
}
async function capture(p){p.click('capture-screenshot');await wait(()=>!p.$('capture-screenshot').disabled);}
const urls=p=>p.cards().map(c=>c.querySelector('img').src);
test('I01: real service page saves two records, refreshes, restarts and deletes only selected record',{timeout:15000},async t=>{
  const f=await fixture(t),p=await f.page();assert.equal(p.cards().length,0);
  await capture(p);assert.equal(p.cards().length,1);const first=urls(p)[0];
  await capture(p);assert.equal(p.cards().length,2);const second=urls(p).find(u=>u!==first);
  for(const url of urls(p)){const r=await fetch(f.state.base+url,{signal:AbortSignal.timeout(2000)});assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/image\/png/);assert.deepEqual(Buffer.from(await r.arrayBuffer()),PNG);
    const id=url.split('/')[3],meta=JSON.parse(await fs.readFile(path.join(f.directory,id,'metadata.json'),'utf8'));assert.ok(JSON.stringify(meta).includes(id));assert.deepEqual(await fs.readFile(path.join(f.directory,id,'image.png')),PNG);}
  const refreshed=await f.page();assert.deepEqual(urls(refreshed),urls(p));assert.equal(refreshed.document.documentElement.lang,'zh-CN');
  await f.stop();await f.start();const restarted=await f.page();assert.deepEqual(urls(restarted),urls(p));
  restarted.cards().find(c=>c.querySelector('img').src===first).querySelector('.screenshot-delete').click();await wait(()=>restarted.cards().length===1);assert.deepEqual(urls(restarted),[second]);
  await f.stop();await f.start();assert.deepEqual(urls(await f.page()),[second]);
});
test('I02: navigation, zoom and shared language survive real asynchronous API results',{timeout:10000},async t=>{
  const f=await fixture(t),p=await f.page(),gallery=p.$('gallery-image');
  p.click('capture-screenshot');p.click('language-toggle');await wait(()=>!p.$('capture-screenshot').disabled);
  assert.match(p.$('capture-status').textContent,/Screenshot saved/);assert.equal(p.$('welcome-tab').textContent,'Welcome');assert.equal(p.cards().length,1);
  const button=p.cards()[0].querySelector('button');button.focus();button.click();assert.equal(button.getAttribute('aria-expanded'),'true');assert.equal(p.document.body.style.overflow,'hidden');
  p.click('language-toggle');assert.equal(p.cards()[0].querySelector('button'),button);assert.equal(p.$('gallery-image'),gallery);button.click();assert.equal(button.getAttribute('aria-expanded'),'false');assert.equal(p.document.body.style.overflow,'');assert.equal(p.window.scrollY,95);assert.equal(p.document.activeElement,button);
  button.click();p.click('welcome-tab');assert.equal(p.$('screenshots-panel').hidden,true);assert.equal(p.document.body.style.overflow,'');p.click('screenshots-tab');assert.equal(p.$('welcome-panel').hidden,true);assert.equal(p.cards().length,1);assert.equal(f.state.captures,1);
});
test('I03: failed capture, cancel, timeout, malformed PNG and storage failure retain history and permit retry',{timeout:15000},async t=>{
  const f=await fixture(t),p=await f.page();await capture(p);const before=urls(p);
  for(const mode of ['denied','cancel','timeout','invalid']){
    f.state.mode=mode;const count=f.state.captures;p.click('capture-screenshot');p.click('language-toggle');await wait(()=>!p.$('capture-screenshot').disabled);
    assert.match(p.$('capture-status').textContent,mode==='cancel'?/cancelled/:mode==='timeout'?/timed out/:/did not complete/);assert.deepEqual(urls(p),before);assert.equal(f.state.captures,count+1);p.click('language-toggle');
  }
  // A real on-disk obstruction forces the API storage error and its page translation.
  f.state.mode='good';await fs.rename(path.join(f.directory,'.pending'),path.join(f.directory,'.pending-backup'));await fs.writeFile(path.join(f.directory,'.pending'),'blocked');
  await capture(p);assert.match(p.$('capture-status').textContent,/存储失败/);assert.deepEqual(urls(p),before);
  await fs.unlink(path.join(f.directory,'.pending'));await fs.rename(path.join(f.directory,'.pending-backup'),path.join(f.directory,'.pending'));
  await capture(p);assert.equal(p.cards().length,2);
});
test('I04: real history/delete errors and connection loss retain existing cards and offer recovery',{timeout:15000},async t=>{
  const f=await fixture(t),p=await f.page();await capture(p);await capture(p);const before=urls(p),id=before[0].split('/')[3];
  const metaPath=path.join(f.directory,id,'metadata.json'),metadata=await fs.readFile(metaPath);
  await fs.writeFile(metaPath,'corrupted');p.click('reload-screenshots');await wait(()=>!p.$('reload-screenshots').disabled);
  assert.deepEqual(urls(p),before);assert.equal(p.$('retry-history').hidden,false);assert.match(p.$('history-status').textContent,/存储失败/);
  p.click('language-toggle');assert.match(p.$('history-status').textContent,/Storage failed/);
  await fs.writeFile(metaPath,metadata);p.click('retry-history');await wait(()=>!p.$('reload-screenshots').disabled);assert.equal(p.$('retry-history').hidden,true);
  await fs.rename(path.join(f.directory,'.trash'),path.join(f.directory,'.trash-backup'));await fs.writeFile(path.join(f.directory,'.trash'),'blocked');
  p.cards()[0].querySelector('.screenshot-delete').click();await wait(()=>!p.cards()[0].querySelector('.screenshot-delete').disabled);
  assert.match(p.$('capture-status').textContent,/Storage failed/);assert.deepEqual(urls(p),before);
  await fs.unlink(path.join(f.directory,'.trash'));await fs.rename(path.join(f.directory,'.trash-backup'),path.join(f.directory,'.trash'));
  await f.stop();p.click('reload-screenshots');await wait(()=>!p.$('reload-screenshots').disabled);assert.match(p.$('history-status').textContent,/Connection failed/);assert.deepEqual(urls(p),before);
  const writes=p.calls.filter(c=>c.method==='POST').length;await capture(p);assert.match(p.$('capture-status').textContent,/Connection failed/);assert.equal(p.calls.filter(c=>c.method==='POST').length,writes+1);assert.deepEqual(urls(p),before);
  await f.start();const recovered=await f.page();assert.deepEqual(urls(recovered),before);await capture(recovered);assert.equal(recovered.cards().length,3);
});
