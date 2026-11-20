// Pure OSC 7501 (status) / 7502 (room message) stream parser for PTY output.
// - Keeps a per-stream carry-over so sequences split across PTY chunks are not lost.
// - Never returns a sender: callers attribute messages to the emitting session (OSC `from=` is untrusted).
'use strict';

const MAX_CARRY = 4096;
const MAX_MSG = 2000;
const STATES = new Set(['idle', 'working', 'blocked', 'done', 'error']);
const TYPES = new Set(['chat', 'task_delegate', 'status_update', 'review_request']);
const SEQ = /\x1b\](750[12]);([^\x07\x1b]*)(?:\x07|\x1b\\)/g;
const PREFIXES = ['\x1b]7501;', '\x1b]7502;'];

// `msg=` is always the last field and may itself contain ';'.
function parseParams(s) {
  const out = {};
  const mi = s.indexOf('msg=');
  const head = mi >= 0 ? s.slice(0, mi) : s;
  if (mi >= 0) out.msg = s.slice(mi + 4);
  for (const part of head.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}

// Is `rest` (starting at ESC ]) the unterminated start of one of our sequences?
function isPartial(rest) {
  if (/\x07|\x1b\\/.test(rest)) return false;
  if (rest.length < 7) return PREFIXES.some((p) => p.startsWith(rest));
  return PREFIXES.some((p) => rest.startsWith(p));
}

function createOscParser() {
  let carry = '';
  return function feed(chunk) {
    const text = carry + String(chunk);
    const events = [];
    let lastEnd = 0;
    let m;
    SEQ.lastIndex = 0;
    while ((m = SEQ.exec(text)) !== null) {
      lastEnd = SEQ.lastIndex;
      const p = parseParams(m[2]);
      const msg = String(p.msg || '').slice(0, MAX_MSG);
      if (m[1] === '7501') {
        events.push({ kind: 'status', state: STATES.has(p.state) ? p.state : 'working', msg });
      } else {
        events.push({ kind: 'message', to: p.to || '@all', type: TYPES.has(p.type) ? p.type : 'chat', msg });
      }
    }
    let next = '';
    for (let i = text.indexOf('\x1b]', lastEnd); i !== -1; i = text.indexOf('\x1b]', i + 2)) {
      if (isPartial(text.slice(i))) { next = text.slice(i); break; }
    }
    if (!next && text.endsWith('\x1b')) next = '\x1b';
    carry = next.length > MAX_CARRY ? '' : next;
    return events;
  };
}

// Sliding-window limiter: allow at most `limit` events per `windowMs`.
function createRateLimiter(limit = 5, windowMs = 10000) {
  const hits = [];
  return function allow(now = Date.now()) {
    while (hits.length && now - hits[0] >= windowMs) hits.shift();
    if (hits.length >= limit) return false;
    hits.push(now);
    return true;
  };
}

module.exports = { createOscParser, createRateLimiter, MAX_MSG };
