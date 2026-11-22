'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {createScreenshotServer} = require('../../../server.cjs');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64');
const pause = ms => new Promise(r => setTimeout(r, ms));
function deferred() { let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve}; }
async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(__dirname, 'run-'));
  const servers = [];
  t.after(async () => {
    for (const s of servers) { s.closeAllConnections(); await new Promise(r => s.close(r)); }
    await fs.rm(directory, {recursive:true, force:true});
  });
  let calls = 0;
  const capture = options.captureRegion || (async ({destination}) => { calls++; await fs.writeFile(destination, PNG); return {status:'captured'}; });
  async function start(overrides = {}) {
    const app = await createScreenshotServer({storageDirectory:directory, platform:'darwin', captureRegion:capture, captureTimeoutMs:80, ...options, ...overrides});
    assert.ok(app && app.server, 'factory must return an HTTP server');
    assert.equal(typeof app.csrfToken, 'string'); assert.ok(app.csrfToken.length);
    const server = app.server; servers.push(server);
    await new Promise((resolve,reject) => {server.once('error', reject); server.listen(0,'127.0.0.1', resolve);});
    const base = `http://127.0.0.1:${server.address().port}`;
    const page = await fetch(base, {signal:AbortSignal.timeout(2000)});
    assert.equal(page.status, 200); await page.arrayBuffer();
    const cookie = page.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
    async function req(method, route, body, headers = {}) {
      return fetch(base + route, {method, headers:{Origin:base, 'Content-Type':'application/json', 'X-CSRF-Token':app.csrfToken, Cookie:cookie, ...headers}, body:body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(2500)});
    }
    async function save(requestId = randomUUID()) {const r = await req('POST','/api/screenshots',{requestId}); assert.equal(r.status,201); return (await r.json()).item;}
    async function list() {const r = await req('GET','/api/screenshots'); assert.equal(r.status,200); return (await r.json()).items;}
    return {req,save,list,base};
  }
  return {directory,start,get calls(){return calls;}};
}
async function error(response, status, code) {assert.equal(response.status,status); assert.deepEqual(await response.json(),{error:{code}});}
function record(item) {
  assert.match(item.id,/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(new Date(item.createdAt).toISOString(),item.createdAt);
  assert.equal(item.width,1); assert.equal(item.height,1);
  assert.equal(item.url,`/api/screenshots/${item.id}/image`);
}

test('B01 valid PNG, durable history, image retrieval and request idempotency', {timeout:10000}, async t => {
  const f = await fixture(t); const a = await f.start();
  assert.deepEqual(await a.list(),[]);
  const requestId = randomUUID(); const first = await a.save(requestId); record(first);
  const duplicate = await a.save(requestId); assert.deepEqual(duplicate,first); assert.equal(f.calls,1);
  const second = await a.save(); record(second); assert.notEqual(first.id,second.id);
  const expected = [first,second].sort((x,y) => y.createdAt.localeCompare(x.createdAt) || y.id.localeCompare(x.id));
  assert.deepEqual(await a.list(),expected);
  const image = await a.req('GET',first.url); assert.equal(image.status,200); assert.match(image.headers.get('content-type'),/^image\/png/);
  assert.deepEqual(Buffer.from(await image.arrayBuffer()),PNG);
  const dir = path.join(f.directory, first.id);
  assert.equal((await fs.stat(f.directory)).mode & 0o777,0o700);
  assert.equal((await fs.stat(path.join(dir,'image.png'))).mode & 0o777,0o600);
  const metadata = JSON.parse(await fs.readFile(path.join(dir,'metadata.json'),'utf8'));
  assert.ok(JSON.stringify(metadata).includes(requestId));
  const b = await f.start(); assert.deepEqual(await b.list(),expected);
  assert.deepEqual(await b.save(requestId),first); assert.equal(f.calls,2);
  assert.equal((await b.req('GET',`/api/screenshots/${randomUUID()}/image`)).status,404);
});

test('B02 concurrent capture and same request remain BUSY; cancellation releases lock', {timeout:10000}, async t => {
  const entered = deferred(), release = deferred(); let calls = 0;
  const f = await fixture(t,{captureRegion:async () => { calls++; if(calls===1){entered.resolve(); await release.promise;} return {status:'cancelled'}; }});
  const a = await f.start(), id = randomUUID();
  const pending = a.req('POST','/api/screenshots',{requestId:id});
  try {
    await Promise.race([entered.promise,pause(1500).then(()=>{throw Error('capture not entered');})]);
    for (const requestId of [id,randomUUID()]) await error(await a.req('POST','/api/screenshots',{requestId}),409,'BUSY');
  } finally {release.resolve();}
  const r = await pending; assert.equal(r.status,200); assert.deepEqual(await r.json(),{cancelled:true});
  assert.deepEqual(await a.list(),[]); await a.req('POST','/api/screenshots',{requestId:id}); assert.equal(calls,2);
});

test('B03 failures preserve committed history and permit retry', {timeout:15000}, async t => {
  let mode = 'good';
  const f = await fixture(t,{captureRegion:async ({destination,signal}) => {
    if(mode==='error') throw Object.assign(Error('capture'),{code:'CAPTURE_FAILED'});
    if(mode==='timeout') return new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(Object.assign(Error('aborted'),{code:'CAPTURE_TIMEOUT'})),{once:true});});
    await fs.writeFile(destination,mode==='invalid' ? Buffer.from('not PNG') : mode==='truncated' ? PNG.subarray(0,33) : PNG);
    return {status:'captured'};
  }});
  const a = await f.start(); const first = await a.save();
  for(const [next,status,code] of [['error',500,'CAPTURE_FAILED'],['invalid',500,'CAPTURE_FAILED'],['truncated',500,'CAPTURE_FAILED'],['timeout',504,'CAPTURE_TIMEOUT']]) {
    mode=next; await error(await a.req('POST','/api/screenshots',{requestId:randomUUID()}),status,code);
    assert.deepEqual(await a.list(),[first]);
  }
  mode='good'; await a.save(); assert.equal((await a.list()).length,2);
});

