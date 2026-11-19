const {chromium}=require('playwright');
const fs=require('node:fs');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const started=new Date().toISOString();
 const browser=await chromium.launch({headless:true,executablePath:require('node:path').join(__dirname,'browsers/chromium_headless_shell-1208/chrome-linux/headless_shell'),args:['--no-sandbox','--disable-crash-reporter','--disable-crashpad']});
 const report={started,revision:'3894720644e52b779e40ce2663768fc5fa77c390',sha256:crypto.createHash('sha256').update(fs.readFileSync('/work/index.html')).digest('hex'),browser:await browser.version(),node:process.version,platform:process.platform,arch:process.arch,runs:[]};
 try{
 for(const viewport of [{width:1280,height:800},{width:320,height:568}]){
 const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('file:///work/index.html');
 const snapshot=()=>page.evaluate(()=>{const b=document.querySelector('button'),w=document.querySelector('#welcome-message');const r=e=>{const a=e.getBoundingClientRect();return {x:a.x,y:a.y,width:a.width,height:a.height,right:a.right,bottom:a.bottom}};const s=getComputedStyle(b);return {welcome:w.textContent,button:b.textContent,focused:document.activeElement===b,focusVisible:b.matches(':focus-visible'),outline:{style:s.outlineStyle,width:s.outlineWidth,color:s.outlineColor},buttonRect:r(b),welcomeRect:r(w),h1:document.querySelector('h1').textContent,title:document.title,lang:document.documentElement.lang,scrollWidth:document.documentElement.scrollWidth};});
 const observations=[];
 async function check(action,en){const s=await snapshot();assert.equal(s.welcome,en?'Welcome':'欢迎');assert.equal(s.button,en?'中文':'English');assert.equal(s.h1,'欢迎来到这里');assert.equal(s.title,'欢迎来到这里');assert.equal(s.lang,'zh-CN');assert.ok(s.buttonRect.x>=0&&s.buttonRect.right<=viewport.width);assert.ok(s.buttonRect.bottom<s.welcomeRect.y);assert.ok(s.buttonRect.y<80);assert.ok(s.scrollWidth<=viewport.width);observations.push({action,...s});return s;}
 await check('initial',false);
 await page.locator('button').click();await check('pointer click to English',true);await page.screenshot({path:path.join(__dirname,`english-${viewport.width}.png`)});
 await page.locator('button').click();await check('pointer click to Chinese',false);
 await page.reload();await page.keyboard.press('Tab');const focus=await check('reload then Tab',false);assert.ok(focus.focused&&focus.focusVisible);assert.equal(focus.outline.style,'solid');assert.equal(focus.outline.width,'3px');
 await page.screenshot({path:path.join(__dirname,`focus-${viewport.width}.png`)});
 await page.keyboard.press('Enter');await check('Enter to English',true);
 await page.keyboard.press('Space');await check('Space to Chinese',false);
 await page.screenshot({path:path.join(__dirname,`chinese-${viewport.width}.png`)});
 await page.keyboard.press('Space');await check('Space to English',true);
 await page.keyboard.press('Enter');await check('Enter to Chinese',false);
 assert.deepEqual(errors,[]);report.runs.push({viewport,observations,errors});await page.close();
 }
 report.status='passed';
 }finally{report.finished=new Date().toISOString();fs.writeFileSync(path.join(__dirname,'browser-results.json'),JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1});
