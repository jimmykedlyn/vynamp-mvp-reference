// Copy out/ into the main repository's reference package and write SOURCE.json.
// node tools/package.cjs <target-dir>   (e.g. ../repo/assets/reference/mvp)
// Keeps README.md in the target; everything else listed below is replaced.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{execFileSync}=require('child_process');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'out'),[TARGET]=process.argv.slice(2);
if(!TARGET)throw new Error('usage: node tools/package.cjs <target-dir>');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const walk=d=>fs.readdirSync(d).sort().flatMap(f=>{const p=path.join(d,f);return fs.statSync(p).isDirectory()?walk(p):[p];});
const rel=(a,b)=>path.relative(a,b).replace(/\\/g,'/');

// same definition as docs/design/06-mvp-reference.md: sha256 of the sorted "sha256 *./path" lines
const mvp=path.join(ROOT,'mvp');
const treeHash=sha(walk(mvp).map(f=>'./'+rel(mvp,f)).sort().map(r=>sha(fs.readFileSync(path.join(mvp,r)))+' *'+r+'\n').join(''));

const MAP=[['themes/themes.json','themes.json'],['svg/icons','icons'],['svg/meters','meters'],['svg/rendered','rendered'],['check/report.json','svg-check.json']];
for(const [,dst] of MAP)fs.rmSync(path.join(TARGET,dst),{recursive:true,force:true});
for(const [src,dst] of MAP)fs.cpSync(path.join(OUT,src),path.join(TARGET,dst),{recursive:true});

const git=(...a)=>execFileSync('git',['-C',ROOT,...a],{encoding:'utf8'}).trim();
const ver=(cmd,args)=>{try{return execFileSync(cmd,args,{encoding:'utf8'}).trim();}catch{return null;}};
const files={};for(const f of walk(TARGET)){const r=rel(TARGET,f);if(r!=='README.md'&&r!=='SOURCE.json')files[r]=sha(fs.readFileSync(f));}
(async()=>{const {chromium}=require('playwright');const b=await chromium.launch({...(process.env.CHROME?{executablePath:process.env.CHROME}:{channel:'chrome'})});const CHROME=b.version();await b.close();
const source={
  mvp:{revision:'rev.37',treeSha256:treeHash,files:walk(mvp).length},
  tool:{repository:'vynamp-mvp-reference',commit:git('rev-parse','HEAD'),dirty:git('status','--porcelain')!==''},
  environment:{node:process.version,playwright:require('playwright/package.json').version,
    chrome:CHROME,resvg:ver(process.env.RESVG||path.join(require('os').homedir(),'.cargo/bin/resvg'+(process.platform==='win32'?'.exe':'')),['--version'])},
  commands:['npm run serve','npm run extract','npm run check-svg','npm run verify','node tools/package.cjs <target>'],
  files};
fs.writeFileSync(path.join(TARGET,'SOURCE.json'),JSON.stringify(source,null,1)+'\n');
console.log('packaged',Object.keys(files).length,'files, mvp',treeHash.slice(0,12),'tool',source.tool.commit.slice(0,8),source.tool.dirty?'(dirty)':'');
})().catch(e=>{console.error(e);process.exit(1)});
