import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Modal, 
  Pressable, 
  TextInput,
  Animated,
  Vibration,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius, Spacing, Typography, Shadows } from '../constants/Colors';
import { useSettingsStore } from '../stores/settingsStore';

interface PinModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  mode?: 'verify' | 'change';
}

const PIN_LENGTH = 4;

export default function PinModal({ 
  visible, 
  onClose, 
  onSuccess,
  mode = 'verify',
}: PinModalProps) {
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState<'current' | 'new' | 'confirm'>('current');
  
  const { verifyPin, setAdultPin } = useSettingsStore();
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      // Reset state when modal closes
      setPin('');
      setNewPin('');
      setConfirmPin('');
      setError('');
      setStep('current');
    }
  }, [visible]);

  const shake = useCallback(() => {
    Vibration.vibrate(100);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const handleKeyPress = useCallback((digit: string) => {
    if (mode === 'verify') {
      if (pin.length < PIN_LENGTH) {
        const newValue = pin + digit;
        setPin(newValue);
        setError('');
        
        if (newValue.length === PIN_LENGTH) {
          if (verifyPin(newValue)) {
            onSuccess();
            onClose();
          } else {
            shake();
            setError('PIN incorreto');
            setTimeout(() => setPin(''), 300);
          }
        }
      }
    } else {
      // Change mode
      if (step === 'current') {
        if (pin.length < PIN_LENGTH) {
          const newValue = pin + digit;
          setPin(newValue);
          setError('');
          
          if (newValue.length === PIN_LENGTH) {
            if (verifyPin(newValue)) {
              setStep('new');
              setPin('');
            } else {
              shake();
              setError('PIN atual incorreto');
              setTimeout(() => setPin(''), 300);
            }
          }
        }
      } else if (step === 'new') {
        if (newPin.length < PIN_LENGTH) {
          const newValue = newPin + digit;
          setNewPin(newValue);
          setError('');
          
          if (newValue.length === PIN_LENGTH) {
            setStep('confirm');
          }
        }
      } else {
        if (confirmPin.length < PIN_LENGTH) {
          const newValue = confirmPin + digit;
          setConfirmPin(newValue);
          setError('');
          
          if (newValue.length === PIN_LENGTH) {
            if (newValue === newPin) {
              setAdultPin(newValue);
              onSuccess();
              onClose();
            } else {
              shake();
              setError('PINs não conferem');
              setConfirmPin('');
            }
          }
        }
      }
    }
  }, [pin, newPin, confirmPin, step, mode, verifyPin, setAdultPin, onSuccess, onClose, shake]);

  const handleDelete = useCallback(() => {
    if (mode === 'verify') {
      setPin(prev => prev.slice(0, -1));
    } else {
      if (step === 'current') {
        setPin(prev => prev.slice(0, -1));
      } else if (step === 'new') {
        setNewPin(prev => prev.slice(0, -1));
      } else {
        setConfirmPin(prev => prev.slice(0, -1));
      }
    }
    setError('');
  }, [mode, step]);

  const currentValue = mode === 'verify' 
    ? pin 
    : step === 'current' ? pin : step === 'new' ? newPin : confirmPin;

  const getTitle = () => {
    if (mode === 'verify') return 'Digite o PIN';
    if (step === 'current') return 'PIN Atual';
    if (step === 'new') return 'Novo PIN';
    return 'Confirmar PIN';
  };

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <BlurView intensity={50} style={styles.backdrop}>
        <Animated.View 
          style={[
            styles.container,
            { transform: [{ translateX: shakeAnim }] }
          ]}
        >
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </Pressable>

          <Ionicons name="lock-closed" size={40} color={Colors.primary} />
          <Text style={styles.title}>{getTitle()}</Text>
          <Text style={styles.subtitle}>
            {mode === 'verify' 
              ? 'Conteúdo restrito a maiores de 18 anos'
              : 'Digite 4 dígitos'}
          </Text>

          {/* PIN Dots */}
          <View style={styles.dotsContainer}>
            {Array(PIN_LENGTH).fill(0).map((_, i) => (
              <View 
                key={i}
                style={[
                  styles.dot,
                  i < currentValue.length && styles.dotFilled,
                  error && styles.dotError,
                ]}
              />
            ))}
          </View>

          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : null}

          {/* Keypad */}
          <View style={styles.keypad}>
            {digits.map((digit, index) => {
              if (digit === '') {
                return <View key={index} style={styles.keyEmpty} />;
              }
              if (digit === 'del') {
                return (
                  <Pressable
                    key={index}
                    style={styles.key}
                    onPress={handleDelete}
                  >
                    <Ionicons name="backspace-outline" size={24} color={Colors.text} />
                  </Pressable>
                );
              }
              return (
                <Pressable
                  key={index}
                  style={({ pressed }) => [
                    styles.key,
                    pressed && styles.keyPressed,
                  ]}
                  onPress={() => handleKeyPress(digit)}
                >
                  <Text style={styles.keyText}>{digit}</Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  container: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xxl,
    alignItems: 'center',
    width: '85%',
    maxWidth: 340,
    ...Shadows.lg,
  },
  closeButton: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    padding: Spacing.xs,
  },
  title: {
    color: Colors.text,
    fontSize: Typography.h2.fontSize,
    fontWeight: '700',
    marginTop: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: Typography.caption.fontSize,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dotError: {
    borderColor: Colors.error,
    backgroundColor: Colors.error,
  },
  error: {
    color: Colors.error,
    fontSize: Typography.caption.fontSize,
    marginBottom: Spacing.md,
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 240,
    justifyContent: 'center',
    gap: Spacing.md,
  },
  key: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyPressed: {
    backgroundColor: Colors.primary,
  },
  keyEmpty: {
    width: 64,
    height: 64,
  },
  keyText: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: '600',
  },
});
