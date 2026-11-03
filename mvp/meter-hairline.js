'use strict';
// Medidores em alta definição: os SVGs são desenhados em ~840 unidades e exibidos bem menores, o que deixava
// ticks, arcos e agulha abaixo de 1 pixel físico (falhados e serrilhados). Aqui cada traço ganha como espessura
// mínima 1 pixel físico no tamanho exibido; traços que já passam disso, e o medidor ampliado, ficam como desenhados.
(() => {
  const base=new WeakMap(),observed=new WeakSet(),resize=new ResizeObserver(entries=>entries.forEach(e=>sharpen(e.target)));
  function sharpen(svg){if(!svg.isConnected)return;const width=svg.getBoundingClientRect().width,view=svg.viewBox.baseVal;if(!width||!view?.width)return;
    const unit=view.width/(width*(devicePixelRatio||1));
    for(const el of svg.querySelectorAll('line,path,circle,ellipse,rect,polyline,polygon')){if(!base.has(el)){const cs=getComputedStyle(el);base.set(el,cs.stroke==='none'?0:parseFloat(cs.strokeWidth)||0);}
      const original=base.get(el);if(!original)continue;el.style.strokeWidth=original<unit?unit+'px':'';}
    svg.style.shapeRendering='geometricPrecision';}
  function scan(){for(const svg of document.querySelectorAll('#meter-stage svg[viewBox],#large-meter svg[viewBox]')){if(!observed.has(svg)){observed.add(svg);resize.observe(svg);}sharpen(svg);}}
  for(const id of ['meter-stage','large-meter']){const host=document.getElementById(id);if(host)new MutationObserver(scan).observe(host,{childList:true});}
  // Troca de skin ou de zoom do sistema muda a espessura computada ou a densidade de pixels.
  new MutationObserver(()=>requestAnimationFrame(scan)).observe(document.documentElement,{attributes:true,attributeFilter:['data-skin']});
  matchMedia('(resolution: '+(devicePixelRatio||1)+'dppx)').addEventListener?.('change',scan);
  scan();
})();
