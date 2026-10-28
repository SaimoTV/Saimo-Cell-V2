import React, { useEffect, useState, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView,
  StatusBar,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Colors, Typography, Spacing, BorderRadius } from '../../constants/Colors';
import { filmografiaNoAcervo } from '../../services/saimoSources';
import { creditosDe } from '../../services/tmdbService';
import type { MediaItem, CastMember } from '../../types';
import MediaCard from '../../components/MediaCard';

const { width } = Dimensions.get('window');

const COLUMNS = 3;
const GRID_GAP = Spacing.sm;
// Card width: fits 3 cards per row accounting for section padding + gap + MediaCard marginRight
const FILM_CARD_WIDTH = Math.floor(
  (width - Spacing.lg * 2 - GRID_GAP * (COLUMNS - 1) - Spacing.sm * COLUMNS) / COLUMNS
);

export default function ActorScreen() {
  const { id, name, photo } = useLocalSearchParams<{ id: string; name: string; photo?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [loading, setLoading] = useState(true);
  const [actor, setActor] = useState<CastMember | null>(null);
  const [filmography, setFilmography] = useState<MediaItem[]>([]);

  useEffect(() => {
    let vivo = true;
    /**
     * O que esta pessoa fez **e que existe no acervo**.
     *
     * Antes esta tela chamava um endereço que devolvia lista vazia sempre: o
     * elenco era clicável e o clique levava a nada. Agora o TMDB diz o que a
     * pessoa fez, e o arquivo de fichas diz quais desses títulos existem aqui
     * — o cruzamento é por id, então nome igual não engana.
     */
    async function load() {
      const actorId = parseInt(id, 10);
      setActor({
        id: actorId || 0,
        name: (name as string) ?? '',
        character: '',
        photo: (photo as string) || null,
      });
      if (!actorId) { setLoading(false); return; }
      try {
        const creditos = await creditosDe(actorId);
        const achados = await filmografiaNoAcervo(creditos);
        if (vivo) setFilmography(achados);
      } catch (e) {
        console.warn('[Ator] filmografia:', e);
      } finally {
        if (vivo) setLoading(false);
      }
    }
    load();
    return () => { vivo = false; };
  }, [id, name, photo]);

  const handleBack = () => router.back();

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      
      <ScrollView 
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Ator</Text>
          <View style={{ width: 40 }} />
        </View>
        
        {/* Actor Profile */}
        <View style={styles.profile}>
          <Image
            source={{ uri: actor?.photo || '' }}
            style={styles.photo}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
          <Text style={styles.actorName}>{actor?.name || name || 'Ator'}</Text>
          <Text style={styles.filmCount}>
            {filmography.length} título{filmography.length !== 1 ? 's' : ''} no catálogo
          </Text>
        </View>
        
        {/* Filmography */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Filmografia</Text>
          {filmography.length === 0 ? (
            <>
              <Text style={styles.vazio}>Nada desta pessoa no acervo.</Text>
              <Text style={styles.vazioNota}>
                A filmografia mostra só o que dá para abrir daqui.
              </Text>
            </>
          ) : (
            <View style={styles.grid}>
              {filmography.map((item) => (
                <MediaCard key={item.id} item={item} cardWidth={FILM_CARD_WIDTH} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  vazio: {
    color: Colors.textSecondary,
    fontSize: Typography.body.fontSize,
  },
  vazioNota: {
    color: Colors.textSecondary,
    fontSize: Typography.caption.fontSize,
    marginTop: 4,
    opacity: 0.7,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  backButton: {
    padding: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: Typography.h3.fontSize,
    fontWeight: '600',
  },
  profile: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  photo: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.surface,
  },
  actorName: {
    color: Colors.text,
    fontSize: Typography.h2.fontSize,
    fontWeight: '700',
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  filmCount: {
    color: Colors.textSecondary,
    fontSize: Typography.body.fontSize,
    marginTop: Spacing.xs,
  },
  section: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: Typography.h3.fontSize,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
});
