'use strict';
(() => {
  const records=new WeakMap();
  const views={'analog-vintage':[61,106,838,324],'analog-dark':[61,106,838,324],twin:[75,106,810,324],'led-horizontal':[57,94,846,424],'led-vertical':[57,80,846,440],circular:[74,112,812,396],spectrum:[57,93,846,425],ribbon:[79,97,802,440],plasma:[59,96,842,421],'dual-arc':[56,92,848,444],matrix:[56,94,848,424],scope:[57,94,846,424]};
  const retro=new Set(['copper-console','ivory-atelier','sandstone-collection']);
  function remember(record,el,keys){if(el)record.geometry.push({el,values:Object.fromEntries(keys.map(k=>[k,el.getAttribute(k)]))});}
  function attrs(el,values){if(el)for(const [key,value]of Object.entries(values))el.setAttribute(key,String(value));}
  function bezel(record,outer,inner){if(!outer||!inner)return;remember(record,outer,['x','y','width','height','rx']);outer.classList.add('meter-thin-bezel');record.bezels.push({outer,inner});}
  function inspect(svg){if(records.has(svg))return records.get(svg);const group=[...svg.children].find(el=>el.localName==='g'),direct=[...group.children],rects=direct.filter(el=>el.localName==='rect'),record={viewBox:svg.getAttribute('viewBox'),width:svg.getAttribute('width'),height:svg.getAttribute('height'),geometry:[],bezels:[],rects,direct};records.set(svg,record);const model=svg.dataset.model;
    rects[0]?.classList.add('meter-enclosure');if(rects[0])svg.style.setProperty('--instrument-native-fill',rects[0].getAttribute('fill'));if(rects[1]?.getAttribute('fill')==='none')rects[1].classList.add('meter-enclosure-seam');
    // Text on the display keeps its original ink; only exterior captions use tokens.
    for(const el of direct.filter(el=>el.localName==='text')){const y=+el.getAttribute('y');if(y<80||(['analog-vintage','analog-dark','twin'].includes(model)&&y>=410)||model==='dual-arc'&&y>540)el.classList.add('meter-enclosure-label');}
    if(['analog-vintage','analog-dark','twin'].includes(model))for(const channel of svg.querySelectorAll('[data-role=channel]')){const r=[...channel.children].filter(el=>el.localName==='rect');bezel(record,r[0],r[1]);}
    if(model==='scope')bezel(record,rects[3],rects[4]);
    if(model==='ribbon'){remember(record,rects[0],['x','y','width','height','rx']);remember(record,rects[1],['x','y','width','height','rx']);bezel(record,rects[2],rects[3]);rects[1].classList.add('meter-retro-panel');}
    if(model==='dual-arc'){remember(record,rects[0],['x','y','width','height','rx']);bezel(record,rects[1],rects[2]);const text=direct.find(el=>el.localName==='text'&&+el.getAttribute('y')>540);remember(record,text,['transform']);record.arcCaption=text;}
    return record;
  }
  function prepare(svg,finish='integrated',skin=document.documentElement.dataset.skin){if(!svg)return;const r=inspect(svg),model=svg.dataset.model,warm=retro.has(skin),compact=finish!=='original',view=views[model];for(const item of r.geometry)for(const [k,v]of Object.entries(item.values)){if(v===null)item.el.removeAttribute(k);else item.el.setAttribute(k,v);}attrs(svg,{viewBox:r.viewBox,width:r.width,height:r.height});svg.dataset.finish=finish;svg.dataset.trimmed=String(compact);svg.dataset.nativeMaterial=String(['ribbon','dual-arc'].includes(model));svg.dataset.retro=String(warm);delete svg.dataset.bezelWidth;
    if(!compact||!view)return;attrs(svg,{viewBox:view.join(' '),width:view[2],height:view[3]});
    const width=finish==='frameless'?1:finish==='ultrafine'?2:warm&&finish==='adaptive'?5:3;
    for(const b of r.bezels){const inner=b.inner;attrs(b.outer,{x:+inner.getAttribute('x')-width,y:+inner.getAttribute('y')-width,width:+inner.getAttribute('width')+width*2,height:+inner.getAttribute('height')+width*2,rx:+inner.getAttribute('rx')+width});}if(r.bezels.length)svg.dataset.bezelWidth=String(width);
    if(model==='ribbon'){attrs(r.rects[0],{x:79,y:97,width:802,height:440,rx:8});attrs(r.rects[1],{x:83,y:101,width:794,height:432,rx:5});}
    if(model==='dual-arc'){attrs(r.rects[0],{x:56,y:92,width:848,height:444,rx:8});r.arcCaption?.setAttribute('transform','translate(0 -24)');}
  }
  window.VynampInstrumentTrim={prepare,views};
})();
