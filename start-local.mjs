import { startDesktopSession, findChrome } from './desktop-session.mjs';
import { fileURLToPath } from 'node:url';
if (process.platform !== 'darwin') throw Error('The supported launcher requires macOS with Google Chrome.');
const dataDir = fileURLToPath(new URL('.local/', import.meta.url));
const providerId = process.argv.find(arg => arg.startsWith('--provider='))?.slice(11) || 'apple';
let session;
let starting;
async function stop() {
  const active = session || await starting?.catch(() => null);
  try { if (active) await active.stop(); }
  catch { console.error('Automatic browser closure could not be confirmed. Manually close every dedicated recovery window before reconnecting.'); process.exit(1); }
  process.exit(0);
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
starting = (async () => startDesktopSession({ dataDir, providerId, chromePath: await findChrome(), status(code) {
  const messages = { READY: 'Provider setup ready. Keep this launcher open. Press Ctrl+C to stop.', OFFLINE: 'Public lookup stopped. Disconnect internet before using the passkey.', PROVIDER_READY: 'Public lookup stopped. Provider authentication may use internet; the NEAR key stays on this device.', BROWSER_CLOSED: 'Dedicated browser closed. Press Ctrl+C to end this session.', RECOVERY_PORT_BUSY: 'Recovery port 8443 is already in use. Close the other recovery session or application using it, then click Prepare recovery again.', PREPARE_FAILED: 'The recovery page could not start. Stop and reopen Recovery, then try again.', CLEANUP_FAILED: 'Automatic browser closure could not be confirmed. Manually close every dedicated recovery window before reconnecting.' };
  if (messages[code]) console.log(messages[code]);
} }))();
try { session = await starting; }
catch (error) { console.error(error.code === 'EADDRINUSE' ? 'A recovery port is already in use. Close the other session.' : 'Recovery could not start. Check Chrome and the selected provider.'); process.exit(1); }
