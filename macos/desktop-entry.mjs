import { join } from 'node:path';
import { startDesktopSession, findChrome } from '../desktop-session.mjs';
import { homedir } from 'node:os';
const providerId = process.argv.find(arg => arg.startsWith('--provider='))?.slice(11) || 'apple';
const dataDir = join(homedir(), 'Library/Application Support/Bitte Local Recovery');
let session;
let stopping = false;
let starting;
async function stop() {
  stopping = true;
  const active = session || await starting?.catch(() => null);
  try { if (active) await active.stop(); }
  catch { console.log('CLEANUP_FAILED'); process.exit(1); }
  process.exit(0);
}
process.stdin.resume();
process.stdin.on('end', () => void stop());
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
starting = (async () => startDesktopSession({ dataDir, providerId, chromePath: await findChrome(), status: code => console.log(code) }))();
try {
  session = await starting;
  if (stopping) await stop();
} catch (error) {
  // Only fixed messages/codes go to the launcher. No request or browser logging.
  console.log(error.code === 'EADDRINUSE' ? 'PORT_BUSY' : error.message.startsWith('Install Google Chrome') ? 'CHROME_MISSING' : 'START_FAILED');
  process.exit(1);
}
