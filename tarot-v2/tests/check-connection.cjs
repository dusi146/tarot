// One nonpersonal reading, no IP lookup or Sheets write. Never prints credentials or response text.
const fs = require('node:fs');
const path = require('node:path');
const transport = require('../js/tarot-transport.js').create({ fetch });
const endpoint = 'https://script.google.com/macros/s/AKfycbyGthc9VzZjrSpQELLDNq7K9z_dIMNWVAbQYxugCyiKUm2eCdUe5Zwm6X5EREhTUqVK/exec';
(async () => {
  const health = await transport.request(endpoint + '?action=ai_health', { timeout: 30000 });
  if (health.service !== 'tarot-ai' || health.version !== 2) throw new Error('Incompatible server; no POST sent.');
  const result = await transport.request(endpoint, { timeout: 210000, payload: { action: 'ai_reading', state: {
    name: '', question: 'Mình muốn học một kỹ năng mới trong tháng này, nên bắt đầu thế nào?', vibe: 'tatnuoc',
    spreadId: 'single', cards: [{ id: '01', reversed: false }]
  } } });
  const report = { checkedAt: new Date().toISOString(), providers: health.providers, status: result.status,
    fallbackVersion: health.fallbackVersion, quotaPolicy: health.quotaPolicy,
    provider: result.provider, model: result.model, code: result.code, characters: result.text?.length || 0,
    diagnostics: require('../js/tarot-ai.js').diagnostics(result), sheetWrites: 0 };
  fs.writeFileSync(path.join(__dirname, '../artifacts/live-connection.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (result.status !== 'success') process.exitCode = 1;
})().catch(error => { console.error(error.message); process.exitCode = 1; });
