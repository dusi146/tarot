const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { build } = require('../../tools/build-pages.cjs');
test('Pages contains the complete V2 runtime and no backend, backups or private configuration', () => {
  const root = path.resolve(__dirname, '../..'), output = path.join(root, 'backups', 'pages-test-' + Date.now());
  build(output, 'review-test');
  const files = fs.readdirSync(output, { recursive: true }).filter(file => fs.statSync(path.join(output, file)).isFile());
  for (const file of files) {
    assert.ok(!/(^|[\\/])(apps-script|tests|artifacts|backups|\.git)([\\/]|$)|\.gs$|\.cjs$|(^|[\\/])\.env|_config\.json$/.test(file), file);
    if (/\.(js|html|css)$/.test(file)) {
      const content = fs.readFileSync(path.join(output, file), 'utf8');
      assert.ok(!/gsk_[a-zA-Z0-9]{20,}|AIza[a-zA-Z0-9_-]{25,}|sk-[a-zA-Z0-9]{25,}/.test(content), 'No credential in ' + file);
      if (file.endsWith('.js')) new vm.Script(content, { filename: file });
    }
  }
  const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
  assert.match(html, /name="tarot-build" content="review-test"/);
  assert.match(html, /js\/tarot-carousel\.js\?v=review-test/);
  for (const match of html.matchAll(/(?:src|href)="([^"?#]+)(?:\?[^"#]*)?"/g)) {
    if (/^(https?:|#)/.test(match[1])) continue;
    assert.ok(fs.existsSync(path.join(output, match[1])), 'Referenced asset: ' + match[1]);
  }
  assert.ok(files.includes(path.join('js', 'sheets-config.js')));
  assert.ok(!files.some(file => /^images[\\/].*\.txt$/.test(file)));
  assert.equal(files.filter(file => /^images[\\/].*\.png$/.test(file)).length >= 78, true);
  assert.equal(fs.readFileSync(path.join(output, 'CNAME'), 'utf8').trim(), 'tavanrot.online');
  assert.throws(() => build(output, 'review-test'), /already exists/);
  assert.throws(() => build(root, 'review-test'), /fresh directory/);
});
