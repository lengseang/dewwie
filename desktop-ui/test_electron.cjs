const fs = require('fs');
let res = 'OK';
try {
  const pty = require('node-pty');
  res = 'NODE_PTY_LOADED_SUCCESSFULLY';
} catch (e) {
  res = 'ERR: ' + e.stack;
}
fs.writeFileSync('electron_test.log', res, 'utf-8');
const { app } = require('electron');
app.quit();
