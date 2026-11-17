/**
 * "Quem está assistindo?": escolher, gerenciar e editar perfis (até 10, com
 * avatar). Abre sozinha na partida com 2 ou mais perfis e pelos Ajustes.
 *
 * Perfil Kids: sair dele (escolher outro), gerenciar estando nele e editar ou
 * apagar um Kids pedem o código de 4 dígitos. Contrato em SaimoPlayer/docs/perfis.md.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, BackHandler, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/Colors';
import { AVATARES, IMAGEM_DO_AVATAR } from '../services/avatares';
import {
  MAX_NOME, MAX_PERFIS, PRINCIPAL, apagar, assinarPerfis, ativo, conferirCodigo, criar, definirPerguntar, editar,
  entrar, idAtivo, marcarEscolhido, pedeCodigo, perfis, perguntarAoAbrir, type Perfil,
} from '../services/perfis';

const TURQUESA = '#4FE3D0';

export function AvatarPerfil({ perfil, tamanho = 96 }: { perfil: Pick<Perfil, 'nome' | 'avatar'>; tamanho?: number }) {
  const img = IMAGEM_DO_AVATAR[perfil.avatar];
  const raio = tamanho * 0.24;
  if (img) return <Image source={img} style={{ width: tamanho, height: tamanho, borderRadius: raio }} contentFit="cover" />;
  return (
    <View style={{ width: tamanho, height: tamanho, borderRadius: raio, backgroundColor: '#3B3F8C', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: tamanho * 0.42, fontWeight: '800' }}>{(perfil.nome.trim()[0] ?? '?').toUpperCase()}</Text>
    </View>
  );
}

type Modo =
  | { t: 'escolher' }
  | { t: 'gerenciar' }
  | { t: 'editar'; perfil: Perfil | null }
  | { t: 'codigo'; perfil: Perfil; motivo: string; depois: () => void; voltar: Modo };

export default function TelaPerfis() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ obrigatoria?: string; modo?: string }>();
  const obrigatoria = params.obrigatoria === '1';
  const [, setVersao] = useState(0);
  useEffect(() => assinarPerfis(() => setVersao((v) => v + 1)), []);
  const [destrancado, setDestrancado] = useState(false);
  const [modo, setModo] = useState<Modo>(() => {
    if (params.modo !== 'gerenciar') return { t: 'escolher' };
    const a = ativo();
    if (!pedeCodigo(a)) return { t: 'gerenciar' };
    return { t: 'codigo', perfil: a, motivo: 'Para gerenciar os perfis, digite o código deste perfil Kids.', voltar: { t: 'escolher' }, depois: () => {} };
  });
  const lista = perfis();
  const atual = idAtivo();
  const perfilAtual = ativo();

  const fechar = useCallback(() => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)' as any); }, []);

  const voltar = useCallback((): boolean => {
    if (modo.t === 'codigo') { setModo(modo.voltar); return true; }
    if (modo.t === 'editar') { setModo({ t: 'gerenciar' }); return true; }
    if (modo.t === 'gerenciar') { setModo({ t: 'escolher' }); return true; }
    return obrigatoria; // obrigatória: o voltar do sistema não fecha sem escolher
  }, [modo, obrigatoria]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', voltar);
    return () => sub.remove();
  }, [voltar]);

  /** Roda direto, ou depois do código do perfil Kids `p`. */
  const comCodigo = (p: Perfil, motivo: string, acao: () => void, voltarPara: Modo) => {
    if (!pedeCodigo(p) || (destrancado && p.id === atual)) { acao(); return; }
    setModo({ t: 'codigo', perfil: p, motivo, voltar: voltarPara, depois: () => { if (p.id === atual) setDestrancado(true); acao(); } });
  };

  const escolher = (p: Perfil) => {
    const ir = async () => {
      marcarEscolhido();
      await entrar(p.id);
      router.replace('/(tabs)' as any);
    };
    if (p.id !== atual) comCodigo(perfilAtual, `Para sair do perfil ${perfilAtual.nome}, digite o código.`, () => { void ir(); }, { t: 'escolher' });
    else void ir();
  };

  if (modo.t === 'codigo') {
    return (
      <View style={[s.tela, { paddingTop: insets.top + 24 }]}>
        <PedirCodigo
          perfil={modo.perfil}
          motivo={modo.motivo}
          aoConfirmar={() => {
            // Depois do código: gerenciar aberto pelos Ajustes vai direto para a grade de gerenciar.
            if (params.modo === 'gerenciar' && modo.voltar.t === 'escolher' && modo.motivo.startsWith('Para gerenciar')) {
              setDestrancado(true); setModo({ t: 'gerenciar' }); return;
            }
            modo.depois();
            setModo((m) => (m.t === 'codigo' ? { t: 'escolher' } : m));
          }}
          aoCancelar={() => setModo(modo.voltar)}
        />
      </View>
    );
  }

  if (modo.t === 'editar') {
    return <EditarPerfil perfil={modo.perfil} aoVoltar={() => setModo({ t: 'gerenciar' })} />;
  }

  const gerenciar = modo.t === 'gerenciar';
  return (
    <ScrollView style={s.tela} contentContainerStyle={[s.conteudo, { paddingTop: insets.top + 36, paddingBottom: insets.bottom + 30 }]}>
      <Text style={s.titulo}>{gerenciar ? 'Gerenciar perfis' : 'Quem está assistindo?'}</Text>
      {gerenciar && <Text style={s.sub}>Toque num perfil para mudar o nome, o avatar ou o Kids.</Text>}
      <View style={s.grade}>
        {lista.map((p) => (
          <Pressable
            key={p.id}
            style={({ pressed }) => [s.item, pressed && { transform: [{ scale: 0.96 }] }]}
            onPress={() => (gerenciar
              ? comCodigo(p, `Para editar o perfil ${p.nome}, digite o código dele.`, () => setModo({ t: 'editar', perfil: p }), { t: 'gerenciar' })
              : escolher(p))}
            testID={`perfil-${p.nome}`}
          >
            <View style={[s.moldura, p.id === atual && !gerenciar && s.molduraAtual]}>
              <View style={gerenciar ? { opacity: 0.5 } : undefined}><AvatarPerfil perfil={p} tamanho={92} /></View>
              {gerenciar && <View style={s.lapis}><MaterialIcons name="edit" size={34} color="#fff" /></View>}
              {p.kids && <Text style={s.seloKids}>KIDS</Text>}
            </View>
            <Text style={[s.nome, p.id === atual && { color: '#fff', fontWeight: '700' }]} numberOfLines={1}>{p.nome}</Text>
          </Pressable>
        ))}
        {lista.length < MAX_PERFIS && (gerenciar || !perfilAtual.kids) && (
          <Pressable style={s.item} testID="perfil-adicionar"
            onPress={() => (gerenciar ? setModo({ t: 'editar', perfil: null })
              : comCodigo(perfilAtual, 'Para criar um perfil, digite o código deste perfil Kids.', () => setModo({ t: 'editar', perfil: null }), { t: 'escolher' }))}>
            <View style={[s.moldura, s.mais]}><MaterialIcons name="add" size={46} color="rgba(255,255,255,0.8)" /></View>
            <Text style={s.nome}>Adicionar perfil</Text>
          </Pressable>
        )}
      </View>
      <View style={s.acoes}>
        {gerenciar ? (
          <Botao texto="Pronto" principal onPress={() => setModo({ t: 'escolher' })} />
        ) : (
          <>
            <Botao texto="Gerenciar perfis" onPress={() => comCodigo(perfilAtual, 'Para gerenciar os perfis, digite o código deste perfil Kids.', () => setModo({ t: 'gerenciar' }), { t: 'escolher' })} />
            {!obrigatoria && <Botao texto="Fechar" onPress={fechar} />}
          </>
        )}
      </View>
      {!gerenciar && (
        <Pressable style={s.perguntar} onPress={() => definirPerguntar(!perguntarAoAbrir())}>
          <MaterialIcons name={perguntarAoAbrir() ? 'check-box' : 'check-box-outline-blank'} size={22} color={TURQUESA} />
          <Text style={s.perguntarTexto}>Perguntar quem está assistindo ao abrir</Text>
        </Pressable>
      )}
      <Text style={s.nota}>
        Cada perfil tem os seus favoritos, o que está assistindo e os recentes. As listas e os ajustes valem para todos.
        Até {MAX_PERFIS} perfis. O perfil Kids só mostra filmes e séries classificados até 12 anos e nada adulto.
      </Text>
    </ScrollView>
  );
}

