/**
 * Primeira tela para quem ainda não entrou numa conta: entrar ou criar conta
 * (esquerda, ou em cima no celular em pé) e entrar sem login (direita, ou
 * embaixo). A conta é opcional.
 */
import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, BorderRadius, Spacing } from '../constants/Colors';
import { Entrar } from '../components/ContaSaimo';
import { aoMudarConta } from '../services/conta';
import { deveEscolherAoAbrir } from '../services/perfis';

export const CHAVE_BOAS_VINDAS = 'saimo-boas-vindas-feito';

export default function BoasVindas() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const lado = width >= 700;

  const seguir = React.useCallback(() => {
    if (deveEscolherAoAbrir()) router.replace('/perfis?obrigatoria=1' as any);
    else router.back();
  }, [router]);

  // Entrou na conta aqui mesmo: segue.
  useEffect(() => aoMudarConta((e) => { if (e.token) seguir(); }), [seguir]);

  const semLogin = async () => {
    await AsyncStorage.setItem(CHAVE_BOAS_VINDAS, '1').catch(() => {});
    seguir();
  };

  return (
    <SafeAreaView style={styles.tela} testID="boas-vindas">
      <ScrollView contentContainerStyle={[styles.conteudo, lado && styles.conteudoLado]} keyboardShouldPersistTaps="handled">
        <View style={[styles.cartao, styles.cartaoConta, lado && styles.cartaoLado]}>
          <Text style={styles.titulo}>Entrar ou criar conta</Text>
          <Text style={styles.porque}>Por que criar uma conta?</Text>
          <Text style={styles.item}>• Perfis, favoritos, listas e addons guardados e em qualquer aparelho.</Text>
          <Text style={styles.item}>• Continue de onde parou no celular, na TV e no computador.</Text>
          <Text style={styles.item}>• Trocou de aparelho ou reinstalou? Nada se perde.</Text>
          <Entrar />
        </View>
        <View style={[styles.cartao, lado && styles.cartaoLado]}>
          <Text style={styles.titulo}>Entrar sem login</Text>
          <Text style={styles.texto}>
            <Text style={styles.forte}>A conta não é obrigatória.</Text> Dá para usar o Saimo TV inteiro sem entrar:
            tudo fica guardado só neste aparelho.
          </Text>
          <Text style={styles.texto}>Crie a conta quando quiser, em Ajustes &gt; Conta Saimo.</Text>
          <TouchableOpacity style={styles.botao} onPress={() => void semLogin()} testID="boas-vindas-sem-login">
            <Text style={styles.botaoTexto}>Entrar sem login</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: Colors.background },
  conteudo: { padding: Spacing.md, gap: 14 },
  conteudoLado: { flexDirection: 'row', alignItems: 'flex-start' },
  cartao: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md },
  cartaoLado: { flex: 1 },
  cartaoConta: { borderWidth: 2, borderColor: Colors.primary },
  titulo: { color: Colors.text, fontSize: 22, fontWeight: '800' },
  porque: { color: Colors.text, fontSize: 15, fontWeight: '700', marginTop: 12 },
  item: { color: Colors.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 4 },
  texto: { color: Colors.textSecondary, fontSize: 15, lineHeight: 22, marginTop: 10 },
  forte: { color: Colors.text, fontWeight: '800' },
  botao: { backgroundColor: Colors.primary, borderRadius: BorderRadius.md, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  botaoTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
