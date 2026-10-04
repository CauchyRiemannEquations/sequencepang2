import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve('dist');
http.createServer(async(req,res)=>{try{const p=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(p!==root&&!p.startsWith(root+sep))throw Error();const f=p===root?root+'/index.html':p;const body=await readFile(f);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff':'font/woff','.ogg':'audio/ogg','.wav':'audio/wav','.webmanifest':'application/manifest+json'})[extname(f)]||'application/octet-stream');res.end(body)}catch{res.writeHead(404);res.end('Not found')}}).listen(process.env.PORT||3000,'0.0.0.0');
