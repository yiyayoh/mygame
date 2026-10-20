"""静态检查 WebGAL 剧本：标签跳转、场景切换、素材引用是否都存在。

用法：python3 scripts/check_scenes.py   （有错误时退出码为 1）
"""
import re
import sys
from pathlib import Path

GAME = Path(__file__).resolve().parent.parent / "game"
SCENE_DIR = GAME / "scene"

ASSET_DIRS = {
    "changeBg": "background",
    "unlockCg": "background",
    "changeFigure": "figure",
    "miniAvatar": "figure",
    "bgm": "bgm",
    "unlockBgm": "bgm",
    "playEffect": "vocal",
}


def statements(text):
    """按行拆分语句，去掉注释与空行，返回 (行号, 指令, 内容, 参数串)。"""
    for no, raw in enumerate(text.splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith(";"):
            continue
        line = line.split(";", 1)[0]
        head, sep, body = line.partition(":")
        if not sep:
            yield no, None, head, ""
            continue
        content, _, args = body.partition(" -")
        yield no, head.strip(), content.strip(), args


def check_scene(path, errors):
    text = path.read_text(encoding="utf-8")
    labels, jumps, scenes = set(), [], []
    for no, cmd, content, _ in statements(text):
        where = f"{path.name}:{no}"
        if cmd == "label":
            labels.add(content)
        elif cmd == "jumpLabel":
            jumps.append((where, content))
        elif cmd in ("changeScene", "callScene"):
            scenes.append((where, content))
        elif cmd == "choose":
            for option in content.split("|"):
                target = option.rsplit(":", 1)[-1].strip()
                (scenes if target.endswith(".txt") else jumps).append((where, target))
        elif cmd in ASSET_DIRS and content and content != "none" and "{" not in content:
            if not (GAME / ASSET_DIRS[cmd] / content).exists():
                errors.append(f"{where}: 素材不存在 {ASSET_DIRS[cmd]}/{content}")
    for where, target in jumps:
        if target not in labels:
            errors.append(f"{where}: 标签不存在 {target}")
    for where, target in scenes:
        if not (SCENE_DIR / target).exists():
            errors.append(f"{where}: 场景不存在 {target}")
    for no, raw in enumerate(text.splitlines(), 1):
        s = raw.strip()
        if s and not s.startswith(";") and not re.search(r";\s*(//.*)?$", s):
            errors.append(f"{path.name}:{no}: 语句缺少结尾分号")


def main():
    errors = []
    if not (SCENE_DIR / "start.txt").exists():
        errors.append("缺少入口场景 scene/start.txt")
    for path in sorted(SCENE_DIR.glob("*.txt")):
        check_scene(path, errors)
    config = (GAME / "config.txt").read_text(encoding="utf-8")
    m = re.search(r"Title_img:([^;]+);", config)
    if m and not (GAME / "background" / m.group(1)).exists():
        errors.append(f"config.txt: 标题图不存在 {m.group(1)}")
    for e in errors:
        print(e)
    print(f"检查完成：{len(list(SCENE_DIR.glob('*.txt')))} 个场景，{len(errors)} 个问题")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
