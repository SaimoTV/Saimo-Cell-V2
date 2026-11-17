/**
 * Sincronia de dados com a TV pelo Saimo Connect: onde parou em filmes e
 * episódios, títulos favoritos e canais favoritos.
 *
 * Os dois lados mandam tudo ao conectar (`{t:'dados'}`) e de novo quando algo
 * muda aqui com a TV conectada. O formato é por título, igual nos apps:
 *
 *   progresso:  {tipo:'f'|'s', titulo, ano, letra, temporada, episodio, pos, dur, em}
 *               pos e dur em milissegundos; em = quando foi visto (ms desde 1970)
 *   favTitulos: {tipo, titulo, ano, letra}
 *   favCanais:  nome do canal
 *   listas:     {canais, filmes, em, minhas: [{nome, link}]} — os dois endereços
 *               (em = quando foram escolhidos, ms) e as listas adicionadas por link
 *
 * Progresso: vale o mais recente. Favoritos: união (desmarcar num aparelho
 * não desmarca no outro). Endereços: vale o escolhido por último; quem nunca
 * escolheu (padrão ou vazio) fica com o que o outro escolheu. Listas
 * adicionadas: união pelo link (a lista vinda de arquivo fica só no aparelho).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMediaStore } from '../stores/mediaStore';
import { useFavoritesStore } from '../stores/favoritesStore';
import { useChannelStore } from '../stores/channelStore';
import { useLinksStore } from '../stores/linksStore';
import { makeVodId, parseVodId, channelId } from './saimoSources';
import { aplicarLinks } from './listas';
import { adicionarLista, carregarMinhasListas, getListas, linkValido } from './minhasListas';
import { aplicarAddonsRemotos, exportarAddonsParaSync } from './addons';
import { aplicarDebridRemoto, exportarDebridParaSync } from './debrid';
import { normalizarLink } from '../utils/links';
import { TUDO, type EscolhaSincronia } from './connectSincronia';
import { PRINCIPAL, aoTrocarPerfil, chaveDoPerfil, idAtivo, mesclarPerfis, perfis, removidos } from './perfis';

interface Progresso {
  tipo: 'f' | 's';
  titulo: string;
  ano: string;
  letra: string;
  temporada: number;
  episodio: number;
  pos: number;
  dur: number;
  em: number;
}

interface FavTitulo { tipo: 'f' | 's'; titulo: string; ano: string; letra: string }

/** Episódio no histórico: `<id da série>|e|<temporada>|<episódio>`. */
function lerEpisodio(id: string): { serie: string; temporada: number; episodio: number } | null {
  const m = id.match(/^(.*)\|e\|(\d+)\|(\d+)$/);
  if (!m) return null;
  return { serie: m[1], temporada: Number(m[2]), episodio: Number(m[3]) };
}

// ---------- dados de um perfil (o ativo vem dos stores; os outros, do armazenamento) ----------

type Historico = { id: string; watchedAt: number; progress?: number; duration?: number };
interface DadosMidia { favorites: { id: string; addedAt: number }[]; watchHistory: Historico[]; seriesProgress: any[] }
interface DadosPerfil { media: DadosMidia; canais: string[] }

const VAZIO = (): DadosPerfil => ({ media: { favorites: [], watchHistory: [], seriesProgress: [] }, canais: [] });
const outros = new Map<string, DadosPerfil>();

function lerPersistido(bruto: string | null): any {
  try { return bruto ? (JSON.parse(bruto)?.state ?? {}) : {}; } catch { return {}; }
}

/** Relê do armazenamento os dados dos perfis que não estão abertos. */
export async function carregarOutrosPerfis(): Promise<void> {
  outros.clear();
  for (const p of perfis()) {
    if (p.id === idAtivo()) continue;
    const [m, f] = await Promise.all([
      AsyncStorage.getItem(chaveDoPerfil('saimo-media-store', p.id)),
      AsyncStorage.getItem(chaveDoPerfil('saimo-favorites', p.id)),
    ]);
    const media = lerPersistido(m);
    outros.set(p.id, {
      media: { favorites: media.favorites ?? [], watchHistory: media.watchHistory ?? [], seriesProgress: media.seriesProgress ?? [] },
      canais: lerPersistido(f).favorites ?? [],
    });
  }
}
aoTrocarPerfil(() => carregarOutrosPerfis());

function dadosDe(id: string): DadosPerfil {
  if (id === idAtivo()) {
    const m = useMediaStore.getState();
    return { media: { favorites: m.favorites, watchHistory: m.watchHistory, seriesProgress: m.seriesProgress },
      canais: useFavoritesStore.getState().favorites };
  }
  return outros.get(id) ?? VAZIO();
}

