import React, { useState } from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Colors, DESTAQUES, FUNDOS, BorderRadius, Spacing, Typography, gravarTemaParaAProximaPartida } from '../constants/Colors';
import {
  calcularEstatisticas, duracaoLegivel, useAparenciaStore, useExtrasStore, type DestaqueId, type FundoId,
} from '../stores/extrasStore';
import { definirNotificarEpisodios } from '../services/novosEpisodios';

/** Seções dos Ajustes do celular: estatísticas, aparência, legendas e avisos de episódios novos. */

function Pilulas<T extends string>({ opcoes, valor, aoEscolher }: { opcoes: readonly (readonly [T, string])[]; valor: T; aoEscolher: (v: T) => void }) {
  return (
    <View style={styles.pilulas}>
      {opcoes.map(([v, nome]) => (
        <TouchableOpacity key={v} style={[styles.pilula, valor === v && styles.pilulaOn]} onPress={() => aoEscolher(v)}>
          <Text style={[styles.pilulaTexto, valor === v && styles.pilulaTextoOn]}>{nome}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function EstatisticasAjustes() {
  const concluidos = useExtrasStore((s) => s.concluidos);
  const tempo = useExtrasStore((s) => s.tempo);
  const zerar = useExtrasStore((s) => s.zerarEstatisticas);
  const e = calcularEstatisticas(concluidos, tempo);
  const vazio = e.filmes === 0 && e.episodios === 0 && e.tempoTotal < 60;
  return (
    <>
      <Text style={styles.titulo}>Suas estatísticas</Text>
      <View style={styles.bloco}>
        {vazio ? (
          <Text style={styles.dica}>Ainda não há nada por aqui. Assista a um filme ou episódio até o fim e ele aparece. Episódios também podem ser marcados à mão na lista de episódios.</Text>
        ) : (
          <>
            <View style={styles.grade}>
              <Cartao valor={duracaoLegivel(e.tempoTotal)} rotulo="Tempo assistido" />
              <Cartao valor={String(e.filmes)} rotulo={e.filmes === 1 ? 'Filme concluído' : 'Filmes concluídos'} />
              <Cartao valor={String(e.episodios)} rotulo={e.episodios === 1 ? 'Episódio concluído' : 'Episódios concluídos'} />
              <Cartao valor={String(e.series)} rotulo={e.series === 1 ? 'Série acompanhada' : 'Séries acompanhadas'} />
              <Cartao valor={String(e.ultimos30)} rotulo="Concluídos em 30 dias" />
            </View>
            {e.maisVista && <Text style={styles.dica}>Série mais vista: {e.maisVista.titulo} ({e.maisVista.episodios} episódios)</Text>}
            <TouchableOpacity style={styles.botao} onPress={zerar}><Text style={styles.botaoTexto}>Zerar estatísticas</Text></TouchableOpacity>
          </>
        )}
      </View>
    </>
  );
}

function Cartao({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <View style={styles.cartao}>
      <Text style={styles.cartaoValor}>{valor}</Text>
      <Text style={styles.cartaoRotulo}>{rotulo}</Text>
    </View>
  );
}

export function AparenciaAjustes() {
  const { destaque, fundo, reduzirAnimacoes, setDestaque, setFundo, setReduzirAnimacoes } = useAparenciaStore();
  const [aviso, setAviso] = useState(false);
  const escolher = (d: DestaqueId, f: FundoId) => {
    gravarTemaParaAProximaPartida(d, f);
    setAviso(true);
  };
  return (
    <>
      <Text style={styles.titulo}>Aparência</Text>
      <View style={styles.bloco}>
        <Text style={styles.rotulo}>Cor de destaque</Text>
        <View style={styles.pilulas}>
          {(Object.keys(DESTAQUES) as DestaqueId[]).map((id) => (
            <TouchableOpacity key={id} style={[styles.amostra, destaque === id && styles.amostraOn]}
              accessibilityLabel={DESTAQUES[id].nome} onPress={() => { setDestaque(id); escolher(id, fundo); }}>
              <View style={[styles.bola, { backgroundColor: DESTAQUES[id].primary }]}>
                <View style={[styles.bolaMetade, { backgroundColor: DESTAQUES[id].secondary }]} />
              </View>
              <Text style={styles.pilulaTexto}>{DESTAQUES[id].nome}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.rotulo}>Fundo</Text>
        <Pilulas
          opcoes={(Object.keys(FUNDOS) as FundoId[]).map((id) => [id, FUNDOS[id].nome] as const)}
          valor={fundo}
          aoEscolher={(f) => { setFundo(f); escolher(destaque, f); }}
        />
        <View style={styles.linha}>
          <Text style={styles.rotulo}>Reduzir animações</Text>
          <Switch value={reduzirAnimacoes} onValueChange={setReduzirAnimacoes}
            trackColor={{ false: Colors.border, true: Colors.primary }} thumbColor={Colors.text} />
        </View>
        {aviso && <Text style={styles.dica}>Pronto. As cores novas valem na próxima vez que o app abrir: feche-o por completo e abra de novo.</Text>}
      </View>
    </>
  );
}

const TAMANHOS = [['pequena', 'Pequena'], ['media', 'Média'], ['grande', 'Grande'], ['enorme', 'Enorme']] as const;
const POSICOES = [['baixo', 'Embaixo'], ['alto', 'Mais acima']] as const;

export function LegendasAjustes() {
  const { legenda, setLegenda } = useAparenciaStore();
  const posicao = legenda.posicao === 'topo' ? 'alto' : legenda.posicao;
  return (
    <>
      <Text style={styles.titulo}>Legendas</Text>
      <View style={styles.bloco}>
        <Text style={styles.rotulo}>Tamanho</Text>
        <Pilulas opcoes={TAMANHOS} valor={legenda.tamanho} aoEscolher={(tamanho) => setLegenda({ tamanho })} />
        <Text style={styles.rotulo}>Posição</Text>
        <Pilulas opcoes={POSICOES} valor={posicao} aoEscolher={(p) => setLegenda({ posicao: p })} />
        <Text style={styles.dica}>Vale para as legendas do vídeo e para as baixadas. Cor e fonte seguem o padrão do Android.</Text>
      </View>
    </>
  );
}

export function NovosEpisodiosAjustes() {
  const ligado = useAparenciaStore((s) => s.notificarEpisodios);
  const [aviso, setAviso] = useState('');
  return (
    <>
      <Text style={styles.titulo}>Episódios novos</Text>
      <View style={styles.bloco}>
        <Text style={styles.dica}>Quando uma série favorita ganha episódios, o aviso aparece nos Favoritos. Se quiser, o celular também notifica.</Text>
        <View style={styles.linha}>
          <Text style={styles.rotulo}>Notificar no celular</Text>
          <Switch value={ligado}
            onValueChange={async (v) => {
              const ok = await definirNotificarEpisodios(v);
              setAviso(v && !ok ? 'Sem permissão: libere as notificações do Saimo TV nas configurações do Android.' : '');
            }}
            trackColor={{ false: Colors.border, true: Colors.primary }} thumbColor={Colors.text} />
        </View>
        {!!aviso && <Text style={styles.dica}>{aviso}</Text>}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  titulo: { color: Colors.textSecondary, fontSize: Typography.caption.fontSize, fontWeight: '600', textTransform: 'uppercase', marginBottom: Spacing.sm, marginTop: Spacing.md },
  bloco: { backgroundColor: Colors.cardBg, borderRadius: BorderRadius.lg, padding: Spacing.md, gap: 10 },
  rotulo: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  dica: { color: Colors.textSecondary, fontSize: 12.5, lineHeight: 18 },
  linha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pilulas: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pilula: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Colors.border },
  pilulaOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pilulaTexto: { color: Colors.text, fontSize: 13, fontWeight: '600' },
  pilulaTextoOn: { color: '#FFFFFF' },
  amostra: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 12, paddingLeft: 6, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: Colors.border },
  amostraOn: { borderColor: Colors.primary },
  bola: { width: 24, height: 24, borderRadius: 12, overflow: 'hidden', flexDirection: 'row', justifyContent: 'flex-end' },
  bolaMetade: { width: 12, height: 24 },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cartao: { minWidth: '30%', flexGrow: 1, padding: 12, borderRadius: 12, backgroundColor: Colors.surfaceVariant },
  cartaoValor: { color: Colors.primaryLight, fontSize: 20, fontWeight: '800' },
  cartaoRotulo: { color: Colors.textSecondary, fontSize: 11.5, marginTop: 2 },
  botao: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: Colors.border },
  botaoTexto: { color: Colors.text, fontSize: 13 },
});
