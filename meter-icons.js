'use strict';
// Ícones do seletor de VU: cada ícone é o próprio instrumento em miniatura — o SVG do asset, montado como no
// painel (mountMeter) e com o mesmo recorte/acabamento (VynampMeterFinish). IDs ganham sufixo para não colidir
// com o medidor ao vivo. Refeitos quando a skin ou o acabamento mudam.
(() => {
  const menu=document.getElementById('meter-menu'),assets=window.VYNAMP_ASSETS;if(!menu||!assets?.meters)return;
  function icon(index){const model=assets.meters[index];if(!model?.svg)return null;
    // Renomeia todos os IDs do asset (e as referências a eles) com um sufixo próprio do ícone.
    const ids=[...model.svg.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]).sort((a,b)=>b.length-a.length);let source=model.svg;
    for(const id of ids)for(const [from,to]of [['id="'+id+'"','id="'+id+'-meter-icon"'],['#'+id+')','#'+id+'-meter-icon)'],['#'+id+'"','#'+id+'-meter-icon"']])source=source.split(from).join(to);
    const doc=new DOMParser().parseFromString(source,'image/svg+xml'),svg=document.importNode(doc.documentElement,true);
    for(const el of svg.querySelectorAll('title,desc'))el.remove();
    svg.removeAttribute('role');svg.removeAttribute('aria-labelledby');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');svg.classList.add('meter-preview-icon');
    window.VynampMeterFinish?.prepare(svg);svg.removeAttribute('width');svg.removeAttribute('height');return svg;}
  function decorate(force){for(const button of menu.querySelectorAll('[data-meter]')){const old=button.querySelector('.meter-preview-icon');if(old&&!force)continue;const svg=icon(button.dataset.meter);if(!svg)continue;if(old)old.replaceWith(svg);else{const number=button.querySelector('.menu-number');if(number)number.after(svg);else button.prepend(svg);}}}
  new MutationObserver(()=>decorate(false)).observe(menu,{childList:true,subtree:true});
  new MutationObserver(()=>decorate(true)).observe(document.documentElement,{attributes:true,attributeFilter:['data-skin']});
  document.getElementById('meter-finish')?.addEventListener('change',()=>requestAnimationFrame(()=>decorate(true)));
  decorate(false);window.VynampMeterIcons={icon};
})();
