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
$PYTHON_PATH -m pip install lancedb openai tiktoken path rank-bm25 --break-system-packages -q 2>&1 | tail -2

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
echo ""
echo "下一步：配置 openclaw.json"
echo ""
echo "需要在 openclaw.json 中添加："
cat << 'EOF'
{
  "plugins": {
    "load": {
      "paths": ["PATH_TO_HAWK_BRIDGE"]
    },
    "allow": ["hawk-bridge"]
  }
}
EOF

echo ""
echo "将 PATH_TO_HAWK_BRIDGE 替换为: $HAWK_BRIDGE_DIR"
echo ""
echo "示例："
echo "  openclaw plugins install $HAWK_BRIDGE_DIR"
