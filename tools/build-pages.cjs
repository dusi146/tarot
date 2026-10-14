// Publish only the standalone V2 runtime, never the workspace or private configuration.
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
function build(out = path.join(root, '_site'), version = 'local') {
  out = path.resolve(out);
  const relative = path.relative(root, out);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Output must be a fresh directory inside this workspace.');
  if (fs.existsSync(out)) throw new Error('Output already exists; choose a fresh directory.');
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(version)) throw new Error('Invalid public asset version.');
  fs.mkdirSync(out, { recursive: true });
  const source = path.join(root, 'tarot-v2');
  const allowed = ['index.html', 'app.css', 'experience.css', 'js', 'images', 'fonts', 'vendor'];
  for (const item of allowed) fs.cpSync(path.join(source, item), path.join(out, item), { recursive: true,
    filter: file => {
      if (path.relative(source, file).split(path.sep).some(part => part.startsWith('.'))) return false;
      if (fs.statSync(file).isDirectory()) return true;
      const extensions = { js: /\.js$/, images: /\.(png|jpe?g|webp|svg|avif)$/, fonts: /\.(ttf|woff2?|css|txt|md)$/, vendor: /\.(js|txt|md)$/ };
      return !extensions[item] || extensions[item].test(file);
    } });
  fs.copyFileSync(path.join(root, 'CNAME'), path.join(out, 'CNAME'));
  const indexFile = path.join(out, 'index.html');
  const html = fs.readFileSync(indexFile, 'utf8')
    .replace(/(src|href)="([^"?]+\.(?:js|css))"/g, '$1="$2?v=' + version + '"')
    .replace('<meta charset="UTF-8" />', '<meta charset="UTF-8" />\n  <meta name="tarot-build" content="' + version + '" />');
  fs.writeFileSync(indexFile, html);
  return out;
}
module.exports = { build };
if (require.main === module) console.log('Pages artifact: ' + build(process.env.PAGES_OUT, process.env.ASSET_VERSION || 'local'));
