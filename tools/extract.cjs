// Phase 1 extractor: themes, icons, meters and every SVG the MVP renders.
// node extract.cjs <mvp-dir> <base-url> <out-dir> [--quick]
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {chromium}=require('playwright');
const [MVP,BASE,OUT]=process.argv.slice(2);const QUICK=process.argv.includes('--quick');
const mk=d=>(fs.mkdirSync(d,{recursive:true}),d);const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const write=(f,s)=>{mk(path.dirname(f));fs.writeFileSync(f,s);};
const SENTINEL='rgb(1, 2, 3)';

// Runs in the page: self-contained copy of an <svg> with computed presentation inlined.
function SERIALIZE([el,sentinel]){
  const INH=['fill','fill-opacity','fill-rule','stroke','stroke-width','stroke-opacity','stroke-linecap','stroke-linejoin','stroke-dasharray','stroke-dashoffset','stroke-miterlimit','font-family','font-size','font-weight','font-style','letter-spacing','text-anchor','dominant-baseline','visibility','paint-order','shape-rendering','color'];
  const NON={opacity:'1','stop-color':'rgb(0, 0, 0)','stop-opacity':'1',filter:'none','clip-path':'none',mask:'none','mix-blend-mode':'normal',display:'inline','flood-color':'rgb(0, 0, 0)','flood-opacity':'1','lighting-color':'rgb(255, 255, 255)'};
  // url(#id)/href="#id" targets that live elsewhere in the page (shared gradients, filters) are copied into <defs>
  const ext=[],sub=n=>[n,...n.querySelectorAll('*')],has=id=>[el,...ext].some(n=>n.id===id||n.querySelector('#'+CSS.escape(id)));
  const refs=n=>{const ids=[];for(const e of sub(n)){for(const at of e.attributes){for(const m of at.value.matchAll(/url\(\s*["']?[^"'#)]*#([^"')\s]+)/g))ids.push(m[1]);if(/(^|:)href$/.test(at.name)&&at.value[0]==='#')ids.push(at.value.slice(1));}
    const f=getComputedStyle(e);for(const p of ['fill','stroke','filter','clip-path','mask','marker-start','marker-mid','marker-end'])for(const m of f.getPropertyValue(p).matchAll(/url\("?[^"#)]*#([^")]+)/g))ids.push(m[1]);}return ids;};
  for(const q=refs(el);q.length;){const id=q.shift();if(has(id))continue;const t=document.getElementById(id);if(t){ext.push(t);q.push(...refs(t));}}
  const clone=el.cloneNode(true),extC=ext.map(x=>x.cloneNode(true));const src=[...sub(el),...ext.flatMap(sub)],dst=[...sub(clone),...extC.flatMap(sub)];
  if(extC.length){const defs=document.createElementNS('http://www.w3.org/2000/svg','defs');for(const x of extC)defs.appendChild(x);clone.insertBefore(defs,clone.firstChild);}
  const cs=src.map(e=>getComputedStyle(e));
  src.forEach((e,i)=>{const c=cs[i],pi=src.indexOf(e.parentElement),pc=pi>=0?cs[pi]:null;const d=[];
    for(const p of INH){const v=c.getPropertyValue(p);if(!pc||pc.getPropertyValue(p)!==v)d.push(p+':'+v);}
    for(const [p,def] of Object.entries(NON)){const v=c.getPropertyValue(p);if(v&&v!==def&&!(p==='display'&&i===0))d.push(p+':'+v);}
    const t=dst[i];t.removeAttribute('class');
    // pathLength: rescale dashes to user units so renderers without pathLength agree
    const pl=+e.getAttribute('pathLength');if(pl>0&&e.getTotalLength){const k=e.getTotalLength()/pl;const sc=v=>v==='none'?v:v.split(/[\s,]+/).filter(Boolean).map(x=>Math.round(parseFloat(x)*k*1000)/1000+'px').join(', ');
      for(let j=d.length-1;j>=0;j--)if(/^stroke-dash(array|offset):/.test(d[j]))d.splice(j,1);d.push('stroke-dasharray:'+sc(c.getPropertyValue('stroke-dasharray')),'stroke-dashoffset:'+sc(c.getPropertyValue('stroke-dashoffset')));t.removeAttribute('pathLength');}
    // attributes that reference custom properties are dead outside the page: the computed values above replace them
    for(const at of [...t.attributes])if(at.value.includes('var('))t.removeAttribute(at.name);
    // own inline style: keep only what the computed lists do not cover (transform, etc.)
    const own=(e.getAttribute('style')||'').split(';').map(x=>x.trim()).filter(x=>{const k=x.split(':')[0].trim();return x&&!x.includes('var(')&&!INH.includes(k)&&!(k in NON);});
    const st=d.concat(own).join(';');if(st)t.setAttribute('style',st);else t.removeAttribute('style');});
  const r=el.getBoundingClientRect();
  const vb=(clone.getAttribute('viewBox')||'').split(/[\s,]+/).map(Number);const W=r.width||vb[2]||0,H=r.height||vb[3]||0;
  if(!clone.getAttribute('viewBox')&&W)clone.setAttribute('viewBox',`0 0 ${W} ${H}`);
  clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
  if(!clone.getAttribute('width'))clone.setAttribute('width',Math.round(W*100)/100);
  if(!clone.getAttribute('height'))clone.setAttribute('height',Math.round(H*100)/100);
  let s=new XMLSerializer().serializeToString(clone).replace(/color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)/g,(m,r,g,b,a)=>'rgba('+[r,g,b].map(x=>Math.round(+x*255)).join(', ')+', '+(a===undefined?1:+a)+')')
    // computed url("#id") is quoted; resvg drops quoted url() in style (filter:url("#x") renders no filter)
    .replace(/url\(&quot;(#[^&]*)&quot;\)/g,'url($1)');if(sentinel)s=s.split(sentinel).join('currentColor');
  // where it lives: shortest useful path
  const where=[];for(let n=el;n&&n!==document.body&&where.length<5;n=n.parentElement){if(n.id){where.unshift('#'+n.id);break;}where.unshift(n.tagName.toLowerCase()+(n.classList[0]?'.'+n.classList[0]:''));}
  return {svg:s,where:where.join(' > '),box:[r.x,r.y,r.width,r.height].map(v=>Math.round(v)),visible:r.width>0&&r.height>0&&getComputedStyle(el).visibility!=='hidden'};
}

async function fresh(b,w,h){const ctx=await b.newContext({viewport:{width:w,height:h}});const p=await ctx.newPage();p.on('dialog',d=>d.dismiss().catch(()=>{}));
  await p.goto(BASE+'index.html');await ready(p);return {ctx,p};}
async function ready(p){await p.waitForFunction(()=>window.VynampReference&&window.VynampLayout,null,{timeout:15000}).catch(()=>{});await p.waitForTimeout(500);}
async function setTheme(p,t){await p.evaluate(t=>{const s=document.getElementById('theme');s.selectedIndex=t;s.dispatchEvent(new Event('change',{bubbles:true}));},t);await p.waitForTimeout(250);}
async function loadTrack(p){await p.evaluate(()=>{const rate=44100,n=rate*60,a=new ArrayBuffer(44+n*4),v=new DataView(a),text=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));text(0,'RIFF');v.setUint32(4,a.byteLength-8,true);text(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,rate,true);v.setUint32(28,rate*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,n*4,true);for(let i=0;i<n;i++){const x=Math.round(12000*Math.sin(2*Math.PI*440*i/rate)*(0.5+0.5*Math.sin(2*Math.PI*0.7*i/rate)));v.setInt16(44+i*4,x,true);v.setInt16(46+i*4,x,true);}
  const id=VynampReference.registerLocalFile(new File([a],'Artist - Song.wav',{type:'audio/wav'}));VynampReference.enqueueTrack(id);VynampReference.playTrack(id,true);}).catch(e=>console.error('loadTrack',e.message));
  // the waveform is decoded asynchronously and drawn once; wait for it so no capture races the decode
  await p.waitForFunction(()=>['decoded','unavailable'].includes(document.getElementById('wave')?.dataset.source),null,{timeout:15000}).catch(()=>console.error('loadTrack: waveform not decoded'));
  await waveSettled(p);await p.waitForTimeout(250);}
// selecting a track (load or a play click) decodes its waveform again; capture only after the decode has drawn
async function waveSettled(p){await p.waitForFunction(()=>document.getElementById('wave')?.dataset.source!=='loading',null,{timeout:15000}).catch(()=>console.error('waveform still loading'));
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await p.waitForTimeout(150);}

const svgs=new Map();const DYN=new Set();let REST={};const iconUse={};// hash -> {file, seen:[ctx]}
// in the page: CSS selector for a DYN key, the observer path ("#id > g", "tag.class")
function dynSel(k){return k.split(' > ').map(s=>{if(s.startsWith('#'))return '[id="'+s.slice(1)+'"]';const [t,c]=s.split('.');return c?t+'.'+CSS.escape(c):t;}).join(' > ');}
async function harvest(p,label){const list=await p.evaluate(([SER,SEL,dyn,rest])=>{const f=new Function('return '+SER)(),sel=new Function('return '+SEL)();const D=dyn.map(x=>x.split('|'));
   return [...document.querySelectorAll('svg')].filter(s=>!s.parentElement.closest('svg')).map(s=>{const icon=s.classList.contains('icon')&&[...s.classList].find(c=>c.startsWith('icon-'));const r=f([s,null]);
     if(icon){r.icon=icon.slice(5);r.svg='';return r;}
     // attributes JS animates are written at rest (the meter source value) or dropped, so the file does not depend on when it was captured
     const c=new DOMParser().parseFromString(r.svg,'image/svg+xml').documentElement;const neutral=new Set();
     for(const [k,a] of D)c.querySelectorAll(sel(k)).forEach(e=>{if(!e.hasAttribute(a))return;const v=rest[k+'|'+a];if(v==null)e.removeAttribute(a);else e.setAttribute(a,v);neutral.add(k+'|'+a);});
     r.svg=new XMLSerializer().serializeToString(c);r.neutralized=[...neutral].sort();
     // hash key: also drop size
     c.removeAttribute('width');c.removeAttribute('height');r.key=new XMLSerializer().serializeToString(c);return r;});},[SERIALIZE.toString(),dynSel.toString(),[...DYN],REST]);
  for(const it of list){if(it.icon){(iconUse[it.icon]||(iconUse[it.icon]=new Set())).add(it.where.replace(/ > svg\.icon$/,''));continue;}
    const h=sha(it.key).slice(0,16);let e=svgs.get(h);if(!e){e={hash:h,bytes:it.svg.length,where:it.where,box:it.box,neutralized:it.neutralized,seen:[]};svgs.set(h,e);write(path.join(OUT,'svg/rendered',h+'.svg'),it.svg);}
    if(e.seen.length<8)e.seen.push(label+(it.visible?'':' (hidden)'));else e.more=(e.more||0)+1;}}

(async()=>{mk(OUT);const b=await chromium.launch({headless:true,...(process.env.CHROME?{executablePath:process.env.CHROME}:{channel:'chrome'}),args:['--autoplay-policy=no-user-gesture-required']});
 const summary={};
 try{
  // ---- themes ----
  {const {ctx,p}=await fresh(b,1440,900);
   const names=await p.evaluate(()=>{const s=new Set();for(const sh of document.styleSheets){let t='';try{t=[...sh.cssRules].map(r=>r.cssText).join('\n');}catch{}for(const m of t.matchAll(/--[\w.-]+/g))s.add(m[0]);}
     for(const t of VYNAMP_ASSETS.themes)for(const k of Object.keys(t.tokens))s.add('--'+k);s.add('--radius');return [...s].sort();});
   const n=await p.evaluate(()=>document.getElementById('theme').options.length);const themes=[];
   for(let t=0;t<n;t++){await setTheme(p,t);
    themes.push(await p.evaluate(names=>{const h=document.documentElement,c=getComputedStyle(h),bc=getComputedStyle(document.body);const vars={};
      for(const k of names){const v=c.getPropertyValue(k).trim();if(v)vars[k]=v;}
      const src=VYNAMP_ASSETS.themes.find(x=>x.id===h.dataset.skin)||{};
      return {id:h.dataset.skin,option:document.getElementById('theme').selectedOptions[0].textContent,name:src.name,family:src.family,description:src.description,meter:src.meter,
        colorScheme:h.style.colorScheme||c.colorScheme,sourceTokens:src.tokens,resolvedVars:vars,
        body:{background:bc.backgroundColor,backgroundImage:bc.backgroundImage,color:bc.color,fontFamily:bc.fontFamily,fontSize:bc.fontSize,lineHeight:bc.lineHeight},
        htmlAttrs:Object.fromEntries([...h.attributes].filter(a=>a.name!=='style').map(a=>[a.name,a.value]))};},names));process.stdout.write('t');}
   // vars the sources reference but :root does not define in every theme: fallback literals and where they are set instead
   const unsetVars={};{const walk=d=>fs.readdirSync(d).sort().flatMap(f=>{const q=path.join(d,f);return fs.statSync(q).isDirectory()?walk(q):[q];});
    const src=walk(MVP).filter(f=>/\.(css|js|html)$/.test(f)).map(f=>fs.readFileSync(f,'utf8')).join('\n');
    for(const m of src.matchAll(/var\(\s*(--[\w.-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*?))?\)/g)){const k=m[1],miss=themes.filter(t=>!(k in t.resolvedVars)).map(t=>t.id);if(!miss.length)continue;
      const e=unsetVars[k]??={fallbacks:[],setBy:[],missingIn:miss};const fb=m[2]?.trim();if(fb&&!e.fallbacks.includes(fb))e.fallbacks.push(fb);}
    for(const [k,e] of Object.entries(unsetVars)){const n=k.replace(/[.-]/g,'\\$&');
      if(new RegExp('[^\\w-]'+n+'\\s*:').test(src))e.setBy.push('css-element');if(new RegExp('[\'"`]'+n+'[\'"`]').test(src))e.setBy.push('script');}}
   write(path.join(OUT,'themes/themes.json'),JSON.stringify({generator:'extract.cjs',themes,unsetVars},null,1));summary.themes=themes.length;summary.unsetVars=Object.keys(unsetVars).length;
   // ---- icons (currentColor kept via sentinel) ----
   const icons=await p.evaluate(([SER,sentinel])=>{const f=new Function('return '+SER)();const I=VynampIcons;const host=document.createElement('button');host.className='icon-button';host.style.color=sentinel;document.body.append(host);const out={};
     for(const nm of I.names){host.innerHTML=I.svg(nm);const r=f([host.firstElementChild,sentinel]);out[nm]=r.svg;}host.remove();return {out,aliases:I.aliases,css:[...I.CSS_ICONS]};},[SERIALIZE.toString(),SENTINEL]);
   for(const [nm,s] of Object.entries(icons.out))write(path.join(OUT,'svg/icons',nm+'.svg'),s);
   write(path.join(OUT,'svg/icons/icons.json'),JSON.stringify({grid:24,tint:'currentColor',names:Object.keys(icons.out),aliases:icons.aliases,cssIcons:icons.css},null,1));summary.icons=Object.keys(icons.out).length;
   // ---- meters: source + metadata ----
   const meters=await p.evaluate(()=>VYNAMP_ASSETS.meters.map(m=>({...m})));
   // themes whose asset entry names this meter (the MVP never switches meters by theme; kept as asset data)
   const themeMeter=await p.evaluate(()=>VYNAMP_ASSETS.themes.map(t=>[t.id,t.meter]));
   for(const m of meters){m.themes=themeMeter.filter(x=>x[1]===m.file).map(x=>x[0]);write(path.join(OUT,'svg/meters',m.prefix,'source.svg'),m.svg);}
   summary.meters=meters.length;
   // ---- dynamic elements per selectable meter (settings + reload, like a returning user) ----
   // only the meter menu's entries are ever mounted: player.js resets any other stored index to the first choice
   const choices=await p.evaluate(()=>[...document.querySelectorAll('#meter-menu [data-meter]')].map(e=>Number(e.dataset.meter)));
   if(!choices.length||choices.some(i=>!(i>=0&&i<meters.length)))throw new Error('meter menu not found or out of range: '+JSON.stringify(choices));
   for(const m of meters)m.selectable=choices.includes(meters.indexOf(m));
   const dyn={};
   for(const mi of choices){await p.evaluate(mi=>{const s=JSON.parse(localStorage.getItem('vynamp-reference-settings')||'{}');s.meter=mi;s.meterOff=false;localStorage.setItem('vynamp-reference-settings',JSON.stringify(s));},mi);
     await p.reload();await ready(p);await loadTrack(p);await p.waitForTimeout(600);
     const r=await p.evaluate(async()=>{const seen={};const key=n=>{const w=[];for(let x=n;x&&x!==document.body&&w.length<4;x=x.parentElement){if(x.id){w.unshift('#'+x.id);break;}w.unshift(x.tagName.toLowerCase()+(x.classList[0]?'.'+x.classList[0]:''));}return w.join(' > ');};
       const mo=new MutationObserver(ms=>{for(const m of ms){const n=m.type==='characterData'?m.target.parentElement:m.target;if(!n||!(n.closest('svg')||n.tagName==='CANVAS'))continue;const k=key(n);const e=seen[k]||(seen[k]={attrs:{},count:0,text:0});e.count++;if(m.attributeName)e.attrs[m.attributeName]=(e.attrs[m.attributeName]||0)+1;else e.text++;}});
       mo.observe(document.body,{subtree:true,attributes:true,characterData:true});await new Promise(r=>setTimeout(r,3000));mo.disconnect();
       const canv=[...document.querySelectorAll('canvas')].map(c=>({where:key(c),w:c.width,h:c.height,visible:c.getBoundingClientRect().width>0}));
       const a=document.querySelector('audio');return {playing:!!a&&!a.paused,mutated:seen,canvases:canv};},);
     // only which elements/attributes animate: sampled values depend on timing (curves are TASK-E02-13);
     // an attribute counts as animated when it changed at least ANIM times in the window, so a one-shot late write is not animation
     const ANIM=3,mut=Object.fromEntries(Object.keys(r.mutated).sort().map(k=>{const m=r.mutated[k],at=Object.keys(m.attrs).filter(a=>m.attrs[a]>=ANIM).sort();return [k,{attributes:at,...(m.text>=ANIM?{text:true}:{})}];}).filter(([,v])=>v.attributes.length||v.text));
     const pre=meters[mi].prefix;dyn[pre]={meter:pre,playing:r.playing,mutated:mut,canvases:r.canvases};
     meters[mi].dynamic=Object.entries(mut).filter(([k])=>k.includes(pre)).map(([k,v])=>({element:k,...v}));
     process.stdout.write('d');}
   for(const m of meters){const {svg,...meta}=m;write(path.join(OUT,'svg/meters',m.prefix,'meta.json'),JSON.stringify(meta,null,1));}
   write(path.join(OUT,'svg/meters/dynamic.json'),JSON.stringify(dyn,null,1));
   for(const r of Object.values(dyn))for(const [k,v] of Object.entries(r.mutated))for(const a of v.attributes)DYN.add(k.slice(Math.max(0,k.lastIndexOf('#')))+'|'+a);
   // rest value of each animated attribute: its value in the meter source SVG, if any
   REST=await p.evaluate(([dyn,svgs,SEL])=>{const sel=new Function('return '+SEL)(),out={};
     for(const s of svgs){const d=new DOMParser().parseFromString(s,'image/svg+xml');for(const x of dyn){const [k,a]=x.split('|');const e=d.querySelector(sel(k));if(e&&e.hasAttribute(a)&&!(x in out))out[x]=e.getAttribute(a);}}
     return out;},[[...DYN].sort(),meters.map(m=>m.svg),dynSel.toString()]);
   await ctx.close();}
  // ---- every rendered SVG across themes x layouts x widths ----
  for(const w of QUICK?[1440]:[1440,900,390]){const {ctx,p}=await fresh(b,w,w<500?844:900);await loadTrack(p);const n=await p.evaluate(()=>document.getElementById('theme').options.length);
   for(const layout of ['full','mini']){await p.evaluate(l=>VynampLayout.setLayout(l),layout).catch(()=>{});await p.waitForTimeout(200);
    for(let t=0;t<n;t++){await setTheme(p,t);await harvest(p,`w${w}/${layout}/theme${t}`);}}
   await ctx.close();process.stdout.write('w');}
  // ---- click sweep (default theme) to reach dialogs/panels ----
  if(!QUICK){const clickFail=[];const CLICK='button,[role=tab],[role=button],summary,a[href]:not([href^=".."]),input[type=checkbox],input[type=radio],[data-pref],[data-mobile-view],[data-view]';
   for(const w of [1440,390]){const {ctx,p}=await fresh(b,w,w<500?844:900);await loadTrack(p);
    const vis=async()=>p.evaluate(sel=>[...document.querySelectorAll(sel)].map((el,i)=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(el).visibility!=='hidden'?i+'|'+(el.id||el.getAttribute('aria-label')||el.textContent.trim().slice(0,20)):null}).filter(Boolean),CLICK);
    const base=await vis();
    for(const k of base){await p.reload();await ready(p);await loadTrack(p);await p.locator(CLICK).nth(+k.split('|')[0]).click({timeout:1200}).catch(()=>{clickFail.push(w+'|'+k);});await p.waitForTimeout(250);await waveSettled(p);
     await harvest(p,`w${w}/click:${k.split('|')[1]}`);process.stdout.write('.');}
    await ctx.close();}
   // a click that times out drops its state; listed so two runs that differ here show up in the comparison
   write(path.join(OUT,'svg/rendered/click-failures.json'),JSON.stringify(clickFail,null,1));summary.clickFailures=clickFail.length;}
 }finally{await b.close();}
 const idx=[...svgs.values()].sort((a,b)=>a.where.localeCompare(b.where));write(path.join(OUT,'svg/rendered/index.json'),JSON.stringify(idx,null,1));summary.renderedSvgs=idx.length;write(path.join(OUT,'svg/icons/usage.json'),JSON.stringify(Object.fromEntries(Object.entries(iconUse).sort().map(([k,v])=>[k,[...v].sort()])),null,1));
 console.log('\n'+JSON.stringify(summary));
})().catch(e=>{console.error(e);process.exit(1)});
