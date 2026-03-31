#!/bin/bash
# hawk-bridge 一键安装脚本
# 用法：
#   本地:  bash /path/to/install.sh
#   远程:  bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)
set -e

# 检测是否远程执行（通过 /dev/fd 检测）
IS_REMOTE=0
if [[ ! -d "$(dirname "$0")" ]] || [[ "$(dirname "$0")" == "/dev/fd" ]] || [[ "$(dirname "$0")" == "/tmp" && "$0" == *"/dev/fd/"* ]]; then
  IS_REMOTE=1
fi

# 如果是远程执行，先 clone 到本地再跳转
if [[ "$IS_REMOTE" == "1" ]]; then
  echo "[hawk-bridge] 远程安装模式，正在克隆仓库..."
  TARGET_DIR="/tmp/hawk-bridge"
  if [[ -d "$TARGET_DIR/.git" ]]; then
    echo "[hawk-bridge] 已有本地仓库，拉取最新..."
    git -C "$TARGET_DIR" pull origin master 2>&1 | tail -3
  else
    echo "[hawk-bridge] 克隆 hawk-bridge..."
    git clone git@github.com:relunctance/hawk-bridge.git "$TARGET_DIR" 2>&1 | tail -3
  fi
  echo "[hawk-bridge] 切换到本地模式执行..."
  exec bash "$TARGET_DIR/install.sh" "$@"
  exit 0
fi

# ----- 以下为正常本地安装流程 -----
BRIDGE_DIR="$(cd "$(dirname "$0")" && pwd)"
HAWK_BRIDGE_DIR="$BRIDGE_DIR"
PYTHON_PATH="${PYTHON_PATH:-python3.12}"

echo ""
echo "=============================================="
echo "  🦅 hawk-bridge 安装向导"
echo "=============================================="
echo ""

# 1. npm 依赖
echo "[1/7] 安装 npm 依赖..."
cd "$HAWK_BRIDGE_DIR"
if [ -f package.json ]; then
  npm install 2>&1 | tail -3
fi

# 2. Python 依赖
echo "[2/7] 安装 Python 依赖..."
$PYTHON_PATH -m pip install lancedb openai tiktoken path rank-bm25 sentence-transformers --break-system-packages -q 2>&1 | tail -2

# 3. context-hawk
echo "[3/7] 安装 context-hawk workspace..."
CONTEXT_HAWK_DIR="$HOME/.openclaw/workspace/context-hawk"
if [ ! -d "$CONTEXT_HAWK_DIR/hawk" ]; then
  if [ -d "$CONTEXT_HAWK_DIR" ]; then rm -rf "$CONTEXT_HAWK_DIR"; fi
  git clone git@github.com:relunctance/context-hawk.git "$CONTEXT_HAWK_DIR" 2>&1 | tail -3
else
  echo "  ✅ context-hawk 已存在，跳过"
fi

# 4. 符号链接
echo "[4/7] 创建符号链接..."
mkdir -p "$HOME/.openclaw"
if [ ! -L "$HOME/.openclaw/hawk" ]; then
  ln -sf "$CONTEXT_HAWK_DIR/hawk" "$HOME/.openclaw/hawk"
  echo "  ✅ ~/.openclaw/hawk → $CONTEXT_HAWK_DIR/hawk"
else
  echo "  ✅ 符号链接已存在"
fi

# 5. Ollama
echo "[5/7] 检查 Ollama..."
if command -v ollama &> /dev/null; then
  echo "  ✅ Ollama 已安装: $(ollama --version 2>&1 | head -1)"
else
  echo "  📦 安装 Ollama..."
  curl -fsSL https://ollama.com/install.sh | sh 2>&1 | tail -5
  echo "  ✅ Ollama 安装完成"
fi

# 6. 向量模型
echo "[6/7] 下载 nomic-embed-text 向量模型..."
OLLAMA_MODEL="${OLLAMA_EMBED_MODEL:-nomic-embed-text}"
if ollama list 2>&1 | grep -q "$OLLAMA_MODEL"; then
  echo "  ✅ 模型 $OLLAMA_MODEL 已存在"
else
  ollama pull "$OLLAMA_MODEL" 2>&1 | tail -5
  echo "  ✅ 模型下载完成"
fi

# 7. build + seed
echo "[7/7] 构建 + 初始化记忆..."
npm run build 2>&1 | tail -3
node dist/seed.js 2>&1 || echo "  seed 已有数据，跳过"

echo ""
echo "=============================================="
echo "  ✅ hawk-bridge 安装完成！"
echo "=============================================="
echo ""
echo "启动插件："
echo "  openclaw plugins install $HAWK_BRIDGE_DIR"
echo ""
echo "Embedding 配置（三选一）："
echo ""
echo "  【Ollama 本地】 $OLLAMA_MODEL（已安装）"
echo "    export OLLAMA_BASE_URL=http://localhost:11434"
echo ""
echo "  【sentence-transformers CPU本地】"
echo "    export USE_LOCAL_EMBEDDING=1"
echo ""
echo "  【Jina 免费 API】"
echo "    export JINA_API_KEY=你的key"
echo ""
echo "  【无配置】默认 BM25-only 模式"
echo ""
