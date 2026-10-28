# Changelog — Saimo TV

## [Não publicado] — app sem listas

- Nenhuma lista no app: sem catálogo de canais embutido (`offiline.json`), sem tabelas de guia no código (guiadetv, feeds, Pluto), sem regra de seção pelo nome. Só dois endereços de fábrica (canais-saimo.pages.dev e filmes-saimo.pages.dev), ativos sem a pessoa digitar nada; em Ajustes > Listas dá para trocar, desligar (salvar vazio) e restaurar o padrão.
- Lista desligada: a aba mostra o estado vazio com atalho para Ajustes e nenhum pedido de rede para listas é feito.
- Tabelas do guia vêm do `guia.txt` do endereço de canais.
- Caches de listas das versões anteriores são apagados uma vez.
- Atualizador usa um único endereço fixo (`gabrielsaimo/SaimoPlayer`).
- Removido o `streamingService` (lia JSON de um endereço do GitHub que não existe mais); tendências cruzam com `fichas.txt`.

## [2.1.4] — 2026-10-12

- Aba Eventos como a do TV Box: jogos que passam nos canais da lista, com placar e tempo de jogo ao vivo, logo do canal e grupos por horário.
- Filmes em aparelho de pouca memória: o buffer acompanha a memória livre e a fonte pesada demais pede outra fonte em vez de reiniciar o player sem parar.
- Progresso do filme salvo a cada 5 s sem refazer o temporizador a cada segundo; histórico e progresso de séries sem duplicatas por ID codificado.
- Guia: cache dos programas já separados (próximas 30 h), recarga com debounce, "Recarregar Guia" em Ajustes volta a mostrar os dados, guia completo com todos os canais.
- Filmografia do ator usa o índice inteiro do acervo; busca com toque na primeira vez com o teclado aberto.
- Lista de canais volta ao topo ao trocar de categoria; carregando visível; pílulas de resolução só quando têm canais.
- Link direto para canal com o app fechado; "Canal não encontrado" com botão Voltar.
- Modo imersivo volta depois de fechar painéis e ao voltar para o app.
- Ordenação sem as opções "Nota" e "Popular", que não funcionavam; plural certo nas contagens.
- Menos renderizações (seletores do zustand), downloads gravados no máximo a cada 5 s, listas do acervo em arquivos, `console.log` desligado no release, atualizador checa 10 s depois de abrir.

## [2.1.1] — 2026-10-09

- Atualizador não depende mais só da API do GitHub: com o limite de 60 consultas por hora estourado (comum na rede do celular, onde muita gente sai pelo mesmo IP), ele acha a versão nova pelo endereço do último release e baixa o APK pelo link direto. Também volta a checar quando o app volta para a frente, a cada 6 h no máximo.
- Expo SDK 57, React Native 0.86 e bibliotecas nas versões mais novas; Android 16 (API 37) como alvo, com tela de ponta a ponta.
- Assinatura do release e arquiteturas (só ARM) em plugins, para sobreviver ao `expo prebuild --clean`.
- Corrigido o app fechando ao abrir em aparelho de pouca memória (`OutOfMemoryError` no Android 9 com heap de 48 MB): o guia de programação (~16 MB) e o da Pluto são baixados para o disco e lidos em blocos, sem passar inteiros pela memória.

## [2.0.0] — 2026-09-27

- Pular abertura e créditos com os tempos do TheIntroDB, e cartão do próximo episódio quando os créditos começam.
- Fileira "Continuar assistindo" na aba de filmes.
- Versão em Ajustes lida do próprio app.
- Títulos sem emoji.

## [1.4.0] — 2026-09-02

