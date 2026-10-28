// Uso: npx --yes tsx scripts/testar-minhas-listas.ts [pasta com edge.m3u, br.m3u e os .golden.json]
// Sai com código 1 se o leitor divergir do gabarito.
import { lerM3U, ehRestrito, pareceM3U } from '../services/minhasListasLeitor';
declare const require: (m: string) => any;
declare const process: { argv: string[]; exit(c: number): never };
const fs = require('fs');
const path = require('path');

const pasta = process.argv[2] ?? '/private/tmp/claude-501/-Volumes-SSD-1TB-DEV-Saimo-SaimoPlayer/c5ddbfb0-60d8-4a33-a367-79cbdbb1be68/scratchpad/m3u';
let falhas = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? 'OK   ' : 'FALHOU ') + msg); if (!c) falhas++; };

for (const n of ['edge', 'br']) {
  const m3u = fs.readFileSync(path.join(pasta, `${n}.m3u`), 'utf-8');
  const ouro = JSON.parse(fs.readFileSync(path.join(pasta, `${n}.golden.json`), 'utf-8'));
  const meu = lerM3U(m3u);
  ok(JSON.stringify(meu) === JSON.stringify(ouro), `${n}: ${meu.length} canais iguais ao gabarito (${ouro.length})`);
}

// Lixo, vazio, linha enorme.
let lixo = '';
for (let i = 0; i < 5000; i++) lixo += String.fromCharCode((i * 7919) % 256);
ok(lerM3U('').length === 0, 'arquivo vazio');
ok(lerM3U(lixo).length === 0, 'lixo binario');
ok(lerM3U('#EXTINF:-1,' + 'a'.repeat(1_000_000) + '\nnao e url').length === 0, 'linha de 1 MB sem endereco');
ok(lerM3U('#EXTINF:-1,' + 'a'.repeat(1_000_000) + '\nhttp://x/y.m3u8').length === 1, 'linha de 1 MB com endereco');
ok(lerM3U(undefined as unknown as string).length === 0, 'indefinido');
ok(pareceM3U('<html>') === false && pareceM3U('﻿  #EXTM3U') && pareceM3U('x\n#EXTINF:-1,a'), 'pareceM3U');

// Restritos.
for (const [n, g, esperado] of [
  ['Adult Swim', null, false], ['Adult Swim Brasil', 'Desenhos', false], ['Adult Movies', null, true],
  ['Canal', 'XXX', true], ['Canal', 'Adulto', true], ['Canal', '+18', true], ['Canal 18+', null, true],
  ['Hentai TV', null, true], ['Erótico', null, true], ['Sexo e a Cidade', null, true],
  ['Sextou', null, false], ['Globo', 'Abertos', false], ['Essex', null, false],
] as [string, string | null, boolean][]) {
  ok(ehRestrito(n, g) === esperado, `restrito(${n}, ${g}) = ${esperado}`);
}
process.exit(falhas ? 1 : 0);
