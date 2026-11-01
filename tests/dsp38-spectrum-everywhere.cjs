// Revisão 38 — o espectro pulsante do DSP também no equalizador aberto por #eq-open e como estilo da waveform.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{pathToFileURL}=require('node:url');
const url=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
function wav(file){const sr=48000,n=sr*20,b=Buffer.alloc(44+n*4);b.write('RIFF',0);b.writeUInt32LE(36+n*4,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*4,40);for(let i=0;i<n;i++){const t=i/sr,beat=(t*2%1)<.25?1:.25,v=beat*(.15*Math.sin(2*Math.PI*80*t)+.08*Math.sin(2*Math.PI*1200*t)+.04*Math.sin(2*Math.PI*6000*t));b.writeInt16LE(Math.round(v*32767),44+i*4);b.writeInt16LE(Math.round(v*32767),46+i*4);}fs.writeFileSync(file,b);}
(async()=>{const file=path.join(os.tmpdir(),'vynamp-spectrum-everywhere.wav');wav(file);const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--autoplay-policy=no-user-gesture-required']});try{
 for(const viewport of [{width:1440,height:900},{width:390,height:844}]){const p=await browser.newPage({viewport}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(url);
  // Equalizador rápido: em repouso antes da música, pulsando com ela.
  await p.evaluate(()=>document.getElementById('eq-open').click());await p.waitForFunction(()=>document.querySelector('#eq-spectrum p')?.textContent);
  assert.equal(await p.locator('#advanced-eq-dialog #eq-spectrum canvas').count(),1,'equalizador sem espectro');
  assert.match(await p.locator('#eq-spectrum .eq-spectrum-note').innerText(),/Abra áudio local|repouso/);
  await p.evaluate(()=>document.getElementById('advanced-eq-dialog').close());
  await p.setInputFiles('#files',file);await p.waitForTimeout(1200);
  await p.evaluate(()=>document.getElementById('eq-open').click());
  const lit=()=>p.evaluate(()=>{const c=document.querySelector('#eq-spectrum canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let on=0;for(let i=3;i<d.length;i+=4)if(d[i]>40)on++;return on;});
  const ons=[];for(let i=0;i<8;i++){await p.waitForTimeout(110);ons.push(await lit());}
  assert.ok(ons.every(v=>v>200),'equalizador sem barras com música: '+ons);assert.ok(Math.max(...ons)-Math.min(...ons)>ons[0]*.05,'equalizador não pulsa: '+ons);
  assert.match(await p.locator('#eq-spectrum .eq-spectrum-note').innerText(),/pulsa/i);
  // Mesmo eixo da curva: canvas sobre o SVG e o pico de 80 Hz sob a posição de 80 Hz (log 10 Hz–0,45·Fs).
  const axis=await p.evaluate(()=>{const c=document.querySelector('#eq-spectrum canvas'),g=document.getElementById('advanced-eq-graph').getBoundingClientRect(),r=c.getBoundingClientRect(),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data,cols=new Float32Array(c.width);for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(d[(y*c.width+x)*4+3]>40)cols[x]++;let best=0;for(let x=0;x<c.width/3;x++)if(cols[x]>cols[best])best=x;return {dx:Math.abs(r.left-g.left),dw:Math.abs(r.width-g.width),peak:best/c.width,expected:Math.log(8)/Math.log(.45*VynampReference.getSampleRate()/10)};});
  assert.ok(axis.dx<1&&axis.dw<1,'espectro desalinhado da curva: '+JSON.stringify(axis));assert.ok(Math.abs(axis.peak-axis.expected)<.04,'pico de 80 Hz fora do lugar: '+JSON.stringify(axis));
  await p.evaluate(()=>document.getElementById('advanced-eq-dialog').close());
  // Waveform: novo estilo na lista, com miniatura, barras e picos vivos.
  assert.equal(await p.locator('[data-wave-menu=spectrum-pulse]').count(),1,'estilo ausente na lista');
  assert.equal(await p.locator('[data-wave-menu=spectrum-pulse] .wave-preview-icon').count(),1,'estilo sem miniatura');
  await p.evaluate(()=>VynampWaveformStyles.setMode('spectrum-pulse'));
  assert.equal(await p.locator('#wave-spectrum-live').evaluate(e=>getComputedStyle(e).display),'block');
  const levels=[];for(let i=0;i<8;i++){await p.waitForTimeout(110);levels.push(+(await p.locator('#wave-spectrum-live').getAttribute('data-level')));}
  assert.ok(levels.every(v=>v>.2),'waveform sem barras: '+levels);assert.ok(Math.max(...levels)-Math.min(...levels)>.02,'waveform não pulsa: '+levels);
  const bars=await p.locator('#wave-spectrum-fill').getAttribute('d'),peaks=await p.locator('#wave-spectrum-halo').getAttribute('d');
  assert.ok((bars.match(/z/g)||[]).length>10,'poucas barras: '+bars.slice(0,80));assert.ok((peaks.match(/z/g)||[]).length>10,'sem marcas de pico');
  assert.deepEqual(errors,[]);await p.close();}
 console.log('dsp38-spectrum-everywhere: ok');
}finally{await browser.close();fs.rmSync(file,{force:true});}})().catch(e=>{console.error(e);process.exit(1);});