test('B04 deletion is targeted, idempotent, durable; startup removes staging/trash', {timeout:10000}, async t => {
  const f = await fixture(t), a = await f.start(); const one = await a.save(), two = await a.save();
  for(let i=0;i<2;i++) assert.equal((await a.req('DELETE',`/api/screenshots/${one.id}`)).status,204);
  assert.deepEqual(await a.list(),[two]);
  const survivor = await a.req('GET',two.url); assert.deepEqual(Buffer.from(await survivor.arrayBuffer()),PNG);
  for(const name of ['.pending','.trash']) {await fs.mkdir(path.join(f.directory,name,'orphan'),{recursive:true}); await fs.writeFile(path.join(f.directory,name,'orphan','image.png'),PNG);}
  const b = await f.start(); assert.deepEqual(await b.list(),[two]);
  for(const name of ['.pending','.trash']) assert.deepEqual(await fs.readdir(path.join(f.directory,name)),[]);
});

test('B05 disk failure and failed move retain history; fsync gates saved response', {timeout:15000}, async t => {
  let failMove = false, failCommit = false, gate = false, syncEntered = deferred(), release = deferred();
  const io = {...fs,
    rename:async (from,to) => {
      if((failMove && String(to).includes(`${path.sep}.trash${path.sep}`)) || (failCommit && String(from).includes(`${path.sep}.pending${path.sep}`))) throw Object.assign(Error('disk'),{code:'EACCES'});
      return fs.rename(from,to);
    },
    open:async (...args) => {
      const handle = await fs.open(...args);
      return new Proxy(handle,{get(target,key){if(key==='sync') return async()=>{if(gate){syncEntered.resolve(); await release.promise;} return target.sync();}; const value=Reflect.get(target,key); return typeof value==='function'?value.bind(target):value;}});
    }
  };
  const f = await fixture(t,{fs:io}), a = await f.start(), one = await a.save();
  failMove=true; await error(await a.req('DELETE',`/api/screenshots/${one.id}`),500,'STORAGE_FAILED');
  assert.deepEqual(await a.list(),[one]); failMove=false;
  failCommit=true; await error(await a.req('POST','/api/screenshots',{requestId:randomUUID()}),500,'STORAGE_FAILED');
  assert.deepEqual(await a.list(),[one]); failCommit=false;
  gate=true; let settled=false; const pending=a.req('POST','/api/screenshots',{requestId:randomUUID()}).then(r=>{settled=true;return r;});
  try {
    await Promise.race([syncEntered.promise,pause(1500).then(()=>{throw Error('no fsync before response');})]);
    await pause(30); assert.equal(settled,false,'saved response must await sync');
  } finally {gate=false;release.resolve();}
  assert.equal((await pending).status,201); assert.equal((await a.list()).length,2);
  assert.equal((await a.req('DELETE',`/api/screenshots/${one.id}`)).status,204);
});

