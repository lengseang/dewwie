// Crash- and race-tolerant JSON state files (~/.swarmherd/*.json), shared with cli/dewwie.py.
// Guarantees: a reader never sees a half-written file (temp + rename), a parse failure falls back to the
// last good copy (.bak) instead of an empty list, and no bytes are ever destroyed (a corrupt file is
// moved aside to .corrupt-<ts> before being replaced). Mirror of write_json_atomic/read_json_safe in dewwie.py.
'use strict';
const fs = require('fs');

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function tryParse(file) {
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(file, 'utf-8')) };
  } catch (_) {
    return { ok: false };
  }
}

function readJsonSafe(file, fallback) {
  if (!fs.existsSync(file) && !fs.existsSync(file + '.bak')) return fallback;
  for (const f of [file, file + '.bak']) {
    if (!fs.existsSync(f)) continue;
    const r = tryParse(f);
    if (r.ok) {
      if (f !== file) console.error(`[Dewwie] ${file} unreadable; using last good copy ${f}`);
      return r.value;
    }
  }
  console.error(`[Dewwie] ${file} and its .bak are unreadable; starting from defaults (original kept on next save as .corrupt-*)`);
  return fallback;
}

// Windows rename can fail transiently (EPERM/EBUSY) when another process or AV has the file open.
function renameWithRetry(from, to) {
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      if (i >= 8 || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err;
      sleep(15 * (i + 1));
    }
  }
}

function writeJsonAtomic(file, data) {
  if (fs.existsSync(file)) {
    if (tryParse(file).ok) {
      try { fs.copyFileSync(file, file + '.bak'); } catch (_) {}
    } else {
      renameWithRetry(file, `${file}.corrupt-${Date.now()}`);
    }
  }
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  try {
    renameWithRetry(tmp, file);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch (_) {}
    throw err;
  }
}

module.exports = { readJsonSafe, writeJsonAtomic };
