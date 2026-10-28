import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  ScrollView,
  Image,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons, MaterialIcons, Feather } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../constants/Colors';
import { useConnectStore } from '../stores/connectStore';
import { saimoConnect } from '../services/saimoConnect';

export default function ConnectRemote() {
  const visible = useConnectStore((s) => s.isRemoteVisible);
  const setVisible = useConnectStore((s) => s.setRemoteVisible);
  const connectedTv = useConnectStore((s) => s.connectedTv);
  const tvState = useConnectStore((s) => s.tvState);
  const phoneAudioMode = useConnectStore((s) => s.phoneAudioMode);
  const setMultiAudioVisible = useConnectStore((s) => s.setMultiAudioVisible);
  const textRequest = useConnectStore((s) => s.textRequest);

  const isLive = tvState?.mode === 'live';
  const isSearch = tvState?.screen === 'search';

  const [customText, setCustomText] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [showNumpad, setShowNumpad] = useState(false);
  const [typedDigits, setTypedDigits] = useState('');
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    if (tvState?.screen === 'search' && tvState.searchText !== undefined) {
      setSearchText(tvState.searchText);
    }
  }, [tvState?.screen, tvState?.searchText]);

  if (!visible) return null;

  const currentScreen = tvState?.screens?.find((s) => s.idx === (tvState?.active ?? 0));
  const isMulti = tvState?.multi;

  const handleKey = (
    code:
      | 'UP'
      | 'DOWN'
      | 'LEFT'
      | 'RIGHT'
      | 'OK'
      | 'BACK'
      | 'HOME'
      | 'MENU'
      | 'CH_UP'
      | 'CH_DOWN'
      | 'DEL'
      | 'CLEAR'
      | '0'
      | '1'
      | '2'
      | '3'
      | '4'
      | '5'
      | '6'
      | '7'
      | '8'
      | '9'
  ) => {
    if (code === 'OK') {
      setTypedDigits('');
    }
    saimoConnect.sendKey(code);
  };

  const handleNumber = (n: string) => {
    setTypedDigits((prev) => (prev + n).slice(-4));
    saimoConnect.sendKey(n as any);
  };

  const handleBackspace = () => {
    setTypedDigits((prev) => prev.slice(0, -1));
    saimoConnect.sendKey('DEL');
  };

  const handleClearDigits = () => {
    setTypedDigits('');
    saimoConnect.sendKey('CLEAR');
  };

  const handleSearchChange = (text: string) => {
    setSearchText(text);
    saimoConnect.sendText(text);
  };

  const handleSendCustomText = () => {
    if (customText.trim()) {
      saimoConnect.sendText(customText.trim());
      setCustomText('');
      setShowTextInput(false);
    }
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={() => setVisible(false)}
    >
      <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
        <Pressable style={styles.container} onPress={() => {}}>
          {/* Puxador da gaveta */}
          <View style={styles.handle} />

          {/* Cabeçalho do Controle */}
          <View style={styles.header}>
            <View style={styles.headerTitles}>
              <View style={styles.tvTitleRow}>
                <MaterialIcons name="settings-remote" size={20} color={Colors.primary} />
                <Text style={styles.title} numberOfLines={1}>
                  {connectedTv?.name || 'Saimo TV'}
                </Text>
                <View style={styles.badgeConnected}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusText}>Conectado</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setVisible(false)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            {showNumpad ? (
              <View style={styles.numpadContainer}>
                {/* BARRA SUPERIOR DO TECLADO NUMÉRICO COM BOTÃO VOLTAR */}
                <View style={styles.numpadTopBar}>
                  <TouchableOpacity
                    style={styles.numpadBackBtn}
                    onPress={() => setShowNumpad(false)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="arrow-back" size={20} color="#fff" />
                    <Text style={styles.numpadBackText}>Voltar ao Controle</Text>
                  </TouchableOpacity>

                  <View style={styles.numpadModeTag}>
                    <MaterialIcons name="dialpad" size={14} color={Colors.primaryLight} />
                    <Text style={styles.numpadModeTagText}>Teclado Numérico</Text>
                  </View>
                </View>

                {/* DISPLAY DO CANAL DIGITADO */}
                <View style={styles.numpadDisplayCard}>
                  <View style={styles.numpadDisplayLeft}>
                    <Text style={styles.numpadDisplayLabel}>CANAL SELECIONADO</Text>
                    <Text style={styles.numpadDisplayValue}>
                      {typedDigits || '---'}
                    </Text>
                  </View>

                  {typedDigits.length > 0 && (
                    <TouchableOpacity
                      style={styles.numpadBackspaceBtn}
                      onPress={handleBackspace}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="backspace-outline" size={22} color={Colors.textSecondary} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* GRADE DE NÚMEROS 3x4 */}
                <View style={styles.numpadGrid}>
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
                    <TouchableOpacity
                      key={n}
                      style={styles.numpadKey}
                      onPress={() => handleNumber(n)}
                      activeOpacity={0.65}
                    >
                      <Text style={styles.numpadKeyText}>{n}</Text>
                    </TouchableOpacity>
                  ))}

                  {/* TECLA LIMPAR */}
                  <TouchableOpacity
                    style={[styles.numpadKey, styles.numpadKeyClear]}
                    onPress={handleClearDigits}
                    activeOpacity={0.65}
                  >
                    <Ionicons name="close" size={20} color={Colors.errorLight} />
                    <Text style={styles.numpadKeyClearText}>Limpar</Text>
                  </TouchableOpacity>

                  {/* TECLA 0 */}
                  <TouchableOpacity
                    style={styles.numpadKey}
                    onPress={() => handleNumber('0')}
                    activeOpacity={0.65}
                  >
                    <Text style={styles.numpadKeyText}>0</Text>
                  </TouchableOpacity>

                  {/* TECLA OK */}
                  <TouchableOpacity
                    style={[styles.numpadKey, styles.numpadKeyOk]}
                    onPress={() => handleKey('OK')}
                    activeOpacity={0.65}
                  >
                    <Ionicons name="checkmark" size={20} color="#fff" />
                    <Text style={styles.numpadKeyOkText}>OK</Text>
                  </TouchableOpacity>
                </View>

                {/* DICA DE USO */}
                <Text style={styles.numpadHint}>
                  Toque nos números para digitar o canal e em OK para sintonizar.
                </Text>
              </View>
            ) : (
              <>
                {/* 1. NOW PLAYING PILL COMPACTO (GLASSMORPHISM) */}
                {isLive && currentScreen ? (
                  <View style={styles.nowPlayingCard}>
                    <View style={styles.npRow}>
                      {currentScreen.logo ? (
                        <Image source={{ uri: currentScreen.logo }} style={styles.npLogo} resizeMode="contain" />
                      ) : (
                        <View style={styles.npLogoFallback}>
                          <MaterialIcons name="tv" size={18} color={Colors.textSecondary} />
                        </View>
                      )}
                      <View style={styles.npInfo}>
                        <Text style={styles.npChannel} numberOfLines={1}>
                          {currentScreen.channel}
                        </Text>
                        <Text style={styles.npProgram} numberOfLines={1}>
                          {currentScreen.program || 'Ao Vivo'}
                        </Text>
                      </View>
                      <View style={styles.npLiveBadge}>
                        <Text style={styles.npLiveText}>AO VIVO</Text>
                      </View>
                    </View>

                    {/* AÇÕES RÁPIDAS COMPACTAS */}
                    <View style={styles.npActionsRow}>
                      <TouchableOpacity
                        style={[styles.npMiniPill, isMulti && styles.npMiniPillActive]}
                        onPress={() => saimoConnect.toggleMultiTela(!isMulti)}
                      >
                        <MaterialIcons
                          name={isMulti ? 'fullscreen-exit' : 'picture-in-picture'}
                          size={14}
                          color={isMulti ? '#fff' : Colors.primaryLight}
                        />
                        <Text style={[styles.npMiniPillText, isMulti && styles.npMiniPillTextActive]}>
                          {isMulti ? 'Tela Única' : 'Multi-Tela'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.npMiniPill,
                          phoneAudioMode !== 'none' ? styles.npMiniPillAudioActive : styles.npMiniPillAudio,
                        ]}
                        onPress={() => {
                          setVisible(false);
                          setMultiAudioVisible(true);
                        }}
                      >
                        <Ionicons
                          name="headset"
                          size={13}
                          color={phoneAudioMode !== 'none' ? '#fff' : Colors.primaryLight}
                        />
                        <Text
                          style={[
                            styles.npMiniPillText,
                            phoneAudioMode !== 'none'
                              ? { color: '#fff', fontWeight: '700' }
                              : { color: Colors.primaryLight },
                          ]}
                        >
                          {phoneAudioMode !== 'none' ? 'Ouvindo' : 'Áudio'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.npMiniPill}
                        onPress={() => saimoConnect.trocarFonte(1)}
                      >
                        <Feather name="refresh-cw" size={13} color={Colors.textSecondary} />
                        <Text style={styles.npMiniPillText}>Fonte</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : tvState?.mode === 'vod' && tvState.vod ? (
                  <View style={styles.nowPlayingCard}>
                    <View style={styles.npRow}>
                      <View style={styles.npLogoFallback}>
                        <MaterialIcons name="movie" size={18} color={Colors.secondary} />
                      </View>
                      <View style={styles.npInfo}>
                        <Text style={styles.npChannel} numberOfLines={1}>
                          {tvState.vod.title}
                        </Text>
                        <Text style={styles.npProgram} numberOfLines={1}>
                          {tvState.vod.subtitle || 'Filme / Série'}
                        </Text>
                      </View>
                    </View>

                    {/* CONTROLES DE REPRODUÇÃO VOD */}
                    <View style={styles.vodControlsRow}>
                      <TouchableOpacity style={styles.vodMiniBtn} onPress={() => saimoConnect.seek(-10000)}>
                        <MaterialIcons name="replay-10" size={20} color={Colors.text} />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.vodPlayBtn} onPress={() => saimoConnect.playPause()}>
                        <MaterialIcons
                          name={tvState.playing ? 'pause' : 'play-arrow'}
                          size={22}
                          color="#fff"
                        />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.vodMiniBtn} onPress={() => saimoConnect.seek(10000)}>
                        <MaterialIcons name="forward-10" size={20} color={Colors.text} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.vodMiniBtn,
                          phoneAudioMode !== 'none' && {
                            backgroundColor: Colors.secondary,
                            borderColor: Colors.secondaryLight,
                          },
                        ]}
                        onPress={() => {
                          setVisible(false);
                          setMultiAudioVisible(true);
                        }}
                      >
                        <Ionicons
                          name="headset"
                          size={18}
                          color={phoneAudioMode !== 'none' ? '#fff' : Colors.text}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}

                {/* 2. BARRA DE NAVEGAÇÃO PRINCIPAL (VOLTAR, HOME, MENU, ESCREVER) */}
                <View style={styles.navBar}>
                  <TouchableOpacity style={styles.navBtn} onPress={() => handleKey('BACK')} activeOpacity={0.7}>
                    <Ionicons name="arrow-back" size={20} color={Colors.text} />
                    <Text style={styles.navBtnText}>Voltar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.navBtn} onPress={() => handleKey('HOME')} activeOpacity={0.7}>
                    <Ionicons name="home-outline" size={20} color={Colors.text} />
                    <Text style={styles.navBtnText}>Início</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.navBtn} onPress={() => handleKey('MENU')} activeOpacity={0.7}>
                    <Ionicons name="menu-outline" size={20} color={Colors.text} />
                    <Text style={styles.navBtnText}>Menu</Text>
                  </TouchableOpacity>

                  {isSearch ? (
                    <TouchableOpacity
                      style={[styles.navBtn, styles.navBtnActive]}
                      onPress={() => {}}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="search" size={20} color={Colors.primaryLight} />
                      <Text style={[styles.navBtnText, { color: Colors.primaryLight }]}>Buscar</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.navBtn, (showTextInput || textRequest) && styles.navBtnActive]}
                      onPress={() => setShowTextInput(!showTextInput)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="create-outline"
                        size={20}
                        color={showTextInput || textRequest ? Colors.primaryLight : Colors.text}
                      />
                      <Text style={[styles.navBtnText, (showTextInput || textRequest) && { color: Colors.primaryLight }]}>
                        Escrever
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* 3. CAMPO DE ENTRADA / BUSCA EM TEMPO REAL NA TV */}
                {isSearch && (
                  <View style={styles.searchBox}>
                    <Ionicons name="search" size={18} color={Colors.primaryLight} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Pesquisar em tempo real na TV..."
                      placeholderTextColor={Colors.textMuted}
                      value={searchText}
                      onChangeText={handleSearchChange}
                      autoFocus
                      returnKeyType="search"
                    />
                    {searchText.length > 0 && (
                      <TouchableOpacity onPress={() => handleSearchChange('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {!isSearch && (showTextInput || textRequest) && (
                  <View style={styles.keyboardBox}>
                    <TextInput
                      style={styles.keyboardInput}
                      placeholder={textRequest?.hint || 'Escreva algo para a TV...'}
                      placeholderTextColor={Colors.textMuted}
                      value={customText}
                      onChangeText={setCustomText}
                      autoFocus
                      onSubmitEditing={handleSendCustomText}
                      returnKeyType="send"
                    />
                    <TouchableOpacity style={styles.keyboardSendBtn} onPress={handleSendCustomText}>
                      <Ionicons name="send" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                )}

                {/* 4. D-PAD CIRCULAR ERGONÔMICO (CENTRO DO CONTROLE) */}
                <View style={styles.dpadSection}>
                  <View style={styles.dpadDisc}>
                    {/* UP */}
                    <TouchableOpacity
                      style={[styles.dpadDirectionBtn, styles.dpadUp]}
                      onPress={() => handleKey('UP')}
                      activeOpacity={0.65}
                    >
                      <Ionicons name="chevron-up" size={28} color={Colors.text} />
                    </TouchableOpacity>

                    {/* LEFT & OK & RIGHT */}
                    <View style={styles.dpadMiddleRow}>
                      <TouchableOpacity
                        style={[styles.dpadDirectionBtn, styles.dpadLeft]}
                        onPress={() => handleKey('LEFT')}
                        activeOpacity={0.65}
                      >
                        <Ionicons name="chevron-back" size={28} color={Colors.text} />
                      </TouchableOpacity>

                      {/* CENTRO OK */}
                      <TouchableOpacity
                        style={styles.dpadOkCenter}
                        onPress={() => handleKey('OK')}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.dpadOkText}>OK</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.dpadDirectionBtn, styles.dpadRight]}
                        onPress={() => handleKey('RIGHT')}
                        activeOpacity={0.65}
                      >
                        <Ionicons name="chevron-forward" size={28} color={Colors.text} />
                      </TouchableOpacity>
                    </View>

                    {/* DOWN */}
                    <TouchableOpacity
                      style={[styles.dpadDirectionBtn, styles.dpadDown]}
                      onPress={() => handleKey('DOWN')}
                      activeOpacity={0.65}
                    >
                      <Ionicons name="chevron-down" size={28} color={Colors.text} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* 5. BLOCO INFERIOR: VOLUME, FERRAMENTAS/123 E CANAL */}
                <View style={styles.bottomCluster}>
                  {/* ROCKER VOLUME */}
                  <View style={styles.rocker}>
                    <TouchableOpacity
                      style={styles.rockerBtn}
                      onPress={() => saimoConnect.setVolume(5)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="add" size={22} color={Colors.text} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rockerMid}
                      onPress={() => saimoConnect.setVolume(undefined, undefined, !tvState?.muted)}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons
                        name={tvState?.muted ? 'volume-off' : 'volume-up'}
                        size={18}
                        color={tvState?.muted ? Colors.error : Colors.primaryLight}
                      />
                      <Text style={styles.rockerLabel}>VOL</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rockerBtn}
                      onPress={() => saimoConnect.setVolume(-5)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="remove" size={22} color={Colors.text} />
                    </TouchableOpacity>
                  </View>

                  {/* BLOCO CENTRAL: NÚMEROS / TECLADO / REPRODUÇÃO */}
                  <View style={styles.centerTools}>
                    {/* BOTÃO NÚMEROS 123 */}
                    <TouchableOpacity
                      style={styles.centerToolBtn}
                      onPress={() => setShowNumpad(true)}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons name="dialpad" size={20} color={Colors.primaryLight} />
                      <Text style={styles.centerToolText}>123</Text>
                    </TouchableOpacity>

                    {/* PLAY/PAUSE OU MULTI */}
                    <TouchableOpacity
                      style={styles.centerToolBtn}
                      onPress={() => (isLive ? saimoConnect.toggleMultiTela(!isMulti) : saimoConnect.playPause())}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons
                        name={isLive ? (isMulti ? 'fullscreen' : 'picture-in-picture') : tvState?.playing ? 'pause' : 'play-arrow'}
                        size={20}
                        color={Colors.text}
                      />
                      <Text style={styles.centerToolText}>{isLive ? 'Multi' : 'Play'}</Text>
                    </TouchableOpacity>
                  </View>

                  {/* ROCKER CANAL */}
                  <View style={styles.rocker}>
                    <TouchableOpacity
                      style={styles.rockerBtn}
                      onPress={() => handleKey('CH_UP')}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="chevron-up" size={22} color={Colors.text} />
                    </TouchableOpacity>
                    <View style={styles.rockerMid}>
                      <MaterialIcons name="live-tv" size={18} color={Colors.primaryLight} />
                      <Text style={styles.rockerLabel}>CH</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.rockerBtn}
                      onPress={() => handleKey('CH_DOWN')}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="chevron-down" size={22} color={Colors.text} />
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#161726',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
    maxHeight: '94%',
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    marginBottom: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  headerTitles: {
    flex: 1,
  },
  tvTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
    maxWidth: '65%',
  },
  badgeConnected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.success,
  },
  statusText: {
    color: Colors.success,
    fontSize: 10,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 6,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingBottom: Spacing.md,
  },

  // 1. NOW PLAYING COMPACTO
  nowPlayingCard: {
    backgroundColor: 'rgba(30, 31, 56, 0.75)',
    borderRadius: BorderRadius.md,
    padding: 10,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  npRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  npLogo: {
    width: 34,
    height: 34,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  npLogoFallback: {
    width: 34,
    height: 34,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  npInfo: {
    flex: 1,
  },
  npChannel: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  npProgram: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  npLiveBadge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  npLiveText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  npActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  npMiniPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  npMiniPillActive: {
    backgroundColor: Colors.primary,
  },
  npMiniPillAudio: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.35)',
  },
  npMiniPillAudioActive: {
    backgroundColor: Colors.secondary,
    borderWidth: 1,
    borderColor: Colors.secondaryLight,
  },
  npMiniPillText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  npMiniPillTextActive: {
    color: '#fff',
  },
  vodControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginTop: 8,
  },
  vodMiniBtn: {
    padding: 6,
  },
  vodPlayBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 2. NAV BAR
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: BorderRadius.md,
    padding: 4,
    marginBottom: Spacing.sm,
  },
  navBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: BorderRadius.sm,
    gap: 2,
  },
  navBtnActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
  },
  navBtnText: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '600',
  },

  // 3. SEARCH & KEYBOARD
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 13,
    padding: 0,
  },
  keyboardBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    marginBottom: Spacing.sm,
  },
  keyboardInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 13,
    padding: 0,
  },
  keyboardSendBtn: {
    backgroundColor: Colors.primary,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 4. D-PAD DISCO CIRCULAR
  dpadSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: Spacing.xs,
  },
  dpadDisc: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#1E1F38',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  dpadDirectionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dpadUp: {
    width: '100%',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dpadDown: {
    width: '100%',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dpadMiddleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 4,
  },
  dpadLeft: {
    width: 48,
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dpadRight: {
    width: 48,
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dpadOkCenter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  dpadOkText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // 5. BLOCO INFERIOR (VOLUME, TOOLS, CANAL)
  bottomCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
    gap: 12,
  },
  rocker: {
    width: 64,
    height: 124,
    borderRadius: 32,
    backgroundColor: '#1E1F38',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  rockerBtn: {
    width: 54,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rockerMid: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  rockerLabel: {
    color: Colors.textSecondary,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  centerTools: {
    flex: 1,
    height: 124,
    justifyContent: 'space-between',
    gap: 8,
  },
  centerToolBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  centerToolBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryLight,
  },
  centerToolText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700',
  },

  // 6. TECLADO NUMÉRICO DEDICADO
  numpadContainer: {
    paddingVertical: Spacing.xs,
  },
  numpadTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  numpadBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  numpadBackText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  numpadModeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  numpadModeTagText: {
    color: Colors.primaryLight,
    fontSize: 11,
    fontWeight: '600',
  },
  numpadDisplayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E1F38',
    borderRadius: 16,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
  },
  numpadDisplayLeft: {
    flex: 1,
  },
  numpadDisplayLabel: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  numpadDisplayValue: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 2,
  },
  numpadBackspaceBtn: {
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
  },
  numpadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  numpadKey: {
    width: '31%',
    height: 58,
    borderRadius: 16,
    backgroundColor: '#1E1F38',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  numpadKeyText: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  numpadKeyClear: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.25)',
    flexDirection: 'row',
    gap: 4,
  },
  numpadKeyClearText: {
    color: Colors.errorLight,
    fontSize: 13,
    fontWeight: '700',
  },
  numpadKeyOk: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryLight,
    flexDirection: 'row',
    gap: 4,
    ...Platform.select({
      ios: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  numpadKeyOkText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  numpadHint: {
    color: Colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
});
