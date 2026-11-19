import Slider from '@react-native-community/slider';
import { useBrilhoStore } from '../../stores/brilhoStore';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState, useCallback, useRef } from 'react';
import { 
  View, 
  Text,
  StyleSheet, 
  StatusBar,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Colors, Typography, Spacing, BorderRadius } from '../../constants/Colors';
import { useSettingsStore } from '../../stores/settingsStore';
import { useFavoritesStore } from '../../stores/favoritesStore';
import { clearEPGCache, refreshEPG } from '../../services/epgService';
import { clearAllCaches } from '../../services/apiService';
import { useLinksStore } from '../../stores/linksStore';
import PinModal from '../../components/PinModal';
import MinhasListas from '../../components/MinhasListas';
import ContaSaimo from '../../components/ContaSaimo';
import { aoMudarConta, estadoConta } from '../../services/conta';
import ListasModal from '../../components/ListasModal';
import { verificarAtualizacaoAgora } from '../../services/atualizacao';
import { useFocusEffect } from 'expo-router';
import { assinarPerfis, ativo, kidsAtivo, pedeCodigo, perfis as listaPerfis } from '../../services/perfis';
import { AvatarPerfil, PedirCodigo } from '../perfis';
import { AparenciaAjustes, EstatisticasAjustes, LegendasAjustes, NovosEpisodiosAjustes } from '../../components/AjustesExtras';

/** No perfil Kids os Ajustes pedem o código: a criança não mexe nas listas nem nos ajustes. */
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [liberado, setLiberado] = useState(false);
  const [, setVersao] = useState(0);
  React.useEffect(() => assinarPerfis(() => setVersao((v) => v + 1)), []);
  // Saiu da aba: tranca de novo.
  useFocusEffect(useCallback(() => () => setLiberado(false), []));
  const perfil = ativo();
  if (!pedeCodigo(perfil) || liberado) return <AjustesConteudo />;
  return (
    <View style={{ flex: 1, backgroundColor: '#0B0F2A', paddingTop: insets.top + 40 }}>
      <PedirCodigo perfil={perfil} motivo="Os Ajustes ficam trancados no perfil Kids. Digite o código para abrir."
        aoConfirmar={() => setLiberado(true)} aoCancelar={() => router.push('/perfis' as any)} />
      <Text style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 8, fontSize: 13 }}>
        Cancelar abre a troca de perfil.
      </Text>
    </View>
  );
}

