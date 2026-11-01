'use strict';
// Espectro pulsante no equalizador aberto por #eq-open (editor avançado): mesmo modelo do painel do DSP, sobre a saída real do player.
(() => {
  const api=VynampReference,dialog=document.getElementById('advanced-eq-dialog'),axis=dialog?.querySelector('.response-axis');
  if(!axis||!window.VynampSpectrumPulse)return;
  const section=document.createElement('section');section.id='eq-spectrum';
  section.innerHTML='<canvas role="img" aria-label="Espectro pulsante da música"></canvas><p class="eq-spectrum-note secondary"></p>';
  axis.after(section);
  const graph=dialog.querySelector('#advanced-eq-graph'),canvas=section.querySelector('canvas'),note=section.querySelector('p'),motion=matchMedia('(prefers-reduced-motion: reduce)');
  const pulse=VynampSpectrumPulse.create(96),left=new Float32Array(1024),right=new Float32Array(1024),merged=new Float32Array(1024);
  let width=0,height=0,raf=0,last=0;
  // Mesmo eixo da curva: 10 Hz até 0,45·Fs, alinhado horizontalmente com o SVG da resposta.
  const align=()=>{const g=graph?.getBoundingClientRect(),s=section.getBoundingClientRect();if(!g?.width)return;canvas.style.marginLeft=(g.left-s.left)+'px';canvas.style.width=g.width+'px';};
  if(graph)new ResizeObserver(align).observe(graph);
  new ResizeObserver(entries=>{const r=entries[0].contentRect;width=r.width;height=r.height;const dpr=Math.min(2,devicePixelRatio||1);canvas.width=Math.max(1,Math.round(width*dpr));canvas.height=Math.max(1,Math.round(height*dpr));last=0;}).observe(canvas);
  function draw(){if(!width)return;const ctx=canvas.getContext('2d'),dpr=canvas.width/width,style=getComputedStyle(dialog);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    const playing=api.state.playing&&!api.isDemo(),live=playing&&(api.copyPulseSpectrum||api.copyLiveSpectrum)(left,0)&&(api.copyPulseSpectrum||api.copyLiveSpectrum)(right,1),bins=live?VynampSpectrumPulse.merge(left,right,merged):null;
    const rate=api.getSampleRate?.()||48000,state=pulse.update(bins,rate,Math.max(16,Math.min(96,Math.floor(width/7))),10,.45*rate);
    pulse.paint(ctx,width,height,state,style.getPropertyValue('--cyan').trim()||'#7af3df',style.getPropertyValue('--text-muted').trim()||'#88939e');
    note.textContent=live?'Espectro da saída · pulsa com a música':api.isDemo()?'Abra áudio local para ver o espectro pulsar com a música.':'Espectro em repouso · inicie a reprodução';}
  // Tempo real: desenha a cada quadro da tela; movimento reduzido mantém 4 Hz. Para quando o diálogo fecha ou a aba some.
  function frame(t){raf=0;if(!dialog.open||document.hidden)return;if(t-last>=(motion.matches||api.state.reducedMotion?250:0)){last=t;draw();}raf=requestAnimationFrame(frame);}
  const start=()=>{if(!raf&&dialog.open&&!document.hidden)raf=requestAnimationFrame(frame);};
  new MutationObserver(()=>{if(dialog.open){pulse.reset();align();start();}else{cancelAnimationFrame(raf);raf=0;}}).observe(dialog,{attributes:true,attributeFilter:['open']});
  document.addEventListener('visibilitychange',start);
})();
