#!/usr/bin/env bash
# ============================================================================
# scrub-history.sh — переписывает историю git так, чтобы в ней не осталось
# личных почт: автор и коммитер всех коммитов получают анонимный адрес
# GitHub noreply.
#
# ВАЖНО:
#   • Запускать ЛОКАЛЬНО на своей машине, не в CI и не в чужих средах.
#   • История переписывается: меняются хеши всех коммитов.
#   • После скрипта нужен force-push всех веток и тегов.
#   • GitHub некоторое время может отдавать старые коммиты по прямой ссылке
#     на старый хеш. Полная гарантия — только новый (пересозданный) репозиторий.
#   • Сделайте резервную копию папки репозитория перед запуском.
#
# Использование:
#   ./scrub-history.sh /путь/к/репозиторию "123456+LOGIN@users.noreply.github.com" "LOGIN"
#
# Свой noreply-адрес смотрите: https://github.com/settings/emails
# ============================================================================
set -euo pipefail

REPO="${1:-}"
NEW_EMAIL="${2:-}"
NEW_NAME="${3:-}"

if [ -z "$REPO" ] || [ -z "$NEW_EMAIL" ] || [ -z "$NEW_NAME" ]; then
  echo "Использование: $0 <путь-к-репозиторию> <noreply-email> <имя-в-коммитах>" >&2
  echo "Пример:        $0 ~/src/Info \"123456+LOGIN@users.noreply.github.com\" \"LOGIN\"" >&2
  exit 1
fi

case "$NEW_EMAIL" in
  *@users.noreply.github.com) ;;
  *) echo "Ошибка: адрес должен заканчиваться на @users.noreply.github.com" >&2; exit 1 ;;
esac

cd "$REPO"

echo ">> Репозиторий: $(pwd)"
echo ">> Почты, которые будут заменены:"
git log --all --format='%ae%n%ce' | sort -u | grep -v '@users.noreply.github.com' || true
echo

export NEW_EMAIL NEW_NAME
git filter-branch -f --env-filter '
  if [ "$GIT_AUTHOR_EMAIL" != "$NEW_EMAIL" ]; then
    export GIT_AUTHOR_NAME="$NEW_NAME"
    export GIT_AUTHOR_EMAIL="$NEW_EMAIL"
  fi
  if [ "$GIT_COMMITTER_EMAIL" != "$NEW_EMAIL" ]; then
    export GIT_COMMITTER_NAME="$NEW_NAME"
    export GIT_COMMITTER_EMAIL="$NEW_EMAIL"
  fi
' --tag-name-filter cat -- --all

echo
echo ">> Удаляю резервные ссылки и мусор:"
git for-each-ref --format='delete %(refname)' refs/original | git update-ref --stdin
git reflog expire --expire=now --all
git gc --prune=now --aggressive

echo
echo ">> Оставшиеся почты в истории:"
git log --all --format='%ae%n%ce' | sort -u

cat <<'NEXT'

Готово локально. Теперь обновите GitHub (force-push всех веток и тегов):

    git push origin --all --force
    git push origin --tags --force

И на будущее, чтобы утечка не вернулась:

    git config --global user.name  "ВАШ_НИК"
    git config --global user.email "ВАШ_NOREPLY@users.noreply.github.com"

На GitHub включите: Settings → Emails →
  «Keep my email addresses private» и
  «Block command line pushes that expose my email».
NEXT
