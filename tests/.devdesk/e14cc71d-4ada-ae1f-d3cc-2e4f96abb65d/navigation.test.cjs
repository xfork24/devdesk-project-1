'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {open,key,screenshots}=require('./dom.cjs');
const expanded=b=>b.getAttribute('aria-expanded')==='true';
function press(b,k) { const event=key(b,k); assert.equal(event.defaultPrevented,true,`${k} consumes scrolling even at a boundary`); }
function welcome(p,b,src,zoom) {
  assert.equal(p.get('gallery-image').src,src); assert.equal(p.document.activeElement,b);
  assert.equal(expanded(b),zoom); assert.equal(p.document.body.style.overflow,zoom?'hidden':'');
}
for(const zoom of [false,true]) {
  test(`AC-1 welcome continuous bidirectional navigation, expanded=${zoom}`,()=>{
    const p=open(), b=p.get('gallery-trigger'), img=p.get('gallery-image');
    // Observe the actual immutable photo order using existing mouse controls.
    const sources=[]; for(let i=0;i<5;i++){sources.push(img.src);p.get('gallery-next').click();}
    assert.equal(new Set(sources).size,5); p.load(); b.focus(); if(zoom)b.click();
    for(const [k,i] of [['ArrowRight',1],['ArrowRight',2],['ArrowLeft',1],['ArrowRight',2],['ArrowRight',3],['ArrowLeft',2]]) {
      press(b,k); p.load(); welcome(p,b,sources[i],zoom);
    }
  });
  test(`AC-3 welcome first and last do not wrap, expanded=${zoom}`,()=>{
    const p=open(), b=p.get('gallery-trigger');p.load();b.focus();if(zoom)b.click();
    const first=p.get('gallery-image').src;press(b,'ArrowLeft');welcome(p,b,first,zoom);
    for(let i=0;i<4;i++)press(b,'ArrowRight');p.load();
    const last=p.get('gallery-image').src;assert.notEqual(last,first);
    for(let i=0;i<3;i++){press(b,'ArrowRight');welcome(p,b,last,zoom);}
  });
  test(`AC-4 welcome only focused image consumes horizontal keys, expanded=${zoom}`,()=>{
    const p=open(), b=p.get('gallery-trigger'), other=p.get('language-toggle');p.load();b.focus();if(zoom)b.click();
    const first=p.get('gallery-image').src;other.focus();
    for(const node of [other,b]){const e=key(node,'ArrowRight');assert.equal(e.defaultPrevented,false);assert.equal(p.get('gallery-image').src,first);assert.equal(p.document.activeElement,other);}
    other.click();assert.equal(other.textContent,'中文'); // Original control still works.
    b.focus();for(const k of ['ArrowUp','ArrowDown'])assert.equal(key(b,k).defaultPrevented,false);
    press(b,'ArrowRight');assert.notEqual(p.get('gallery-image').src,first);assert.equal(p.document.activeElement,b);assert.equal(expanded(b),zoom);
  });
  test(`AC-3 welcome singleton, expanded=${zoom}`,()=>{
    const p=open({photoCount:1}), b=p.get('gallery-trigger');p.load();b.focus();if(zoom)b.click();
    const src=p.get('gallery-image').src;
    for(const k of ['ArrowLeft','ArrowRight','ArrowRight','ArrowLeft']){press(b,k);welcome(p,b,src,zoom);}
  });
}
test('AC-3 welcome empty data: no request or selection on arrow keys',()=>{
  const p=open({photoCount:0}), b=p.get('gallery-trigger');b.focus();
  const before=p.get('gallery-image').src;
  for(const k of ['ArrowLeft','ArrowRight']){press(b,k);assert.equal(p.get('gallery-image').src,before);assert.equal(p.document.activeElement,b);assert.equal(expanded(b),false);}
  assert.equal(p.pending.length,0);
});
function checkScreenshot(p,i,zoom) {
  const buttons=p.buttons();assert.equal(p.document.activeElement,buttons[i]);
  assert.deepEqual(buttons.map(expanded),buttons.map((_,j)=>zoom&&i===j));
  assert.equal(p.document.body.style.overflow,zoom?'hidden':'auto');
}
for(const zoom of [false,true]) {
  test(`AC-2 screenshots four directions and repeated transfer, expanded=${zoom}`,async()=>{
    const p=await screenshots(5), bs=p.buttons();p.document.body.style.overflow='auto';bs[0].focus();if(zoom)bs[0].click();
    for(const [from,k,to] of [[0,'ArrowRight',1],[1,'ArrowDown',4],[4,'ArrowLeft',3],[3,'ArrowUp',0],[0,'ArrowDown',3],[3,'ArrowRight',4],[4,'ArrowUp',1],[1,'ArrowLeft',0]]) {
      press(bs[from],k);checkScreenshot(p,to,zoom);assert.equal(p.calls.length,0,'navigation must not restore scroll');
      if(zoom){assert.match(bs[to].getAttribute('aria-label'),/还原/);assert.match(bs[from].getAttribute('aria-label'),/放大/);}
    }
    if(zoom){p.get('language-toggle').click();assert.equal(bs[0].getAttribute('aria-label'),'Restore screenshot');press(bs[0],'ArrowRight');assert.equal(bs[1].getAttribute('aria-label'),'Restore screenshot');key(bs[1],'Escape');assert.equal(p.document.activeElement,bs[1]);assert.equal(p.document.body.style.overflow,'auto');assert.equal(p.window.scrollY,123);assert.equal(p.window.scrollX,7);assert.equal(bs.some(expanded),false);}
  });
  test(`AC-3 screenshot edges and incomplete-row gaps, expanded=${zoom}`,async()=>{
    const p=await screenshots(5), bs=p.buttons();p.document.body.style.overflow='auto';
    // Three columns: [0,1,2] / [3,4]. No diagonal or cross-row fallback.
    for(const [i,k] of [[0,'ArrowLeft'],[0,'ArrowUp'],[2,'ArrowRight'],[2,'ArrowDown'],[3,'ArrowLeft'],[3,'ArrowDown'],[4,'ArrowRight'],[4,'ArrowDown']]) {
      bs[i].focus();if(zoom)bs[i].click();press(bs[i],k);checkScreenshot(p,i,zoom);if(zoom)key(bs[i],'Escape');
    }
  });
  test(`AC-2 screenshots recompute supplied current layout, expanded=${zoom}`,async()=>{
    const p=await screenshots(5),bs=p.buttons();p.document.body.style.overflow='auto';bs[0].focus();if(zoom)bs[0].click();
    p.layout(2);press(bs[0],'ArrowDown');checkScreenshot(p,2,zoom);
    p.layout(1);press(bs[2],'ArrowDown');checkScreenshot(p,3,zoom);
    press(bs[3],'ArrowRight');checkScreenshot(p,3,zoom);
    press(bs[3],'ArrowUp');checkScreenshot(p,2,zoom);
  });
  test(`AC-4 screenshots blur, other controls, and refocus, expanded=${zoom}`,async()=>{
    const p=await screenshots(5),bs=p.buttons(),other=p.get('capture-screenshot');p.document.body.style.overflow='auto';bs[0].focus();if(zoom)bs[0].click();other.focus();
    let seen=0;other.addEventListener('keydown',()=>seen++);
    for(const k of ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown']){assert.equal(key(other,k).defaultPrevented,false);assert.equal(key(bs[0],k).defaultPrevented,false);assert.equal(p.document.activeElement,other);assert.deepEqual(bs.map(expanded),bs.map((_,i)=>zoom&&i===0));}
    assert.equal(seen,4);bs[0].focus();assert.equal(key(bs[0],'q').defaultPrevented,false);press(bs[0],'ArrowRight');checkScreenshot(p,1,zoom);
  });
  test(`AC-3 screenshot singleton, expanded=${zoom}`,async()=>{
    const p=await screenshots(1),b=p.buttons()[0];p.document.body.style.overflow='auto';b.focus();if(zoom)b.click();
    for(const k of ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown']){press(b,k);checkScreenshot(p,0,zoom);}
  });
}
test('AC-3 screenshots empty collection preserves control focus',async()=>{
  const p=await screenshots(0),other=p.get('capture-screenshot');other.focus();
  for(const k of ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown']){assert.equal(key(other,k).defaultPrevented,false);assert.equal(p.document.activeElement,other);assert.equal(p.buttons().length,0);assert.equal(p.document.body.style.overflow,'');}
});
for(const zoom of [false,true]) test(`AC-2 geometry rather than insertion order, expanded=${zoom}`,async()=>{
  const p=await screenshots(5),bs=p.buttons();p.document.body.style.overflow='auto';
  // DOM order remains 0..4, current visual order is [2,0,4] / [1,3].
  for(const [slot,i] of [2,0,4,1,3].entries())p.cards()[i].rect={left:(slot%3)*230,top:Math.floor(slot/3)*180,width:210,height:160};
  bs[0].focus();if(zoom)bs[0].click();
  for(const [from,k,to] of [[0,'ArrowLeft',2],[2,'ArrowDown',1],[1,'ArrowRight',3],[3,'ArrowUp',0],[0,'ArrowRight',4]]){press(bs[from],k);checkScreenshot(p,to,zoom);}
  press(bs[4],'ArrowDown');checkScreenshot(p,4,zoom);
});
