const { test } = require('node:test');
const assert = require('node:assert/strict');
test('numeric ranges keep their meaning when decorative dashes are cleaned', () => {
  const reading = require('../tarot-reading.js');
  assert.equal(reading.cleanText('Chọn 3–5 tiêu chí — bắt đầu trong 10–15 phút.'), 'Chọn 3 đến 5 tiêu chí, bắt đầu trong 10 đến 15 phút.');
});
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
test('a short prose sentence mentioning a position and card is never swallowed as a heading', () => {
  const sentence = 'Quá Khứ: Kẻ Khờ cho thấy bạn từng bắt đầu khá vội vàng.';
  const result = reading.sections('Quá Khứ: Kẻ Khờ\n' + sentence, state);
  assert.equal(result.length, 1); assert.equal(result[0].paragraphs[0], sentence);
});
test('empty card interpretation is rejected rather than shown as a completed reading', () => {
  const single = { activeSpread: { slots: [{ title: 'Thông Điệp' }] }, selectedCards: [{ data: { viName: 'Vua Xu' }, isReversed: false }] };
  const incomplete = 'Thông Điệp: Vua Xu\n\nGóc nhìn chung\nVua Xu nói về sự ổn định, nhưng phần phân tích riêng đang bị bỏ trống.\n\nMột bước nhỏ cho bạn\nHãy viết ra một việc thực tế bạn có thể bắt đầu và hoàn thành trong ngày hôm nay.';
  assert.throws(() => reading.assertComplete(incomplete, single), { code: 'INCOMPLETE_READING' });
  const fields = { greeting: '', cards: { card_0: 'Bạn đang cần một nền tảng chắc chắn hơn, nên hãy ưu tiên điều có thể duy trì đều đặn thay vì kết quả nhanh.' },
    summary: 'Hôm nay hãy tập trung vào việc ổn định sinh hoạt, vì nền tảng tốt giúp bạn quyết định bớt vội vàng.',
    advice: 'Chọn một thói quen nhỏ và dành mười phút thực hiện ngay hôm nay, rồi ghi lại điều bạn đã hoàn thành.' };
  const complete = reading.fromStructured(fields, single);
  assert.equal(reading.assertComplete(complete, single), complete);
});

test('reading rendering never interprets model output as HTML', () => {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.textContent = ''; this.classList = { add() {}, remove() {} }; }
    appendChild(child) { this.children.push(child); }
  }
  const document = { createElement: tag => new Element(tag) }, container = new Element('div');
  reading.render(container, text + '\n<img src=x onerror=alert(1)>', state, document);
  assert.equal(container.children[1].className, 'reading-section reading-interpretation', 'interpretation must not inherit the horizontal card-preview layout');
  const last = container.children.at(-1);
  assert.equal(last.className, 'reading-section reading-advice');
  assert.ok(last.children.some(child => child.tag === 'p' && child.textContent.includes('<img src=x')));
  assert.ok(!container.children.some(child => child.tag === 'img'));
  const cards = new Element('div'); reading.renderCards(cards, state, document, 'images/');
  assert.equal(cards.children.length, 3);
  assert.equal(cards.children[1].dataset.tone, 'clarity');
  assert.equal(cards.children[1].children[0].className, 'reversed-thumb');
});