test('B06 corrupt committed metadata is STORAGE_FAILED rather than empty history', {timeout:8000}, async t => {
  const f=await fixture(t),a=await f.start(),one=await a.save();
  await fs.writeFile(path.join(f.directory,one.id,'metadata.json'),'{broken');
  await error(await a.req('GET','/api/screenshots'),500,'STORAGE_FAILED');
});

test('B07 reject forged writes, client paths, traversal and image symlinks', {timeout:12000}, async t => {
  const f=await fixture(t),a=await f.start(),one=await a.save();
  for(const headers of [{Origin:'http://evil.invalid'},{'X-CSRF-Token':'wrong'},{Host:'evil.invalid'}])
    await error(await a.req('POST','/api/screenshots',{requestId:randomUUID()},headers),403,'FORBIDDEN');
  await error(await a.req('POST','/api/screenshots',{requestId:randomUUID()},{'Content-Type':'text/plain'}),400,'INVALID_INPUT');
  for(const body of [{},{requestId:'../escape'},{requestId:randomUUID(),destination:'/tmp/arbitrary'}])
    await error(await a.req('POST','/api/screenshots',body),400,'INVALID_INPUT');
  const traversal=await a.req('GET','/api/screenshots/%2e%2e%2fsecret/image'); assert.ok([400,403,404].includes(traversal.status));
  const secret=path.join(f.directory,'secret'); await fs.writeFile(secret,'PRIVATE');
  const image=path.join(f.directory,one.id,'image.png'); await fs.unlink(image); await fs.symlink(secret,image);
  const r=await a.req('GET',one.url); assert.ok([403,404,500].includes(r.status)); assert.ok(!(await r.text()).includes('PRIVATE'));
  assert.equal(f.calls,1,'rejected requests must not capture');
});

test('B08 interrupted pending commit is not published after restart', {timeout:10000}, async t => {
  const f=await fixture(t),a=await f.start(),one=await a.save();
  const abandoned=randomUUID(), dir=path.join(f.directory,'.pending',abandoned);
  await fs.mkdir(dir,{recursive:true}); await fs.writeFile(path.join(dir,'image.png'),PNG);
  await fs.writeFile(path.join(dir,'metadata.json'),JSON.stringify({id:abandoned,createdAt:new Date().toISOString(),width:1,height:1,url:`/api/screenshots/${abandoned}/image`,requestId:randomUUID()}));
  const b=await f.start(); assert.deepEqual(await b.list(),[one]);
  assert.deepEqual(await fs.readdir(path.join(f.directory,'.pending')),[]);
  assert.equal((await b.req('GET',`/api/screenshots/${abandoned}/image`)).status,404);
});

test('B09 failed file sync cannot report saved, preserves history and releases lock', {timeout:10000}, async t=>{
  let fail=false;
  const io={...fs,open:async(...args)=>{
    const handle=await fs.open(...args);
    return new Proxy(handle,{get(target,key){if(key==='sync') return async()=>{if(fail) throw Object.assign(Error('full'),{code:'ENOSPC'});return target.sync();};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
  }};
  const f=await fixture(t,{fs:io}),a=await f.start(),one=await a.save();
  fail=true;await error(await a.req('POST','/api/screenshots',{requestId:randomUUID()}),500,'STORAGE_FAILED');
  fail=false;assert.deepEqual(await a.list(),[one]);await a.save();assert.equal((await a.list()).length,2);
});
