import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import guard from './pathguard.cjs';

const { resolveInsideRoots } = guard;
let tmp, proj, sibling;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dewwie_guard_'));
  proj = path.join(tmp, 'proj');
  sibling = path.join(tmp, 'proj-secrets'); // shares the string prefix "proj"
  fs.mkdirSync(path.join(proj, 'src'), { recursive: true });
  fs.mkdirSync(sibling);
  fs.writeFileSync(path.join(proj, 'src', 'a.ts'), 'ok');
  fs.writeFileSync(path.join(sibling, 'key.txt'), 'secret');
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('pathguard (shipped electron/pathguard.cjs)', () => {
  it('allows files inside a registered root', () => {
    expect(resolveInsideRoots([proj], proj, 'src/a.ts')).toBe(fs.realpathSync.native(path.join(proj, 'src', 'a.ts')));
  });

  it('rejects ../ traversal out of the root', () => {
    expect(resolveInsideRoots([proj], proj, '../proj-secrets/key.txt')).toBeNull();
    expect(resolveInsideRoots([proj], proj, '..\\..\\Windows\\win.ini')).toBeNull();
  });

  it('rejects a sibling directory that merely shares the string prefix (old startsWith bug)', () => {
    expect(resolveInsideRoots([proj], sibling, 'key.txt')).toBeNull();
  });

  it('rejects a renderer-chosen base outside every root, and absolute paths', () => {
    expect(resolveInsideRoots([proj], 'C:\\Windows', 'win.ini')).toBeNull();
    expect(resolveInsideRoots([proj], proj, path.join(sibling, 'key.txt'))).toBeNull();
  });

  it('is case-insensitive for the root on Windows', () => {
    if (process.platform !== 'win32') return;
    expect(resolveInsideRoots([proj.toUpperCase()], proj, 'src/a.ts')).not.toBeNull();
  });

  it('rejects a junction inside the root that points outside it', () => {
    const link = path.join(proj, 'escape');
    try { fs.symlinkSync(sibling, link, 'junction'); } catch (_) { return; } // junctions need no admin on Windows
    expect(resolveInsideRoots([proj], proj, 'escape/key.txt')).toBeNull();
  });
});
