const { test } = require('node:test');
const assert = require('node:assert/strict');
const persona = require('../tarot-persona.js');
const state = {
  userName: 'An', userQuestion: 'Mình đang băn khoăn về công việc', userVibe: 'chualanh',
  dob: { day: 8, month: 10, year: 2003 }, zodiac: 'Thiên Bình',
  activeSpread: { name: 'Dòng Thời Gian', slots: [{ title: 'Quá Khứ' }, { title: 'Hiện Tại' }, { title: 'Tương Lai' }] },
  selectedCards: ['The Fool', 'The Moon', 'The Star'].map((name, i) => ({
    isReversed: i === 1, data: { name, viName: name, meaning: `Meaning ${name}`, revMeaning: `Reversed ${name}` }
  })),
  readingResult: 'Chiêm nghiệm '.repeat(150) + 'ĐOẠN KẾT QUAN TRỌNG'
};
test('all twelve zodiac boundaries and the dates reported by the user are correct', () => {
  const starts = [[20, 1, 'Bảo Bình'], [19, 2, 'Song Ngư'], [21, 3, 'Bạch Dương'], [20, 4, 'Kim Ngưu'],
    [21, 5, 'Song Tử'], [21, 6, 'Cự Giải'], [23, 7, 'Sư Tử'], [23, 8, 'Xử Nữ'],
    [23, 9, 'Thiên Bình'], [23, 10, 'Bọ Cạp'], [22, 11, 'Nhân Mã'], [22, 12, 'Ma Kết']];
  starts.forEach(([day, month, sign], index) => {
    assert.equal(persona.zodiac(day, month), sign);
    assert.equal(persona.zodiac(day - 1, month), starts[(index + 11) % 12][2]);
  });
  assert.equal(persona.zodiac(8, 10, 2003), 'Thiên Bình');
  assert.equal(persona.zodiac(1, 9, 2007), 'Xử Nữ');
  assert.equal(persona.zodiac(10, 12, 2007), 'Nhân Mã');
  assert.equal(persona.zodiac(31, 12), 'Ma Kết');
  assert.equal(persona.zodiac(1, 1), 'Ma Kết');
});
test('impossible dates are rejected, including century leap-year rules', () => {
  for (const args of [[31, 4, 2026], [29, 2, 2026], [29, 2, 1900], [0, 1, 2000], [1, 13, 2000]]) {
    assert.equal(persona.validDate(...args), false);
    assert.equal(persona.zodiac(...args), '');
  }
  assert.equal(persona.zodiac(29, 2, 2000), 'Song Ngư');
  assert.equal(persona.zodiac(29, 2, 2024), 'Song Ngư');
});
test('each tone gives distinct reading and conversation instructions', () => {
  const prompts = Object.keys(persona.TONES).map(userVibe => {
    const value = { ...state, userVibe };
    const reading = persona.readingPayload(value);
    const conversation = persona.conversationPayload(value, [{ role: 'user', text: 'Mình thấy lo quá' }]);
    assert.ok(reading.systemInstruction.parts[0].text.includes(persona.TONES[userVibe].prompt));
    assert.ok(conversation.systemInstruction.parts[0].text.includes(persona.TONES[userVibe].prompt));
    return reading.systemInstruction.parts[0].text;
  });
  assert.equal(new Set(prompts).size, 4);
});
test('conversation includes every card, orientation, full reading and previous turns', () => {
  const history = [{ role: 'user', text: 'Câu đầu' }, { role: 'rot', text: 'Trả lời đầu' }, { role: 'user', text: 'Mình vẫn băn khoăn' }];
  const payload = persona.conversationPayload(state, history);
  const instruction = payload.systemInstruction.parts[0].text;
  for (const name of ['The Fool', 'The Moon', 'The Star', 'ĐOẠN KẾT QUAN TRỌNG']) assert.ok(instruction.includes(name));
  assert.ok(instruction.includes('Ngược'));
  assert.ok(instruction.includes('Reversed The Moon'));
  assert.deepEqual(payload.contents.map(item => item.role), ['user', 'model', 'user']);
  assert.equal(payload.contents[1].parts[0].text, 'Trả lời đầu');
});
test('general conclusion answers the question directly across all tones and structured output keeps card analysis separate', () => {
  for (const userVibe of Object.keys(persona.TONES)) {
    const prompt = persona.readingPayload({ ...state, userVibe }, { structured: true }).systemInstruction.parts[0].text;
    assert.ok(prompt.includes('NGAY CÂU ĐẦU')); assert.ok(prompt.includes('45 đến 70 từ'));
    assert.ok(prompt.includes('Không dồn phần phân tích này sang Góc nhìn chung'));
    assert.ok(prompt.includes('đúng JSON theo schema')); assert.ok(prompt.includes('Nếu câu hỏi mơ hồ'));
  }
});
