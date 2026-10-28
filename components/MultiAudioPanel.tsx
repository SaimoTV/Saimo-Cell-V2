import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../constants/Colors';
import { useConnectStore, PhoneAudioMode } from '../stores/connectStore';
import { saimoConnect } from '../services/saimoConnect';

export default function MultiAudioPanel() {
  const visible = useConnectStore((s) => s.isMultiAudioVisible);
  const setVisible = useConnectStore((s) => s.setMultiAudioVisible);
  const tvState = useConnectStore((s) => s.tvState);
  const phoneAudioMode = useConnectStore((s) => s.phoneAudioMode);
  const audioSyncDelayMs = useConnectStore((s) => s.audioSyncDelayMs);
  const setAudioSyncDelayMs = useConnectStore((s) => s.setAudioSyncDelayMs);

  if (!visible) return null;

  const isMulti = Boolean(tvState?.multi);
  const screen0 = tvState?.screens?.find((s) => s.idx === 0);
  const screen1 = tvState?.screens?.find((s) => s.idx === 1);
  const tvAudio = tvState?.tvAudio || (tvState?.active === 1 ? '1' : '0');
  const activeScreen = tvState?.active ?? 0;
  const isVod = tvState?.mode === 'vod';

  const handleTvAudio = (src: '0' | '1' | 'mute') => {
    saimoConnect.setTvAudio(src);
  };

  const handlePhoneAudio = (src: PhoneAudioMode) => {
    saimoConnect.setPhoneAudio(src);
  };

  const handleFocusScreen = (idx: number) => {
    saimoConnect.setActiveScreen(idx);
  };

  const handleAdjustDelay = (delta: number) => {
    const next = Math.max(-10000, Math.min(30000, audioSyncDelayMs + delta));
    setAudioSyncDelayMs(next);
  };

  const handleSyncWithTv = () => {
    setAudioSyncDelayMs(0);
    saimoConnect.requestSync();
  };

  const activeTrackScreen = phoneAudioMode === '1' ? screen1 : screen0;
  const tvLiveOffsetMs =
    activeTrackScreen?.liveOffset && activeTrackScreen.liveOffset > 0
      ? activeTrackScreen.liveOffset
      : 12000;
  const tvOffsetSecStr = (tvLiveOffsetMs / 1000).toFixed(1);
  const totalOffsetSecStr = (Math.max(500, tvLiveOffsetMs + audioSyncDelayMs) / 1000).toFixed(1);

  // Mensagem descritiva do cenário atual
  let cenarioDica = '';
  let cenarioIcone: React.ComponentProps<typeof MaterialIcons>['name'] = 'info-outline';
  if (isMulti) {
    if (tvAudio === '0' && phoneAudioMode === '1') {
      cenarioIcone = 'auto-awesome';
      cenarioDica = 'Modo Duas Pessoas: A TV toca o Canal 1 na sala enquanto você ouve o Canal 2 no celular/fone!';
    } else if (tvAudio === '1' && phoneAudioMode === '0') {
      cenarioIcone = 'auto-awesome';
      cenarioDica = 'Modo Duas Pessoas: A TV toca o Canal 2 na sala enquanto você ouve o Canal 1 no celular/fone!';
    } else if (tvAudio === 'mute' && (phoneAudioMode === '0' || phoneAudioMode === '1')) {
      cenarioIcone = 'volume-off';
      cenarioDica = `Modo Silencioso: A TV está muda na sala e você ouve o Canal ${phoneAudioMode === '0' ? '1' : '2'} no fone.`;
    } else if (phoneAudioMode === 'both') {
      cenarioIcone = 'headset';
      cenarioDica = 'Ambos os canais estão mixados no seu celular.';
    } else if (phoneAudioMode === 'none') {
      cenarioIcone = 'phone-android';
      cenarioDica = 'Som do celular desligado. Apenas a TV está emitindo som.';
    } else if (tvAudio === phoneAudioMode) {
      cenarioIcone = 'campaign';
      cenarioDica = `TV e Celular estão ambos sintonizados no áudio do Canal ${tvAudio === '0' ? '1' : '2'}.`;
    }
  } else {
    if (phoneAudioMode !== 'none') {
      if (tvAudio === 'mute') {
        cenarioIcone = 'volume-off';
        cenarioDica = 'Modo Silencioso Ativo: A TV está muda na sala e você está ouvindo com exclusividade no celular/fone!';
      } else {
        cenarioIcone = 'campaign';
        cenarioDica = 'TV e celular estão tocando ao mesmo tempo. Ajuste a sincronia abaixo se houver delay.';
      }
    } else {
      cenarioIcone = 'phone-android';
      cenarioDica = 'Som do celular desligado. A TV está reproduzindo normalmente nos alto-falantes.';
    }
  }

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => setVisible(false)}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.dismissOverlay} onPress={() => setVisible(false)} />
        <View style={styles.container}>
          <View style={styles.handle} />

          {/* Cabeçalho fixo no topo */}
          <View style={styles.header}>
            <View style={styles.headerTitles}>
              <Text style={styles.title}>
                {isMulti ? 'Áudio Multi-Tela' : 'Áudio no Celular & TV'}
              </Text>
              <Text style={styles.subtitle}>
                {isMulti
                  ? 'Controle o som da TV e do seu celular separadamente'
                  : 'Ouça a TV no fone de ouvido ou alto-falante do celular'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setVisible(false)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Conteúdo com Scroll vertical suave e livre */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            bounces={true}
            showsVerticalScrollIndicator={true}
            indicatorStyle="white"
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled={true}
          >
            {/* Visualização dos canais */}
            {isMulti ? (
              <View style={styles.screensRow}>
                {/* Canal 1 */}
                <TouchableOpacity
                  style={[
                    styles.screenCard,
                    activeScreen === 0 && styles.screenCardActive,
                  ]}
                  onPress={() => handleFocusScreen(0)}
                  activeOpacity={0.8}
                >
                  <View style={styles.screenCardHeader}>
                    <View style={[styles.badge, styles.badge1]}>
                      <Text style={styles.badgeText}>CANAL 1</Text>
                    </View>
                    {activeScreen === 0 && (
                      <View style={styles.focusBadge}>
                        <Text style={styles.focusBadgeText}>Foco TV</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.channelInfo}>
                    {screen0?.logo ? (
                      <Image source={{ uri: screen0.logo }} style={styles.channelLogo} resizeMode="contain" />
                    ) : (
                      <View style={styles.channelLogoFallback}>
                        <MaterialIcons name="tv" size={20} color={Colors.textSecondary} />
                      </View>
                    )}
                    <View style={styles.channelText}>
                      <Text style={styles.channelName} numberOfLines={1}>
                        {screen0?.channel || 'Canal 1'}
                      </Text>
                      <Text style={styles.programTitle} numberOfLines={1}>
                        {screen0?.program || 'Transmissão ao vivo'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>

                {/* Canal 2 */}
                <TouchableOpacity
                  style={[
                    styles.screenCard,
                    activeScreen === 1 && styles.screenCardActive,
                  ]}
                  onPress={() => handleFocusScreen(1)}
                  activeOpacity={0.8}
                >
                  <View style={styles.screenCardHeader}>
                    <View style={[styles.badge, styles.badge2]}>
                      <Text style={styles.badgeText}>CANAL 2</Text>
                    </View>
                    {activeScreen === 1 && (
                      <View style={styles.focusBadge}>
                        <Text style={styles.focusBadgeText}>Foco TV</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.channelInfo}>
                    {screen1?.logo ? (
                      <Image source={{ uri: screen1.logo }} style={styles.channelLogo} resizeMode="contain" />
                    ) : (
                      <View style={styles.channelLogoFallback}>
                        <MaterialIcons name="tv" size={20} color={Colors.textSecondary} />
                      </View>
                    )}
                    <View style={styles.channelText}>
                      <Text style={styles.channelName} numberOfLines={1}>
                        {screen1?.channel || 'Canal 2'}
                      </Text>
                      <Text style={styles.programTitle} numberOfLines={1}>
                        {screen1?.program || 'Transmissão ao vivo'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.singleScreenCard}>
                <View style={styles.singleScreenHeader}>
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: isVod ? Colors.secondary : '#3B82F6' },
                    ]}
                  >
                    <Text style={styles.badgeText}>{isVod ? 'FILME / SÉRIE' : 'TV AO VIVO'}</Text>
                  </View>
                  {phoneAudioMode !== 'none' && (
                    <View style={styles.activePillBadge}>
                      <Ionicons name="headset" size={11} color="#fff" />
                      <Text style={styles.activePillBadgeText}>Áudio Ativo no Celular</Text>
                    </View>
                  )}
                </View>

                <View style={styles.channelInfo}>
                  {screen0?.logo ? (
                    <Image source={{ uri: screen0.logo }} style={styles.channelLogo} resizeMode="contain" />
                  ) : (
                    <View style={styles.channelLogoFallback}>
                      <MaterialIcons name={isVod ? 'movie' : 'tv'} size={20} color={Colors.textSecondary} />
                    </View>
                  )}
                  <View style={styles.channelText}>
                    <Text style={styles.channelName} numberOfLines={1}>
                      {screen0?.channel || (isVod ? tvState?.vod?.title || 'Filme / Série' : 'Canal de TV')}
                    </Text>
                    <Text style={styles.programTitle} numberOfLines={1}>
                      {screen0?.program || (isVod ? tvState?.vod?.subtitle || 'Reproduzindo na TV' : 'Transmissão')}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Balão de Dica / Cenário inteligente */}
            {cenarioDica ? (
              <View style={[styles.tipCard, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                <MaterialIcons name={cenarioIcone} size={18} color={Colors.primaryLight} />
                <Text style={[styles.tipText, { flex: 1 }]}>{cenarioDica}</Text>
              </View>
            ) : null}

            {/* SEÇÃO 1: SOM DA TV */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="volume-high" size={20} color={Colors.primary} />
                <Text style={styles.sectionTitle}>Som dos Alto-falantes da TV</Text>
              </View>
              <Text style={styles.sectionDesc}>
                {isMulti
                  ? 'Escolha o canal que vai sair pelo som da sua TV na sala:'
                  : 'Deixe a TV com som ou ative o mudo para ouvir com privacidade no fone:'}
              </Text>

              {isMulti ? (
                <View style={styles.buttonGroup}>
                  <TouchableOpacity
                    style={[styles.choiceBtn, tvAudio === '0' && styles.choiceBtnActive]}
                    onPress={() => handleTvAudio('0')}
                  >
                    <MaterialIcons
                      name="volume-up"
                      size={20}
                      color={tvAudio === '0' ? '#fff' : Colors.textSecondary}
                    />
                    <Text style={[styles.choiceBtnText, tvAudio === '0' && styles.choiceBtnTextActive]}>
                      Canal 1
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.choiceBtn, tvAudio === '1' && styles.choiceBtnActive]}
                    onPress={() => handleTvAudio('1')}
                  >
                    <MaterialIcons
                      name="volume-up"
                      size={20}
                      color={tvAudio === '1' ? '#fff' : Colors.textSecondary}
                    />
                    <Text style={[styles.choiceBtnText, tvAudio === '1' && styles.choiceBtnTextActive]}>
                      Canal 2
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.choiceBtn, tvAudio === 'mute' && styles.choiceBtnMuteActive]}
                    onPress={() => handleTvAudio('mute')}
                  >
                    <MaterialIcons
                      name="volume-off"
                      size={20}
                      color={tvAudio === 'mute' ? '#fff' : Colors.textSecondary}
                    />
                    <Text style={[styles.choiceBtnText, tvAudio === 'mute' && styles.choiceBtnTextActive]}>
                      Mudo
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.buttonGroup}>
                  <TouchableOpacity
                    style={[styles.choiceBtn, tvAudio !== 'mute' && styles.choiceBtnActive]}
                    onPress={() => handleTvAudio('0')}
                  >
                    <MaterialIcons
                      name="volume-up"
                      size={20}
                      color={tvAudio !== 'mute' ? '#fff' : Colors.textSecondary}
                    />
                    <Text style={[styles.choiceBtnText, tvAudio !== 'mute' && styles.choiceBtnTextActive]}>
                      Som Ligado na TV
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.choiceBtn, tvAudio === 'mute' && styles.choiceBtnMuteActive]}
                    onPress={() => handleTvAudio('mute')}
                  >
                    <MaterialIcons
                      name="volume-off"
                      size={20}
                      color={tvAudio === 'mute' ? '#fff' : Colors.textSecondary}
                    />
                    <Text style={[styles.choiceBtnText, tvAudio === 'mute' && styles.choiceBtnTextActive]}>
                      Mudo na TV (Silencioso)
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* SEÇÃO 2: SOM NESTE CELULAR */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="headset" size={20} color={Colors.secondary} />
                <Text style={styles.sectionTitle}>Som neste Celular / Fone</Text>
              </View>
              <Text style={styles.sectionDesc}>
                {isMulti
                  ? 'Ouça individualmente pelo alto-falante ou fone Bluetooth:'
                  : 'Transmitir o áudio da TV direto para este celular/fone:'}
              </Text>

              {isMulti ? (
                <View style={styles.buttonGroup}>
                  <TouchableOpacity
                    style={[
                      styles.choiceBtn,
                      phoneAudioMode === 'none' && styles.choiceBtnActiveSecondary,
                    ]}
                    onPress={() => handlePhoneAudio('none')}
                  >
                    <Ionicons
                      name="volume-mute-outline"
                      size={18}
                      color={phoneAudioMode === 'none' ? '#fff' : Colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.choiceBtnText,
                        phoneAudioMode === 'none' && styles.choiceBtnTextActive,
                      ]}
                    >
                      Nenhum
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.choiceBtn,
                      phoneAudioMode === '0' && styles.choiceBtnActiveSecondary,
                    ]}
                    onPress={() => handlePhoneAudio('0')}
                  >
                    <Ionicons
                      name="headset"
                      size={18}
                      color={phoneAudioMode === '0' ? '#fff' : Colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.choiceBtnText,
                        phoneAudioMode === '0' && styles.choiceBtnTextActive,
                      ]}
                    >
                      Canal 1
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.choiceBtn,
                      phoneAudioMode === '1' && styles.choiceBtnActiveSecondary,
                    ]}
                    onPress={() => handlePhoneAudio('1')}
                  >
                    <Ionicons
                      name="headset"
                      size={18}
                      color={phoneAudioMode === '1' ? '#fff' : Colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.choiceBtnText,
                        phoneAudioMode === '1' && styles.choiceBtnTextActive,
                      ]}
                    >
                      Canal 2
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.choiceBtn,
                      phoneAudioMode === 'both' && styles.choiceBtnActiveSecondary,
                    ]}
                    onPress={() => handlePhoneAudio('both')}
                  >
                    <Ionicons
                      name="options"
                      size={18}
                      color={phoneAudioMode === 'both' ? '#fff' : Colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.choiceBtnText,
                        phoneAudioMode === 'both' && styles.choiceBtnTextActive,
                      ]}
                    >
                      Ambos
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.buttonGroup}>
                  <TouchableOpacity
                    style={[
                      styles.choiceBtn,
                      phoneAudioMode === 'none' && styles.choiceBtnActiveSecondary,
                    ]}
                    onPress={() => handlePhoneAudio('none')}
                  >
                    <Ionicons
                      name="volume-mute-outline"
                      size={18}
                      color={phoneAudioMode === 'none' ? '#fff' : Colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.choiceBtnText,
                        phoneAudioMode === 'none' && styles.choiceBtnTextActive,
                      ]}
                    >
                      Desligado
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.choiceBtn,
                      phoneAudioMode !== 'none' && styles.choiceBtnActiveSecondary,
                    ]}
                    onPress={() => handlePhoneAudio('0')}
                  >
                    <Ionicons
                      name="headset"
                      size={18}
                      color={phoneAudioMode !== 'none' ? '#fff' : Colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.choiceBtnText,
                        phoneAudioMode !== 'none' && styles.choiceBtnTextActive,
                      ]}
                    >
                      Ouvir no Celular
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* SINCRONIA DO ÁUDIO COM A TV & FONE */}
            {phoneAudioMode !== 'none' && (
              <View style={styles.syncCard}>
                <View style={styles.syncHeader}>
                  <Ionicons name="sync-circle" size={20} color={Colors.primaryLight} />
                  <Text style={styles.syncTitle}>Sincronia com a TV & Fone</Text>
                  <View style={styles.syncBadge}>
                    <Text style={styles.syncBadgeText}>
                      {audioSyncDelayMs === 0
                        ? 'Automático'
                        : `${audioSyncDelayMs > 0 ? '+' : ''}${(audioSyncDelayMs / 1000).toFixed(1)}s`}
                    </Text>
                  </View>
                </View>

                {/* Status da Sincronia */}
                <View style={styles.syncStatusBox}>
                  <View style={styles.syncStatusRow}>
                    <Text style={styles.syncStatusLabel}>Buffer da TV:</Text>
                    <Text style={styles.syncStatusVal}>~{tvOffsetSecStr}s atrás do vivo</Text>
                  </View>
                  <View style={styles.syncStatusRow}>
                    <Text style={styles.syncStatusLabel}>Celular tocando em:</Text>
                    <Text style={styles.syncStatusValHighlight}>~{totalOffsetSecStr}s atrás do vivo</Text>
                  </View>
                </View>

                <Text style={styles.syncDesc}>
                  O áudio é sincronizado com a TV. Se a voz no celular ainda estiver à frente da imagem, aumente o atraso (+). Se estiver atrasada, diminua (-).
                </Text>

                {/* Botão de Sincronia Automática com a TV */}
                <TouchableOpacity
                  style={styles.syncAutoBtn}
                  onPress={handleSyncWithTv}
                  activeOpacity={0.8}
                >
                  <Ionicons name="refresh" size={16} color="#fff" />
                  <Text style={styles.syncAutoBtnText}>Sincronizar com o Buffer da TV</Text>
                </TouchableOpacity>

                {/* Ajuste Fino */}
                <Text style={styles.syncSubLabel}>Ajuste Fino:</Text>
                <View style={styles.syncControls}>
                  <TouchableOpacity
                    style={styles.syncStepBtn}
                    onPress={() => handleAdjustDelay(-1000)}
                  >
                    <Text style={styles.syncStepBtnText}>-1s</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.syncStepBtn}
                    onPress={() => handleAdjustDelay(-200)}
                  >
                    <Text style={styles.syncStepBtnText}>-0.2s</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.syncResetBtn}
                    onPress={() => setAudioSyncDelayMs(0)}
                  >
                    <Text style={styles.syncResetBtnText}>Zerar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.syncStepBtn}
                    onPress={() => handleAdjustDelay(200)}
                  >
                    <Text style={styles.syncStepBtnText}>+0.2s</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.syncStepBtn}
                    onPress={() => handleAdjustDelay(1000)}
                  >
                    <Text style={styles.syncStepBtnText}>+1s</Text>
                  </TouchableOpacity>
                </View>

                {/* Presets de salto rápido */}
                <Text style={styles.syncSubLabel}>Saltos Rápidos de Atraso:</Text>
                <View style={styles.presetsRow}>
                  {[2000, 5000, 8000, 10000, 12000, 15000].map((presetMs) => {
                    const isSelected = audioSyncDelayMs === presetMs;
                    return (
                      <TouchableOpacity
                        key={`preset-${presetMs}`}
                        style={[styles.presetBtn, isSelected && styles.presetBtnActive]}
                        onPress={() => setAudioSyncDelayMs(presetMs)}
                      >
                        <Text style={[styles.presetBtnText, isSelected && styles.presetBtnTextActive]}>
                          +{presetMs / 1000}s
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Ações inferiores */}
            <View style={styles.bottomActions}>
              {isMulti ? (
                <TouchableOpacity
                  style={styles.exitMultiBtn}
                  onPress={() => {
                    saimoConnect.toggleMultiTela(false);
                    setVisible(false);
                  }}
                >
                  <MaterialIcons name="fullscreen" size={20} color={Colors.error} />
                  <Text style={styles.exitMultiBtnText}>Sair da Multi-Tela na TV</Text>
                </TouchableOpacity>
              ) : !isVod ? (
                <TouchableOpacity
                  style={styles.enterMultiBtn}
                  onPress={() => {
                    saimoConnect.toggleMultiTela(true);
                  }}
                >
                  <MaterialIcons name="picture-in-picture" size={20} color={Colors.primaryLight} />
                  <Text style={styles.enterMultiBtnText}>Dividir Tela (Ativar Multi-Tela)</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  dismissOverlay: {
    flex: 1,
  },
  container: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: 0,
    maxHeight: '90%',
    display: 'flex',
    flexDirection: 'column',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  headerTitles: {
    flex: 1,
  },
  title: {
    color: Colors.text,
    fontSize: Typography.h3.fontSize,
    fontWeight: '700',
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: Typography.caption.fontSize,
    marginTop: 2,
  },
  closeBtn: {
    padding: Spacing.xs,
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: 48,
  },
  screensRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  screenCard: {
    flex: 1,
    backgroundColor: Colors.surfaceVariant,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  screenCardActive: {
    borderColor: Colors.primary,
    backgroundColor: '#1E1E38',
  },
  screenCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  singleScreenCard: {
    backgroundColor: Colors.surfaceVariant,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  singleScreenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  activePillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.secondary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.xs,
  },
  activePillBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  badge1: {
    backgroundColor: '#3B82F6',
  },
  badge2: {
    backgroundColor: '#8B5CF6',
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  focusBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  focusBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '600',
  },
  channelInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  channelLogo: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.xs,
  },
  channelLogoFallback: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.xs,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelText: {
    flex: 1,
  },
  channelName: {
    color: Colors.text,
    fontSize: Typography.body.fontSize,
    fontWeight: '600',
  },
  programTitle: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  tipCard: {
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderColor: 'rgba(99, 102, 241, 0.3)',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  tipText: {
    color: '#C7D2FE',
    fontSize: Typography.caption.fontSize,
    lineHeight: 18,
    fontWeight: '500',
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: 4,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: Typography.bodyLarge.fontSize,
    fontWeight: '600',
  },
  sectionDesc: {
    color: Colors.textSecondary,
    fontSize: Typography.caption.fontSize,
    marginBottom: Spacing.sm,
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  choiceBtn: {
    flex: 1,
    backgroundColor: Colors.surfaceVariant,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  choiceBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryLight,
  },
  choiceBtnActiveSecondary: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondaryLight,
  },
  choiceBtnMuteActive: {
    backgroundColor: '#4B5563',
    borderColor: '#6B7280',
  },
  choiceBtnText: {
    color: Colors.textSecondary,
    fontSize: Typography.caption.fontSize,
    fontWeight: '600',
    textAlign: 'center',
  },
  choiceBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  syncCard: {
    backgroundColor: Colors.surfaceVariant,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  syncHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: 4,
  },
  syncTitle: {
    color: Colors.text,
    fontSize: Typography.body.fontSize,
    fontWeight: '600',
    flex: 1,
  },
  syncBadge: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
  },
  syncBadgeText: {
    color: Colors.primaryLight,
    fontSize: 11,
    fontWeight: '700',
  },
  syncStatusBox: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
    gap: 4,
  },
  syncStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  syncStatusLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  syncStatusVal: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  syncStatusValHighlight: {
    color: Colors.primaryLight,
    fontSize: 12,
    fontWeight: '700',
  },
  syncDesc: {
    color: Colors.textSecondary,
    fontSize: Typography.caption.fontSize,
    lineHeight: 18,
    marginBottom: Spacing.sm,
  },
  syncAutoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    gap: 6,
    marginBottom: Spacing.sm,
  },
  syncAutoBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  syncSubLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 4,
  },
  syncControls: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  syncStepBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  syncStepBtnText: {
    color: Colors.text,
    fontSize: Typography.caption.fontSize,
    fontWeight: '600',
  },
  syncResetBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  syncResetBtnText: {
    color: Colors.textSecondary,
    fontSize: Typography.caption.fontSize,
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  presetBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    paddingVertical: 6,
    borderRadius: BorderRadius.xs,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  presetBtnActive: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondaryLight,
  },
  presetBtnText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  presetBtnTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  bottomActions: {
    marginTop: Spacing.xs,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  exitMultiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  exitMultiBtnText: {
    color: Colors.errorLight,
    fontSize: Typography.body.fontSize,
    fontWeight: '600',
  },
  enterMultiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceVariant,
  },
  enterMultiBtnText: {
    color: Colors.text,
    fontSize: Typography.body.fontSize,
    fontWeight: '600',
  },
});
