const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ErroAddon,
  normalizarUrlAddon,
  construirUrlRecursoAddon,
  detectarPluginNuvioJS,
  validarManifestoAddon,
  addonSuportaRecurso,
  escolherIdParaAddon,
  classificarStreamAddon,
  selecionarStreamPorBingeGroup,
  selecionarFontePorBingeGroup,
  mesclarHeadersReproducao,
} = require('../services/addonsCore.ts');

const {
  ErroDebrid,
  criarConfigDebridPadrao,
  normalizarConfigDebrid,
  selecionarArquivoTorrent,
  montarMagnetLink,
  resolverTorrentViaDebrid,
} = require('../services/debridCore.ts');

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Carrega addons.ts, debrid.ts e sincroniaDados.ts reais em sandbox CJS para testar fluxo completo
function carregarModulosSyncComMocks() {
  const storage = new Map();
  const mockAsyncStorage = {
    getItem: async (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: async (k, v) => { storage.set(k, v); },
    removeItem: async (k) => { storage.delete(k); },
  };
  const noopStore = {
    getState: () => ({
      watchHistory: [],
      favorites: [],
      channels: [],
      linkCanais: '',
      linkFilmes: '',
      linksEm: 0,
      isFavorite: () => false,
      addFavorite: () => {},
    }),
    setState: () => {},
  };

  const raiz = path.resolve(__dirname, '..');
  const addonsCore = require(path.join(raiz, 'services/addonsCore.ts'));
  const debridCore = require(path.join(raiz, 'services/debridCore.ts'));
  const cache = new Map();

  function carregarTs(relPath) {
    const abs = path.join(raiz, relPath);
    if (cache.has(abs)) return cache.get(abs);
    const fonte = fs.readFileSync(abs, 'utf8');
    const js = ts.transpileModule(fonte, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: abs,
    }).outputText;

    const mod = { exports: {} };
    cache.set(abs, mod.exports);

    const localRequire = (spec) => {
      if (spec === '@react-native-async-storage/async-storage') return { __esModule: true, default: mockAsyncStorage };
      if (spec === './addonsCore') return addonsCore;
      if (spec === './debridCore') return debridCore;
      if (spec === './addons') return carregarTs('services/addons.ts');
      if (spec === './debrid') return carregarTs('services/debrid.ts');
      if (spec.endsWith('/stores/mediaStore')) return { useMediaStore: noopStore };
      if (spec.endsWith('/stores/favoritesStore')) return { useFavoritesStore: noopStore };
      if (spec.endsWith('/stores/channelStore')) return { useChannelStore: noopStore };
      if (spec.endsWith('/stores/linksStore')) return { useLinksStore: noopStore };
      if (spec === './saimoSources') return { makeVodId: () => '', parseVodId: () => null, channelId: () => '' };
      if (spec === './listas') return { aplicarLinks: async () => {} };
      if (spec === './minhasListas') {
        return { adicionarLista: async () => {}, carregarMinhasListas: async () => {}, getListas: () => [], linkValido: () => false };
      }
      if (spec.endsWith('/utils/links')) return { normalizarLink: (v) => v };
      return require(spec);
    };

    const fn = new vm.Script(`(function(exports, require, module, __filename, __dirname) {\n${js}\n})`, {
      filename: abs,
    }).runInThisContext();
    fn(mod.exports, localRequire, mod, abs, path.dirname(abs));
    cache.set(abs, mod.exports);
    return mod.exports;
  }

  return {
    addons: carregarTs('services/addons.ts'),
    debrid: carregarTs('services/debrid.ts'),
    sincroniaDados: carregarTs('services/sincroniaDados.ts'),
    storage,
  };
}

test('normaliza URL stremio://, preserva config no path, remove /manifest.json/ e mantém ?query', () => {
  const n1 = normalizarUrlAddon('  stremio://addon.exemplo.org/sort=quality|pt/manifest.json/?apikey=123#sec  ');
  assert.equal(n1.baseUrl, 'https://addon.exemplo.org/sort=quality|pt');
  assert.equal(n1.transportUrl, 'https://addon.exemplo.org/sort=quality|pt/manifest.json?apikey=123');
  assert.equal(n1.url, n1.transportUrl);
  assert.equal(n1.query, '?apikey=123');

  const n2 = normalizarUrlAddon('stremio://https://custom.host/v1///');
  assert.equal(n2.baseUrl, 'https://custom.host/v1');
  assert.equal(n2.transportUrl, 'https://custom.host/v1/manifest.json');

  assert.throws(() => normalizarUrlAddon(''), ErroAddon);
  assert.throws(() => normalizarUrlAddon('ftp://invalido.org/manifest.json'), ErroAddon);
});

