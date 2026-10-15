/* Role-based reading colors and safe, plain-text presentation of the oracle. */
(function (root) {
  'use strict';
  const PREDICTION_NOTICE = 'Đây chỉ là dự đoán dựa trên năng lượng của bạn với trải bài này.';
  const EN_NOTICE = 'This is only a prediction based on your energy and this card spread.';
  const english = state => state.userVibe === 'rost';
  const readerName = state => ({ bot: 'Bót', tot: 'Tót', quansu: 'Tót', zot: 'Zót', tatnuoc: 'Zót', rost: 'Rost' })[state.userVibe] || 'Rót';
  const slotName = (slot, state) => english(state) ? ({ 'Quá Khứ': 'Past', 'Hiện Tại': 'Present', 'Tương Lai': 'Future', 'Thông Điệp': 'Message', 'Thân': 'Body', 'Tâm': 'Heart', 'Trí': 'Mind', 'Vấn Đề': 'Issue', 'Trở Ngại': 'Obstacle', 'Lời Khuyên': 'Advice', 'Kết Quả': 'Outcome' })[slot] || slot : slot;
  const cardName = (card, state) => english(state) ? card.data.name : card.data.viName;
  const predictionTitle = state => english(state) ? "Rost's prediction" : 'Phán đoán của ' + readerName(state);
  const notice = state => english(state) ? EN_NOTICE : PREDICTION_NOTICE;
  const withoutNotice = text => String(text || '').replace(/Đây chỉ là dự đoán dựa trên năng lượng của bạn với trải bài này[.!…]*/giu, '').replace(/This is only a prediction based on your energy and this card spread[.!…]*/gi, '').trim();
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
      .replace(/(\d)[ \t]*[—–][ \t]*(?=\d)/g, '$1 đến ')
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
        const headings = [slot + ' ' + fold(card.data.viName), fold(slotName(state.activeSpread.slots[i].title, state)) + ' ' + fold(cardName(card, state))];
        return candidate === slot || candidate === fold(slotName(state.activeSpread.slots[i].title, state)) || headings.some(heading => ['', ' xuoi', ' nguoc', ' bai xuoi', ' bai nguoc', ' upright', ' reversed'].some(suffix => candidate === heading + suffix));
      });
      const advice = ['mot buoc nho cho ban', 'dieu ban co the lam', 'loi khuyen danh cho ban'].includes(normalized);
      const prediction = /^phan doan cua (rot|bot|tot|zot)$/.test(normalized) || normalized === "rost's prediction";
      const summary = ['goc nhin chung', 'tong quan', 'tong ket', 'overview'].includes(normalized);
      if (index >= 0 || advice || prediction || summary) {
        flushSection();
        section = index >= 0 ? { kind: 'card', title: cardName(cards[index], state), slot: state.activeSpread.slots[index].title,
          reversed: cards[index].isReversed, theme: themeFor(state.activeSpread.slots[index].title, index), paragraphs: [] }
          : { kind: prediction ? 'prediction' : advice ? 'advice' : 'summary', title: prediction ? predictionTitle(state) : advice ? 'Một bước nhỏ cho bạn' : english(state) ? 'Overview' : 'Góc nhìn chung', paragraphs: [] };
      } else paragraph.push(line.trim());
    }
    flushSection(); return list;
  }
  function assertComplete(text, state) {
    const blocks = sections(text, state);
    const cards = blocks.filter(block => block.kind === 'card');
    const filled = block => block && withoutNotice(block.paragraphs.join(' ')).length >= 40;
    const valid = cards.length === state.selectedCards.length && state.selectedCards.every((card, i) =>
      cards.filter(block => block.slot === state.activeSpread.slots[i].title && block.title === cardName(card, state)).length === 1)
      && cards.every(filled) && filled(blocks.find(block => block.kind === 'summary')) && filled(blocks.find(block => ['prediction', 'advice'].includes(block.kind)));
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
      properties[key] = { type: 'string', description: `${state.activeSpread.slots[i].title}: ${card.data.viName}, ${card.isReversed ? 'ngược' : 'xuôi'}. Viết 3–5 câu, khoảng 65–95 từ (trải một lá: 90–125 từ); MỞ BẰNG nhận định cụ thể về câu hỏi, rồi giải thích lá và một điều cần đối chiếu. Xưng Rót ít nhất một lần trong đoạn, nói trực tiếp với bạn; có một nhịp thân mật vừa phải. KHÔNG mở bằng định nghĩa, “hiện ra như lời nhắc” hoặc “lá bài cảnh báo”. Không tiêu đề, không bỏ trống.` };
    });
    if (english(state)) {
      for (const [i, card] of state.selectedCards.entries()) properties['card_' + i].description = slotName(state.activeSpread.slots[i].title, state) + ': ' + card.data.name + ', ' + (card.isReversed ? 'reversed' : 'upright') + '. Write 3–5 natural English sentences, 65–95 words (one card: 90–125). Start with a specific answer about the question; explain the actual card and one observable implication. No heading or empty values.';
    } else for (const item of Object.values(properties)) item.description = item.description.replace(/Rót/g, readerName(state));
    const result = { type: 'json_schema', json_schema: { name: 'tarot_reading', strict: true, schema: {
      type: 'object', additionalProperties: false, required: ['greeting', 'cards', 'summary', 'advice'],
      properties: {
        greeting: { type: 'string', description: 'Lời chào 2–3 câu có duyên, mở theo nhịp “Tên ơi, Rót chào bạn” nếu có tên, hoặc “Chào bạn, Rót đây” khi không có tên, nhắc đúng câu hỏi hoặc cảm xúc đã chia sẻ; không được bỏ trống.' },
        cards: { type: 'object', additionalProperties: false, required, properties },
        summary: { type: 'string', description: 'Góc nhìn chung: 5–6 câu, khoảng 100–140 từ. Câu đầu trả lời thẳng câu hỏi bằng giọng Rót. Giải thích mối nối cụ thể giữa các lá/vị trí, lực thuận, điểm vướng và hướng diễn biến nếu điều kiện hiện tại tiếp tục; nêu một dấu hiệu thực tế cần đối chiếu. Có chiều sâu nhưng không lặp từng lá, không giọng báo cáo hoặc kết chung chung.' },
        advice: { type: 'string', description: 'Dù khóa tên advice, nội dung là PHÁN ĐOÁN CỦA RÓT: dự đoán đúng MỘT sự việc/chuyển biến CỤ THỂ có thể quan sát, liên quan câu hỏi. Câu đầu “Rót đoán rằng…” phải nói ngay sự việc đó. KHÔNG viết “bạn nên…”, “bạn cần…”, “hãy…” hoặc “khả năng bạn nên chờ”: đó là lời khuyên, không phải dự đoán. Khoảng 50–80 từ trước câu kết. Giải thích lá/vị trí/chiều bài nào gợi ra nó, rồi một tín hiệu bên ngoài để kiểm chứng (hành động, nội dung cuộc trao đổi, kết quả một việc nhỏ), không chỉ cảm giác yên tâm hay tiếng nói nội tâm. Không liệt kê nhiều kịch bản, không bịa bí mật/tên/ngày/tỷ lệ, không tự ấn định số ngày khi câu hỏi không nêu thời gian. Nói như khả năng chưa biết chắc. Kết bằng đúng câu: ' + PREDICTION_NOTICE }
      }
    } } };
    const fields = result.json_schema.schema.properties;
    if (english(state)) {
      fields.greeting.description = 'A warm English greeting, 2–3 sentences, using the supplied name and actual question. Do not invent feelings.';
      fields.summary.description = 'Overview in English: 5–6 sentences, 100–140 words. Answer the question in the FIRST sentence, connect the actual cards and positions, explain support, obstacle, a condition that could change the direction and an observable sign. Do not repeat each card.';
      fields.advice.description = "Despite the key advice, write Rost's prediction in English: exactly ONE specific observable event related to the question. Start with Rost's guess is that… and name that event immediately. Explain the actual card, position and orientation and a real-world sign to check. 50–80 words before the notice. Do not write action advice or you should. Do not invent secrets, dates or percentages. End exactly: " + EN_NOTICE;
    } else for (const key of ['greeting', 'summary', 'advice']) fields[key].description = fields[key].description.replace(/Rót/g, readerName(state)).replace(/RÓT/g, readerName(state).toUpperCase());
    return result;
  }
  function fromStructured(value, state) {
    const prose = text => typeof text === 'string' ? cleanText(text).replace(/\s+/g, ' ').trim() : '';
    const fail = () => { const error = new Error('Lời giải chưa đủ các phần cần thiết.'); error.code = 'INCOMPLETE_READING'; throw error; };
    if (!value || typeof value !== 'object' || !value.cards || typeof value.cards !== 'object') fail();
    const intro = prose(value.greeting) || (english(state) ? 'Hello' + (state.userName ? ', ' + prose(state.userName) : '') + ', Rost here. Let’s look at your question together.' : (state.userName ? prose(state.userName) + ' ơi, Rót chào bạn.' : 'Chào bạn, Rót đây.') + ' Mình cùng nhìn câu hỏi của bạn qua những lá vừa mở nhé.').replace(/Rót/g, readerName(state));
    const summary = prose(value.summary), prediction = withoutNotice(prose(value.advice));
    const body = state.selectedCards.map((card, index) => {
      const content = prose(value.cards['card_' + index]); if (content.length < 40) fail();
      return `${slotName(state.activeSpread.slots[index].title, state)}: ${cardName(card, state)}\n${content}`;
    });
    if (summary.length < 40 || prediction.length < 40) fail();
    return assertComplete([intro, ...body, (english(state) ? 'Overview' : 'Góc nhìn chung') + '\n' + summary, predictionTitle(state) + '\n' + prediction + '\n\n' + notice(state)].filter(Boolean).join('\n\n'), state);
  }
  function render(container, text, state, document) {
    const blocks = sections(text, state).filter(block => block.paragraphs.length);
    container.textContent = '';
    container.setAttribute('lang', english(state) ? 'en' : 'vi');
    container.classList?.remove('reading-plain');
    if (!blocks.some(block => block.title)) { container.classList?.add('reading-plain'); container.textContent = cleanText(text); return; }
    for (const [index, block] of blocks.entries()) {
      const section = document.createElement('section'); section.className = `reading-section reading-${block.kind === 'card' ? 'interpretation' : block.kind}`;
      section.style.setProperty('--reading-delay', Math.min(index, 6) * 85 + 'ms');
      if (block.theme) section.dataset.tone = block.theme.key;
      if (block.slot) { const label = document.createElement('p'); label.className = 'reading-section-role'; label.textContent = slotName(block.slot, state); section.appendChild(label); }
      if (block.title) { const title = document.createElement('h4'); title.textContent = block.title; section.appendChild(title); }
      if (block.kind === 'card') { const orientation = document.createElement('span'); orientation.className = 'reading-orientation'; orientation.textContent = english(state) ? (block.reversed ? 'Reversed' : 'Upright') : (block.reversed ? 'Bài ngược' : 'Bài xuôi'); section.appendChild(orientation); }
      const content = document.createElement('div'); content.className = 'reading-section-content';
      for (const text of block.paragraphs) {
        const paragraph = document.createElement('p'); paragraph.textContent = text;
        if (text === notice(state)) paragraph.className = 'prediction-notice';
        content.appendChild(paragraph);
      }
      if (block.kind === 'prediction') {
        const spoiler = document.createElement('div'); spoiler.className = 'prediction-spoiler';
        content.className = 'prediction-content'; content.setAttribute('aria-hidden', 'true'); content.inert = true;
        content.id = (container.id || 'tarot-reading') + '-prediction-' + index; content.tabIndex = -1;
        content.setAttribute('role', 'region'); content.setAttribute('aria-label', predictionTitle(state));
        const button = document.createElement('button'); button.type = 'button'; button.className = 'prediction-reveal';
        const label = document.createElement('span'); label.className = 'prediction-reveal-label'; label.textContent = english(state) ? 'Tap to reveal the prediction' : 'Chạm để xem phán đoán';
        button.appendChild(label); button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-controls', content.id);
        const reveal = () => {
          if (spoiler.classList.contains('is-revealed')) return;
          spoiler.classList.add('is-revealed'); content.removeAttribute('aria-hidden'); content.inert = false;
          button.setAttribute('aria-expanded', 'true'); button.hidden = true;
          content.focus({ preventScroll: true });
        };
        button.addEventListener('click', reveal); spoiler.appendChild(content); spoiler.appendChild(button); section.appendChild(spoiler);
      } else section.appendChild(content);
      container.appendChild(section);
    }
  }
  function renderCards(container, state, document, basePath) {
    container.textContent = '';
    state.selectedCards.forEach((card, index) => {
      const slot = state.activeSpread.slots[index].title, theme = themeFor(slot, index);
      const item = document.createElement('article'); item.className = 'reading-card'; item.dataset.tone = theme.key;
      const image = document.createElement('img'); image.src = basePath + card.data.file; image.alt = cardName(card, state);
      image.onerror = () => { image.onerror = null; image.src = basePath + 'CardBacks.png'; };
      if (card.isReversed) image.className = 'reversed-thumb';
      const text = document.createElement('div'); text.className = 'reading-card-copy';
      const role = document.createElement('p'); role.className = 'reading-card-role'; role.textContent = slotName(slot, state);
      const name = document.createElement('h4'); name.textContent = cardName(card, state);
      const orientation = document.createElement('span'); orientation.className = 'reading-orientation'; orientation.textContent = english(state) ? (card.isReversed ? 'Reversed' : 'Upright') : (card.isReversed ? 'Bài ngược' : 'Bài xuôi');
      const hint = document.createElement('p'); hint.className = 'reading-card-hint'; hint.textContent = english(state) ? ({ reflection: 'A moment to reflect', clarity: 'What becomes clearer now', possibility: 'A possible direction', grounding: 'Something practical to care for', caution: 'A point to consider carefully', insight: 'A fresh perspective' })[theme.key] : theme.hint;
      text.appendChild(role); text.appendChild(name); text.appendChild(orientation); text.appendChild(hint);
      item.appendChild(image); item.appendChild(text); container.appendChild(item);
    });
  }
  const api = { PREDICTION_NOTICE, EN_NOTICE, predictionTitle, notice, themeFor, cleanText, sections, assertComplete, schema, fromStructured, render, renderCards };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TarotReading = api;
})(typeof window === 'object' ? window : this);
