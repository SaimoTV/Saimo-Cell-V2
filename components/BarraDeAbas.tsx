import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Tabs } from 'expo-router';
import { Colors } from '../constants/Colors';

type NomeIcone = React.ComponentProps<typeof MaterialIcons>['name'];
type BottomTabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

/** Ícone de cada aba: o cheio quando ativa, o contornado quando não. */
const ICONES: Record<string, { ativo: NomeIcone; inativo: NomeIcone }> = {
  index: { ativo: 'live-tv', inativo: 'live-tv' },
  favorites: { ativo: 'favorite', inativo: 'favorite-border' },
  movies: { ativo: 'movie', inativo: 'movie-filter' },
  downloads: { ativo: 'download-for-offline', inativo: 'download' },
  events: { ativo: 'event', inativo: 'event-note' },
  settings: { ativo: 'settings', inativo: 'settings' },
};

/** Altura da cápsula (as telas descontam isto mais a área segura). */
export const ALTURA_DA_BARRA = 60;

/**
 * Barra de abas flutuante, no jeito do Material 3: cápsula escura com sombra,
 * seis espaços iguais com o nome sempre à vista e, atrás do ícone da aba
 * ativa, um indicador em degradê que entra com uma mola. Nada muda de largura
 * ao trocar de aba, então o toque cai sempre onde a pessoa vê.
 */
export default function BarraDeAbas({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={[styles.raiz, { bottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.capsula}>
        {state.routes.map((rota, indice) => {
          const { options } = descriptors[rota.key];
          const ativa = state.index === indice;
          const titulo = typeof options.title === 'string' ? options.title : rota.name;
          const icone = ICONES[rota.name] ?? { ativo: 'circle', inativo: 'circle' };

          const aoTocar = () => {
            const evento = navigation.emit({ type: 'tabPress', target: rota.key, canPreventDefault: true });
            if (!ativa && !evento.defaultPrevented) navigation.navigate(rota.name, rota.params);
          };
          const aoSegurar = () => navigation.emit({ type: 'tabLongPress', target: rota.key });

          return (
            <Pressable
              key={rota.key}
              onPress={aoTocar}
              onLongPress={aoSegurar}
              accessibilityRole="tab"
              accessibilityState={{ selected: ativa }}
              accessibilityLabel={titulo}
              style={styles.item}
            >
              <View style={styles.trilho}>
                {ativa && (
                  <Animated.View
                    entering={ZoomIn.springify().damping(14).stiffness(260)}
                    style={StyleSheet.absoluteFill}
                  >
                    <LinearGradient
                      colors={[Colors.gradientStart, Colors.gradientEnd]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.indicador}
                    />
                  </Animated.View>
                )}
                <MaterialIcons
                  name={ativa ? icone.ativo : icone.inativo}
                  size={22}
                  color={ativa ? '#FFFFFF' : Colors.textSecondary}
                />
              </View>
              <Text numberOfLines={1} style={[styles.rotulo, ativa ? styles.rotuloAtivo : null]}>
                {titulo}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    position: 'absolute',
    left: 10,
    right: 10,
  },
  capsula: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ALTURA_DA_BARRA,
    paddingHorizontal: 4,
    borderRadius: 26,
    backgroundColor: 'rgba(18, 18, 27, 0.98)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 16 },
    }),
  },
  item: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  trilho: {
    width: 54,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicador: {
    flex: 1,
    borderRadius: 15,
  },
  rotulo: {
    fontSize: 10.5,
    fontWeight: '600',
    color: Colors.textSecondary,
    letterSpacing: 0.1,
  },
  rotuloAtivo: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
