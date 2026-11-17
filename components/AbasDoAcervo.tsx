import React, { memo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../constants/Colors';
import type { MediaFilterType } from '../types';

/**
 * Abas fixas do acervo, sempre à vista no topo de Filmes & Séries: Todos,
 * Filmes, Séries, Animes, Doramas, Novelas, Kids e Novelinhas. As categorias
 * vêm do categorias.txt; Novelinhas abre a tela própria, com o player em pé.
 */
const ABAS: { valor: MediaFilterType | 'novelinhas'; rotulo: string; icone: string; cor: string }[] = [
  { valor: 'all', rotulo: 'Todos', icone: 'apps', cor: Colors.primary },
  { valor: 'movie', rotulo: 'Filmes', icone: 'movie', cor: '#4FE3D0' },
  { valor: 'tv', rotulo: 'Séries', icone: 'tv', cor: '#7AA2FF' },
  { valor: 'novelinhas', rotulo: 'Novelinhas', icone: 'stay-current-portrait', cor: '#FF7EB6' },
  { valor: 'animes', rotulo: 'Animes', icone: 'auto-awesome', cor: '#FFB454' },
  { valor: 'doramas', rotulo: 'Doramas', icone: 'favorite', cor: '#FF7EB6' },
  { valor: 'novelas', rotulo: 'Novelas', icone: 'theater-comedy', cor: '#C792EA' },
  { valor: 'kids', rotulo: 'Kids', icone: 'child-care', cor: '#7EE787' },
];

function AbasDoAcervo({ ativa, aoEscolher }: { ativa: MediaFilterType; aoEscolher: (f: MediaFilterType) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.linha} contentContainerStyle={styles.conteudo}>
      {ABAS.map((a) => {
        const marcada = a.valor === ativa;
        return (
          <TouchableOpacity
            key={a.valor}
            testID={`aba-${a.valor}`}
            style={[styles.aba, marcada && { backgroundColor: a.cor, borderColor: a.cor }]}
            onPress={() => (a.valor === 'novelinhas' ? router.push('/novelinhas' as any) : aoEscolher(a.valor))}
          >
            <MaterialIcons name={a.icone as any} size={16} color={marcada ? '#0B0B10' : a.cor} />
            <Text style={[styles.texto, marcada && styles.textoMarcado]}>{a.rotulo}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

export default memo(AbasDoAcervo);

const styles = StyleSheet.create({
  linha: { flexGrow: 0, marginBottom: 8 },
  conteudo: { paddingHorizontal: 16, gap: 8 },
  aba: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 8,
    borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(255,255,255,0.05)',
  },
  texto: { color: Colors.text, fontSize: 13, fontWeight: '600' },
  textoMarcado: { color: '#0B0B10', fontWeight: '800' },
});