function Botao({ texto, onPress, principal, perigo }: { texto: string; onPress: () => void; principal?: boolean; perigo?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.botao, principal && s.botaoPrincipal, perigo && s.botaoPerigo, pressed && { opacity: 0.8 }]}>
      <Text style={[s.botaoTexto, principal && { color: '#04141a' }, perigo && { color: '#ffb3b3' }]}>{texto}</Text>
    </Pressable>
  );
}

const so4 = (v: string) => v.replace(/\D/g, '').slice(0, 4);

export function PedirCodigo({ perfil, motivo, aoConfirmar, aoCancelar }: {
  perfil: Perfil; motivo: string; aoConfirmar: () => void; aoCancelar: () => void;
}) {
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState(false);
  const enviar = (v: string) => {
    if (v.length !== 4) return;
    if (conferirCodigo(perfil, v)) { aoConfirmar(); return; }
    setErro(true);
    setCodigo('');
  };
  return (
    <View style={s.codigoCaixa}>
      <AvatarPerfil perfil={perfil} tamanho={84} />
      <Text style={[s.titulo, { marginTop: 18 }]}>Código do perfil {perfil.nome}</Text>
      <Text style={s.sub}>{motivo}</Text>
      <TextInput
        style={s.codigoCampo}
        value={codigo}
        onChangeText={(t) => { const v = so4(t); setCodigo(v); setErro(false); if (v.length === 4) enviar(v); }}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={4}
        autoFocus
        placeholder="••••"
        placeholderTextColor="rgba(255,255,255,0.3)"
        testID="perfil-codigo"
      />
      <Text style={s.aviso}>{erro ? 'Código errado. Tente de novo.' : ''}</Text>
      <View style={s.acoes}>
        <Botao texto="Cancelar" onPress={aoCancelar} />
      </View>
    </View>
  );
}

