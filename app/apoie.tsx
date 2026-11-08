import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Linking, Share } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/Colors';
import { router } from 'expo-router';

/** Página de doação (Pix ou cripto, pela Deflow). */
export const LINK_DOACAO = 'https://deflow.exchange/pt/qr/saimo-tv';
const TURQUESA = '#4FE3D0';

type NomeIcone = React.ComponentProps<typeof MaterialIcons>['name'];

const VANTAGENS: { icone: NomeIcone; titulo: string; texto: string }[] = [
  { icone: 'block', titulo: 'Zero anúncios', texto: 'Nada interrompendo o que você assiste' },
  { icone: 'bolt', titulo: 'Servidores rápidos', texto: 'Transmissão estável e em alta qualidade' },
  { icone: 'favorite', titulo: 'Sem mensalidade', texto: 'Canais, filmes e séries para todo mundo' },
];

/**
 * Apoie o Saimo TV: por que doar, o botão que abre a página de doação, o QR
 * code (para quem prefere doar de outro aparelho) e o link escrito.
 */
export default function Apoie() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.raiz}
      contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32, paddingHorizontal: 20 }}
    >
      <Pressable onPress={() => router.back()} style={styles.voltar} accessibilityRole="button" accessibilityLabel="Voltar" hitSlop={10}>
        <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
      </Pressable>
      <View style={styles.tag}>
        <MaterialIcons name="favorite" size={14} color={TURQUESA} />
        <Text style={styles.tagTexto}>Comunidade Saimo TV</Text>
      </View>
      <Text style={styles.titulo}>
        Ajude a manter tudo <Text style={styles.destaque}>100% gratuito</Text>
      </Text>
      <Text style={styles.sub}>Sem anúncios, sem mensalidade e livre para todo mundo.</Text>
      <Text style={styles.historia}>
        Manter servidores rápidos, a transmissão e as atualizações de todo dia custa dinheiro todo mês.
        Quem puder ajudar com qualquer valor faz uma diferença enorme para o Saimo TV continuar no ar para todos.
      </Text>

      <Pressable onPress={() => Linking.openURL(LINK_DOACAO)} accessibilityRole="link">
        <LinearGradient colors={['#0FA89A', '#2563EB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.botao}>
          <MaterialIcons name="favorite" size={20} color="#FFFFFF" />
          <Text style={styles.botaoTexto}>Fazer doação (Pix ou cripto)</Text>
          <MaterialIcons name="open-in-new" size={18} color="#FFFFFF" />
        </LinearGradient>
      </Pressable>
      <Pressable style={styles.botaoSecundario} onPress={() => Share.share({ message: LINK_DOACAO })}>
        <MaterialIcons name="share" size={18} color={TURQUESA} />
        <Text style={styles.botaoSecundarioTexto}>Compartilhar link de doação</Text>
      </Pressable>

      <View style={styles.vantagens}>
        {VANTAGENS.map((v) => (
          <View key={v.titulo} style={styles.vantagem}>
            <MaterialIcons name={v.icone} size={22} color={TURQUESA} />
            <View style={{ flex: 1 }}>
              <Text style={styles.vantagemTitulo}>{v.titulo}</Text>
              <Text style={styles.vantagemTexto}>{v.texto}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.cartao}>
        <Text style={styles.cartaoTitulo}>Ou aponte a câmera de outro celular</Text>
        <Image source={require('../assets/images/doacao-qr.png')} style={styles.qr} contentFit="contain" />
        <Text style={styles.link} selectable>deflow.exchange/pt/qr/saimo-tv</Text>
        <Text style={styles.pix}>Pagamento seguro pela Deflow</Text>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: Colors.background },
  voltar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface, marginBottom: 14 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(79,227,208,0.14)' },
  tagTexto: { color: '#7FF0E3', fontSize: 12, fontWeight: '600' },
  titulo: { color: '#FFFFFF', fontSize: 30, fontWeight: '800', marginTop: 14, lineHeight: 36 },
  destaque: { color: TURQUESA },
  sub: { color: '#C9D1E3', fontSize: 16, marginTop: 8 },
  historia: { color: '#AAB4C8', fontSize: 14, lineHeight: 21, marginTop: 10 },
  botao: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 54, borderRadius: 16, marginTop: 20 },
  botaoTexto: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  botaoSecundario: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 14, marginTop: 10, borderWidth: 1, borderColor: 'rgba(79,227,208,0.4)' },
  botaoSecundarioTexto: { color: TURQUESA, fontSize: 14, fontWeight: '600' },
  vantagens: { gap: 10, marginTop: 20 },
  vantagem: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)' },
  vantagemTitulo: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  vantagemTexto: { color: '#9AA4B8', fontSize: 13, marginTop: 2 },
  cartao: { marginTop: 22, padding: 20, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center' },
  cartaoTitulo: { color: '#0B0F1A', fontSize: 15, fontWeight: '700' },
  qr: { width: 220, height: 220, marginTop: 12 },
  link: { color: '#0E7490', fontSize: 15, fontWeight: '700', marginTop: 12 },
  pix: { color: '#5B6475', fontSize: 12, marginTop: 4 },
});
