const { test } = require('node:test');
const assert = require('node:assert/strict');
const X = require('../services/xtream.ts');
// Leitor mínimo só para o teste do reserva (o de verdade é testado à parte).
const lerM3U = (t) => t.split('\n').filter(l => l.startsWith('#EXTINF')).map(l => ({ nome: l.split(',').pop(), grupo: 'G', logo: null, fontes: [] }));

test('servidor sem esquema ganha http, perde barra e arquivo', () => {
  assert.equal(X.normalizarServidor('exemplo.dev:8080'), 'http://exemplo.dev:8080');
  assert.equal(X.normalizarServidor('  http://exemplo.dev:8080/  '), 'http://exemplo.dev:8080');
  assert.equal(X.normalizarServidor('http://exemplo.dev:8080/get.php'), 'http://exemplo.dev:8080');
  assert.equal(X.normalizarServidor('HTTPS://EXEMPLO.dev/player_api.php'), 'https://exemplo.dev');
  assert.equal(X.normalizarServidor('http://exemplo.dev/painel/'), 'http://exemplo.dev/painel');
  assert.equal(X.normalizarServidor('10.0.2.2:8765'), 'http://10.0.2.2:8765');
});

test('servidor inválido', () => {
  for (const ruim of ['', '   ', 'ftp://x.dev', 'http://', 'a b.dev', 'http://x.dev:abc', 'http://u@x.dev', 'http://:80']) {
    assert.equal(X.normalizarServidor(ruim), null, ruim);
  }
});

test('reconhece o link de conta e monta as URLs', () => {
  const c = X.deLink('http://exemplo.dev:8080/get.php?username=ana&password=s%40nha&type=m3u_plus&output=ts');
  assert.deepEqual(c, { base: 'http://exemplo.dev:8080', usuario: 'ana', senha: 's@nha' });
  assert.equal(X.urlCanal(c, '12', 'm3u8'), 'http://exemplo.dev:8080/live/ana/s%40nha/12.m3u8');
  assert.equal(X.urlFilme(c, '7', 'mp4'), 'http://exemplo.dev:8080/movie/ana/s%40nha/7.mp4');
  assert.equal(X.urlEpisodio(c, '9', 'mkv'), 'http://exemplo.dev:8080/series/ana/s%40nha/9.mkv');
  assert.deepEqual(X.deLink(X.linkM3u(c)), c);
});

test('link comum não é conta', () => {
  assert.equal(X.deLink('https://exemplo.dev/lista.m3u'), null);
  assert.equal(X.deLink('https://exemplo.dev/get.php?username=ana'), null);
  assert.equal(X.deLink('https://exemplo.dev/get.php?username=&password=x'), null);
  assert.equal(X.deLink('lixo'), null);
});

test('entrada da conta', () => {
  assert.equal(X.verificarEntrada('{"user_info":{"auth":1,"status":"Active","exp_date":"4102444800"}}'), '');
  assert.equal(X.verificarEntrada('{"user_info":{"auth":"1","status":"Active","exp_date":null}}'), '');
  assert.equal(X.verificarEntrada('{"user_info":{"auth":0}}'), 'Usuário ou senha incorretos');
  assert.match(X.verificarEntrada('{"user_info":{"auth":1,"status":"Expired"}}'), /não está ativa/);
  assert.equal(X.verificarEntrada('{"user_info":{"auth":1,"status":"Active","exp_date":"1000"}}'), 'Essa conta venceu');
  assert.equal(X.verificarEntrada('<html>painel</html>'), X.SEM_API);
  assert.equal(X.verificarEntrada('{"outra":"coisa"}'), X.SEM_API);
});

test('canais da API: categorias, duas fontes, nome repetido', () => {
  const conta = { base: 'http://s.dev:80', usuario: 'u', senha: 'p' };
  const cats = '[{"category_id":"1","category_name":"Abertos"},{"category_id":"3","category_name":"Adultos +18"}]';
  const streams = JSON.stringify([
    { stream_id: 10, name: 'Globo', stream_icon: 'http://img/globo.png', category_id: '1' },
    { stream_id: 11, name: 'Globo', stream_icon: '', category_id: '1' },
    { stream_id: 12, name: 'Canal XXX', stream_icon: '', category_id: '3' },
    { stream_id: 13, name: 'Sem categoria', category_id: '99' },
    { name: 'Sem id' },
  ]);
  const canais = X.canaisDaApi(conta, streams, cats);
  assert.deepEqual(canais.map(c => c.nome), ['Globo', 'Canal XXX', 'Sem categoria']);
  assert.equal(canais[0].grupo, 'Abertos');
  assert.equal(canais[0].logo, 'http://img/globo.png');
  assert.deepEqual(canais[0].fontes.map(f => f.url), [
    'http://s.dev:80/live/u/p/10.m3u8', 'http://s.dev:80/live/u/p/10.ts',
    'http://s.dev:80/live/u/p/11.m3u8', 'http://s.dev:80/live/u/p/11.ts']);
  assert.equal(canais[2].grupo, null);
  assert.deepEqual(X.canaisDaApi(conta, 'lixo', '[]'), []);
});

test('fluxo: API boa, conta recusada, sem API cai no M3U', async () => {
  const conta = { base: 'http://s.dev', usuario: 'u', senha: 'p' };
  const api = (corpos) => async (url) => {
    for (const [trecho, resp] of corpos) if (url.includes(trecho)) { if (resp instanceof Error) throw resp; return resp; }
    throw new Error('sem rota ' + url);
  };
  const boa = await X.canaisXtream(conta, api([
    ['action=get_live_categories', '[{"category_id":"1","category_name":"A"}]'],
    ['action=get_live_streams', '[{"stream_id":1,"name":"Canal 1","category_id":"1"}]'],
    ['player_api.php?username=u&password=p', '{"user_info":{"auth":1,"status":"Active"}}'],
  ]), lerM3U);
  assert.equal(boa[0].nome, 'Canal 1');
  await assert.rejects(X.canaisXtream(conta, api([['player_api.php', '{"user_info":{"auth":0}}']]), lerM3U), /incorretos/);
  const m3u = await X.canaisXtream(conta, api([
    ['get.php', '#EXTM3U\n#EXTINF:-1 group-title="G",Canal M\nhttp://s.dev/live/u/p/5\n'],
    ['player_api.php', '<html>'],
  ]), lerM3U);
  assert.equal(m3u[0].nome, 'Canal M');
  await assert.rejects(X.canaisXtream(conta, api([['player_api.php', new Error('rede')], ['get.php', new Error('rede')]]), lerM3U), /falar com o servidor/);
});
