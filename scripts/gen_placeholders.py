"""生成占位背景图。（角色立绘见 scripts/sprites/）

正式美术到位后，直接用同名文件覆盖 game/background 下的图片即可，
脚本无需改动。用法：python3 scripts/gen_placeholders.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
BG_DIR = ROOT / "game" / "background"

BG_SIZE = (1920, 1080)
SS = 2  # 超采样倍数，让线条边缘更平滑

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "C:/Windows/Fonts/msyh.ttc",
    "/System/Library/Fonts/PingFang.ttc",
]


def font(size):
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def gradient(size, top, bottom):
    w, h = size
    img = Image.new("RGB", size)
    draw = ImageDraw.Draw(img)
    for y in range(h):
        t = y / (h - 1)
        color = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        draw.line([(0, y), (w, y)], fill=color)
    return img


def label(img, text):
    draw = ImageDraw.Draw(img)
    f = font(36)
    draw.rounded_rectangle([30, 30, 60 + draw.textlength(text, font=f), 96], 12, fill=(0, 0, 0, 140))
    draw.text((45, 40), text, font=f, fill=(255, 255, 255))


def save_bg(img, name, text):
    img = img.resize(BG_SIZE, Image.LANCZOS)
    label(img, f"占位背景 · {text}")
    img.save(BG_DIR / name, optimize=True)


# ---------- 背景 ----------

def bg_title():
    w, h = BG_SIZE[0] * SS, BG_SIZE[1] * SS
    img = gradient((w, h), (38, 32, 74), (238, 140, 120))
    d = ImageDraw.Draw(img)
    # 旧校舍剪影
    d.rectangle([w * 0.18, h * 0.42, w * 0.82, h], fill=(30, 26, 48))
    for row in range(3):
        for col in range(7):
            x0 = w * 0.22 + col * w * 0.083
            y0 = h * 0.48 + row * h * 0.16
            lit = row == 0 and col == 6  # 第七间教室亮着灯
            d.rectangle([x0, y0, x0 + w * 0.05, y0 + h * 0.09],
                        fill=(255, 214, 120) if lit else (52, 48, 78))
    img = img.resize(BG_SIZE, Image.LANCZOS)
    d = ImageDraw.Draw(img)
    f = font(120)
    title = "第七间教室"
    tw = d.textlength(title, font=f)
    d.text(((BG_SIZE[0] - tw) / 2 + 4, 154), title, font=f, fill=(20, 16, 40))
    d.text(((BG_SIZE[0] - tw) / 2, 150), title, font=f, fill=(255, 246, 230))
    sub = "The Seventh Classroom"
    fs = font(40)
    d.text(((BG_SIZE[0] - d.textlength(sub, font=fs)) / 2, 300), sub, font=fs, fill=(255, 230, 210))
    img.save(BG_DIR / "title.png", optimize=True)


def bg_gate():
    w, h = BG_SIZE[0] * SS, BG_SIZE[1] * SS
    img = gradient((w, h), (150, 200, 245), (250, 236, 240))
    d = ImageDraw.Draw(img)
    d.rectangle([0, h * 0.72, w, h], fill=(196, 188, 176))
    d.rectangle([w * 0.25, h * 0.30, w * 0.75, h * 0.72], fill=(236, 230, 220))
    for col in range(8):
        x0 = w * 0.28 + col * w * 0.058
        for row in range(3):
            y0 = h * 0.36 + row * h * 0.11
            d.rectangle([x0, y0, x0 + w * 0.035, y0 + h * 0.06], fill=(160, 190, 220))
    d.rectangle([w * 0.08, h * 0.40, w * 0.11, h * 0.75], fill=(120, 110, 100))
    d.rectangle([w * 0.89, h * 0.40, w * 0.92, h * 0.75], fill=(120, 110, 100))
    # 樱花
    for i in range(140):
        x = (i * 397) % w
        y = (i * 211) % int(h * 0.6)
        r = 10 + (i % 5) * 4
        d.ellipse([x, y, x + r, y + r], fill=(255, 190, 210))
    save_bg(img, "school_gate.png", "青岚高中 校门")


def bg_classroom(name, text, top, bottom, desk):
    w, h = BG_SIZE[0] * SS, BG_SIZE[1] * SS
    img = gradient((w, h), top, bottom)
    d = ImageDraw.Draw(img)
    d.rectangle([w * 0.2, h * 0.12, w * 0.8, h * 0.45], fill=(46, 84, 66))  # 黑板
    d.rectangle([w * 0.2, h * 0.45, w * 0.8, h * 0.47], fill=(150, 120, 90))
    d.rectangle([0, h * 0.68, w, h], fill=desk)
    for row in range(2):
        for col in range(5):
            x0 = w * 0.06 + col * w * 0.19
            y0 = h * 0.72 + row * h * 0.14
            d.rectangle([x0, y0, x0 + w * 0.14, y0 + h * 0.05], fill=(170, 130, 90))
    save_bg(img, name, text)


def bg_corridor():
    w, h = BG_SIZE[0] * SS, BG_SIZE[1] * SS
    img = gradient((w, h), (90, 60, 70), (230, 150, 90))
    d = ImageDraw.Draw(img)
    # 一点透视走廊
    vx, vy = w * 0.5, h * 0.45
    d.polygon([(0, h), (w, h), (vx + 80, vy + 60), (vx - 80, vy + 60)], fill=(110, 80, 70))
    d.polygon([(0, 0), (0, h), (vx - 80, vy + 60), (vx - 80, vy - 60)], fill=(150, 110, 100))
    d.polygon([(w, 0), (w, h), (vx + 80, vy + 60), (vx + 80, vy - 60)], fill=(130, 95, 90))
    for i in range(6):
        t = 0.15 + i * 0.13
        x = w * 0.5 * t
        d.rectangle([x, h * (0.3 + t * 0.05), x + w * 0.04 * (1 - t * 0.6), h * (0.7 - t * 0.1)], fill=(90, 70, 70))
    d.rectangle([vx - 80, vy - 60, vx + 80, vy + 60], fill=(255, 210, 130))  # 尽头的光
    img = img.filter(ImageFilter.GaussianBlur(1))
    save_bg(img, "corridor_old.png", "旧校舍 三楼走廊（黄昏）")


def bg_library():
    w, h = BG_SIZE[0] * SS, BG_SIZE[1] * SS
    img = gradient((w, h), (230, 214, 180), (180, 150, 120))
    d = ImageDraw.Draw(img)
    colors = [(150, 60, 60), (60, 90, 140), (70, 120, 80), (180, 150, 70), (110, 80, 130)]
    for shelf in range(4):
        x0 = w * 0.04 + shelf * w * 0.24
        d.rectangle([x0, h * 0.1, x0 + w * 0.2, h * 0.85], fill=(110, 80, 55))
        for row in range(5):
            y = h * 0.14 + row * h * 0.14
            x = x0 + 12
            i = 0
            while x < x0 + w * 0.2 - 30:
                bw = 22 + (i * 7 + shelf * 5 + row * 3) % 18
                d.rectangle([x, y + (i % 3) * 6, x + bw, y + h * 0.11], fill=colors[(i + row + shelf) % 5])
                x += bw + 4
                i += 1
    save_bg(img, "library.png", "图书室")


def bg_rooftop():
    w, h = BG_SIZE[0] * SS, BG_SIZE[1] * SS
    img = gradient((w, h), (70, 130, 220), (200, 230, 250))
    d = ImageDraw.Draw(img)
    d.rectangle([0, h * 0.75, w, h], fill=(170, 170, 170))
    for i in range(0, w, 60):
        d.line([(i, h * 0.55), (i, h * 0.78)], fill=(90, 110, 100), width=6)
    d.line([(0, h * 0.56), (w, h * 0.56)], fill=(90, 110, 100), width=8)
    d.ellipse([w * 0.1, h * 0.12, w * 0.3, h * 0.22], fill=(255, 255, 255))
    d.ellipse([w * 0.6, h * 0.18, w * 0.85, h * 0.28], fill=(255, 255, 255))
    save_bg(img, "rooftop.png", "天台")


def bg_black():
    Image.new("RGB", BG_SIZE, (8, 8, 12)).save(BG_DIR / "black.png", optimize=True)


def main():
    BG_DIR.mkdir(parents=True, exist_ok=True)
    bg_title()
    bg_gate()
    bg_classroom("classroom.png", "2年3班 教室（白天）", (210, 225, 240), (240, 236, 225), (200, 170, 130))
    bg_classroom("classroom_dusk.png", "2年3班 教室（黄昏）", (240, 150, 100), (120, 70, 80), (130, 90, 70))
    bg_corridor()
    bg_library()
    bg_rooftop()
    bg_black()
    print("placeholders generated")


if __name__ == "__main__":
    main()
