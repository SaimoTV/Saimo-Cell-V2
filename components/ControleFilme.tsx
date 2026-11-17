import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, ActivityIndicator } from 'react-native';
import Slider from '@react-native-community/slider';
import { MaterialIcons, Feather, Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { useConnectStore } from '../stores/connectStore';
import { saimoConnect } from '../services/saimoConnect';

/** "1:05:09" ou "5:09" */
function relogio(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const dd = (n: number) => (n < 10 ? '0' : '') + n;
  return h > 0 ? `${h}:${dd(m)}:${dd(s)}` : `${m}:${dd(s)}`;
}

function Acao({ icone, texto, ativo, onPress }: {
  icone: React.ReactNode; texto: string; ativo?: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.acao, ativo && styles.acaoAtiva]} onPress={onPress} activeOpacity={0.75}>
      {icone}
      <Text style={[styles.acaoTxt, ativo && { color: '#fff' }]} numberOfLines={1}>{texto}</Text>
    </TouchableOpacity>
  );
}

/**
 * A tela do Saimo Connect quando a TV está num filme ou numa série: a capa e o
 * nome grandes, a barra de progresso (arrastável, anda sozinha entre um aviso
 * da TV e outro), voltar/avançar 10 e 30 s, play/pausa, e as ações que fazem
 * sentido aqui — episódios e próximo episódio na série, outra fonte, ouvir no
 * celular, volume e sair. Nada de canal, 123 ou multi tela.
 *
 * `setasAbertas`/`onSetas`: mostra o direcional embaixo, para mexer nos menus
 * do player na TV (legenda, áudio) quando preciso.
 */
