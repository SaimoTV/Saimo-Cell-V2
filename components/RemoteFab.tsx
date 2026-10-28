import React, { useRef, useState, useEffect } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Dimensions,
  View,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConnectStore } from '../stores/connectStore';
import { Colors } from '../constants/Colors';

const FAB_SIZE = 56;
const DRAG_THRESHOLD = 8; // Pixels de tolerância para diferenciar toque de arrasto

export default function RemoteFab() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const status = useConnectStore((s) => s.status);
  const setRemoteVisible = useConnectStore((s) => s.setRemoteVisible);
  const setSheetVisible = useConnectStore((s) => s.setSheetVisible);

  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

  // O FAB NUNCA aparece se estiver reproduzindo TV ou filme/série
  const isPlayerActive =
    pathname.includes('/player') || pathname.includes('/media-player');

  // Limites da tela para não permitir que o botão saia da área visível
  const minX = 12;
  const maxX = screenWidth - FAB_SIZE - 12;
  const minY = Math.max(insets.top + 10, 40);
  const maxY = screenHeight - insets.bottom - FAB_SIZE - 20;

  // Posição inicial: canto inferior direito (acima da tab bar)
  const initialX = maxX;
  const initialY = screenHeight - 160;

  // Coordenadas acumuladas do FAB
  const currentPos = useRef({ x: initialX, y: initialY });
  const pan = useRef(new Animated.ValueXY({ x: initialX, y: initialY })).current;

  // Escala ao tocar (efeito tátil)
  const scale = useRef(new Animated.Value(1)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.hypot(gesture.dx, gesture.dy) > 3,

      onPanResponderGrant: () => {
        pan.setOffset({
          x: currentPos.current.x,
          y: currentPos.current.y,
        });
        pan.setValue({ x: 0, y: 0 });

        Animated.spring(scale, {
          toValue: 0.92,
          useNativeDriver: false,
        }).start();
      },

      onPanResponderMove: (_, gesture) => {
        // Calcula a nova posição com limites
        const rawX = currentPos.current.x + gesture.dx;
        const rawY = currentPos.current.y + gesture.dy;

        const clampedX = Math.min(Math.max(rawX, minX), maxX);
        const clampedY = Math.min(Math.max(rawY, minY), maxY);

        pan.setValue({
          x: clampedX - currentPos.current.x,
          y: clampedY - currentPos.current.y,
        });
      },

      onPanResponderRelease: (_, gesture) => {
        pan.flattenOffset();

        Animated.spring(scale, {
          toValue: 1,
          friction: 4,
          useNativeDriver: false,
        }).start();

        const moveDist = Math.hypot(gesture.dx, gesture.dy);

        if (moveDist < DRAG_THRESHOLD) {
          // FOI UM TOQUE: abre o controle ou a folha de conexão
          const currentStatus = useConnectStore.getState().status;
          if (currentStatus === 'connected') {
            setRemoteVisible(true);
          } else {
            setSheetVisible(true);
          }
        } else {
          // FOI UM ARRASTO: fixa a nova posição escolhida pelo usuário
          const finalX = Math.min(
            Math.max(currentPos.current.x + gesture.dx, minX),
            maxX
          );
          const finalY = Math.min(
            Math.max(currentPos.current.y + gesture.dy, minY),
            maxY
          );
          currentPos.current = { x: finalX, y: finalY };
          pan.setValue({ x: finalX, y: finalY });
        }
      },
    })
  ).current;

  if (isPlayerActive) {
    return null;
  }

  const isConnected = status === 'connected';
  const isPending = status === 'connecting' || status === 'discovering';

  const badgeColor = isConnected
    ? Colors.success
    : isPending
    ? '#F59E0B'
    : Colors.textMuted;

  const borderColor = isConnected
    ? 'rgba(16, 185, 129, 0.5)'
    : isPending
    ? 'rgba(245, 158, 11, 0.5)'
    : 'rgba(99, 102, 241, 0.4)';

  const iconName = isConnected ? 'settings-remote' : 'cast';
  const iconColor = isConnected
    ? '#fff'
    : isPending
    ? '#F59E0B'
    : Colors.primaryLight;

  return (
    <Animated.View
      style={[
        styles.fabContainer,
        {
          transform: [
            { translateX: pan.x },
            { translateY: pan.y },
            { scale: scale },
          ],
        },
      ]}
      {...panResponder.panHandlers}
    >
      <View style={[styles.fabCircle, { borderColor }]}>
        <MaterialIcons
          name={iconName}
          size={isConnected ? 26 : 24}
          color={iconColor}
        />
        {/* LED indicador de status da conexão */}
        <View style={[styles.statusLed, { backgroundColor: badgeColor }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fabContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: FAB_SIZE,
    height: FAB_SIZE,
    zIndex: 9999,
    elevation: 12,
  },
  fabCircle: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: '#1E1F38',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  statusLed: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1.5,
    borderColor: '#1E1F38',
  },
});
