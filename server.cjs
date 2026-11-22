'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {randomBytes} = require('node:crypto');
const {captureRegion} = require('./backend/capture.cjs');
const {createStore,UUID} = require('./backend/store.cjs');
let busy = false;
const fail = code => Object.assign(new Error(code),{code});
const statusCodes={INVALID_INPUT:400,FORBIDDEN:403,BUSY:409,UNSUPPORTED_PLATFORM:501,CAPTURE_TIMEOUT:504,CAPTURE_FAILED:500,STORAGE_FAILED:500};

/** Local service factory. captureRegion and fs are injectable for deterministic failure tests.
 * Start with server.listen(port, '127.0.0.1'). The page exposes a csrf-token meta tag
 * and X-CSRF-Token response header; writes send this token and the session cookie.
 */
async function createScreenshotServer(options={}) {
  const directory=options.storageDirectory || path.join(os.homedir(),'Library','Application Support','WelcomeTabs','screenshots');
  const store=await createStore({directory,fs:options.fs});
  const csrfToken=randomBytes(32).toString('hex'), session=randomBytes(32).toString('hex');
  const capture=options.captureRegion || captureRegion;
  const timeoutMs=options.captureTimeoutMs ?? 120000;
  const server=http.createServer(async(req,res)=> {
    const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    try {
      const port=server.address()?.port;
      if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host)) throw fail('FORBIDDEN');
      if(req.headers['sec-fetch-site']==='cross-site') throw fail('FORBIDDEN');
      const origin=`http://${req.headers.host}`;
      const url=new URL(req.url,origin);
      const route=url.pathname;
      const writing=['POST','DELETE','PUT','PATCH'].includes(req.method);
      if(writing) {
        const cookies=(req.headers.cookie || '').split(';').map(c=>c.trim());
        if(req.headers.origin!==origin || req.headers['x-csrf-token']!==csrfToken || !cookies.includes(`welcometabs_session=${session}`)) throw fail('FORBIDDEN');
        if(!/^application\/json(?:\s*;.*)?$/i.test(req.headers['content-type'] || '')) throw fail('INVALID_INPUT');
      }
      if(req.method==='GET' && route==='/api/screenshots') {json(200,{items:await store.list()});return;}
      if(req.method==='POST' && route==='/api/screenshots') {
        let raw='', length=0;
        for await(const chunk of req) {length+=chunk.length;if(length>4096) throw fail('INVALID_INPUT');raw+=chunk.toString('utf8');}
        let body;try {body=JSON.parse(raw);} catch {throw fail('INVALID_INPUT');}
        if(!body || typeof body!=='object' || Object.keys(body).length!==1 || typeof body.requestId!=='string' || !UUID.test(body.requestId)) throw fail('INVALID_INPUT');
        if(busy) throw fail('BUSY');
        busy=true;
        let stage, outcome;
        try {
          const existing=await store.find(body.requestId);
          if(existing) {outcome={item:existing};} else {
            stage=await store.stage();
            const controller=new AbortController();
            let timer;
            try {
              timer=setTimeout(()=>controller.abort(),timeoutMs);
              let result;
              try {
                result=await capture({destination:stage.destination,signal:controller.signal,platform:options.platform ?? process.platform,timeoutMs});
              } catch(error) {
                if(controller.signal.aborted) throw fail('CAPTURE_TIMEOUT');
                throw fail(['UNSUPPORTED_PLATFORM','CAPTURE_TIMEOUT'].includes(error.code)?error.code:'CAPTURE_FAILED');
              }
              if(controller.signal.aborted) throw fail('CAPTURE_TIMEOUT');
              if(result?.status==='cancelled') outcome={cancelled:true};
              else if(result?.status!=='captured') throw fail('CAPTURE_FAILED');
            } finally {clearTimeout(timer);}
            if(!outcome) outcome={item:await store.commit(stage,body.requestId)};
          }
        } finally {
          try {if(stage) await store.discard(stage);} finally {busy=false;}
        }
        json(outcome.cancelled?200:201,outcome);return;
      }
      const match=route.match(/^\/api\/screenshots\/([^/]+)(\/image)?$/);
      if(match) {
        const id=match[1];if(!UUID.test(id)) throw fail('INVALID_INPUT');
        if(req.method==='GET' && match[2]) {
          const image=await store.image(id);if(!image) {json(404,{error:{code:'NOT_FOUND'}});return;}
          res.writeHead(200,{'Content-Type':'image/png'});res.end(image);return;
        }
        if(req.method==='DELETE' && !match[2]) {
          if(busy) throw fail('BUSY');busy=true;
          try {await store.remove(id);} finally {busy=false;}
          res.writeHead(204);res.end();return;
        }
      }
      // Explicit static allowlist prevents exposing backend source or storage paths.
      const staticFiles={'/':['index.html','text/html; charset=utf-8'],'/index.html':['index.html','text/html; charset=utf-8'],'/public/screenshots.js':['public/screenshots.js','text/javascript; charset=utf-8']};
      if(req.method==='GET' && staticFiles[route]) {
        const [file,type]=staticFiles[route];let data=await fs.readFile(path.join(__dirname,file));
        if(file==='index.html') {
          data=Buffer.from(data.toString('utf8').replace('</head>',`<meta name="csrf-token" content="${csrfToken}"></head>`));
          res.setHeader('Set-Cookie',`welcometabs_session=${session}; HttpOnly; SameSite=Strict; Path=/`);
          res.setHeader('X-CSRF-Token',csrfToken);
        }
        res.writeHead(200,{'Content-Type':type});res.end(data);return;
      }
      json(404,{error:{code:'NOT_FOUND'}});
    } catch(error) {
      if(res.headersSent) {res.destroy();return;}
      const code=statusCodes[error.code]?error.code:'STORAGE_FAILED';json(statusCodes[code],{error:{code}});
    }
  });
  server.requestTimeout=150000;server.headersTimeout=10000;
  return {server,csrfToken};
}
module.exports={createScreenshotServer};
if(require.main===module) {
  const port=Number(process.env.PORT || 3000);
  createScreenshotServer({storageDirectory:process.env.SCREENSHOT_DIRECTORY}).then(({server})=>{
    server.on('error',error=>{console.error(error.message);process.exitCode=1;});
    server.listen(port,'127.0.0.1',()=>console.log(`WelcomeTabs: http://127.0.0.1:${server.address().port}`));
  }).catch(error=>{console.error(error.message);process.exitCode=1;});
}
