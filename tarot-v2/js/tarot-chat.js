/* Small, safe Markdown subset for conversation. Raw HTML is always plain text. */
(function (root) {
  'use strict';
  function safeURL(value) {
    try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; }
    catch { return null; }
  }
  function inline(parent, value, document) {
    const pattern = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^\s)]+\)|\*[^*\n]+\*)/g;
    let position = 0;
    for (const match of value.matchAll(pattern)) {
      parent.appendChild(document.createTextNode(value.slice(position, match.index)));
      const text = match[0], link = /^\[([^\]]+)\]\((.+)\)$/.exec(text);
      let node;
      if (link && safeURL(link[2])) {
        node = document.createElement('a'); node.href = safeURL(link[2]); node.target = '_blank'; node.rel = 'noopener noreferrer'; node.textContent = link[1];
      } else if (link) node = document.createTextNode(text);
      else { const width = text.startsWith('**') ? 2 : 1; node = document.createElement(width === 2 ? 'strong' : text[0] === '`' ? 'code' : 'em'); node.textContent = text.slice(width, -width); }
      parent.appendChild(node); position = match.index + text.length;
    }
    parent.appendChild(document.createTextNode(value.slice(position)));
  }
  function highlight(code, text, language, document) {
    if (!/^(?:js|javascript|ts|typescript|python|py|json)$/.test(language)) { code.textContent = text; return; }
    const pattern = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/[^\n]*|#[^\n]*|\b(?:const|let|var|function|return|if|else|for|while|class|new|await|async|import|from|def|print|True|False|None|true|false|null|try|catch|throw)\b|\b\d+(?:\.\d+)?\b)/g;
    let position = 0;
    for (const match of text.matchAll(pattern)) {
      code.appendChild(document.createTextNode(text.slice(position, match.index)));
      const span = document.createElement('span'), token = match[0];
      span.className = 'syntax-' + (/^["']/.test(token) ? 'string' : /^(?:\/\/|#)/.test(token) ? 'comment' : /^\d/.test(token) ? 'number' : 'keyword');
      span.textContent = token; code.appendChild(span); position = match.index + token.length;
    }
    code.appendChild(document.createTextNode(text.slice(position)));
  }
  function render(container, value, document) {
    container.textContent = '';
    const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n');
    let paragraph = [], list = null;
    function flush() {
      if (!paragraph.length) return;
      const p = document.createElement('p'); inline(p, paragraph.join('\n'), document); container.appendChild(p); paragraph = [];
    }
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i], fence = /^```([\w-]*)\s*$/.exec(line);
      if (fence) {
        flush(); list = null; const content = [];
        while (++i < lines.length && !/^```\s*$/.test(lines[i])) content.push(lines[i]);
        const pre = document.createElement('pre'), code = document.createElement('code');
        highlight(code, content.join('\n'), fence[1].toLowerCase(), document); pre.appendChild(code); container.appendChild(pre); continue;
      }
      if (!line.trim()) { flush(); list = null; continue; }
      const heading = /^#{1,6}\s+(.+)$/.exec(line), item = /^\s*(?:[-*]\s+|\d+[.)]\s+)(.+)$/.exec(line);
      if (heading) { flush(); list = null; const h = document.createElement('h4'); inline(h, heading[1], document); container.appendChild(h); }
      else if (item) {
        flush(); const kind = /^\s*\d/.test(line) ? 'ol' : 'ul';
        if (!list || list.tagName.toLowerCase() !== kind) { list = document.createElement(kind); container.appendChild(list); }
        const li = document.createElement('li'); inline(li, item[1], document); list.appendChild(li);
      } else { list = null; paragraph.push(line); }
    }
    flush();
  }
  const api = { render, safeURL };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TarotChat = api;
})(typeof window === 'object' ? window : this);
