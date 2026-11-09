// Render every SVG under <dir> in Chrome and in resvg (the native renderer) and compare.
// node svgcheck.cjs <dir> <work-dir> [scale=2]
// Metrics, at zoom <scale>, over white and over black (white ink on transparent shows only on black); the worse backdrop is reported: a pixel differs when a channel differs by more than 48.
//  strict  - differing pixels / ink pixels
//  shift   - differing pixels outside the per-channel range of the other render's 3x3 neighbourhood, both ways (edge antialiasing removed)
//  noText  - shift metric with every <text> removed from both renders (geometry only; text is TASK-E02-12)
//  blob    - largest 8-connected group of shift pixels; the verdict is blob <= BLOB (default 0, i.e. no shift pixel) outside text
//  normalized - for files using a feature in GAPS: resvg on the file after the fix the native loader must apply (pathLength: rescale dashes;
//               blurFn: CSS filter:blur() becomes an feGaussianBlur whose region is the painted box plus 3 sigma + 1, as Chrome paints it;
//               a form it cannot rewrite is listed in unhandledGaps and fails)
//               against Chrome on the original file, geometry only
//  empty   - no ink in either render over white nor over black: nothing was compared, so the file does not pass and needs an explanation
const fs=require('fs'),path=require('path'),os=require('os'),{execFileSync}=require('child_process');
const {chromium}=require('playwright');
const [DIR,WORK,SC='2']=process.argv.slice(2);const S=+SC;
const RESVG=process.env.RESVG||path.join(os.homedir(),'.cargo/bin/resvg'+(process.platform==='win32'?'.exe':''));
const files=[];(function walk(d){for(const f of fs.readdirSync(d).sort()){const p=path.join(d,f);if(fs.statSync(p).isDirectory())walk(p);else if(f.endsWith('.svg'))files.push(p);}})(DIR);
fs.mkdirSync(path.join(WORK,'resvg'),{recursive:true});fs.mkdirSync(path.join(WORK,'diff'),{recursive:true});
const id=f=>path.relative(DIR,f).replace(/[\\/]/g,'__').replace(/\.svg$/,'');
// SVG features resvg does not implement; the native renderer must handle them itself
const BLOB=+(process.env.BLOB||0);
const GAPS={pathLength:/\spathLength=/,blurFn:/(?:^|[\s;"'{])filter:[^;"']*blur\(/};

function resvg(svg,out){const tmp=out.replace(/\.png$/,'.svg');fs.writeFileSync(tmp,svg);
  try{execFileSync(RESVG,['--zoom',String(S),tmp,out],{stdio:['ignore','ignore','pipe']});return null;}catch(e){return String(e.stderr||e.message).slice(0,300);}finally{fs.rmSync(tmp,{force:true});}}

async function compare(p,svg,png,BG=255){return p.evaluate(async([svg,png,S,BG])=>{
  const load=src=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>i.decode().then(()=>res(i),()=>res(i));i.onerror=()=>rej(new Error('load'));i.src=src;});
  const a=await load('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg));const W=Math.round(a.naturalWidth*S),H=Math.round(a.naturalHeight*S);
  const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(a,0,0,W,H);const d1=g.getImageData(0,0,W,H).data;
  if(!png)return {W,H,missing:true};const bimg=await load('data:image/png;base64,'+png);if(bimg.width!==W||bimg.height!==H)return {W,H,size:[bimg.width,bimg.height]};
  g.clearRect(0,0,W,H);g.drawImage(bimg,0,0);const d2=g.getImageData(0,0,W,H).data;
  const flat=d=>{const f=new Float32Array(W*H*3);for(let q=0;q<W*H;q++)for(let j=0;j<3;j++)f[q*3+j]=BG+(d[q*4+j]-BG)*d[q*4+3]/255;return f;};const A=flat(d1),B=flat(d2);
  const df=(P,p,Q,q)=>Math.max(Math.abs(P[p*3]-Q[q*3]),Math.abs(P[p*3+1]-Q[q*3+1]),Math.abs(P[p*3+2]-Q[q*3+2]));
  // P's pixel lies (per channel, +-48) within the range Q spans in its 3x3 neighbourhood: an edge moved by up to 1px with any coverage
  const near=(P,Q,x,y)=>{for(let j=0;j<3;j++){let lo=255,hi=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const u=x+dx,v=y+dy;if(u>=0&&v>=0&&u<W&&v<H){const w=Q[(v*W+u)*3+j];if(w<lo)lo=w;if(w>hi)hi=w;}}
    const z=P[(y*W+x)*3+j];if(z<lo-48||z>hi+48)return false;}return true;};
  let bad=0,shift=0,ink=0;const out=g.createImageData(W,H),mask=new Uint8Array(W*H);
  for(let q=0;q<W*H;q++){const i=q*4,d=df(A,q,B,q);out.data[i+3]=255;
    for(let j=0;j<3;j++)if(Math.abs(A[q*3+j]-BG)>5||Math.abs(B[q*3+j]-BG)>5){ink++;break;}
    if(d>48){bad++;const x=q%W,y=(q-x)/W;if(!near(A,B,x,y)||!near(B,A,x,y)){shift++;mask[q]=1;out.data[i]=255;}else{out.data[i]=255;out.data[i+1]=200;}}
    else out.data[i]=out.data[i+1]=out.data[i+2]=200+A[q*3]/5;}
  // largest 8-connected blob of shift-bad pixels: antialiasing noise is scattered, a geometry difference is a blob
  let blob=0;for(let q0=0;q0<W*H;q0++)if(mask[q0]===1){let n=0;const st=[q0];mask[q0]=2;while(st.length){const q=st.pop();n++;const x=q%W,y=(q-x)/W;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const u=x+dx,v=y+dy,k=v*W+u;if(u>=0&&v>=0&&u<W&&v<H&&mask[k]===1){mask[k]=2;st.push(k);}}}blob=Math.max(blob,n);}
  g.putImageData(out,0,0);const diff=shift?c.toDataURL().split(',')[1]:null;c.width=c.height=0;return {W,H,bad,shift,blob,ink,diff};},[svg,png,S,BG]);}
