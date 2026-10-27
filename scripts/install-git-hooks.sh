#!/bin/sh
# 安装 git 钩子：每次 commit 后自动 push 到 origin
#
# 为什么需要它：手动 push 在非交互环境下失败是「静默」的（网络抖动、凭证失效都只
# 打一行报错就过去了），代码看起来提交了，实际远程还是旧的。钩子把推送绑定到
# commit 动作上，并把每次结果写进 .git/push.log，失败不再无声。
#
# 用法（在项目根目录执行一次即可）：
#   sh scripts/install-git-hooks.sh

set -e

cd "$(git rev-parse --show-toplevel)"

HOOK_DIR=".git/hooks"
mkdir -p "$HOOK_DIR"

cat > "$HOOK_DIR/post-commit" <<'HOOK'
#!/bin/sh
# 自动推送到 origin —— 提交成功即推送，失败只记日志，不影响提交本身
REPO_DIR="$(git rev-parse --show-toplevel)"
LOG="$REPO_DIR/.git/push.log"
STAMP="$(date '+%Y-%m-%d %H:%M:%S')"

if [ -z "$(git remote)" ]; then
  echo "$STAMP SKIP 没有配置远程仓库" >> "$LOG"
  exit 0
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
SHORT="$(git rev-parse --short HEAD)"

if OUT=$(git push origin "$BRANCH" 2>&1); then
  echo "$STAMP OK   $SHORT -> origin/$BRANCH" >> "$LOG"
else
  echo "$STAMP FAIL $SHORT -> origin/$BRANCH" >> "$LOG"
  echo "$OUT" | sed 's/^/       /' >> "$LOG"
fi

exit 0
HOOK

chmod +x "$HOOK_DIR/post-commit"
echo "已安装 .git/hooks/post-commit（提交后自动推送，日志在 .git/push.log）"