async function gravarDe(id: string, d: DadosPerfil): Promise<void> {
  if (id === idAtivo()) {
    useMediaStore.setState({ ...d.media, favoriteIds: new Set(d.media.favorites.map((f) => f.id)) });
    useFavoritesStore.setState({ favorites: d.canais, favoriteIds: new Set(d.canais) });
    return;
  }
  outros.set(id, d);
  await AsyncStorage.multiSet([
    [chaveDoPerfil('saimo-media-store', id), JSON.stringify({ state: d.media, version: 0 })],
    [chaveDoPerfil('saimo-favorites', id), JSON.stringify({ state: { favorites: d.canais }, version: 0 })],
  ]);
}

function campos(d: DadosPerfil, nomes: Map<string, string>): { progresso: Progresso[]; favTitulos: FavTitulo[]; favCanais: string[] } {
  const progresso: Progresso[] = [];
  for (const h of d.media.watchHistory) {
    if (!h.progress || h.progress <= 0) continue;
    const ep = lerEpisodio(h.id);
    const base = parseVodId(ep ? ep.serie : h.id);
    if (!base) continue;
    progresso.push({
      tipo: base.type === 'series' ? 's' : 'f',
      titulo: base.title,
      ano: base.year,
      letra: base.letter,
      temporada: ep?.temporada ?? 0,
      episodio: ep?.episodio ?? 0,
      pos: Math.round(h.progress * 1000),
      dur: Math.round((h.duration ?? 0) * 1000),
      em: h.watchedAt,
    });
  }
  const favTitulos: FavTitulo[] = [];
  for (const f of d.media.favorites) {
    const v = parseVodId(f.id);
    if (v) favTitulos.push({ tipo: v.type === 'series' ? 's' : 'f', titulo: v.title, ano: v.year, letra: v.letter });
  }
  const favCanais = d.canais.map((id) => nomes.get(id)).filter((n): n is string => !!n);
  return { progresso, favTitulos, favCanais };
}

/** Pacote para a TV, só com o que a pessoa aceitou sincronizar com ela. */
export function pacoteDeDados(escolha: EscolhaSincronia = TUDO): Record<string, unknown> {
  const nomes = new Map(useChannelStore.getState().channels.map((c) => [c.id, c.name]));
  // Os campos de sempre levam o perfil principal: apps sem perfis seguem funcionando.
  const { progresso, favTitulos, favCanais } = campos(dadosDe(PRINCIPAL), nomes);
  const listaPerfis = perfis().map((p) => {
    const c = p.id === PRINCIPAL ? { progresso, favTitulos, favCanais } : campos(dadosDe(p.id), nomes);
    return {
      id: p.id, nome: p.nome, avatar: p.avatar, em: p.em,
      ...(p.kids ? { kids: true, codigo: p.codigo } : {}),
      ...(escolha.historico ? { progresso: c.progresso } : {}),
      ...(escolha.favoritos ? { favTitulos: c.favTitulos, favCanais: c.favCanais } : {}),
    };
  });
  const links = useLinksStore.getState();
  const listas = {
    canais: links.linkCanais,
    filmes: links.linkFilmes,
    em: links.linksEm,
    minhas: getListas().filter((l) => !!l.link).map((l) => ({ nome: l.nome, link: l.link as string })),
  };
  const addons = exportarAddonsParaSync();
  const debrid = exportarDebridParaSync();
  return {
    t: 'dados',
    ...(escolha.historico ? { progresso } : {}),
    ...(escolha.favoritos ? { favTitulos, favCanais } : {}),
    ...(escolha.historico || escolha.favoritos ? { perfis: listaPerfis, perfisRemovidos: removidos() } : {}),
    ...(escolha.listas ? { listas } : {}),
    ...(escolha.addons ? { addons, ...(debrid ? { debrid } : {}) } : {}),
  };
}

/** Os endereços e as listas adicionadas que vieram do outro aparelho. */
async function aplicarListas(l: any): Promise<void> {
  if (!l || typeof l !== 'object') return;
  const local = useLinksStore.getState();
  const em = Number(l.em) || 0;
  const ler = (v: unknown): string | null => (typeof v === 'string' ? (v ? normalizarLink(v) ?? '' : '') : null);
  const canais = ler(l.canais);
  const filmes = ler(l.filmes);
  if (canais !== null && filmes !== null) {
    if (em > local.linksEm) {
      await aplicarLinks(canais, filmes, em);
    } else if (local.linksEm === 0) {
      // Aqui nunca se escolheu nada: fica o que o outro escolheu (e um
      // endereço que o outro não tem não apaga o daqui).
      const c = canais || local.linkCanais;
      const f = filmes || local.linkFilmes;
      if (c !== local.linkCanais || f !== local.linkFilmes) await aplicarLinks(c, f, em);
    }
  }
  const minhas: Array<{ nome?: string; link?: string }> = Array.isArray(l.minhas) ? l.minhas : [];
  if (!minhas.length) return;
  await carregarMinhasListas();
  for (const m of minhas) {
    const link = typeof m?.link === 'string' ? m.link.trim() : '';
    if (!linkValido(link) || getListas().some((x) => x.link === link)) continue;
    try { await adicionarLista(link, typeof m.nome === 'string' ? m.nome : ''); } catch { /* lista fora do ar ou limite: segue */ }
  }
}

