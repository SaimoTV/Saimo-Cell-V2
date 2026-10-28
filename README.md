# Saimo TV — celular (Android)

<p align="center">
  Saimo TV: <a href="https://github.com/gabrielsaimo/SaimoTV-Android">TV Box</a> · <b>Celular</b> · <a href="https://github.com/gabrielsaimo/SaimoWin">Windows</a> · <a href="https://github.com/gabrielsaimo/SaimoPlayer">Mac e catálogo</a> · <a href="https://github.com/gabrielsaimo/Saimo-TV">Site</a> · <a href="https://github.com/gabrielsaimo">todos os apps</a>
</p>

Canais ao vivo, guia de programação, filmes e séries no celular. Versão atual:
**2.1.4**. Expo SDK 57, React Native 0.86, React 19.2, react-native-video.

Listas: o app **não traz lista nenhuma** (nem canais, nem filmes, nem tabelas
por canal). Traz só dois endereços de fábrica, ativos desde a primeira abertura
(`LINK_CANAIS_PADRAO` e `LINK_FILMES_PADRAO` em `utils/links.ts`, o único lugar
que os define): `https://canais-saimo.pages.dev/` e
`https://filmes-saimo.pages.dev/`. Ninguém precisa digitar nada. Em
**Ajustes > Listas** dá para trocar cada endereço (testado: `catalogo.txt` e
`indice.txt` precisam responder 200), **desligar** uma lista (salvar o campo
vazio apaga o endereço e os dados dela; a aba fica no estado vazio, sem pedido
de rede) e **Restaurar padrão**. Só o que difere do padrão é gravado
(`stores/linksStore.ts`). A normalização (`utils/links.ts`) completa `https://`,
tira `?query`/`#fragmento`, descarta um arquivo colado no fim e garante `/`.
O endereço de canais serve `catalogo.txt`, `canais.txt`, `restritos.txt` e
`guia.txt` (feeds XMLTV, apelidos, guiadetv e Pluto do guia de programação,
`utils/guia.ts`); o de filmes serve a pasta `vod/`. A seção de cada canal vem do
campo `categoria:` do catálogo (sem categoria: "Outros"). Na primeira execução
desta versão os caches de listas das versões anteriores são apagados;
favoritos, progresso e ajustes ficam.

Atualização: o app lê um endereço fixo,
`https://canais-saimo.pages.dev/versao.json`
(`arquivos.celular`), compara a versão e baixa o APK. O link do `versao.json` só
é aceito se for `https` em `github.com/<dono>/<repo>/releases/download/…` (ou os
hosts de redirecionamento do GitHub). Qualquer falha na leitura significa "sem
atualização". A verificação do `sha256` ainda não é feita (não há API de hash
no app).

## O que tem

Fontes sem endereço à mostra: as listas de fontes (canais e filmes) mostram só
"Fonte N", o nome da fonte (ex.: "Temporada 3") e a qualidade; nunca o servidor
nem o endereço.

- **Abertura animada** na partida a frio: o logo montado peça por peça
  (`assets/abertura/`, 9:16 em pé e 16:9 no tablet deitado), sem som, cobrindo
  a tela, com fade de 250 ms para o app, que monta por baixo. Toque ou voltar
  pulam. A tela do sistema (`expo-splash-screen` no `app.json`) é do mesmo
  azul #0B0F2A e sem ícone. Erro no vídeo ou primeiro quadro que não vem em
  1,5 s: a abertura sai na hora (`components/Abertura.tsx`).
- **TV ao vivo** com a lista do endereço informado (`catalogo.txt`), várias fontes por canal, ClearKey e troca automática de fonte;
  ao vivo não tem pausa
- **Minhas listas** (Ajustes): a pessoa cola o link de uma lista `.m3u` comum
  (só `http://`/`https://`, até 30 s e 30 MB, com `User-Agent` de VLC) e os canais
  entram na categoria "Minhas listas" da TV ao vivo, com logo, várias fontes
  (`Fonte N · qualidade`), `referer`/`user-agent` e ClearKey. A lista fica só no
  aparelho (dados no AsyncStorage, canais já lidos em
  `minhas_listas/<id>.json`), abre sem rede, atualiza sozinha ao abrir o app
  se tem mais de 12 h, e tem Atualizar, Ativar/Desativar e Remover; até 10 listas.
  O link digitado não é mostrado de volta nem registrado. Canais cujo grupo ou nome
  é adulto (`xxx`, `adult`, `porn`…; "Adult Swim" não conta) vão para a categoria
  "Adulto", que só aparece depois do desbloqueio do controle parental (sem mexer
  nele). Também dá para "Escolher arquivo" `.m3u` no aparelho
  (`expo-document-picker`): passa pelo mesmo leitor e mesmas mensagens; a lista fica
  sem link, não atualiza sozinha e "Atualizar" pede o arquivo de novo. Código: `services/minhasListasLeitor.ts` (leitor puro),
  `services/minhasListas.ts` (download e armazenamento), `components/MinhasListas.tsx`
  (tela), ligação em `stores/channelStore.ts`. Teste do leitor contra o gabarito:
  `npx --yes tsx scripts/testar-minhas-listas.ts [pasta]`.
