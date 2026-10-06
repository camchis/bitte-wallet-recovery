import { spawn } from 'node:child_process';

// This process owns the browser. Its parent owns only a pipe/IPC lifeline,
// so even SIGKILL of the backend triggers cleanup without a stored/reused PID.
let browser;
let stopping = false;
let timer;
function stop() {
  if (stopping) return;
  stopping = true;
  if (!browser) { process.exit(0); return; }
  if (browser.exitCode !== null || browser.signalCode !== null) return;
  browser.kill('SIGTERM');
  timer = setTimeout(() => browser.kill('SIGKILL'), 5000);
}
process.stdin.resume();
process.stdin.on('end', stop);
process.on('disconnect', stop);
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
const [executable, ...args] = process.argv.slice(2);
if (!executable || !process.send) process.exit(1);
browser = spawn(executable, args, { stdio: 'ignore' });
browser.once('error', () => { clearTimeout(timer); process.exit(1); });
browser.once('exit', () => { clearTimeout(timer); process.exit(0); });
browser.once('spawn', () => {
  if (stopping || !process.connected) { stop(); return; }
  process.send('READY', error => { if (error) stop(); });
});
