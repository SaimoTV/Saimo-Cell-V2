const { test } = require('node:test');
const assert = require('node:assert/strict');
const { interpretarVersao, urlDeDownloadPermitida, URL_VERSAO } = require('../services/atualizacao.ts');

const ok = 'https://github.com/dono/repo/releases/download/v2.4.0/SaimoCell.apk';
const json = (extra = {}) => ({
  versao: '2.4.0', tag: 'v2.4.0', notas: '**Novo**\n- item',
  arquivos: { celular: { nome: 'SaimoCell.apk', url: ok, bytes: 10, sha256: 'A'.repeat(64) }, ...extra },
});

test('interpreta versao.json do celular', () => {
  const r = interpretarVersao(json());
  assert.equal(r.version, '2.4.0');
  assert.equal(r.url, ok);
  assert.equal(r.sha256, 'a'.repeat(64));
  assert.equal(r.notas, 'Novo\n• item');
});

test('versao.json inválido ou sem celular vira null', () => {
  for (const x of [null, undefined, 'x', {}, { versao: '2.4.0' }, { versao: 'abc', arquivos: { celular: { url: ok } } },
    { versao: '2.4.0', arquivos: { tvbox: { url: ok } } }]) assert.equal(interpretarVersao(x), null);
});

test('allowlist de download', () => {
  assert.ok(urlDeDownloadPermitida(ok));
  assert.ok(urlDeDownloadPermitida('https://objects.githubusercontent.com/x/y'));
  assert.ok(urlDeDownloadPermitida('https://release-assets.githubusercontent.com/x'));
  for (const u of ['http://github.com/a/b/releases/download/v1/x.apk',
    'https://github.com.evil.com/a/b/releases/download/v1/x.apk',
    'https://evilgithub.com/a/b/releases/download/v1/x.apk',
    'https://github.com@evil.com/a/b/releases/download/v1/x.apk',
    'https://evil.com/objects.githubusercontent.com',
    'https://objects.githubusercontent.com.evil.com/x',
    'https://github.com/a/b/raw/main/x.apk', 'https://github.com/a/releases/download/v1/x', 'ftp://github.com/a/b/releases/download/v1/x', '', null])
    assert.equal(urlDeDownloadPermitida(u), false, String(u));
  assert.equal(interpretarVersao(json({ celular: { url: 'https://evil.com/a.apk' } })), null);
});

test('sha256 malformado é ignorado', () => {
  const j = json(); j.arquivos.celular.sha256 = 'zz';
  assert.equal(interpretarVersao(j).sha256, '');
});

test('endereço de atualização é um só e fixo', () => {
  assert.equal(URL_VERSAO, 'https://canais-saimo.pages.dev/versao.json');
});
