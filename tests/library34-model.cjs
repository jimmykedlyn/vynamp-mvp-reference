const assert=require('node:assert/strict');
const M=require('../library-model.js');
const a={id:'a',title:'Canção',artist:'João',album:'Noite',genre:'Melody',format:'FLAC'},b={id:'b',title:'Other',artist:'Nina',format:'MP3'};
assert(M.matches(a,'joao melody flac',{}));assert(!M.matches(a,'joao',{format:'MP3'}));assert(M.matches(a,'cancao',{format:'FLAC'}));
assert.equal(M.identity({file:{name:'a.mp3',size:123,lastModified:8}}),M.identity({id:'different',file:{name:'a.mp3',size:123,lastModified:8}}));
assert.notEqual(M.identity({file:{name:'a.mp3',size:123,lastModified:8}}),M.identity({file:{name:'a.mp3',size:124,lastModified:8}}));
assert.notEqual(M.identity({file:{name:'Track01.mp3',size:123,lastModified:8,webkitRelativePath:'Root/Album A/Track01.mp3'}}),M.identity({file:{name:'Track01.mp3',size:123,lastModified:8,webkitRelativePath:'Root/Album B/Track01.mp3'}}));
const queue=['a','b','a','c'];assert.deepEqual(M.move(queue,1,2,3),['a','b','c','a']);assert.deepEqual(queue,['a','b','a','c']);
assert.deepEqual(M.move(queue,1,0,3),queue);assert.deepEqual(M.move(queue,1,3,1),queue);
assert.deepEqual(M.insertNext(queue,1,['z','x']),['a','b','z','x','a','c']);
assert.deepEqual(M.matches({...b,demo:true},'',{source:'local'}),false);
console.log('library34 model passed');

