# Saimo TV na App Store: passo a passo

Tudo no projeto ja esta pronto. Falta so a sua conta de desenvolvedor.

## O que voce precisa fazer (uma vez)
1. **Pagar o Apple Developer Program** (developer.apple.com/programs) e esperar a ativacao.
2. **Anotar o Team ID**: developer.apple.com > Conta > Associacao > "ID da equipe" (10 letras/numeros).
3. **Logar no Xcode**: Xcode > Settings > Accounts > `+` > sua Apple ID.
4. **Criar o app no App Store Connect** (appstoreconnect.apple.com > Apps > `+` > Novo app):
   - Plataforma iOS, idioma principal Portugues (Brasil)
   - Bundle ID: `com.saimo.tv` (aparece depois que o passo 5 registrar; ou registre em Certificados > Identificadores)
   - SKU: qualquer, ex. `saimo-tv-ios`
5. **Hospedar a politica de privacidade** (`politica-de-privacidade.md`) numa URL publica (GitHub Pages, Notion publico, seu site).
6. **Hospedar a lista de teste** (`lista-teste.m3u`) numa URL publica (ex.: o link "Raw" de um Gist do GitHub) para os revisores.

## Gerar e enviar o build
```bash
# gera o .ipa assinado
TEAM_ID=ABCDE12345 ./scripts/ios-release.sh

# ou ja envia ao App Store Connect (TestFlight)
TEAM_ID=ABCDE12345 ./scripts/ios-release.sh --enviar
```
- O script copia o projeto para um caminho **sem espaco** (o Expo quebra com espaco no caminho) e precisa de uns 12 GB livres. Se o Mac estiver apertado: `WORK=/Volumes/SEUDISCO/saimo-build`.
- Sem Xcode logado, use uma chave da API (App Store Connect > Usuarios e acesso > Chaves): `ASC_KEY_PATH`, `ASC_KEY_ID`, `ASC_ISSUER_ID`.
- O `.ipa` fica em `build-ios/`. Alternativa ao `--enviar`: abrir o app **Transporter** e arrastar o `.ipa`.
- Antes de enviar de novo, suba o `buildNumber` em `app.json` (`ios.buildNumber`: "1" > "2" ...). A `version` so muda quando o usuario deve ver versao nova.

## Depois do envio
1. Espere o build sair de "Processando" no TestFlight e **teste num iPhone de verdade** (veja a lista abaixo).
2. Preencha a pagina do app com `metadados-pt-BR.md` (descricao, palavras-chave, categoria, classificacao).
3. Em **Privacidade do app**, siga `metadados-pt-BR.md` > "Privacidade".
4. Em **Informacoes para a revisao**, cole `notas-de-revisao.md` (em ingles) com a URL da lista de teste.
5. Capturas de tela: iPhone 6,9" (1320x2868) e 6,5" (1284x2778). Tire do simulador ou do aparelho.
6. Enviar para analise.

## Teste no iPhone antes de enviar (o simulador nao prova isso)
- [ ] Abrir o app e adicionar a lista de teste (http e https)
- [ ] Tocar um canal ao vivo e um filme; botao voltar; girar a tela
- [ ] Baixar um filme e assistir offline
- [ ] Saimo Connect: achar a TV Box, parear, controle remoto
- [ ] Cast (Chromecast)
- [ ] Som continua com a tela bloqueada
- [ ] Permissao de Fotos ao salvar download na Galeria
- [ ] Abrir sem internet (nao pode travar)

## O que ja foi feito no projeto (para a revisao da Apple)
- Ciclo de vida UIScene (exigido pelo iOS 27) e SDK do Expo 58.
- Icone 1024x1024 **sem canal alfa** (`assets/images/saimo_tv_icon_ios.png`).
- iPhone somente (`supportsTablet: false`): iPad nao foi testado. Para liberar iPad, mude para `true`, teste e envie capturas de iPad.
- `ITSAppUsesNonExemptEncryption = false` (so usa HTTPS/TLS padrao): evita a pergunta de exportacao.
- Modos em segundo plano: so `audio` (os outros estavam declarados e sem uso, a Apple rejeita).
- Manifesto de privacidade com as APIs de "motivo obrigatorio" (inclui espaco em disco).
- Texto de rede local em portugues (Saimo Connect e Chromecast).
- O app nao traz nenhuma lista e avisa isso na tela inicial.
- Doacao por link externo (Pix/cripto) e atualizador de APK **escondidos no iOS** (regras 3.1.1 e 2.5.2).
- ATS: `NSAllowsArbitraryLoads` ligado, porque a lista do usuario pode ser `http` (justificativa em `notas-de-revisao.md`).
