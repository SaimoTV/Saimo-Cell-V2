// Primeiro de todos: silencia o log de depuração antes de os módulos rodarem.
import '../services/semLogs';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text, Platform, Alert } from 'react-native';
import { enableLayoutAnimations } from 'react-native-reanimated';
import { useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { iniciarNovosEpisodios } from '../services/novosEpisodios';
import { useAparenciaStore } from '../stores/extrasStore';
import { Colors } from '../constants/Colors';

import Updater from '../components/Updater';
import Abertura from '../components/Abertura';
import ConnectAudioHost from '../components/ConnectAudioHost';
import ConnectSheet from '../components/ConnectSheet';
import ConnectRemote from '../components/ConnectRemote';
import ConnectSincronia from '../components/ConnectSincronia';
import MultiAudioPanel from '../components/MultiAudioPanel';
import RemoteFab from '../components/RemoteFab';
import VeuDeBrilho from '../components/VeuDeBrilho';
import { downloadManager } from '../services/downloadManager';
import { useDownloadStore } from '../stores/downloadStore';
import { initNotifications } from '../services/downloadNotifications';
import { iniciar as iniciarTelemetria } from '../services/telemetria';
import { iniciarConta } from '../services/conta';
import { saimoConnect } from '../services/saimoConnect';
import { carregarAddons, instalarAddon, normalizarUrlAddon } from '../services/addons';
import { carregarDebridConfig } from '../services/debrid';
import { deveMostrarApoie } from '../services/apoieNaVersao';
import { prepararPerfis } from '../services/perfisStores';
import { deveEscolherAoAbrir } from '../services/perfis';

// Antes de qualquer tela: favoritos e progresso são do perfil ativo.
void prepararPerfis();
import { useConnectStore } from '../stores/connectStore';

// O monitor conta a abertura já na subida do bundle, antes da primeira tela.
iniciarTelemetria();
void iniciarConta();

// Enable layout animations for 120fps transitions
enableLayoutAnimations(true);

// Correção global de texto cortado no Android (Moto G04, MediaTek e outros)
// "simple" evita que o Android use hifenização/quebra de linha mais agressiva
// que causa medição incorreta do texto e cortes no último caractere.
// allowFontScaling=false previne que o tamanho de fonte do sistema distorça layouts.
if (Platform.OS === 'android') {
  const T = Text as any;
  if (!T.defaultProps) T.defaultProps = {};
  T.defaultProps.textBreakStrategy = 'simple';
  T.defaultProps.allowFontScaling = false;
}

export default function RootLayout() {
  const router = useRouter();
  const ultimoDeepLinkRef = useRef<string>('');
  const reduzirAnimacoes = useAparenciaStore((s) => s.reduzirAnimacoes);

  useEffect(() => iniciarNovosEpisodios(), []);

  useEffect(() => {
    void carregarAddons();
    void carregarDebridConfig();

    const processarDeepLinkAddon = (rawUrl: string | null | undefined) => {
      if (!rawUrl || !/^stremio:\/\//i.test(rawUrl.trim())) return;
      const limpo = rawUrl.trim();
      if (ultimoDeepLinkRef.current === limpo) return;
      ultimoDeepLinkRef.current = limpo;

      try {
        const parsed = normalizarUrlAddon(limpo);
        Alert.alert(
          'Instalar Addon Stremio',
          `Deseja adicionar este addon ao Saimo?\n\n${parsed.transportUrl}`,
          [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Instalar',
              onPress: () => {
                void instalarAddon(parsed.transportUrl)
                  .then((addon) => {
                    Alert.alert('Addon instalado', `${addon.name} (v${addon.version}) está pronto para uso.`);
                  })
                  .catch((err) => {
                    Alert.alert(
                      'Não foi possível instalar',
                      err instanceof Error ? err.message : 'Verifique o endereço do addon.',
                    );
                  });
              },
            },
          ],
        );
      } catch (err) {
        Alert.alert(
          'Link de addon inválido',
          err instanceof Error ? err.message : 'Endereço stremio:// inválido.',
        );
      }
    };

    Linking.getInitialURL().then(processarDeepLinkAddon).catch(() => {});
    const linkSub = Linking.addEventListener('url', ({ url }) => processarDeepLinkAddon(url));

    // Request notification permission immediately on app open (before any download)
    initNotifications().catch(() => {});

    // Inicializa o Saimo Connect (carrega identidade do celular e auto-conecta ao aparelho)
    saimoConnect.init().catch((e) => console.warn('[Layout] saimoConnect.init error:', e));

    // downloadManager.init reuses initNotifications (idempotent) + reconciles bg downloads
    downloadManager.init().catch((e) => console.warn('[Layout] downloadManager.init error:', e));

    // Tap notification → open content
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as any;
      if (!data) return;

      if (data.type === 'connect') {
        useConnectStore.getState().setRemoteVisible(true);
        return;
      }

      if (data.type === 'completed' && data.taskId) {
        const item = useDownloadStore.getState().getItem(data.taskId);
        if (item) {
          router.push({
            pathname: '/media-player/[id]' as any,
            params: {
              id: item.id,
              url: encodeURIComponent(item.localPath),
              title: item.title,
              offline: '1',
            },
          });
          return;
        }
      }
      if (data.type === 'progress') {
        // Tapping the ongoing progress notification should NOT do anything 
        // (the user specifically requested it to not interfere/open).
        return;
      }

      // Default: open downloads tab
      router.push('/(tabs)/downloads' as any);
    });

    return () => {
      sub.remove();
      linkSub.remove();
    };
  }, [router]);

  return (
    <SafeAreaProvider>
      {Platform.OS === 'android' && <Updater />}
      <ConnectAudioHost />
      <ConnectSheet />
      <ConnectRemote />
      <ConnectSincronia />
      <MultiAudioPanel />
      <RemoteFab />
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: Colors.background,
          },
          // "Reduzir animações" (Ajustes) troca a transição por nenhuma.
          animation: reduzirAnimacoes ? 'none' : Platform.select({
            android: 'fade_from_bottom',
            ios: 'slide_from_right',
          }),
          presentation: 'card',
          gestureEnabled: true,
          gestureDirection: 'horizontal',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="perfis" options={{ animation: 'fade', presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen 
          name="player/[id]" 
          options={{
            animation: 'fade',
            presentation: 'fullScreenModal',
          }}
        />
      </Stack>
      {/* Por cima de tudo, só na partida a frio: o app monta por baixo. */}
      <Abertura aoSair={() => {
        void (async () => {
          // Com 2 ou mais perfis, pergunta quem está assistindo.
          await prepararPerfis();
          if (deveEscolherAoAbrir()) router.push('/perfis?obrigatoria=1' as any);
          // Primeiro uso e cada versão nova: abre o Apoie por cima, uma vez.
          else if (await deveMostrarApoie()) router.push('/apoie' as any);
        })();
      }} />
      <VeuDeBrilho />
    </SafeAreaProvider>
  );
}
