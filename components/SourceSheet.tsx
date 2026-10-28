import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Spacing, BorderRadius, Typography } from '../constants/Colors';
import { isHlsUrl } from '../services/downloadUtils';
import type { MediaSource } from '../types';

interface SourceSheetProps {
  visible: boolean;
  title: string;
  sources: MediaSource[];
  onPick: (url: string) => void;
  onClose: () => void;
}

// Sem o servidor: a linha é "Fonte N · Dublado/Legendado".
function labelOf(source: MediaSource): string {
  return source.label === 'leg' ? 'Legendado'
    : source.label === 'dub' ? 'Dublado'
    : source.label || '';
}

/**
 * A escolha da fonte antes de baixar.
 *
 * O aplicativo baixava sempre pela primeira fonte publicada, e a primeira de
 * quase cinco mil filmes é uma playlist do EmbedPlayer que ele não sabe
 * montar — o download morria com um aviso de "conteúdo ao vivo" num filme que
 * nada tem de ao vivo. Aqui as fontes aparecem todas, as que não dão para
 * baixar aparecem dito isso, e quem escolhe é quem baixa.
 */
export default function SourceSheet({ visible, title, sources, onPick, onClose }: SourceSheetProps) {
  const baixaveis = sources.filter(s => !isHlsUrl(s.url)).length;

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.container} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>
            {baixaveis === 0
              ? 'Nenhuma fonte deste título pode ser baixada.'
              : `${baixaveis} de ${sources.length} fonte${sources.length > 1 ? 's' : ''} pode${baixaveis > 1 ? 'm' : ''} ser baixada${baixaveis > 1 ? 's' : ''}.`}
          </Text>
          <ScrollView style={styles.scroll} bounces={false} showsVerticalScrollIndicator>
            {sources.map((source, index) => {
              const playlist = isHlsUrl(source.url);
              return (
                <TouchableOpacity
                  key={`${source.url}-${index}`}
                  style={[styles.row, playlist && styles.rowDisabled]}
                  disabled={playlist}
                  onPress={() => { onPick(source.url); onClose(); }}
                >
                  <Ionicons
                    name={playlist ? 'close-circle-outline' : 'download-outline'}
                    size={18}
                    color={playlist ? Colors.textSecondary : Colors.primary}
                  />
                  <View style={styles.rowText}>
                    <Text style={[styles.rowLabel, playlist && styles.rowLabelDisabled]} numberOfLines={1}>
                      {[`Fonte ${index + 1}`, labelOf(source)].filter(Boolean).join(' · ')}
                    </Text>
                    {playlist && (
                      <Text style={styles.rowHint}>Transmissão em pedaços — só dá para assistir</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  container: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.xl,
    paddingBottom: 32,
    maxHeight: '80%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)', marginBottom: Spacing.md,
  },
  title: { color: Colors.text, fontSize: Typography.h3.fontSize, fontWeight: '700' },
  subtitle: {
    color: Colors.textSecondary, fontSize: Typography.caption.fontSize,
    marginTop: 4, marginBottom: Spacing.md,
  },
  scroll: { flexGrow: 0 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  rowDisabled: { opacity: 0.45 },
  rowText: { flex: 1 },
  rowLabel: { color: Colors.text, fontSize: Typography.body.fontSize },
  rowLabelDisabled: { color: Colors.textSecondary },
  rowHint: { color: Colors.textSecondary, fontSize: 11, marginTop: 2 },
});
