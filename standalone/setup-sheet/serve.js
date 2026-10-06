// Tiny static server:  node serve.js   then open http://localhost:8765
const http = require('http'), fs = require('fs'), path = require('path');
const types = { '.html': 'text/html', '.js': 'text/javascript' };
http.createServer((req, res) => {
  const name = decodeURIComponent(req.url.split('?')[0]), f = path.join(__dirname, name === '/' ? 'index.html' : name);
  if (!f.startsWith(__dirname) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(fs.readFileSync(f));
}).listen(+process.env.PORT || 8765, () => console.log('http://localhost:' + (process.env.PORT || 8765)));
