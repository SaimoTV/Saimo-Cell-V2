/**
 * Saimo Connect com TVs Samsung e LG.
 *
 * O app dessas TVs é web e não pode abrir porta. Então aqui o celular abre a
 * porta 8999 e a TV se liga a ele (ws://<celular>:8999/tv). Para a TV saber o
 * endereço, o celular abre o Saimo nela pelo controle oficial da marca:
 * - LG webOS: protocolo SSAP (ws://tv:3000); na primeira vez a TV pergunta
 *   "Permitir?" e a chave fica guardada;
 * - Samsung Tizen: controle remoto por WebSocket (ws://tv:8001); na primeira vez a
 *   TV pergunta "Permitir?" e o token fica guardado.
 * O Saimo abre na TV com `saimoConnect=<ip do celular>:8999` e se liga sozinho.
 *
 * `abrirTvReversa` devolve um objeto com a mesma cara de um WebSocket (readyState,
 * send, close, onopen/onmessage/onclose/onerror): o resto do Connect não muda.
 * Nada passa pela nuvem: só a rede de casa.
 */
import TcpSocket from 'react-native-tcp-socket';
import { Buffer } from 'buffer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';

export const PORTA_CELULAR = 8999;
export type MarcaTv = 'lg' | 'samsung';

const APP_LG = 'br.com.saimo.tv';
const APP_SAMSUNG = 'SaimoTV001.SaimoTV';
const CHAVE_LG = '@saimo_connect_lg_chave_';
const CHAVE_SAMSUNG = '@saimo_connect_samsung_token_';

// ---------- SHA-1 (só para o aperto de mão do WebSocket) ----------
function sha1(bytes: Uint8Array): Uint8Array {
  const ml = bytes.length * 8;
  const n = ((bytes.length + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(n);
  m.set(bytes);
  m[bytes.length] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(n - 4, ml >>> 0);
  dv.setUint32(n - 8, Math.floor(ml / 2 ** 32));
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let i = 0; i < n; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4);
    for (let t = 16; t < 80; t++) { const x = w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16]; w[t] = (x << 1) | (x >>> 31); }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let t = 0; t < 80; t++) {
      const f = t < 20 ? (b & c) | (~b & d) : t < 40 ? b ^ c ^ d : t < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
      const k = t < 20 ? 0x5a827999 : t < 40 ? 0x6ed9eba1 : t < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const tmp = (((a << 5) | (a >>> 27)) + f + e + k + w[t]) >>> 0;
      e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = tmp;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const o = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((v, i) => o.setUint32(i * 4, v));
  return out;
}

