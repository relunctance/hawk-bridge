#!/bin/bash
# hawk-bridge 一键安装脚本
# 用法：
#   本地:  bash /path/to/install.sh
#   远程:  bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)
set -e

IS_REMOTE=0
if [[ ! -d "$(dirname "$0" 2>/dev/null)" ]] || [[ "$(dirname "$0")" == "/dev/fd" ]]; then
  IS_REMOTE=1
fi

if [[ "$IS_REMOTE" == "1" ]]; then
  echo "[🦅] 远程安装模式，正在克隆仓库..."
  TARGET_DIR="/tmp/hawk-bridge"
  if [[ -d "$TARGET_DIR/.git" ]]; then
    echo "[🦅] 已有本地仓库，拉取最新..."
    git -C "$TARGET_DIR" pull origin master 2>&1 | tail -3
  else
    # HTTPS 方式 clone，不依赖 SSH Key
    echo "[🦅] HTTPS 克隆 hawk-bridge..."
    git clone https://github.com/relunctance/hawk-bridge.git "$TARGET_DIR" 2>&1 | tail -3
  fi
  echo "[🦅] 切换到本地模式执行..."
  exec bash "$TARGET_DIR/install.sh" "$@"
  exit 0
fi

BRIDGE_DIR="$(cd "$(dirname "$0")" && pwd)"
HAWK_BRIDGE_DIR="$BRIDGE_DIR"
STEP=0
TOTAL_STEPS=8

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${BLUE}[$((++STEP))/$TOTAL_STEPS]${NC} $1"; }
ok()    { echo -e "${GREEN}[✅]${NC} $1"; }
warn()  { echo -e "${YELLOW}[⚠️]${NC} $1"; }
fail()  { echo -e "${RED}[❌]${NC} $1"; }

# ─── 检测发行版 ───────────────────────────────────────────────
detect_distro() {
  if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    DISTRO="$ID"
    DISTRO_LIKE="$ID_LIKE"
  else
    DISTRO="unknown"
    DISTRO_LIKE=""
  fi
}

detect_sudo() {
  if sudo -n true 2>/dev/null; then
    SUDO="sudo"
  elif [[ "$EUID" == "0" ]]; then
    SUDO=""
  else
    SUDO="sudo"
  fi
}

# ─── 安装系统包 ───────────────────────────────────────────────
install_pkg() {
  local pkg="$1"
  local label="$2"
  if command -v "$pkg" &>/dev/null; then
    ok "$label 已安装: $(command -v $pkg)"
    return 0
  fi
  info "安装 $label..."
  case "$DISTRO" in
    debian|ubuntu|linuxmint|pop)
      $SUDO apt-get install -y "$pkg" 2>&1 | tail -3
      ;;
    fedora|rhel|centos|rocky|alma)
      $SUDO dnf install -y "$pkg" 2>&1 | tail -3
      ;;
    arch|manjaro|endeavouros)
      $SUDO pacman -Sy --noconfirm "$pkg" 2>&1 | tail -3
      ;;
    alpine)
      $SUDO apk add --no-cache "$pkg" 2>&1 | tail -3
      ;;
    opensuse|suse|sles)
      $SUDO zypper install -y "$pkg" 2>&1 | tail -3
      ;;
    void)
      $SUDO xbps-install -y "$pkg" 2>&1 | tail -3
      ;;
    *)
      if command -v apt-get &>/dev/null; then
        $SUDO apt-get install -y "$pkg" 2>&1 | tail -3
      elif command -v dnf &>/dev/null; then
        $SUDO dnf install -y "$pkg" 2>&1 | tail -3
      elif command -v yum &>/dev/null; then
        $SUDO yum install -y "$pkg" 2>&1 | tail -3
      elif command -v pacman &>/dev/null; then
        $SUDO pacman -Sy --noconfirm "$pkg" 2>&1 | tail -3
      else
        fail "不支持当前系统 ($DISTRO)，请手动安装 $pkg"
        return 1
      fi
      ;;
  esac
  ok "$label 安装完成"
}

