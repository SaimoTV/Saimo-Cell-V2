import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { useBrilhoStore, BRILHO_ESCURO } from '../stores/brilhoStore';

/**
 * O véu do brilho do app, por cima de tudo. Com a tela escura (0 a 5%),
 * qualquer toque não faz nada além de trazer o brilho de volta, devagar (1,5 s):
 * quem não vê nada não acharia o ajuste.
 */
export default function VeuDeBrilho() {
  const brilho = useBrilhoStore((s) => s.brilho);
  const definir = useBrilhoStore((s) => s.definir);
  const opacidade = useRef(new Animated.Value(1 - brilho / 100)).current;
  const voltando = useRef(false);

  useEffect(() => {
    if (voltando.current) return;
    opacidade.setValue(1 - brilho / 100);
  }, [brilho, opacidade]);

  const voltar = () => {
    voltando.current = true;
    Animated.timing(opacidade, { toValue: 0, duration: 1500, useNativeDriver: true }).start(() => {
      voltando.current = false;
      definir(100);
    });
  };

  if (brilho >= 100 && !voltando.current) return null;
  const escuro = brilho <= BRILHO_ESCURO;
  return (
    <Animated.View
      pointerEvents={escuro ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, styles.veu, { opacity: opacidade }]}
    >
      {escuro && <Pressable style={StyleSheet.absoluteFill} onPress={voltar} accessibilityLabel="Voltar o brilho ao normal" />}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  veu: { backgroundColor: '#000', zIndex: 9999, elevation: 9999 },
});
