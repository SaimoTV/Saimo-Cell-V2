import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius } from '../constants/Colors';
import {
  aoMudarConta, apagarConta, aprovarTv, codigoDoQr, definirSenha, entrarComCodigo, entrarComSenha, estadoConta, pedirCodigo, sair,
  sincronizar,
} from '../services/conta';

function haQuanto(ms: number): string {
  if (!ms) return 'ainda não sincronizou';
  const min = Math.floor((Date.now() - ms) / 60000);
  if (min < 1) return 'sincronizado agora';
  if (min < 60) return `sincronizado há ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `sincronizado há ${h} h` : `sincronizado há ${Math.floor(h / 24)} d`;
}

type Modo = 'email' | 'senha' | 'codigo' | 'definir';

/**
 * Entrar: com a senha (quem criou uma) ou com o código de 6 números que chega
 * no e-mail. Criar ou trocar a senha também passa pelo código (prova que o
 * e-mail é de quem pede). `emailFixo`: já logado, só criando ou trocando a senha.
 */
function Entrar({ emailFixo, aoTerminar }: { emailFixo?: string; aoTerminar?: () => void }) {
  const [modo, setModo] = useState<Modo>(emailFixo ? 'definir' : 'email');
  const [email, setEmail] = useState(emailFixo ?? '');
  const [senha, setSenha] = useState('');
  const [codigo, setCodigo] = useState('');
  const [codigoPedido, setCodigoPedido] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState('');

  const tentar = async (f: () => Promise<void>) => {
    setOcupado(true);
    setAviso('');
    try { await f(); } catch (e) { setAviso(e instanceof Error ? e.message : 'Não deu certo'); } finally { setOcupado(false); }
  };
  const mandarCodigo = () => tentar(async () => {
    try {
      const r = await pedirCodigo(email);
      if (r.codigoDev) setCodigo(r.codigoDev); // só no servidor de teste
    } catch (e) {
      // Pediu há menos de 1 minuto: o código que já chegou continua valendo (10 min).
      if (!(e instanceof Error && /minuto/.test(e.message))) throw e;
    }
    setCodigoPedido(true);
  });
  const emailOk = email.includes('@');
  const voltar = () => { setModo('email'); setSenha(''); setCodigo(''); setCodigoPedido(false); setAviso(''); };
  const botao = (rotulo: string, onPress: () => void, desligado: boolean, testID: string, secundario = false) => (
    <TouchableOpacity style={[styles.botao, secundario && styles.botaoSecundario]} disabled={desligado} onPress={onPress} testID={testID}>
      {ocupado && !secundario ? <ActivityIndicator color="#fff" /> : <Text style={styles.botaoTexto}>{rotulo}</Text>}
    </TouchableOpacity>
  );

  return (
    <View testID={emailFixo ? 'conta-senha-logado' : 'conta-sem-login'}>
      {modo === 'email' && (
        <>
          <Text style={styles.texto}>
            Opcional: entre para guardar perfis, onde parou, favoritos, listas e addons na sua conta e ter tudo em qualquer
            aparelho, até fora de casa. Sem conta, tudo continua só neste aparelho.
          </Text>
          <TextInput style={styles.campo} placeholder="Seu e-mail" placeholderTextColor={Colors.textMuted} autoCapitalize="none"
            keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} testID="conta-email" />
          {botao('Entrar com senha', () => setModo('senha'), !emailOk, 'conta-com-senha')}
          {botao('Receber código por e-mail', () => { setModo('codigo'); void mandarCodigo(); }, ocupado || !emailOk, 'conta-enviar-codigo', true)}
        </>
      )}

      {modo === 'senha' && (
        <>
          <Text style={styles.texto}>{email.trim()}</Text>
          <TextInput style={styles.campo} placeholder="Senha" placeholderTextColor={Colors.textMuted} secureTextEntry
            autoComplete="password" autoCapitalize="none" value={senha} onChangeText={setSenha} testID="conta-senha" />
          {botao('Entrar', () => void tentar(() => entrarComSenha(email, senha)), ocupado || !senha, 'conta-entrar-senha')}
          <TouchableOpacity onPress={() => { setModo('definir'); setSenha(''); void mandarCodigo(); }} testID="conta-esqueci">
            <Text style={styles.link}>Esqueci a senha / criar senha</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={voltar}><Text style={styles.link}>Usar outro e-mail</Text></TouchableOpacity>
        </>
      )}

      {modo === 'codigo' && (
        <>
          <Text style={styles.texto}>{codigoPedido ? `Digite o código de 6 números que chegou em ${email.trim()}.` : 'Enviando o código…'}</Text>
          <TextInput style={[styles.campo, styles.campoCodigo]} placeholder="000000" placeholderTextColor={Colors.textMuted}
            keyboardType="number-pad" maxLength={6} value={codigo} onChangeText={setCodigo} testID="conta-codigo" />
          {botao('Entrar', () => void tentar(() => entrarComCodigo(email, codigo)), ocupado || codigo.length !== 6, 'conta-entrar')}
          <TouchableOpacity onPress={voltar}><Text style={styles.link}>Usar outro e-mail</Text></TouchableOpacity>
        </>
      )}

      {modo === 'definir' && (
        <>
          <Text style={styles.texto}>
            {codigoPedido ? `Chegou um código de 6 números em ${email.trim()}. Digite o código e a senha nova (pelo menos 8 caracteres).`
              : emailFixo ? `Para criar ou trocar a senha, mandamos um código para ${email.trim()}.` : 'Enviando o código…'}
          </Text>
          {emailFixo && !codigoPedido ? (
            botao('Mandar o código', () => void mandarCodigo(), ocupado, 'conta-pedir-codigo-senha')
          ) : (
            <>
              <TextInput style={[styles.campo, styles.campoCodigo]} placeholder="000000" placeholderTextColor={Colors.textMuted}
                keyboardType="number-pad" maxLength={6} value={codigo} onChangeText={setCodigo} testID="conta-codigo-senha" />
              <TextInput style={styles.campo} placeholder="Senha nova" placeholderTextColor={Colors.textMuted} secureTextEntry
                autoComplete="password-new" autoCapitalize="none" value={senha} onChangeText={setSenha} testID="conta-senha-nova" />
              {botao('Salvar senha e entrar', () => void tentar(async () => { await definirSenha(email, codigo, senha); aoTerminar?.(); }),
                ocupado || codigo.length !== 6 || senha.length < 8, 'conta-salvar-senha')}
            </>
          )}
          {emailFixo && (
            <Text style={styles.texto}>Trocar uma senha que já existia tira a conta dos outros aparelhos (entram de novo com a senha nova ou o QR).</Text>
          )}
          <TouchableOpacity onPress={aoTerminar ?? voltar}><Text style={styles.link}>{aoTerminar ? 'Cancelar' : 'Voltar'}</Text></TouchableOpacity>
        </>
      )}

      {!!aviso && <Text style={styles.erro}>{aviso}</Text>}
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
        <View style={{ marginTop: 10 }}><Entrar emailFixo={conta.email} aoTerminar={() => setMexendoNaSenha(false)} /></View>
      ) : !!conta.email && (
        <TouchableOpacity onPress={() => setMexendoNaSenha(true)} testID="conta-criar-senha">
          <Text style={styles.link}>Criar ou trocar a senha</Text>
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
