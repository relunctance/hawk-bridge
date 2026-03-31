#!/bin/bash
# hawk-bridge 一键安装脚本
# 用法：
#   本地:  bash /path/to/install.sh
#   远程:  bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)
set -e

# ============================================================
# 远程执行检测 & 本地 clone
# ============================================================
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
    echo "[🦅] 克隆 hawk-bridge..."
    git clone git@github.com:relunctance/hawk-bridge.git "$TARGET_DIR" 2>&1 | tail -3
  fi
  echo "[🦅] 切换到本地模式执行..."
  exec bash "$TARGET_DIR/install.sh" "$@"
  exit 0
fi

BRIDGE_DIR="$(cd "$(dirname "$0")" && pwd)"
HAWK_BRIDGE_DIR="$BRIDGE_DIR"
PYTHON_PATH="${PYTHON_PATH:-python3.12}"

# ============================================================
# 彩色输出
# ============================================================
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[✅]${NC} $1"; }
warn()  { echo -e "${YELLOW}[⚠️]${NC} $1"; }
fail()  { echo -e "${RED}[❌]${NC} $1"; }

# ============================================================
# 系统环境检测
# ============================================================
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

# 检测 sudo 可用性
detect_sudo() {
  if sudo -n true 2>/dev/null; then
    SUDO="sudo"
  elif [[ "$EUID" == "0" ]]; then
    SUDO=""
  else
    SUDO="sudo"
  fi
}

# ============================================================
# 系统依赖安装（跨 Linux 发行版）
# ============================================================
install_system_dep() {
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
    opensuse|suse|sles)
      $SUDO zypper install -y "$pkg" 2>&1 | tail -3
      ;;
    alpine)
      $SUDO apk add --no-cache "$pkg" 2>&1 | tail -3
      ;;
    void)
      $SUDO xbps-install -y "$pkg" 2>&1 | tail -3
      ;;
    *)
      # fallback: 尝试直接安装
      if command -v apt-get &>/dev/null; then
        $SUDO apt-get install -y "$pkg" 2>&1 | tail -3
      elif command -v dnf &>/dev/null; then
        $SUDO dnf install -y "$pkg" 2>&1 | tail -3
      elif command -v yum &>/dev/null; then
        $SUDO yum install -y "$pkg" 2>&1 | tail -3
      elif command -v pacman &>/dev/null; then
        $SUDO pacman -Sy --noconfirm "$pkg" 2>&1 | tail -3
      else
        fail "无法安装 $pkg，不支持当前系统 ($DISTRO)"
        return 1
      fi
      ;;
  esac
  ok "$label 安装完成"
}

# 安装 Node.js（跨发行版）
install_nodejs() {
  if command -v node &>/dev/null; then
    ok "Node.js 已安装: $(node --version)"
    return 0
  fi

  info "安装 Node.js..."

  # 先尝试用包管理器装（最快）
  case "$DISTRO" in
    debian|ubuntu|linuxmint|pop)
      $SUDO apt-get install -y nodejs npm 2>&1 | tail -3
      ;;
    fedora|rhel|centos|rocky|alma)
      $SUDO dnf install -y nodejs npm 2>&1 | tail -3
      ;;
    alpine)
      $SUDO apk add --no-cache nodejs npm 2>&1 | tail -3
      ;;
    arch|manjaro|endeavouros)
      $SUDO pacman -Sy --noconfirm nodejs npm 2>&1 | tail -3
      ;;
  esac

  # 如果包管理器版本太老，用 NodeSource
  if ! command -v node &>/dev/null || [[ "$(node -v 2>/dev/null | tr -d 'v')" < "18" ]]; then
    info "系统 Node.js 版本过低或不存在，使用 NodeSource 安装..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO bash - 2>&1 | tail -5
    $SUDO apt-get install -y nodejs 2>&1 | tail -3
  fi

  ok "Node.js 安装完成: $(node --version)"
}

# 安装 Python/pip
install_python() {
  if command -v python3 &>/dev/null; then
    ok "Python3 已安装: $(python3 --version)"
  else
    case "$DISTRO" in
      debian|ubuntu|linuxmint|pop)
        $SUDO apt-get install -y python3 python3-pip python3-venv 2>&1 | tail -3
        ;;
      fedora|rhel|centos|rocky|alma)
        $SUDO dnf install -y python3 python3-pip 2>&1 | tail -3
        ;;
      alpine)
        $SUDO apk add --no-cache python3 py3-pip 2>&1 | tail -3
        ;;
      arch|manjaro|endeavouros)
        $SUDO pacman -Sy --noconfirm python python-pip 2>&1 | tail -3
        ;;
      *)
        fail "无法安装 Python3，不支持当前系统"
        return 1
        ;;
    esac
    ok "Python3 安装完成"
  fi

  # 确保 pip 可用
  if ! command -v pip3 &>/dev/null; then
    $SUDO apt-get install -y python3-pip 2>&1 | tail -3
  fi
}

