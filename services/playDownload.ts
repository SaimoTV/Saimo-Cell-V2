// Abre um download já concluído no player, checando antes que o arquivo
// ainda está no disco e com o tamanho esperado.
//
// Sem essa checagem, um arquivo apagado pelo Android por falta de espaço, ou
// truncado por uma queda de conexão no meio do download, abria o player numa
// tela preta sem explicação — o ExoPlayer não dispara `onError` quando o
// container existe mas não tem faixa de vídeo decodificável, então a pessoa
// só via um retângulo preto, sem saber se o problema era o arquivo, o app ou
// o celular. Aqui o problema é visível antes de abrir o player.
import { Alert } from 'react-native';
import type { useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;
import * as FileSystem from 'expo-file-system/legacy';

import { downloadManager } from './downloadManager';
import type { DownloadItem } from '../types';

// Uma tolerância pequena: o último byte de um arquivo pré-alocado por range
// pode não ter sido escrito por um chunk que terminou exatamente no limite,
// mas a diferença nunca passa de poucos bytes num arquivo de vídeo real.
const TOLERANCIA_BYTES = 4096;

export async function openDownload(
  item: DownloadItem,
  router: Router,
  params: Record<string, string>,
  navigation: 'push' | 'replace' = 'push',
): Promise<void> {
  let ok = false;
  try {
    const info = await FileSystem.getInfoAsync(item.localPath);
    const tamanho = info.exists ? ((info as any).size ?? 0) : 0;
    ok = info.exists && (item.fileSize <= 0 || tamanho >= item.fileSize - TOLERANCIA_BYTES);
  } catch {
    ok = false;
  }

  if (ok) {
    router[navigation]({ pathname: '/media-player/[id]' as any, params });
    return;
  }

  Alert.alert(
    'Download incompleto',
    `"${item.title}" não está mais disponível no aparelho — o arquivo foi apagado ou não terminou de baixar corretamente. Baixe de novo para assistir.`,
    [
      { text: 'Fechar', style: 'cancel' },
      {
        text: 'Remover download',
        style: 'destructive',
        onPress: () => downloadManager.removeDownload(item.id),
      },
    ],
  );
}
