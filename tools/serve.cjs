// Minimal no-store static server: node serve.cjs <dir> <port>
const http=require('http'),fs=require('fs'),path=require('path');
const [dir,port]=[path.resolve(process.argv[2]),+process.argv[3]];
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'};
// loopback only; a malformed escape is a 404, not a crash
http.createServer((req,res)=>{let f;try{f=path.join(dir,decodeURIComponent(new URL(req.url,'http://x').pathname));}catch{res.writeHead(404);return res.end();}
  if(!f.startsWith(dir+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end();}
  res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(f).pipe(res);}).listen(port,'127.0.0.1');
