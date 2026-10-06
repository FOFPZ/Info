#!/usr/bin/env bash
# ============================================================================
# publish.sh — публикует копию страницы-визитки на GitHub Pages через
# репозиторий FoFPZ.github.io (папка docs/Info/ внутри него).
#
# Запускать ЛОКАЛЬНО на своей машине: у токена рабочей среды нет прав
# на запись в FoFPZ.github.io (только в Info).
#
# Использование:
#   ./tools/publish.sh                       # репозиторий и ветка по умолчанию
#   ./tools/publish.sh <url-репозитория> <ветка>
#
# Адрес после публикации: https://fofpz.github.io/Info/
# Источник истины для текстов: docs/ в репозитории Info (файл assets/profile.js).
# ============================================================================
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)/docs"
TARGET_REPO="${1:-https://github.com/FOFPZ/FoFPZ.github.io.git}"
BRANCH="${2:-main}"

# защита от утечки личной почты в историю чужого репозитория
case "$(git config user.email || true)" in
  *@users.noreply.github.com) ;;
  *)
    echo "Ошибка: в git config указана не анонимная почта." >&2
    echo 'Сначала выполните: git config --global user.email "ВАШ_NOREPLY@users.noreply.github.com"' >&2
    exit 1
    ;;
esac

[ -d "$SRC" ] || { echo "Ошибка: не найдена папка $SRC" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo ">> Клонирую $TARGET_REPO (ветка $BRANCH)…"
git clone -q --depth 5 "$TARGET_REPO" "$WORK/ghio"
cd "$WORK/ghio"
git checkout -q "$BRANCH"

echo ">> Копирую docs/ -> docs/Info/…"
rm -rf docs/Info
mkdir -p docs/Info
cp -R "$SRC/." docs/Info/

git add -A docs/Info
if git diff --cached --quiet; then
  echo "Изменений нет — публиковать нечего."
  exit 0
fi

git commit -q -m "Info: обновление страницы-визитки"
git push -q origin "$BRANCH"

echo
echo "Опубликовано: https://fofpz.github.io/Info/"
echo "Сборка Pages занимает около минуты."
