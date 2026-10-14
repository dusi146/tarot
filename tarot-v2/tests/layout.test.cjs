const test = require('node:test'), assert = require('node:assert/strict');
const { reveal } = require('../js/tarot-layout.js');
test('each phone spread reserves independent, non-overlapping rows for wrapped card names', () => {
  for (const [width, height] of [[320, 568], [360, 640], [390, 844], [412, 915], [768, 1024], [1440, 900], [844, 390]]) {
    for (const count of [1, 3, 4]) {
      const layout = reveal({ width, height, count, top: height < 500 ? 125 : 220, bottom: height - (height < 500 ? 20 : 125) });
      const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const cards = layout.cells.map(cell => ({ left: cell.centerX - layout.cardHeight / 1.7 / 2,
        right: cell.centerX + layout.cardHeight / 1.7 / 2, top: cell.centerY - layout.cardHeight / 2, bottom: cell.centerY + layout.cardHeight / 2 }));
      const captions = layout.cells.map(cell => ({ left: cell.centerX - cell.width / 2, right: cell.centerX + cell.width / 2,
        top: cell.captionY, bottom: cell.captionY + layout.captionHeight }));
      for (const caption of captions) {
        assert.ok(caption.left >= 0 && caption.right <= width, `${width}×${height}/${count}: horizontal bounds`);
        assert.ok(caption.bottom <= layout.bottom, `${width}×${height}/${count}: dock clearance`);
        for (const card of cards) assert.equal(intersects(caption, card), false, `${width}×${height}/${count}: text/card collision`);
      }
      for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) assert.equal(intersects(captions[i], captions[j]), false);
    }
  }
});
test('four-card portrait uses two complete rows, and increased text height reduces card height rather than covering cards', () => {
  const options = { width: 360, height: 780, count: 4, top: 220, bottom: 650 };
  const standard = reveal(options), wrapped = reveal({ ...options, captionHeight: 90 });
  assert.equal(standard.columns, 2); assert.equal(standard.rows, 2);
  assert.ok(wrapped.cardHeight < standard.cardHeight);
  assert.equal(wrapped.cells.length, 4);
});
