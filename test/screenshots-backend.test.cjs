'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {randomUUID}=require('node:crypto');
const {EventEmitter}=require('node:events');
const {createScreenshotServer}=require('../server.cjs');
const {captureRegion}=require('../backend/capture.cjs');
const {pngDimensions}=require('../backend/store.cjs');
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==','base64');
async function fixture(t, options={}) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'welcometabs-formal-'));
  const servers=[];
  t.after(async()=>{for(const server of servers){server.closeAllConnections();await new Promise(r=>server.close(r));}await fs.rm(directory,{recursive:true,force:true});});
  async function start() {
    const app=await createScreenshotServer({storageDirectory:directory,platform:'darwin',captureTimeoutMs:30,captureRegion:async({destination})=>{await fs.writeFile(destination,PNG);return {status:'captured'};},...options});
    servers.push(app.server);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
    const base=`http://127.0.0.1:${app.server.address().port}`;
    const page=await fetch(base,{signal:AbortSignal.timeout(2000)}), html=await page.text();
    assert.ok(html.includes(`<meta name="csrf-token" content="${app.csrfToken}">`));
    const headers={Origin:base,'Content-Type':'application/json','X-CSRF-Token':app.csrfToken,Cookie:page.headers.getSetCookie()[0].split(';')[0]};
    const request=(method,route,body,extra={})=>fetch(base+route,{method,headers:{...headers,...extra},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(2000)});
    return {base,headers,request,save:async(id=randomUUID())=>{const r=await request('POST','/api/screenshots',{requestId:id});assert.equal(r.status,201);return (await r.json()).item;},list:async()=>{const r=await request('GET','/api/screenshots');assert.equal(r.status,200);return (await r.json()).items;}};
  }
  return {directory,start};
}
function raw(base,headers) {
  return new Promise((resolve,reject)=>{
    const request=http.request(base+'/api/screenshots',{method:'POST',headers:{...headers,Host:'evil.invalid'},timeout:2000},res=>{let data='';res.on('data',c=>data+=c);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(data)}));});
    request.on('timeout',()=>request.destroy(Error('timeout')));request.on('error',reject);request.end(JSON.stringify({requestId:randomUUID()}));
  });
}
test('backend: durable history, replay, sorting, image and targeted deletion', {timeout:8000},async t=>{
  const f=await fixture(t),a=await f.start(),id=randomUUID(),one=await a.save(id),two=await a.save();
  assert.deepEqual(await a.save(id),one);
  const b=await f.start();assert.deepEqual(await b.save(id),one);
  assert.deepEqual(await b.list(),[one,two].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id)));
  assert.deepEqual(Buffer.from(await (await b.request('GET',one.url)).arrayBuffer()),PNG);
  assert.equal((await fs.stat(path.join(f.directory,one.id,'metadata.json'))).mode&0o777,0o600);
  for(let n=0;n<2;n++) assert.equal((await b.request('DELETE',`/api/screenshots/${one.id}`)).status,204);
  assert.deepEqual(await (await f.start()).list(),[two]);
});
test('backend: Host, Origin, token, cookie, content type, input and symlink boundaries', {timeout:8000},async t=>{
  let calls=0;const f=await fixture(t,{captureRegion:async({destination})=>{calls++;await fs.writeFile(destination,PNG);return {status:'captured'};}}),a=await f.start(),one=await a.save();
  assert.deepEqual(await raw(a.base,a.headers),{status:403,data:{error:{code:'FORBIDDEN'}}});
  for(const extra of [{Origin:'http://evil.invalid'},{'X-CSRF-Token':'invalid'},{Cookie:''}]) assert.equal((await a.request('POST','/api/screenshots',{requestId:randomUUID()},extra)).status,403);
  assert.equal((await a.request('POST','/api/screenshots',{requestId:randomUUID()},{'Content-Type':'text/plain'})).status,400);
  for(const body of [{},{requestId:'../escape'},{requestId:randomUUID(),destination:'/tmp/file'}]) assert.equal((await a.request('POST','/api/screenshots',body)).status,400);
  assert.equal((await a.request('GET','/api/screenshots/%2e%2e%2fsecret/image')).status,400);
  const secret=path.join(f.directory,'secret');await fs.writeFile(secret,'PRIVATE');
  await fs.unlink(path.join(f.directory,one.id,'image.png'));await fs.symlink(secret,path.join(f.directory,one.id,'image.png'));
  const image=await a.request('GET',one.url);assert.equal(image.status,500);assert.ok(!(await image.text()).includes('PRIVATE'));assert.equal(calls,1);
});
test('backend: cancellation, timeout and invalid image preserve history and release lock', {timeout:8000},async t=>{
  let mode='good';const f=await fixture(t,{captureRegion:async({destination,signal})=>{
    if(mode==='cancel') return {status:'cancelled'};
    if(mode==='timeout') return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));
    await fs.writeFile(destination,mode==='invalid'?PNG.subarray(0,33):PNG);return {status:'captured'};
  }}),a=await f.start(),one=await a.save();
  for(const [next,status] of [['cancel',200],['timeout',504],['invalid',500]]) {mode=next;assert.equal((await a.request('POST','/api/screenshots',{requestId:randomUUID()})).status,status);assert.deepEqual(await a.list(),[one]);}
  mode='good';await a.save();assert.equal((await a.list()).length,2);
});
test('backend: lock prevents overlap until cancelled capture settles', {timeout:5000},async t=>{
  let release,entered;const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
  const f=await fixture(t,{captureTimeoutMs:1000,captureRegion:async()=>{entered();await gate;return {status:'cancelled'};}}),a=await f.start();
  const pending=a.request('POST','/api/screenshots',{requestId:randomUUID()});
  try {await ready;assert.equal((await a.request('POST','/api/screenshots',{requestId:randomUUID()})).status,409);}finally{release();}
  assert.deepEqual(await (await pending).json(),{cancelled:true});
});
test('backend: sync failure and rename failure never announce a save or lose history', {timeout:8000},async t=>{
  let mode='good';const io={...fs,rename:async(from,to)=>{if(mode==='rename')throw Error('disk');return fs.rename(from,to);},open:async(...args)=>{const h=await fs.open(...args);return new Proxy(h,{get(target,key){if(key==='sync')return async()=>{if(mode==='sync')throw Error('disk');return target.sync();};const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;}});}};
  const f=await fixture(t,{fs:io}),a=await f.start(),one=await a.save();
  for(const failure of ['sync','rename']) {mode=failure;assert.equal((await a.request('POST','/api/screenshots',{requestId:randomUUID()})).status,500);mode='good';assert.deepEqual(await a.list(),[one]);}
  mode='rename';assert.equal((await a.request('DELETE',`/api/screenshots/${one.id}`)).status,500);mode='good';assert.deepEqual(await a.list(),[one]);await a.save();
});
test('backend: pending cleanup and damaged metadata are distinct from empty history', {timeout:8000},async t=>{
  const f=await fixture(t),a=await f.start(),one=await a.save();
  for(const name of ['.pending','.trash']) {await fs.mkdir(path.join(f.directory,name,'abandoned'));await fs.writeFile(path.join(f.directory,name,'abandoned','image.png'),PNG);}
  const b=await f.start();assert.deepEqual(await b.list(),[one]);for(const name of ['.pending','.trash'])assert.deepEqual(await fs.readdir(path.join(f.directory,name)),[]);
  await fs.writeFile(path.join(f.directory,one.id,'metadata.json'),'broken');const r=await b.request('GET','/api/screenshots');assert.equal(r.status,500);assert.deepEqual(await r.json(),{error:{code:'STORAGE_FAILED'}});
});
test('PNG validator rejects corrupt CRC, truncated raster and trailing bytes',()=>{
  assert.deepEqual(pngDimensions(PNG),{width:1,height:1});
  const corrupt=Buffer.from(PNG);corrupt[45]^=1;
  for(const data of [corrupt,PNG.subarray(0,33),Buffer.concat([PNG,Buffer.from('extra')])])assert.throws(()=>pngDimensions(data),{code:'CAPTURE_FAILED'});
});
test('capture: absolute command, timeout escalation and close before rejection', {timeout:3000},async()=>{
  const child=new EventEmitter(),kills=[];let closed=false;
  child.kill=signal=>{kills.push(signal);if(signal==='SIGKILL')setImmediate(()=>{closed=true;child.emit('close',null,signal);});};
  await assert.rejects(captureRegion({destination:'/unused',platform:'darwin',timeoutMs:10,spawn:(cmd,args,options)=>{assert.equal(cmd,'/usr/sbin/screencapture');assert.deepEqual(args,['-i','-s','-x','-t','png','/unused']);assert.equal(options.shell,false);return child;}}),{code:'CAPTURE_TIMEOUT'});
  assert.deepEqual(kills,['SIGTERM','SIGKILL']);assert.ok(closed);
  await assert.rejects(captureRegion({destination:'/unused',platform:'linux',spawn:()=>assert.fail('must not spawn')}),{code:'UNSUPPORTED_PLATFORM'});
});
test('backend: parent directory sync gates both response and visible publication', {timeout:8000},async t=>{
  let mode='good',root,entered,release;
  const reached=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
  const io={...fs,open:async(...args)=>{const h=await fs.open(...args);return new Proxy(h,{get(target,key){if(key==='sync')return async()=>{
    if(args[0]===root && mode==='gate'){entered();await gate;}
    if(args[0]===root && mode==='fail')throw Error('directory sync failed');
    return target.sync();
  };const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;}});}};
  const f=await fixture(t,{fs:io});root=f.directory;const a=await f.start(),one=await a.save();
  mode='gate';let settled=false;
  const pending=a.request('POST','/api/screenshots',{requestId:randomUUID()}).then(r=>{settled=true;return r;});
  try {await reached;assert.equal(settled,false);assert.deepEqual(await a.list(),[one]);} finally {mode='good';release();}
  assert.equal((await pending).status,201);
  const before=await a.list();mode='fail';assert.equal((await a.request('POST','/api/screenshots',{requestId:randomUUID()})).status,500);
  mode='good';assert.deepEqual(await a.list(),before);
  mode='fail';assert.equal((await a.request('DELETE',`/api/screenshots/${one.id}`)).status,500);
  mode='good';assert.deepEqual(await a.list(),before);
});
