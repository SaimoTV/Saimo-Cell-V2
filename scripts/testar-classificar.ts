// Confere services/classificar.ts com o gabarito comum (SaimoPlayer/docs/exemplos/listas).
//   npx --yes tsx scripts/testar-classificar.ts
import { tipo, tituloDoFilme, tituloDaSerie } from '../services/classificar';
declare const require: (m: string) => any;
declare const process: { exit(c: number): never };
declare const __dirname: string;
const fs = require('fs');
const texto = fs.readFileSync(__dirname + '/testes/classificar.m3u', 'utf8');
const esperado = JSON.parse(fs.readFileSync(__dirname + '/testes/classificar.esperado.json', 'utf8'));
const attr = (l: string, n: string) => (new RegExp(`${n}="([^"]*)"`).exec(l)?.[1] ?? '').trim();
let pend = '', i = 0, falhas = 0;
for (const bruta of texto.split('\n')) {
  const linha = bruta.trim();
  if (linha.startsWith('#EXTINF')) { pend = linha; continue; }
  if (!linha || linha.startsWith('#')) continue;
  const k = pend.lastIndexOf('",');
  const nome = (k >= 0 ? pend.slice(k + 2) : pend.slice(pend.indexOf(',') + 1)).trim();
  const grupo = attr(pend, 'group-title');
  const declarado = attr(pend, 'tvg-type') || attr(pend, 'type');
  const t = tipo(linha, nome, grupo, declarado);
  let obtido: Record<string, unknown> = { tipo: t.tipo, nome };
  if (t.tipo === 'filme') obtido = { ...obtido, ...tituloDoFilme(nome, grupo) };
  if (t.tipo === 'episodio') obtido = { ...obtido, ...tituloDaSerie(nome, t.marca.inicio, grupo), temporada: t.marca.temporada, episodio: t.marca.episodio };
  const e = esperado[i];
  const igual = Object.keys(e).length === Object.keys(obtido).length && Object.keys(e).every(c => String(e[c]) === String(obtido[c]));
  if (!igual) { falhas++; console.log('ERRO', i, JSON.stringify(e), JSON.stringify(obtido)); }
  i++;
}
if (i !== esperado.length) { falhas++; console.log('ERRO: itens', i, esperado.length); }
console.log(falhas ? `classificar: ${falhas} falha(s)` : 'classificar: tudo certo');
process.exit(falhas ? 1 : 0);