# ─── 检测 Python 版本（兼容 3.10~3.13）─────────────────────────
detect_python() {
  for py in python3.13 python3.12 python3.11 python3.10 python3; do
    if command -v "$py" &>/dev/null; then
      PYTHON_PATH="$py"
      PYTHON_VERSION=$($py --version 2>&1 | tr -d 'Python ')
      # 检查 pip 是否可用
      if $py -m pip --version &>/dev/null; then
        ok "Python: $PYTHON_VERSION (pip 可用)"
        return 0
      else
        # pip 不存在，尝试安装
        $SUDO $py -m ensurepip --default-pip 2>&1 | tail -2 || true
        if $py -m pip --version &>/dev/null; then
          ok "Python: $PYTHON_VERSION (pip 已安装)"
          return 0
        fi
      fi
    fi
  done
  fail "未找到 Python3，请先安装 Python 3.10+"
  return 1
}

# ─── 检测 Node.js ─────────────────────────────────────────────
detect_nodejs() {
  if command -v node &>/dev/null; then
    NODE_VER=$(node -v | tr -d 'v')
    if [[ "$(echo $NODE_VER | cut -d. -f1)" -ge 18 ]]; then
      ok "Node.js: $(node --version)"
      return 0
    fi
  fi
  info "安装 Node.js 18+..."
  case "$DISTRO" in
    debian|ubuntu|linuxmint|pop)
      curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO bash - 2>&1 | tail -3
      $SUDO apt-get install -y nodejs 2>&1 | tail -3
      ;;
    alpine)
      $SUDO apk add --no-cache nodejs npm
      ;;
    arch|manjaro|endeavouros)
      $SUDO pacman -Sy --noconfirm nodejs npm 2>&1 | tail -3
      ;;
    fedora|rhel|centos|rocky|alma)
      $SUDO dnf install -y nodejs npm 2>&1 | tail -3
      ;;
    *)
      if command -v apt-get &>/dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO bash - 2>&1 | tail -3
        $SUDO apt-get install -y nodejs 2>&1 | tail -3
      fi
      ;;
  esac
  ok "Node.js: $(node --version)"
}

# ─── Ollama 可选安装 ─────────────────────────────────────────
install_ollama_optional() {
  if [[ "$INSTALL_OLLAMA" != "1" ]]; then
    ok "跳过 Ollama（使用 Jina 免费 API，无需本地模型）"
    return 0
  fi

  if command -v ollama &>/dev/null; then
    ok "Ollama 已安装: $(ollama --version 2>&1 | head -1)"
  else
    info "安装 Ollama（可选）..."
    curl -fsSL https://ollama.com/install.sh | sh 2>&1 | tail -5
    ok "Ollama 安装完成"
  fi

  OLLAMA_MODEL="${OLLAMA_EMBED_MODEL:-nomic-embed-text}"
  if ollama list 2>&1 | grep -q "$OLLAMA_MODEL"; then
    ok "模型 $OLLAMA_MODEL 已存在"
  else
    info "下载 Embedding 模型 $OLLAMA_MODEL（~274MB）..."
    ollama pull "$OLLAMA_MODEL" 2>&1 | tail -5
    ok "模型 $OLLAMA_MODEL 下载完成"
  fi
}

# ─── 健康检查 ─────────────────────────────────────────────────
run_health_check() {
  echo ""
  info "运行健康检查..."
  local errors=0

  # Python import
  if $PYTHON_PATH -c "from hawk.memory import MemoryManager; print('ok')" 2>/dev/null; then
    ok "hawk Python 模块可导入"
  else
    fail "hawk Python 模块导入失败"
    ((errors++))
  fi

  # rank-bm25
  if $PYTHON_PATH -c "import rank_bm25; print('ok')" 2>/dev/null; then
    ok "rank-bm25 已安装"
  else
    fail "rank-bm25 未安装，请运行: $PYTHON_PATH -m pip install rank-bm25 --break-system-packages"
    ((errors++))
  fi

  # LanceDB
  if $PYTHON_PATH -c "import lancedb; print('ok')" 2>/dev/null; then
    ok "LanceDB 已安装"
  else
    fail "LanceDB 未安装，请运行: $PYTHON_PATH -m pip install lancedb --break-system-packages"
    ((errors++))
  fi

  # npm build
  if [[ -f "$HAWK_BRIDGE_DIR/dist/index.js" ]]; then
    ok "hawk-bridge 已构建"
  else
    warn "hawk-bridge 尚未构建，请运行: cd $HAWK_BRIDGE_DIR && npm run build"
  fi

  # 符号链接
  if [[ -L "$HOME/.openclaw/hawk" ]]; then
    TARGET=$(readlink -f "$HOME/.openclaw/hawk" 2>/dev/null || echo "broken")
    ok "符号链接 ~/.openclaw/hawk → $TARGET"
  else
    warn "符号链接不存在: ~/.openclaw/hawk"
  fi

  echo ""
  if [[ $errors -eq 0 ]]; then
    ok "健康检查通过！所有依赖就绪。"
  else
    warn "健康检查发现 $errors 个问题，请根据上述提示修复。"
  fi
}

