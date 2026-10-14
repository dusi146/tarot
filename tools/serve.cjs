// Local preview only. Run: node tools/serve.cjs
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.ttf': 'font/ttf' };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let name;
  try { name = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end(); return; }
  if (name === '/') name = '/index.html';
  const file = path.resolve(root, '.' + name);
  if (!file.startsWith(root + path.sep) || /(?:^|[/\\])\.|gemini_config|admin\.html/.test(name)) {
    res.writeHead(403).end(); return;
  }
  fs.readFile(file, (error, bytes) => {
    if (error) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(bytes);
  });
}).listen(4173, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:4173'));
