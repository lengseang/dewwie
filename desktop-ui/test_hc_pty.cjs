const pty = require('node-pty');
const path = require('path');
const os = require('os');

const hcBin = path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'herdr-core', 'hc.exe');
console.log('Testing hc attach with node-pty...');

try {
  const p = pty.spawn(hcBin, ['ls'], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.cwd()
  });

  p.onData((data) => {
    console.log('[DATA FROM HC]:', data);
  });

  p.onExit(({ exitCode }) => {
    console.log('hc exited with code:', exitCode);
    process.exit(0);
  });
} catch (err) {
  console.error('Error spawning hc:', err);
  process.exit(1);
}
