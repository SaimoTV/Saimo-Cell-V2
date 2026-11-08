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
 *
 * Progresso: vale o mais recente. Favoritos: união (desmarcar num aparelho
 * não desmarca no outro).
 */
import { useMediaStore } from '../stores/mediaStore';
import { useFavoritesStore } from '../stores/favoritesStore';
import { useChannelStore } from '../stores/channelStore';
import { makeVodId, parseVodId, channelId } from './saimoSources';

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

export function pacoteDeDados(): Record<string, unknown> {
  const media = useMediaStore.getState();
  const progresso: Progresso[] = [];
  for (const h of media.watchHistory) {
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
  for (const f of media.favorites) {
    const v = parseVodId(f.id);
    if (v) favTitulos.push({ tipo: v.type === 'series' ? 's' : 'f', titulo: v.title, ano: v.year, letra: v.letter });
  }
  const nomes = new Map(useChannelStore.getState().channels.map((c) => [c.id, c.name]));
  const favCanais = useFavoritesStore.getState().favorites
    .map((id) => nomes.get(id))
    .filter((n): n is string => !!n);
  return { t: 'dados', progresso, favTitulos, favCanais };
}

/** Junta o que veio da TV ao que o celular tem. */
export function aplicarDados(msg: any): void {
  const lista: Progresso[] = Array.isArray(msg?.progresso) ? msg.progresso : [];
  if (lista.length) {
    useMediaStore.setState((estado) => {
      const historico = [...estado.watchHistory];
      const series = [...estado.seriesProgress];
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
      return { watchHistory: historico.slice(0, 500), seriesProgress: series };
    });
  }

  const media = useMediaStore.getState();
  for (const f of (Array.isArray(msg?.favTitulos) ? msg.favTitulos : []) as FavTitulo[]) {
    if (!f?.titulo) continue;
    const id = f.tipo === 's'
      ? makeVodId('series', f.letra || '', f.titulo, f.ano || '')
      : makeVodId('movie', f.letra || '', f.titulo);
    if (!media.isFavorite(id)) media.addFavorite(id);
  }

  const canais = useFavoritesStore.getState();
  for (const nome of (Array.isArray(msg?.favCanais) ? msg.favCanais : []) as string[]) {
    if (typeof nome !== 'string' || !nome) continue;
    const id = channelId(nome);
    if (!canais.isFavorite(id)) canais.addFavorite(id);
  }
}
