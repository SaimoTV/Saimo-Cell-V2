import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, ActivityIndicator,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Spacing, BorderRadius, Typography } from '../constants/Colors';
import {
  aoMudar, adicionarLista, adicionarListaDeArquivo, lerArquivoEscolhido, alternarLista, atualizarLista, carregarMinhasListas, getListas,
  removerLista, textoAtualizada, ErroLista, MAX_LISTAS, type MinhaLista,
} from '../services/minhasListas';

/** Seção de Ajustes "Minhas listas": o usuário cola o link de uma lista .m3u. */
export default function MinhasListas() {
  const [listas, setListas] = useState<MinhaLista[]>(getListas());
  const [ocupadas, setOcupadas] = useState<Record<string, boolean>>({});
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(false);
  const [link, setLink] = useState('');
  const [nome, setNome] = useState('');
  const [baixando, setBaixando] = useState(false);
  const [erroAdd, setErroAdd] = useState('');

  useEffect(() => {
    void carregarMinhasListas().then(() => setListas([...getListas()]));
    return aoMudar(() => setListas([...getListas()]));
  }, []);

  const adicionar = useCallback(async () => {
    setErroAdd('');
    setBaixando(true);
    try {
      await adicionarLista(link, nome);
      setAberto(false);
      setLink('');
      setNome('');
    } catch (e) {
      setErroAdd(e instanceof ErroLista ? e.message : 'Não consegui baixar essa lista');
    } finally {
      setBaixando(false);
    }
  }, [link, nome]);

  const escolherArquivo = useCallback(async (): Promise<string | null> => {
    const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
    if (r.canceled || !r.assets?.[0]) return null;
    return lerArquivoEscolhido(r.assets[0].uri);
  }, []);

  const adicionarArquivo = useCallback(async () => {
    setErroAdd('');
    setBaixando(true);
    try {
      const texto = await escolherArquivo();
      if (texto === null) return;
      await adicionarListaDeArquivo(texto, nome);
      setAberto(false);
      setLink('');
      setNome('');
    } catch (e) {
      setErroAdd(e instanceof ErroLista ? e.message : 'Não consegui ler esse arquivo');
    } finally {
      setBaixando(false);
    }
  }, [escolherArquivo, nome]);

  const atualizar = useCallback(async (id: string, semLink = false) => {
    setErro('');
    setOcupadas(o => ({ ...o, [id]: true }));
    try {
      if (semLink) {
        const texto = await escolherArquivo();
        if (texto !== null) await atualizarLista(id, texto);
      } else {
        await atualizarLista(id);
      }
    } catch (e) {
      setErro(e instanceof ErroLista ? e.message : 'Não consegui baixar essa lista');
    } finally {
      setOcupadas(o => ({ ...o, [id]: false }));
    }
  }, [escolherArquivo]);

  const remover = useCallback((l: MinhaLista) => {
    Alert.alert('Remover lista', `Remover "${l.nome}" e os canais dela deste aparelho?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => { void removerLista(l.id); } },
    ]);
  }, []);

  return (
    <>
      <Text style={styles.sectionTitle}>Minhas listas</Text>
      <View style={styles.section}>
        <Text style={styles.ajuda}>Cole o link de uma lista .m3u. Ela fica só neste aparelho.</Text>
        {erro ? <Text style={styles.erro}>{erro}</Text> : null}
        {listas.map(l => (
          <View key={l.id} style={styles.item} testID={`minha-lista-${l.id}`}>
            <View style={styles.itemTopo}>
              <Ionicons name="list-outline" size={22} color={l.ativa ? Colors.primary : Colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.nome} numberOfLines={1}>{l.nome}</Text>
                <Text style={styles.info}>
                  {l.total} canais · {textoAtualizada(l.atualizadaEm)}{l.ativa ? '' : ' · desativada'}
                </Text>
              </View>
              {ocupadas[l.id] ? <ActivityIndicator size="small" color={Colors.primary} /> : null}
            </View>
            <View style={styles.acoes}>
              <TouchableOpacity style={styles.acao} onPress={() => atualizar(l.id, !l.link)} disabled={!!ocupadas[l.id]} testID="minha-lista-atualizar">
                <Ionicons name="refresh-outline" size={16} color={Colors.text} />
                <Text style={styles.acaoTexto}>Atualizar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.acao} onPress={() => { void alternarLista(l.id); }} testID="minha-lista-alternar">
                <Ionicons name={l.ativa ? 'eye-off-outline' : 'eye-outline'} size={16} color={Colors.text} />
                <Text style={styles.acaoTexto}>{l.ativa ? 'Desativar' : 'Ativar'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.acao} onPress={() => remover(l)} testID="minha-lista-remover">
                <Ionicons name="trash-outline" size={16} color={Colors.errorLight} />
                <Text style={[styles.acaoTexto, { color: Colors.errorLight }]}>Remover</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
        <TouchableOpacity
          style={[styles.adicionar, listas.length >= MAX_LISTAS && { opacity: 0.5 }]}
          onPress={() => { setErroAdd(''); setAberto(true); }}
          disabled={listas.length >= MAX_LISTAS}
          testID="minhas-listas-adicionar"
        >
          <Ionicons name="add-circle-outline" size={22} color={Colors.primary} />
          <Text style={styles.adicionarTexto}>Adicionar lista</Text>
        </TouchableOpacity>
      </View>

      <Modal transparent visible={aberto} animationType="fade" onRequestClose={() => !baixando && setAberto(false)}>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.card}>
            <Text style={styles.titulo}>Adicionar lista</Text>
            <Text style={styles.rotulo}>Link da lista (.m3u)</Text>
            <TextInput
              style={[styles.input, !!erroAdd && { borderColor: Colors.error }]}
              value={link}
              onChangeText={(t) => { setLink(t); setErroAdd(''); }}
              placeholder="http://... ou https://..."
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              editable={!baixando}
              testID="minhas-listas-link"
            />
            <Text style={[styles.rotulo, { marginTop: Spacing.md }]}>Nome (opcional)</Text>
            <TextInput
              style={styles.input}
              value={nome}
              onChangeText={setNome}
              placeholder="Lista 1"
              placeholderTextColor={Colors.textMuted}
              editable={!baixando}
              testID="minhas-listas-nome"
            />
            {erroAdd ? <Text style={styles.erro}>{erroAdd}</Text> : null}
            <TouchableOpacity style={[styles.botao, styles.primario, baixando && { opacity: 0.6 }]} onPress={adicionar} disabled={baixando} testID="minhas-listas-salvar">
              {baixando ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primarioTexto}>Adicionar</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.botao, styles.secundario]} onPress={adicionarArquivo} disabled={baixando} testID="minhas-listas-arquivo">
              <Text style={styles.secundarioTexto}>Escolher arquivo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.botao, styles.secundario]} onPress={() => setAberto(false)} disabled={baixando}>
              <Text style={styles.secundarioTexto}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    color: Colors.textSecondary, fontSize: Typography.caption.fontSize, fontWeight: '600',
    textTransform: 'uppercase', marginTop: Spacing.lg, marginBottom: Spacing.sm,
  },
  section: { backgroundColor: Colors.cardBg, borderRadius: BorderRadius.lg, overflow: 'hidden' },
  ajuda: { color: Colors.textSecondary, fontSize: 13, padding: Spacing.md, paddingBottom: Spacing.sm },
  erro: { color: Colors.errorLight, fontSize: 13, paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  item: { padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  itemTopo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  nome: { color: Colors.text, fontSize: Typography.body.fontSize },
  info: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  acoes: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm, flexWrap: 'wrap' },
  acao: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, height: 34,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.borderLight,
  },
  acaoTexto: { color: Colors.text, fontSize: 13, fontWeight: '600' },
  adicionar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  adicionarTexto: { color: Colors.primary, fontSize: Typography.body.fontSize, fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: {
    width: '100%', maxWidth: 460, backgroundColor: '#1C1C1E', borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: Colors.border,
  },
  titulo: { color: Colors.text, fontSize: 20, fontWeight: '700', marginBottom: Spacing.md },
  rotulo: { color: Colors.text, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: {
    height: 46, borderRadius: BorderRadius.md, backgroundColor: Colors.surface, color: Colors.text,
    paddingHorizontal: Spacing.md, borderWidth: 1, borderColor: Colors.border, fontSize: Typography.body.fontSize,
  },
  botao: { minHeight: 46, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.sm },
  primario: { backgroundColor: Colors.primary, marginTop: Spacing.md },
  primarioTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secundario: { borderWidth: 1, borderColor: Colors.borderLight },
  secundarioTexto: { color: Colors.text, fontSize: 16, fontWeight: '600' },
});
