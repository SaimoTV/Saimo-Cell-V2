import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useMediaStore } from '../stores/mediaStore';
import { useAparenciaStore, useExtrasStore, type AvisoDeEpisodios } from '../stores/extrasStore';
import { loadVodCategory, parseVodId } from './saimoSources';

/**
 * Avisos de episódios novos nas séries favoritas.
 *
 * O catálogo diz quantos episódios cada série tem. Para cada série favorita
 * guarda-se a contagem "já vista"; se o catálogo passa a ter mais, nasce um
 * aviso (fica até a pessoa abrir ou dispensar). A primeira olhada numa série só
 * marca a contagem. Roda ao abrir o app e quando ele volta ao primeiro plano
 * (no máximo a cada 30 minutos); com a permissão, também notifica.
 */

let rodando = false;
let ultima = 0;
const INTERVALO = 30 * 60 * 1000;

export async function verificarNovosEpisodios(forcar = false): Promise<void> {
  if (rodando || (!forcar && Date.now() - ultima < INTERVALO)) return;
  rodando = true;
  ultima = Date.now();
  try {
    const favoritos = useMediaStore.getState().favorites;
    const { vistos: vistosAtuais, avisos: avisosAtuais } = useExtrasStore.getState();
    const vistos = { ...vistosAtuais };
    let avisos = [...avisosAtuais];
    const criados: AvisoDeEpisodios[] = [];
    const porLetra = new Map<string, Awaited<ReturnType<typeof loadVodCategory>>>();
    for (const fav of favoritos) {
      const p = parseVodId(fav.id);
      if (!p || p.type !== 'series' || !p.letter || p.letter.startsWith('redeflix')) continue;
      let lista = porLetra.get(p.letter);
      if (!lista) {
        lista = await loadVodCategory('series', p.letter).catch(() => []);
        porLetra.set(p.letter, lista);
      }
      const item = lista.find((i) => i.id === fav.id) ?? lista.find((i) => i.name === p.title);
      const total = item?.totalEpisodes ?? 0;
      if (!item || !total) continue;
      const visto = vistos[fav.id];
      if (visto === undefined) { vistos[fav.id] = total; continue; }
      const existente = avisos.find((a) => a.id === fav.id);
      if (total > visto) {
        const novos = total - visto;
        if (existente) { existente.novos = novos; existente.total = total; }
        else {
          const aviso = { id: fav.id, nome: item.name, novos, total, quando: Date.now() };
          avisos.unshift(aviso);
          criados.push(aviso);
        }
      } else if (total < visto) {
        // Catálogo reorganizado: recomeça a conta sem avisar.
        vistos[fav.id] = total;
        avisos = avisos.filter((a) => a.id !== fav.id);
      }
    }
    useExtrasStore.getState().definirVistos(vistos, avisos);
    if (criados.length && useAparenciaStore.getState().notificarEpisodios) {
      for (const a of criados.slice(0, 3)) {
        await Notifications.scheduleNotificationAsync({
          content: { title: a.nome, body: `${a.novos} ${a.novos === 1 ? 'episódio novo' : 'episódios novos'}. Abra o Saimo TV para assistir.` },
          trigger: null,
        }).catch(() => {});
      }
    }
  } finally {
    rodando = false;
  }
}

/** Liga a checagem ao abrir e ao voltar ao primeiro plano. Chamar uma vez. */
export function iniciarNovosEpisodios(): () => void {
  const espera = setTimeout(() => { void verificarNovosEpisodios(true); }, 8000);
  const sub = AppState.addEventListener('change', (e) => { if (e === 'active') void verificarNovosEpisodios(); });
  return () => { clearTimeout(espera); sub.remove(); };
}

/** Liga ou desliga as notificações (pede a permissão ao ligar). Devolve o estado final. */
export async function definirNotificarEpisodios(ligar: boolean): Promise<boolean> {
  if (!ligar) { useAparenciaStore.getState().setNotificarEpisodios(false); return false; }
  const atual = await Notifications.getPermissionsAsync();
  const permissao = atual.granted ? atual : await Notifications.requestPermissionsAsync();
  useAparenciaStore.getState().setNotificarEpisodios(permissao.granted);
  return permissao.granted;
}
