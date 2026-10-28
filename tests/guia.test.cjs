const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseGuia, normalizarNomeDoGuia } = require('../utils/guia.ts');

const texto = [
  '# comentário',
  '',
  'meuguia\tGlobo SP\tGRD',
  'meuguia\tHBO\tHBO',
  'guiadetv\tA&E\tae',
  'guiadetv\tglobo rj\tglobo-rio-de-janeiro',
  'alias\tSony Channel\tsony',
  'alias\tCNN Brasil Money\tcnn brasil money hd br',
  'feed\t-\thttps://feed.exemplo/a.xml',
  'feed\t-\thttps://feed.exemplo/b.xml',
  'feed\t-\thttps://feed.exemplo/a.xml',
  'feed\t-\tnao-e-url',
  'pluto\t-\thttps://pluto.exemplo/br.xml',
  'pluto\t-\thttps://outro.exemplo/br.xml',
  'meuguia\tsem codigo',
  'tipo-desconhecido\tx\ty',
  '',
].join('\r\n');

test('lê as cinco tabelas', () => {
  const t = parseGuia(texto);
  assert.equal(t.meuguia.get('Globo SP'), 'GRD');
  assert.equal(t.meuguia.size, 2);
  assert.equal(t.guiadetv.get('a e'), 'ae');
  assert.equal(t.guiadetv.get('globo rj'), 'globo-rio-de-janeiro');
  assert.equal(t.alias.get('sony channel'), 'sony');
  assert.equal(t.alias.get('cnn brasil money'), 'cnn brasil money hd br');
  assert.deepEqual(t.feeds, ['https://feed.exemplo/a.xml', 'https://feed.exemplo/b.xml']);
  assert.equal(t.pluto, 'https://pluto.exemplo/br.xml');
});

test('vazio ou lixo dá tabelas vazias', () => {
  for (const x of ['', '# só comentário', 'lixo sem tab', null, undefined]) {
    const t = parseGuia(x);
    assert.equal(t.meuguia.size + t.guiadetv.size + t.alias.size + t.feeds.length, 0);
    assert.equal(t.pluto, '');
  }
});

test('normaliza nomes como o serviço de guia', () => {
  assert.equal(normalizarNomeDoGuia('BR - Globo São Paulo'), 'globo sao paulo');
  assert.equal(normalizarNomeDoGuia('A&E'), 'a e');
});
