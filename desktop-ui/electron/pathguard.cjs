// Confine renderer-supplied paths (fs:read / fs:tree) to registered project roots.
// Replaces a `full.startsWith(root)` check where the renderer also chose `root` (so any file was readable,
// and `D:\proj-secrets` passed for root `D:\proj`).
'use strict';
const fs = require('fs');
const path = require('path');

const real = (p) => {
  try { return fs.realpathSync.native(p); } catch (_) { return path.resolve(p); }
};

// True when `target` is `root` itself or lives under it (case-insensitive on Windows via path.relative).
function isInside(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// Resolve `rel` against `base` and return the real absolute path only if it stays inside one of `roots`
// (symlinks/junctions resolved first so they cannot be used to step outside). Otherwise null.
function resolveInsideRoots(roots, base, rel = '') {
  const realRoots = roots.filter(Boolean).map(real);
  const full = real(path.resolve(base || '', rel || ''));
  return realRoots.some((r) => isInside(r, full)) ? full : null;
}

module.exports = { isInside, resolveInsideRoots };