test('constrói endpoints catalog/meta/stream/subtitles codificando path segments e reanexando ?query', () => {
  const origem = 'stremio://meu.addon/sort=quality/manifest.json?token=xyz';

  const catalogUrl = construirUrlRecursoAddon(origem, 'catalog', 'movie', 'top', { search: 'Homem Aranha', skip: 20 });
  assert.equal(
    catalogUrl,
    'https://meu.addon/sort=quality/catalog/movie/top/search=Homem%20Aranha&skip=20.json?token=xyz',
  );

  const streamUrl = construirUrlRecursoAddon(origem, 'stream', 'series', 'tt0903747:1:2');
  assert.equal(
    streamUrl,
    'https://meu.addon/sort=quality/stream/series/tt0903747:1:2.json?token=xyz',
  );

  const metaUrl = construirUrlRecursoAddon(origem, 'meta', 'movie', 'tmdb:550');
  assert.equal(
    metaUrl,
    'https://meu.addon/sort=quality/meta/movie/tmdb:550.json?token=xyz',
  );

  const subsUrl = construirUrlRecursoAddon(origem, 'subtitles', 'series', 'tt111:2:3');
  assert.equal(
    subsUrl,
    'https://meu.addon/sort=quality/subtitles/series/tt111:2:3.json?token=xyz',
  );
});

test('detecta e converte repositorio Nuvio e rejeita plugin JS unico', () => {
  const nuvioRepo = {
    name: 'Repositorio Nuvio',
    scrapers: [
      { id: 'mega', name: 'Mega', filename: 'mega.js', supportedTypes: ['movie'] },
    ],
  };
  assert.equal(detectarPluginNuvioJS(nuvioRepo), true);
  const conv = validarManifestoAddon(nuvioRepo);
  assert.equal(conv.name, 'Repositorio Nuvio');
  assert.equal(conv.resources.includes('stream'), true);

  const nuvioSingle = { filename: 'source.js', supportedTypes: ['movie', 'tv'] };
  assert.equal(detectarPluginNuvioJS(nuvioSingle), true);
  assert.throws(() => validarManifestoAddon(nuvioSingle), ErroAddon);
});

test('analisa manifest.json Stremio com resources string/objeto e casamento de idPrefixes', () => {
  const manifest = validarManifestoAddon({
    id: 'com.teste.addon',
    name: 'Addon Teste',
    version: '1.2.3',
    description: 'Catálogo e streams HTTP',
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    resources: [
      'catalog',
      { name: 'stream', types: ['series'], idPrefixes: ['tmdb:'] },
    ],
    catalogs: [
      { type: 'movie', id: 'top', name: 'Populares', extra: [{ name: 'search' }] },
    ],
    behaviorHints: { configurable: true },
  });

  assert.equal(manifest.id, 'com.teste.addon');
  assert.equal(addonSuportaRecurso(manifest, 'catalog', 'movie'), true);
  assert.equal(addonSuportaRecurso(manifest, 'stream', 'movie', 'tt12345'), false);
  assert.equal(addonSuportaRecurso(manifest, 'stream', 'series', 'tt12345:1:1'), false);
  assert.equal(addonSuportaRecurso(manifest, 'stream', 'series', 'tmdb:550:1:1'), true);

  assert.equal(
    escolherIdParaAddon(manifest, 'stream', 'series', ['tt12345:1:1', 'tmdb:550:1:1']),
    'tmdb:550:1:1',
  );
});

