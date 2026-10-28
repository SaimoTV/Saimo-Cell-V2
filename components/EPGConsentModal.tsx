
import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Colors, Spacing, BorderRadius, Typography, Shadows } from '../constants/Colors';
import { Ionicons } from '@expo/vector-icons';

interface EPGConsentModalProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

const { width } = Dimensions.get('window');

export default function EPGConsentModal({ visible, onAccept, onDecline }: EPGConsentModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <BlurView intensity={20} style={StyleSheet.absoluteFill} tint="dark" />
        
        <View style={styles.modalContainer}>
          <View style={styles.iconContainer}>
            <Ionicons name="list-outline" size={40} color={Colors.primary} />
          </View>
          
          <Text style={styles.title}>Carregar Guia de TV?</Text>
          
          <Text style={styles.message}>
            O carregamento do guia de programação (EPG) pode levar cerca de 10 minutos na primeira vez.
            {'\n\n'}
            Isso pode causar lentidão temporária no aplicativo.
          </Text>

          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={[styles.button, styles.declineButton]} 
              onPress={onDecline}
              activeOpacity={0.8}
            >
              <Text style={styles.declineText}>Não carregar</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.button, styles.acceptButton]} 
              onPress={onAccept}
              activeOpacity={0.8}
            >
              <Text style={styles.acceptText}>Sim, carregar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  modalContainer: {
    width: Math.min(width - Spacing.xl * 2, 400),
    backgroundColor: Colors.cardBg,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    ...Shadows.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(229, 9, 20, 0.1)', // Colors.primary com opacidade
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    color: Colors.text,
    fontSize: Typography.h2.fontSize,
    fontWeight: '700',
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  message: {
    color: Colors.textSecondary,
    fontSize: Typography.body.fontSize,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
  },
  button: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineButton: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  acceptButton: {
    backgroundColor: Colors.primary,
  },
  declineText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  acceptText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
