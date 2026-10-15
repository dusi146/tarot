/* Server only. Keys are read from Script Properties; never accepted from callers. */
function providerConfig_() {
  var properties = PropertiesService.getScriptProperties();
  function config(id, keyName, modelName, model, rpm, timeoutSeconds) {
    var override = properties.getProperty(modelName);
    return { id: id, key: properties.getProperty(keyName) || '',
      model: override && /^[a-zA-Z0-9._/-]{1,100}$/.test(override) ? override : model, rpm: rpm, timeoutSeconds: timeoutSeconds };
  }
  return [config('groq', 'GROQ_API_KEY', 'GROQ_MODEL', 'openai/gpt-oss-120b', 6, 25),
    config('gemini', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'gemini-2.5-flash', 6, 35),
    config('intern', 'INTERN_AI_API_KEY', 'INTERN_AI_MODEL', 'deepseek-v4-flash-0731', 45, 25)];
}
function aiHealth_() {
  var providers = providerConfig_();
  return { status: 'success', service: 'tarot-ai', version: 2, readingFormat: 2, streaming: false,
    promptVersion: TarotServerPersona.PROMPT_VERSION, fallbackVersion: 3,
    configured: providers.some(function (p) { return !!p.key; }),
    providers: providers.map(function (p) { return { id: p.id, model: p.model, configured: !!p.key }; }) };
}
function retrySeconds_(response) {
  var headers = response.getAllHeaders(), retry = 60;
  Object.keys(headers).forEach(function (name) {
    if (name.toLowerCase() !== 'retry-after') return;
    var value = String(headers[name]), seconds = Number(value);
    retry = isFinite(seconds) ? seconds : Math.ceil((Date.parse(value) - Date.now()) / 1000) || 60;
  });
  return Math.max(1, Math.min(21600, Math.ceil(retry)));
}
function providerCall_(provider, payload, state, followup) {
  var request, url, headers, readingTokens = 2048 + 1024 * state.selectedCards.length;
  if (provider.id === 'gemini') {
    url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(provider.model) + ':generateContent';
    headers = { 'x-goog-api-key': provider.key };
    request = { systemInstruction: payload.systemInstruction, contents: payload.contents,
      generationConfig: { temperature: payload.generationConfig.temperature, maxOutputTokens: followup ? 2400 : readingTokens } };
    if (provider.model.indexOf('gemini-2.5-') === 0) request.generationConfig.thinkingConfig = { thinkingBudget: 0 };
    if (!followup) {
      request.generationConfig.responseMimeType = 'application/json';
      request.generationConfig.responseJsonSchema = TarotServerReading.schema(state).json_schema.schema;
    }
  } else {
    url = provider.id === 'intern' ? 'https://discovery-api.intern-ai.org.cn/v1/chat/completions'
      : 'https://api.groq.com/openai/v1/chat/completions';
    headers = { Authorization: 'Bearer ' + provider.key };
    request = { model: provider.model, stream: false,
      messages: [{ role: 'system', content: payload.systemInstruction.parts[0].text }].concat(payload.contents.map(function (item) {
        return { role: item.role === 'model' ? 'assistant' : 'user', content: item.parts.map(function (part) { return part.text; }).join('\n') };
      })), temperature: payload.generationConfig.temperature };
    if (provider.id === 'groq') {
      request.max_completion_tokens = followup ? 1800 : readingTokens;
      request.reasoning_effort = 'low'; request.include_reasoning = false;
      if (!followup) request.response_format = TarotServerReading.schema(state);
    } else {
      request.max_tokens = followup ? 2400 : readingTokens;
      // DeepSeek V4 defaults to thinking. A prose reading does not need a long hidden
      // reasoning pass before its JSON, which previously exhausted the fetch budget.
      if (/^deepseek-(?:v4-|flash(?:-|$))/.test(provider.model)) request.thinking = { type: 'disabled' };
      // JSON mode is more widely supported than strict schema by OpenAI-compatible gateways.
      if (!followup) {
        request.response_format = { type: 'json_object' };
        request.messages[0].content += '\nJSON schema cần tuân thủ:\n' + JSON.stringify(TarotServerReading.schema(state).json_schema.schema);
      }
    }
  }
  var response, fetchStarted = Date.now();
  try { response = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: headers, payload: JSON.stringify(request), timeoutSeconds: provider.timeoutSeconds }); }
  catch (error) {
    var timedOut = /time\s*out|timed\s*out|timeout|deadline/i.test(String(error && error.message || ''))
      || Date.now() - fetchStarted >= provider.timeoutSeconds * 900;
    throw failure_(timedOut ? 'PROVIDER_TIMEOUT' : 'PROVIDER_ERROR', 'Kết nối dịch vụ bị gián đoạn.', timedOut ? 120 : 30);
  }
  var status = response.getResponseCode();
  var httpError;
  if (status === 429) httpError = failure_('RATE_LIMIT', 'Dịch vụ đang chạm hạn mức.', retrySeconds_(response));
  else if (status === 401 || status === 403) httpError = failure_('AUTH_ERROR', 'Cấu hình kết nối cần được kiểm tra.', 300);
  else if (status < 200 || status >= 300) httpError = failure_('PROVIDER_ERROR', 'Dịch vụ chưa phản hồi.', status >= 500 ? 15 : 60);
  if (httpError) { httpError.httpStatus = status; throw httpError; }
  var result;
  try { result = JSON.parse(response.getContentText()); } catch (_) {
    var malformed = failure_('PROVIDER_ERROR', 'Phản hồi không hợp lệ.', 10); malformed.httpStatus = status; throw malformed;
  }
  var content, finish;
  if (provider.id === 'gemini') {
    var candidate = result.candidates && result.candidates[0];
    finish = candidate && candidate.finishReason;
    content = candidate && candidate.content && candidate.content.parts.filter(function (part) { return !part.thought && typeof part.text === 'string'; }).map(function (part) { return part.text; }).join('');
    if (finish !== 'STOP') throw failure_('INCOMPLETE_READING', 'Phản hồi chưa hoàn chỉnh.');
  } else {
    var choice = result.choices && result.choices[0];
    content = choice && choice.message && choice.message.content; finish = choice && choice.finish_reason;
    if (finish !== 'stop') throw failure_('INCOMPLETE_READING', 'Phản hồi chưa hoàn chỉnh.');
  }
  if (typeof content !== 'string' || !content.trim() || content.length > (followup ? 6000 : 18000)) throw failure_('INCOMPLETE_READING', 'Phản hồi chưa hoàn chỉnh.');
  if (!followup) {
    var structured;
    try { structured = JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
    catch (_) { throw failure_('INCOMPLETE_READING', 'Lời giải chưa đủ cấu trúc.'); }
    content = TarotServerReading.fromStructured(structured, state);
  }
  return { status: 'success', text: content.trim(), provider: provider.id, model: provider.model };
}
function reserveProvider_(provider, cache) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1500)) return failure_('BUSY', 'Dịch vụ đang bận.', 5);
  try {
    var saved = cache.get('tarot-ai:' + provider.id + ':cooldown'), cooldown = saved ? JSON.parse(saved) : null;
    var cooling = cooldown ? cooldown.until - Date.now() : 0;
    if (cooling > 0) return failure_(cooldown.code, 'Dịch vụ đang tạm nghỉ.', Math.ceil(cooling / 1000));
    var countKey = provider.id + ':minute:' + Math.floor(Date.now() / 60000), count = Number(cache.get(countKey) || 0);
    if (count >= provider.rpm) return failure_('RATE_LIMIT', 'Dịch vụ đang chạm hạn mức.', 60 - Math.floor(Date.now() / 1000) % 60);
    cache.put(countKey, String(count + 1), 120); return null;
  } finally { lock.releaseLock(); }
}
function ai_(data) {
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
  var providers = providerConfig_().filter(function (p) { return !!p.key; });
  if (!providers.length) throw failure_('NOT_CONFIGURED', 'Chưa cấu hình dịch vụ AI.');
  var cache = CacheService.getScriptCache();
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify({ format: 4, action: data.action, payload: payload,
    providers: providers.map(function (p) { return [p.id, p.model]; }) }));
  var cacheKey = 'reply:' + Utilities.base64EncodeWebSafe(digest), lock = LockService.getScriptLock();
  if (!lock.tryLock(1500)) throw failure_('BUSY', 'Dịch vụ đang bận.', 5);
  try {
    var previous = cache.get(cacheKey); if (previous) return JSON.parse(previous);
    if (cache.get('pending:' + cacheKey)) throw failure_('BUSY', 'Lượt này đang được đọc.', 5);
    cache.put('pending:' + cacheKey, '1', 240);
  } finally { lock.releaseLock(); }
  var failures = [], attempts = [];
  function trace(provider, code, status, started) {
    var item = { provider: provider.id, code: code, status: Number(status) || 0, elapsedMs: Math.max(0, Date.now() - started) };
    attempts.push(item); console.log(JSON.stringify({ event: "tarot_ai_attempt", provider: item.provider, code: item.code, status: item.status, elapsedMs: item.elapsedMs }));
  }
  function exhausted(code, message, retryAfter) { var error = failure_(code, message, retryAfter); error.attempts = attempts; return error; }
  try {
    for (var i = 0; i < providers.length; i++) {
      var provider = providers[i], started = Date.now();
      try {
        var reservation = reserveProvider_(provider, cache);
        if (reservation) throw reservation;
        var answer = providerCall_(provider, payload, state, followup);
        trace(provider, "OK", 200, started); answer.attempts = attempts;
        try { cache.put(cacheKey, JSON.stringify(answer), 300); } catch (_) {}
        return answer;
      } catch (error) {
        // Validation occurred before this loop. Provider faults never expose upstream bodies or keys.
        var safe = ['RATE_LIMIT', 'AUTH_ERROR', 'PROVIDER_ERROR', 'PROVIDER_TIMEOUT', 'INCOMPLETE_READING', 'BUSY'].indexOf(error && error.code) >= 0 ? error : failure_('PROVIDER_ERROR', 'Dịch vụ chưa phản hồi.', 10);
        trace(provider, safe.code, safe.httpStatus, started);
        failures.push(safe);
        if (safe.retryAfter) { try { cache.put('tarot-ai:' + provider.id + ':cooldown', JSON.stringify({ until: Date.now() + safe.retryAfter * 1000, code: safe.code }), Math.min(21600, safe.retryAfter)); } catch (_) {} }
      }
    }
    var allRate = failures.every(function (e) { return e.code === 'RATE_LIMIT'; });
    var retry = Math.min.apply(null, failures.map(function (e) { return e.retryAfter || 30; }));
    if (allRate) throw exhausted('RATE_LIMIT', 'Các dịch vụ đang chạm hạn mức.', retry);
    if (failures.every(function (e) { return e.code === 'BUSY'; })) throw exhausted('BUSY', 'Dịch vụ đang bận.', retry);
    if (failures.every(function (e) { return e.code === 'AUTH_ERROR'; })) throw exhausted('AUTH_ERROR', 'Cấu hình kết nối cần được kiểm tra.');
    if (failures.some(function (e) { return e.code === 'INCOMPLETE_READING'; })) throw exhausted('INCOMPLETE_READING', 'Lời giải chưa hoàn chỉnh.');
    throw exhausted('PROVIDER_ERROR', 'Các dịch vụ chưa phản hồi. Bạn thử lại sau một chút nhé.');
  } finally { cache.remove('pending:' + cacheKey); }
}
// Run manually in the editor. Checks credentials without generating a paid response.
function checkAIConnections() {
  var providers = providerConfig_();
  providers.forEach(function (p) {
    if (!p.key) { console.log(p.id + ': chưa cấu hình, sẽ bỏ qua.'); return; }
    var url = p.id === 'intern' ? 'https://discovery-api.intern-ai.org.cn/v1/models' : p.id === 'groq'
      ? 'https://api.groq.com/openai/v1/models' : 'https://generativelanguage.googleapis.com/v1beta/models';
    try {
      var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, timeoutSeconds: 10,
        headers: p.id === 'gemini' ? { 'x-goog-api-key': p.key } : { Authorization: 'Bearer ' + p.key } });
      console.log(p.id + ': HTTP ' + response.getResponseCode() + '; model đang chọn: ' + p.model + '. Khóa không được xuất ra web.');
    } catch (_) { console.log(p.id + ': lỗi kết nối hoặc quá thời gian; tiếp tục kiểm tra dịch vụ sau.'); }
  });
}
// Manual synthetic generation check. Unlike /models, this checks actual reading
// output and validation. It does not save a reading or print its content/keys.
function checkAIGeneration() {
  var state = state_({ name: '', question: 'Mình muốn học một kỹ năng mới trong tháng này, nên bắt đầu thế nào?',
    vibe: 'tatnuoc', spreadId: 'single', cards: [{ id: '00', reversed: false }] });
  var payload = TarotServerPersona.readingPayload(state, { structured: true });
  providerConfig_().forEach(function (p) {
    if (!p.key) { console.log(JSON.stringify({ event: 'tarot_ai_generation_check', provider: p.id, code: 'NOT_CONFIGURED' })); return; }
    var started = Date.now();
    try {
      var answer = providerCall_(p, payload, state, false);
      console.log(JSON.stringify({ event: 'tarot_ai_generation_check', provider: p.id, code: 'OK', status: 200,
        elapsedMs: Date.now() - started, characters: answer.text.length }));
    } catch (error) {
      console.log(JSON.stringify({ event: 'tarot_ai_generation_check', provider: p.id,
        code: ['RATE_LIMIT', 'AUTH_ERROR', 'PROVIDER_ERROR', 'PROVIDER_TIMEOUT', 'INCOMPLETE_READING'].indexOf(error.code) >= 0 ? error.code : 'PROVIDER_ERROR',
        status: Number(error.httpStatus) || 0, elapsedMs: Date.now() - started }));
    }
  });
}
