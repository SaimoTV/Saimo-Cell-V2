#!/usr/bin/env bash
# Gera o .ipa do Saimo TV para a App Store.
#
#   TEAM_ID=ABCDE12345 ./scripts/ios-release.sh            # arquiva, assina e exporta o .ipa
#   TEAM_ID=ABCDE12345 ./scripts/ios-release.sh --enviar   # ...e ja envia ao App Store Connect
#   ./scripts/ios-release.sh --sem-assinatura               # so confere que compila (sem conta paga)
#
# TEAM_ID: developer.apple.com > Conta > Associacao > ID da equipe (10 caracteres).
# O Xcode precisa estar logado na conta (Xcode > Settings > Accounts), ou use uma chave da API:
#   ASC_KEY_PATH=/caminho/AuthKey_XXXX.p8 ASC_KEY_ID=XXXX ASC_ISSUER_ID=xxxxxxxx-... 
#
# Por que copiar o projeto antes: o script do Expo (EXConstants) quebra se o caminho
# tiver espaco (ex.: "/Volumes/SSD 1TB/..."). A copia vai para um caminho sem espaco.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
TEAM_ID="${TEAM_ID:-}"
MODO=assinado
ENVIAR=0
for arg in "$@"; do
  case "$arg" in
    --sem-assinatura) MODO=teste ;;
    --enviar) ENVIAR=1 ;;
    -h|--help) sed -n 2,13p "$0"; exit 0 ;;
    *) echo "Opcao desconhecida: $arg"; exit 2 ;;
  esac
done

if [ "$MODO" = assinado ] && [ -z "$TEAM_ID" ]; then
  echo "Falta o TEAM_ID.  Exemplo:  TEAM_ID=ABCDE12345 ./scripts/ios-release.sh"
  echo "(Ainda sem conta paga? use --sem-assinatura para so conferir que compila.)"
  exit 1
fi

WORK="${WORK:-$HOME/.saimo-ios-build}"          # caminho sem espaco
case "$WORK" in *" "*) echo "WORK nao pode ter espaco: $WORK"; exit 1 ;; esac
OUT="$REPO/build-ios"
mkdir -p "$WORK" "$OUT"

LIVRE_GB=$(df -g "$WORK" | awk 'NR==2{print $4}')
if [ "${LIVRE_GB:-0}" -lt 12 ]; then
  echo "Pouco espaco em $WORK (${LIVRE_GB} GB livres). Libere uns 12 GB ou use WORK=/outro/caminho."
  exit 1
fi

export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
echo "==> 1/5 Copiando o projeto para $WORK"
rsync -a --delete --exclude /ios --exclude /android --exclude /dist --exclude /.git \
  --exclude /.expo --exclude /build-ios "$REPO/" "$WORK/"

cd "$WORK"
echo "==> 2/5 Gerando o projeto iOS (expo prebuild)"
npx expo prebuild --platform ios --clean --no-install
echo "==> 3/5 Instalando os Pods"
( cd ios && pod install )

cd ios
ARQUIVO="$OUT/SaimoTV.xcarchive"
rm -rf "$ARQUIVO"

if [ "$MODO" = teste ]; then
  echo "==> 4/5 Arquivando SEM assinatura (so teste)"
  xcodebuild archive -workspace SaimoTV.xcworkspace -scheme SaimoTV -configuration Release \
    -sdk iphoneos -destination 'generic/platform=iOS' -archivePath "$ARQUIVO" \
    CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=""
  echo "==> 5/5 Montando o .ipa sem assinatura"
  rm -rf "$OUT/ipa" && mkdir -p "$OUT/ipa/Payload"
  cp -R "$ARQUIVO/Products/Applications/SaimoTV.app" "$OUT/ipa/Payload/"
  ( cd "$OUT/ipa" && zip -qry "$OUT/SaimoTV-sem-assinatura.ipa" Payload )
  echo "Pronto (teste, NAO serve para a loja): $OUT/SaimoTV-sem-assinatura.ipa"
  exit 0
fi

AUTH=()
if [ -n "${ASC_KEY_PATH:-}" ]; then
  AUTH=(-authenticationKeyPath "$ASC_KEY_PATH" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")
fi

echo "==> 4/5 Arquivando com assinatura automatica (equipe $TEAM_ID)"
xcodebuild archive -workspace SaimoTV.xcworkspace -scheme SaimoTV -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARQUIVO" \
  DEVELOPMENT_TEAM="$TEAM_ID" CODE_SIGN_STYLE=Automatic \
  -allowProvisioningUpdates "${AUTH[@]}"

DESTINO=export
[ "$ENVIAR" = 1 ] && DESTINO=upload
OPCOES="$OUT/ExportOptions.plist"
sed -e "s/__TEAM_ID__/$TEAM_ID/" -e "s/__DESTINO__/$DESTINO/" "$REPO/appstore/ExportOptions.plist.template" > "$OPCOES"

echo "==> 5/5 Exportando ($DESTINO)"
xcodebuild -exportArchive -archivePath "$ARQUIVO" -exportOptionsPlist "$OPCOES" \
  -exportPath "$OUT" -allowProvisioningUpdates "${AUTH[@]}"

if [ "$ENVIAR" = 1 ]; then
  echo "Enviado ao App Store Connect. Em alguns minutos o build aparece em TestFlight."
else
  echo "Pronto: $(ls "$OUT"/*.ipa)"
  echo "Envie pelo app Transporter (Mac App Store) ou rode de novo com --enviar."
fi
