import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../constants/Colors';
import { useConnectStore, DiscoveredTv } from '../stores/connectStore';
import { saimoConnect, garantirPermissaoRede } from '../services/saimoConnect';

export default function ConnectSheet() {
  const visible = useConnectStore((s) => s.isSheetVisible);
  const setVisible = useConnectStore((s) => s.setSheetVisible);
  const status = useConnectStore((s) => s.status);
  const discoveredTvs = useConnectStore((s) => s.discoveredTvs);
  const connectedTv = useConnectStore((s) => s.connectedTv);
  const tvState = useConnectStore((s) => s.tvState);
  const setRemoteVisible = useConnectStore((s) => s.setRemoteVisible);
  const setMultiAudioVisible = useConnectStore((s) => s.setMultiAudioVisible);
  const phoneAudioMode = useConnectStore((s) => s.phoneAudioMode);
  const pendingPin = useConnectStore((s) => s.pendingPin);
  const semPermissaoRede = useConnectStore((s) => s.semPermissaoRede);

  const [showManual, setShowManual] = useState(false);
  const [manualIp, setManualIp] = useState('');
  const [manualPin, setManualPin] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const [justConnected, setJustConnected] = useState(false);

  // Ao abrir o modal, se não estiver conectado, inicia busca automática
  useEffect(() => {
    if (visible && status !== 'connected') {
      handleSearch();
    }
  }, [visible]);

  // Ao conectar com sucesso após clicar em conectar, abre o Controle Remoto automaticamente
  useEffect(() => {
    if (justConnected && visible && status === 'connected') {
      setJustConnected(false);
      const timer = setTimeout(() => {
        setVisible(false);
        setRemoteVisible(true);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [justConnected, visible, status]);

  const handleSearch = async () => {
    setIsSearching(true);
    try {
      // Toque do usuário: pode pedir a permissão de rede local de novo.
      if (!(await garantirPermissaoRede(true))) return;
      await saimoConnect.discoverTvs();
    } finally {
      setIsSearching(false);
    }
  };

  const handleConnect = (tv: DiscoveredTv) => {
    setJustConnected(true);
    saimoConnect.connect(tv.ip);
  };

  const handleManualConnect = () => {
    const ip = manualIp.trim();
    if (!ip) return;
    setJustConnected(true);
    saimoConnect.connect(ip, manualPin.trim() || undefined);
    setShowManual(false);
  };

  const handleDisconnect = () => {
    saimoConnect.disconnect(true);
  };

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={() => setVisible(false)}
    >
      <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
        <Pressable style={styles.container} onPress={() => {}}>
          <View style={styles.handle} />

          {/* Cabeçalho */}
          <View style={styles.header}>
            <View style={styles.headerTitles}>
              <View style={styles.titleRow}>
                <MaterialIcons name="cast-connected" size={24} color={Colors.primary} />
                <Text style={styles.title}>Saimo Connect</Text>
              </View>
              <Text style={styles.subtitle}>
                Conecte seu celular à sua TV Box para controle e áudio duplo
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setVisible(false)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} bounces={false} showsVerticalScrollIndicator={false}>
            {/* ESTADO CONECTADO */}
            {status === 'connected' && connectedTv ? (
              <View style={styles.connectedCard}>
                <View style={styles.connectedHeader}>
                  <View style={styles.tvIconBox}>
                    <MaterialIcons name="tv" size={28} color="#fff" />
                  </View>
                  <View style={styles.connectedInfo}>
                    <Text style={styles.connectedName}>{connectedTv.name}</Text>
                    <Text style={styles.connectedIp}>{connectedTv.ip}</Text>
                    <View style={styles.statusBadge}>
                      <View style={styles.statusDot} />
                      <Text style={styles.statusText}>Conectado</Text>
                    </View>
                  </View>
                </View>

                {/* Ações Rápidas de Conexão */}
                <View style={styles.connectedActions}>
                  <TouchableOpacity
                    style={styles.actionBtnPrimary}
                    onPress={() => {
                      setVisible(false);
                      setRemoteVisible(true);
                    }}
                  >
                    <MaterialIcons name="settings-remote" size={20} color="#fff" />
                    <Text style={styles.actionBtnPrimaryText}>Controle Remoto</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.actionBtnSecondary,
                      phoneAudioMode !== 'none' && {
                        borderColor: Colors.secondaryLight,
                        backgroundColor: 'rgba(139, 92, 246, 0.18)',
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
                      color={phoneAudioMode !== 'none' ? Colors.secondaryLight : Colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.actionBtnSecondaryText,
                        phoneAudioMode !== 'none' && { color: Colors.secondaryLight, fontWeight: '700' },
                      ]}
                    >
                      {tvState?.multi
                        ? 'Áudio Multi-Tela'
                        : phoneAudioMode !== 'none'
                        ? 'Ouvindo no Celular (Áudio)'
                        : 'Ouvir Som no Celular'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.disconnectBtn}
                    onPress={handleDisconnect}
                  >
                    <Ionicons name="power-outline" size={18} color={Colors.error} />
                    <Text style={styles.disconnectBtnText}>Desconectar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {/* STATUS AGUARDANDO CONFIRMAÇÃO NA TV */}
            {status === 'pending' && (
              <View style={styles.pendingContainer}>
                <View style={styles.pendingCard}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <View style={styles.pendingTextWrapper}>
                    <Text style={styles.pendingTitle}>Confirmação necessária na TV</Text>
                    <Text style={styles.pendingSubtitle}>
                      {pendingPin
                        ? `A TV gerou o PIN ${pendingPin}. Digite abaixo ou selecione "Permitir" na TV:`
                        : 'Selecione "Permitir" na TV com o controle, ou digite o PIN exibido na tela:'}
                    </Text>
                  </View>
                </View>

                {/* Campo rápido para digitar o PIN */}
                <View style={styles.pendingPinRow}>
                  <TextInput
                    style={styles.pendingPinInput}
                    placeholder={pendingPin || "Digite o PIN da TV"}
                    placeholderTextColor={Colors.textMuted}
                    value={pinInput}
                    onChangeText={setPinInput}
                    keyboardType="numeric"
                    maxLength={6}
                  />
                  <TouchableOpacity
                    style={styles.pendingPinBtn}
                    onPress={() => {
                      const pin = pinInput.trim() || pendingPin || '';
                      const ip = saimoConnect.getCurrentIp();
                      if (ip && pin) {
                        saimoConnect.connect(ip, pin);
                      }
                    }}
                  >
                    <Text style={styles.pendingPinBtnText}>Confirmar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* STATUS CONECTANDO */}
            {status === 'connecting' && (
              <View style={styles.pendingCard}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <View style={styles.pendingTextWrapper}>
                  <Text style={styles.pendingTitle}>Conectando à TV...</Text>
                  <Text style={styles.pendingSubtitle}>Estabelecendo conexão segura.</Text>
                </View>
              </View>
            )}

            {/* ANDROID 17: SEM PERMISSÃO DE REDE LOCAL NADA SAI DO CELULAR */}
            {semPermissaoRede && (
              <View style={styles.versionNoticeBox}>
                <MaterialIcons name="wifi-off" size={18} color="#F59E0B" />
                <View style={styles.versionNoticeTexts}>
                  <Text style={styles.versionNoticeTitle}>Permissão de rede local</Text>
                  <Text style={styles.versionNoticeDesc}>
                    Sem ela o celular não enxerga a TV, nem pelo IP. Toque em Permitir; se não aparecer a pergunta, abra as configurações do app e libere "Dispositivos por perto" / "Rede local".
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                    <TouchableOpacity onPress={handleSearch}>
                      <Text style={styles.versionHighlight}>Permitir</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { void Linking.openSettings(); }}>
                      <Text style={styles.versionHighlight}>Abrir configurações</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {/* LISTA DE TVS DESCOBERTAS */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Aparelhos na Rede</Text>
              <TouchableOpacity
                style={styles.refreshBtn}
                onPress={handleSearch}
                disabled={isSearching}
              >
                {isSearching ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Ionicons name="refresh" size={18} color={Colors.primaryLight} />
                )}
                <Text style={styles.refreshBtnText}>
                  {isSearching ? 'Buscando...' : 'Buscar'}
                </Text>
              </TouchableOpacity>
            </View>

            {discoveredTvs.length === 0 ? (
              <View style={styles.emptyCard}>
                <MaterialIcons name="tv-off" size={38} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>Nenhuma Saimo TV encontrada</Text>
                <Text style={styles.emptyDesc}>
                  Certifique-se de que a TV Box está ligada e conectada na mesma rede Wi-Fi deste celular.
                </Text>

                {/* LEMBRETE: TV BOX PRECISA ESTAR NA VERSÃO MÍNIMA 2.2.1 */}
                <View style={styles.versionNoticeBox}>
                  <Ionicons name="information-circle" size={18} color="#F59E0B" />
                  <View style={styles.versionNoticeTexts}>
                    <Text style={styles.versionNoticeTitle}>Requisito do Saimo Connect</Text>
                    <Text style={styles.versionNoticeDesc}>
                      A sua TV Box precisa estar atualizada no mínimo na versão <Text style={styles.versionHighlight}>2.2.1</Text> para aceitar a conexão do celular.
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              discoveredTvs.map((tv) => {
                const isThisConnected = status === 'connected' && connectedTv?.ip === tv.ip;
                return (
                  <TouchableOpacity
                    key={tv.id}
                    style={[
                      styles.tvRow,
                      isThisConnected && styles.tvRowConnected,
                    ]}
                    onPress={() => !isThisConnected && handleConnect(tv)}
                    disabled={isThisConnected}
                  >
                    <View style={styles.tvRowLeft}>
                      <View style={[styles.tvRowIcon, isThisConnected && styles.tvRowIconActive]}>
                        <MaterialIcons
                          name="tv"
                          size={24}
                          color={isThisConnected ? Colors.primary : Colors.textSecondary}
                        />
                      </View>
                      <View style={styles.tvRowTexts}>
                        <Text style={styles.tvRowName}>{tv.name}</Text>
                        <Text style={styles.tvRowIp}>IP: {tv.ip}</Text>
                      </View>
                    </View>

                    {isThisConnected ? (
                      <View style={styles.badgeConnected}>
                        <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                        <Text style={styles.badgeConnectedText}>Conectado</Text>
                      </View>
                    ) : (
                      <View style={styles.connectBtnSmall}>
                        <Text style={styles.connectBtnSmallText}>Conectar</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            )}

            {/* CONEXÃO MANUAL POR IP / PIN */}
            <TouchableOpacity
              style={styles.manualToggle}
              onPress={() => setShowManual(!showManual)}
            >
              <Ionicons
                name={showManual ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={Colors.textSecondary}
              />
              <Text style={styles.manualToggleText}>
                {showManual ? 'Ocultar conexão manual' : 'Digitar IP manualmente ou código PIN'}
              </Text>
            </TouchableOpacity>

            {showManual && (
              <View style={styles.manualForm}>
                <Text style={styles.manualLabel}>Endereço IP da TV:</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: 192.168.1.150"
                  placeholderTextColor={Colors.textMuted}
                  value={manualIp}
                  onChangeText={setManualIp}
                  keyboardType="numeric"
                  autoCapitalize="none"
                />

                <Text style={styles.manualLabel}>Código PIN (se exibido na TV):</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: 4821 (opcional)"
                  placeholderTextColor={Colors.textMuted}
                  value={manualPin}
                  onChangeText={setManualPin}
                  keyboardType="numeric"
                  maxLength={6}
                />

                <TouchableOpacity
                  style={[styles.manualSubmitBtn, !manualIp.trim() && styles.manualSubmitBtnDisabled]}
                  onPress={handleManualConnect}
                  disabled={!manualIp.trim()}
                >
                  <Text style={styles.manualSubmitBtnText}>Conectar por IP</Text>
                </TouchableOpacity>
              </View>
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
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxxl,
    maxHeight: '85%',
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
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
  },
  connectedCard: {
    backgroundColor: Colors.surfaceVariant,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  connectedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  tvIconBox: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectedInfo: {
    flex: 1,
  },
  connectedName: {
    color: Colors.text,
    fontSize: Typography.bodyLarge.fontSize,
    fontWeight: '700',
  },
  connectedIp: {
    color: Colors.textSecondary,
    fontSize: Typography.caption.fontSize,
    marginTop: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
  },
  statusText: {
    color: Colors.success,
    fontSize: 11,
    fontWeight: '600',
  },
  connectedActions: {
    gap: Spacing.xs,
  },
  actionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  actionBtnPrimaryText: {
    color: '#fff',
    fontSize: Typography.body.fontSize,
    fontWeight: '600',
  },
  actionBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderWidth: 1,
    borderColor: Colors.secondary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  actionBtnSecondaryText: {
    color: Colors.secondaryLight,
    fontSize: Typography.body.fontSize,
    fontWeight: '600',
  },
  disconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  disconnectBtnText: {
    color: Colors.error,
    fontSize: Typography.caption.fontSize,
    fontWeight: '500',
  },
  pendingContainer: {
    marginBottom: Spacing.lg,
  },
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  pendingPinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  pendingPinInput: {
    flex: 1,
    backgroundColor: Colors.surfaceVariant,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.4)',
    color: Colors.text,
    fontSize: Typography.body.fontSize,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    letterSpacing: 2,
    fontWeight: '700',
  },
  pendingPinBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
  },
  pendingPinBtnText: {
    color: '#fff',
    fontSize: Typography.body.fontSize,
    fontWeight: '700',
  },
  pendingTextWrapper: {
    flex: 1,
  },
  pendingTitle: {
    color: Colors.text,
    fontSize: Typography.body.fontSize,
    fontWeight: '600',
  },
  pendingSubtitle: {
    color: Colors.textSecondary,
    fontSize: Typography.caption.fontSize,
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: Typography.bodyLarge.fontSize,
    fontWeight: '600',
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  refreshBtnText: {
    color: Colors.primaryLight,
    fontSize: Typography.caption.fontSize,
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: Colors.surfaceVariant,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: Typography.body.fontSize,
    fontWeight: '600',
    marginTop: Spacing.sm,
  },
  emptyDesc: {
    color: Colors.textSecondary,
    fontSize: Typography.caption.fontSize,
    textAlign: 'center',
    marginTop: Spacing.xs,
    lineHeight: 18,
  },
  versionNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    width: '100%',
  },
  versionNoticeTexts: {
    flex: 1,
  },
  versionNoticeTitle: {
    color: '#F59E0B',
    fontSize: Typography.caption.fontSize,
    fontWeight: '700',
    marginBottom: 2,
  },
  versionNoticeDesc: {
    color: Colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  versionHighlight: {
    color: '#fff',
    fontWeight: '800',
  },
  tvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceVariant,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tvRowConnected: {
    borderColor: Colors.primary,
  },
  tvRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  tvRowIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tvRowIconActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
  },
  tvRowTexts: {
    flex: 1,
  },
  tvRowName: {
    color: Colors.text,
    fontSize: Typography.body.fontSize,
    fontWeight: '600',
  },
  tvRowIp: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  badgeConnected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeConnectedText: {
    color: Colors.success,
    fontSize: Typography.caption.fontSize,
    fontWeight: '600',
  },
  connectBtnSmall: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  connectBtnSmallText: {
    color: '#fff',
    fontSize: Typography.caption.fontSize,
    fontWeight: '600',
  },
  manualToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  manualToggleText: {
    color: Colors.textSecondary,
    fontSize: Typography.caption.fontSize,
  },
  manualForm: {
    backgroundColor: Colors.surfaceVariant,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  manualLabel: {
    color: Colors.text,
    fontSize: Typography.caption.fontSize,
    fontWeight: '600',
    marginBottom: 4,
  },
  input: {
    backgroundColor: Colors.surface,
    color: Colors.text,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    fontSize: Typography.body.fontSize,
  },
  manualSubmitBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
  },
  manualSubmitBtnDisabled: {
    opacity: 0.5,
  },
  manualSubmitBtnText: {
    color: '#fff',
    fontSize: Typography.body.fontSize,
    fontWeight: '600',
  },
});
