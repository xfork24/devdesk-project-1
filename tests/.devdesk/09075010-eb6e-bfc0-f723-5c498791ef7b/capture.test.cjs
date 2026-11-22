'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {EventEmitter}=require('node:events');
const {captureRegion}=require('../../../backend/capture.cjs');
async function destination(t) {
  const dir=await fs.mkdtemp(path.join(__dirname,'capture-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true})); return path.join(dir,'image.png');
}
function child() {
  const c=new EventEmitter(); c.stdout=new EventEmitter(); c.stderr=new EventEmitter(); c.kills=[];
  c.kill=signal=>{c.kills.push(signal); queueMicrotask(()=>{c.emit('exit',null,signal);c.emit('close',null,signal);});return true;};
  return c;
}
function code(error){return error.code || error.error?.code;}
test('C01 system selection uses absolute executable and literal args; absent output cancels', {timeout:3000}, async t=>{
  const dest=await destination(t);let invocation;
  const result=await captureRegion({destination:dest,platform:'darwin',signal:new AbortController().signal,timeoutMs:500,spawn:(...args)=>{
    invocation=args;const c=child();setImmediate(()=>{c.emit('exit',0,null);c.emit('close',0,null);});return c;
  }});
  assert.deepEqual(result,{status:'cancelled'});
  assert.equal(invocation[0],'/usr/sbin/screencapture');
  assert.deepEqual(invocation[1],['-i','-s','-x','-t','png',dest]);
  assert.equal(invocation[2].shell,false);
});
test('C02 nonzero and spawn failure report capture failure', {timeout:3000}, async t=>{
  const dest=await destination(t);
  for(const mode of ['exit','error']) await assert.rejects(captureRegion({destination:dest,platform:'darwin',timeoutMs:500,spawn:()=>{
    const c=child();setImmediate(()=>{if(mode==='exit'){c.emit('exit',1,null);c.emit('close',1,null);}else c.emit('error',Object.assign(Error('spawn'),{code:'EACCES'}));});return c;
  }}),e=>code(e)==='CAPTURE_FAILED');
});
test('C03 timeout terminates and reaps process; abort also terminates', {timeout:4000}, async t=>{
  const dest=await destination(t);
  for(const mode of ['timeout','abort']) {
    const c=child(), controller=new AbortController();let closed=false;
    c.once('close',()=>{closed=true;});
    const pending=captureRegion({destination:dest,platform:'darwin',signal:controller.signal,timeoutMs:30,spawn:()=>c});
    if(mode==='abort') setImmediate(()=>controller.abort());
    if(mode==='timeout') await assert.rejects(pending,e=>code(e)==='CAPTURE_TIMEOUT');
    else {try {await pending;} catch(e) {assert.ok(['CAPTURE_FAILED','CAPTURE_TIMEOUT','ABORT_ERR'].includes(code(e)));}}
    assert.ok(c.kills.length,'must terminate child');assert.equal(closed,true,'must reap before settling');
  }
});
test('C04 unsupported platforms never spawn', {timeout:2000}, async t=>{
  const dest=await destination(t);let count=0;
  await assert.rejects(captureRegion({destination:dest,platform:'linux',spawn:()=>{count++;return child();}}),e=>code(e)==='UNSUPPORTED_PLATFORM');
  assert.equal(count,0);
});
