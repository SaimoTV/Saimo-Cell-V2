import { Platform } from 'react-native';
import TcpSocket from 'react-native-tcp-socket';

const PORT = 18765;
let license = '{"keys":[],"type":"temporary"}';
let server: ReturnType<typeof TcpSocket.createServer> | null = null;
let starting: Promise<void> | null = null;

function base64UrlFromHex(hex: string): string {
  const clean = hex.replace(/-/g, '').trim();
  if (!/^[0-9a-f]+$/i.test(clean) || clean.length % 2 !== 0) return '';
  let binary = '';
  for (let index = 0; index < clean.length; index += 2) {
    binary += String.fromCharCode(Number.parseInt(clean.slice(index, index + 2), 16));
  }
  return globalThis.btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function ensureServer(): Promise<void> {
  if (server?.listening) return Promise.resolve();
  if (starting) return starting;
  starting = new Promise(resolve => {
    const next = TcpSocket.createServer(socket => {
      socket.once('data', () => {
        const response =
          'HTTP/1.1 200 OK\r\n' +
          'Content-Type: application/json\r\n' +
          `Content-Length: ${license.length}\r\n` +
          'Cache-Control: no-store\r\n' +
          'Connection: close\r\n\r\n' +
          license;
        socket.end(response);
      });
      socket.on('error', () => socket.destroy());
    });
    next.once('listening', () => {
      server = next;
      starting = null;
      resolve();
    });
    next.once('error', error => {
      console.warn('[ClearKey] servidor local indisponível:', error);
      starting = null;
      resolve();
    });
    next.listen({ port: PORT, host: '127.0.0.1', reuseAddress: true });
  });
  return starting;
}

/**
 * Entrega ao ExoPlayer a licença W3C ClearKey que já veio no catálogo.
 * O servidor aceita POST porque react-native-video não expõe LocalMediaDrmCallback.
 */
export async function configureClearKey(clearKey: string): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  const [kidHex, keyHex] = clearKey.split(':').map(value => value.trim());
  const kid = base64UrlFromHex(kidHex || '');
  const key = base64UrlFromHex(keyHex || '');
  if (!kid || !key) return null;
  license = JSON.stringify({ keys: [{ kty: 'oct', kid, k: key }], type: 'temporary' });
  await ensureServer();
  return `http://127.0.0.1:${PORT}/clearkey`;
}
