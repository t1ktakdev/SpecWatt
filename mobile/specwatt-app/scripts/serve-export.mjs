// Loopback-only QA server for Expo WEB exports; SPA fallback supports direct routes.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.argv[2]||'dist-web-v6');
const port=Number(process.argv[3]||8103);
http.createServer((req,res)=>{
 try{
  const requested=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  let file=path.resolve(root,'.'+requested);
  if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403).end();return;}
  if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');
  const ext=path.extname(file);
  const content=fs.readFileSync(file);
  res.writeHead(200,{'Content-Type':({'.js':'application/javascript','.html':'text/html','.ttf':'font/ttf','.png':'image/png','.json':'application/json','.css':'text/css'})[ext]||'application/octet-stream','Content-Length':content.length,'Cache-Control':'no-store'});
  res.end(content);
 }catch{res.writeHead(404).end();}
}).listen(port,'127.0.0.1',()=>console.log(`QA export server: http://127.0.0.1:${port}`));
