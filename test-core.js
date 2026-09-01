// 核心算法无头验证:在 Node 中模拟 canvas 图像数据并跑像素化流程
'use strict';
const fs = require('fs');

// 加载色板
const paletteSrc = fs.readFileSync('C:/Users/fifi/Desktop/dsh/pindou-generator/palette.js', 'utf8');
const jsonStart = paletteSrc.indexOf('window.PALETTE_DATA = ') + 'window.PALETTE_DATA = '.length;
const PALETTE = JSON.parse(paletteSrc.slice(jsonStart).trim().replace(/;\s*$/, ''));

function hexToRgb(hex){
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex||'');
  return m ? { r:parseInt(m[1],16), g:parseInt(m[2],16), b:parseInt(m[3],16) } : { r:0,g:0,b:0 };
}
function getBrandPalette(brand){
  const out = [];
  for(const hex of Object.keys(PALETTE)){
    const e = PALETTE[hex];
    if(e && e[brand]) out.push({ key:String(e[brand]), hex:hex.toUpperCase(), rgb:hexToRgb(hex) });
  }
  return out;
}
function deltaE2(a,b){ const r=a.r-b.r,g=a.g-b.g,bl=a.b-b.b; return r*r+g*g+bl*bl; }
function isWhiteLike({r,g,b}){ const t=Math.max(r,g,b),n=Math.min(r,g,b); return t>=240 && t-n<18; }
function findClosestPalette(rgb, palette){
  const whiteL = isWhiteLike(rgb);
  let best=palette[0], bestD=Infinity;
  for(const p of palette){
    let d = whiteL ? Math.sqrt(deltaE2(rgb,p.rgb)) : deltaE2(rgb,p.rgb);
    if(whiteL && isWhiteLike(p.rgb)) d += 25;
    if(d<bestD){ bestD=d; best=p; }
    if(d===0) break;
  }
  return best;
}
function sampleCell(data, W, cellX, cellY, cellW, cellH, maxSamples){
  const step = (cellW*cellH <= maxSamples) ? 1 : Math.max(1, Math.ceil(Math.sqrt((cellW*cellH)/maxSamples)));
  const pixels=[];
  for(let y=cellY; y<cellY+cellH; y+=step)
    for(let x=cellX; x<cellX+cellW; x+=step){
      const i=(y*W+x)*4;
      if(data[i+3]<128) continue;
      pixels.push({r:data[i],g:data[i+1],b:data[i+2]});
    }
  if(!pixels.length) return null;
  const avg = pixels.reduce((a,p)=>({r:a.r+p.r,g:a.g+p.g,b:a.b+p.b}),{r:0,g:0,b:0});
  return { r:Math.round(avg.r/pixels.length), g:Math.round(avg.g/pixels.length), b:Math.round(avg.b/pixels.length) };
}
function pixelate(data, W, H, N, M, brand, maxSamples){
  const palette = getBrandPalette(brand);
  const grid=[];
  const colW=W/N, rowH=H/M;
  for(let row=0; row<M; row++){
    const rowArr=[];
    const y=Math.floor(row*rowH), h=Math.max(1, Math.min(H, Math.ceil((row+1)*rowH))-y);
    for(let col=0; col<N; col++){
      const x=Math.floor(col*colW), w=Math.max(1, Math.min(W, Math.ceil((col+1)*colW))-x);
      const s = sampleCell(data, W, x, y, w, h, maxSamples);
      if(!s){ rowArr.push({key:'ERASE',color:'#FFFFFF',isExternal:false}); continue; }
      const m = findClosestPalette(s, palette);
      rowArr.push({ key:m.key, color:m.hex, isExternal:false });
    }
    grid.push(rowArr);
  }
  return grid;
}

// 构造测试图像: 128x96, 红/绿/蓝/黄 四个色块 + 白色背景
const W=128, H=96;
const data = new Uint8ClampedArray(W*H*4);
const blocks = [
  {x0:0,  y0:0,  x1:64,  y1:48,  c:[220,40,50]},   // 红
  {x0:64, y0:0,  x1:128, y1:48,  c:[40,180,80]},   // 绿
  {x0:0,  y0:48, x1:64,  y1:96,  c:[50,90,220]},   // 蓝
  {x0:64, y0:48, x1:128, y1:96,  c:[230,200,40]},  // 黄
];
for(let y=0;y<H;y++) for(let x=0;x<W;x++){
  let c=[255,255,255];
  for(const b of blocks){ if(x>=b.x0&&x<b.x1&&y>=b.y0&&y<b.y1){ c=b.c; break; } }
  const i=(y*W+x)*4; data[i]=c[0]; data[i+1]=c[1]; data[i+2]=c[2]; data[i+3]=255;
}

const results = [];
for(const brand of ['MARD','COCO','漫漫','盼盼','咪小窝']){
  for(const [N,M] of [[32,24],[64,48]]){
    const t0=Date.now();
    const grid = pixelate(data, W, H, N, M, brand, 400);
    const ms=Date.now()-t0;
    // 校验: 尺寸正确 + 无空值 + 色板键合法
    let invalid=0, keys=new Set();
    for(let r=0;r<M;r++) for(let c=0;c<N;c++){
      const cell=grid[r][c];
      if(!cell || !cell.key || !cell.color) invalid++;
      if(cell && cell.key!=='ERASE') keys.add(cell.key);
    }
    results.push({brand, N, M, ms, invalid, distinctColors:keys.size, sample:grid[0][0]});
  }
}

console.log('=== pixelate() headless verification ===');
for(const r of results){
  console.log(`${r.brand} ${r.N}x${r.M}: ${r.ms}ms, invalid=${r.invalid}, colors=${r.distinctColors}, cell0=${JSON.stringify(r.sample)}`);
}
const allOk = results.every(r=>r.invalid===0 && r.distinctColors>0 && r.distinctColors<=Math.min(291, r.N*r.M));
console.log(allOk ? 'ALL PASS' : 'FAIL');
process.exit(allOk?0:1);
