/* Apps Script backend source; paste the generated Code.gs, not this file alone. */
var TAROT_GROQ_MODEL = 'openai/gpt-oss-120b';
var TAROT_SHEET_ID = '1STZqTjCDzioE_ijRzKnkDyQO6XzxLW-SJm3fJATZniA';
var TAROT_HEADERS = ['Thời gian', 'IP', 'Tên', 'Ngày sinh', 'Cung Hoàng Đạo', 'Giới tính',
  'Câu hỏi', 'Số lá bài', 'Chế độ', 'Kết luận', 'Trạng thái', 'Đánh giá', 'Note Đánh giá',
  'Góp ý', 'Câu hỏi thêm', 'Câu trả lời thêm', 'Người giải', 'Nguồn'];

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
function failure_(code, message, retryAfter) {
  var error = new Error(message); error.code = code; error.retryAfter = retryAfter || 0; return error;
}
function text_(value, max) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) throw failure_('INVALID_REQUEST', 'Dữ liệu không hợp lệ.');
  return value.trim();
}
function state_(input) {
  if (!input || typeof input !== 'object') throw failure_('INVALID_REQUEST', 'Thiếu trải bài.');
  var spreads = {
    time: { name: 'Dòng Thời Gian', slots: ['Quá Khứ', 'Hiện Tại', 'Tương Lai'] },
    single: { name: 'Nhất Điểm', slots: ['Thông Điệp'] },
    mind: { name: 'Tam Thể', slots: ['Thân', 'Tâm', 'Trí'] },
    solution: { name: 'Gỡ Rối', slots: ['Vấn Đề', 'Trở Ngại', 'Lời Khuyên', 'Kết Quả'] }
  };
  var spread = Object.prototype.hasOwnProperty.call(spreads, input.spreadId) ? spreads[input.spreadId] : null;
  if (!spread || !Array.isArray(input.cards) || input.cards.length !== spread.slots.length) throw failure_('INVALID_REQUEST', 'Số lá không hợp lệ.');
  var used = {};
  var cards = input.cards.map(function (card) {
    var original = card && TarotServerCards.find(function (item) { return item.id === card.id; });
    if (!original || used[original.id] || typeof card.reversed !== 'boolean') throw failure_('INVALID_REQUEST', 'Lá bài không hợp lệ.');
    used[original.id] = true;
    return { data: original, isReversed: card.reversed };
  });
  var dob = input.dob || {}, day = Number(dob.day), month = Number(dob.month), year = Number(dob.year);
  var valid = TarotServerPersona.validDate(day, month, year);
  return { userName: text_(input.name, 120), userGender: ['Nam', 'Nữ', 'Khác'].indexOf(input.gender) >= 0 ? input.gender : '', userQuestion: text_(input.question, 2000),
    userVibe: Object.prototype.hasOwnProperty.call(TarotServerPersona.TONES, input.vibe) ? input.vibe : 'chualanh',
    dob: valid ? { day: day, month: month, year: year } : null,
    zodiac: valid ? TarotServerPersona.zodiac(day, month, year) : '',
    activeSpread: { name: spread.name, slots: spread.slots.map(function (title) { return { title: title }; }) },
    selectedCards: cards };
}
function groq_(data) {
  var key = PropertiesService.getScriptProperties().getProperty('GROQ_API_KEY');
  if (!key) throw failure_('NOT_CONFIGURED', 'Chưa đặt GROQ_API_KEY trong Script properties.');
  var state = state_(data.state), followup = data.action === 'ai_followup', payload;
  if (followup) {
    state.readingResult = text_(data.reading, 18000);
    if (!state.readingResult || !Array.isArray(data.history) || !data.history.length || data.history.length > 30) throw failure_('INVALID_REQUEST', 'Thiếu ngữ cảnh tâm sự.');
    var total = 0;
    var history = data.history.map(function (item, index) {
      if (!item || item.role !== (index % 2 ? 'rot' : 'user')) throw failure_('INVALID_REQUEST', 'Thứ tự tâm sự không hợp lệ.');
      var value = text_(item.text, 6000); total += value.length;
      if (!value || total > 24000) throw failure_('INVALID_REQUEST', 'Cuộc tâm sự quá dài.');
      return { role: item.role, text: value };
    });
    if (history[history.length - 1].role !== 'user') throw failure_('INVALID_REQUEST', 'Thiếu câu hỏi mới.');
    payload = TarotServerPersona.conversationPayload(state, history);
  } else payload = TarotServerPersona.readingPayload(state, { structured: true });
  var messages = [{ role: 'system', content: payload.systemInstruction.parts[0].text }].concat(payload.contents.map(function (item) {
    return { role: item.role === 'model' ? 'assistant' : 'user', content: item.parts.map(function (part) { return part.text; }).join('\n') };
  }));
  var cache = CacheService.getScriptCache();
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify({ action: data.action, format: followup ? 1 : 2, messages: messages }));
  var cacheKey = 'reply:' + Utilities.base64EncodeWebSafe(digest);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1500)) throw failure_('BUSY', 'Dịch vụ đang bận.', 5);
  try {
    var previous = cache.get(cacheKey); if (previous) return JSON.parse(previous);
    var cooling = Number(cache.get('groq:retryAt') || 0) - Date.now();
    if (cooling > 0) throw failure_('RATE_LIMIT', 'Groq đang chạm hạn mức.', Math.ceil(cooling / 1000));
    if (cache.get('pending:' + cacheKey)) throw failure_('BUSY', 'Lượt này đang được đọc.', 5);
    var minute = String(Math.floor(Date.now() / 60000)), countKey = 'groq:minute:' + minute;
    var count = Number(cache.get(countKey) || 0);
    // Shared budget, not an IP limit: Apps Script does not expose a trusted client IP.
    if (count >= 6) throw failure_('RATE_LIMIT', 'Đang có nhiều lượt đọc.', 60 - Math.floor(Date.now() / 1000) % 60);
    cache.put(countKey, String(count + 1), 120); cache.put('pending:' + cacheKey, '1', 90);
  } finally { lock.releaseLock(); }
  try {
    var request = { model: TAROT_GROQ_MODEL, messages: messages,
      temperature: payload.generationConfig.temperature, max_completion_tokens: followup ? 1400 : 3200,
      reasoning_effort: 'low', include_reasoning: false };
    if (!followup) request.response_format = TarotServerReading.schema(state);
    var response = UrlFetchApp.fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + key },
      payload: JSON.stringify(request)
    });
    var status = response.getResponseCode();
    if (status === 429) {
      var headers = response.getAllHeaders(), retry = 60;
      Object.keys(headers).forEach(function (name) { if (name.toLowerCase() === 'retry-after') retry = Number(headers[name]) || retry; });
      retry = Math.max(1, Math.min(86400, Math.ceil(retry)));
      cache.put('groq:retryAt', String(Date.now() + retry * 1000), Math.min(21600, retry));
      throw failure_('RATE_LIMIT', 'Groq đang chạm hạn mức.', retry);
    }
    if (status === 401 || status === 403) throw failure_('NOT_CONFIGURED', 'Khóa Groq cần kiểm tra trong Script properties.');
    if (status !== 200) throw failure_('PROVIDER_ERROR', 'Groq chưa phản hồi.');
    var result; try { result = JSON.parse(response.getContentText()); } catch (_) { throw failure_('PROVIDER_ERROR', 'Phản hồi không hợp lệ.'); }
    var choice = result.choices && result.choices[0], content = choice && choice.message && choice.message.content;
    if (typeof content !== 'string' || !content.trim() || choice.finish_reason === 'length') throw failure_('INCOMPLETE_READING', 'Lời giải chưa hoàn chỉnh.');
    if (!followup) {
      var structured; try { structured = JSON.parse(content); } catch (_) { throw failure_('INCOMPLETE_READING', 'Lời giải chưa đủ cấu trúc.'); }
      content = TarotServerReading.fromStructured(structured, state);
    }
    var answer = { status: 'success', text: content.trim(), model: TAROT_GROQ_MODEL };
    cache.put(cacheKey, JSON.stringify(answer), 300);
    return answer;
  } finally { cache.remove('pending:' + cacheKey); }
}
function sheet_() { return SpreadsheetApp.openById(TAROT_SHEET_ID); }
function literal_(value) { var text = String(value == null ? '' : value); return /^[=+@-]/.test(text) ? "'" + text : text; }
function saveSheet_(data) {
  var date = new Date(), today = Utilities.formatDate(date, 'GMT+7', 'dd-MM-yyyy');
  var name = /^\d{2}-\d{2}-\d{4}$/.test(data.sheetName || '') ? data.sheetName : today;
  var ss = sheet_(), sheet = ss.getSheetByName(name);
  var update = data.action === 'update_feedback' || data.action === 'update_followup';
  if (!sheet && update) throw failure_('NOT_FOUND', 'Không tìm thấy lượt xem.');
  if (!sheet) {
    sheet = ss.insertSheet(name); sheet.appendRow(TAROT_HEADERS);
    sheet.getRange('A1:R1').setFontWeight('bold').setBackground('#e2c275').setFontColor('#000000'); sheet.setFrozenRows(1);
  }
  if (update) {
    var last = sheet.getLastRow(), row = -1;
    if (last > 1) {
      var values = sheet.getRange(2, 1, last - 1, 2).getDisplayValues();
      for (var i = values.length - 1; i >= 0; i--) if (values[i][0] === String(data.time) && values[i][1] === String(data.ip)) { row = i + 2; break; }
    }
    if (row === -1) throw failure_('NOT_FOUND', 'Không tìm thấy lượt xem.');
    if (data.action === 'update_feedback') {
      var rating = Number(data.rating); if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw failure_('INVALID_REQUEST', 'Đánh giá không hợp lệ.');
      sheet.getRange(row, 12, 1, 3).setValues([[rating + ' Sao', literal_(data.ratingNote), literal_(data.feedback)]]);
    } else sheet.getRange(row, 15, 1, 2).setValues([[literal_(data.followUpQ), literal_(data.followUpA)]]);
  } else {
    sheet.appendRow(["'" + (data.time || ''), data.ip, data.name || 'Khách', data.dob || 'Không rõ', data.zodiac || 'Không rõ',
      data.gender || 'Không rõ', data.question, data.spread || 'Không rõ', data.vibe || 'Không rõ', data.conclusion,
      data.status, '', '', '', '', '', data.solver, data.source].map(literal_));
  }
  return { status: 'success' };
}
function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents;
    if (typeof raw !== 'string' || raw.length > 65000) throw failure_('INVALID_REQUEST', 'Dữ liệu quá dài hoặc không hợp lệ.');
    var data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw failure_('INVALID_REQUEST', 'Dữ liệu không hợp lệ.');
    if (data.action === 'ai_reading' || data.action === 'ai_followup') return json_(groq_(data));
    if (data.action && !['log_reading', 'update_feedback', 'update_followup'].includes(data.action)) throw failure_('INVALID_REQUEST', 'Thao tác không hợp lệ.');
    var lock = LockService.getScriptLock(); if (!lock.tryLock(3000)) throw failure_('BUSY', 'Sheet đang bận.', 5);
    try { return json_(saveSheet_(data)); } finally { lock.releaseLock(); }
  } catch (error) {
    // Never return a provider body, authorization header, or arbitrary exception.
    return json_({ status: 'error', code: error.code || 'SERVER_ERROR', message: error.code ? error.message : 'Chưa xử lý được yêu cầu.', retryAfter: error.retryAfter || 0 });
  }
}
function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.action === 'ai_health') return json_({ status: 'success', service: 'tarot-groq', version: 1,
      configured: !!PropertiesService.getScriptProperties().getProperty('GROQ_API_KEY'), model: TAROT_GROQ_MODEL, readingFormat: 2 });
    var sheet = sheet_().getSheetByName('TopDonate');
    if (!sheet) return json_({ status: 'success', data: [] });
    var last = sheet.getLastRow(), list = [];
    if (last >= 2) sheet.getRange(2, 1, Math.min(last - 1, 10), 2).getValues().forEach(function (row) {
      if (row[0] && row[1]) list.push({ name: row[0], amount: row[1] });
    });
    return json_({ status: 'success', data: list });
  } catch (_) { return json_({ status: 'error', message: 'Chưa đọc được danh sách.' }); }
}
function onEdit(e) {
  var sheet = e.range.getSheet();
  if (sheet.getName() === 'TopDonate' && e.range.getRow() >= 2 && sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).sort({ column: 2, ascending: false });
}
// Run once from the editor to authorize UrlFetchApp. Not exposed by doGet/doPost.
function checkGroqConnection() {
  var key = PropertiesService.getScriptProperties().getProperty('GROQ_API_KEY');
  if (!key) throw new Error('Chưa đặt GROQ_API_KEY trong Script properties.');
  var response = UrlFetchApp.fetch('https://api.groq.com/openai/v1/models/' + TAROT_GROQ_MODEL, {
    headers: { Authorization: 'Bearer ' + key }, muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error('Groq HTTP ' + response.getResponseCode() + '. Kiểm tra khóa và quyền truy cập model.');
  console.log('Kết nối Groq thành công: ' + TAROT_GROQ_MODEL + '. Khóa không được xuất ra web.');
}
