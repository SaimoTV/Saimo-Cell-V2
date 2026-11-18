import React from 'react';
import { ScrollView, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../constants/Colors';
import ContaSaimo from '../components/ContaSaimo';
import { codigoDoQr } from '../services/conta';

/**
 * Aberta pelo QR da TV (saimo://conectar?c=ABCD2345, ou pelo site
 * saimo-tv.com.br/conectar): entra na conta, se preciso, e aprova a TV.
 */
export default function Conectar() {
  const { c } = useLocalSearchParams<{ c?: string }>();
  const insets = useSafeAreaInsets();
  const codigo = c ? codigoDoQr(`?c=${c}`) ?? '' : '';
  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={{ padding: Spacing.lg, paddingTop: insets.top + Spacing.lg }}>
      <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/' as any))} style={{ marginBottom: 12 }}>
        <Ionicons name="arrow-back" size={24} color={Colors.text} />
      </TouchableOpacity>
      <Text style={styles.titulo}>Entrar numa TV</Text>
      <ContaSaimo codigoTv={codigo ? `${codigo.slice(0, 4)}-${codigo.slice(4)}` : undefined} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  titulo: { color: Colors.text, fontSize: 24, fontWeight: '800', marginBottom: Spacing.md },
});
