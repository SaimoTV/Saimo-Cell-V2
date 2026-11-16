import React, { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { router } from 'expo-router';

const CORES = ['#FF4D8D', '#A855F7', '#3B82F6', '#14B8A6', '#F59E0B', '#FF4D8D'];
const PASSOS = CORES.map((_, i) => i / (CORES.length - 1));

/**
 * Coração em destaque no topo das telas principais: abre "Apoie o Saimo TV".
 * Fica no cabeçalho, e não na barra de abas, que no celular já não tem espaço.
 * Chamativo de propósito: a cor corre pelo arco-íris e um halo pulsa em volta.
 * Com "reduzir movimento" ligado no sistema, fica colorido e parado.
 */
export default function BotaoApoie() {
  const reduzir = useReducedMotion();
  const cor = useSharedValue(0);
  const pulso = useSharedValue(0);

  useEffect(() => {
    if (reduzir) return;
    cor.value = withRepeat(withTiming(1, { duration: 4000, easing: Easing.linear }), -1);
    pulso.value = withRepeat(
      withSequence(withTiming(1, { duration: 800 }), withTiming(0, { duration: 800 })),
      -1,
    );
  }, [cor, pulso, reduzir]);

  const fundo = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(cor.value, PASSOS, CORES),
    transform: [{ scale: 1 + pulso.value * 0.08 }],
  }));
  const halo = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(cor.value, PASSOS, CORES),
    opacity: 0.45 * (1 - pulso.value),
    transform: [{ scale: 1 + pulso.value * 0.55 }],
  }));

  if (Platform.OS === 'ios') return null;
  return (
    <Pressable onPress={() => router.push('/apoie' as any)} accessibilityRole="button" accessibilityLabel="Apoie o Saimo TV" hitSlop={6}>
      <View style={styles.caixa}>
        <Animated.View style={[styles.halo, halo]} />
        <Animated.View style={[styles.botao, fundo]}>
          <MaterialIcons name="favorite" size={20} color="#FFFFFF" />
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  caixa: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 40, height: 40, borderRadius: 20 },
  botao: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