# ─── 主流程 ───────────────────────────────────────────────────
main() {
  echo ""
  echo "=========================================="
  echo "  🦅 hawk-bridge 安装向导"
  echo "=========================================="
  echo ""

  detect_distro
  detect_sudo

  info "检测到系统: $DISTRO"
  [[ -n "$DISTRO_LIKE" ]] && info "基于: $DISTRO_LIKE"

  # 1. 系统依赖
  echo ""
  info "检查系统依赖..."
  detect_nodejs
  detect_python || exit 1
  install_pkg git "Git"
  install_pkg curl "curl"

  # 2. npm 依赖
  echo ""
  info "安装 npm 依赖..."
  cd "$HAWK_BRIDGE_DIR"
  npm install 2>&1 | tail -3
  ok "npm 依赖安装完成"

  # 3. Python 依赖
  echo ""
  info "安装 Python 依赖..."
  PIP="$PYTHON_PATH -m pip"
  $PIP install --break-system-packages -q lancedb openai rank-bm25 2>&1 | tail -2
  ok "Python 依赖安装完成"

  # 4. context-hawk（通过 HTTPS clone）
  echo ""
  info "安装 context-hawk（Python 记忆引擎）..."
  CONTEXT_HAWK_DIR="$HOME/.openclaw/workspace/context-hawk"
  if [[ ! -d "$CONTEXT_HAWK_DIR/hawk" ]]; then
    # HTTPS clone，不依赖 SSH
    git clone https://github.com/relunctance/context-hawk.git "$CONTEXT_HAWK_DIR" 2>&1 | tail -3
    ok "context-hawk 克隆完成"
  else
    git -C "$CONTEXT_HAWK_DIR" pull origin master 2>&1 | tail -2
    ok "context-hawk 已存在，已更新"
  fi

  # 5. 符号链接
  echo ""
  info "创建符号链接..."
  mkdir -p "$HOME/.openclaw"
  if [[ ! -L "$HOME/.openclaw/hawk" ]]; then
    ln -sf "$CONTEXT_HAWK_DIR/hawk" "$HOME/.openclaw/hawk"
  fi
  ok "~/.openclaw/hawk → $CONTEXT_HAWK_DIR/hawk"

  # 6. Ollama（可选）
  echo ""
  info "处理 Ollama（可选）..."
  install_ollama_optional

  # 7. 构建 + 初始化
  echo ""
  info "构建 hawk-bridge..."
  npm run build 2>&1 | tail -3
  ok "构建完成"

  echo ""
  info "初始化种子记忆..."
  node dist/seed.js 2>&1 | tail -2 || ok "记忆已有数据，跳过"

  # 8. 注册插件
  echo ""
  info "注册 hawk-bridge 到 OpenClaw..."
  if command -v openclaw &>/dev/null; then
    openclaw plugins install "$HAWK_BRIDGE_DIR" 2>&1 | tail -5
    ok "hawk-bridge 插件已注册"
  else
    warn "openclaw 命令未找到，请手动运行:"
    echo "    openclaw plugins install $HAWK_BRIDGE_DIR"
    echo "    openclaw gateway restart"
  fi

  # 健康检查
  run_health_check

  # 完成
  echo ""
  echo "=========================================="
  echo "  ✅ 安装完成！"
  echo "=========================================="
  echo ""
  echo "立即体验（开箱即用，默认 Jina 免费 API）："
  echo "  openclaw gateway restart"
  echo ""
  echo "可选：配置 Ollama 本地 GPU 加速（需要 GPU 机器）："
  echo "  INSTALL_OLLAMA=1 bash $HAWK_BRIDGE_DIR/install.sh"
  echo ""
  echo "卸载方法："
  echo "  openclaw plugins uninstall hawk-bridge"
  echo "  rm -rf ~/.openclaw/hawk ~/.hawk"
  echo "  rm -rf $CONTEXT_HAWK_DIR"
  echo ""
}

main "$@"
