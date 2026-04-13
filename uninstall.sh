#!/bin/bash
# hawk-bridge 一键卸载脚本
# 用法：
#   本地:  bash /path/to/uninstall.sh
#   远程:  bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/uninstall.sh)
set -e

IS_REMOTE=0
if [[ ! -d "$(dirname "$0" 2>/dev/null)" ]] || [[ "$(dirname "$0")" == "/dev/fd" ]]; then
  IS_REMOTE=1
fi

if [[ "$IS_REMOTE" == "1" ]]; then
  echo "[🦅] 远程卸载模式，正在克隆仓库..."
  TARGET_DIR="/tmp/hawk-bridge"
  if [[ -d "$TARGET_DIR/.git" ]]; then
    echo "[🦅] 已有本地仓库，拉取最新..."
    git -C "$TARGET_DIR" pull origin master 2>&1 | tail -3
  else
    git clone https://github.com/relunctance/hawk-bridge.git "$TARGET_DIR" 2>&1 | tail -3
  fi
  echo "[🦅] 切换到本地模式执行..."
  exec bash "$TARGET_DIR/uninstall.sh" "$@"
  exit 0
fi

BRIDGE_DIR="$(cd "$(dirname "$0")" && pwd)"
STEP=0
TOTAL_STEPS=8

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${BLUE}[$((++STEP))/$TOTAL_STEPS]${NC} $1"; }
ok()    { echo -e "${GREEN}[✅]${NC} $1"; }
warn()  { echo -e "${YELLOW}[⚠️]${NC} $1"; }
fail()  { echo -e "${RED}[❌]${NC} $1"; }

# ─── 确认警告 ───────────────────────────────────────────────
confirm() {
  echo ""
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${RED}  ⚠️  即将卸载 hawk-bridge 及所有相关数据${NC}"
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo "  将执行以下操作："
  echo "  1. 取消注册 OpenClaw 插件"
  echo "  2. 删除符号链接 ~/.openclaw/hawk"
  echo "  3. 删除 hawk-bridge 数据 ~/.hawk/"
  echo "  4. 删除 context-hawk 仓库 ~/.openclaw/workspace/context-hawk"
  echo "  5. 删除 hawk-bridge 构建产物（可选）"
  echo ""
  echo -n "  确认卸载？此操作不可逆 (y/N): "
  read -r answer
  if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
    echo "  取消卸载。"
    exit 0
  fi
}

# ─── 卸载 OpenClaw 插件 ────────────────────────────────────
unregister_plugin() {
  echo ""
  info "取消注册 OpenClaw 插件..."
  if command -v openclaw &>/dev/null; then
    if openclaw plugins list 2>/dev/null | grep -q "hawk-bridge"; then
      openclaw plugins uninstall hawk-bridge 2>&1 | tail -3 && ok "插件已取消注册" || warn "插件卸载命令失败"
    else
      ok "插件未注册，跳过"
    fi
  else
    warn "openclaw 命令未找到，跳过插件注销"
  fi
}

# ─── 删除符号链接 ──────────────────────────────────────────
remove_symlink() {
  echo ""
  info "删除符号链接..."
  if [[ -L "$HOME/.openclaw/hawk" ]]; then
    rm -f "$HOME/.openclaw/hawk"
    ok "~/.openclaw/hawk 已删除"
  else
    ok "符号链接不存在，跳过"
  fi
}

# ─── 删除 hawk-bridge 数据 ──────────────────────────────────
remove_hawk_data() {
  echo ""
  info "删除 hawk-bridge 数据..."
  if [[ -d "$HOME/.hawk" ]]; then
    rm -rf "$HOME/.hawk"
    ok "~/.hawk/ 已删除"
  else
    ok "数据目录不存在，跳过"
  fi
}

# ─── 删除 context-hawk ──────────────────────────────────────
remove_context_hawk() {
  echo ""
  info "删除 context-hawk..."
  if [[ -d "$HOME/.openclaw/workspace/context-hawk" ]]; then
    rm -rf "$HOME/.openclaw/workspace/context-hawk"
    ok "~/.openclaw/workspace/context-hawk 已删除"
  else
    ok "context-hawk 不存在，跳过"
  fi
}