- Corrigida a tela preta na lista de episódios baixados: IDs codificados são reconhecidos após a navegação, com estados visíveis de carregamento e lista vazia.
- Limpeza de downloads aguarda a leitura dos registros salvos e preserva pastas com nomes decodificados, evitando apagar episódios válidos ao reiniciar o app.
- Player offline preserva os IDs do histórico e atualiza a navegação ao passar para outro episódio baixado.
- Corrigida a tela preta ao abrir um download concluído: o app agora confere o arquivo no disco antes de abrir o player e avisa quando ele foi apagado ou ficou incompleto, em vez de mostrar um retângulo preto sem explicação. Também parou de ciclar cabeçalhos HTTP inúteis num arquivo local.
- Canais passam a usar uma única lista, atualizada automaticamente por `catalogo.txt` e `canais.txt` do SaimoPlayer, sem a antiga escolha Lite/Pro.
- Fontes da lista Git recebem headers por stream, ClearKey compatível, DNS-over-HTTPS e adaptação dos hosts especiais do Telecine no Android.
- Filmes e séries passam a usar o catálogo VOD fragmentado compartilhado pelo SaimoPlayer/SaimoTV-Android, com busca, metadados, episódios e troca automática de fonte.
- Atualizador migrado para os releases do SaimoPlayer; reconhece com segurança `SaimoTV-Cell.apk` e `SaimoCell*.apk` sem confundir com o APK da TV.
- Cache remoto com fallback offline, carregamento progressivo do catálogo e correções de compatibilidade com Expo SDK 54/Android.

## [1.0.4] — 2026-04-24

### Correção — Canais da lista Normal fechavam o app ao abrir

---

### Problema

Ao abrir qualquer canal da lista Normal, o app fechava imediatamente.
Apenas o **1º canal (A&E)** funcionava. Todos os outros causavam crash.

---

### Investigação

Todos os canais usam **ClearKey DRM** — um sistema de criptografia de vídeo onde cada segmento do stream é cifrado com uma chave. Para reproduzir, o ExoPlayer precisa obter essa chave de alguma forma.

**Por que só A&E funcionava?**

- A&E usa servidores da UOL (`mais.uol.com.br`) que **embute as chaves diretamente no manifesto `.mpd`**. O ExoPlayer lê e usa essas chaves automaticamente, sem precisar de servidor externo.
- Todos os outros canais usam servidores da VRIO (`vrioott.com`) que **não embute as chaves no manifesto**. O ExoPlayer tenta requisitar as chaves em um servidor de licença — mas nenhum estava configurado → tela preta ou crash.

**Causa raiz do crash:**

O crash era sempre o mesmo erro independente da biblioteca de vídeo utilizada:

```
java.lang.IllegalArgumentException: Out of range: 127963963175
  at androidx.media3.common.util.Util.percentInt
  at androidx.media3.common.BasePlayer.getBufferedPercentage
```

O ExoPlayer calcula a porcentagem do buffer com a fórmula:

```
bufferedPercentage = (posição_buffer × 100) / duração
```

Para streams **ao vivo**, a posição do buffer é um timestamp Unix em milissegundos (ex: `127.963.963.175 ms` ≈ 4 anos desde 1970). A duração de um stream ao vivo é indefinida (`TIME_UNSET = Long.MIN_VALUE`). O resultado da divisão estoura um `int` Java (limite: ~2,1 bilhões) → `IllegalArgumentException` → crash imediato do app.

Esse crash ocorria na chamada `updateProgress()` do `react-native-video` e também na `MediaSessionImpl` do `expo-video` quando `staysActiveInBackground = true`.

---

### Arquivos Alterados

#### `node_modules/react-native-video/android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerView.java`

Linha 288 — função `updateProgress()`:

```java
// ANTES — crash em qualquer stream ao vivo
long bufferedDuration = player.getBufferedPercentage() * player.getDuration() / 100;
long duration = player.getDuration();

// DEPOIS — seguro para streams ao vivo
long duration = player.getDuration();
long bufferedDuration;
try {
    bufferedDuration = duration > 0 ? player.getBufferedPercentage() * duration / 100 : 0;
} catch (Exception e) {
    bufferedDuration = 0;
}
```

**Por quê:** `getBufferedPercentage()` chama `Util.percentInt()` do Media3 que lança `IllegalArgumentException` quando o valor não cabe em um `int`. A checagem `duration > 0` evita o cálculo para streams ao vivo (onde `getDuration()` retorna `TIME_UNSET = Long.MIN_VALUE`). O try-catch é uma segunda camada de segurança.

---

#### `android/app/src/main/assets/clearkey_keys.json` *(arquivo novo)*

Arquivo JSON com **136 pares de chaves ClearKey** extraídos do `offiline.json`, no formato:

```json
{
  "keys": [
    { "kid": "74481194bf32774e0cb44a1d71d6cc19", "key": "4bfd25bc9419f1c71e3ee8e6bf5ccf2a" },
    { "kid": "7dc3b6abe08d573883365f7d0b09fcb8", "key": "7f68828b12e6d739bff28fe2b50e8c94" },
    ...
  ]
}
```

