#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "Кто хочет стать миллионером"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Нет pnpm."
  echo "macOS:   brew install pnpm"
  echo "Linux:   npm install -g pnpm"
  echo "NixOS:   nix develop"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Первый запуск, ставлю зависимости..."
  pnpm install
fi

echo "Запускаю сервер и клиент..."
pnpm dev
