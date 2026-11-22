'use strict';
const nativeFs = require('node:fs/promises');
const {constants} = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {inflateSync} = require('node:zlib');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = code => Object.assign(new Error(code), {code});
const MAX_IMAGE = 128 * 1024 * 1024;

// Validate the complete compressed raster, including Adam7 passes and row filters.
function crc32(bytes) {
  let crc=0xffffffff;
  for(const byte of bytes) {crc^=byte;for(let bit=0;bit<8;bit++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
function pngDimensions(data) {
  const invalid = () => {throw fail('CAPTURE_FAILED');};
  if (data.length < 45 || !data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) invalid();
  let offset=8, width, height, depth, color, interlace, ended=false, palette=false;
  const parts=[];
  while(offset+12<=data.length) {
    const size=data.readUInt32BE(offset), type=data.toString('ascii',offset+4,offset+8);
    if(size>MAX_IMAGE || offset+12+size>data.length) invalid();
    const chunk=data.subarray(offset+8,offset+8+size);
    if(crc32(data.subarray(offset+4,offset+8+size))!==data.readUInt32BE(offset+8+size)) invalid();
    if(offset===8 && type!=='IHDR') invalid();
    if(type==='IHDR') {
      if(width!==undefined || size!==13) invalid();
      width=chunk.readUInt32BE(0); height=chunk.readUInt32BE(4); depth=chunk[8]; color=chunk[9]; interlace=chunk[12];
      const depths={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
      if(!width || !height || !depths[color]?.includes(depth) || chunk[10] || chunk[11] || interlace>1) invalid();
    } else if(type==='PLTE') {if(!size || size%3 || size>768) invalid(); palette=true;}
    else if(type==='IDAT') parts.push(chunk);
    else if(type==='IEND') {if(size) invalid(); ended=true; offset+=12; break;}
    else if(!/^[a-z]/.test(type)) invalid();
    offset+=size+12;
  }
  if(!ended || offset!==data.length || !parts.length || (color===3 && !palette)) invalid();
  const channels={0:1,2:3,3:1,4:2,6:4}[color];
  const passes=interlace ? [[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]] : [[0,0,1,1]];
  const rows=[]; let expected=0;
  for(const [x,y,dx,dy] of passes) {
    const w=Math.max(0,Math.ceil((width-x)/dx)), h=Math.max(0,Math.ceil((height-y)/dy));
    if(!w || !h) continue;
    const row=Math.ceil(w*channels*depth/8)+1;
    expected+=row*h; rows.push([row,h]);
  }
  if(expected>MAX_IMAGE) invalid();
  let raster;
  try {raster=inflateSync(Buffer.concat(parts),{maxOutputLength:expected});} catch {invalid();}
  if(raster.length!==expected) invalid();
  let pos=0;
  for(const [row,h] of rows) for(let y=0;y<h;y++,pos+=row) if(raster[pos]>4) invalid();
  return {width,height};
}

async function createStore({directory, fs=nativeFs}) {
  if(!path.isAbsolute(directory)) throw fail('STORAGE_FAILED');
  const pending=path.join(directory,'.pending'), trash=path.join(directory,'.trash');
  const unpublished=new Set();
  async function dir(name) {
    await fs.mkdir(name,{recursive:true,mode:0o700});
    if(!(await fs.lstat(name)).isDirectory()) throw fail('STORAGE_FAILED');
    await fs.chmod(name,0o700);
  }
  async function sync(name) {const h=await fs.open(name,'r'); try {await h.sync();} finally {await h.close();}}
  async function regular(name) {
    const h=await fs.open(name,constants.O_RDONLY|constants.O_NOFOLLOW);
    try {const s=await h.stat(); if(!s.isFile() || s.size>MAX_IMAGE) throw fail('STORAGE_FAILED'); return await h.readFile();} finally {await h.close();}
  }
  await dir(directory); await dir(pending); await dir(trash);
  for(const parent of [pending,trash]) {
    for(const entry of await fs.readdir(parent)) await fs.rm(path.join(parent,entry),{recursive:true,force:true});
    await sync(parent);
  }
  async function records() {
    const result=[];
    for(const id of await fs.readdir(directory)) {
      if(!UUID.test(id) || unpublished.has(id)) continue;
      const base=path.join(directory,id);
      if(!(await fs.lstat(base)).isDirectory()) throw fail('STORAGE_FAILED');
      const m=JSON.parse((await regular(path.join(base,'metadata.json'))).toString('utf8'));
      if(m.id!==id || !UUID.test(m.requestId) || !Number.isInteger(m.width) || m.width<1 || !Number.isInteger(m.height) || m.height<1 || new Date(m.createdAt).toISOString()!==m.createdAt || m.url!==`/api/screenshots/${id}/image`) throw fail('STORAGE_FAILED');
      result.push(m);
    }
    return result.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
  }
  const publicItem = ({id,createdAt,width,height,url}) => ({id,createdAt,width,height,url});
  return {
    list:async()=> (await records()).map(publicItem),
    find:async requestId=> {const m=(await records()).find(m=>m.requestId===requestId);return m && publicItem(m);},
    async stage() {const id=randomUUID(), base=path.join(pending,id);await fs.mkdir(base,{mode:0o700});return {id,base,destination:path.join(base,'image.png')};},
    async discard(stage) {await fs.rm(stage.base,{recursive:true,force:true});},
    async commit(stage,requestId) {
      let data;
      try {data=await regular(stage.destination);} catch(error) {if(error.code==='ENOENT') throw fail('CAPTURE_FAILED');throw error;}
      const dimensions=pngDimensions(data);
      const item={id:stage.id,createdAt:new Date().toISOString(),...dimensions,url:`/api/screenshots/${stage.id}/image`};
      await fs.chmod(stage.destination,0o600);
      await fs.writeFile(path.join(stage.base,'metadata.json'),JSON.stringify({...item,requestId}),{mode:0o600,flag:'wx'});
      await sync(stage.destination);await sync(path.join(stage.base,'metadata.json'));await sync(stage.base);
      const target=path.join(directory,stage.id);
      unpublished.add(stage.id);
      try {await fs.rename(stage.base,target);} catch(error) {unpublished.delete(stage.id);throw error;}
      try {await sync(pending);await sync(directory);} catch(error) {
        // A failed durability barrier must not leave a visible successful capture.
        await fs.rename(target,stage.base); unpublished.delete(stage.id); throw error;
      }
      unpublished.delete(stage.id);
      return item;
    },
    async image(id) {
      if(!(await records()).some(m=>m.id===id)) return null;
      return regular(path.join(directory,id,'image.png'));
    },
    async remove(id) {
      const source=path.join(directory,id), target=path.join(trash,randomUUID());
      try {if(!(await fs.lstat(source)).isDirectory()) throw fail('STORAGE_FAILED');await fs.rename(source,target);} catch(error) {if(error.code==='ENOENT') return;throw error;}
      try {await sync(directory);await sync(trash);} catch(error) {await fs.rename(target,source);throw error;}
      // Failure here is recoverable at startup; the deletion is already committed.
      void fs.rm(target,{recursive:true,force:true}).catch(()=>{});
    }
  };
}
module.exports={createStore,pngDimensions,UUID};
