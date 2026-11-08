import React, { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence } from 'react-native-reanimated';
import { router } from 'expo-router';

/**
 * Coração em destaque no topo das telas principais: abre "Apoie o Saimo TV".
 * Fica no cabeçalho, e não na barra de abas, que no celular já não tem espaço.
 * Pulsa de leve para chamar atenção sem atrapalhar.
 */
export default function BotaoApoie() {
  const escala = useSharedValue(1);
  useEffect(() => {
    escala.value = withRepeat(withSequence(withTiming(1.08, { duration: 900 }), withTiming(1, { duration: 900 })), -1);
  }, [escala]);
  const animado = useAnimatedStyle(() => ({ transform: [{ scale: escala.value }] }));

  return (
    <Pressable onPress={() => router.push('/apoie' as any)} accessibilityRole="button" accessibilityLabel="Apoie o Saimo TV" hitSlop={6}>
      <Animated.View style={animado}>
        <LinearGradient colors={['#0FA89A', '#2563EB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.botao}>
          <MaterialIcons name="favorite" size={20} color="#FFFFFF" />
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  botao: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
