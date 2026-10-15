/* Application UI and services around the original Gemini 3D director. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const engine = window.TarotExperience, persona = window.TarotPersona, reading = window.TarotReading;
  const preview = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).get('preview') === '1';
  const spreads = {
    time: { id: 'time', name: 'Dòng thời gian', count: 3, slots: ['Quá Khứ', 'Hiện Tại', 'Tương Lai'] },
    single: { id: 'single', name: 'Một lá', count: 1, slots: ['Thông Điệp'] },
    mind: { id: 'mind', name: 'Cân bằng', count: 3, slots: ['Thân', 'Tâm', 'Trí'] },
    solution: { id: 'solution', name: 'Gỡ rối', count: 4, slots: ['Vấn Đề', 'Trở Ngại', 'Lời Khuyên', 'Kết Quả'] }
  };
  Object.values(spreads).forEach(spread => { spread.slots = spread.slots.map(title => ({ title })); });
  const profile = window.TarotProfile.create(() => localStorage);
  const ai = window.TarotAI.create({ endpoint: window.TAROT_SHEETS_CONFIG.endpoint });
  let version = 0, readingPending = false, chatPending = false, sheetSession = null, feedbackPending = false, nudged = false;
  let state = { userName: '', userGender: '', userQuestion: '', userVibe: 'chualanh', dob: {}, zodiac: '', activeSpread: spreads.time, selectedCards: [], readingResult: '', followupHistory: [] };
  let ready = false, optionsAnimation = null, toastTimer, restarting = false, readingRetryTimer;
  const picked = name => document.querySelector('input[name="' + name + '"]:checked')?.value;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  function toast(text) { $('toast').textContent = text; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3600); }
  window.addEventListener('tarot:notice', event => toast(event.detail));
  function getProfile() {
    return { name: $('name').value, gender: $('gender').value,
      dob: { day: Number($('birth-day').value) || '', month: Number($('birth-month').value) || '', year: Number($('birth-year').value) || '' },
      vibe: picked('vibe'), spread: picked('spread') };
  }
  function updateProfile() {
    const value = getProfile(), dob = value.dob;
    profile.save(value);
    $('tone-description').textContent = persona.tone(value.vibe).description;
    $('zodiac').textContent = dob.day && dob.month ? persona.zodiac(dob.day, dob.month, dob.year || 2000) || 'Bạn kiểm tra lại ngày sinh nhé.' : '';
  }
  function restoreProfile(value) {
    $('name').value = value.name; $('gender').value = value.gender;
    for (const key of ['day', 'month', 'year']) $('birth-' + key).value = value.dob[key];
    for (const name of ['spread', 'vibe']) {
      const field = document.querySelector('input[name="' + name + '"][value="' + value[name] + '"]'); if (field) field.checked = true;
    }
    updateProfile();
  }
  for (const [id, maximum] of [['birth-day', 31], ['birth-month', 12]]) {
    for (let i = 1; i <= maximum; i++) $(id).add(new Option(String(i).padStart(2, '0'), i));
  }
  for (let year = new Date().getFullYear(); year >= 1920; year--) $('birth-year').add(new Option(String(year), year));
  restoreProfile(profile.load());
  $('intent-form').addEventListener('input', updateProfile);
  $('intent-form').addEventListener('change', updateProfile);
  $('forget-profile').addEventListener('click', () => { restoreProfile(window.TarotProfile.clean()); profile.clear(); toast('Rót đã quên thông tin đã nhớ.'); });
  $('options-toggle').addEventListener('click', () => {
    window.TarotMobile?.feel('ui');
    const content = $('personal-options'), button = $('options-toggle'), opening = button.getAttribute('aria-expanded') !== 'true';
    const before = content.hidden ? 0 : content.getBoundingClientRect().height;
    optionsAnimation?.cancel(); content.hidden = false; content.style.height = 'auto';
    const after = opening ? content.scrollHeight : 0;
    button.setAttribute('aria-expanded', String(opening));
    optionsAnimation = content.animate([{ height: before + 'px', opacity: opening ? .4 : 1 }, { height: after + 'px', opacity: opening ? 1 : 0 }],
      { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 440, easing: 'cubic-bezier(.22,1,.36,1)' });
    optionsAnimation.onfinish = () => { content.hidden = !opening; content.style.height = ''; optionsAnimation = null; };
  });
  function clearSession() {
    clearTimeout(readingRetryTimer); $('retry-reading').disabled = false; $('retry-reading').textContent = 'Thử lại lời giải';
    version++; readingPending = chatPending = feedbackPending = false; sheetSession = null; nudged = false;
    state.readingResult = ''; state.selectedCards = []; state.followupHistory = [];
    window.TarotSpoiler?.destroy($('reading-text'));
    $('reading-text').textContent = ''; $('messages').textContent = ''; $('chat-input').value = '';
    $('reading-loading').hidden = false; $('retry-reading').hidden = true;
    $('conversation').hidden = $('feedback-panel').hidden = true;
    $('chat-send').disabled = $('feedback-send').disabled = false;
    $('feedback-form').reset(); $('feedback-status').textContent = $('sheet-status').textContent = '';
    document.querySelector('#reading-modal .sheet-scroll').scrollTop = 0; $('reading-cards').scrollLeft = 0;
    $('open-reading').disabled = true; $('read-aloud').textContent = 'Nghe đọc';
    $('open-reading').classList.remove('reading-ready');
    $('open-reading').textContent = 'Xem lời giải';
    window.speechSynthesis?.cancel();
  }
  async function restart() {
    if (restarting) return;
    restarting = true; version++;
    await Promise.all([...document.querySelectorAll('dialog[open]')].map(closeDialog));
    clearSession(); state.userQuestion = ''; $('question').value = ''; engine.home();
    restarting = false;
  }
  $('intent-form').addEventListener('submit', event => {
    event.preventDefault(); if (!ready) return;
    const value = getProfile(), dob = value.dob, anyDate = dob.day || dob.month || dob.year;
    if (anyDate && (!dob.day || !dob.month || !dob.year || !persona.validDate(dob.day, dob.month, dob.year))) {
      $('form-error').textContent = 'Bạn nhập đủ ngày, tháng, năm sinh hợp lệ hoặc để trống cả ba nhé.'; return;
    }
    const question = $('question').value.trim();
    if (!question) { $('form-error').textContent = 'Bạn để lại một câu hỏi để Rót hiểu điều bạn đang nghĩ nhé.'; $('question').focus(); return; }
    clearSession();
    state = { userName: value.name.trim(), userGender: value.gender, userQuestion: question, userVibe: value.vibe, dob, zodiac: persona.zodiac(dob.day, dob.month, dob.year),
      activeSpread: spreads[value.spread], selectedCards: [], readingResult: '', followupHistory: [] };
    $('form-error').textContent = ''; profile.save(value); engine.start(state.activeSpread);
  });
  function onStage(event) {
    const home = event.detail === 'HOME';
    $('welcome-panel').hidden = !home;
    if (home) $('begin-reading').disabled = false;
  }
  window.addEventListener('tarot:stage', onStage);
  window.addEventListener('tarot:selection', event => {
    const selected = event.detail;
    if (!selected.length) return;
    state.selectedCards = selected;
    const complete = selected.length === state.activeSpread.count && selected.every(card => card.isFlipped);
    const becameComplete = complete && !$('open-reading').classList.contains('reading-ready');
    $('open-reading').disabled = !complete;
    $('open-reading').classList.toggle('reading-ready', complete);
    $('open-reading').textContent = complete ? 'Đọc trải bài cùng Rót' : 'Xem lời giải';
    $('flip-all').hidden = complete;
    if (complete) $('reveal-header-hint').textContent = 'Chạm vào lá để ngắm gần, hoặc cùng Rót đọc trải bài.';
    if (becameComplete && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const element of [$('reveal-header-hint'), $('open-reading')]) {
        element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 950, easing: 'ease-out' });
      }
    }
  });
  function setReady() { ready = true; $('begin-reading').disabled = false; if (document.body.dataset.act === 'HOME') $('welcome-panel').hidden = false; }
  window.addEventListener('tarot:ready', setReady);
  $('skip-intro').addEventListener('click', () => engine.skipIntro());
  $('brand-crest').addEventListener('click', () => { if (ready) restart(); });
  $('brand-crest').setAttribute('role', 'button'); $('brand-crest').tabIndex = 0;
  $('brand-crest').addEventListener('keydown', event => { if (event.key === 'Enter') restart(); });
  $('new-reading').addEventListener('click', restart);
  document.querySelectorAll('[data-restart]').forEach(button => button.addEventListener('click', restart));
  $('flip-all').addEventListener('click', () => engine.flipAll());
  const dialogFocus = new WeakMap(), dialogClosures = new WeakMap();
  function showDialog(id) {
    const dialog = $(id); if (dialog.open) return;
    dialogFocus.set(dialog, document.activeElement); engine.blockInput(true); dialog.showModal();
    $('modal-shade').classList.add('visible');
    dialog.querySelector('h2')?.focus({ preventScroll: true });
    requestAnimationFrame(() => requestAnimationFrame(() => { if (dialog.open && !dialog.classList.contains('is-closing')) dialog.classList.add('is-visible'); }));
  }
  function closeDialog(dialog) {
    if (!dialog.open) return Promise.resolve();
    if (dialogClosures.has(dialog)) return dialogClosures.get(dialog);
    const closing = new Promise(resolve => {
      dialog.classList.add('is-closing'); dialog.classList.remove('is-visible'); window.speechSynthesis?.cancel();
      if (![...document.querySelectorAll('dialog[open]')].some(item => !item.classList.contains('is-closing'))) $('modal-shade').classList.remove('visible');
      const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 820;
      setTimeout(() => { dialog.close(); dialog.classList.remove('is-closing'); dialogClosures.delete(dialog); resolve(); }, duration);
    });
    dialogClosures.set(dialog, closing); return closing;
  }
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.addEventListener('close', () => {
      engine.blockInput(Boolean(document.querySelector('dialog[open]'))); window.speechSynthesis?.cancel(); $('read-aloud').textContent = 'Nghe đọc';
      dialog.classList.remove('is-visible');
      if (!document.querySelector('dialog[open]')) $('modal-shade').classList.remove('visible');
      dialogFocus.get(dialog)?.focus({ preventScroll: true });
    });
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(dialog); });
    dialog.addEventListener('click', event => { if (event.target === dialog) closeDialog(dialog); });
  }
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => closeDialog($(button.dataset.close))));
  const handle = document.querySelector('.sheet-handle');
  let handleStart = null;
  handle.addEventListener('pointerdown', event => { handleStart = event.clientY; handle.setPointerCapture(event.pointerId); });
  handle.addEventListener('pointerup', event => { if (handleStart !== null && event.clientY - handleStart > 70) closeDialog($('reading-modal')); handleStart = null; });
  handle.addEventListener('pointercancel', () => { handleStart = null; });
  function logProfile(result) {
    return { name: state.userName || 'Khách', dob: state.dob.day ? [state.dob.day, state.dob.month, state.dob.year].join('/') : 'Không rõ',
      zodiac: state.zodiac || 'Không rõ', gender: state.userGender || 'Không rõ', question: state.userQuestion,
      spread: state.activeSpread.count + ' lá', vibe: state.userVibe,
      solver: (result?.provider ? 'Ta Văn Rót V2 / ' + result.provider + ' / ' + result.model : 'Ta Văn Rót V2 / Chưa có lời giải')
        + (window.TarotAI.diagnostics(result) ? ' [' + window.TarotAI.diagnostics(result) + ']' : ''),
      source: 'Ta Văn Rót V2 / ' + (new URLSearchParams(location.search).get('ref') || 'Trực tiếp / Không rõ') };
  }
  function demoReading() {
    const opening = { chualanh: 'Mình chậm lại một chút nhé. Rót đang nghe điều bạn băn khoăn.',
      tatnuoc: 'Rót nói thẳng vào điều cần nhìn nhận nhé.', quansu: 'Mình tách câu chuyện thành những việc có thể chủ động.',
      phansau: 'Mình thử nhìn điều đang lặp lại trong câu chuyện của bạn.' }[state.userVibe];
    return [opening, ...state.selectedCards.map((card, index) => state.activeSpread.slots[index].title + ': ' + card.data.viName + '\n'
      + card.data.viName + ' ở vị trí này gợi ý về ' + (card.isReversed ? card.data.revMeaning : card.data.meaning).toLowerCase()
      + '. Bạn có thể đối chiếu điều ấy với câu hỏi của mình và chọn một việc thực tế để thay đổi, thay vì vội kết luận về tương lai.'),
      'Góc nhìn chung\nRót nghiêng về việc thử một bước vừa sức trước khi quyết định thay đổi lớn. ' + state.selectedCards[0].data.viName
        + ' gợi trọng tâm để bạn đối chiếu, còn cả trải bài cần được đọc cùng câu hỏi và những gì đã thực sự xảy ra. Điểm thuận là bạn có thể quan sát kết quả của một lựa chọn nhỏ; điểm vướng là mình chưa có đủ bối cảnh để kết luận thay bạn. Nếu thông tin mới khác với điều đang nghĩ, hướng đi cũng cần được điều chỉnh. Hãy đối chiếu bằng một phản hồi cụ thể, thay vì chỉ chờ cảm giác chắc chắn. Đây là nội dung minh họa bố cục, chưa phải lời giải AI.',
      'Phán đoán của Rót\nRót đoán rằng bạn sẽ thử một cách bắt đầu nhỏ trước khi quyết định thay đổi hẳn. Trong mẫu minh họa này, '
        + state.selectedCards[0].data.viName + ' gợi ý về ' + (state.selectedCards[0].isReversed ? state.selectedCards[0].data.revMeaning : state.selectedCards[0].data.meaning).toLowerCase()
        + ', từ đó nối sang khả năng thử trước một việc vừa sức. Dấu hiệu để đối chiếu là bạn chọn thử một việc cụ thể, thay vì chỉ tiếp tục cân nhắc. Bản thật sẽ dựa vào câu hỏi và toàn bộ lá bạn rút.\n\n' + reading.PREDICTION_NOTICE].join('\n\n');
  }
  function renderSelectedCards() {
    reading.renderCards($('reading-cards'), state, document, 'images/');
    $('reading-cards').querySelectorAll('img').forEach((image, index) => { image.src = state.selectedCards[index].image; });
  }
  function updateReadingRetry() {
    clearTimeout(readingRetryTimer);
    const remaining = preview ? 0 : ai.retryAfter(), button = $('retry-reading');
    button.hidden = false; button.disabled = remaining > 0;
    button.textContent = remaining > 0 ? 'Thử lại sau ' + remaining + ' giây' : 'Thử lại lời giải';
    if (remaining > 0 && $('reading-modal').open) readingRetryTimer = setTimeout(updateReadingRetry, 1000);
  }
  async function requestReading() {
    if (readingPending || state.readingResult || !state.selectedCards.every(card => card.isFlipped)) return;
    const remaining = preview ? 0 : ai.retryAfter();
    if (remaining > 0) {
      $('reading-loading').hidden = true;
      $('reading-text').textContent = 'Rót đang tạm bận. Các lá bài vẫn được giữ; bạn thử lại sau khoảng ' + remaining + ' giây nhé.';
      updateReadingRetry(); return;
    }
    clearTimeout(readingRetryTimer);
    readingPending = true; const requestVersion = version;
    $('reading-loading').hidden = false; $('retry-reading').hidden = true; $('reading-text').textContent = '';
    let session = null;
    try {
      const response = preview ? (await wait(500), { text: demoReading(), provider: 'preview', model: 'minh họa' }) : await ai.readResult(state);
      const result = response.text;
      reading.assertComplete(result, state);
      if (requestVersion !== version) return;
      session = preview ? null : window.TarotSheets.begin(logProfile(response));
      state.readingResult = result; sheetSession = session;
      window.TarotSpoiler?.destroy($('reading-text'));
      reading.render($('reading-text'), result, state, document);
      window.TarotSpoiler?.init($('reading-text'));
      $('conversation').hidden = $('feedback-panel').hidden = false;
      if (session) session.record(result, 'Thành công').then(() => {
        if (requestVersion === version) $('sheet-status').textContent = 'Đã lưu trải bài.';
      }).catch(() => { if (requestVersion === version) $('sheet-status').textContent = 'Chưa xác nhận lưu trải bài. Lời giải vẫn ở đây để bạn đọc.'; });
    } catch (error) {
      if (requestVersion !== version) return;
      $('reading-text').textContent = error.message || 'Rót chưa kết nối được. Bạn thử lại sau một chút nhé.';
      updateReadingRetry();
      if (!preview) window.TarotSheets.begin(logProfile(error)).record(error.message, 'Thất bại').catch(() => {});
    } finally { if (requestVersion === version) { readingPending = false; $('reading-loading').hidden = true; } }
  }
  $('open-reading').addEventListener('click', () => {
    if ($('open-reading').disabled) return;
    $('reading-title').textContent = state.userQuestion; $('preview-notice').hidden = !preview;
    renderSelectedCards(); showDialog('reading-modal');
    if (!state.readingResult) document.querySelector('#reading-modal .sheet-scroll').scrollTop = 0;
    requestReading();
  });
  $('retry-reading').addEventListener('click', requestReading);
  function message(text, role) { const element = document.createElement('div'); element.className = 'message ' + role; element.textContent = text; $('messages').appendChild(element); return element; }
  $('chat-form').addEventListener('submit', async event => {
    event.preventDefault(); if (chatPending || !state.readingResult) return;
    const remaining = preview ? 0 : ai.retryAfter();
    if (remaining > 0) { toast('Rót đang tạm bận. Bạn thử lại sau ' + remaining + ' giây nhé.'); return; }
    const text = $('chat-input').value.trim(); if (!text) return;
    const requestVersion = version, history = [...state.followupHistory, { role: 'user', text }];
    chatPending = true; $('chat-send').disabled = true; message(text, 'user'); $('chat-input').value = '';
    const pending = message('Rót đang nghe bạn…', 'pending');
    try {
      const card = state.selectedCards[0];
      const answer = preview ? (await wait(350), 'Rót nghe bạn. Trong trải bài mình vừa xem, ' + card.data.viName + ' ở vị trí ' + card.slotTitle
        + ' gợi một điều để mình cùng đối chiếu với câu chuyện bạn kể. Bạn có thể nói rõ điều khiến mình nặng lòng nhất lúc này. Đây là phản hồi minh họa; bản thật sẽ dùng lời giải và toàn bộ lịch sử để trò chuyện cùng bạn.') : await ai.chat(state, history);
      if (requestVersion !== version) return;
      pending.className = 'message assistant'; window.TarotChat.render(pending, answer, document);
      state.followupHistory = [...history, { role: 'model', text: answer }];
      const turns = state.followupHistory.filter(item => item.role === 'model').length;
      if (turns === 3 && !nudged) {
        nudged = true; const nudge = document.createElement('aside'); nudge.className = 'support-nudge';
        const paragraph = document.createElement('p'); paragraph.textContent = persona.DONATION_NUDGE;
        const link = document.createElement('a'); link.href = persona.DONATION_URL; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Chuyển đổi link đơn hàng ủng hộ Rót';
        nudge.append(paragraph, link); $('messages').appendChild(nudge);
      }
      if (sheetSession) sheetSession.followup({
        followUpQ: state.followupHistory.filter(item => item.role === 'user').map((item, i) => (i + 1) + '. ' + item.text).join('\n\n'),
        followUpA: state.followupHistory.filter(item => item.role === 'model').map((item, i) => (i + 1) + '. ' + item.text).join('\n\n')
      }).catch(() => { if (requestVersion === version) toast('Chưa xác nhận lưu phần tâm sự.'); });
    } catch (error) {
      if (requestVersion === version) { pending.className = 'message error'; pending.textContent = error.message; $('chat-input').value = text; }
    } finally {
      if (requestVersion === version) { chatPending = false; $('chat-send').disabled = false; pending.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    }
  });
  $('feedback-form').addEventListener('submit', async event => {
    event.preventDefault(); if (feedbackPending) return;
    if (preview) { $('feedback-status').textContent = 'Bản xem thử: đánh giá chưa được gửi Google Sheets.'; return; }
    if (!sheetSession) { $('feedback-status').textContent = 'Bạn đợi lời giải được lưu rồi gửi đánh giá nhé.'; return; }
    feedbackPending = true; const requestVersion = version; $('feedback-send').disabled = true;
    try {
      await sheetSession.feedback({ rating: Number(picked('rating')), ratingNote: $('rating-note').value.trim(), feedback: $('feedback').value.trim() });
      if (requestVersion === version) $('feedback-status').textContent = 'Rót đã nhận đánh giá. Cảm ơn bạn đã sẻ chia.';
    } catch (error) { if (requestVersion === version) $('feedback-status').textContent = 'Chưa gửi được đánh giá. ' + error.message; }
    finally { if (requestVersion === version) { feedbackPending = false; $('feedback-send').disabled = false; } }
  });
  let topLoaded = false;
  async function support() {
    showDialog('support-modal');
    if (topLoaded || preview) return;
    try {
      const result = await window.TarotSheets.topDonates(); if (result.status !== 'success' || !Array.isArray(result.data)) return;
      topLoaded = true; $('top-donates').textContent = '';
      for (const donor of result.data.slice(0, 10)) {
        const row = document.createElement('div'); row.className = 'donor-row';
        const name = document.createElement('span'); name.textContent = donor.name;
        const amount = document.createElement('span'); amount.textContent = new Intl.NumberFormat('vi-VN').format(Number(donor.amount) || 0) + ' đ';
        row.append(name, amount); $('top-donates').appendChild(row);
      }
      if (!result.data.length) $('top-donates').textContent = 'Rót cảm ơn mọi sự sẻ chia.';
    } catch { $('top-donates').textContent = 'Cảm ơn bạn đã giữ góc nhỏ này sáng đèn.'; }
  }
  $('open-support').addEventListener('click', support); document.querySelectorAll('[data-support]').forEach(button => button.addEventListener('click', support));
  $('share-rot').addEventListener('click', async () => {
    const url = ['localhost', '127.0.0.1'].includes(location.hostname) ? 'https://tavanrot.online/' : location.origin + location.pathname;
    try {
      if (navigator.share) await navigator.share({ title: 'Một khoảng lặng cùng Ta Văn Rót', text: 'Gửi bạn một góc nhỏ để chậm lại, trải bài và tâm sự.', url });
      else { await navigator.clipboard.writeText(url); toast('Đã sao chép link. Bạn gửi đến người mình nghĩ tới nha.'); }
    } catch (error) { if (error.name !== 'AbortError') toast('Bạn có thể chia sẻ link: ' + url); }
  });
  $('read-aloud').addEventListener('click', () => {
    if (!state.readingResult) return;
    if (!window.speechSynthesis) { toast('Trình duyệt chưa hỗ trợ đọc thành tiếng.'); return; }
    if (speechSynthesis.speaking) { speechSynthesis.cancel(); $('read-aloud').textContent = 'Nghe đọc'; return; }
    const predictionRevealed = Boolean($('reading-text').querySelector('.prediction-spoiler.is-revealed'));
    const spokenText = reading.sections(state.readingResult, state).filter(block => block.kind !== 'prediction' || predictionRevealed)
      .map(block => [block.title, ...block.paragraphs].filter(Boolean).join('\n')).join('\n\n');
    const utterance = new SpeechSynthesisUtterance(spokenText); utterance.lang = 'vi-VN'; utterance.rate = .88;
    utterance.voice = speechSynthesis.getVoices().find(voice => voice.lang.startsWith('vi')) || null;
    utterance.onend = utterance.onerror = () => { $('read-aloud').textContent = 'Nghe đọc'; };
    $('read-aloud').textContent = 'Dừng đọc'; speechSynthesis.speak(utterance);
  });
})();
