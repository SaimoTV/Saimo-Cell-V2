const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizarLink, LINK_CANAIS_PADRAO, LINK_FILMES_PADRAO } = require('../utils/links.ts');

test('exemplos do contrato', () => {
  assert.equal(normalizarLink('saimo-canais.pages.dev'), 'https://saimo-canais.pages.dev/');
  assert.equal(normalizarLink('https://x.dev/listas/catalogo.txt'), 'https://x.dev/listas/');
});

test('vazio é sem endereço', () => {
  for (const v of ['', '   ', null, undefined, '\n']) assert.equal(normalizarLink(v), '');
});

test('esquema: só http e https', () => {
  assert.equal(normalizarLink('http://10.0.2.2:8101'), 'http://10.0.2.2:8101/');
  assert.equal(normalizarLink('HTTPS://x.dev'), 'https://x.dev/');
  for (const v of ['ftp://x.dev/', 'file:///etc/passwd', 'javascript://x', 'ws://x.dev']) assert.equal(normalizarLink(v), null, v);
});

test('inválidos: espaço no meio e host vazio', () => {
  for (const v of ['x .dev', 'https://x.dev/a b/', 'https://', 'https:///pasta/', 'http://:8080/', '://x.dev', '/pasta']) {
    assert.equal(normalizarLink(v), null, v);
  }
});

test('tira query e fragmento', () => {
  assert.equal(normalizarLink('https://x.dev/a/?t=1#topo'), 'https://x.dev/a/');
  assert.equal(normalizarLink('x.dev?a=b'), 'https://x.dev/');
  assert.equal(normalizarLink('https://x.dev/a/catalogo.txt?v=2#x'), 'https://x.dev/a/');
});

test('último trecho com ponto é arquivo e sai', () => {
  assert.equal(normalizarLink('https://x.dev/indice.txt'), 'https://x.dev/');
  assert.equal(normalizarLink('https://x.dev/vod/x.json'), 'https://x.dev/vod/');
  assert.equal(normalizarLink('https://x.dev/vod'), 'https://x.dev/vod/');
  assert.equal(normalizarLink('https://x.dev/v1.2/'), 'https://x.dev/v1.2/');
  assert.equal(normalizarLink('  https://x.dev/vod/  '), 'https://x.dev/vod/');
});

test('é idempotente', () => {
  for (const v of ['saimo-canais.pages.dev', 'https://x.dev/listas/catalogo.txt', 'http://10.0.2.2:8102']) {
    const n = normalizarLink(v);
    assert.equal(normalizarLink(n), n);
  }
});

test('endereços de fábrica já estão normalizados', () => {
  assert.equal(LINK_CANAIS_PADRAO, 'https://canais-saimo.pages.dev/');
  assert.equal(LINK_FILMES_PADRAO, 'https://filmes-saimo.pages.dev/');
  assert.equal(normalizarLink(LINK_CANAIS_PADRAO), LINK_CANAIS_PADRAO);
  assert.equal(normalizarLink(LINK_FILMES_PADRAO), LINK_FILMES_PADRAO);
});
