const {chromium} = require(process.env.DEVDESK_RUNTIME_DIR + '/node/node_modules/playwright');
const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
 const root = path.resolve(__dirname, '../../..');
 const pageFile = path.join(root, 'index.html');
 const sha = crypto.createHash('sha256').update(fs.readFileSync(pageFile)).digest('hex');
 const report = {started_at: new Date().toISOString(), base_revision: 'c658d0275bd81102dceeb050fd8cb0b0589063f8', code: {path:'index.html', algorithm:'sha256', digest:sha}, note:'SHA identifies the exact uncommitted page bytes; final Git revision is assigned by the platform.', checks:[]};
 const browser = await chromium.launch({executablePath:process.env.DEVDESK_RUNTIME_CACHE + '/browsers/chromium-1208/chrome-linux/chrome', headless:true, args:['--no-sandbox']});
 report.browser = browser.version();
 try {
 for (const width of [320,1280]) {
  const page = await browser.newPage({viewport:{width,height:720}});
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.goto('file://' + pageFile);
  async function check(state,english,screenshot) {
   assert.equal(await page.locator('#language-hint').count(),1);
   assert.equal(await page.locator('#language-hint').textContent(),english?'Language switching supports keyboard controls':'语言切换支持键盘操作');
   assert.equal(await page.locator('#language-hint').getAttribute('lang'),english?'en':'zh');
   assert.equal(await page.locator('#welcome-message').textContent(),english?'Welcome':'欢迎');
   assert.equal(await page.locator('#language-toggle').textContent(),english?'中文':'English');
   assert.equal(await page.title(),'欢迎来到这里');
   const layout=await page.evaluate(()=>{
    const ids=['language-toggle','welcome-message','language-hint'];
    const rects=ids.map(id=>{const r=document.getElementById(id).getBoundingClientRect();return {id,x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};});
    return {rects, scrollWidth:document.documentElement.scrollWidth, viewport:innerWidth};
   });
   assert.ok(layout.scrollWidth<=width);
   for(const r of layout.rects) assert.ok(r.x>=0&&r.right<=width&&r.y>=0&&r.bottom<=720&&r.height>0,JSON.stringify(r));
   for(let i=0;i<layout.rects.length;i++) for(let j=i+1;j<layout.rects.length;j++) {
    const a=layout.rects[i],b=layout.rects[j]; assert.ok(a.right<=b.x||b.right<=a.x||a.bottom<=b.y||b.bottom<=a.y);
   }
   if(screenshot) await page.screenshot({path:path.join(__dirname,screenshot),fullPage:true});
   report.checks.push({width,state,passed:true,screenshot,layout});
  }
  await check('initial-zh',false,`${width}-initial-zh.png`);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#language-toggle').evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Enter');
  await check('en-keyboard-enter',true,`${width}-en.png`);
  await page.reload(); await check('reload-from-en',false);
  await page.locator('#language-toggle').focus(); await page.keyboard.press('Space');
  await check('en-keyboard-space',true);
  await page.keyboard.press('Enter'); await check('returned-zh',false,`${width}-returned-zh.png`);
  await page.reload(); await check('reload-from-returned-zh',false);
  assert.deepEqual(errors,[]); await page.close();
 }
 report.status='passed';
 } finally {await browser.close(); report.finished_at=new Date().toISOString();fs.writeFileSync(path.join(__dirname,'browser-report.json'),JSON.stringify(report,null,2)+'\n');}
})().catch(e=>{console.error(e);process.exitCode=1;});