function AjustesConteudo() {
  const [contaLogada, setContaLogada] = useState(!!estadoConta().token);
  React.useEffect(() => aoMudarConta((e) => setContaLogada(!!e.token)), []);
  const brilhoApp = useBrilhoStore((s) => s.brilho);
  const definirBrilho = useBrilhoStore((s) => s.definir);
  const insets = useSafeAreaInsets();
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinMode, setPinMode] = useState<'verify' | 'change'>('change');
  const [verificando, setVerificando] = useState(false);
  
  const {
    showEPG,
    setShowEPG,
    showChannelNumber,
    setShowChannelNumber,
    autoplay,
    setAutoplay,
    upscaling,
    setUpscaling,
    audioInteligente,
    setAudioInteligente,
    zeroDelay,
    setZeroDelay,
    adultUnlocked,
    lockAdult,
    unlockAdult,
  } = useSettingsStore();

  const upscalingLabel = upscaling === 'hd'
    ? 'Nitidez HD (720p → Full HD)'
    : upscaling === '4k'
      ? 'Super Resolução Ultra (Full HD → 4K)'
      : 'Desligado';

  const handleCycleUpscaling = useCallback(() => {
    const next = upscaling === 'off' ? 'hd' : upscaling === 'hd' ? '4k' : 'off';
    setUpscaling(next);
  }, [upscaling, setUpscaling]);

  const zeroDelayLabel = zeroDelay === 'agressivo'
    ? 'Agressivo (máximo ao vivo possível)'
    : zeroDelay === 'equilibrado'
      ? 'Equilibrado (baixa latência com anti-travamento)'
      : 'Desligado (padrão)';

  const handleCycleZeroDelay = useCallback(() => {
    const next = zeroDelay === 'off' ? 'equilibrado' : zeroDelay === 'equilibrado' ? 'agressivo' : 'off';
    setZeroDelay(next);
  }, [zeroDelay, setZeroDelay]);
  
  const { clearFavorites } = useFavoritesStore();

  const linkCanais = useLinksStore(s => s.linkCanais);
  const linkFilmes = useLinksStore(s => s.linkFilmes);
  const [listasVisivel, setListasVisivel] = useState(false);

  const [pinAction, setPinAction] = useState<'change' | 'unlock'>('change');

  // Gatilho secreto: 5 toques no nome do app desbloqueiam/bloqueiam o conteúdo adulto
  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSecretTap = useCallback(() => {
    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => { tapCount.current = 0; }, 1500);

    if (tapCount.current >= 5) {
      tapCount.current = 0;
      if (tapTimer.current) clearTimeout(tapTimer.current);
      if (adultUnlocked) {
        lockAdult();
        Alert.alert('Bloqueado', 'Conteúdo adulto bloqueado.');
      } else {
        setPinAction('unlock');
        setPinMode('verify');
        setPinModalVisible(true);
      }
    }
  }, [adultUnlocked, lockAdult]);

  const handleUnlockAdult = useCallback(() => {
    setPinAction('unlock');
    setPinMode('verify');
    setPinModalVisible(true);
  }, []);

  const handleLockAdult = useCallback(() => {
    lockAdult();
    Alert.alert('Bloqueado', 'Conteúdo adulto bloqueado novamente.');
  }, [lockAdult]);

  const handleClearCache = useCallback(async () => {
    Alert.alert(
      'Recarregar Guia',
      'Deseja recarregar o Guia de TV (EPG)? Isso baixará os dados mais recentes.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Recarregar', 
          style: 'default',
          onPress: async () => {
            await clearEPGCache();
            // Apagar só não basta: sem pedir a carga, o guia ficava vazio
            // até o app ser reaberto.
            void refreshEPG();
            Alert.alert('Sucesso', 'Guia de TV recarregado. Os dados aparecerão em breve.');
          }
        },
      ]
    );
  }, []);

  const handleClearFavorites = useCallback(() => {
    Alert.alert(
      'Limpar Favoritos',
      'Deseja remover todos os favoritos?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Limpar', 
          style: 'destructive',
          onPress: () => {
            clearFavorites();
            Alert.alert('Sucesso', 'Favoritos removidos!');
          }
        },
      ]
    );
   }, [clearFavorites]);

  const handleClearMediaCache = useCallback(() => {
    Alert.alert(
      'Limpar Cache de Mídia',
      'Deseja limpar o cache da sua lista de filmes e séries? Ela será carregada de novo do endereço que você informou.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Limpar', 
          style: 'destructive',
          onPress: () => {
            clearAllCaches();
            Alert.alert('Sucesso', 'Cache de mídia limpo! Volte à aba Filmes para recarregar.');
          }
        },
      ]
    );
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Ajustes</Text>
        <Text style={styles.subtitle}>Configurações do app</Text>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Conta Saimo (opcional): primeira opção; em destaque enquanto não há conta. */}
        {!kidsAtivo() && (
          <View style={contaLogada ? undefined : styles.contaDestaque}>
            <Text style={styles.sectionTitle}>Conta Saimo</Text>
            <ContaSaimo />
          </View>
        )}

        {/* Apoie */}
        {Platform.OS !== 'ios' && (
        <TouchableOpacity onPress={() => router.push('/apoie' as any)} activeOpacity={0.85} accessibilityRole="button">
          <LinearGradient colors={['#0FA89A', '#2563EB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.apoie}>
            <Ionicons name="heart" size={26} color="#FFFFFF" />
            <View style={{ flex: 1 }}>
              <Text style={styles.apoieTitulo}>Apoie o Saimo TV</Text>
              <Text style={styles.apoieTexto}>Ajude a manter tudo grátis e sem anúncios</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>
        )}

        {/* Perfis */}
        <Text style={styles.sectionTitle}>Perfis</Text>
        <View style={styles.section}>
          <TouchableOpacity style={styles.settingRow} onPress={() => router.push('/perfis' as any)} testID="ajustes-perfis">
            <View style={styles.settingInfo}>
              <AvatarPerfil perfil={ativo()} tamanho={36} />
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>{ativo().nome}{ativo().kids ? ' (Kids)' : ''}</Text>
                <Text style={styles.linkValor}>{listaPerfis().length === 1 ? 'Único perfil · toque para trocar ou criar' : `${listaPerfis().length} perfis · toque para trocar`}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.settingRow} onPress={() => router.push('/perfis?modo=gerenciar' as any)} testID="ajustes-perfis-gerenciar">
            <View style={styles.settingInfo}>
              <Ionicons name="people-outline" size={22} color={Colors.primary} />
              <Text style={styles.settingLabel}>Gerenciar perfis, avatares e Kids</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Listas */}
        <Text style={styles.sectionTitle}>Listas</Text>
        <View style={styles.section}>
          <TouchableOpacity style={styles.settingRow} onPress={() => setListasVisivel(true)} testID="ajustes-listas-canais">
            <View style={styles.settingInfo}>
              <Ionicons name="tv-outline" size={22} color={Colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>Lista de canais</Text>
                <Text style={styles.linkValor} numberOfLines={1}>{linkCanais || 'Não informado'}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.settingRow} onPress={() => setListasVisivel(true)} testID="ajustes-listas-filmes">
            <View style={styles.settingInfo}>
              <Ionicons name="film-outline" size={22} color={Colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>Lista de filmes e séries</Text>
                <Text style={styles.linkValor} numberOfLines={1}>{linkFilmes || 'Não informado'}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <MinhasListas />

        <AparenciaAjustes />
        <LegendasAjustes />
        <NovosEpisodiosAjustes />
        <EstatisticasAjustes />

        {/* Interface */}
        <Text style={styles.sectionTitle}>Interface</Text>
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="tv-outline" size={22} color={Colors.primary} />
              <Text style={styles.settingLabel}>Mostrar EPG</Text>
            </View>
            <Switch
              value={showEPG}
              onValueChange={setShowEPG}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor={Colors.text}
            />
          </View>
          
          <View style={styles.divider} />
          
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="list-outline" size={22} color={Colors.primary} />
              <Text style={styles.settingLabel}>Número do canal</Text>
            </View>
            <Switch
              value={showChannelNumber}
              onValueChange={setShowChannelNumber}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor={Colors.text}
            />
          </View>
          
          <View style={styles.divider} />
          
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="play-outline" size={22} color={Colors.primary} />
              <Text style={styles.settingLabel}>Reproduzir automaticamente</Text>
            </View>
            <Switch
              value={autoplay}
              onValueChange={setAutoplay}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor={Colors.text}
            />
          </View>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.settingRow} onPress={handleCycleUpscaling}>
            <View style={styles.settingInfo}>
              <Ionicons name="sparkles-outline" size={22} color={Colors.primary} />
              <View>
                <Text style={styles.settingLabel}>Super Resolução (Upscaling)</Text>
                <Text style={{ color: Colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                  {upscalingLabel}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="volume-medium-outline" size={22} color={Colors.primary} />
              <View>
                <Text style={styles.settingLabel}>Áudio Inteligente</Text>
                <Text style={{ color: Colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                  Nivela o volume entre canais e fontes diferentes
                </Text>
              </View>
            </View>
            <Switch
              value={audioInteligente}
              onValueChange={setAudioInteligente}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor={Colors.text}
            />
          </View>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.settingRow} onPress={handleCycleZeroDelay}>
            <View style={styles.settingInfo}>
              <Ionicons name="flash-outline" size={22} color={Colors.primary} />
              <View>
                <Text style={styles.settingLabel}>Zero Delay (Ao Vivo)</Text>
                <Text style={{ color: Colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                  {zeroDelayLabel}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Dados */}
        <Text style={styles.sectionTitle}>Dados</Text>
        <View style={styles.section}>
          <TouchableOpacity style={styles.settingRow} onPress={handleClearCache}>
            <View style={styles.settingInfo}>
              <Ionicons name="refresh-outline" size={22} color={Colors.primary} />
              <Text style={styles.settingLabel}>Recarregar Guia de TV</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
          
          <View style={styles.divider} />
          
          <TouchableOpacity style={styles.settingRow} onPress={handleClearFavorites}>
            <View style={styles.settingInfo}>
              <Ionicons name="heart-dislike-outline" size={22} color={Colors.error} />
              <Text style={styles.settingLabel}>Remover todos favoritos</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
          
          <View style={styles.divider} />
          
          <TouchableOpacity style={styles.settingRow} onPress={handleClearMediaCache}>
            <View style={styles.settingInfo}>
              <Ionicons name="trash-outline" size={22} color={Colors.error} />
              <Text style={styles.settingLabel}>Limpar Cache de Mídia</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Brilho do app (não o do aparelho): 0 escurece tudo; um toque volta. */}
        <Text style={styles.sectionTitle}>Tela</Text>
        <View style={styles.section}>
          <View style={[styles.settingRow, { flexDirection: 'column', alignItems: 'stretch' }]}>
            <View style={[styles.settingInfo, { justifyContent: 'space-between' }]}>
              <View style={styles.settingInfo}>
                <Ionicons name="sunny-outline" size={22} color={Colors.primary} />
                <Text style={styles.settingLabel}>Brilho do app</Text>
              </View>
              <Text style={styles.settingLabel}>{brilhoApp}%</Text>
            </View>
            <Slider
              minimumValue={0}
              maximumValue={100}
              step={5}
              value={brilhoApp}
              onSlidingComplete={definirBrilho}
              minimumTrackTintColor={Colors.primary}
              maximumTrackTintColor="rgba(255,255,255,0.2)"
              thumbTintColor="#fff"
              testID="ajustes-brilho"
            />
            <Text style={{ color: Colors.textMuted, fontSize: 12 }}>
              Em 0% a tela fica preta: toque em qualquer lugar para voltar ao normal.
            </Text>
          </View>
        </View>

        {/* Atualizações */}
        <Text style={styles.sectionTitle}>Atualizações</Text>
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.settingRow}
            disabled={verificando}
            onPress={async () => {
              setVerificando(true);
              const r = await verificarAtualizacaoAgora();
              setVerificando(false);
              if (r === 'atual') {
                Alert.alert('Saimo TV', `Você já está na versão mais recente (${Constants.expoConfig?.version ?? ''}).`);
              } else if (r === 'erro') {
                Alert.alert('Saimo TV', 'Não foi possível verificar agora. Confira a internet e tente de novo.');
              }
              // 'nova': o aviso de atualização abre sozinho.
            }}
            testID="ajustes-verificar-atualizacoes"
          >
            <View style={styles.settingInfo}>
              <Ionicons name="cloud-download-outline" size={22} color={Colors.primary} />
              <Text style={styles.settingLabel}>Verificar atualizações</Text>
            </View>
            {verificando
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />}
          </TouchableOpacity>
        </View>

        {/* Controle parental: no fim, separado e discreto. No Kids não aparece. */}
        {!kidsAtivo() && (
          <View style={{ opacity: 0.7, marginTop: 18 }}>
            <Text style={styles.sectionTitle}>Controle parental</Text>
            <View style={styles.section}>
              <TouchableOpacity style={styles.settingRow} onPress={adultUnlocked ? handleLockAdult : handleUnlockAdult} testID="ajustes-parental">
                <View style={styles.settingInfo}>
                  <Ionicons name={adultUnlocked ? 'lock-open-outline' : 'lock-closed-outline'} size={20} color={Colors.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingLabel}>Conteúdo adulto</Text>
                    <Text style={styles.linkValor}>{adultUnlocked ? 'Liberado · toque para bloquear' : 'Bloqueado · toque para liberar com a senha'}</Text>
                  </View>
                </View>
              </TouchableOpacity>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.settingRow} onPress={() => { setPinAction('change'); setPinMode('change'); setPinModalVisible(true); }} testID="ajustes-parental-senha">
                <View style={styles.settingInfo}>
                  <Ionicons name="key-outline" size={20} color={Colors.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingLabel}>Trocar a senha</Text>
                    <Text style={styles.linkValor}>Troque a senha de fábrica por uma sua</Text>
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* App Info */}
        <View style={styles.appInfo}>
          <TouchableOpacity onPress={handleSecretTap} activeOpacity={1}>
            <Text style={styles.appName}>Saimo TV</Text>
          </TouchableOpacity>
          <Text style={styles.appVersion}>Versão {Constants.expoConfig?.version ?? ''}</Text>
        </View>
      </ScrollView>

      <ListasModal visible={listasVisivel} onClose={() => setListasVisivel(false)} />

      <PinModal
        visible={pinModalVisible}
        onClose={() => setPinModalVisible(false)}
        onSuccess={() => {
          setPinModalVisible(false);
          if (pinAction === 'unlock') {
            unlockAdult();
            Alert.alert('Desbloqueado', 'Conteúdo adulto desbloqueado.');
          } else {
            Alert.alert('Sucesso', 'PIN alterado com sucesso!');
          }
        }}
        mode={pinMode}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  contaDestaque: { borderWidth: 2, borderColor: Colors.primary, borderRadius: 20, padding: 8, marginBottom: 12 },
  apoie: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 18, marginBottom: 8 },
  apoieTitulo: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  apoieTexto: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.background,
  },
  title: {
    color: Colors.text,
    fontSize: Typography.h1.fontSize,
    fontWeight: '700',
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: Typography.caption.fontSize,
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  sectionTitle: {
    color: Colors.textSecondary,
    fontSize: Typography.caption.fontSize,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  section: {
    backgroundColor: Colors.cardBg,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  settingLabel: {
    color: Colors.text,
    fontSize: Typography.body.fontSize,
  },
  linkValor: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: Spacing.md + 22 + Spacing.md,
  },
  statusBadge: {
    backgroundColor: Colors.accent + '30',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    color: Colors.accent,
    fontSize: Typography.caption.fontSize,
    fontWeight: '600',
  },
  appInfo: {
    alignItems: 'center',
    marginTop: Spacing.xxl,
    paddingVertical: Spacing.lg,
  },
  appName: {
    color: Colors.text,
    fontSize: Typography.body.fontSize,
    fontWeight: '600',
  },
  appVersion: {
    color: Colors.textSecondary,
    fontSize: Typography.caption.fontSize,
    marginTop: Spacing.xs,
  },
});