/** Junta progresso e favoritos vindos da TV aos dados de um perfil. */
function juntar(d: DadosPerfil, msg: { progresso?: unknown; favTitulos?: unknown; favCanais?: unknown }): DadosPerfil {
  const historico = [...d.media.watchHistory];
  const series = [...d.media.seriesProgress];
  const lista: Progresso[] = Array.isArray(msg.progresso) ? msg.progresso : [];
  for (const p of lista) {
    if (!p?.titulo || !(p.pos > 0)) continue;
    const serie = p.tipo === 's';
    if (serie && !(p.temporada > 0 && p.episodio > 0)) continue;
    const base = serie
      ? makeVodId('series', p.letra || '', p.titulo, p.ano || '')
      : makeVodId('movie', p.letra || '', p.titulo);
    const id = serie ? `${base}|e|${p.temporada}|${p.episodio}` : base;
    const entrada = { id, watchedAt: p.em || 0, progress: p.pos / 1000, duration: p.dur ? p.dur / 1000 : undefined };
    const i = historico.findIndex((h) => h.id === id);
    if (i >= 0) {
      if (historico[i].watchedAt >= entrada.watchedAt) continue;
      historico[i] = entrada;
    } else {
      historico.push(entrada);
    }
    if (serie) {
      const j = series.findIndex((s) => s.seriesId === base);
      const novo = { seriesId: base, season: p.temporada, episode: p.episodio, episodeId: id,
        watchedAt: entrada.watchedAt, progress: entrada.progress, duration: entrada.duration };
      if (j < 0) series.push(novo);
      else if (series[j].watchedAt < novo.watchedAt) series[j] = novo;
    }
  }
  historico.sort((a, b) => b.watchedAt - a.watchedAt);

  const favoritos = [...d.media.favorites];
  for (const f of (Array.isArray(msg.favTitulos) ? msg.favTitulos : []) as FavTitulo[]) {
    if (!f?.titulo) continue;
    const id = f.tipo === 's'
      ? makeVodId('series', f.letra || '', f.titulo, f.ano || '')
      : makeVodId('movie', f.letra || '', f.titulo);
    if (!favoritos.some((x) => x.id === id)) favoritos.push({ id, addedAt: Date.now() });
  }
  const canais = [...d.canais];
  for (const nome of (Array.isArray(msg.favCanais) ? msg.favCanais : []) as string[]) {
    if (typeof nome !== 'string' || !nome) continue;
    const id = channelId(nome);
    if (!canais.includes(id)) canais.push(id);
  }
  return { media: { favorites: favoritos, watchHistory: historico.slice(0, 500), seriesProgress: series }, canais };
}

/** Junta o que veio da TV ao que o celular tem. */
export function aplicarDados(recebido: any, escolha: EscolhaSincronia = TUDO): void {
  // Só entra o que a pessoa aceitou sincronizar com esta TV.
  const filtrar = (m: any) => ({
    progresso: escolha.historico ? m?.progresso : undefined,
    favTitulos: escolha.favoritos ? m?.favTitulos : undefined,
    favCanais: escolha.favoritos ? m?.favCanais : undefined,
  });
  const msg = {
    listas: escolha.listas ? recebido?.listas : undefined,
    addons: escolha.addons ? recebido?.addons : undefined,
    debrid: escolha.addons ? recebido?.debrid : undefined,
  };

  if (Array.isArray(recebido?.perfis) && (escolha.historico || escolha.favoritos)) {
    // TV com perfis: cada perfil junta com o perfil de mesmo id daqui.
    const remotos = (recebido.perfis as any[]).filter((p) => p && typeof p.id === 'string');
    void (async () => {
      const existem = await mesclarPerfis(
        remotos.map((p) => ({ id: p.id, nome: String(p.nome ?? ''), avatar: String(p.avatar ?? ''), em: Number(p.em) || 0,
          ...(p.kids ? { kids: true, codigo: String(p.codigo ?? '') } : {}) })),
        Array.isArray(recebido.perfisRemovidos) ? recebido.perfisRemovidos : []);
      await carregarOutrosPerfis();
      for (const p of remotos) {
        if (!existem.has(p.id)) continue;
        await gravarDe(p.id, juntar(dadosDe(p.id), filtrar(p)));
      }
    })().catch(() => { /* não derruba a conexão */ });
  } else {
    // TV sem perfis: os campos de sempre são do perfil principal.
    void gravarDe(PRINCIPAL, juntar(dadosDe(PRINCIPAL), filtrar(recebido))).catch(() => {});
  }

  void aplicarListas(msg?.listas).catch(() => { /* não derruba a conexão */ });

  if (Array.isArray(msg?.addons)) {
    void aplicarAddonsRemotos(msg.addons).catch(() => { /* preserva addons locais se falhar */ });
  }
  if (msg?.debrid && typeof msg.debrid === 'object' && !Array.isArray(msg.debrid)) {
    void aplicarDebridRemoto(msg.debrid).catch(() => { /* não derruba a conexão */ });
  }
}
