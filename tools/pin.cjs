// Print the pin record the main repository cites for a commit of this repository.
// node tools/pin.cjs [ref]   (default HEAD)
// Reads git objects only, so the result does not depend on the working copy or its line endings.
// The main repository never copies mvp/ or out/; it cites vynamp-mvp-reference@<commit> plus paths.
const crypto=require('crypto'),{execFileSync}=require('child_process'),path=require('path');
const ROOT=path.resolve(__dirname,'..'),ref=process.argv[2]||'HEAD';
const git=(a,enc='utf8')=>execFileSync('git',['-C',ROOT,...a],{encoding:enc,maxBuffer:1<<28});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const commit=git(['rev-parse',ref+'^{commit}']).trim();
const tree=p=>git(['rev-parse',commit+':'+p]).trim();

// same definition as the main repository's docs/design/06-mvp-reference.md:
// sha256 of the "sha256 *./path\n" lines (sha256sum --binary format) sorted by path,
// over every file of mvp/, read from the commit's blobs
const entries=git(['ls-tree','-r','-z','--full-tree',commit,'--','mvp/']).split('\0').filter(Boolean)
  .map(l=>{const [meta,p]=l.split('\t');const [,type,id]=meta.split(' ');return {type,id,rel:'./'+p.slice(4)};})
  .filter(e=>e.type==='blob');
entries.sort((a,b)=>a.rel<b.rel?-1:a.rel>b.rel?1:0);
let bytes=0;
const lines=entries.map(e=>{const b=git(['cat-file','blob',e.id],'buffer');bytes+=b.length;return sha(b)+' *'+e.rel+'\n';});

console.log(JSON.stringify({
  repository:'vynamp-mvp-reference',commit,
  mvp:{contentSha256:sha(lines.join('')),gitTree:tree('mvp'),files:entries.length,bytes},
  out:{gitTree:tree('out')},
},null,1));
