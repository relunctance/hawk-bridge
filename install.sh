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
$PYTHON_PATH -m pip install lancedb openai -q 2>&1 | tail -2

# 3. 注册到 openclaw.json
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
