import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';

import { Colors, Spacing, BorderRadius, Typography } from '../constants/Colors';
import { useLinksStore } from '../stores/linksStore';
import { normalizarLink, LINK_CANAIS_PADRAO, LINK_FILMES_PADRAO } from '../utils/links';
import { aplicarLinks, testarLink, type TipoDeLista } from '../services/listas';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Fase = 'editando' | 'testando' | 'falhou';

const TEXTO =
  'Endereço da lista de canais e da lista de filmes e séries. Deixe um campo em branco para desligar essa lista (o endereço e os dados dela são apagados).';

export default function ListasModal({ visible, onClose }: Props) {
  const linkCanais = useLinksStore(s => s.linkCanais);
  const linkFilmes = useLinksStore(s => s.linkFilmes);
  const [canais, setCanais] = useState('');
  const [filmes, setFilmes] = useState('');
  const [fase, setFase] = useState<Fase>('editando');
  const [erros, setErros] = useState<Partial<Record<TipoDeLista, string>>>({});
  const [falhas, setFalhas] = useState<TipoDeLista[]>([]);
  const [pendente, setPendente] = useState<{ canais: string; filmes: string } | null>(null);

  // Ao abrir, os campos mostram o que está salvo.
  useEffect(() => {
    if (!visible) return;
    setCanais(linkCanais);
    setFilmes(linkFilmes);
    setFase('editando');
    setErros({});
    setFalhas([]);
    setPendente(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const editar = (tipo: TipoDeLista, valor: string) => {
    if (tipo === 'canais') setCanais(valor); else setFilmes(valor);
    setErros(e => ({ ...e, [tipo]: undefined }));
    if (fase === 'falhou') { setFase('editando'); setFalhas([]); }
  };

  const gravar = useCallback(async (c: string, f: string) => {
    await aplicarLinks(c, f);
    onClose();
  }, [onClose]);

  const salvar = useCallback(async () => {
    const c = normalizarLink(canais);
    const f = normalizarLink(filmes);
    const novosErros: Partial<Record<TipoDeLista, string>> = {};
    if (c === null) novosErros.canais = 'Endereço inválido. Confira o link.';
    if (f === null) novosErros.filmes = 'Endereço inválido. Confira o link.';
    if (c === null || f === null) { setErros(novosErros); setFase('editando'); return; }
    setCanais(c); setFilmes(f);
    setErros({});

    // Só o que mudou e foi preenchido precisa responder; apagar não testa nada.
    const aTestar: [TipoDeLista, string][] = [];
    if (c && c !== linkCanais) aTestar.push(['canais', c]);
    if (f && f !== linkFilmes) aTestar.push(['filmes', f]);
    if (!aTestar.length) { await gravar(c, f); return; }

    setFase('testando');
    const respostas = await Promise.all(aTestar.map(([t, base]) => testarLink(t, base)));
    const ruins = aTestar.filter((_, i) => !respostas[i]).map(([t]) => t);
    if (!ruins.length) { await gravar(c, f); return; }
    setPendente({ canais: c, filmes: f });
    setFalhas(ruins);
    setFase('falhou');
  }, [canais, filmes, linkCanais, linkFilmes, gravar]);

  const salvarMesmoAssim = useCallback(async () => {
    if (pendente) await gravar(pendente.canais, pendente.filmes);
  }, [pendente, gravar]);

  const restaurar = useCallback(async () => {
    await gravar(LINK_CANAIS_PADRAO, LINK_FILMES_PADRAO);
  }, [gravar]);

  const testando = fase === 'testando';
  const campo = (tipo: TipoDeLista, rotulo: string, valor: string, exemplo: string) => (
    <View style={styles.campo}>
      <Text style={styles.rotulo}>{rotulo}</Text>
      <TextInput
        style={[styles.input, (erros[tipo] || falhas.includes(tipo)) && styles.inputErro]}
        value={valor}
        onChangeText={(t) => editar(tipo, t)}
        placeholder={exemplo}
        placeholderTextColor={Colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        editable={!testando}
        accessibilityLabel={rotulo}
        testID={`link-${tipo}`}
      />
      {erros[tipo] ? <Text style={styles.erro}>{erros[tipo]}</Text> : null}
      {falhas.includes(tipo) ? (
        <Text style={styles.erro}>Não consegui abrir este endereço. Confira o link.</Text>
      ) : null}
    </View>
  );

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.titulo}>Endereço das listas</Text>
            <Text style={styles.texto}>{TEXTO}</Text>

            {campo('canais', 'Canais', canais, 'Cole o endereço aqui')}
            {campo('filmes', 'Filmes e séries', filmes, 'Cole o endereço aqui')}

            {fase === 'falhou' ? (
              <View style={styles.acoes}>
                <TouchableOpacity style={[styles.botao, styles.primario]} onPress={salvar} testID="listas-tentar">
                  <Text style={styles.primarioTexto}>Tentar de novo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.botao, styles.secundario]} onPress={salvarMesmoAssim} testID="listas-salvar-assim">
                  <Text style={styles.secundarioTexto}>Salvar mesmo assim</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.acoes}>
                <TouchableOpacity
                  style={[styles.botao, styles.primario, testando && { opacity: 0.6 }]}
                  onPress={salvar}
                  disabled={testando}
                  testID="listas-salvar"
                >
                  {testando
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.primarioTexto}>Salvar</Text>}
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity
              style={[styles.botao, styles.secundario, { marginTop: Spacing.sm }]}
              onPress={restaurar}
              disabled={testando}
              testID="listas-restaurar"
            >
              <Text style={styles.secundarioTexto}>Restaurar padrão</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.botao, styles.secundario, { marginTop: Spacing.sm }]}
              onPress={onClose}
              disabled={testando}
              testID="listas-agora-nao"
            >
              <Text style={styles.secundarioTexto}>Cancelar</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  card: {
    width: '100%', maxWidth: 460, maxHeight: '92%', backgroundColor: '#1C1C1E', borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: Colors.border,
  },
  titulo: { color: Colors.text, fontSize: 20, fontWeight: '700', marginBottom: Spacing.sm },
  texto: { color: Colors.textSecondary, fontSize: Typography.body.fontSize, lineHeight: 21, marginBottom: Spacing.md },
  campo: { marginBottom: Spacing.md },
  rotulo: { color: Colors.text, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: {
    height: 46, borderRadius: BorderRadius.md, backgroundColor: Colors.surface, color: Colors.text,
    paddingHorizontal: Spacing.md, borderWidth: 1, borderColor: Colors.border, fontSize: Typography.body.fontSize,
  },
  inputErro: { borderColor: Colors.error },
  erro: { color: Colors.errorLight, fontSize: 13, marginTop: 6 },
  acoes: { gap: Spacing.sm, marginTop: Spacing.sm },
  botao: { minHeight: 46, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.md },
  primario: { backgroundColor: Colors.primary },
  primarioTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secundario: { borderWidth: 1, borderColor: Colors.borderLight },
  secundarioTexto: { color: Colors.text, fontSize: 16, fontWeight: '600' },
});
