import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { BorderRadius, Colors, Spacing, Typography } from '../constants/Colors';
import {
  aoMudarAddons,
  carregarAddons,
  getAddons,
  instalarAddon,
  moverAddon,
  removerAddon,
  toggleAddon,
} from '../services/addons';
import {
  aoMudarDebrid,
  carregarDebridConfig,
  getDebridConfig,
  NOMES_PROVEDORES_DEBRID,
  ORDEM_PROVEDORES_DEBRID,
  salvarProvedorDebrid,
  setSincronizarDebridConnect,
} from '../services/debrid';
import { saimoConnect } from '../services/saimoConnect';
import type { DebridConfig, DebridProviderId, InstalledAddon } from '../types';

interface Props {
  visible: boolean;
  onClose: () => void;
}

function recursosTexto(addon: InstalledAddon): string {
  return addon.manifest.resources
    .map((r) => (typeof r === 'string' ? r : r.name))
    .join(' · ');
}

export default function AddonsModal({ visible, onClose }: Props) {
  const [urlInput, setUrlInput] = useState('');
  const [instalando, setInstalando] = useState(false);
  const [erroAddon, setErroAddon] = useState('');
  const [addons, setAddons] = useState<InstalledAddon[]>([]);

  const [debrid, setDebrid] = useState<DebridConfig>(getDebridConfig());
  const [chavesEdit, setChavesEdit] = useState<Record<DebridProviderId, string>>({
    torbox: '',
    realdebrid: '',
    alldebrid: '',
    premiumize: '',
  });
  const [mostrarChave, setMostrarChave] = useState<Record<DebridProviderId, boolean>>({
    torbox: false,
    realdebrid: false,
    alldebrid: false,
    premiumize: false,
  });
  const [enviandoTv, setEnviandoTv] = useState(false);

  const sincronizarEstadoLocal = useCallback(() => {
    setAddons([...getAddons()]);
    const cfg = getDebridConfig();
    setDebrid(cfg);
    setChavesEdit({
      torbox: cfg.providers.torbox.apiKey,
      realdebrid: cfg.providers.realdebrid.apiKey,
      alldebrid: cfg.providers.alldebrid.apiKey,
      premiumize: cfg.providers.premiumize.apiKey,
    });
  }, []);

  useEffect(() => {
    if (!visible) return;
    setErroAddon('');
    Promise.all([carregarAddons(), carregarDebridConfig()]).then(sincronizarEstadoLocal);
    const unsubA = aoMudarAddons(() => setAddons([...getAddons()]));
    const unsubD = aoMudarDebrid(() => {
      const cfg = getDebridConfig();
      setDebrid(cfg);
    });
    return () => {
      unsubA();
      unsubD();
    };
  }, [visible, sincronizarEstadoLocal]);

  const handleInstalar = useCallback(async () => {
    const bruto = urlInput.trim();
    if (!bruto || instalando) return;
    setErroAddon('');
    setInstalando(true);
    try {
      const instalado = await instalarAddon(bruto);
      setUrlInput('');
      Alert.alert('Addon adicionado', `${instalado.name} (v${instalado.version}) pronto para uso.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Não foi possível validar o addon.';
      setErroAddon(msg);
      Alert.alert('Erro ao adicionar addon', msg);
    } finally {
      setInstalando(false);
    }
  }, [urlInput, instalando]);

  const handleRemover = useCallback((addon: InstalledAddon) => {
    Alert.alert(
      'Remover addon',
      `Deseja remover "${addon.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: () => { void removerAddon(addon.transportUrl); },
        },
      ],
    );
  }, []);

  const handleSalvarDebrid = useCallback(async (id: DebridProviderId, novoEnabled?: boolean) => {
    const chave = chavesEdit[id] ?? '';
    if (novoEnabled === true && !chave.trim()) {
      Alert.alert(NOMES_PROVEDORES_DEBRID[id], 'Informe a chave de API antes de ativar o provedor.');
      return;
    }
    const atualizado = await salvarProvedorDebrid(id, chave, novoEnabled);
    setDebrid(atualizado);
  }, [chavesEdit]);

  const handleEnviarTv = useCallback(async () => {
    if (enviandoTv) return;
    setEnviandoTv(true);
    try {
      const res = await saimoConnect.enviarAddonsParaTv();
      Alert.alert(res.ok ? 'Enviado para a TV' : 'Saimo Connect', res.mensagem);
    } finally {
      setEnviandoTv(false);
    }
  }, [enviandoTv]);

  return (
    <Modal
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Addons e Debrid</Text>
              <Text style={styles.subtitle}>
                Protocolo Stremio HTTP (/manifest.json) e chaves Debrid locais
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Fechar">
              <Ionicons name="close" size={22} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
            {/* Instalar Addon */}
            <Text style={styles.sectionLabel}>Adicionar Addon Stremio</Text>
            <View style={styles.addRow}>
              <TextInput
                style={styles.urlInput}
                value={urlInput}
                onChangeText={(t) => {
                  setUrlInput(t);
                  if (erroAddon) setErroAddon('');
                }}
                placeholder="https://.../manifest.json ou stremio://..."
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                editable={!instalando}
                testID="addon-url-input"
              />
              <TouchableOpacity
                style={[styles.addBtn, (!urlInput.trim() || instalando) && styles.btnDisabled]}
                onPress={() => void handleInstalar()}
                disabled={!urlInput.trim() || instalando}
                testID="addon-instalar-btn"
              >
                {instalando ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.addBtnText}>Adicionar</Text>
                )}
              </TouchableOpacity>
            </View>
            {!!erroAddon && <Text style={styles.errorText}>{erroAddon}</Text>}

            {/* Lista de Addons */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>Addons instalados ({addons.length})</Text>
              <TouchableOpacity
                style={[styles.tvBtn, enviandoTv && styles.btnDisabled]}
                onPress={() => void handleEnviarTv()}
                disabled={enviandoTv}
                testID="addons-enviar-tv"
              >
                {enviandoTv ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <>
                    <Ionicons name="tv-outline" size={14} color={Colors.primary} />
                    <Text style={styles.tvBtnText}>Enviar Addons para a TV</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {addons.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>
                  Nenhum addon adicionado. O Saimo começa vazio — cole acima o endereço de um addon HTTP compatível com o protocolo Stremio.
                </Text>
              </View>
            ) : (
              addons.map((addon, idx) => (
                <View key={addon.transportUrl} style={styles.addonCard}>
                  <View style={styles.addonTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.addonName} numberOfLines={1}>
                        {addon.name} {addon.version && addon.version !== '0.0.0' ? `v${addon.version}` : ''}
                      </Text>
                      <Text style={styles.addonMeta} numberOfLines={1}>
                        {addon.hydrated === false
                          ? 'Aguardando manifesto...'
                          : `${recursosTexto(addon) || 'addon'} · ${addon.manifest.types.join(', ')}`}
                      </Text>
                      <Text style={styles.addonUrl} numberOfLines={1}>{addon.transportUrl}</Text>
                    </View>
                    <Switch
                      value={addon.enabled}
                      onValueChange={(v) => void toggleAddon(addon.transportUrl, v)}
                      trackColor={{ false: Colors.border, true: Colors.primary }}
                      thumbColor="#fff"
                    />
                  </View>

                  <View style={styles.addonActions}>
                    <TouchableOpacity
                      style={[styles.iconAction, idx === 0 && styles.btnDisabled]}
                      disabled={idx === 0}
                      onPress={() => void moverAddon(addon.transportUrl, 'up')}
                      accessibilityLabel="Mover para cima"
                    >
                      <Ionicons name="chevron-up" size={16} color={Colors.text} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.iconAction, idx === addons.length - 1 && styles.btnDisabled]}
                      disabled={idx === addons.length - 1}
                      onPress={() => void moverAddon(addon.transportUrl, 'down')}
                      accessibilityLabel="Mover para baixo"
                    >
                      <Ionicons name="chevron-down" size={16} color={Colors.text} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => handleRemover(addon)}
                      accessibilityLabel={`Remover ${addon.name}`}
                    >
                      <Ionicons name="trash-outline" size={15} color="#EF4444" />
                      <Text style={styles.removeBtnText}>Remover</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}

            {/* Provedores Debrid */}
            <Text style={[styles.sectionLabel, { marginTop: Spacing.lg }]}>
              Serviços Debrid (Torrents em Cache via HTTPS)
            </Text>
            <Text style={styles.debridHint}>
              O Saimo não faz download P2P/torrent direto. Informe sua chave de API para resolver links magnet/infoHash diretamente no provedor escolhido.
            </Text>

            {ORDEM_PROVEDORES_DEBRID.map((provId) => {
              const cfg = debrid.providers[provId];
              const chave = chavesEdit[provId] ?? '';
              const visivel = mostrarChave[provId];
              const alterado = chave.trim() !== cfg.apiKey;
              return (
                <View key={provId} style={styles.debridCard}>
                  <View style={styles.debridHeader}>
                    <Text style={styles.debridTitle}>{NOMES_PROVEDORES_DEBRID[provId]}</Text>
                    <Switch
                      value={cfg.enabled}
                      onValueChange={(v) => void handleSalvarDebrid(provId, v)}
                      trackColor={{ false: Colors.border, true: Colors.primary }}
                      thumbColor="#fff"
                    />
                  </View>
                  <View style={styles.debridInputRow}>
                    <TextInput
                      style={styles.debridInput}
                      value={chave}
                      onChangeText={(txt) => setChavesEdit((prev) => ({ ...prev, [provId]: txt }))}
                      placeholder={`Chave API do ${NOMES_PROVEDORES_DEBRID[provId]}`}
                      placeholderTextColor={Colors.textMuted}
                      secureTextEntry={!visivel}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      style={styles.eyeBtn}
                      onPress={() => setMostrarChave((prev) => ({ ...prev, [provId]: !prev[provId] }))}
                    >
                      <Ionicons
                        name={visivel ? 'eye-off-outline' : 'eye-outline'}
                        size={18}
                        color={Colors.textSecondary}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.saveKeyBtn, (!alterado && !!cfg.apiKey) && styles.saveKeyBtnSaved]}
                      onPress={() => void handleSalvarDebrid(provId, chave.trim().length > 0 ? true : false)}
                    >
                      <Text style={styles.saveKeyText}>{alterado ? 'Salvar' : (cfg.apiKey ? 'Salvo' : 'Salvar')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            {/* Opt-in Sincronização Connect */}
            <View style={styles.optInRow}>
              <View style={{ flex: 1, marginRight: Spacing.md }}>
                <Text style={styles.optInTitle}>Sincronizar chaves Debrid no Saimo Connect</Text>
                <Text style={styles.optInDesc}>
                  Desligado por padrão: suas chaves ficam apenas neste aparelho. Ative se quiser enviar as chaves junto dos addons para a sua TV.
                </Text>
              </View>
              <Switch
                value={debrid.sincronizarConnect}
                onValueChange={(v) => {
                  void setSincronizarDebridConnect(v).then(setDebrid);
                }}
                trackColor={{ false: Colors.border, true: Colors.primary }}
                thumbColor="#fff"
              />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: Spacing.md,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  title: { color: Colors.text, fontSize: Typography.h3.fontSize, fontWeight: '700' },
  subtitle: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  closeBtn: { padding: 4 },
  scroll: { flexGrow: 0 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  sectionLabel: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  addRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  urlInput: {
    flex: 1,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: 13,
  },
  addBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minWidth: 88,
    alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  btnDisabled: { opacity: 0.45 },
  errorText: { color: '#F87171', fontSize: 12, marginTop: 6 },
  tvBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(139, 92, 246, 0.14)',
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tvBtnText: { color: Colors.primary, fontSize: 12, fontWeight: '700' },
  emptyBox: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyText: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },
  addonCard: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addonTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  addonName: { color: Colors.text, fontSize: 14, fontWeight: '700' },
  addonMeta: { color: Colors.primary, fontSize: 11, marginTop: 2 },
  addonUrl: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  addonActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: Spacing.sm,
    paddingTop: Spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  iconAction: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  removeBtnText: { color: '#EF4444', fontSize: 12, fontWeight: '600' },
  debridHint: { color: Colors.textSecondary, fontSize: 12, lineHeight: 17, marginBottom: Spacing.sm },
  debridCard: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  debridHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  debridTitle: { color: Colors.text, fontSize: 14, fontWeight: '700' },
  debridInputRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  debridInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: Colors.text,
    fontSize: 12,
  },
  eyeBtn: { padding: 8 },
  saveKeyBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  saveKeyBtnSaved: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  saveKeyText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  optInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optInTitle: { color: Colors.text, fontSize: 13, fontWeight: '700' },
  optInDesc: { color: Colors.textSecondary, fontSize: 11, marginTop: 3, lineHeight: 15 },
});
