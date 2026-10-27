#!/bin/sh
# 一键提交并推送：sh scripts/sync.sh "提交说明"
#
# 做三件事：暂存全部改动 → 有改动才提交 → 推送到 origin 并校验远程是否追平。
# 最后会打印远程 HEAD，如果和本地不一致就明确报错（不再静默失败）。

set -e

cd "$(git rev-parse --show-toplevel)"

MSG="$1"

if [ -z "$MSG" ]; then
  echo "用法: sh scripts/sync.sh \"提交说明\""
  exit 1
fi

git add -A

if git diff --cached --quiet; then
  echo "没有需要提交的改动，直接检查远程状态…"
else
  git commit -q -m "$MSG"
  echo "已提交 $(git rev-parse --short HEAD)"
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "推送到 origin/$BRANCH …"
git push origin "$BRANCH"

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git ls-remote origin "refs/heads/$BRANCH" | awk '{print $1}')"

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "同步完成：origin/$BRANCH 已是 $(echo "$LOCAL" | cut -c1-7)"
else
  echo "推送失败：本地 $(echo "$LOCAL" | cut -c1-7) ≠ 远程 $(echo "$REMOTE" | cut -c1-7)" >&2
  exit 1
fi