- **Guia de programação** por canal (XMLTV e Pluto TV, endereços e tabelas vindos do `guia.txt`).
  O XML vai direto para o disco e é lido em blocos de 256 KB
  (`services/epgService.ts`); só os programas dos canais do app ficam na
  memória, então o guia de ~16 MB não derruba aparelho de heap pequeno.
  Os programas das próximas 30 h ficam salvos já separados
  (`epg-processado.json`, até 8 MB), e a próxima abertura mostra o guia sem
  reler o XML
- **Eventos** (`services/eventos.ts`), como no TV Box: a agenda da embedtv
  e a do monitor (`/v1/eventos`, canais de streaming como CazéTV, Disney+, Prime,
  Paramount+, GOAT, ge tv, N Sports e SportyNet, sem repetir) com os placares da ESPN, só jogos que passam em algum canal da lista, em
  grupos (ao vivo agora, começa em breve, hoje, amanhã, próximos dias); placar
  e tempo de jogo atualizam a cada minuto com a aba aberta, e tocar abre o canal
- **Filmes e séries** do acervo compartilhado (`vod/` do SaimoPlayer), com
  ficha, episódios, atores e escolha de fonte
- **Fonte mantida na série**: ao passar de episódio (automático, Próximo ou outro da
  série), prefere a fonte que estava tocando, sem trocar entre dublado e legendado — mesmo
  servidor, senão a mesma posição na versão, senão a ordem de sempre (`utils/fontePreferida.ts`); se falhar, as outras fontes
  seguem como reserva
- **Legendas do OpenSubtitles** em filmes e séries (pt-BR, pt-PT, inglês, espanhol), com
  ajuste de sincronia (`services/legendas.ts`); sem chave nem cadastro
