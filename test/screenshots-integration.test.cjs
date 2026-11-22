'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {createScreenshotServer} = require('../server.cjs');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==','base64');
test('formal integration: HTTP page/session, persistent captures, restart, failures and targeted deletion', {timeout:15000}, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'welcome-integration-'));
  let server, base, headers, mode = 'good';
  const stop = async () => { if (server) { server.closeAllConnections(); await new Promise(r=>server.close(r)); server=null; } };
  async function start() {
    ({server} = await createScreenshotServer({storageDirectory:directory, captureRegion:async ({destination})=>{
      if(mode==='cancel') return {status:'cancelled'};
      if(mode==='fail') throw Error('denied');
      await fs.writeFile(destination,PNG); return {status:'captured'};
    }}));
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    base=`http://127.0.0.1:${server.address().port}`;
    const page=await fetch(base,{signal:AbortSignal.timeout(2000)}), html=await page.text();
    assert.match(html,/id="screenshots-tab"/);
    assert.match(html,/src="\/public\/screenshots.js"/);
    const token=page.headers.get('x-csrf-token');assert.ok(token);assert.ok(html.includes(token));
    headers={'Content-Type':'application/json',Origin:base,'X-CSRF-Token':token,Cookie:page.headers.get('set-cookie').split(';')[0]};
    const script=await fetch(base+'/public/screenshots.js',{signal:AbortSignal.timeout(2000)});assert.equal(script.status,200);assert.match(await script.text(),/capture-screenshot/);
  }
  const request=(url,options={})=>fetch(base+url,{...options,signal:AbortSignal.timeout(2000)});
  const list=async()=>{const r=await request('/api/screenshots');assert.equal(r.status,200);return (await r.json()).items;};
  const capture=()=>request('/api/screenshots',{method:'POST',headers,body:JSON.stringify({requestId:randomUUID()})});
  try {
    await start();assert.deepEqual(await list(),[]);
    const saved=[];
    for(let n=0;n<2;n++) {const r=await capture();assert.equal(r.status,201);const {item}=await r.json();saved.push(item);
      assert.deepEqual(Buffer.from(await (await request(item.url)).arrayBuffer()),PNG);
      assert.deepEqual(await fs.readFile(path.join(directory,item.id,'image.png')),PNG);
      assert.ok((await fs.readFile(path.join(directory,item.id,'metadata.json'),'utf8')).includes(item.id));}
    const before=await list();await stop();await start();assert.deepEqual(await list(),before);
    mode='cancel';assert.deepEqual(await (await capture()).json(),{cancelled:true});
    mode='fail';const failed=await capture();assert.equal(failed.status,500);assert.deepEqual(await failed.json(),{error:{code:'CAPTURE_FAILED'}});assert.deepEqual(await list(),before);
    const corrupt=path.join(directory,saved[0].id,'metadata.json'),original=await fs.readFile(corrupt);
    await fs.writeFile(corrupt,'bad');assert.equal((await request('/api/screenshots')).status,500);await fs.writeFile(corrupt,original);
    assert.equal((await request('/api/screenshots/'+saved[0].id,{method:'DELETE',headers})).status,204);
    await stop();await start();assert.deepEqual((await list()).map(i=>i.id),[saved[1].id]);
    mode='good';assert.equal((await capture()).status,201);assert.equal((await list()).length,2);
  } finally {try {await stop();} finally {await fs.rm(directory,{recursive:true,force:true});}}
});
