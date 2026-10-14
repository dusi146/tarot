// Independent local server for the new website: node serve.cjs
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.json': 'application/json' };
http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end(); return; }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = path.resolve(root, '.' + pathname);
  const relative = path.relative(root, file);
  if (!file.startsWith(root + path.sep) || relative.split(path.sep).some(part => part.startsWith('.'))
      || ['tests', 'artifacts', 'apps-script'].includes(relative.split(path.sep)[0]) || file.endsWith('.cjs')) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(Number(process.env.PORT || 4182), '127.0.0.1', function () {
  console.log('Ta Văn Rót V2: http://127.0.0.1:' + this.address().port + '/?preview=1');
});
