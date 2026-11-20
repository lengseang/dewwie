import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import store from './jsonstore.cjs';

const { readJsonSafe, writeJsonAtomic } = store;
let dir;
let file;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dewwie_jsonstore_'));
  file = path.join(dir, 'workspaces.json');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('jsonstore (shipped electron/jsonstore.cjs)', () => {
  it('returns the fallback when nothing exists', () => {
    expect(readJsonSafe(file, [])).toEqual([]);
  });

  it('round-trips, keeps the previous good version as .bak, leaves no temp files', () => {
    writeJsonAtomic(file, [{ id: 'a' }]);
    writeJsonAtomic(file, [{ id: 'a' }, { id: 'b' }]);
    expect(readJsonSafe(file, [])).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(JSON.parse(fs.readFileSync(file + '.bak', 'utf-8'))).toEqual([{ id: 'a' }]);
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('a torn/corrupt main file falls back to .bak instead of an empty list (the old wipe path)', () => {
    writeJsonAtomic(file, [{ id: 'keep-me' }]);
    writeJsonAtomic(file, [{ id: 'keep-me' }, { id: 'newer' }]);
    fs.writeFileSync(file, '[{"id": "keep-me"}, {"id": "ne'); // simulated torn write by another process
    expect(readJsonSafe(file, [])).toEqual([{ id: 'keep-me' }]);
  });

  it('never destroys a corrupt file: it is moved aside before being replaced', () => {
    fs.writeFileSync(file, '{ not json');
    writeJsonAtomic(file, [{ id: 'fresh' }]);
    const aside = fs.readdirSync(dir).filter((f) => f.startsWith('workspaces.json.corrupt-'));
    expect(aside).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, aside[0]), 'utf-8')).toBe('{ not json');
    expect(readJsonSafe(file, [])).toEqual([{ id: 'fresh' }]);
  });

  it('when both main and .bak are unreadable it returns the fallback (and the next save preserves the bytes)', () => {
    fs.writeFileSync(file, 'x');
    fs.writeFileSync(file + '.bak', 'y');
    expect(readJsonSafe(file, ['default'])).toEqual(['default']);
  });
});
