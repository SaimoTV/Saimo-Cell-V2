import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, Pressable, StatusBar, StyleSheet, Text, TouchableOpacity, View,
  useWindowDimensions, type ViewToken,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadNovelinhas, urlNovelinha, type Novelinha } from '../../services/saimoSources';
import { guardarParadaNovelinha, paradaNovelinha } from '../../services/novelinhasProgresso';

/**
 * Player das novelinhas, feito para o celular em pé (estilo Reels).
 *
 * Cada episódio é uma página da altura da tela: deslizar para cima passa ao
 * próximo, para baixo volta. Só a página da tela toca; a seguinte já tem o
 * player criado, carregando em silêncio, então a troca é instantânea. No fim
 * de um episódio o próximo entra sozinho. Tocar pausa; a lista de episódios
 * pula direto para qualquer um; onde a pessoa parou fica guardado.
 */
export default function NovelinhaPlayer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const [base, setBase] = useState('');
  const [n, setN] = useState<Novelinha | null>(null);
  const [atual, setAtual] = useState(0);
  const [inicio, setInicio] = useState<{ ep: number; t: number } | null>(null);
  const [lista, setLista] = useState(false);
  const rolagem = useRef<FlatList<number>>(null);

  // Em pé enquanto estiver aqui; ao sair, o app volta a girar como antes.
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    return () => { ScreenOrientation.unlockAsync().catch(() => {}); };
  }, []);

  useEffect(() => {
    let vivo = true;
    Promise.all([loadNovelinhas(), paradaNovelinha(String(id))]).then(([{ base: b, lista: l }, parada]) => {
      if (!vivo) return;
      const achada = l.find((x) => x.id === String(id)) || null;
      setBase(b);
      setN(achada);
      const ep = achada ? Math.min(Math.max(1, parada?.ep ?? 1), achada.episodios) : 1;
      setInicio({ ep, t: parada && parada.ep === ep ? parada.t : 0 });
      setAtual(ep - 1);
    });
    return () => { vivo = false; };
  }, [id]);

  const episodios = useMemo(() => (n ? Array.from({ length: n.episodios }, (_, i) => i + 1) : []), [n]);

  const aoVer = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const v = viewableItems.find((x) => x.isViewable);
    if (v && typeof v.index === 'number') setAtual(v.index);
  }).current;

  const irPara = useCallback((indice: number) => {
    if (!n || indice < 0 || indice >= n.episodios) return;
    rolagem.current?.scrollToIndex({ index: indice, animated: true });
    setAtual(indice);
  }, [n]);

  if (!n || !inicio || !base) {
    return (
      <View style={[styles.tela, styles.centro]}>
        <StatusBar hidden />
        <ActivityIndicator color="#FF7EB6" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.tela}>
      <StatusBar hidden />
      <FlatList
        ref={rolagem}
        data={episodios}
        keyExtractor={(e) => String(e)}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={height}
        initialScrollIndex={inicio.ep - 1}
        getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
        onViewableItemsChanged={aoVer}
        viewabilityConfig={{ itemVisiblePercentThreshold: 80 }}
        windowSize={3}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        removeClippedSubviews
        renderItem={({ item: ep, index }) => (
          <Pagina
            n={n}
            ep={ep}
            url={urlNovelinha(base, n, ep)}
            altura={height}
            largura={width}
            ativo={index === atual && !lista}
            perto={Math.abs(index - atual) <= 1}
            comecarEm={ep === inicio.ep ? inicio.t : 0}
            topo={insets.top}
            baixo={insets.bottom}
            aoAcabar={() => irPara(index + 1)}
            aoAbrirLista={() => setLista(true)}
          />
        )}
      />

      <Modal visible={lista} transparent animationType="slide" onRequestClose={() => setLista(false)}>
        <Pressable style={styles.fundoLista} onPress={() => setLista(false)}>
          <Pressable style={[styles.caixaLista, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
            <View style={styles.cabecalhoLista}>
              <Text style={styles.tituloLista} numberOfLines={1}>{n.titulo}</Text>
              <TouchableOpacity onPress={() => setLista(false)} accessibilityLabel="Fechar lista">
                <MaterialIcons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={episodios}
              numColumns={6}
              keyExtractor={(e) => `l${e}`}
              columnWrapperStyle={{ gap: 8 }}
              contentContainerStyle={{ gap: 8 }}
              initialScrollIndex={Math.max(0, Math.floor(atual / 6) - 2)}
              getItemLayout={(_, i) => ({ length: 48, offset: 48 * i, index: i })}
              renderItem={({ item: ep }) => (
                <TouchableOpacity
                  style={[styles.botaoEp, ep - 1 === atual && styles.botaoEpAtual]}
                  onPress={() => { setLista(false); irPara(ep - 1); }}
                >
                  <Text style={[styles.textoEp, ep - 1 === atual && styles.textoEpAtual]}>{ep}</Text>
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

interface PaginaProps {
  n: Novelinha;
  ep: number;
  url: string;
  altura: number;
  largura: number;
  ativo: boolean;
  perto: boolean;
  comecarEm: number;
  topo: number;
  baixo: number;
  aoAcabar: () => void;
  aoAbrirLista: () => void;
}

/** Uma página = um episódio. Longe da tela, só a capa (sem player nenhum). */
const Pagina = memo(function Pagina(p: PaginaProps) {
  return (
    <View style={{ height: p.altura, width: p.largura, backgroundColor: '#000' }}>
      {p.perto ? <Episodio {...p} /> : <Image source={{ uri: p.n.capa }} style={StyleSheet.absoluteFill} contentFit="cover" />}
    </View>
  );
});

function Episodio({ n, ep, url, ativo, comecarEm, topo, baixo, aoAcabar, aoAbrirLista }: PaginaProps) {
  const player = useVideoPlayer(url, (pl) => {
    pl.loop = false;
    pl.timeUpdateEventInterval = 1;
    pl.keepScreenOnWhilePlaying = true;
    if (comecarEm > 0) pl.currentTime = comecarEm;
  });
  const [fracao, setFracao] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const acabar = useRef(aoAcabar);
  acabar.current = aoAcabar;

  // Só o episódio da tela toca; o vizinho fica parado, já carregado.
  useEffect(() => {
    if (ativo) {
      player.play();
      setPausado(false);
      guardarParadaNovelinha(n.id, ep, player.currentTime || 0);
    } else {
      player.pause();
    }
  }, [ativo, player, n.id, ep]);

  useEffect(() => {
    const tempo = player.addListener('timeUpdate', ({ currentTime }) => {
      const d = player.duration;
      setFracao(d ? currentTime / d : 0);
      if (Math.floor(currentTime) % 5 === 0) guardarParadaNovelinha(n.id, ep, currentTime);
    });
    const fim = player.addListener('playToEnd', () => {
      guardarParadaNovelinha(n.id, ep, 0);
      acabar.current();
    });
    const estado = player.addListener('statusChange', ({ status }) => {
      setCarregando(status === 'loading');
      setErro(status === 'error');
    });
    return () => { tempo.remove(); fim.remove(); estado.remove(); };
  }, [player, n.id, ep]);

  const alternar = () => {
    if (player.playing) { player.pause(); setPausado(true); } else { player.play(); setPausado(false); }
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        allowsPictureInPicture={false}
      />
      <Pressable style={StyleSheet.absoluteFill} onPress={alternar} accessibilityLabel={pausado ? 'Continuar' : 'Pausar'} />

      {carregando && !erro && <ActivityIndicator style={styles.meio} color="#fff" size="large" />}
      {pausado && !carregando && (
        <View style={[styles.meio, styles.circulo]} pointerEvents="none">
          <MaterialIcons name="play-arrow" size={44} color="#fff" />
        </View>
      )}
      {erro && <Text style={styles.erro}>Não consegui tocar este episódio. Deslize para o próximo.</Text>}

      <View style={[styles.topo, { paddingTop: topo + 10 }]} pointerEvents="box-none">
        <TouchableOpacity onPress={() => router.back()} style={styles.botao} accessibilityLabel="Voltar">
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.titulo} numberOfLines={1}>{n.titulo}</Text>
          <Text style={styles.sub}>Episódio {ep} de {n.episodios} · {n.dublada ? 'Dublado' : 'Legendado'}</Text>
        </View>
      </View>

      <View style={[styles.lado, { bottom: baixo + 70 }]} pointerEvents="box-none">
        <TouchableOpacity onPress={aoAbrirLista} style={styles.botao} accessibilityLabel="Episódios">
          <MaterialIcons name="format-list-numbered" size={24} color="#fff" />
          <Text style={styles.botaoTexto}>{ep}/{n.episodios}</Text>
        </TouchableOpacity>
        {ep < n.episodios && (
          <TouchableOpacity onPress={aoAcabar} style={styles.botao} accessibilityLabel="Próximo episódio">
            <MaterialIcons name="keyboard-arrow-down" size={28} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {ep === 1 && fracao < 0.15 && !!n.sinopse && (
        <Text style={[styles.sinopse, { bottom: baixo + 22 }]} numberOfLines={4} pointerEvents="none">{n.sinopse}</Text>
      )}

      <View style={[styles.barra, { bottom: baixo }]} pointerEvents="none">
        <View style={[styles.barraCheia, { width: `${fracao * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: '#000' },
  centro: { alignItems: 'center', justifyContent: 'center' },
  meio: { position: 'absolute', top: '50%', left: '50%', marginLeft: -38, marginTop: -38 },
  circulo: { width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  erro: {
    position: 'absolute', top: '45%', left: 24, right: 24, color: '#fff', textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)', padding: 14, borderRadius: 12, overflow: 'hidden',
  },
  topo: {
    position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 10, paddingBottom: 24, backgroundColor: 'rgba(0,0,0,0.35)',
  },
  titulo: { color: '#fff', fontSize: 16, fontWeight: '700' },
  sub: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  botao: {
    minWidth: 48, minHeight: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center', padding: 6,
  },
  botaoTexto: { color: '#fff', fontSize: 10, fontWeight: '700' },
  lado: { position: 'absolute', right: 12, gap: 14, alignItems: 'center' },
  sinopse: {
    position: 'absolute', left: 14, right: 76, color: '#fff', fontSize: 13, lineHeight: 18,
    textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 4,
  },
  barra: { position: 'absolute', left: 0, right: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  barraCheia: { height: 3, backgroundColor: '#FF7EB6' },
  fundoLista: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  caixaLista: { maxHeight: '70%', backgroundColor: '#15151B', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16 },
  cabecalhoLista: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10 },
  tituloLista: { color: '#fff', fontSize: 16, fontWeight: '700', flex: 1 },
  botaoEp: { flex: 1, height: 40, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  botaoEpAtual: { backgroundColor: '#FF7EB6' },
  textoEp: { color: '#fff', fontWeight: '600' },
  textoEpAtual: { color: '#160812', fontWeight: '800' },
});