test('classifica streams, extrai proxyHeaders.request + subtitles + bingeGroup e casa próximo episódio', () => {
  const s1 = classificarStreamAddon(
    {
      name: 'Addon A\n1080p',
      title: 'Episodio.01.mkv',
      url: 'https://cdn.exemplo.com/ep1.mkv',
      subtitles: [{ id: 'pt', lang: 'pob', url: 'https://cdn.exemplo.com/pt.vtt' }],
      behaviorHints: {
        bingeGroup: 'grupo-hevc-1080p',
        proxyHeaders: {
          request: {
            Referer: 'https://origem.exemplo.com/',
            'User-Agent': 'CustomUA/2.0',
          },
        },
      },
    },
    { id: 'a1', name: 'Addon A' },
  );
  assert.equal(s1.kind, 'direct');
  assert.equal(s1.bingeGroup, 'grupo-hevc-1080p');
  assert.equal(s1.headers?.Referer, 'https://origem.exemplo.com/');
  assert.equal(s1.subtitles.length, 1);

  const headersFinais = mesclarHeadersReproducao(
    { 'User-Agent': 'VLC/3.0', Accept: '*/*' },
    s1.headers,
  );
  assert.equal(headersFinais['User-Agent'], 'CustomUA/2.0');
  assert.equal(headersFinais.Referer, 'https://origem.exemplo.com/');
  assert.equal(headersFinais.Accept, '*/*');

  const sTorrent = classificarStreamAddon(
    {
      name: 'Torrentio\n4K',
      title: 'Movie.2160p',
      infoHash: '0123456789abcdef0123456789abcdef01234567',
      fileIdx: 2,
      sources: ['tracker:udp://tracker.opentrackr.org:1337/announce'],
    },
    { id: 'tor', name: 'Torrentio' },
  );
  assert.equal(sTorrent.kind, 'torrent');
  assert.equal(sTorrent.fileIdx, 2);

  const sOutro = classificarStreamAddon(
    { name: 'Addon A\n720p', url: 'https://cdn.exemplo.com/ep2-720p.mp4', behaviorHints: { bingeGroup: 'outro' } },
    { id: 'a1', name: 'Addon A' },
  );
  const sCerto = classificarStreamAddon(
    { name: 'Addon A\n1080p', url: 'https://cdn.exemplo.com/ep2-1080p.mkv', behaviorHints: { bingeGroup: 'grupo-hevc-1080p' } },
    { id: 'a1', name: 'Addon A' },
  );

  const escolhido = selecionarStreamPorBingeGroup([sOutro, sCerto], 'grupo-hevc-1080p');
  assert.equal(escolhido?.url, 'https://cdn.exemplo.com/ep2-1080p.mkv');

  const fonteMatch = selecionarFontePorBingeGroup(
    [
      { url: 'https://cdn/outro.mp4', bingeGroup: 'outro' },
      { url: 'https://cdn/match.mkv', bingeGroup: 'grupo-hevc-1080p' },
    ],
    'grupo-hevc-1080p',
  );
  assert.equal(fonteMatch?.index, 1);
});

test('Debrid helpers: arquivo por fileIdx / maior vídeo, magnet URI, erro sem config e resolução REST mockada', async () => {
  const padrao = criarConfigDebridPadrao();
  assert.equal(padrao.sincronizarConnect, false);

  await assert.rejects(
    () => resolverTorrentViaDebrid(padrao, { infoHash: '0123456789abcdef0123456789abcdef01234567' }),
    (err) => err instanceof ErroDebrid && err.code === 'DEBRID_NAO_CONFIGURADO',
  );

  const arquivos = [
    { index: 0, name: 'leia-me.txt', size: 500 },
    { index: 1, name: 'sample.mkv', size: 10_000_000 },
    { index: 2, name: 'filme.2160p.mkv', size: 9_500_000_000 },
  ];
  assert.equal(selecionarArquivoTorrent(arquivos, 0)?.index, 2); // ignora .txt
  assert.equal(selecionarArquivoTorrent(arquivos, 1)?.name, 'sample.mkv');
  assert.equal(selecionarArquivoTorrent(arquivos)?.name, 'filme.2160p.mkv');

  const magnet = montarMagnetLink('0123456789abcdef0123456789abcdef01234567', ['tracker:udp://t.org:80']);
  assert.ok(magnet.startsWith('magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567'));
  assert.ok(magnet.includes('tr=udp%3A%2F%2Ft.org%3A80'));

  // Simula resolução Premiumize via fetch mockado
  const cfgPm = normalizarConfigDebrid({
    providers: { premiumize: { apiKey: 'pm-secret', enabled: true } },
    sincronizarConnect: false,
  });
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({
      status: 'success',
      content: [
        { path: 'readme.nfo', size: 100, link: 'https://pm.dl/readme.nfo' },
        { path: 'movie.mkv', size: 5000000, stream_link: 'https://pm.dl/movie.mp4' },
      ],
    }), { status: 200 });
  };
  const resolvido = await resolverTorrentViaDebrid(
    cfgPm,
    { infoHash: '0123456789abcdef0123456789abcdef01234567' },
    fakeFetch,
  );
  assert.equal(resolvido.provider, 'premiumize');
  assert.equal(resolvido.url, 'https://pm.dl/movie.mp4');
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes('/transfer/directdl'));
});

