#!/usr/bin/env bash
# Confere se os arquivos que o index.html referencia existem MESMO no servidor.
# Uso:  bash verificar-icones.sh https://seuusuario.github.io/seurepo
BASE="${1%/}"
[ -z "$BASE" ] && { echo "uso: bash verificar-icones.sh https://usuario.github.io/repo"; exit 1; }
falhou=0
for f in apple-touch-icon.png apple-touch-icon-152.png apple-touch-icon-167.png \
         apple-touch-icon-precomposed.png app-icon-192.png app-icon-512.png \
         app-icon-1024.png manifest.webmanifest; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/$f")
  if [ "$code" = "200" ]; then printf '  ok   %s\n' "$f"
  else printf '  FALTA (%s)  %s\n' "$code" "$f"; falhou=1; fi
done
[ $falhou -eq 0 ] && echo "Todos no ar." || echo "Suba os arquivos marcados como FALTA na mesma pasta do index.html."
