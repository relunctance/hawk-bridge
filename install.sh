#!/bin/bash
# hawk-bridge 安装脚本
set -e

BRIDGE_DIR="$(cd "$(dirname "$0")" && pwd)"
HAWK_BRIDGE_DIR="$BRIDGE_DIR"
PYTHON_PATH="${PYTHON_PATH:-python3.12}"

echo "安装 hawk-bridge..."

# 1. 安装 npm 依赖
cd "$HAWK_BRIDGE_DIR"
if [ -f package.json ]; then
  npm install 2>&1 | tail -3
fi

# 2. 安装 Python 依赖
$PYTHON_PATH -m pip install lancedb openai tiktoken path rank-bm25 sentence-transformers --break-system-packages -q 2>&1 | tail -2

# 3. 克隆 context-hawk workspace（hawk Python 核心）
CONTEXT_HAWK_DIR="$HOME/.openclaw/workspace/context-hawk"
if [ ! -d "$CONTEXT_HAWK_DIR/hawk" ]; then
  echo "安装 context-hawk workspace..."
  if [ -d "$CONTEXT_HAWK_DIR" ]; then
    rm -rf "$CONTEXT_HAWK_DIR"
  fi
  git clone git@github.com:relunctance/context-hawk.git "$CONTEXT_HAWK_DIR" 2>&1 | tail -3
fi

# 4. 创建 hawk 符号链接
if [ ! -L "$HOME/.openclaw/hawk" ]; then
  mkdir -p "$HOME/.openclaw"
  ln -sf "$CONTEXT_HAWK_DIR/hawk" "$HOME/.openclaw/hawk"
  echo "✅ 符号链接已创建: ~/.openclaw/hawk → $CONTEXT_HAWK_DIR/hawk"
fi

# 5. Ollama 本地向量模型（可选）
echo ""
echo "检查 Ollama..."
if command -v ollama &> /dev/null; then
  echo "✅ Ollama 已安装: $(ollama --version 2>&1 | head -1)"
else
  echo "安装 Ollama..."
  curl -fsSL https://ollama.com/install.sh | sh 2>&1 | tail -5
  echo "✅ Ollama 安装完成"
fi

# 6. 下载 nomic-embed-text 向量模型（用于本地 embedding）
echo ""
echo "下载 nomic-embed-text 向量模型（用于本地向量生成）..."
OLLAMA_MODEL="${OLLAMA_EMBED_MODEL:-nomic-embed-text}"
if ollama list 2>&1 | grep -q "$OLLAMA_MODEL"; then
  echo "✅ 模型 $OLLAMA_MODEL 已存在"
else
  ollama pull "$OLLAMA_MODEL" 2>&1 | tail -5
  echo "✅ 模型 $OLLAMA_MODEL 下载完成"
fi

# 7. 初始化种子记忆
echo ""
echo "初始化记忆数据..."
cd "$HAWK_BRIDGE_DIR"
if [ -f "dist/seed.js" ]; then
  node dist/seed.js 2>&1 || echo "seed 失败（可忽略，LancerDB 可能已初始化）"
else
  echo "跳过 seed（尚未 build，请先运行 npm run build）"
fi

echo ""
echo "========================================"
echo "✅ hawk-bridge 安装完成！"
echo "========================================"
echo ""
echo "配置说明："
echo ""
echo "【方式1】Ollama 本地（免费，推荐）"
echo "  export OLLAMA_BASE_URL=http://localhost:11434"
echo "  export OLLAMA_EMBED_MODEL=nomic-embed-text"
echo ""
echo "【方式2】Jina 免费 API"
echo "  export JINA_API_KEY=你的key"
echo ""
echo "【方式3】无配置（默认 BM25-only 模式）"
echo ""
echo "启动后运行："
echo "  openclaw plugins install $HAWK_BRIDGE_DIR"
