// Re-extract into a temporary directory and compare byte for byte with out/ (check/ excluded: svgcheck output is not extraction).
// node tools/verify.cjs [base-url]   (serve mvp/ first; exit 1 when any file differs, is missing or is extra)
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),{execFileSync}=require('child_process');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'out'),BASE=process.argv[2]||'http://localhost:8766/';
const TMP=fs.mkdtempSync(path.join(os.tmpdir(),'vynamp-verify-'));
const walk=d=>fs.readdirSync(d).sort().flatMap(f=>{const p=path.join(d,f);return fs.statSync(p).isDirectory()?walk(p):[p];});
const hashes=d=>Object.fromEntries(walk(d).map(f=>[path.relative(d,f).split(path.sep).join('/'),f]).filter(([r])=>!r.startsWith('check/'))
  .map(([r,f])=>[r,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
try{
  execFileSync(process.execPath,[path.join(__dirname,'extract.cjs'),path.join(ROOT,'mvp'),BASE,TMP],{stdio:['ignore','ignore','inherit']});
  const a=hashes(OUT),b=hashes(TMP),diff=[...new Set([...Object.keys(a),...Object.keys(b)])].sort().filter(k=>a[k]!==b[k]);
  for(const k of diff.slice(0,40))console.log(!(k in a)?'extra  ':!(k in b)?'missing':'differs',k);
  // keep the second extraction's copy of each differing file for inspection (verify-diff/ is not tracked)
  const KEEP=path.join(ROOT,'verify-diff');fs.rmSync(KEEP,{recursive:true,force:true});
  for(const k of diff.filter(k=>k in b)){fs.mkdirSync(path.dirname(path.join(KEEP,k)),{recursive:true});fs.copyFileSync(path.join(TMP,k),path.join(KEEP,k));}
  console.log('compared',Object.keys(a).length,'files,',diff.length,'differ');process.exitCode=diff.length?1:0;
}finally{fs.rmSync(TMP,{recursive:true,force:true});}
