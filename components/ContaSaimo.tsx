import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius } from '../constants/Colors';
import {
  aoMudarConta, apagarConta, aprovarTv, cadastrar, codigoDoQr, entrarComSenha, estadoConta, sair, sincronizar, trocarSenha,
} from '../services/conta';

function haQuanto(ms: number): string {
  if (!ms) return 'ainda não sincronizou';
  const min = Math.floor((Date.now() - ms) / 60000);
  if (min < 1) return 'sincronizado agora';
  if (min < 60) return `sincronizado há ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `sincronizado há ${h} h` : `sincronizado há ${Math.floor(h / 24)} d`;
}

/**
 * Entrar ou criar a conta com e-mail e senha (o e-mail não é verificado: é só
 * o login).
 */
function Entrar() {
  const [criando, setCriando] = useState(false);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState('');
  const pronto = email.includes('@') && (criando ? senha.length >= 8 : senha.length > 0);
  const enviar = async () => {
    setOcupado(true);
    setAviso('');
    try { if (criando) await cadastrar(email, senha); else await entrarComSenha(email, senha); }
    catch (e) { setAviso(e instanceof Error ? e.message : 'Não deu certo'); setSenha(''); }
    finally { setOcupado(false); }
  };
  return (
    <View testID="conta-sem-login">
      <Text style={styles.texto}>
        Opcional: entre para guardar perfis, onde parou, favoritos, listas e addons na sua conta e ter tudo em qualquer
        aparelho, até fora de casa. Sem conta, tudo continua só neste aparelho.
      </Text>
      <TextInput style={styles.campo} placeholder="Seu e-mail" placeholderTextColor={Colors.textMuted} autoCapitalize="none"
        keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} testID="conta-email" />
      <TextInput style={styles.campo} placeholder={criando ? 'Crie uma senha (8 ou mais)' : 'Senha'} placeholderTextColor={Colors.textMuted}
        secureTextEntry autoCapitalize="none" autoComplete={criando ? 'password-new' : 'password'} value={senha} onChangeText={setSenha} testID="conta-senha" />
      <TouchableOpacity style={styles.botao} disabled={ocupado || !pronto} onPress={() => void enviar()} testID={criando ? 'conta-criar' : 'conta-entrar-senha'}>
        {ocupado ? <ActivityIndicator color="#fff" /> : <Text style={styles.botaoTexto}>{criando ? 'Criar conta' : 'Entrar'}</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => { setCriando(!criando); setAviso(''); setSenha(''); }} testID="conta-alternar">
        <Text style={styles.link}>{criando ? 'Já tenho conta: entrar' : 'Não tenho conta: criar'}</Text>
      </TouchableOpacity>
      {!criando && <Text style={styles.texto}>Esqueceu a senha? Num aparelho onde a conta já está aberta, use Trocar a senha.</Text>}
      {!!aviso && <Text style={styles.erro}>{aviso}</Text>}
    </View>
  );
}

/** Trocar a senha de quem está logado. */
function TrocarSenha({ aoTerminar }: { aoTerminar: () => void }) {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState('');
  return (
    <View>
      <TextInput style={styles.campo} placeholder="Senha atual" placeholderTextColor={Colors.textMuted} secureTextEntry
        autoCapitalize="none" value={atual} onChangeText={setAtual} testID="conta-senha-atual" />
      <TextInput style={styles.campo} placeholder="Senha nova (8 ou mais)" placeholderTextColor={Colors.textMuted} secureTextEntry
        autoCapitalize="none" value={nova} onChangeText={setNova} testID="conta-senha-nova" />
      <TouchableOpacity style={styles.botao} disabled={ocupado || nova.length < 8} testID="conta-salvar-senha"
        onPress={() => {
          setOcupado(true); setAviso('');
          trocarSenha(atual, nova)
            .then(() => { setAviso('Pronto: senha trocada. Os outros aparelhos saíram da conta.'); setAtual(''); setNova(''); })
            .catch((e) => setAviso(e instanceof Error ? e.message : 'Não deu certo'))
            .finally(() => setOcupado(false));
        }}>
        {ocupado ? <ActivityIndicator color="#fff" /> : <Text style={styles.botaoTexto}>Trocar a senha</Text>}
      </TouchableOpacity>
      <Text style={styles.texto}>Se a conta ainda não tem senha, deixe a atual em branco.</Text>
      {!!aviso && <Text style={aviso.startsWith('Pronto') ? styles.ok : styles.erro}>{aviso}</Text>}
      <TouchableOpacity onPress={aoTerminar}><Text style={styles.link}>Fechar</Text></TouchableOpacity>
    </View>
  );
}

/**
 * Ajustes > Conta Saimo (opcional). Sem conta: entrar com e-mail e senha ou com
 * o código do e-mail. Com conta: sincroniza perfis, onde parou, favoritos,
 * listas e addons, e entra numa TV pelo código do QR. `codigoTv` vem do link do QR.
 */
export default function ContaSaimo({ codigoTv }: { codigoTv?: string }) {
  const [conta, setConta] = useState(estadoConta());
  const [tv, setTv] = useState(codigoTv ?? '');
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState('');
  const [mexendoNaSenha, setMexendoNaSenha] = useState(false);

  useEffect(() => aoMudarConta(setConta), []);
  useEffect(() => { if (codigoTv) setTv(codigoTv); }, [codigoTv]);

  const tentar = async (f: () => Promise<void>) => {
    setOcupado(true);
    setAviso('');
    try { await f(); } catch (e) { setAviso(e instanceof Error ? e.message : 'Não deu certo'); } finally { setOcupado(false); }
  };

  if (!conta.token) {
    return <View style={styles.caixa}><Entrar /></View>;
  }

  return (
    <View style={styles.caixa} testID="conta-logada">
      <View style={styles.linha}>
        <Ionicons name="person-circle-outline" size={26} color={Colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.titulo} numberOfLines={1}>{conta.email}</Text>
          <Text style={styles.texto}>{conta.sincronizando ? 'sincronizando…' : conta.erro ? conta.erro : haQuanto(conta.sincronizadaEm)}</Text>
        </View>
        <TouchableOpacity onPress={() => void sincronizar(true)} disabled={conta.sincronizando} testID="conta-sincronizar">
          <Ionicons name="sync" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {mexendoNaSenha && conta.email ? (
        <View style={{ marginTop: 10 }}><TrocarSenha aoTerminar={() => setMexendoNaSenha(false)} /></View>
      ) : !!conta.email && (
        <TouchableOpacity onPress={() => setMexendoNaSenha(true)} testID="conta-criar-senha">
          <Text style={styles.link}>Trocar a senha</Text>
        </TouchableOpacity>
      )}

      <Text style={[styles.titulo, { marginTop: 14 }]}>Entrar numa TV</Text>
      <Text style={styles.texto}>Na TV, abra Ajustes &gt; Conta Saimo e leia o QR com a câmera, ou digite aqui o código que aparece nela.</Text>
      <TextInput style={[styles.campo, styles.campoCodigo]} placeholder="ABCD-2345" placeholderTextColor={Colors.textMuted}
        autoCapitalize="characters" maxLength={9} value={tv} onChangeText={setTv} testID="conta-codigo-tv" />
      <TouchableOpacity style={styles.botao} disabled={ocupado || (codigoDoQr(tv) ?? '').length !== 8} testID="conta-aprovar-tv"
        onPress={() => tentar(async () => {
          const aparelho = await aprovarTv(codigoDoQr(tv) ?? tv);
          setTv('');
          setAviso(`Pronto: ${aparelho} entrou na sua conta.`);
        })}>
        {ocupado ? <ActivityIndicator color="#fff" /> : <Text style={styles.botaoTexto}>Entrar nesta TV</Text>}
      </TouchableOpacity>
      {!!aviso && <Text style={aviso.startsWith('Pronto') ? styles.ok : styles.erro}>{aviso}</Text>}

      <View style={[styles.linha, { marginTop: 16, justifyContent: 'space-between' }]}>
        <TouchableOpacity onPress={() => Alert.alert('Sair da conta', 'Os dados continuam neste aparelho. Sair?', [
          { text: 'Cancelar', style: 'cancel' }, { text: 'Sair', onPress: () => void sair() },
        ])} testID="conta-sair">
          <Text style={styles.link}>Sair da conta</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => Alert.alert('Apagar a conta', 'Apaga a conta e tudo o que ela guarda no servidor. Os dados deste aparelho continuam aqui. Não dá para desfazer.', [
          { text: 'Cancelar', style: 'cancel' }, { text: 'Apagar', style: 'destructive', onPress: () => void tentar(apagarConta) },
        ])}>
          <Text style={[styles.link, { color: Colors.error }]}>Apagar conta</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  caixa: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.md },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  titulo: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  texto: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 4 },
  campo: {
    backgroundColor: Colors.surfaceVariant, color: Colors.text, borderRadius: BorderRadius.md, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 16, marginTop: 10,
  },
  campoCodigo: { letterSpacing: 4, textAlign: 'center', fontSize: 20, fontWeight: '700' },
  botao: { backgroundColor: Colors.primary, borderRadius: BorderRadius.md, paddingVertical: 13, alignItems: 'center', marginTop: 10 },
  botaoSecundario: { backgroundColor: Colors.surfaceVariant },
  botaoTexto: { color: '#fff', fontSize: 15, fontWeight: '700' },
  link: { color: Colors.primaryLight, fontSize: 14, fontWeight: '600', marginTop: 10 },
  erro: { color: Colors.errorLight, fontSize: 13, marginTop: 8 },
  ok: { color: Colors.success, fontSize: 13, marginTop: 8 },
});
