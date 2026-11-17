import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { loadNovelinhas, type Novelinha } from '../../services/saimoSources';
import { todasAsParadas, type ParadaNovelinha } from '../../services/novelinhasProgresso';

type Audio = 'todas' | 'dub' | 'leg';

/**
 * Novelinhas: minisséries em pé da RedeFlix. Grade de capas verticais com
 * "Continue assistindo", busca, áudio e tema; tocar abre o player em pé.
 */
export default function NovelinhasScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [lista, setLista] = useState<Novelinha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [paradas, setParadas] = useState<Record<string, ParadaNovelinha>>({});
  const [audio, setAudio] = useState<Audio>('todas');
  const [tema, setTema] = useState('');
  const [termo, setTermo] = useState('');

  useFocusEffect(useCallback(() => {
    let vivo = true;
    loadNovelinhas().then(({ lista: l }) => { if (vivo) { setLista(l); setCarregando(false); } });
    todasAsParadas().then((p) => { if (vivo) setParadas(p); });
    return () => { vivo = false; };
  }, []));

  const temas = useMemo(() => {
    const conta = new Map<string, number>();
    for (const n of lista) for (const g of n.generos) conta.set(g, (conta.get(g) || 0) + 1);
    return [...conta.entries()].filter(([, q]) => q >= 5).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([g]) => g);
  }, [lista]);

  const filtradas = useMemo(() => {
    const t = termo.trim().toLowerCase();
    return lista.filter((n) => (audio === 'todas' || (audio === 'dub') === n.dublada)
      && (!tema || n.generos.includes(tema))
      && (!t || n.titulo.toLowerCase().includes(t)));
  }, [lista, audio, tema, termo]);

  const continuar = useMemo(() => {
    const porId = new Map(lista.map((n) => [n.id, n]));
    return Object.entries(paradas)
      .sort((a, b) => b[1].quando - a[1].quando)
      .map(([id]) => porId.get(id))
      .filter((n): n is Novelinha => !!n)
      .slice(0, 20);
  }, [lista, paradas]);

  const colunas = width >= 600 ? 5 : 3;
  const largura = (width - 32 - (colunas - 1) * 10) / colunas;
  const abrir = (n: Novelinha) => router.push(`/novelinhas/${n.id}` as any);

  const Cartao = ({ n, w }: { n: Novelinha; w: number }) => {
    const p = paradas[n.id];
    return (
      <TouchableOpacity style={{ width: w }} onPress={() => abrir(n)} activeOpacity={0.8}>
        <View style={[styles.capa, { width: w, height: (w * 16) / 9 }]}>
          <Image source={{ uri: n.capa }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
          <Text style={[styles.selo, { color: n.dublada ? '#7EE787' : '#FFB454' }]}>{n.dublada ? 'DUB' : 'LEG'}</Text>
          {p && <View style={styles.barra}><View style={[styles.barraCheia, { width: `${Math.min(100, (p.ep / n.episodios) * 100)}%` }]} /></View>}
        </View>
        <Text style={styles.titulo} numberOfLines={2}>{n.titulo}</Text>
        <Text style={styles.sub}>{p ? `Ep. ${p.ep} de ${n.episodios}` : `${n.episodios} episódios`}</Text>
      </TouchableOpacity>
    );
  };

  const cabecalho = (
    <View>
      {continuar.length > 0 && (
        <View style={{ marginBottom: 14 }}>
          <Text style={styles.secao}>Continue assistindo</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
            {continuar.map((n) => <Cartao key={n.id} n={n} w={110} />)}
          </ScrollView>
        </View>
      )}
      <View style={styles.busca}>
        <MaterialIcons name="search" size={20} color={Colors.textSecondary} />
        <TextInput
          style={styles.buscaTexto}
          placeholder="Buscar novelinha…"
          placeholderTextColor={Colors.textSecondary}
          value={termo}
          onChangeText={setTermo}
          autoCorrect={false}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {(['todas', 'dub', 'leg'] as Audio[]).map((a) => (
          <TouchableOpacity key={a} style={[styles.chip, audio === a && styles.chipAtivo]} onPress={() => setAudio(a)}>
            <Text style={[styles.chipTexto, audio === a && styles.chipTextoAtivo]}>{a === 'todas' ? 'Todas' : a === 'dub' ? 'Dubladas' : 'Legendadas'}</Text>
          </TouchableOpacity>
        ))}
        <View style={styles.divisor} />
        <TouchableOpacity style={[styles.chip, !tema && styles.chipAtivo]} onPress={() => setTema('')}>
          <Text style={[styles.chipTexto, !tema && styles.chipTextoAtivo]}>Todos os temas</Text>
        </TouchableOpacity>
        {temas.map((g) => (
          <TouchableOpacity key={g} style={[styles.chip, tema === g && styles.chipAtivo]} onPress={() => setTema(g)}>
            <Text style={[styles.chipTexto, tema === g && styles.chipTextoAtivo]}>{g}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <Text style={styles.total}>{filtradas.length.toLocaleString('pt-BR')} novelinhas</Text>
    </View>
  );

  return (
    <View style={[styles.tela, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <View style={styles.topo}>
        <TouchableOpacity onPress={() => router.back()} style={styles.voltar} accessibilityLabel="Voltar">
          <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.nome}>Novelinhas</Text>
          <Text style={styles.subtitulo}>Minisséries em pé, um minuto por episódio</Text>
        </View>
      </View>
      {carregando ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} size="large" />
      ) : lista.length === 0 ? (
        <Text style={styles.vazio}>Nenhuma novelinha disponível agora.</Text>
      ) : (
        <FlatList
          key={`grade-${colunas}`}
          data={filtradas}
          numColumns={colunas}
          keyExtractor={(n) => n.id}
          ListHeaderComponent={cabecalho}
          columnWrapperStyle={{ gap: 10, paddingHorizontal: 16 }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, gap: 16 }}
          renderItem={({ item }) => <Cartao n={item} w={largura} />}
          initialNumToRender={12}
          windowSize={7}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: Colors.background },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 10 },
  voltar: { padding: 8 },
  nome: { color: Colors.text, fontSize: 22, fontWeight: '800' },
  subtitulo: { color: Colors.textSecondary, fontSize: 12 },
  vazio: { color: Colors.textSecondary, textAlign: 'center', marginTop: 40 },
  secao: { color: Colors.text, fontSize: 16, fontWeight: '700', marginBottom: 8, paddingHorizontal: 16 },
  busca: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, paddingHorizontal: 12,
    borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', height: 42,
  },
  buscaTexto: { flex: 1, color: Colors.text, fontSize: 14 },
  chips: { gap: 8, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  chipAtivo: { backgroundColor: '#FF7EB6', borderColor: '#FF7EB6' },
  chipTexto: { color: Colors.text, fontSize: 12, fontWeight: '600' },
  chipTextoAtivo: { color: '#160812', fontWeight: '800' },
  divisor: { width: 1, height: 20, backgroundColor: 'rgba(255,255,255,0.15)' },
  total: { color: Colors.textSecondary, fontSize: 12, paddingHorizontal: 16, marginBottom: 4 },
  capa: { borderRadius: 10, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.06)' },
  selo: {
    position: 'absolute', top: 6, left: 6, fontSize: 10, fontWeight: '800', paddingHorizontal: 5, paddingVertical: 1,
    borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.65)', overflow: 'hidden',
  },
  barra: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  barraCheia: { height: 3, backgroundColor: '#FF7EB6' },
  titulo: { color: Colors.text, fontSize: 12, fontWeight: '600', marginTop: 5 },
  sub: { color: Colors.textSecondary, fontSize: 11 },
});
