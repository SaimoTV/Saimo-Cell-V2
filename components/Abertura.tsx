import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Dimensions, Pressable, StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as SplashScreen from 'expo-splash-screen';

/**
 * A abertura animada: o logo montado peça por peça, o mesmo vídeo do Mac e
 * do TV Box.
 *
 * Só na partida a frio (uma vez por processo). A tela de abertura do sistema
 * já é do mesmo azul do primeiro quadro, então a troca dela para cá não se
 * vê. O app monta por baixo enquanto o vídeo toca; um toque pula, e no fim
 * a abertura some num fade curto.
 *
 * Celular fraco: se o vídeo der erro ou o primeiro quadro não vier em 1,5 s,
 * a abertura sai na hora.
 */

/** O azul-marinho do primeiro quadro do vídeo (o mesmo do splash no app.json). */
export const FUNDO_ABERTURA = '#0B0F2A';

const PRAZO_PRIMEIRO_QUADRO_MS = 1500;
const TETO_MS = 9000;
const FADE_MS = 250;

const VIDEO_DEITADO = require('../assets/abertura/abertura-h.mp4');
const VIDEO_EM_PE = require('../assets/abertura/abertura-v.mp4');

let jaMostrou = false;

// Segura a tela do sistema até a abertura estar pronta para cobrir a tela.
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 150, fade: true });

export default function Abertura() {
  const [visivel, setVisivel] = useState(() => !jaMostrou);

  useEffect(() => {
    jaMostrou = true;
    // Recarga do JS com o app aberto: nada de vídeo, só soltar a tela do sistema.
    if (!visivel) SplashScreen.hide();
  }, []);

  if (!visivel) return null;
  return <AberturaVideo aoTerminar={() => setVisivel(false)} />;
}

function AberturaVideo({ aoTerminar }: { aoTerminar: () => void }) {
  // Tablet deitado usa o 16:9; celular em pé, o 9:16. Escolhido uma vez: o
  // "cover" segura uma rotação no meio sem trocar de vídeo.
  const [fonte] = useState(() => {
    const { width, height } = Dimensions.get('window');
    return width > height ? VIDEO_DEITADO : VIDEO_EM_PE;
  });
  const player = useVideoPlayer(fonte, (p) => {
    p.muted = true;
    p.loop = false;
    // Sem som e sem pausar a música de quem estiver ouvindo.
    p.audioMixingMode = 'mixWithOthers';
    p.play();
  });
  const opacidade = useRef(new Animated.Value(1)).current;
  const saindo = useRef(false);
  const temQuadro = useRef(false);
  const prazo = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sair = useCallback((suave: boolean) => {
    if (saindo.current) return;
    saindo.current = true;
    if (prazo.current) clearTimeout(prazo.current);
    SplashScreen.hide();
    if (!suave) {
      aoTerminar();
      return;
    }
    Animated.timing(opacidade, {
      toValue: 0,
      duration: FADE_MS,
      useNativeDriver: true,
    }).start(() => aoTerminar());
  }, [aoTerminar, opacidade]);

  useEffect(() => {
    const fim = player.addListener('playToEnd', () => sair(true));
    const estado = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') sair(false);
    });
    // Voltar também pula, em vez de fechar o app por baixo do vídeo.
    const voltar = BackHandler.addEventListener('hardwareBackPress', () => {
      sair(true);
      return true;
    });
    // Travou no meio (decodificador sem memória): o app não fica refém do vídeo.
    const teto = setTimeout(() => sair(true), TETO_MS);
    return () => {
      fim.remove();
      estado.remove();
      voltar.remove();
      clearTimeout(teto);
      if (prazo.current) clearTimeout(prazo.current);
    };
  }, [player, sair]);

  // A tela do sistema sai assim que este azul cobre a tela: os dois são a
  // mesma cor. Ela não pode esperar o primeiro quadro, porque enquanto está
  // na frente o Android não desenha o app, e o vídeo ficaria sem onde tocar.
  const aoMedir = useCallback(() => {
    SplashScreen.hide();
    if (prazo.current || temQuadro.current) return;
    prazo.current = setTimeout(() => {
      if (!temQuadro.current) sair(false);
    }, PRAZO_PRIMEIRO_QUADRO_MS);
  }, [sair]);

  const aoPrimeiroQuadro = useCallback(() => {
    temQuadro.current = true;
    if (prazo.current) clearTimeout(prazo.current);
  }, []);

  return (
    <Animated.View style={[styles.cobre, { opacity: opacidade }]} onLayout={aoMedir}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        allowsPictureInPicture={false}
        // TextureView: a SurfaceView não acompanha o fade da opacidade.
        surfaceType="textureView"
        onFirstFrameRender={aoPrimeiroQuadro}
      />
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => sair(true)}
        accessibilityRole="button"
        accessibilityLabel="Pular abertura"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cobre: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: FUNDO_ABERTURA,
    zIndex: 1000,
    elevation: 1000,
  },
});