- **Pular abertura e créditos** com os tempos do
  [TheIntroDB](https://theintrodb.org) (`services/pulos.ts`), e cartão do
  próximo episódio quando os créditos começam
- **Continuar assistindo** na aba de filmes, e um banner do primeiro destaque
  no topo: com trailer direto no catálogo (MP4/HLS) ele toca sem som depois
  de 5 s, e a ficha abre se o trailer tocou e a aba ficou na frente por mais
  15 s
- **Janela flutuante** (picture-in-picture) no player ao vivo, no Android
- **Downloads** para ver sem internet, com notificação de andamento
- **Chromecast**, favoritos e busca. Sem nada conectado, o botão de transmitir
  pergunta: **Transferir para a TV** (Google Cast) ou **Usar o Saimo Connect**
  (`components/CastAction.tsx`)
- **Android 17**: com targetSdk 37 o sistema bloqueia a rede local sem a
  permissão `ACCESS_LOCAL_NETWORK` (busca e IP manual falham calados). O Connect
  pede ao abrir/buscar e mostra "Permissão de rede local" com atalho para as
  configurações se for negada (`garantirPermissaoRede` em `services/saimoConnect.ts`).
- **Menu de navegação** (`components/BarraDeAbas.tsx`, ligado em `app/(tabs)/_layout.tsx`):
  cápsula flutuante no estilo Material 3, seis espaços iguais com o nome sempre
  visível e indicador em degradê (índigo → roxo) atrás do ícone ativo, que entra
  com mola (Reanimated). Nada muda de largura ao trocar de aba.
- **Som em segundo plano**: o player do som (`components/ConnectAudioHost.tsx`)
  sobe o serviço de mídia em primeiro plano (`showNotificationControls`), o
  ExoPlayer segura CPU/Wi-Fi enquanto toca (`WAKE_MODE_NETWORK`, aplicado por
  `scripts/ajustar-rn-video.js` no postinstall) e, ao ligar o som pela primeira
  vez, o app pede para sair da otimização de bateria. Testado com tela apagada e
  Doze profundo forçado: som e conexão seguem.
- **Som da TV no celular** pelo Saimo Connect, sincronizado com a imagem
  (`components/ConnectAudioHost.tsx`, `services/sincroniaTv.ts`): a lista HLS
  passa pelo `/hls` da TV, que a estende e escreve a régua de tempo. A conta
  usa só o relógio monotônico (`performance.now`): o aviso de posição que
  chegou mais rápido nos últimos 15 s mais metade da menor ida e volta do
  ping. O player decide pela mediana das últimas amostras, pula quando está
  mais de 1 s fora (mirando à frente do tempo que leva para voltar a tocar,
  aprendido no pulo anterior) e, mais perto, acelera ou freia até 8% até
  ficar a menos de 20 ms. Toca só o som (a faixa de vídeo fica desligada).
  Três pulos em 20 s sem encaixar: toca normal por 15 s antes de tentar de
  novo, em vez de picotar. Pausa quando a TV pausa ou carrega. O ajuste
  manual de atraso (fone Bluetooth) entra na mesma conta
- **Pouca memória:** o buffer dos players cresce conforme a memória livre
  (`BufferingStrategyType.DEPENDING_ON_MEMORY`); fonte de filme pesada demais
  para o aparelho abre a escolha de fonte em vez de reiniciar o player. As
  listas do acervo ficam em arquivos (`Paths.cache/saimo-listas/`), não no
  AsyncStorage, e no release `console.log` não faz nada
  (`services/semLogs.ts`)
- **Link direto** `saimo://player/<canal>` funciona com o app fechado: a lista
  de canais é baixada antes de abrir o player
- Versão mostrada em Ajustes e usada pelo atualizador lida do próprio app
  (`app.json`)

## Rodar

```bash
npm install
npx expo run:android
```

## APK de release

```bash
cd android
ANDROID_HOME="/Volumes/SSD 1TB/DEV/AndroidDev/sdk" JAVA_HOME=/opt/homebrew/opt/openjdk@17 ./gradlew assembleRelease
```

Sai em `android/app/build/outputs/apk/release/app-release.apk`. O
`release.sh` do SaimoPlayer copia esse arquivo como `SaimoCell.apk` para o
release. A versão fica em `app.json` (`version` e `android.versionCode`,
2.0.4 = 20004) e em `package.json`.

A pasta `android/` é gerada pelo Expo (`npx expo prebuild --clean`) e não vai
para o Git. O que precisa sobreviver a isso fica em plugins:

- `plugins/withSaimoSigning.js`: assina o release com a chave de sempre
  (`../chaves/saimo-cell.jks`, fora do repositório). Com outra chave o
  Android recusa instalar por cima da versão que as pessoas já têm.
- `plugins/withSaimoArquiteturas.js`: código nativo só para ARM
  (`arm64-v8a`, `armeabi-v7a`). Celular é ARM; sem x86 o build leva perto da
  metade do tempo e o APK fica menor. Emulador x86 não roda esse APK.

A tela do sistema sai do `expo-splash-screen` (cor e ícone vazio
`assets/abertura/splash-vazio.xml`); o prebuild põe o
`SplashScreenManager.registerOnActivity` no `MainActivity`.

compileSdk e targetSdk 37 vêm do `expo-build-properties` no `app.json`.

## Telemetria por amostra

O monitor é cobrado por pedido, então só uma fatia fixa dos aparelhos fala com
ele (`utils/amostra.ts`): FNV-1a 32 bits do `deviceId` em minúsculas, dentro
quando `hash % 10000 < amostraPct * 100` — a mesma conta do `worker.js`. O
percentual (padrão 5) vem de `/telemetria.json` (arquivo estático, grátis),
relido no máximo uma vez por dia e guardado; o `hello` também pode
atualizá-lo. Fora da amostra não sai hello, batida nem evento — só `crash`.
Dentro, batidas fora do relógio (pausa, troca de título, parada) saem no
máximo uma a cada 30 s; a última, ao ir para segundo plano, sempre. A lista de
servidores desligados (`/v1/fontes`) vale uma hora e fica guardada entre
aberturas; a agenda do monitor (`/v1/eventos`) só é pedida com a aba Eventos à
vista e o app em primeiro plano, a cada 3 min (na hora ao abrir, se a guardada
tem mais de 1 min).

Testes: `node --test tests/*.test.cjs` (o do hash é `tests/amostra.test.cjs`).

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `app/(tabs)` | abas: início (canais), filmes, downloads, favoritos, ajustes |
| `app/media`, `app/series`, `app/actor` | fichas |
| `app/player`, `app/media-player` | player ao vivo e de filmes/séries |
| `services/` | catálogo, acervo, guia, TMDB, TheIntroDB, legendas, downloads, telemetria |
| `components/` | cartões, listas, player, escolha de fonte, atualizador |

Histórico de mudanças em [CHANGELOG.md](CHANGELOG.md).
