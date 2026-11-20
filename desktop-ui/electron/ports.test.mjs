import { describe, it, expect } from 'vitest';
import net from 'net';
import ports from './ports.cjs';

const { allocatePort, registryPorts, probeFree } = ports;
const hold = (port) => new Promise((res, rej) => { const s = net.createServer(); s.once('error', rej); s.listen(port, '127.0.0.1', () => res(s)); });

describe('port allocation (shipped electron/ports.cjs)', () => {
  it('skips ports recorded in the registry (incl. API twins), e.g. after a session was deleted', async () => {
    // Old logic: 5174 + list.length. With sessions on 5174 and 5176 (5175's owner deleted), length 2 -> 5176 = collision.
    const list = [{ ports: [{ port: 5174 }] }, { ports: [{ port: 5176 }] }];
    const used = registryPorts(list);
    const p = await allocatePort(used, { isFree: async () => true });
    expect(p).toBe(5175);
  });

  it('never returns the same port twice in one pass', async () => {
    const used = new Set();
    const a = await allocatePort(used, { isFree: async () => true });
    const b = await allocatePort(used, { isFree: async () => true });
    expect(a).not.toBe(b);
  });

  it('skips a port that is actually bound on the OS', async () => {
    const base = 20000 + Math.floor(Math.random() * 5000);
    const s = await hold(base);
    try {
      expect(await probeFree(base)).toBe(false);
      const p = await allocatePort(new Set(), { start: base, end: base + 50 });
      expect(p).not.toBe(base);
    } finally {
      s.close();
    }
  });

  it('skips a port whose API twin (+3000) is bound', async () => {
    const base = 30000 + Math.floor(Math.random() * 3000);
    const s = await hold(base + 3000);
    try {
      const p = await allocatePort(new Set(), { start: base, end: base + 50 });
      expect(p).not.toBe(base);
    } finally {
      s.close();
    }
  });

  it('throws when the range is exhausted instead of returning a colliding port', async () => {
    await expect(allocatePort(new Set([5174, 5175]), { start: 5174, end: 5175, isFree: async () => true })).rejects.toThrow();
  });
});
