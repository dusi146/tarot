const { test } = require('node:test');
const assert = require('node:assert/strict');
const reading = require('../tarot-reading.js');
const state = {
  activeSpread: { slots: [{ title: 'Quá Khứ' }, { title: 'Hiện Tại' }, { title: 'Tương Lai' }] },
  selectedCards: ['Kẻ Khờ', 'Mặt Trăng', 'Ngôi Sao'].map((viName, index) => ({ data: { viName, file: index + '.png' }, isReversed: index === 1 }))
};
const text = `Chào bạn. Rót đang ở đây.

## Quá Khứ: **Kẻ Khờ**
Bạn đã đi qua một khởi đầu mới.

Hiện Tại: Mặt Trăng
Có điều bạn vẫn còn băn khoăn.

Tương Lai: Ngôi Sao
Bạn có thể tìm lại niềm tin.

Góc nhìn chung
Các lá gợi ý một quá trình hiểu mình hơn.

Một bước nhỏ cho bạn
Hãy viết ra điều bạn có thể chủ động hôm nay.`;

test('reading colors express positions consistently without marking reversed cards as bad', () => {
  assert.equal(reading.themeFor('Quá Khứ').key, 'reflection');
  assert.equal(reading.themeFor('Hiện Tại').key, 'clarity');
  assert.equal(reading.themeFor('Tương Lai').key, 'possibility');
  assert.equal(reading.themeFor('Lời Khuyên').key, 'clarity');
  assert.equal(reading.themeFor('Trở Ngại').key, 'caution');
});

test('special decorations and Markdown are removed while Vietnamese and numbers remain intact', () => {
  const result = reading.cleanText('## 🔮 **Lời giải**\n\n- Bạn có 2 lựa chọn.\n* Hãy dành 15 phút.\n\n✨ Chậm lại, đừng vội.');
  assert.equal(result, 'Lời giải\n\nBạn có 2 lựa chọn.\nHãy dành 15 phút.\n\nChậm lại, đừng vội.');
  assert.ok(!/[#*🔮✨]/u.test(result));
  assert.ok(result.includes('đừng vội'));
});

test('card interpretations, summary and advice form separate sections in order', () => {
  const result = reading.sections(text, state);
  assert.deepEqual(result.map(section => section.kind), ['intro', 'card', 'card', 'card', 'summary', 'advice']);
  assert.deepEqual(result.filter(section => section.kind === 'card').map(section => section.title), ['Kẻ Khờ', 'Mặt Trăng', 'Ngôi Sao']);
  assert.equal(result[2].reversed, true);
  assert.equal(result[5].paragraphs[0], 'Hãy viết ra điều bạn có thể chủ động hôm nay.');
});

test('reading rendering never interprets model output as HTML', () => {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.textContent = ''; this.classList = { add() {}, remove() {} }; }
    appendChild(child) { this.children.push(child); }
  }
  const document = { createElement: tag => new Element(tag) }, container = new Element('div');
  reading.render(container, text + '\n<img src=x onerror=alert(1)>', state, document);
  const last = container.children.at(-1);
  assert.equal(last.className, 'reading-section reading-advice');
  assert.ok(last.children.some(child => child.tag === 'p' && child.textContent.includes('<img src=x')));
  assert.ok(!container.children.some(child => child.tag === 'img'));
  const cards = new Element('div'); reading.renderCards(cards, state, document, 'images/');
  assert.equal(cards.children.length, 3);
  assert.equal(cards.children[1].dataset.tone, 'clarity');
  assert.equal(cards.children[1].children[0].className, 'reversed-thumb');
});
