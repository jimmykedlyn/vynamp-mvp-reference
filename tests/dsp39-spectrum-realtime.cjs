// Revisão 39 — espectro pulsante em tempo real: atualiza a cada quadro e solta as barras logo que o som para.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{pathToFileURL}=require('node:url');
const url=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
// Rajadas de 400 ms de som separadas por 600 ms de silêncio.
function wav(file){const sr=48000,n=sr*20,b=Buffer.alloc(44+n*4);b.write('RIFF',0);b.writeUInt32LE(36+n*4,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*4,40);for(let i=0;i<n;i++){const t=i/sr,v=(t%1)<.4?.3*Math.sin(2*Math.PI*1000*t)+.2*Math.sin(2*Math.PI*120*t):0;b.writeInt16LE(Math.round(v*32767),44+i*4);b.writeInt16LE(Math.round(v*32767),46+i*4);}fs.writeFileSync(file,b);}
(async()=>{const file=path.join(os.tmpdir(),'vynamp-spectrum-realtime.wav');wav(file);const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--autoplay-policy=no-user-gesture-required']});try{const p=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(url);
 await p.setInputFiles('#files',file);await p.waitForTimeout(1500);await p.evaluate(()=>VynampWaveformStyles.setMode('spectrum-pulse'));
 // Grava data-level a cada quadro durante 3 s, junto do instante da faixa.
 const trace=await p.evaluate(()=>new Promise(done=>{const out=[],el=document.getElementById('wave-spectrum-live'),audio=document.getElementById('audio'),start=performance.now();(function tick(){out.push([audio.currentTime,+el.dataset.level,el.querySelector('#wave-spectrum-fill').getAttribute('d')]);if(performance.now()-start<3000)requestAnimationFrame(tick);else done(out);})();}));
 let changes=0;for(let i=1;i<trace.length;i++)if(trace[i][2]!==trace[i-1][2])changes++;
 const fps=changes/3;assert.ok(fps>=45,'espectro atualiza só '+fps.toFixed(1)+'×/s (esperado ≥45, a cada quadro)');
 // Depois de cada fim de rajada (t%1 passa de .4), o nível deve cair abaixo de 0,15 em até 200 ms de faixa.
 const falls=[];for(let i=1;i<trace.length;i++){const a=trace[i-1][0]%1,b=trace[i][0]%1;if(a<.4&&b>=.4){const end=trace[i][0]-(b-.4);const quiet=trace.slice(i).find(r=>r[1]<.15);if(quiet&&quiet[0]-end<.6)falls.push(Math.round((quiet[0]-end)*1000));else falls.push(Infinity);}}
 assert.ok(falls.length>=2,'rajadas não observadas: '+falls);assert.ok(falls.every(ms=>ms<=200),'barras demoram a cair (ms): '+falls);
 // E sobem logo no início da rajada: ≥0,4 em até 100 ms.
 const rises=[];for(let i=1;i<trace.length;i++){const a=trace[i-1][0],b=trace[i][0];if(Math.floor(a)!==Math.floor(b)){const loud=trace.slice(i).find(r=>r[1]>=.4);rises.push(loud?Math.round((loud[0]-Math.floor(b))*1000):Infinity);}}
 assert.ok(rises.length>=2&&rises.every(ms=>ms<=100),'barras demoram a subir (ms): '+rises);
 assert.deepEqual(errors,[]);console.log('dsp39-spectrum-realtime: ok · '+fps.toFixed(0)+' quadros/s · queda '+falls.join('/')+' ms · subida '+rises.join('/')+' ms');
}finally{await browser.close();fs.rmSync(file,{force:true});}})().catch(e=>{console.error(e.message||e);process.exit(1);});