# ─── 删除 hawk-bridge 构建产物 ──────────────────────────────
remove_bridge_build() {
  echo ""
  info "删除 hawk-bridge 构建产物..."
  if [[ -d "$BRIDGE_DIR/node_modules" ]]; then
    rm -rf "$BRIDGE_DIR/node_modules"
    ok "node_modules 已删除"
  else
    ok "node_modules 不存在，跳过"
  fi

  if [[ -d "$BRIDGE_DIR/dist" ]]; then
    rm -rf "$BRIDGE_DIR/dist"
    ok "dist/ 已删除"
  else
    ok "dist/ 不存在，跳过"
  fi
}

# ─── 清理 Python 包（可选）──────────────────────────────────
remove_python_deps() {
  echo ""
  info "清理 Python 依赖（可选）..."
  echo -n "  是否删除 Python 包（lancedb/rank-bm25/openai）？(y/N): "
  read -r answer
  if [[ "$answer" == "y" || "$answer" == "Y" ]]; then
    for py in python3.13 python3.12 python3.11 python3.10 python3; do
      if command -v "$py" &>/dev/null; then
        $py -m pip uninstall -y lancedb rank-bm25 openai 2>&1 | grep -E "(Successfully|not installed)" || true
        ok "Python 依赖已清理"
        break
      fi
    done
  else
    ok "跳过 Python 依赖清理（可手动清理）"
  fi
}

# ─── 清理 Ollama（可选）─────────────────────────────────────
remove_ollama() {
  echo ""
  info "处理 Ollama（可选）..."
  echo -n "  是否同时卸载 Ollama（本地的 ollama 命令）？(y/N): "
  read -r answer
  if [[ "$answer" == "y" || "$answer" == "Y" ]]; then
    if command -v ollama &>/dev/null; then
      if [[ "$OSTYPE" == "darwin"* ]]; then
        brew uninstall ollama 2>&1 | tail -2 && ok "Ollama 已卸载" || warn "Ollama 卸载失败"
      else
        $SUDO rm -rf /usr/local/bin/ollama /usr/local/bin/ollama 2>/dev/null || true
        $SUDO rm -rf /etc/systemd/system/ollama.service 2>/dev/null || true
        rm -rf "$HOME/.ollama"
        ok "Ollama 已卸载"
      fi
    else
      ok "Ollama 未安装，跳过"
    fi
  else
    ok "跳过 Ollama 卸载"
  fi
}

# ─── 最终检查 ───────────────────────────────────────────────
final_check() {
  echo ""
  echo "=========================================="
  echo "  🦅 卸载完成！"
  echo "=========================================="
  echo ""
  echo "  已清理："
  echo "  ✅ OpenClaw 插件已注销"
  echo "  ✅ ~/.openclaw/hawk 符号链接已删除"
  echo "  ✅ ~/.hawk/ 数据已删除"
  echo "  ✅ context-hawk 已删除"
  echo "  ✅ node_modules / dist 构建产物已删除"
  echo ""

  remaining=""
  [[ -L "$HOME/.openclaw/hawk" ]] && remaining="$remaining ~/.openclaw/hawk"
  [[ -d "$HOME/.hawk" ]] && remaining="$remaining ~/.hawk"
  [[ -d "$HOME/.openclaw/workspace/context-hawk" ]] && remaining="$remaining ~/.openclaw/workspace/context-hawk"

  if [[ -n "$remaining" ]]; then
    warn "以下目录可能未清理干净，请手动检查："
    echo "  $remaining"
    echo ""
  else
    ok "所有组件已清理干净！"
  fi

  echo "  如需重新安装："
  echo "  bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)"
  echo ""
}

# ─── 主流程 ─────────────────────────────────────────────────
main() {
  echo ""
  echo "=========================================="
  echo "  🦅 hawk-bridge 卸载向导"
  echo "=========================================="
  echo ""

  confirm
  unregister_plugin
  remove_symlink
  remove_hawk_data
  remove_context_hawk
  remove_bridge_build
  remove_python_deps
  remove_ollama
  final_check
}

main "$@"
