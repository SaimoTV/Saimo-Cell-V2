import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { useConnectStore } from '../stores/connectStore';
import { saimoConnect } from '../services/saimoConnect';

/**
 * Saimo Connect 2: o que dá para escolher na TV pelo celular, em listas.
 * Fontes, áudio e legenda, favorito, canal anterior, timer de desligar e
 * atalhos para as telas. Só aparece o que a TV conectada informa; uma TV
 * antiga (sem versaoConnect) fica com os botões de sempre.
 */

type Painel = 'fontes' | 'faixas' | 'timer' | 'telas' | null;

const TEMPOS = [15, 30, 45, 60, 90, 120];

const TELAS: Array<{ id: Parameters<typeof saimoConnect.abrirTela>[0]; nome: string; icone: keyof typeof MaterialIcons.glyphMap }> = [
  { id: 'inicio', nome: 'Início', icone: 'home' },
  { id: 'aovivo', nome: 'Ao vivo', icone: 'live-tv' },
  { id: 'ondemand', nome: 'Filmes e séries', icone: 'movie' },
  { id: 'eventos', nome: 'Eventos', icone: 'event' },
  { id: 'radios', nome: 'Rádios', icone: 'radio' },
  { id: 'busca', nome: 'Buscar', icone: 'search' },
  { id: 'perfis', nome: 'Perfis', icone: 'people' },
  { id: 'ajustes', nome: 'Ajustes', icone: 'settings' },
];

export function connectNovo(versao?: number) {
  return (versao ?? 0) >= 2;
}

