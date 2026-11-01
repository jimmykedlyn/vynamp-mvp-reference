'use strict';
(() => {
 const clear=document.getElementById('clear-queue');document.querySelector('.queue>.section-top.queue-sub').append(clear);
 const ns='http://www.w3.org/2000/svg';
 // Miniaturas desenhadas com a mesma geometria e as mesmas cores do estilo real: o degradê usa as
 // classes de parada da waveform (.wave-aurora-a, .wave-spec-*, .wave-prisma-a) e acompanha a skin.
 const accent='var(--neon-wave-readable,var(--lime))';let gradients=0;
 function preview(id){const svg=document.createElementNS(ns,'svg');svg.classList.add('wave-preview-icon');svg.setAttribute('viewBox','0 0 48 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');const add=(d,color,fill='none',opacity)=>{const p=document.createElementNS(ns,'path');p.setAttribute('d',d);if(color)p.setAttribute('stroke',color);p.setAttribute('fill',fill);if(opacity!=null)p.setAttribute('opacity',opacity);svg.append(p);return p;};
 const gradient=(stops)=>{const gid='wave-preview-gradient-'+(++gradients);const defs=document.createElementNS(ns,'defs');defs.innerHTML='<linearGradient id="'+gid+'" x1="0" y1="0" x2="48" y2="0" gradientUnits="userSpaceOnUse">'+stops.map(([o,s])=>'<stop offset="'+o+'" '+(s.startsWith('.')?'class="'+s.slice(1)+'"':'stop-color="'+s+'"')+'/>').join('')+'</linearGradient>';svg.prepend(defs);return 'url(#'+gid+')';};
 const aurora=()=>gradient([[0,'.wave-aurora-a'],[.5,'.wave-spec-middle'],[1,'.wave-spec-end']]);
 // Barras verticais simétricas em torno da linha central (y=12), alturas em meia-amplitude.
 const ticks=(heights,from=4,step=5)=>heights.map((h,i)=>'M'+(from+i*step)+' '+(12-h)+'v'+(2*h)).join('');
 // Envelope simétrico fechado a partir de meia-amplitudes.
 const envelope=(heights,from=2,to=46)=>{const step=(to-from)/(heights.length-1),pt=(i,s)=>(from+i*step).toFixed(1)+' '+(12+s*heights[i]).toFixed(1);return 'M'+heights.map((_,i)=>pt(i,-1)).join(' ')+' '+heights.map((_,i)=>pt(heights.length-1-i,1)).join(' ')+'Z';};
 const shape=[3,6,4,8,5,9,6,4,7,3];
 if(id==='original'){add(ticks([3,6,4,8]),accent);add(ticks([10,5,7,3,6],24),'var(--text-muted,#888)');}
 else if(id==='bars-pulse'){add('M2 12h44','var(--text-muted,#888)',undefined,.5);add(ticks(shape,2,5),accent);}
 else if(id==='columns-pulse'){const p=add(ticks([2,4,6,3,8,5,7,3,5],4,5),accent);p.setAttribute('stroke-width','2.6');}
 else if(id==='ribbon-pulse')add(envelope([1,4,6,3,8,5,7,3,5,1]),accent,accent,.8);
 else if(id==='dj'){add('M2 12 8 7 14 3 19 9 25 5 31 8 38 4 46 12 38 20 31 16 25 19 19 15 14 21 8 17Z','#f2a12c','#f2a12c');add('M3 12 10 10 16 7 23 11 30 8 38 10 45 12 38 14 30 16 23 13 16 17 10 14Z','#4c9af0','#4c9af0');}
 else if(id==='overview')add('M2 12 7 9 12 6 18 10 23 8 28 5 34 9 40 7 46 12 40 17 34 15 28 19 23 16 18 14 12 18 7 15Z','#f2a12c','#f2a12c');
 else if(id==='pulse')add('M2 12Q5 4 8 12T14 12T20 12Q23 7 26 12T32 12T38 12Q41 9 44 12L46 12',accent);
 else if(id==='prisma-neon'){const g=gradient([[0,'.wave-prisma-a'],[.33,'#44f3b2'],[.67,'#b87aff'],[1,'#ff57ca']]);const p=add(ticks([3,6,4,8,5,9,6,4,7],4,5),g);p.setAttribute('stroke-width','2.6');}
 else if(id==='aurora-neon'){const g=aurora();add('M2 12Q6 3 10 12T18 12T26 12T34 12T42 12L46 12',g,undefined,.25).setAttribute('stroke-width','4');add('M2 12Q6 3 10 12T18 12T26 12T34 12T42 12L46 12',g);}
 else if(id==='spectrum-aurora')add(ticks([7,9,8,10,7,5,4,3,2,1.5,1],3,4.2),aurora());
 else if(id==='spectrum-ribbon'){const g=aurora();add(envelope([2,8,9,10,8,6,4,3,2,1,.5]),g,g,.7);}
 else if(id==='spectrum-pulse'){[5,9,13,8,11,6,4,3].forEach((h,i)=>{add('M'+(4+i*5.5)+' 21v-'+h+'h3.5v'+h+'z','var(--cyan)','var(--cyan)');add('M'+(4+i*5.5)+' '+(18-h)+'h3.5','var(--cyan)');});}
 else if(id==='spectrum-stereo'){add('M2 12h44','var(--text-muted,#888)',undefined,.4);add([8,9,7,10,6,4,3,2,1.5].map((h,i)=>'M'+(4+i*5)+' 11.5v-'+h).join(''),accent);add([6,8,9,6,5,3,4,2,1].map((h,i)=>'M'+(4+i*5)+' 12.5v'+h).join(''),'var(--wave-spectrum-right-color,#ff60c9)');}
 else if(id==='aurora-weave'){add('M2 12Q8 3 14 12T26 12T38 12T46 10',aurora());add('M2 12Q8 20 14 11T26 13T38 11T46 13','var(--wave-spectrum-right-color,#ff60c9)',undefined,.8);}
 else if(id==='neon-crystal'){const g=aurora();add('M2 12 10 3 18 9 26 1 34 7 46 12 34 17 26 23 18 15 10 21Z',g,g,.3);add('M2 12 10 8 18 11 26 6 34 10 46 12 34 14 26 18 18 13 10 16Z',g,g,.85);}
 else if(id==='aurora-constellation'){const g=aurora(),pts=[[3,4],[11,7],[19,3],[27,6],[35,8],[45,10]].map(([x,h])=>[x,12-h]),low=pts.map(([x,y])=>[x,24-y]);add('M'+pts.map(p=>p.join(' ')).join(' L')+'M'+low.map(p=>p.join(' ')).join(' L'),g,undefined,.65);for(const [x,y]of [...pts,...low])add('M'+(x-1.4)+' '+y+'a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0','none',g);}
 else if(id==='aurora-layers'){const g=aurora();add(envelope([2,9,7,10,6,9,5,3]),g,g,.2);add(envelope([1.5,6,5,7,4,6,3,2]),g,g,.5);add(envelope([1,3,2.5,4,2,3,1.5,1]),g,g,.95);}
 else add('M2 12Q7 0 12 12T22 12T32 12T46 12');return svg;}
 for(const button of document.querySelectorAll('[data-wave-menu],[data-wave-choice]'))button.prepend(preview(button.dataset.waveMenu||button.dataset.waveChoice));
})();
