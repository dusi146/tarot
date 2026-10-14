/* Role-based reading colors and safe, plain-text presentation of the oracle. */
(function (root) {
  'use strict';
  const THEMES = {
    reflection: { color: '#c4b5e8', hint: 'Nhìn lại để hiểu mình hơn' },
    clarity: { color: '#91cfc7', hint: 'Điều bạn có thể nhận ra lúc này' },
    possibility: { color: '#e4c38b', hint: 'Một hướng đi để bạn cân nhắc' },
    grounding: { color: '#b1c7a5', hint: 'Điều thực tế bạn có thể chăm sóc' },
    caution: { color: '#dba8a0', hint: 'Một điểm cần nhìn nhận nhẹ nhàng' },
    insight: { color: '#a9c7e2', hint: 'Một góc nhìn để gỡ nút thắt' }
  };
  const fold = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
  function themeFor(title, index = 0) {
    const key = ({ 'qua khu': 'reflection', 'hien tai': 'clarity', 'tuong lai': 'possibility',
      'thong diep': 'possibility', 'than': 'grounding', 'tam': 'reflection', 'tri': 'insight',
      'van de': 'reflection', 'tro ngai': 'caution', 'loi khuyen': 'clarity', 'ket qua': 'possibility' })[fold(title)] || ['reflection', 'clarity', 'possibility'][index % 3];
    return { key, ...THEMES[key] };
  }
  function cleanText(value) {
    return String(value || '').replace(/\r\n?/g, '\n')
      .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)')
      .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '').replace(/^[ \t]*(?:[-*•▪][ \t]+|>[ \t]?)/gm, '')
      .replace(/\*([^*\n]+)\*/g, '$1').replace(/`([^`]+)`/g, '$1')
      .replace(/[\p{Extended_Pictographic}\uFE0F\u200D\u20E3✦★☆]/gu, '')
      .replace(/[ \t]*[—–][ \t]*/g, ', ').replace(/[↗↘]/g, '').replace(/→/g, ' đến ')
      .replace(/^[ \t]*[-_=]{3,}[ \t]*$/gm, '').replace(/^[ \t]+/gm, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function sections(text, state) {
    const cards = state.selectedCards || [], list = [];
    let section = { kind: 'intro', title: '', paragraphs: [] }, paragraph = [];
    function flushParagraph() { if (paragraph.length) section.paragraphs.push(paragraph.join(' ')); paragraph = []; }
    function flushSection() { flushParagraph(); if (section.title || section.paragraphs.length) list.push(section); }
    for (const line of cleanText(text).split('\n')) {
      if (!line.trim()) { flushParagraph(); continue; }
      const title = line.trim().replace(/^\d+[.)]\s*/, '');
      const normalized = fold(title).replace(/[:.]+$/, '');
      const index = cards.findIndex((card, i) => {
        const slot = fold(state.activeSpread.slots[i].title);
        const candidate = normalized.replace(/[()[\]]/g, '').replace(/\s*[:,\-]\s*/g, ' ').replace(/\s+/g, ' ').trim();
        const heading = slot + ' ' + fold(card.data.viName);
        return candidate === slot || ['', ' xuoi', ' nguoc', ' bai xuoi', ' bai nguoc'].some(suffix => candidate === heading + suffix);
      });
      const advice = ['mot buoc nho cho ban', 'dieu ban co the lam', 'loi khuyen danh cho ban'].includes(normalized);
      const summary = ['goc nhin chung', 'tong quan', 'tong ket'].includes(normalized);
      if (index >= 0 || advice || summary) {
        flushSection();
        section = index >= 0 ? { kind: 'card', title: cards[index].data.viName, slot: state.activeSpread.slots[index].title,
          reversed: cards[index].isReversed, theme: themeFor(state.activeSpread.slots[index].title, index), paragraphs: [] }
          : { kind: advice ? 'advice' : 'summary', title: advice ? 'Một bước nhỏ cho bạn' : 'Góc nhìn chung', paragraphs: [] };
      } else paragraph.push(line.trim());
    }
    flushSection(); return list;
  }
  function assertComplete(text, state) {
    const blocks = sections(text, state);
    const cards = blocks.filter(block => block.kind === 'card');
    const filled = block => block && block.paragraphs.join(' ').trim().length >= 40;
    const valid = cards.length === state.selectedCards.length && state.selectedCards.every((card, i) =>
      cards.filter(block => block.slot === state.activeSpread.slots[i].title && block.title === card.data.viName).length === 1)
      && cards.every(filled) && filled(blocks.find(block => block.kind === 'summary')) && filled(blocks.find(block => block.kind === 'advice'));
    if (!valid) {
      const error = new Error('Rót chưa nhận đủ nội dung lời giải. Bạn nhấn Thử lại lời giải nhé, các lá đã chọn vẫn được giữ.');
      error.code = 'INCOMPLETE_READING'; throw error;
    }
    return text;
  }
  function schema(state) {
    const properties = {}, required = [];
    state.selectedCards.forEach((card, i) => {
      const key = 'card_' + i; required.push(key);
      properties[key] = { type: 'string', description: `${state.activeSpread.slots[i].title}: ${card.data.viName}, ${card.isReversed ? 'ngược' : 'xuôi'}. Viết 2 đến 3 câu phân tích gắn với câu hỏi, không tiêu đề, không bỏ trống.` };
    });
    return { type: 'json_schema', json_schema: { name: 'tarot_reading', strict: true, schema: {
      type: 'object', additionalProperties: false, required: ['greeting', 'cards', 'summary', 'advice'],
      properties: {
        greeting: { type: 'string', description: 'Một lời chào ngắn, có thể để trống.' },
        cards: { type: 'object', additionalProperties: false, required, properties },
        summary: { type: 'string', description: 'Góc nhìn chung: trả lời thẳng câu hỏi ngay câu đầu, 3 câu ngắn, khoảng 45 đến 70 từ. Không kể hình ảnh lá, không chép lại từng lá, không lòng vòng.' },
        advice: { type: 'string', description: 'Một bước nhỏ cho bạn: một hành động cụ thể, vừa sức, kèm cách bắt đầu. 2 câu ngắn, khoảng 30 đến 50 từ.' }
      }
    } } };
  }
  function fromStructured(value, state) {
    const prose = text => typeof text === 'string' ? cleanText(text).replace(/\s+/g, ' ').trim() : '';
    const fail = () => { const error = new Error('Lời giải chưa đủ các phần cần thiết.'); error.code = 'INCOMPLETE_READING'; throw error; };
    if (!value || typeof value !== 'object' || !value.cards || typeof value.cards !== 'object') fail();
    const intro = prose(value.greeting), summary = prose(value.summary), advice = prose(value.advice);
    const body = state.selectedCards.map((card, index) => {
      const content = prose(value.cards['card_' + index]); if (content.length < 40) fail();
      return `${state.activeSpread.slots[index].title}: ${card.data.viName}\n${content}`;
    });
    if (summary.length < 40 || advice.length < 40) fail();
    return assertComplete([intro, ...body, 'Góc nhìn chung\n' + summary, 'Một bước nhỏ cho bạn\n' + advice].filter(Boolean).join('\n\n'), state);
  }
  function render(container, text, state, document) {
    const blocks = sections(text, state).filter(block => block.paragraphs.length);
    container.textContent = '';
    container.classList?.remove('reading-plain');
    if (!blocks.some(block => block.title)) { container.classList?.add('reading-plain'); container.textContent = cleanText(text); return; }
    for (const block of blocks) {
      const section = document.createElement('section'); section.className = `reading-section reading-${block.kind === 'card' ? 'interpretation' : block.kind}`;
      if (block.theme) section.dataset.tone = block.theme.key;
      if (block.slot) { const label = document.createElement('p'); label.className = 'reading-section-role'; label.textContent = block.slot; section.appendChild(label); }
      if (block.title) { const title = document.createElement('h4'); title.textContent = block.title; section.appendChild(title); }
      if (block.kind === 'card') { const orientation = document.createElement('span'); orientation.className = 'reading-orientation'; orientation.textContent = block.reversed ? 'Bài ngược' : 'Bài xuôi'; section.appendChild(orientation); }
      for (const text of block.paragraphs) { const paragraph = document.createElement('p'); paragraph.textContent = text; section.appendChild(paragraph); }
      container.appendChild(section);
    }
  }
  function renderCards(container, state, document, basePath) {
    container.textContent = '';
    state.selectedCards.forEach((card, index) => {
      const slot = state.activeSpread.slots[index].title, theme = themeFor(slot, index);
      const item = document.createElement('article'); item.className = 'reading-card'; item.dataset.tone = theme.key;
      const image = document.createElement('img'); image.src = basePath + card.data.file; image.alt = card.data.viName;
      image.onerror = () => { image.onerror = null; image.src = basePath + 'CardBacks.png'; };
      if (card.isReversed) image.className = 'reversed-thumb';
      const text = document.createElement('div'); text.className = 'reading-card-copy';
      const role = document.createElement('p'); role.className = 'reading-card-role'; role.textContent = slot;
      const name = document.createElement('h4'); name.textContent = card.data.viName;
      const orientation = document.createElement('span'); orientation.className = 'reading-orientation'; orientation.textContent = card.isReversed ? 'Bài ngược' : 'Bài xuôi';
      const hint = document.createElement('p'); hint.className = 'reading-card-hint'; hint.textContent = theme.hint;
      text.appendChild(role); text.appendChild(name); text.appendChild(orientation); text.appendChild(hint);
      item.appendChild(image); item.appendChild(text); container.appendChild(item);
    });
  }
  const api = { themeFor, cleanText, sections, assertComplete, schema, fromStructured, render, renderCards };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TarotReading = api;
})(typeof window === 'object' ? window : this);