# ============================================================
# 主安装流程
# ============================================================
main() {
  echo ""
  echo "=================================================="
  echo "  🦅 hawk-bridge 一键安装向导"
  echo "=================================================="
  echo ""

  detect_distro
  detect_sudo
  info "检测到系统: $DISTRO (like: ${DISTRO_LIKE:-none})"

  # Step 1: 系统依赖
  echo ""
  echo "--- Step 1: 检查系统依赖 ---"
  install_nodejs
  install_python
  if ! command -v git &>/dev/null; then
    install_system_dep git "Git"
  else
    ok "Git 已安装: $(git --version)"
  fi
  if ! command -v curl &>/dev/null; then
    install_system_dep curl "curl"
  else
    ok "curl 已安装"
  fi

  # Step 2: npm 依赖
  echo ""
  echo "--- Step 2: 安装 npm 依赖 ---"
  cd "$HAWK_BRIDGE_DIR"
  if [ -f package.json ]; then
    npm install 2>&1 | tail -3
    ok "npm 依赖安装完成"
  fi

  # Step 3: Python 依赖
  echo ""
  echo "--- Step 3: 安装 Python 依赖 ---"
  $PYTHON_PATH -m pip install lancedb openai tiktoken path rank-bm25 sentence-transformers --break-system-packages -q 2>&1 | tail -2
  ok "Python 依赖安装完成"

  # Step 4: context-hawk
  echo ""
  echo "--- Step 4: 安装 context-hawk workspace ---"
  CONTEXT_HAWK_DIR="$HOME/.openclaw/workspace/context-hawk"
  if [ ! -d "$CONTEXT_HAWK_DIR/hawk" ]; then
    if [ -d "$CONTEXT_HAWK_DIR" ]; then rm -rf "$CONTEXT_HAWK_DIR"; fi
    git clone git@github.com:relunctance/context-hawk.git "$CONTEXT_HAWK_DIR" 2>&1 | tail -3
    ok "context-hawk 克隆完成"
  else
    git -C "$CONTEXT_HAWK_DIR" pull origin master 2>&1 | tail -2
    ok "context-hawk 已存在，已更新"
  fi

  # Step 5: 符号链接
  echo ""
  echo "--- Step 5: 创建符号链接 ---"
  mkdir -p "$HOME/.openclaw"
  if [ ! -L "$HOME/.openclaw/hawk" ]; then
    ln -sf "$CONTEXT_HAWK_DIR/hawk" "$HOME/.openclaw/hawk"
  fi
  ok "~/.openclaw/hawk → $CONTEXT_HAWK_DIR/hawk"

  # Step 6: Ollama
  echo ""
  echo "--- Step 6: 安装 Ollama ---"
  if command -v ollama &>/dev/null; then
    ok "Ollama 已安装: $(ollama --version 2>&1 | head -1)"
  else
    info "安装 Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh 2>&1 | tail -5
    ok "Ollama 安装完成"
  fi

  echo ""
  echo "--- Step 6b: 下载向量模型 ---"
  OLLAMA_MODEL="${OLLAMA_EMBED_MODEL:-nomic-embed-text}"
  if ollama list 2>&1 | grep -q "$OLLAMA_MODEL"; then
    ok "模型 $OLLAMA_MODEL 已存在"
  else
    ollama pull "$OLLAMA_MODEL" 2>&1 | tail -5
    ok "模型 $OLLAMA_MODEL 下载完成"
  fi

  # Step 7: build + seed
  echo ""
  echo "--- Step 7: 构建 + 初始化记忆 ---"
  npm run build 2>&1 | tail -3
  node dist/seed.js 2>&1 || ok "记忆已有数据，跳过"
  ok "构建完成"

  # 完成
  echo ""
  echo "=================================================="
  echo "  ✅ hawk-bridge 安装完成！"
  echo "=================================================="
  echo ""
  echo "启动插件："
  echo "  openclaw plugins install $HAWK_BRIDGE_DIR"
  echo ""
  echo "Embedding 配置（三选一）："
  echo ""
  echo "  ① Ollama 本地（推荐，已安装）"
  echo "     export OLLAMA_BASE_URL=http://localhost:11434"
  echo ""
  echo "  ② sentence-transformers CPU本地"
  echo "     export USE_LOCAL_EMBEDDING=1"
  echo ""
  echo "  ③ Jina 免费 API"
  echo "     export JINA_API_KEY=你的key"
  echo ""
  echo "  ④ 无配置（默认 BM25-only 模式）"
  echo ""
}

main "$@"