test('sincroniaDados inclui addons, respeita opt-in de Debrid e preserva addons locais se payload antigo omitir "addons"', async () => {
  const { addons, debrid, sincroniaDados } = carregarModulosSyncComMocks();
  const origFetch = globalThis.fetch;

  const manifestMock = (id, name) => ({
    id,
    name,
    version: '1.0.0',
    types: ['movie'],
    resources: ['stream'],
    catalogs: [],
  });

  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('addon1.test')) return new Response(JSON.stringify(manifestMock('id.1', 'Addon Um')), { status: 200 });
    if (u.includes('addon2.test')) return new Response(JSON.stringify(manifestMock('id.2', 'Addon Dois')), { status: 200 });
    if (u.includes('remoto.test')) return new Response(JSON.stringify(manifestMock('id.r', 'Remoto')), { status: 200 });
    return new Response('{}', { status: 404 });
  };

  try {
    // 1. Começa 100% vazio
    const iniciais = await addons.carregarAddons();
    assert.equal(iniciais.length, 0);

    // 2. Instala dois addons e reordena
    await addons.instalarAddon('stremio://addon1.test/manifest.json');
    await addons.instalarAddon('https://addon2.test/manifest.json');
    await addons.moverAddon('id.2', 'up');
    await addons.toggleAddon('id.1', false);

    // 3. Debrid desligado de sync por padrão: pacoteDeDados não envia chaves Debrid
    await debrid.carregarDebridConfig();
    await debrid.salvarProvedorDebrid('torbox', 'tb-key-privada', true);
    const pacoteSemOptIn = sincroniaDados.pacoteDeDados();
    assert.equal('debrid' in pacoteSemOptIn, false);
    assert.equal(pacoteSemOptIn.addons.length, 2);
    assert.equal(pacoteSemOptIn.addons[0].id, 'id.2');
    assert.equal(pacoteSemOptIn.addons[0].url, 'https://addon2.test/manifest.json');
    assert.equal(pacoteSemOptIn.addons[0].transportUrl, 'https://addon2.test/manifest.json');
    assert.equal(pacoteSemOptIn.addons[1].enabled, false);

    // 4. Com sincronizarConnect = true, Debrid vai junto
    await debrid.setSincronizarDebridConnect(true);
    const pacoteComOptIn = sincroniaDados.pacoteDeDados();
    assert.equal(pacoteComOptIn.debrid?.providers?.torbox?.apiKey, 'tb-key-privada');

    // 5. Payload legado sem campo "addons" NÃO apaga addons locais
    sincroniaDados.aplicarDados({ t: 'dados', progresso: [] });
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(addons.getAddons().length, 2);

    // 6. Payload com campo "addons" aceita tanto `url` quanto `transportUrl` e hidrata manifesto faltante
    sincroniaDados.aplicarDados({
      t: 'dados',
      addons: [
        { url: 'https://remoto.test/manifest.json', enabled: true, order: 0 },
      ],
    });
    await new Promise((r) => setTimeout(r, 80));
    const atuais = addons.getAddons();
    assert.equal(atuais.length, 1);
    assert.equal(atuais[0].transportUrl, 'https://remoto.test/manifest.json');
    assert.equal(atuais[0].name, 'Remoto');
    assert.equal(atuais[0].hydrated, true);
  } finally {
    globalThis.fetch = origFetch;
  }
});
