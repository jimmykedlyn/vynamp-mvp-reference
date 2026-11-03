'use strict';
window.VynampLyricsMetadata=(()=>{
  const LIMIT=16*1024*1024,TEXT_LIMIT=512*1024,utf8=new TextDecoder('utf-8'),latin=new TextDecoder('windows-1252');
  const str=(b,a=0,z=b.length)=>String.fromCharCode(...b.subarray(a,z));
  const view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
  function bounded(b,p,n){if(p<0||n<0||p+n>b.length)throw Error('Metadados de letra incompletos ou corrompidos.');}
  const u32=(b,p,le=false)=>{bounded(b,p,4);return view(b).getUint32(p,le);};
  function syncsafe(b,p){bounded(b,p,4);if(b.subarray(p,p+4).some(v=>v&128))throw Error('Tamanho ID3 inválido.');return b[p]*2097152+b[p+1]*16384+b[p+2]*128+b[p+3];}
  function clean(text){return String(text).replace(/^\uFEFF/,'').replace(/\u0000+$/g,'').replace(/\r\n?/g,'\n');}
  function normalize(lines){
    if(lines.length>12000)throw Error('A letra excede o limite de segmentos desta prévia.');
    const map=new Map();for(const line of lines){if(!Number.isFinite(line.time)||line.time<0||line.time>7*86400||line.text.length>2000)throw Error('Letra com tempo ou texto fora dos limites.');map.set(line.time,{time:line.time,text:clean(line.text).trim()});}
    const result=[...map.values()].sort((a,b)=>a.time-b.time);if(result.length>2000)throw Error('A letra excede o limite de 2.000 linhas.');return result;
  }
  function parseLRC(text){
    text=clean(text);if(text.length>TEXT_LIMIT)throw Error('Letra maior que 512 KiB.');
    const offset=Number(text.match(/\[offset:([+-]?\d+)\]/i)?.[1]||0);if(Math.abs(offset)>3600000)throw Error('Offset da letra fora do limite.');
    const lines=[];for(const raw of text.split('\n')){
      const matches=[...raw.matchAll(/\[(\d{1,4}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];if(!matches.length)continue;
      const words=raw.slice(matches.at(-1).index+matches.at(-1)[0].length).replace(/<\d{1,4}:\d{2}(?:\.\d{1,3})?>/g,'').trim();
      for(const match of matches){if(+match[2]>=60)throw Error('Segundos inválidos na letra sincronizada.');const fraction=match[3]?+('0.'+match[3]):0;lines.push({time:Math.max(0,+match[1]*60+(+match[2])+fraction-offset/1000),text:words});}
    }
    if(!lines.length)throw Error('A letra não contém marcações de tempo LRC válidas.');return normalize(lines);
  }
  function fromText(text,source){text=clean(text);if(text.length>TEXT_LIMIT)throw Error('Letra maior que o limite de leitura.');if(!text.trim())return {kind:'none',source};try{return {kind:'synced',lines:parseLRC(text),text,source};}catch(error){if(/\[\d+:\d{2}/.test(text))throw error;return {kind:'plain',text,source};}}
  function unSync(bytes){const out=[];for(let i=0;i<bytes.length;i++){out.push(bytes[i]);if(bytes[i]===255&&bytes[i+1]===0)i++;}return Uint8Array.from(out);}
  function codec(encoding){let endian='utf-16le';return {
    text(bytes){if(encoding===0)return latin.decode(bytes);if(encoding===3)return utf8.decode(bytes);if(encoding===2)return new TextDecoder('utf-16be').decode(bytes);if(encoding!==1)throw Error('Codificação ID3 de letra não suportada.');if(bytes[0]===254&&bytes[1]===255)endian='utf-16be';else if(bytes[0]===255&&bytes[1]===254)endian='utf-16le';return new TextDecoder(endian).decode(bytes);},
    terminated(bytes,start){const size=encoding===1||encoding===2?2:1;for(let p=start;p+size<=bytes.length;p+=size)if(bytes[p]===0&&(size===1||bytes[p+1]===0))return {text:this.text(bytes.subarray(start,p)),next:p+size};throw Error('Texto ID3 sem terminador.');}
  };}
  function parseID3(bytes){
    bounded(bytes,0,10);if(str(bytes,0,3)!=='ID3')return {kind:'none',source:'ID3'};
    const version=bytes[3];if(![3,4].includes(version))return {kind:'unsupported',source:'ID3',notice:'A prévia lê letras ID3v2.3 e ID3v2.4. Importe um LRC para este arquivo.'};
    const size=syncsafe(bytes,6);bounded(bytes,10,size);if(size>LIMIT)throw Error('Bloco ID3 maior que 16 MiB.');
    let data=bytes.subarray(10,10+size),p=0;if(version===3&&(bytes[5]&128))data=unSync(data);
    if(bytes[5]&64){const ext=version===4?syncsafe(data,0):u32(data,0)+4;if(ext<4||ext>data.length)throw Error('Cabeçalho estendido ID3 inválido.');p=ext;}
    const candidates=[];let unsupported=false;
    for(let count=0;p+10<=data.length&&count<4096;count++){
      const id=str(data,p,p+4);if(!/^[A-Z0-9]{4}$/.test(id))break;const length=version===4?syncsafe(data,p+4):u32(data,p+4),flags=data[p+9];bounded(data,p+10,length);let body=data.subarray(p+10,p+10+length);p+=10+length;
      if(!['USLT','SYLT','TXXX'].includes(id))continue;
      if(version===3&&(flags&192)||version===4&&(flags&12)){unsupported=true;continue;}
      if(version===4&&((flags&2)||(bytes[5]&128)))body=unSync(body);
      if(version===3&&(flags&32)||version===4&&(flags&64))body=body.subarray(1);
      if(version===4&&(flags&1))body=body.subarray(4);
      if(!body.length)continue;const decode=codec(body[0]);
      if(id==='TXXX'){const descriptor=decode.terminated(body,1);if(/^(?:UNSYNCED|SYNCED|SYNCHRONIZED)?LYRICS$/i.test(descriptor.text))candidates.push(fromText(decode.text(body.subarray(descriptor.next)),'metadados ID3 · '+descriptor.text));continue;}
      bounded(body,0,id==='USLT'?4:6);const descriptor=decode.terminated(body,id==='USLT'?4:6);
      if(id==='USLT'){candidates.push(fromText(decode.text(body.subarray(descriptor.next)),'metadados ID3 · USLT'));continue;}
      if(body[5]!==1&&body[5]!==0)continue;
      if(body[4]!==2){unsupported=true;continue;}
      const entries=[];let cursor=descriptor.next;
      while(cursor<body.length){const segment=decode.terminated(body,cursor);bounded(body,segment.next,4);entries.push({time:u32(body,segment.next)/1000,text:segment.text});cursor=segment.next+4;if(entries.length>12000)throw Error('Muitos segmentos SYLT.');}
      let lines=entries;
      if(entries.some(e=>/[\r\n]/.test(e.text))){lines=[];let line='',start=0;for(const entry of entries){const pieces=clean(entry.text).split('\n');for(let i=0;i<pieces.length;i++){if(i){if(line.trim())lines.push({time:start,text:line});line='';}if(pieces[i]){if(!line)start=entry.time;line+=pieces[i];}}}if(line.trim())lines.push({time:start,text:line});}
      if(lines.length)candidates.push({kind:'synced',lines:normalize(lines),text:lines.map(l=>l.text).join('\n'),source:'metadados ID3 · SYLT'});
    }
    return candidates.find(v=>v.kind==='synced')||candidates.find(v=>v.kind==='plain')||(unsupported?{kind:'unsupported',source:'ID3',notice:'Há um formato de letra que esta prévia não consegue sincronizar (quadros MPEG, compressão ou proteção). Importe um LRC.'}:{kind:'none',source:'ID3'});
  }
  function comments(bytes,source){
    let p=0;const vendor=u32(bytes,p,true);p+=4;bounded(bytes,p,vendor);p+=vendor;const count=u32(bytes,p,true);p+=4;if(count>65536)throw Error('Quantidade de comentários inválida.');const candidates=[];
    for(let i=0;i<count;i++){const n=u32(bytes,p,true);p+=4;bounded(bytes,p,n);const entry=utf8.decode(bytes.subarray(p,p+n));p+=n;const equal=entry.indexOf('=');if(equal<0)continue;const key=entry.slice(0,equal).toUpperCase();if(/^(?:UNSYNCED|SYNCED|SYNCHRONIZED)?LYRICS(?:[-_][A-Z]+)?$/.test(key))candidates.push(fromText(entry.slice(equal+1),'metadados '+source+' · '+key));}
    return candidates.find(v=>v.kind==='synced')||candidates.find(v=>v.kind==='plain')||{kind:'none',source};
  }
  async function read(file){
    if(!file?.slice)throw Error('Arquivo local indisponível.');let budget=0;
    async function bytes(start,length){if(!Number.isSafeInteger(start)||!Number.isSafeInteger(length)||start<0||length<0||start+length>file.size)throw Error('Metadados incompletos ou tamanho inválido.');if(length>LIMIT||budget+length>LIMIT*2)throw Error('Limite de leitura de metadados excedido.');budget+=length;return new Uint8Array(await file.slice(start,start+length).arrayBuffer());}
    const first=await bytes(0,Math.min(12,file.size));
    if(str(first,0,3)==='ID3'){bounded(first,0,10);const n=syncsafe(first,6);return parseID3(await bytes(0,n+10));}
    if(str(first,0,4)==='fLaC'){
      let p=4;for(let i=0;i<256;i++){const h=await bytes(p,4),n=h[1]*65536+h[2]*256+h[3],last=!!(h[0]&128);if((h[0]&127)===4)return comments(await bytes(p+4,n),'FLAC');p+=4+n;if(p>file.size)throw Error('Bloco FLAC incompleto.');if(last)return {kind:'none',source:'FLAC'};}throw Error('Quantidade de blocos FLAC excedida.');
    }
    if(str(first,0,4)==='RIFF'&&str(first,8,12)==='WAVE'){
      let p=12;for(let i=0;i<2048&&p+8<=file.size;i++){const h=await bytes(p,8),n=u32(h,4,true);if(/^id3 $/i.test(str(h,0,4)))return parseID3(await bytes(p+8,n));p+=8+n+(n%2);if(p>file.size)throw Error('Bloco WAV incompleto.');}return {kind:'none',source:'WAV'};
    }
    if(str(first,4,8)==='ftyp'){
      let atomCount=0;
      async function atoms(start,end,depth=0){if(depth>8)throw Error('Estrutura MP4 muito profunda.');const list=[];for(let p=start;p+8<=end;){if(++atomCount>4096)throw Error('Muitos átomos MP4.');const h=await bytes(p,Math.min(16,end-p));let n=u32(h,0),header=8;if(n===1){bounded(h,8,8);n=Number(view(h).getBigUint64(8));header=16;}if(n===0)n=end-p;if(!Number.isSafeInteger(n)||n<header||p+n>end)throw Error('Átomo MP4 incompleto.');list.push({type:str(h,4,8),start:p+header,end:p+n});p+=n;}return list;}
      async function dataText(atom){const data=(await atoms(atom.start,atom.end)).find(a=>a.type==='data');if(!data)return null;const b=await bytes(data.start,data.end-data.start);bounded(b,0,8);const type=u32(b,0)&0xFFFFFF;return type===1?utf8.decode(b.subarray(8)):type===2?new TextDecoder('utf-16be').decode(b.subarray(8)):null;}
      async function walk(start,end,depth){for(const a of await atoms(start,end,depth)){
        if(a.type==='©lyr'){const text=await dataText(a);if(text!==null)return fromText(text,'metadados M4A · ©lyr');}
        if(a.type==='----'){const children=await atoms(a.start,a.end,depth+1),name=children.find(c=>c.type==='name');if(name){const b=await bytes(name.start,name.end-name.start);if(/^(?:UNSYNCED|SYNCED)?LYRICS$/i.test(utf8.decode(b.subarray(4)))){const text=await dataText(a);if(text!==null)return fromText(text,'metadados M4A · LYRICS');}}}
        if(['moov','udta','meta','ilst'].includes(a.type)){const found=await walk(a.start+(a.type==='meta'?4:0),a.end,depth+1);if(found)return found;}
      }}return await walk(0,file.size,0)||{kind:'none',source:'M4A'};
    }
    if(str(first,0,4)==='OggS'){
      let p=0,chunks=[],total=0,serial=null;
      for(let pages=0;pages<128&&p+27<=file.size;pages++){
        const h=await bytes(p,27);if(str(h,0,4)!=='OggS'||h[4]!==0)throw Error('Página Ogg inválida.');const table=await bytes(p+27,h[26]),size=table.reduce((s,n)=>s+n,0),pageSerial=u32(h,14,true);if(serial!==null&&pageSerial!==serial){p+=27+table.length+size;continue;}const body=await bytes(p+27+table.length,size);let cursor=0;
        for(const n of table){chunks.push(body.subarray(cursor,cursor+n));total+=n;cursor+=n;if(total>LIMIT)throw Error('Pacote Ogg muito grande.');if(n<255){const packet=new Uint8Array(total);let offset=0;for(const chunk of chunks){packet.set(chunk,offset);offset+=chunk.length;}chunks=[];total=0;if(str(packet,0,8)==='OpusHead'||packet[0]===1&&str(packet,1,7)==='vorbis')serial=pageSerial;if(str(packet,0,8)==='OpusTags')return comments(packet.subarray(8),'Opus');if(packet[0]===3&&str(packet,1,7)==='vorbis')return comments(packet.subarray(7),'Ogg Vorbis');}}
        p+=27+table.length+size;
      }return {kind:'none',source:'Ogg / Opus'};
    }
    return {kind:'unsupported',source:'arquivo local',notice:'A prévia ainda não lê letras embutidas deste formato. Você pode importar um LRC.'};
  }
  return {read,parseLRC,normalize};
})();
