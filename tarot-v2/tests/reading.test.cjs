const { test } = require('node:test');
const assert = require('node:assert/strict');
const reading = require('../js/tarot-reading.js');
const persona = require('../js/tarot-persona.js');
const state = { userName: 'An', userQuestion: 'Mình có nên nhận lời mời công việc này?', userVibe: 'chualanh', dob: {},
  activeSpread: { id: 'single', name: 'Một lá', slots: [{ title: 'Thông Điệp' }] },
  selectedCards: [{ data: { id: '00', name: 'The Fool', viName: 'Kẻ Khờ', meaning: 'Khởi đầu', revMeaning: 'Do dự' }, isReversed: true }] };
const response = { greeting: 'An ơi, Rót chào bạn. Mình cùng nhìn lời mời công việc này nhé.',
  cards: { card_0: 'Rót chưa nghiêng về việc nhận lời ngay. Kẻ Khờ ngược ở vị trí Thông Điệp gợi mình kiểm tra những điều chưa rõ về công việc.' },
  summary: 'Rót nghiêng về việc làm rõ trách nhiệm trước khi nhận lời. Khởi đầu mới có sức hút, nhưng Kẻ Khờ ngược gợi sự thận trọng khi còn thiếu dữ kiện.',
  advice: 'Rót đoán rằng bạn sẽ hỏi lại phạm vi công việc trước khi nhận lời. Kẻ Khờ ngược gợi việc dừng lại để kiểm tra; dấu hiệu để đối chiếu là một cuộc trao đổi cụ thể về trách nhiệm.' };

class Element {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {};
    this.values = {}; this.style = { setProperty: (key, value) => { this.values[key] = value; } };
    this.className = ''; this.hidden = false; this.inert = false;
    this.classList = { add: name => { this.className = [...new Set([...this.className.split(' ').filter(Boolean), name])].join(' '); },
      remove: name => { this.className = this.className.split(' ').filter(value => value !== name).join(' '); },
      contains: name => this.className.split(' ').includes(name) };
  }
  set textContent(text) { this.text = text; this.children = []; }
  get textContent() { return (this.text || '') + this.children.map(child => child.textContent).join(''); }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  focus(options) { this.focusOptions = options; }
}
const document = { createElement: tag => new Element(tag) };
const find = (element, className) => element.classList.contains(className) ? element : element.children.map(child => find(child, className)).find(Boolean);
const render = () => { const container = new Element('div'); container.id = 'reading-text'; reading.render(container, reading.fromStructured(response, state), state, document); return container; };

test('structured readings keep card identity and produce one prediction notice at the very end', () => {
  const text = reading.fromStructured({ ...response, advice: response.advice + ' ' + reading.PREDICTION_NOTICE + ' ' + reading.PREDICTION_NOTICE }, state);
  assert.equal(reading.assertComplete(text, state), text);
  assert.equal(text.split(reading.PREDICTION_NOTICE).length, 2);
  assert.ok(text.endsWith(reading.PREDICTION_NOTICE));
  assert.deepEqual(reading.sections(text, state).map(block => block.kind), ['intro', 'card', 'summary', 'prediction']);
  const card = reading.sections(text, state)[1]; assert.equal(card.reversed, true); assert.equal(card.title, 'Kẻ Khờ');
});

test('a footer cannot disguise an empty or missing prediction; legacy headings stay compatible', () => {
  for (const advice of ['', reading.PREDICTION_NOTICE, 'Ngắn. ' + reading.PREDICTION_NOTICE]) {
    assert.throws(() => reading.fromStructured({ ...response, advice }, state), error => error.code === 'INCOMPLETE_READING');
  }
  const legacy = reading.fromStructured(response, state).replace('Phán đoán của Rót', 'Một bước nhỏ cho bạn');
  assert.equal(reading.assertComplete(legacy, state), legacy);
});

test('prediction is hidden from assistive reading until the native button reveals it, without scrolling', () => {
  const container = render(), spoiler = find(container, 'prediction-spoiler'), content = find(container, 'prediction-content'), button = find(container, 'prediction-reveal');
  assert.equal(content.inert, true); assert.equal(content.attributes['aria-hidden'], 'true');
  assert.equal(button.tagName, 'button'); assert.equal(button.type, 'button'); assert.equal(button.attributes['aria-controls'], content.id);
  assert.equal(button.attributes['aria-expanded'], 'false'); assert.equal(button.textContent, 'Chạm để xem phán đoán');
  const count = spoiler.children.length;
  button.listeners.click(); button.listeners.click();
  assert.equal(content.inert, false); assert.equal(content.attributes['aria-hidden'], undefined);
  assert.equal(button.hidden, true); assert.equal(button.attributes['aria-expanded'], 'true');
  assert.ok(spoiler.classList.contains('is-revealed')); assert.deepEqual(content.focusOptions, { preventScroll: true });
  assert.equal(spoiler.children.length, count); assert.equal(find(container, 'prediction-notice').textContent, reading.PREDICTION_NOTICE);
  reading.render(container, reading.fromStructured(response, state), state, document);
  assert.equal(find(container, 'prediction-content').inert, true); assert.equal(find(container, 'prediction-reveal').hidden, false);
});