function aceite(chave: string): string {
  return Buffer.from(sha1(Buffer.from(chave + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11', 'utf8'))).toString('base64');
}

function quadroTexto(texto: string): Buffer {
  const p = Buffer.from(texto, 'utf8');
  let cab: Buffer;
  if (p.length < 126) cab = Buffer.from([0x81, p.length]);
  else if (p.length < 65536) cab = Buffer.from([0x81, 126, p.length >> 8, p.length & 255]);
  else {
    cab = Buffer.alloc(10);
    cab[0] = 0x81; cab[1] = 127;
    cab.writeUInt32BE(Math.floor(p.length / 2 ** 32), 2);
    cab.writeUInt32BE(p.length >>> 0, 6);
  }
  return Buffer.concat([cab, p]);
}

type Socket = ReturnType<typeof TcpSocket.createConnection>;

/** Uma TV ligada na porta do celular, com a cara de um WebSocket. */
class TvReversa {
  readyState = 0; // CONNECTING
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  socket: Socket | null = null;
  private resto = Buffer.alloc(0);
  private pedaco: Buffer[] = [];
  ip: string;
  constructor(ip: string) { this.ip = ip; }

  ligar(socket: Socket, sobra: Buffer) {
    this.socket = socket;
    socket.on('data', (d) => this.receber(Buffer.from(d as Buffer)));
    socket.on('close', () => this.fechou());
    socket.on('error', () => this.fechou());
    if (sobra.length) this.receber(sobra);
  }

  private receber(d: Buffer) {
    this.resto = Buffer.concat([this.resto, d]);
    for (;;) {
      const b = this.resto;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0;
      const op = b[0] & 0x0f;
      const mascarado = (b[1] & 0x80) !== 0;
      let n = b[1] & 0x7f;
      let o = 2;
      if (n === 126) { if (b.length < 4) return; n = b.readUInt16BE(2); o = 4; }
      else if (n === 127) { if (b.length < 10) return; n = b.readUInt32BE(6); o = 10; }
      const mascara = mascarado ? b.slice(o, o + 4) : null;
      if (mascarado) o += 4;
      if (b.length < o + n) return;
      const dados = Buffer.from(b.slice(o, o + n));
      if (mascara) for (let i = 0; i < dados.length; i++) dados[i] ^= mascara[i % 4];
      this.resto = b.slice(o + n);
      if (op === 8) { this.close(); return; }
      if (op === 9) { this.socket?.write(Buffer.concat([Buffer.from([0x8a, dados.length]), dados])); continue; }
      if (op === 1 || op === 0) {
        this.pedaco.push(dados);
        if (!fin) continue;
        const texto = Buffer.concat(this.pedaco).toString('utf8');
        this.pedaco = [];
        this.mensagem(texto);
      }
    }
  }

  private mensagem(texto: string) {
    // A TV se apresenta primeiro (tvhello); só então o Connect manda o hello dele.
    if (this.readyState === 0) {
      try {
        if (JSON.parse(texto)?.t === 'tvhello') {
          this.readyState = 1;
          this.onopen?.();
          return;
        }
      } catch { /* segue */ }
    }
    this.onmessage?.({ data: texto });
  }

  send(texto: string) {
    if (this.readyState !== 1 || !this.socket) throw new Error('fechado');
    this.socket.write(quadroTexto(texto));
  }

  /** Fechar de verdade (mesmo antes de a TV se apresentar). */
  desistiu = false;

  close() {
    if (this.readyState === 3) return;
    this.desistiu = true;
    try { this.socket?.write(Buffer.from([0x88, 0])); } catch { /* já fechado */ }
    try { this.socket?.destroy(); } catch { /* já fechado */ }
    this.fechou();
  }

  private fechou() {
    if (this.readyState === 3) return;
    // Caiu antes de a TV se apresentar: continua esperando ela tentar de novo.
    if (this.readyState === 0 && !this.desistiu) {
      this.socket = null;
      this.resto = Buffer.alloc(0);
      this.pedaco = [];
      return;
    }
    const estava = this.readyState;
    this.readyState = 3;
    esperando.delete(this.ip);
    if (estava !== 3) this.onclose?.();
  }
}

// ---------- a porta do celular ----------
let servidor: ReturnType<typeof TcpSocket.createServer> | null = null;
/** TVs que o celular mandou abrir e ainda não ligaram (por IP). */
const esperando = new Map<string, TvReversa>();

function garantirServidor(): void {
  if (servidor) return;
  const s = TcpSocket.createServer((socket) => {
    let cab = Buffer.alloc(0);
    const aoDado = (d: Buffer | string) => {
      cab = Buffer.concat([cab, Buffer.from(d as Buffer)]);
      const fim = cab.indexOf('\r\n\r\n');
      if (fim < 0) { if (cab.length > 8192) socket.destroy(); return; }
      socket.removeListener('data', aoDado);
      const texto = cab.slice(0, fim).toString('latin1');
      const sobra = cab.slice(fim + 4);
      const ip = String((socket as unknown as { remoteAddress?: string }).remoteAddress ?? '').replace('::ffff:', '');
      const chave = /sec-websocket-key:\s*(\S+)/i.exec(texto)?.[1];
      const caminho = /^GET\s+(\S+)/.exec(texto)?.[1] ?? '';
      if (!chave || !caminho.startsWith('/tv')) {
        // A TV procurando celular na rede: diz quem é.
        socket.write('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{"app":"saimo-celular"}');
        socket.destroy();
        return;
      }
      // Só entra a TV que este celular mandou abrir (ou a última que já ligou).
      const alvo = esperando.get(ip);
      if (!alvo) { socket.destroy(); return; }
      socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${aceite(chave)}\r\n\r\n`);
      alvo.ligar(socket as unknown as Socket, sobra);
    };
    socket.on('data', aoDado);
    socket.on('error', () => {});
  });
  s.on('error', () => { servidor = null; });
  s.listen({ port: PORTA_CELULAR, host: '0.0.0.0', reuseAddress: true });
  servidor = s;
}

export function pararServidor(): void {
  esperando.forEach((t) => t.close());
  esperando.clear();
  try { servidor?.close(); } catch { /* já fechado */ }
  servidor = null;
}

// ---------- abrir o Saimo na TV ----------
function abrirWs(url: string, prazoMs: number): Promise<WebSocket> {
  return new Promise((ok, falha) => {
    const ws = new WebSocket(url);
    const t = setTimeout(() => { try { ws.close(); } catch { /* */ } falha(new Error('prazo')); }, prazoMs);
    ws.onopen = () => { clearTimeout(t); ok(ws); };
    ws.onerror = () => { clearTimeout(t); falha(new Error('erro')); };
  });
}

const MANIFESTO_LG = {
  manifestVersion: 1,
  appVersion: '1.0',
  permissions: ['LAUNCH', 'LAUNCH_WEBAPP', 'APP_TO_APP', 'CONTROL_INPUT_TEXT', 'CONTROL_MOUSE_AND_KEYBOARD', 'READ_INSTALLED_APPS'],
};

/** LG: pede licença (só na primeira vez) e abre o Saimo com o endereço do celular. */
async function abrirNaLg(tvIp: string, endereco: string): Promise<void> {
  const ws = await abrirWs(`ws://${tvIp}:3000`, 4000);
  const chave = await AsyncStorage.getItem(CHAVE_LG + tvIp).catch(() => null);
  await new Promise<void>((ok, falha) => {
    // Até 60 s: a pessoa precisa aceitar na TV na primeira vez.
    const prazo = setTimeout(() => falha(new Error('sem resposta da TV')), 60000);
    ws.onmessage = (e) => {
      let m: { type?: string; id?: string; payload?: Record<string, unknown> };
      try { m = JSON.parse(String(e.data)); } catch { return; }
      if (m.type === 'registered') {
        const nova = m.payload?.['client-key'];
        if (typeof nova === 'string') void AsyncStorage.setItem(CHAVE_LG + tvIp, nova).catch(() => {});
        ws.send(JSON.stringify({
          type: 'request', id: 'abrir', uri: 'ssap://system.launcher/launch',
          payload: { id: APP_LG, params: { saimoConnect: endereco } },
        }));
      } else if (m.id === 'abrir') {
        clearTimeout(prazo);
        if (m.type === 'error') falha(new Error(String(m.payload?.errorText ?? 'o Saimo não está instalado nesta TV')));
        else ok();
      } else if (m.type === 'error' && m.id === 'registro') {
        clearTimeout(prazo);
        falha(new Error('a TV recusou'));
      }
    };
    ws.send(JSON.stringify({
      type: 'register', id: 'registro',
      payload: { forcePairing: false, pairingType: 'PROMPT', manifest: MANIFESTO_LG, ...(chave ? { 'client-key': chave } : {}) },
    }));
  }).finally(() => { try { ws.close(); } catch { /* */ } });
}

/** Samsung: pede licença (só na primeira vez) e abre o Saimo com o endereço do celular. */
async function abrirNaSamsung(tvIp: string, endereco: string): Promise<void> {
  const token = await AsyncStorage.getItem(CHAVE_SAMSUNG + tvIp).catch(() => null);
  const nome = Buffer.from('Saimo TV (celular)', 'utf8').toString('base64');
  const url = `ws://${tvIp}:8001/api/v2/channels/samsung.remote.control?name=${nome}${token ? `&token=${token}` : ''}`;
  const ws = await abrirWs(url, 4000);
  await new Promise<void>((ok, falha) => {
    const prazo = setTimeout(() => falha(new Error('sem resposta da TV')), 60000);
    ws.onmessage = (e) => {
      let m: { event?: string; data?: Record<string, unknown> };
      try { m = JSON.parse(String(e.data)); } catch { return; }
      if (m.event === 'ms.channel.connect') {
        const novo = m.data?.token;
        if (typeof novo === 'string') void AsyncStorage.setItem(CHAVE_SAMSUNG + tvIp, novo).catch(() => {});
        ws.send(JSON.stringify({
          method: 'ms.channel.emit',
          params: {
            event: 'ed.apps.launch', to: 'host',
            data: { appId: APP_SAMSUNG, action_type: 'DEEP_LINK', metaTag: `saimoConnect=${endereco}` },
          },
        }));
        // A TV não responde ao pedido de abrir: dá um tempo e segue.
        setTimeout(() => { clearTimeout(prazo); ok(); }, 1500);
      } else if (m.event === 'ms.channel.unauthorized') {
        clearTimeout(prazo);
        falha(new Error('a TV recusou'));
      }
    };
  }).finally(() => { try { ws.close(); } catch { /* */ } });
}

/**
 * Abre o Saimo na TV e espera ela ligar na porta do celular. Devolve na hora um
 * objeto tipo WebSocket; `onopen` dispara quando a TV entrar.
 */
export function abrirTvReversa(tvIp: string, marca: MarcaTv, ipDoCelular: string, aoFalhar: (motivo: string) => void): TvReversa {
  garantirServidor();
  esperando.get(tvIp)?.close();
  const tv = new TvReversa(tvIp);
  esperando.set(tvIp, tv);
  const abrir = marca === 'lg' ? abrirNaLg : abrirNaSamsung;
  (async () => {
    const ip = ipDoCelular || (await Network.getIpAddressAsync().catch(() => ''));
    if (!ip) throw new Error('sem rede Wi-Fi');
    await abrir(tvIp, `${ip}:${PORTA_CELULAR}`);
  })().catch((e: Error) => aoFalhar(e.message));
  // A TV tem 45 s para abrir o app e ligar.
  setTimeout(() => { if (tv.readyState === 0) { aoFalhar('a TV não respondeu'); tv.close(); } }, 45000);
  return tv;
}

/** É uma TV LG ou Samsung (com o controle pela rede ligado)? */
export async function marcaDaTv(ip: string, prazoMs = 800): Promise<{ marca: MarcaTv; nome: string } | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), prazoMs);
  try {
    const r = await fetch(`http://${ip}:8001/api/v2/`, { signal: c.signal });
    clearTimeout(t);
    if (r.ok) {
      const j = await r.json();
      const nome = j?.device?.name || j?.name;
      if (/samsung/i.test(JSON.stringify(j?.device?.type ?? j?.type ?? ''))) return { marca: 'samsung', nome: nome ? String(nome) : 'TV Samsung' };
    }
  } catch { clearTimeout(t); }
  try {
    const ws = await abrirWs(`ws://${ip}:3000`, prazoMs);
    try { ws.close(); } catch { /* */ }
    return { marca: 'lg', nome: 'TV LG' };
  } catch {
    return null;
  }
}
