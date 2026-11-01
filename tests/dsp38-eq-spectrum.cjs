// Revisão 38 — painel abaixo do EQ abre no espectro pulsante, alimentado pelo áudio real.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{pathToFileURL}=require('node:url');
const url=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
function wav(file){const sr=48000,n=sr*20,b=Buffer.alloc(44+n*4);b.write('RIFF',0);b.writeUInt32LE(36+n*4,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*4,40);for(let i=0;i<n;i++){const t=i/sr,beat=(t*2%1)<.25?1:.25,v=beat*(.15*Math.sin(2*Math.PI*80*t)+.08*Math.sin(2*Math.PI*1200*t)+.04*Math.sin(2*Math.PI*6000*t));b.writeInt16LE(Math.round(v*32767),44+i*4);b.writeInt16LE(Math.round(v*32767),46+i*4);}fs.writeFileSync(file,b);}
(async()=>{const file=path.join(os.tmpdir(),'vynamp-spectrum-test.wav');wav(file);const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--autoplay-policy=no-user-gesture-required']});try{const p=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(url);
 await p.setInputFiles('#files',file);await p.waitForTimeout(1200);await p.evaluate(()=>{VynampGraph.open();VynampGraph.select('main-eq');});await p.waitForTimeout(400);
 assert.equal(await p.locator('#eq-panorama [data-panorama-mode="spectrum"]').getAttribute('aria-pressed'),'true','espectro não é o modo padrão');
 await p.locator('#eq-panorama canvas').scrollIntoViewIfNeeded();
 const lit=()=>p.evaluate(()=>{const c=document.querySelector('#eq-panorama canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let on=0,sum=0;for(let i=3;i<d.length;i+=4)if(d[i]>40){on++;sum+=d[i];}return {on,sum};});
 const samples=[];for(let i=0;i<8;i++){await p.waitForTimeout(110);samples.push(await lit());}
 assert.ok(samples.every(s=>s.on>200),'espectro sem barras com música tocando: '+JSON.stringify(samples));
 const ons=samples.map(s=>s.on);assert.ok(Math.max(...ons)-Math.min(...ons)>ons[0]*.05,'espectro não pulsa: '+ons.join(','));
 assert.match(await p.locator('#eq-panorama .eq-panorama-note').innerText(),/pulsa/i);
 // Faixa e Saída EQ continuam disponíveis.
 await p.locator('#eq-panorama [data-panorama-mode="track"]').click();assert.equal(await p.locator('#eq-panorama [data-panorama-mode="track"]').getAttribute('aria-pressed'),'true');
 assert.deepEqual(errors,[]);console.log('dsp38-eq-spectrum: ok');
}finally{await browser.close();fs.rmSync(file,{force:true});}})().catch(e=>{console.error(e);process.exit(1);});