test('model prose stays plain text inside the spoiler, and animation delays are bounded', () => {
  const container = new Element('div'), unsafe = '<img src=x onerror=alert(1)> ';
  reading.render(container, reading.fromStructured({ ...response, advice: unsafe + response.advice }, state), state, document);
  assert.ok(find(container, 'prediction-content').textContent.includes(unsafe));
  const tags = element => [element.tagName, ...element.children.flatMap(tags)];
  assert.ok(!tags(container).includes('img'));
  assert.ok(container.children.every(section => parseInt(section.values['--reading-delay']) <= 510));
});

test('all tones and schemas request a fuller connected overview and one grounded specific prediction', () => {
  assert.equal(persona.PROMPT_VERSION, 8);
  for (const userVibe of Object.keys(persona.TONES).filter(id => id !== 'rost')) {
    const prompt = persona.readingPayload({ ...state, userVibe }, { structured: true }).systemInstruction.parts[0].text;
    assert.match(prompt, /100–140 từ/); assert.match(prompt, /MỘT khả năng cụ thể/);
    assert.ok(prompt.includes('trường advice chứa PHÁN ĐOÁN CỦA ' + persona.tone(userVibe).label.toUpperCase())); assert.ok(prompt.includes(reading.PREDICTION_NOTICE));
    assert.match(prompt, /dấu hiệu có thể quan sát/); assert.match(prompt, /không bịa tên, ngày cụ thể/);
  }
  const schema = reading.schema(state).json_schema.schema;
  assert.deepEqual(schema.required, ['greeting', 'cards', 'summary', 'advice']);
  assert.match(schema.properties.summary.description, /100–140 từ/);
  assert.match(schema.properties.advice.description, /MỘT sự việc\/chuyển biến CỤ THỂ/);
});

test('five readers retain distinct voices in readings and follow-ups, and migrate saved preferences', () => {
  const profile = require('../js/tarot-profile.js');
  assert.deepEqual(Object.keys(persona.READERS), ['rot', 'bot', 'tot', 'zot', 'rost']);
  assert.equal(profile.clean().vibe, 'rot');
  assert.equal(profile.clean({ vibe: 'constructor' }).vibe, 'rot'); assert.equal(persona.readerId('constructor'), 'rot');
  for (const [old, current] of Object.entries({ chualanh: 'rot', tatnuoc: 'zot', quansu: 'tot', phansau: 'rot' })) {
    assert.equal(profile.clean({ vibe: old }).vibe, current); assert.equal(persona.readerId(old), current);
  }
  for (const userVibe of Object.keys(persona.READERS)) {
    const selected = { ...state, userVibe }, reader = persona.tone(userVibe);
    const prompt = persona.readingPayload(selected, { structured: true }).systemInstruction.parts[0].text;
    const chat = persona.conversationPayload({ ...selected, readingResult: 'Prior reading.' }, [{ role: 'user', text: 'Tell me more.' }]);
    assert.ok(prompt.includes(reader.prompt)); assert.ok(chat.systemInstruction.parts[0].text.includes(reader.prompt));
    assert.equal(chat.contents[0].parts[0].text, 'Tell me more.');
    const original = persona.conversationPayload({ ...selected, userName: 'Rót con', userQuestion: 'Rót nghĩ sao?', readingResult: 'Rót đã nói câu này.' }, []);
    assert.ok(original.systemInstruction.parts[0].text.includes('Rót con'));
    assert.ok(original.systemInstruction.parts[0].text.includes('Rót đã nói câu này.'));
    const text = reading.fromStructured(response, selected);
    assert.ok(text.includes(reading.predictionTitle(selected)));
    assert.equal(reading.sections(text, selected).filter(block => block.kind === 'prediction').length, 1);
  }
});

test('Rost schema, prompt, headings, cards and spoiler use English throughout', () => {
  const selected = { ...state, userVibe: 'rost' }, prompt = persona.readingPayload(selected, { structured: true });
  assert.match(prompt.systemInstruction.parts[0].text, /natural English/);
  assert.doesNotMatch(prompt.systemInstruction.parts[0].text, /tiếng Việt|Xưng|PHÁN ĐOÁN/);
  const context = JSON.parse(persona.context(selected));
  assert.equal(context.cards[0].position, 'Message'); assert.equal(context.cards[0].orientation, 'Reversed'); assert.equal(context.cards[0].name, 'The Fool');
  assert.match(reading.schema(selected).json_schema.schema.properties.advice.description, /ONE specific observable event/);
  const text = reading.fromStructured({ ...response, advice: response.advice + ' ' + reading.PREDICTION_NOTICE + ' ' + reading.EN_NOTICE }, selected);
  assert.ok(text.includes('Message: The Fool')); assert.ok(text.includes('\nOverview\n')); assert.ok(text.includes("Rost's prediction"));
  assert.ok(text.endsWith(reading.EN_NOTICE)); assert.equal(text.split(reading.EN_NOTICE).length, 2); assert.ok(!text.includes(reading.PREDICTION_NOTICE));
  const container = new Element('div'); reading.render(container, text, selected, document);
  assert.equal(container.attributes.lang, 'en'); assert.equal(find(container, 'prediction-reveal').textContent, 'Tap to reveal the prediction');
  assert.equal(find(container, 'reading-orientation').textContent, 'Reversed');
});
