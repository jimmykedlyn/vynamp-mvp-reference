'use strict';
// Espectro pulsante compartilhado (DSP, equalizador rápido e waveform): bandas log 20 Hz–20 kHz,
// subida imediata, queda rápida medida em tempo real (independe do fps) e marca de pico.
// Espera bins sem suavização do AnalyserNode (copyPulseSpectrum); sem bins, decai até o repouso.
(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function create(maxBands=96){
    const bars=new Float32Array(maxBands),peaks=new Float32Array(maxBands);let last=0;
    // bins: dB por bin (AnalyserNode.getFloatFrequencyData) ou null; rate: taxa de amostragem;
    // low/high: faixa do eixo (padrão 20 Hz–20 kHz), para alinhar com o gráfico vizinho.
    function update(bins,rate,count,low=20,high=20000){count=Math.min(maxBands,count);const top=Math.min(high,rate/2),now=performance.now(),dt=last?Math.min(250,now-last):16;last=now;const keep=Math.exp(-dt/70),drop=dt*.0008;
      for(let i=0;i<count;i++){let level=0;if(bins){const from=Math.floor(low*Math.pow(top/low,i/count)/(rate/2)*bins.length),to=Math.max(from+1,Math.ceil(low*Math.pow(top/low,(i+1)/count)/(rate/2)*bins.length));let db=-Infinity;for(let k=from;k<to&&k<bins.length;k++)db=Math.max(db,bins[k]);level=Number.isFinite(db)?clamp((db+90)/80,0,1):0;}
        bars[i]=level>bars[i]?level:level+(bars[i]-level)*keep;peaks[i]=Math.max(bars[i],peaks[i]-drop);}
      return {bars,peaks,count,top};}
    // Desenha no canvas 2D já escalado (largura/altura em px CSS).
    function paint(ctx,width,height,state,accent,muted){const gap=2,barWidth=width/state.count-gap,base=height-6,tall=height-14;
      for(let i=0;i<state.count;i++){const x=i*(barWidth+gap),h=state.bars[i]*tall;ctx.fillStyle=accent;ctx.globalAlpha=.3+.7*state.bars[i];ctx.fillRect(x,base-h,barWidth,h);if(state.peaks[i]>.02){ctx.globalAlpha=.9;ctx.fillRect(x,base-state.peaks[i]*tall-2,barWidth,2);}}
      ctx.globalAlpha=.35;ctx.fillStyle=muted;ctx.fillRect(0,base,width,1);ctx.globalAlpha=1;}
    return {update,paint,reset(){bars.fill(0);peaks.fill(0);last=0;}};
  }
  // Máximo L/R por bin, para mostrar o que soa em qualquer canal.
  function merge(left,right,target){for(let i=0;i<target.length;i++)target[i]=Math.max(left[i],right[i]);return target;}
  window.VynampSpectrumPulse={create,merge};
})();
