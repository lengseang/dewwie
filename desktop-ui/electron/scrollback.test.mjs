import { describe, it, expect } from 'vitest';
import sb from './scrollback.cjs';

const { trimScrollback, cutAtSafeBoundary } = sb;
const B = (s) => Buffer.from(s, 'utf-8');

describe('scrollback trimming (shipped electron/scrollback.cjs)', () => {
  it('leaves buffers that fit untouched', () => {
    const b = B('hello\r\n');
    expect(trimScrollback(b, 100)).toBe(b);
  });

  it('cuts at the first newline after the cut point', () => {
    const b = B('line-one-is-long\r\nline-two\r\nline-three\r\n');
    const out = trimScrollback(b, 20).toString();
    expect(out.startsWith('line-')).toBe(true);
    expect(b.toString().endsWith(out)).toBe(true);
    expect(out).not.toMatch(/^[^l]/);
  });

  it('never starts inside a UTF-8 multi-byte character', () => {
    const b = B('ééééééééééééééééééé'); // no newline, no ESC; 2 bytes per char
    for (let keep = 3; keep < 30; keep++) {
      const out = trimScrollback(b, keep);
      expect((out[0] & 0xc0) === 0x80).toBe(false);
      expect(out.toString()).not.toContain('�');
    }
  });

  it('never starts inside an escape sequence when there is no newline (full-screen TUI output)', () => {
    const frame = '\x1b[2J\x1b[H\x1b[38;5;208mAccessing workspace\x1b[0m\x1b[10;1H\x1b[38;5;244mstatus\x1b[0m';
    const b = B(frame.repeat(20));
    for (let keep = 5; keep < 120; keep += 7) {
      const out = trimScrollback(b, keep).toString();
      expect(out.startsWith('\x1b')).toBe(true);
    }
  });

  it('cutAtSafeBoundary from 0 drops a leading partial line', () => {
    expect(cutAtSafeBoundary(B('artial line\nnext\n'), 0).toString()).toBe('next\n');
  });
});
