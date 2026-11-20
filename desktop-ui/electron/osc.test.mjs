import { describe, it, expect } from 'vitest';
import osc from './osc.cjs';

const { createOscParser, createRateLimiter, MAX_MSG } = osc;
const ESC = '\x1b';

describe('OSC parser (shipped electron/osc.cjs)', () => {
  it('parses 7501 status with BEL and ST terminators', () => {
    const feed = createOscParser();
    expect(feed(`${ESC}]7501;state=blocked;msg=need input\x07`)).toEqual([{ kind: 'status', state: 'blocked', msg: 'need input' }]);
    expect(feed(`${ESC}]7501;state=done;msg=ok${ESC}\\`)).toEqual([{ kind: 'status', state: 'done', msg: 'ok' }]);
  });

  it('reassembles a sequence split across chunks (incl. split inside the prefix)', () => {
    const feed = createOscParser();
    expect(feed(`hello ${ESC}`)).toEqual([]);
    expect(feed(`]75`)).toEqual([]);
    expect(feed(`02;to=@lead;type=chat;msg=hi th`)).toEqual([]);
    expect(feed(`ere\x07 tail`)).toEqual([{ kind: 'message', to: '@lead', type: 'chat', msg: 'hi there' }]);
  });

  it('never exposes the untrusted from= field', () => {
    const [ev] = createOscParser()(`${ESC}]7502;to=@all;from=Local Main Shell;type=chat;msg=x\x07`);
    expect(ev).not.toHaveProperty('from');
  });

  it('keeps ; inside msg and caps its length', () => {
    const feed = createOscParser();
    expect(feed(`${ESC}]7502;to=@all;msg=a;b;c\x07`)[0].msg).toBe('a;b;c');
    expect(feed(`${ESC}]7502;msg=${'z'.repeat(5000)}\x07`)[0].msg.length).toBe(MAX_MSG);
  });

  it('whitelists state and type', () => {
    const feed = createOscParser();
    expect(feed(`${ESC}]7501;state=pwn;msg=\x07`)[0].state).toBe('working');
    expect(feed(`${ESC}]7502;type=rm-rf;msg=x\x07`)[0].type).toBe('chat');
  });

  it('drops an oversized unterminated carry instead of growing forever', () => {
    const feed = createOscParser();
    feed(`${ESC}]7502;msg=${'a'.repeat(5000)}`);
    expect(feed(`\x07`)).toEqual([]);
  });

  it('ignores unrelated OSC sequences (e.g. window title)', () => {
    expect(createOscParser()(`${ESC}]0;title\x07`)).toEqual([]);
  });
});

describe('rate limiter', () => {
  it('allows 5 per 10s then blocks, and recovers after the window', () => {
    const allow = createRateLimiter(5, 10000);
    const t = 1_000_000;
    expect([0, 1, 2, 3, 4].map((i) => allow(t + i))).toEqual([true, true, true, true, true]);
    expect(allow(t + 5)).toBe(false);
    expect(allow(t + 10001)).toBe(true);
  });
});