export default function ControleFilme({ onAbrirAudio, setasAbertas, onSetas }: {
  onAbrirAudio: () => void;
  setasAbertas?: boolean;
  onSetas?: () => void;
}) {
  const tvState = useConnectStore((s) => s.tvState);
  const tvStateEm = useConnectStore((s) => s.tvStateEm);
  const phoneAudioMode = useConnectStore((s) => s.phoneAudioMode);
  const episodiosTv = useConnectStore((s) => s.episodiosTv);
  const [agora, setAgora] = useState(Date.now());
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [episodiosAbertos, setEpisodiosAbertos] = useState(false);
  const [temporadaVista, setTemporadaVista] = useState<number | null>(null);
  // Depois de um comando, a posição esperada vale até a TV confirmar.
  const esperado = useRef<{ pos: number; em: number } | null>(null);

  const vod = tvState?.vod;
  const tocando = !!tvState?.playing;
  const temporadas = vod?.temporadas ?? [];
  const ehSerie = !!vod?.serie && temporadas.length > 0;
  const temporada = temporadaVista ?? vod?.temporada ?? temporadas[0] ?? 1;

  useEffect(() => {
    if (!tocando) return;
    const t = setInterval(() => setAgora(Date.now()), 500);
    return () => clearInterval(t);
  }, [tocando]);

  // Estado novo da TV: a posição dela volta a mandar.
  useEffect(() => {
    if (esperado.current && tvStateEm > esperado.current.em + 800) esperado.current = null;
  }, [tvStateEm]);

  // Lista de episódios: pede a temporada mostrada sempre que a lista abre ou o episódio muda.
  useEffect(() => {
    if (episodiosAbertos && ehSerie) saimoConnect.pedirEpisodios(temporada);
  }, [episodiosAbertos, ehSerie, temporada, vod?.episodio]);

  if (!vod) return null;
  const dur = vod.dur > 0 ? vod.dur : 0;
  let pos: number;
  if (esperado.current) {
    pos = esperado.current.pos + (tocando ? agora - esperado.current.em : 0);
  } else {
    pos = vod.pos + (tocando ? Math.max(0, agora - tvStateEm) : 0);
  }
  if (dur > 0) pos = Math.min(pos, dur);
  const mostrado = arrastando ?? pos;

  const pular = (delta: number) => {
    const alvo = Math.max(0, dur > 0 ? Math.min(dur - 1000, pos + delta) : pos + delta);
    esperado.current = { pos: alvo, em: Date.now() };
    setAgora(Date.now());
    saimoConnect.pular(delta);
  };
  const irPara = (ms: number) => {
    esperado.current = { pos: ms, em: Date.now() };
    setArrastando(null);
    setAgora(Date.now());
    saimoConnect.irPara(ms);
  };

  const lista = episodiosTv?.temporada === temporada ? episodiosTv.lista : null;
  const proximo = ehSerie && vod.temporada && vod.episodio
    ? { temporada: vod.temporada, episodio: vod.episodio + 1 }
    : null;

  return (
    <View>
      {/* Capa, nome e episódio */}
      <View style={styles.hero}>
        {vod.poster ? (
          <Image source={{ uri: vod.poster }} style={styles.capa} resizeMode="contain" />
        ) : (
          <View style={[styles.capa, styles.capaVazia]}>
            <MaterialIcons name={ehSerie ? 'video-library' : 'movie'} size={34} color={Colors.secondary} />
          </View>
        )}
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={styles.selo}>{ehSerie ? 'SÉRIE' : 'FILME'}{tocando ? '  ·  TOCANDO' : '  ·  PAUSADO'}</Text>
          <Text style={styles.titulo} numberOfLines={2}>{vod.title}</Text>
          {!!vod.subtitle && <Text style={styles.sub} numberOfLines={2}>{vod.subtitle}</Text>}
        </View>
      </View>

      {/* Progresso */}
      <Slider
        style={styles.barra}
        minimumValue={0}
        maximumValue={dur > 0 ? dur : 1}
        value={dur > 0 ? mostrado : 0}
        disabled={dur <= 0}
        minimumTrackTintColor={Colors.secondary}
        maximumTrackTintColor="rgba(255,255,255,0.22)"
        thumbTintColor={Colors.secondary}
        onValueChange={(v) => setArrastando(v)}
        onSlidingComplete={(v) => irPara(v)}
      />
      <View style={styles.tempos}>
        <Text style={styles.tempo}>{relogio(mostrado)}</Text>
        <Text style={styles.tempo}>{dur > 0 ? `-${relogio(dur - mostrado)}` : '--:--'}</Text>
      </View>

      {/* Transporte */}
      <View style={styles.botoes}>
        <TouchableOpacity style={styles.btn} onPress={() => pular(-30000)} accessibilityLabel="Voltar 30 segundos">
          <MaterialIcons name="replay-30" size={30} color={Colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={() => pular(-10000)} accessibilityLabel="Voltar 10 segundos">
          <MaterialIcons name="replay-10" size={30} color={Colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.play} onPress={() => saimoConnect.playPause()} accessibilityLabel={tocando ? 'Pausar' : 'Tocar'}>
          <MaterialIcons name={tocando ? 'pause' : 'play-arrow'} size={38} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={() => pular(10000)} accessibilityLabel="Avançar 10 segundos">
          <MaterialIcons name="forward-10" size={30} color={Colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={() => pular(30000)} accessibilityLabel="Avançar 30 segundos">
          <MaterialIcons name="forward-30" size={30} color={Colors.text} />
        </TouchableOpacity>
      </View>

      {/* Ações do momento */}
      <View style={styles.acoes}>
        {ehSerie && (
          <Acao
            icone={<MaterialIcons name="video-library" size={20} color={episodiosAbertos ? '#fff' : Colors.textSecondary} />}
            texto="Episódios"
            ativo={episodiosAbertos}
            onPress={() => setEpisodiosAbertos((v) => !v)}
          />
        )}
        {proximo && (
          <Acao
            icone={<MaterialIcons name="skip-next" size={20} color={Colors.textSecondary} />}
            texto="Próximo"
            onPress={() => saimoConnect.escolherEpisodio(proximo.temporada, proximo.episodio)}
          />
        )}
        {(tvState?.versaoConnect ?? 0) < 2 && (
          <Acao
            icone={<Feather name="refresh-cw" size={18} color={Colors.textSecondary} />}
            texto="Outra fonte"
            onPress={() => saimoConnect.trocarFonte(1)}
          />
        )}
        <Acao
          icone={<Ionicons name="headset" size={19} color={phoneAudioMode !== 'none' ? '#fff' : Colors.textSecondary} />}
          texto={phoneAudioMode !== 'none' ? 'No celular' : 'Ouvir aqui'}
          ativo={phoneAudioMode !== 'none'}
          onPress={onAbrirAudio}
        />
        <Acao
          icone={<MaterialIcons name="volume-down" size={21} color={Colors.textSecondary} />}
          texto="Vol −"
          onPress={() => saimoConnect.setVolume(-5)}
        />
        <Acao
          icone={<MaterialIcons name="volume-up" size={21} color={Colors.textSecondary} />}
          texto="Vol +"
          onPress={() => saimoConnect.setVolume(5)}
        />
        {onSetas && (
          <Acao
            icone={<MaterialIcons name="gamepad" size={20} color={setasAbertas ? '#fff' : Colors.textSecondary} />}
            texto="Setas"
            ativo={setasAbertas}
            onPress={onSetas}
          />
        )}
        <Acao
          icone={<Ionicons name="exit-outline" size={20} color={Colors.textSecondary} />}
          texto="Sair"
          onPress={() => saimoConnect.sendKey('BACK')}
        />
      </View>

      {/* Temporadas e episódios */}
      {ehSerie && episodiosAbertos && (
        <View style={styles.episodios}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {temporadas.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.chip, t === temporada && styles.chipOn]}
                onPress={() => setTemporadaVista(t)}
              >
                <Text style={[styles.chipTxt, t === temporada && { color: '#fff' }]}>Temporada {t}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {!lista ? (
            <ActivityIndicator style={{ marginVertical: 18 }} color={Colors.secondary} />
          ) : lista.length === 0 ? (
            <Text style={styles.vazio}>Sem episódios nesta temporada.</Text>
          ) : (
            lista.map((e) => {
              const noAr = e.noAr || (temporada === vod.temporada && e.numero === vod.episodio);
              return (
                <TouchableOpacity
                  key={e.numero}
                  style={[styles.ep, noAr && styles.epNoAr]}
                  onPress={() => !noAr && saimoConnect.escolherEpisodio(temporada, e.numero)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.epNum, noAr && { color: Colors.secondary }]}>{e.numero}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.epTitulo} numberOfLines={1}>{e.titulo || `Episódio ${e.numero}`}</Text>
                    {e.visto != null && e.visto > 0 && (
                      <View style={styles.epTrilho}>
                        <View style={[styles.epBarra, { width: `${Math.min(100, Math.round(e.visto * 100))}%` }]} />
                      </View>
                    )}
                  </View>
                  {noAr ? (
                    <Text style={styles.epAgora}>NO AR</Text>
                  ) : (
                    <MaterialIcons name="play-circle-outline" size={22} color={Colors.textSecondary} />
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  capa: { width: 92, height: 92, borderRadius: 14 },
  capaVazia: { backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  selo: { color: Colors.secondary, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  titulo: { color: Colors.text, fontSize: 20, fontWeight: '800', marginTop: 2 },
  sub: { color: Colors.textSecondary, fontSize: 13, marginTop: 3 },
  barra: { width: '100%', height: 38, marginTop: 8 },
  tempos: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -6, paddingHorizontal: 4 },
  tempo: { color: Colors.textSecondary, fontSize: 12, fontVariant: ['tabular-nums'] },
  botoes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', marginTop: 10 },
  btn: { padding: 8 },
  play: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18, justifyContent: 'center' },
  acao: {
    width: '23%',
    minWidth: 72,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  acaoAtiva: { backgroundColor: Colors.secondary },
  acaoTxt: { color: Colors.textSecondary, fontSize: 11, fontWeight: '700' },
  episodios: { marginTop: 16, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.07)' },
  chipOn: { backgroundColor: Colors.secondary },
  chipTxt: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700' },
  vazio: { color: Colors.textSecondary, textAlign: 'center', marginVertical: 16 },
  ep: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 6, borderRadius: 12, marginTop: 6 },
  epNoAr: { backgroundColor: 'rgba(139,92,246,0.16)' },
  epNum: { width: 26, textAlign: 'center', color: Colors.textSecondary, fontSize: 15, fontWeight: '800' },
  epTitulo: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  epTrilho: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', marginTop: 6, overflow: 'hidden' },
  epBarra: { height: 3, backgroundColor: Colors.secondary },
  epAgora: { color: Colors.secondary, fontSize: 11, fontWeight: '800' },
});
