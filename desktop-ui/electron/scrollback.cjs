// Scrollback trimming that never starts replay mid-character or mid-escape-sequence.
// Previously the buffer was cut at a raw byte offset, so a restore could begin inside a UTF-8 character or
// an ANSI sequence and xterm rendered garbage until the next reset.
'use strict';

// From byte `from`, move forward to a boundary that is safe to start replaying at:
// just after the next newline, else at the next ESC (start of a sequence), else past UTF-8 continuation bytes.
function cutAtSafeBoundary(buf, from = 0) {
  let i = buf.indexOf(0x0a, from);
  if (i !== -1) return buf.subarray(i + 1);
  i = buf.indexOf(0x1b, from);
  if (i !== -1) return buf.subarray(i);
  i = from;
  while (i < buf.length && (buf[i] & 0xc0) === 0x80) i++;
  return buf.subarray(i);
}

// Keep roughly the last `keep` bytes, cut at a safe boundary. Returns the input untouched when it fits.
function trimScrollback(buf, keep = 65536) {
  if (buf.length <= keep) return buf;
  return cutAtSafeBoundary(buf, buf.length - keep);
}

module.exports = { cutAtSafeBoundary, trimScrollback };