// canvases larger than MAXPX (the DSP wire layer is 12000x12000) are cropped to their painted bounds plus a 16px margin
const MAXPX=16e6;
async function crop(svg){return page.evaluate(([svg,S,MAXPX])=>{const h=document.createElement('div');h.innerHTML=svg;const el=h.firstElementChild;
  const w=+el.getAttribute('width'),ht=+el.getAttribute('height');if(!(w*ht*S*S>MAXPX))return null;document.body.appendChild(h);
  const b=el.getBBox({stroke:true});h.remove();const vb=[b.x-16,b.y-16,b.width+32,b.height+32].map(v=>Math.round(v*100)/100);
  return svg.replace(/(<svg[^>]*?)\swidth="[^"]*"/,'$1 width="'+vb[2]+'"').replace(/(<svg[^>]*?)\sheight="[^"]*"/,'$1 height="'+vb[3]+'"').replace(/(<svg[^>]*?)\sviewBox="[^"]*"/,'$1 viewBox="'+vb.join(' ')+'"');},[svg,S,MAXPX]);}
// what the native loader must do for pathLength (rescale dash attributes by getTotalLength()/pathLength) and for CSS blur()
// (resvg derives the region from the bounding box, which has zero height on a straight wire, and clips the glow's ends)
async function normalizeGaps(svg){return page.evaluate(svg=>{const h=document.createElement('div');h.innerHTML=svg;document.body.appendChild(h);
  const root=h.querySelector('svg'),NS='http://www.w3.org/2000/svg';let n=0;
  for(const e of h.querySelectorAll('[style*="blur("]')){const m=/(^|;)\s*filter:\s*blur\(\s*([\d.]+)px\s*\)\s*(?=;|$)/i.exec(e.getAttribute('style'));if(!m)continue;const sd=+m[2],b=e.getBBox({stroke:true}),pad=3*sd+1;
    const f=document.createElementNS(NS,'filter'),g=document.createElementNS(NS,'feGaussianBlur'),id='normalized-blur-'+(n++);
    f.setAttribute('id',id);f.setAttribute('filterUnits','userSpaceOnUse');[['x',b.x-pad],['y',b.y-pad],['width',b.width+2*pad],['height',b.height+2*pad]].forEach(([k,v])=>f.setAttribute(k,Math.round(v*100)/100));
    g.setAttribute('stdDeviation',sd);f.append(g);(root.querySelector('defs')||root.insertBefore(document.createElementNS(NS,'defs'),root.firstChild)).append(f);
    e.setAttribute('style',e.getAttribute('style').replace(m[0],m[1]+'filter:url(#'+id+')'));}
  for(const e of h.querySelectorAll('[pathLength]')){const k=e.getTotalLength()/+e.getAttribute('pathLength');
    for(const a of ['stroke-dasharray','stroke-dashoffset']){const v=e.getAttribute(a);if(v&&v!=='none')e.setAttribute(a,v.split(/[\s,]+/).filter(Boolean).map(x=>Math.round(parseFloat(x)*k*1000)/1000).join(' '));}
    e.removeAttribute('pathLength');}
  const out=h.innerHTML;h.remove();return out;},svg);}
// a gap the normalization does not handle (blur in a <style> rule, other units, several filter functions) leaves the file failing
const unhandled=n=>Object.keys(GAPS).filter(g=>GAPS[g].test(n));
// compared over white and over black: white strokes and fills are invisible over white; the backdrop with the larger difference blob is kept
let page;async function compareRetry(b,svg,png){const w=await compareRetry1(b,svg,png,255);if(w.error||w.missing||w.size)return w;const k=await compareRetry1(b,svg,png,0);
  if(k.error||k.missing||k.size)return {...k,bg:'black'};
  return (k.blob>w.blob||(!w.ink&&k.ink))?{...k,bg:'black'}:w;}
async function compareRetry1(b,svg,png,BG){for(let k=0;;k++){try{return await compare(page,svg,png,BG);}catch(e){if(k)return {error:e.message.split(String.fromCharCode(10))[0]};await page.close();page=await b.newPage();}}}

(async()=>{const b=await chromium.launch({headless:true,...(process.env.CHROME?{executablePath:process.env.CHROME}:{channel:'chrome'})});page=await b.newPage();
 const report=[];const pct=(n,d)=>d?+(100*n/d).toFixed(3):0;
 for(const f of files){const name=id(f),raw=fs.readFileSync(f,'utf8'),cropped=await crop(raw),svg=cropped||raw,out=path.join(WORK,'resvg',name+'.png');
  const err=resvg(svg,out);const r=await compareRetry(b,svg,err?null:fs.readFileSync(out).toString('base64'));
  const text=/<text[\s>]/.test(svg);const gaps=Object.keys(GAPS).filter(k=>GAPS[k].test(svg));
  const row={file:path.relative(DIR,f).replace(/\\/g,'/'),W:r.W,H:r.H,inkPx:r.ink,strictPct:pct(r.bad,r.ink),shiftPx:r.shift,shiftPct:pct(r.shift,r.ink),blobPx:r.blob,text,gaps,cropped:!!cropped,resvgError:err,bg:r.bg||'white',note:r.error||(r.size?'size '+r.size:'')||(r.missing?'no resvg output':'')};
  if(r.diff)fs.writeFileSync(path.join(WORK,'diff',name+'.png'),Buffer.from(r.diff,'base64'));
  if(text&&!err){const bare=svg.replace(/<text[\s\S]*?<\/text>/g,'');const o2=path.join(WORK,'resvg',name+'.notext.png');const e2=resvg(bare,o2);
    const t=await compareRetry(b,bare,e2?null:fs.readFileSync(o2).toString('base64'));row.noTextShiftPx=t.shift;row.noTextBlobPx=t.blob;row.noTextShiftPct=pct(t.shift,t.ink);
    if(t.diff)fs.writeFileSync(path.join(WORK,'diff',name+'.notext.png'),Buffer.from(t.diff,'base64'));}
  if(gaps.length){const strip=s=>s.replace(/<text[\s\S]*?<\/text>/g,''),n=strip(await normalizeGaps(svg)),o3=path.join(WORK,'resvg',name+'.normalized.png'),e3=resvg(n,o3);
    const t=await compareRetry(b,strip(svg),e3?null:fs.readFileSync(o3).toString('base64'));row.normalizedBlobPx=t.blob;row.unhandledGaps=unhandled(n);
    row.normalizedPass=!e3&&!row.unhandledGaps.length&&t.ink>0&&t.blob<=BLOB;}
  row.empty=!err&&!row.note&&r.ink===0;
  // geometry verdict: something was compared and, outside text, no blob is larger than BLOB pixels
  const geo=text?row.noTextBlobPx:row.blobPx;row.pass=!err&&!row.note&&!row.empty&&geo<=BLOB;
  report.push(row);process.stdout.write(row.empty?'0':row.pass?'.':gaps.length?'g':'x');}
 await b.close();fs.writeFileSync(path.join(WORK,'report.json'),JSON.stringify(report,null,1)+'\n');
 const fail=report.filter(r=>!r.pass);console.log('\nchecked',report.length,'pass',report.length-fail.length,'fail',fail.length,'(of which empty',report.filter(r=>r.empty).length+', renderer gaps',fail.filter(r=>r.gaps.length).length+', passing once normalized',fail.filter(r=>r.normalizedPass).length+')');
 for(const r of report.filter(r=>r.empty))console.log('empty',r.file);
 const geo=r=>r.text?r.noTextBlobPx:r.blobPx;for(const r of fail.filter(r=>!r.empty).sort((a,b)=>geo(b)-geo(a)).slice(0,60))console.log('blob '+geo(r)+'px',(r.text?'noText '+r.noTextShiftPx:'shift '+r.shiftPx)+'px',r.gaps.join(','),r.file,r.resvgError||r.note||'');
 // Exit status is a switch separate from the report, on purpose. The maintainer runs
 // this to look at the rendered diffs, and a tool that refuses to finish is useless
 // for that. `--check` is what CI needs: the report already holds the answer, so a
 // step that reads it and still exits 0 is a green that proves nothing. Today
 // `out/check/report.json` lists 6 failing files and this process exits 0 without
 // the flag -- which is exactly why the CI job does not call this tool.
  if(process.argv.includes('--check')&&fail.length){console.log('\nexit 1: '+fail.length+' file(s) failed under --check');process.exit(1);}
})().catch(e=>{console.error(e);process.exit(1)});