export default function ConnectExtras() {
  const tvState = useConnectStore((s) => s.tvState);
  const [aberto, setAberto] = useState<Painel>(null);

  if (!tvState || !connectNovo(tvState.versaoConnect)) return null;

  const aoVivo = tvState.mode === 'live';
  const tocando = aoVivo || tvState.mode === 'vod';
  const fontes = tocando ? tvState.fontes ?? [] : [];
  const fonteAtual = tvState.fonteAtual ?? 0;
  const faixas = tocando ? tvState.faixas : null;
  const favorito = aoVivo ? tvState.favorito : null;
  const timer = tvState.timer ?? 0;

  const alternar = (p: Painel) => setAberto((a) => (a === p ? null : p));

  const legendaAtiva = faixas?.legendas.find((l) => l.ativa);
  const audioAtivo = faixas?.audio.find((a) => a.ativa);

  return (
    <View style={styles.box}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {fontes.length > 1 && (
          <Chip
            icone="layers"
            texto={`Fonte ${fonteAtual + 1} de ${fontes.length}`}
            ativo={aberto === 'fontes'}
            seta
            onPress={() => alternar('fontes')}
          />
        )}
        {faixas && (
          <Chip
            icone="subtitles"
            texto={legendaAtiva ? `Legenda: ${legendaAtiva.rotulo}` : audioAtivo ? audioAtivo.rotulo : 'Áudio e legenda'}
            ativo={aberto === 'faixas'}
            seta
            onPress={() => alternar('faixas')}
          />
        )}
        {favorito !== null && favorito !== undefined && (
          <Chip
            icone={favorito ? 'star' : 'star-border'}
            texto={favorito ? 'Favorito' : 'Favoritar'}
            destaque={favorito}
            onPress={() => saimoConnect.alternarFavorito()}
          />
        )}
        {aoVivo && (
          <Chip icone="history" texto="Canal anterior" onPress={() => saimoConnect.canalAnterior()} />
        )}
        <Chip
          icone="bedtime"
          texto={timer > 0 ? `Desliga em ${timer} min` : 'Timer'}
          destaque={timer > 0}
          ativo={aberto === 'timer'}
          seta
          onPress={() => alternar('timer')}
        />
        <Chip icone="apps" texto="Ir para" ativo={aberto === 'telas'} seta onPress={() => alternar('telas')} />
      </ScrollView>

      {aberto === 'fontes' && fontes.length > 1 && (
        <View style={styles.lista}>
          <Text style={styles.listaTitulo}>Escolha a fonte</Text>
          {fontes.map((f, i) => (
            <Linha
              key={i}
              texto={f.rotulo}
              detalhe={f.detalhe}
              marcada={i === fonteAtual}
              onPress={() => saimoConnect.escolherFonte(i)}
            />
          ))}
        </View>
      )}

      {aberto === 'faixas' && faixas && (
        <View style={styles.lista}>
          {faixas.audio.length > 1 && (
            <>
              <Text style={styles.listaTitulo}>Áudio</Text>
              {faixas.audio.map((a, i) => (
                <Linha key={`a${i}`} texto={a.rotulo} marcada={a.ativa} onPress={() => saimoConnect.escolherFaixa('audio', i)} />
              ))}
            </>
          )}
          {faixas.legendas.length > 0 && (
            <>
              <Text style={[styles.listaTitulo, faixas.audio.length > 1 && { marginTop: 10 }]}>Legenda</Text>
              <Linha texto="Sem legenda" marcada={faixas.semLegenda} onPress={() => saimoConnect.escolherFaixa('legenda', -1)} />
              {faixas.legendas.map((l, i) => (
                <Linha key={`l${i}`} texto={l.rotulo} marcada={l.ativa} onPress={() => saimoConnect.escolherFaixa('legenda', i)} />
              ))}
            </>
          )}
        </View>
      )}

      {aberto === 'timer' && (
        <View style={styles.lista}>
          <Text style={styles.listaTitulo}>Desligar a TV em</Text>
          <View style={styles.grade}>
            {TEMPOS.map((min) => (
              <TouchableOpacity
                key={min}
                style={styles.tempo}
                activeOpacity={0.7}
                onPress={() => {
                  saimoConnect.timerDeSono(min);
                  setAberto(null);
                }}
              >
                <Text style={styles.tempoTexto}>{min < 60 ? `${min} min` : `${min / 60} h${min % 60 ? ' e meia' : ''}`}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {timer > 0 && (
            <TouchableOpacity style={styles.desligarTimer} onPress={() => saimoConnect.timerDeSono(0)} activeOpacity={0.7}>
              <MaterialIcons name="timer-off" size={16} color={Colors.errorLight} />
              <Text style={styles.desligarTimerTexto}>Cancelar o timer ({timer} min)</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {aberto === 'telas' && (
        <View style={styles.lista}>
          <Text style={styles.listaTitulo}>Abrir na TV</Text>
          <View style={styles.grade}>
            {TELAS.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={styles.tela}
                activeOpacity={0.7}
                onPress={() => {
                  saimoConnect.abrirTela(t.id);
                  setAberto(null);
                }}
              >
                <MaterialIcons name={t.icone} size={20} color={Colors.primaryLight} />
                <Text style={styles.telaTexto} numberOfLines={1}>{t.nome}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function Chip({ icone, texto, ativo, destaque, seta, onPress }: {
  icone: keyof typeof MaterialIcons.glyphMap;
  texto: string;
  ativo?: boolean;
  destaque?: boolean;
  seta?: boolean;
  onPress: () => void;
}) {
  const cor = ativo ? '#fff' : destaque ? '#FBBF24' : Colors.primaryLight;
  return (
    <TouchableOpacity
      style={[styles.chip, destaque && styles.chipDestaque, ativo && styles.chipAtivo]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityLabel={texto}
    >
      <MaterialIcons name={icone} size={15} color={cor} />
      <Text style={[styles.chipTexto, { color: ativo ? '#fff' : Colors.text }]} numberOfLines={1}>{texto}</Text>
      {seta && <Ionicons name={ativo ? 'chevron-up' : 'chevron-down'} size={13} color={ativo ? '#fff' : Colors.textSecondary} />}
    </TouchableOpacity>
  );
}

function Linha({ texto, detalhe, marcada, onPress }: {
  texto: string;
  detalhe?: string;
  marcada: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.linha, marcada && styles.linhaMarcada]} onPress={onPress} activeOpacity={0.7}>
      <MaterialIcons
        name={marcada ? 'radio-button-checked' : 'radio-button-unchecked'}
        size={18}
        color={marcada ? Colors.primaryLight : Colors.textMuted}
      />
      <View style={{ flex: 1 }}>
        <Text style={[styles.linhaTexto, marcada && { color: '#fff', fontWeight: '700' }]} numberOfLines={1}>{texto}</Text>
        {!!detalhe && <Text style={styles.linhaDetalhe} numberOfLines={1}>{detalhe}</Text>}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  box: {
    marginBottom: 12,
  },
  chips: {
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    maxWidth: 220,
  },
  chipAtivo: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipDestaque: {
    borderColor: 'rgba(251, 191, 36, 0.45)',
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
  },
  chipTexto: {
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  lista: {
    marginTop: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  listaTitulo: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  linhaMarcada: {
    backgroundColor: 'rgba(99, 102, 241, 0.16)',
  },
  linhaTexto: {
    color: Colors.text,
    fontSize: 14,
  },
  linhaDetalhe: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  grade: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tempo: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  },
  tempoTexto: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  desligarTimer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  desligarTimerTexto: {
    color: Colors.errorLight,
    fontSize: 13,
    fontWeight: '600',
  },
  tela: {
    width: '23%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  telaTexto: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: '600',
  },
});