function EditarPerfil({ perfil, aoVoltar }: { perfil: Perfil | null; aoVoltar: () => void }) {
  const insets = useSafeAreaInsets();
  const [nome, setNome] = useState(perfil?.nome ?? '');
  const [avatar, setAvatar] = useState(perfil?.avatar ?? (AVATARES.find((a) => !perfis().some((p) => p.avatar === a)) ?? AVATARES[0]));
  const [kids, setKids] = useState(perfil?.kids === true);
  const [cod1, setCod1] = useState('');
  const [cod2, setCod2] = useState('');
  const [aviso, setAviso] = useState('');
  const podeKids = perfil?.id !== PRINCIPAL;
  const precisaCodigo = kids && !(perfil?.kids && perfil.codigo);

  const salvar = () => {
    if (!nome.trim()) { setAviso('Escreva um nome para o perfil.'); return; }
    let kidsCodigo: string | undefined;
    if (kids) {
      if (cod1 || cod2 || precisaCodigo) {
        if (!/^\d{4}$/.test(cod1)) { setAviso('O código do Kids tem 4 números.'); return; }
        if (cod1 !== cod2) { setAviso('Os dois códigos não são iguais.'); return; }
        kidsCodigo = cod1;
      }
    } else if (perfil?.kids) kidsCodigo = '';
    if (perfil) editar(perfil.id, nome, avatar, kidsCodigo);
    else criar(nome, avatar, kidsCodigo);
    aoVoltar();
  };

  const confirmarApagar = () => {
    if (!perfil) return;
    Alert.alert('Apagar perfil', `Apagar o perfil ${perfil.nome}? Os favoritos e o progresso dele somem.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: () => { void apagar(perfil.id).then(aoVoltar); } },
    ]);
  };

  return (
    <ScrollView style={s.tela} contentContainerStyle={[s.conteudo, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 30 }]}
      keyboardShouldPersistTaps="handled">
      <Text style={s.titulo}>{perfil ? 'Editar perfil' : 'Novo perfil'}</Text>
      <View style={{ marginTop: 20 }}><AvatarPerfil perfil={{ nome: nome || '?', avatar }} tamanho={100} /></View>
      <TextInput
        style={s.campo}
        value={nome}
        onChangeText={(t) => { setNome(t.slice(0, MAX_NOME)); setAviso(''); }}
        placeholder="Nome do perfil"
        placeholderTextColor="rgba(255,255,255,0.35)"
        maxLength={MAX_NOME}
        testID="perfil-nome"
      />
      <Text style={[s.sub, { alignSelf: 'flex-start' }]}>Escolha um avatar</Text>
      <View style={s.avatares}>
        {AVATARES.map((a) => (
          <Pressable key={a} onPress={() => setAvatar(a)} style={[s.opcao, a === avatar && s.opcaoOn]} testID={`avatar-${a}`}>
            <AvatarPerfil perfil={{ nome: a, avatar: a }} tamanho={56} />
          </Pressable>
        ))}
      </View>
      {podeKids && (
        <>
          <Pressable style={[s.kids, kids && s.kidsOn]} onPress={() => { setKids(!kids); setAviso(''); }} testID="perfil-kids">
            <MaterialIcons name={kids ? 'check-box' : 'check-box-outline-blank'} size={24} color={kids ? TURQUESA : 'rgba(255,255,255,0.6)'} />
            <View style={{ flex: 1 }}>
              <Text style={s.kidsTitulo}>Perfil Kids</Text>
              <Text style={s.kidsTexto}>Só filmes e séries classificados até 12 anos, nada adulto. Sair dele pede um código de 4 números.</Text>
            </View>
          </Pressable>
          {kids && (
            <View style={s.codigos}>
              <TextInput style={[s.campo, s.campoCodigo]} value={cod1} onChangeText={(t) => { setCod1(so4(t)); setAviso(''); }}
                keyboardType="number-pad" secureTextEntry maxLength={4} testID="perfil-cod1"
                placeholder={precisaCodigo ? 'Código' : 'Novo código'} placeholderTextColor="rgba(255,255,255,0.35)" />
              <TextInput style={[s.campo, s.campoCodigo]} value={cod2} onChangeText={(t) => { setCod2(so4(t)); setAviso(''); }}
                keyboardType="number-pad" secureTextEntry maxLength={4} testID="perfil-cod2"
                placeholder="Repita" placeholderTextColor="rgba(255,255,255,0.35)" />
            </View>
          )}
        </>
      )}
      <Text style={s.aviso}>{aviso}</Text>
      <View style={s.acoes}>
        <Botao texto="Salvar" principal onPress={salvar} />
        <Botao texto="Cancelar" onPress={aoVoltar} />
      </View>
      {perfil && perfil.id !== PRINCIPAL && <View style={s.acoes}><Botao texto="Apagar perfil" perigo onPress={confirmarApagar} /></View>}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: '#0B0F2A' },
  conteudo: { alignItems: 'center', paddingHorizontal: 20 },
  titulo: { color: '#fff', fontSize: 26, fontWeight: '800', textAlign: 'center' },
  sub: { color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 10, textAlign: 'center' },
  grade: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 30, gap: 18 },
  item: { width: 112, alignItems: 'center' },
  moldura: { width: 100, height: 100, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'transparent' },
  molduraAtual: { borderColor: TURQUESA },
  mais: { borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.35)', borderWidth: 2, backgroundColor: 'rgba(255,255,255,0.04)' },
  lapis: { position: 'absolute' },
  seloKids: { position: 'absolute', right: -6, bottom: -6, backgroundColor: '#FFB43D', color: '#2a1400', fontSize: 11, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
  nome: { color: 'rgba(255,255,255,0.75)', fontSize: 15, marginTop: 8, maxWidth: 110 },
  acoes: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 24 },
  botao: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', backgroundColor: 'rgba(255,255,255,0.05)' },
  botaoPrincipal: { backgroundColor: TURQUESA, borderColor: TURQUESA },
  botaoPerigo: { borderColor: 'rgba(255,110,110,0.5)' },
  botaoTexto: { color: '#fff', fontSize: 15, fontWeight: '700' },
  perguntar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22 },
  perguntarTexto: { color: 'rgba(255,255,255,0.75)', fontSize: 14 },
  nota: { color: 'rgba(255,255,255,0.45)', fontSize: 12.5, textAlign: 'center', marginTop: 22, lineHeight: 18, maxWidth: 420 },
  campo: { alignSelf: 'stretch', marginTop: 18, height: 52, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', backgroundColor: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 18, paddingHorizontal: 16 },
  avatares: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 12 },
  opcao: { padding: 3, borderRadius: 18, borderWidth: 3, borderColor: 'transparent' },
  opcaoOn: { borderColor: TURQUESA },
  kids: { alignSelf: 'stretch', flexDirection: 'row', gap: 12, alignItems: 'center', marginTop: 22, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(255,255,255,0.04)' },
  kidsOn: { borderColor: TURQUESA },
  kidsTitulo: { color: '#fff', fontSize: 16, fontWeight: '700' },
  kidsTexto: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 2 },
  codigos: { alignSelf: 'stretch', flexDirection: 'row', gap: 12 },
  campoCodigo: { flex: 1, textAlign: 'center', letterSpacing: 8 },
  aviso: { color: '#ffb3b3', fontSize: 14, marginTop: 12, minHeight: 18 },
  codigoCaixa: { alignItems: 'center', paddingHorizontal: 24 },
  codigoCampo: { marginTop: 26, width: 200, height: 64, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 30, fontWeight: '700', textAlign: 'center', letterSpacing: 12 },
});
