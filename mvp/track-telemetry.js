/* File facts only: bounded header reads, no audio decoding or audio graph access. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root.document){root.VynampFileInfo=api;api.mount(root);}})(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  const palette={MP3:'#FFD447',FLAC:'#55E68C',WAV:'#55D7FF',AAC:'#FFAB61',M4A:'#B699FF',OGG:'#54E5D3',OPUS:'#FF86CE',AIFF:'#86B9FF',ALAC:'#B0E88B',WMA:'#FF9BA2',APE:'#D58AEF',WV:'#44BED8',MP2:'#DCC663',WEBM:'#9289FF',DSF:'#E9B8FF',DFF:'#CE90C9',AUDIO:'#B8C0CF',DEMO:'#9CA3AF',RADIO:'#55E6B1'};
  const formats=Object.fromEntries(Object.entries(palette).map(([id,color])=>[id,{color}]));
  const number=n=>Number(n).toLocaleString('pt-BR',{maximumFractionDigits:1});
  function parse(input,name=''){
    const b=input instanceof ArrayBuffer?new Uint8Array(input):new Uint8Array(input.buffer,input.byteOffset,input.byteLength),v=new DataView(b.buffer,b.byteOffset,b.byteLength);
    const text=(p,n)=>String.fromCharCode(...b.subarray(p,p+n));
    let ext=name.split('.').pop().toUpperCase();ext=({AIF:'AIFF',AIFC:'AIFF',WAVE:'WAV',OGA:'OGG',MP4:'M4A'})[ext]||ext;
    const m={format:formats[ext]?ext:'AUDIO',origin:'extension'};
    if(b.length>=12&&text(0,4)==='RIFF'&&text(8,4)==='WAVE'){
      m.format='WAV';m.origin='header';let byteRate=0;
      for(let p=12,count=0;p+8<=b.length&&count++<128;){const id=text(p,4),size=v.getUint32(p+4,true),start=p+8;
        if(id==='fmt '&&size>=16&&start+16<=b.length){const tag=v.getUint16(start,true),ch=v.getUint16(start+2,true),rate=v.getUint32(start+4,true),br=v.getUint32(start+8,true),bits=v.getUint16(start+14,true);
          if(ch>=1&&ch<=32)m.channels=ch;if(rate>0&&rate<=1048575)m.sampleRate=rate;
          let subtype=tag;if(tag===65534&&size>=40&&start+40<=b.length)subtype=v.getUint32(start+24,true);
          if((subtype===1||subtype===3)&&bits>0&&bits<=64){m.bits=bits;m.float=subtype===3;}
          if(br>0&&br<1e9){byteRate=br;m.bitrate=br*8/1000;m.bitrateKind='header';}
        }
        if(id==='data'&&byteRate)m.duration=size/byteRate;
        const next=start+size+(size%2);if(next<=p||next>b.length)break;p=next;
      }
    }else if(b.length>=42&&text(0,4)==='fLaC'&&(b[4]&127)===0&&((b[5]<<16)|(b[6]<<8)|b[7])===34){
      m.format='FLAC';m.origin='header';const packed=v.getBigUint64(18,false),rate=Number(packed>>44n),samples=Number(packed&((1n<<36n)-1n));
      if(rate>0)m.sampleRate=rate;m.channels=Number((packed>>41n)&7n)+1;const bits=Number((packed>>36n)&31n)+1;if(bits>=4)m.bits=bits;if(rate&&samples)m.duration=samples/rate;
    }
    return m;
  }
  function complete(meta,size,duration){const m={...meta,size};const seconds=duration>0?duration:m.duration;if(!m.bitrate&&size>0&&seconds>0){m.bitrate=size*8/seconds/1000;m.bitrateKind='average';}return m;}
  function labels(m){if(m.format==='RADIO')return 'Transmissão ao vivo';if(m.format==='DEMO')return '[DEMO — sem processamento de áudio neste modo]';const a=[];
    if(m.bitrate)a.push((m.bitrateKind==='average'?'≈ ':'')+number(m.bitrate)+' kb/s'+(m.bitrateKind==='average'?' méd.':''));
    if(m.sampleRate)a.push(number(m.sampleRate/1000)+' kHz');if(m.bits)a.push(m.bits+' bits'+(m.float?' float':''));if(m.channels)a.push(m.channels===1?'Mono':m.channels===2?'Estéreo':m.channels+' canais');
    if(m.size>0)a.push(number(m.size/1e6)+' MB');return a.join(' · ')||'Dados de áudio não disponíveis';
  }
  function mount(w){const player=w.VynampReference,summary=w.document.querySelector('.now-summary');if(!player||!summary)return;
    const group=w.document.createElement('div');group.id='track-file-info';group.setAttribute('role','group');group.setAttribute('aria-label','Formato e informações do arquivo');
    const badge=w.document.createElement('span'),details=w.document.createElement('span');badge.className='format-badge';details.className='track-file-details';group.append(badge,details);summary.append(group);w.document.documentElement.dataset.fileSummary='true';
    const cache=new WeakMap();let last='';
    function refresh(){const t=player.getTrackSnapshot();if(!t)return;let m;
      if(t.radio)m={format:'RADIO'};else if(t.demo)m={format:'DEMO'};else if(t.file){let record=cache.get(t.file);if(!record){record={meta:parse(new Uint8Array(),t.file.name),loading:true};cache.set(t.file,record);t.file.slice(0,65536).arrayBuffer().then(bytes=>{record.meta=parse(bytes,t.file.name);}).catch(()=>{}).finally(()=>{record.loading=false;refresh();});}m=complete(record.meta,t.file.size,t.duration);m.loading=record.loading;}else m={format:'AUDIO'};
      const signature=JSON.stringify([t.id,m]);if(signature===last)return;last=signature;badge.textContent=m.format;badge.dataset.format=m.format;badge.style.setProperty('--format-color',formats[m.format].color);
      badge.title=m.format==='DEMO'?'Coleção de demonstração, sem arquivo de áudio':m.origin==='header'?'Formato identificado no cabeçalho do arquivo':'Formato declarado pela extensão do arquivo';
      details.textContent=labels(m);details.title=m.bitrateKind==='average'?'Bitrate médio estimado pelo tamanho do arquivo e duração; inclui o contêiner. Campos desconhecidos são omitidos.':m.bitrateKind==='header'?'Taxa de dados e propriedades lidas do cabeçalho do arquivo.':'Somente dados disponíveis do arquivo.';
    }
    w.document.addEventListener('vynamp:playback',refresh);const audio=w.document.getElementById('audio');audio?.addEventListener('loadedmetadata',refresh);audio?.addEventListener('durationchange',refresh);refresh();
  }
  return {formats,parse,complete,labels,mount};
});
