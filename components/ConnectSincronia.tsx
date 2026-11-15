import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { useConnectStore } from '../stores/connectStore';
import { saimoConnect } from '../services/saimoConnect';
import { escolhaDaTv, NADA, TUDO, type EscolhaSincronia } from '../services/connectSincronia';

const ITENS: { chave: keyof EscolhaSincronia; titulo: string; detalhe: string; icone: keyof typeof MaterialIcons.glyphMap }[] = [
  { chave: 'favoritos', titulo: 'Favoritos', detalhe: 'Canais, filmes e séries marcados', icone: 'star' },
  { chave: 'listas', titulo: 'Listas de canais e filmes', detalhe: 'Endereços e listas M3U / Xtream adicionadas', icone: 'playlist-play' },
  { chave: 'addons', titulo: 'Addons', detalhe: 'Addons instalados (e o Debrid, se você permitir no Debrid)', icone: 'extension' },
  { chave: 'historico', titulo: 'Histórico', detalhe: 'Onde parou em cada filme e episódio', icone: 'history' },
];

/**
 * Pergunta, ao conectar numa TV pela primeira vez, o que sincronizar com ela.
 * A escolha fica guardada para aquela TV; dá para mudar no Saimo Connect.
 */
export default function ConnectSincronia() {
  const tv = useConnectStore((s) => s.sincroniaPergunta);
  const setPergunta = useConnectStore((s) => s.setSincroniaPergunta);
  const [escolha, setEscolha] = useState<EscolhaSincronia>(TUDO);
  const [jaRespondeu, setJaRespondeu] = useState(false);

  useEffect(() => {
    if (!tv) return;
    void escolhaDaTv(tv.id).then((e) => {
      setJaRespondeu(e !== null);
      setEscolha(e && (e.favoritos || e.listas || e.addons || e.historico) ? e : TUDO);
    });
  }, [tv]);

  if (!tv) return null;

  const responder = (e: EscolhaSincronia) => void saimoConnect.definirSincronia(tv.id, e);
  const nenhum = !escolha.favoritos && !escolha.listas && !escolha.addons && !escolha.historico;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => (jaRespondeu ? setPergunta(null) : responder(NADA))}>
      <Pressable style={styles.fundo} onPress={() => (jaRespondeu ? setPergunta(null) : undefined)}>
        <Pressable style={styles.caixa} onPress={() => {}}>
          <View style={styles.topo}>
            <View style={styles.icone}>
              <Ionicons name="sync" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.titulo}>Sincronizar com {tv.name}?</Text>
              <Text style={styles.sub}>
                O que estiver ligado fica igual no celular e na TV. O que estiver desligado não sai daqui.
              </Text>
            </View>
          </View>

          {ITENS.map((it) => (
            <View key={it.chave} style={styles.linha}>
              <MaterialIcons name={it.icone} size={20} color={Colors.textSecondary} />
              <View style={{ flex: 1, marginHorizontal: 12 }}>
                <Text style={styles.item}>{it.titulo}</Text>
                <Text style={styles.detalhe}>{it.detalhe}</Text>
              </View>
              <Switch
                value={escolha[it.chave]}
                onValueChange={(v) => setEscolha((e) => ({ ...e, [it.chave]: v }))}
                trackColor={{ true: Colors.secondary, false: 'rgba(255,255,255,0.15)' }}
                thumbColor="#fff"
              />
            </View>
          ))}

          <TouchableOpacity
            style={[styles.btn, nenhum && { opacity: 0.5 }]}
            disabled={nenhum}
            onPress={() => responder(escolha)}
          >
            <Text style={styles.btnTxt}>{jaRespondeu ? 'Salvar' : 'Sincronizar'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnSec} onPress={() => responder(NADA)}>
            <Text style={styles.btnSecTxt}>{jaRespondeu ? 'Parar de sincronizar' : 'Agora não'}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  caixa: { backgroundColor: '#141A33', borderRadius: 20, padding: 20 },
  topo: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  icone: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titulo: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  sub: { color: Colors.textSecondary, fontSize: 13, marginTop: 4, lineHeight: 18 },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  item: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  detalhe: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  btn: {
    backgroundColor: Colors.secondary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  btnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnSec: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  btnSecTxt: { color: Colors.textSecondary, fontSize: 14, fontWeight: '600' },
});
