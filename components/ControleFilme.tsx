import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
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

/**
 * Controle do filme que está tocando na TV (TV Box, Mac, Windows): barra de
 * progresso que dá para arrastar, tempo, pular 10/30 s, play/pause, trocar de
 * fonte e ouvir no celular. A TV manda a posição a cada poucos segundos; entre
 * um aviso e outro a barra anda sozinha enquanto o filme toca.
 */
export default function ControleFilme({ onAbrirAudio }: { onAbrirAudio: () => void }) {
  const tvState = useConnectStore((s) => s.tvState);
  const tvStateEm = useConnectStore((s) => s.tvStateEm);
  const phoneAudioMode = useConnectStore((s) => s.phoneAudioMode);
  const [agora, setAgora] = useState(Date.now());
  const [arrastando, setArrastando] = useState<number | null>(null);
  // Depois de um comando, a posição esperada vale até a TV confirmar.
  const esperado = useRef<{ pos: number; em: number } | null>(null);

  const vod = tvState?.vod;
  const tocando = !!tvState?.playing;

  useEffect(() => {
    if (!tocando) return;
    const t = setInterval(() => setAgora(Date.now()), 500);
    return () => clearInterval(t);
  }, [tocando]);

  // Estado novo da TV: a posição dela volta a mandar.
  useEffect(() => {
    if (esperado.current && tvStateEm > esperado.current.em + 800) esperado.current = null;
  }, [tvStateEm]);

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

  return (
    <View style={styles.caixa}>
      <View style={styles.topo}>
        {vod.poster ? (
          <Image source={{ uri: vod.poster }} style={styles.logo} resizeMode="contain" />
        ) : (
          <MaterialIcons name="movie" size={18} color={Colors.secondary} />
        )}
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.titulo} numberOfLines={1}>{vod.title}</Text>
          {!!vod.subtitle && <Text style={styles.sub} numberOfLines={1}>{vod.subtitle}</Text>}
        </View>
      </View>

      <Slider
        style={styles.barra}
        minimumValue={0}
        maximumValue={dur > 0 ? dur : 1}
        value={dur > 0 ? mostrado : 0}
        disabled={dur <= 0}
        minimumTrackTintColor={Colors.secondary}
        maximumTrackTintColor="rgba(255,255,255,0.25)"
        thumbTintColor={Colors.secondary}
        onValueChange={(v) => setArrastando(v)}
        onSlidingComplete={(v) => irPara(v)}
      />
      <View style={styles.tempos}>
        <Text style={styles.tempo}>{relogio(mostrado)}</Text>
        <Text style={styles.tempo}>{dur > 0 ? `-${relogio(dur - mostrado)}` : '--:--'}</Text>
      </View>

      <View style={styles.botoes}>
        <TouchableOpacity style={styles.btn} onPress={() => pular(-30000)} accessibilityLabel="Voltar 30 segundos">
          <MaterialIcons name="replay-30" size={26} color={Colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={() => pular(-10000)} accessibilityLabel="Voltar 10 segundos">
          <MaterialIcons name="replay-10" size={26} color={Colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.play} onPress={() => saimoConnect.playPause()} accessibilityLabel={tocando ? 'Pausar' : 'Tocar'}>
          <MaterialIcons name={tocando ? 'pause' : 'play-arrow'} size={30} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={() => pular(10000)} accessibilityLabel="Avançar 10 segundos">
          <MaterialIcons name="forward-10" size={26} color={Colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={() => pular(30000)} accessibilityLabel="Avançar 30 segundos">
          <MaterialIcons name="forward-30" size={26} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.acoes}>
        <TouchableOpacity style={styles.pilula} onPress={() => saimoConnect.trocarFonte(1)}>
          <Feather name="refresh-cw" size={14} color={Colors.textSecondary} />
          <Text style={styles.pilulaTxt}>Outra fonte</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.pilula, phoneAudioMode !== 'none' && styles.pilulaOn]}
          onPress={onAbrirAudio}
        >
          <Ionicons name="headset" size={14} color={phoneAudioMode !== 'none' ? '#fff' : Colors.textSecondary} />
          <Text style={[styles.pilulaTxt, phoneAudioMode !== 'none' && { color: '#fff' }]}>
            {phoneAudioMode !== 'none' ? 'Ouvindo no celular' : 'Ouvir no celular'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  caixa: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  topo: { flexDirection: 'row', alignItems: 'center' },
  logo: { width: 44, height: 44, borderRadius: 8 },
  titulo: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  sub: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  barra: { width: '100%', height: 36, marginTop: 6 },
  tempos: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
  tempo: { color: Colors.textSecondary, fontSize: 12, fontVariant: ['tabular-nums'] },
  botoes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', marginTop: 8 },
  btn: { padding: 8 },
  play: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acoes: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 12 },
  pilula: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  pilulaOn: { backgroundColor: Colors.secondary },
  pilulaTxt: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
});