Bundled como asset Android — disponível offline, sem depender de servidor externo.

---

#### `android/app/src/main/java/com/saimo/tvbox/ClearKeyServer.kt` *(arquivo novo)*

Servidor HTTP mínimo rodando em `http://127.0.0.1:8765` dentro do próprio processo do app.

**Funcionamento:**

1. Na inicialização, lê `clearkey_keys.json` e constrói um `Map<kidHex, keyHex>` em memória.
2. Quando o ExoPlayer requisita uma licença ClearKey, faz um HTTP POST com o corpo:
   ```json
   { "kids": ["<base64url-kid>"], "type": "temporary" }
   ```
3. O servidor decodifica o `kid` de base64url para hex, busca a chave no map e responde com:
   ```json
   { "keys": [{ "kty": "oct", "k": "<base64url-key>", "kid": "<base64url-kid>" }], "type": "temporary" }
   ```
4. O ExoPlayer recebe as chaves e decifra o vídeo normalmente.

**Características:**
- Sem dependências externas — usa apenas `ServerSocket` da JDK padrão
- Thread daemon (não impede o app de fechar)
- Resposta em < 1ms (lookup em memória)
- Sem acesso à internet — funciona 100% offline

---

#### `android/app/src/main/java/com/saimo/tvbox/MainApplication.kt`

Adicionada a inicialização do servidor no `onCreate()`:

```kotlin
override fun onCreate() {
    super.onCreate()
    // ...
    ClearKeyServer.start(this)  // ← linha adicionada
}
```

---

#### `app/player/[id].tsx`

Player reescrito de `expo-video` para `react-native-video`.

**Motivo da troca:** `expo-video` não suporta fornecer chaves ClearKey externamente — só aceita uma URL de servidor de licença como string, sem callback JS para interceptar a requisição. `react-native-video` permite configurar o `licenseServer` diretamente.

**Configuração DRM:**

```typescript
// Para canais com ClearKey DRM
const drmConfig = {
  type: DRMType.CLEARKEY,
  licenseServer: 'http://127.0.0.1:8765',  // servidor local
};
```

**Estratégia de troca de canal:**
- Cada abertura de canal usa `key={videoKey}` no componente `<Video>` para forçar remontagem limpa.
- Ao trocar de canal, incrementa `videoKey` com debounce de 200ms para evitar múltiplas montagens em scrolls rápidos.

---

### Por que `getLicense` callback (JS) não foi usado no Android?

O react-native-video possui um callback `getLicense` que permite interceptar a requisição de licença em JavaScript. Porém, analisando o código-fonte:

```typescript
useExternalGetLicense?: boolean; // ios
```

O comentário `// ios` confirma: **esse callback é exclusivo do iOS** (usado com FairPlay DRM). No Android, a biblioteca exige uma URL de servidor HTTP real no campo `licenseServer`. Por isso foi necessário criar o servidor local em Kotlin.

---

### Resultado dos Testes

Testes realizados via ADB no dispositivo Moto G04 (Android 14):

| Canal | Antes (1.0.3) | Depois (1.0.4) |
|-------|---------------|----------------|
| A&E (1) | ✅ Funcionava | ✅ Funcionando |
| Adult Swim (2) | ❌ App fechava | ✅ Funcionando |
| AMC (3) | ❌ App fechava | ✅ Funcionando |
| Canal 4+ | ❌ App fechava | ✅ Funcionando |
| PID do processo | Mudava (crash) | Mantido (sem crash) |
| Erros no logcat | `IllegalArgumentException` | Nenhum |

---

### Resumo das Mudanças

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `ReactExoplayerView.java` | Patch | Fix overflow `getBufferedPercentage()` em live streams |
| `clearkey_keys.json` | Novo | 136 chaves ClearKey de todos os canais |
| `ClearKeyServer.kt` | Novo | Servidor HTTP local para licenças ClearKey |
| `MainApplication.kt` | Alterado | Inicialização do servidor ClearKey |
| `app/player/[id].tsx` | Reescrito | Player com react-native-video + DRM local |
| `app.json` | Alterado | Versão 1.0.3 → 1.0.4 |
| `android/app/build.gradle` | Alterado | versionCode 1→4, versionName 1.0.3→1.0.4 |
