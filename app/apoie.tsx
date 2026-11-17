import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/Colors';
import { router } from 'expo-router';

/** Pix "copia e cola" (BR Code estático): doação direta ao desenvolvedor, sem intermediário. */
export const PIX_COPIA_E_COLA =
  '00020126580014br.gov.bcb.pix0136950460d4-51c5-49ba-bf71-b720b60cde435204000053039865802BR5925GABRIEL SAIMO FERREIRA ES60085500019962070503***6304F442';
const FAVORECIDO = 'Gabriel Saimo Ferreira';
const TURQUESA = '#4FE3D0';

type NomeIcone = React.ComponentProps<typeof MaterialIcons>['name'];

const VANTAGENS: { icone: NomeIcone; titulo: string; texto: string }[] = [
  { icone: 'block', titulo: 'Zero anúncios', texto: 'Nada interrompendo o que você usa' },
  { icone: 'autorenew', titulo: 'Atualizações constantes', texto: 'Melhorias e correções para o app e o site' },
  { icone: 'favorite', titulo: 'Sem mensalidade', texto: 'O app é gratuito para todo mundo' },
];

/**
 * Apoie o Saimo TV: por que doar, o botão que copia o Pix copia e cola e o QR
 * code do Pix direto (para ler com a câmera de outro aparelho).
 */
export default function Apoie() {
  const insets = useSafeAreaInsets();
  const [copiado, setCopiado] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (temporizador.current) clearTimeout(temporizador.current); }, []);

  const copiarPix = async () => {
    await Clipboard.setStringAsync(PIX_COPIA_E_COLA);
    setCopiado(true);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setCopiado(false), 2500);
  };

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
        Ajude a manter o Saimo TV <Text style={styles.destaque}>100% gratuito</Text>
      </Text>
      <Text style={styles.sub}>Sem anúncios e sem mensalidade.</Text>
      <Text style={styles.historia}>
        O Saimo TV é um player: ele toca as listas e os links que você mesmo adiciona. O app e o site não trazem
        nenhum canal, filme ou série dentro; o que você assiste vem das suas próprias listas.
      </Text>
      <Text style={styles.historia}>
        O desenvolvimento, as atualizações e a hospedagem do site custam dinheiro todo mês. Quem puder ajudar com
        qualquer valor faz uma diferença enorme para o Saimo TV continuar gratuito, atualizado e sem anúncios.
      </Text>

      <Pressable onPress={copiarPix} accessibilityRole="button" accessibilityLabel="Copiar Pix copia e cola">
        <LinearGradient colors={['#0FA89A', '#2563EB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.botao}>
          <MaterialIcons name={copiado ? 'check' : 'content-copy'} size={20} color="#FFFFFF" />
          <Text style={styles.botaoTexto}>{copiado ? 'Código copiado' : 'Copiar Pix copia e cola'}</Text>
        </LinearGradient>
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
        <Text style={styles.selo}>Pix direto</Text>
        <Image source={require('../assets/images/doacao-qr.png')} style={styles.qr} contentFit="contain" />
        <Text style={styles.link}>{FAVORECIDO}</Text>
        <Text style={styles.pix}>
          Agora o Pix é direto: o valor vai direto para o desenvolvedor, Gabriel Saimo Ferreira, sem intermediário.
          Aponte a câmera do celular para o QR code ou copie o código Pix e cole no app do seu banco.
        </Text>
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
  vantagens: { gap: 10, marginTop: 20 },
  vantagem: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)' },
  vantagemTitulo: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  vantagemTexto: { color: '#9AA4B8', fontSize: 13, marginTop: 2 },
  cartao: { marginTop: 22, padding: 20, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center' },
  selo: { color: '#15803D', fontSize: 13, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(34,197,94,0.14)', overflow: 'hidden' },
  qr: { width: 220, height: 220, marginTop: 12 },
  link: { color: '#0B0F1A', fontSize: 16, fontWeight: '700', marginTop: 12 },
  pix: { color: '#5B6475', fontSize: 13, lineHeight: 19, marginTop: 8, textAlign: 'center' },
});
