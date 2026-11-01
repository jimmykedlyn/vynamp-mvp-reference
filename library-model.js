(function(root,factory){const model=factory();if(typeof module==='object'&&module.exports)module.exports=model;else root.VynampLibraryModel=model;})(globalThis,()=>{
 'use strict';
 const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
 const format=t=>t.demo?'DEMO':t.radio?'RADIO':String(t.format||t.file?.name.split('.').pop()||'').toUpperCase();
 const identity=t=>JSON.stringify(t.demo?['demo',t.id]:t.radio?['radio',t.url]:['file',t.file?.name||t.fileName||t.title,t.file?.size??t.size??0,t.file?.lastModified??t.lastModified??0,...(t.file?.webkitRelativePath?[t.file.webkitRelativePath]:[])]);
 function matches(t,query,filters={}){const source=t.demo?'demo':t.radio?'radio':'local';if(filters.source&&filters.source!==source||filters.format&&filters.format!==format(t)||filters.genre&&filters.genre!==t.genre)return false;const hay=normalize([t.title,t.artist,t.album,t.genre,format(t),t.trackNumber,t.file?.name].join(' '));return normalize(query).split(/\s+/).every(term=>hay.includes(term));}
 function move(queue,cursor,from,to){const next=queue.slice();if(!Number.isInteger(from)||!Number.isInteger(to)||from<=cursor||to<=cursor||from>=next.length||to>=next.length)return next;next.splice(to,0,next.splice(from,1)[0]);return next;}
 function insertNext(queue,cursor,ids){const next=queue.slice();next.splice(cursor+1,0,...ids);return next;}
 return {normalize,format,identity,matches,move,insertNext};
});
