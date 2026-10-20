#!/usr/bin/env bash
# 拉取 WebGAL 引擎、同步 game/ 目录、本地运行或打包。
#   ./scripts/webgal.sh setup   首次使用：下载引擎并安装依赖
#   ./scripts/webgal.sh dev     同步剧本素材并启动本地预览（http://localhost:3000）
#   ./scripts/webgal.sh build   同步并打包，产物在 engine/packages/webgal/dist
set -euo pipefail

WEBGAL_VERSION="${WEBGAL_VERSION:-4.6.6}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENGINE="$ROOT/engine"
PUBLIC_GAME="$ENGINE/packages/webgal/public/game"

setup() {
  if [ ! -d "$ENGINE" ]; then
    git clone --depth 1 --branch "$WEBGAL_VERSION" https://github.com/OpenWebGAL/WebGAL "$ENGINE"
  fi
  (cd "$ENGINE" && yarn install --frozen-lockfile && yarn parser:build)
}

# 用本仓库的 game/ 覆盖引擎自带的示例游戏，保留引擎的 animation/、template/ 等默认资源
sync_game() {
  [ -d "$ENGINE" ] || { echo "请先运行: $0 setup" >&2; exit 1; }
  python3 "$ROOT/scripts/check_scenes.py"
  rm -rf "$PUBLIC_GAME"/{scene,background,figure,bgm,vocal,video} "$PUBLIC_GAME"/config.txt "$PUBLIC_GAME"/flowchart.json
  cp -R "$ROOT/game/." "$PUBLIC_GAME/"
}

case "${1:-}" in
  setup) setup ;;
  dev) sync_game; (cd "$ENGINE" && yarn webgal:dev) ;;
  build) sync_game; (cd "$ENGINE" && yarn webgal:build); echo "打包完成: $ENGINE/packages/webgal/dist" ;;
  *) echo "用法: $0 {setup|dev|build}"; exit 1 ;;
esac
