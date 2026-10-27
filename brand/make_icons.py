# -*- coding: utf-8 -*-
"""
春生夏长 · 小程序头像生成
576x576 超采样绘制，LANCZOS 缩到 144x144，保证小尺寸边缘干净。
"""
import math
import os
from PIL import Image, ImageDraw, ImageFont

S = 576
FINAL = 144
HERE = os.path.dirname(os.path.abspath(__file__))

CREAM = (246, 244, 239)
GREEN = (62, 124, 90)
GREEN_L = (92, 160, 120)
GREEN_D = (36, 78, 56)
INKG = (36, 74, 54)
INKG_D = (20, 41, 31)

C_FLOWER = (222, 106, 140)
C_BIRD = (63, 134, 212)
C_FISH = (27, 160, 150)
C_INSECT = (136, 120, 214)


def lerp(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))


def gradient_bg(size, c1, c2, angle_deg=45):
    """对角线性渐变：先用小图算再放大，快且平滑。"""
    n = 96
    a = math.radians(angle_deg)
    ca, sa = math.cos(a), math.sin(a)
    small = Image.new("RGB", (n, n))
    px = small.load()
    raw = []
    for y in range(n):
        for x in range(n):
            raw.append((x / (n - 1)) * ca + (y / (n - 1)) * sa)
    lo, hi = min(raw), max(raw)
    i = 0
    for y in range(n):
        for x in range(n):
            t = (raw[i] - lo) / (hi - lo) if hi > lo else 0
            i += 1
            px[x, y] = lerp(c1, c2, t)
    return small.resize((size, size), Image.BICUBIC)


def leaf_polygon(base, tip, width, n=140):
    """两端尖、中间宽的叶形"""
    dx, dy = tip[0] - base[0], tip[1] - base[1]
    L = math.hypot(dx, dy)
    ux, uy = dx / L, dy / L
    nx, ny = -uy, ux
    top, bot = [], []
    for i in range(n + 1):
        s = i / n
        px_ = base[0] + dx * s
        py_ = base[1] + dy * s
        w = width * (math.sin(math.pi * s) ** 0.82)
        top.append((px_ + nx * w, py_ + ny * w))
        bot.append((px_ - nx * w, py_ - ny * w))
    return top + bot[::-1]


def draw_sprout(draw, color, cx=288, scale=1.0, shift_y=0):
    """一株新芽：竖茎 + 左小右大两片对生叶"""
    def P(x, y):
        return (cx + (x - 288) * scale, 288 + (y - 288) * scale + shift_y)

    stem_w = int(29 * scale)
    top = P(288, 286)
    bottom = P(288, 404)

    draw.line([bottom, top], fill=color, width=stem_w, joint="curve")
    r = stem_w / 2 - 0.5
    for pt in (top, bottom):
        draw.ellipse([pt[0] - r, pt[1] - r, pt[0] + r, pt[1] + r], fill=color)

    # 右叶（大，向右上）
    draw.polygon(leaf_polygon(P(288, 300), P(400, 214), 52 * scale), fill=color)
    # 左叶（略小，向左上）
    draw.polygon(leaf_polygon(P(288, 318), P(186, 244), 45 * scale), fill=color)


def bezier3(p0, p1, p2, p3, n=220):
    pts = []
    for i in range(n + 1):
        t = i / n
        mt = 1 - t
        x = mt**3 * p0[0] + 3 * mt**2 * t * p1[0] + 3 * mt * t**2 * p2[0] + t**3 * p3[0]
        y = mt**3 * p0[1] + 3 * mt**2 * t * p1[1] + 3 * mt * t**2 * p2[1] + t**3 * p3[1]
        pts.append((x, y))
    return pts


def point_at(pts, t):
    i = min(len(pts) - 1, max(0, int(t * (len(pts) - 1))))
    return pts[i]


# ---------------------------------------------------------------- 方案 A
def icon_a():
    """苔绿底 · 白芽 · 年轮细环"""
    base = gradient_bg(S, GREEN_L, GREEN_D, 45).convert("RGBA")
    ov = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)

    # 年轮细环
    r = 198
    d.ellipse([288 - r, 288 - r, 288 + r, 288 + r],
              outline=(CREAM[0], CREAM[1], CREAM[2], 78), width=10)

    draw_sprout(d, CREAM + (255,), scale=1.1, shift_y=-24)
    return Image.alpha_composite(base, ov)


# ---------------------------------------------------------------- 方案 B
def icon_b():
    """暖纸底 · 苔绿芽 · 细环"""
    base = Image.new("RGBA", (S, S), CREAM + (255,))
    ov = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)

    r = 202
    d.ellipse([288 - r, 288 - r, 288 + r, 288 + r],
              outline=(GREEN[0], GREEN[1], GREEN[2], 80), width=11)

    draw_sprout(d, GREEN + (255,), scale=1.1, shift_y=-24)
    return Image.alpha_composite(base, ov)


# ---------------------------------------------------------------- 方案 C
def icon_c():
    """墨绿底 · 生长曲线 · 花鸟鱼虫四点"""
    base = gradient_bg(S, INKG, INKG_D, 60).convert("RGBA")
    ov = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)

    curve = bezier3((156, 418), (224, 412), (306, 300), (428, 182))
    d.line(curve, fill=(CREAM[0], CREAM[1], CREAM[2], 128), width=16, joint="curve")

    dots = [(0.08, C_FLOWER), (0.36, C_BIRD), (0.64, C_FISH), (0.93, C_INSECT)]
    for t, col in dots:
        cx, cy = point_at(curve, t)
        rr = 31
        d.ellipse([cx - rr - 11, cy - rr - 11, cx + rr + 11, cy + rr + 11], fill=INKG_D + (255,))
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=col + (255,))

    return Image.alpha_composite(base, ov)


# ---------------------------------------------------------------- 输出
def save(img, name):
    big = img.convert("RGB")
    big.save(os.path.join(HERE, f"{name}@4x.png"))
    small = big.resize((FINAL, FINAL), Image.LANCZOS)
    small.save(os.path.join(HERE, f"{name}.png"))
    return small


def load_font(size):
    for p in ("C:/Windows/Fonts/msyh.ttc", "C:/Windows/Fonts/msyhd.ttf",
              "C:/Windows/Fonts/simhei.ttf"):
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    return ImageFont.load_default()


def contact_sheet(thumbs):
    W, H = 1080, 512
    sheet = Image.new("RGB", (W, H), (16, 18, 21))
    d = ImageDraw.Draw(sheet)
    f_title = load_font(30)
    f_label = load_font(20)
    f_small = load_font(15)

    d.text((46, 28), "春生夏长 · 小程序头像方案", font=f_title, fill=(232, 230, 225))
    d.text((46, 72), "144 × 144 px    微信会裁成圆角矩形或圆形，主体均留在中部安全区",
           font=f_small, fill=(122, 130, 121))

    labels = [
        ("A", "苔绿 · 新芽", "绿底在聊天列表里最醒目，推荐做主头像"),
        ("B", "暖纸 · 新芽", "素雅，和界面同色系，适合偏安静的调性"),
        ("C", "四时 · 曲线", "四点对应花鸟鱼虫，色彩最活泼"),
    ]

    for i, (key, name, desc) in enumerate(labels):
        bx = 46 + i * 344
        by = 118

        # 底板
        d.rounded_rectangle([bx - 8, by - 8, bx + 240, by + 240], radius=20, fill=(25, 29, 26))

        # 圆角图标
        ic = thumbs[i].resize((232, 232), Image.LANCZOS)
        mask = Image.new("L", (232, 232), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, 231, 231], radius=58, fill=255)
        sheet.paste(ic, (bx, by), mask)

        # 圆形裁切预览
        cy = by + 274
        circ = thumbs[i].resize((58, 58), Image.LANCZOS)
        cmask = Image.new("L", (58, 58), 0)
        ImageDraw.Draw(cmask).ellipse([0, 0, 57, 57], fill=255)
        sheet.paste(circ, (bx, cy), cmask)
        d.ellipse([bx, cy, bx + 57, cy + 57], outline=(52, 58, 53), width=1)

        # 标签
        d.text((bx + 72, cy + 2), f"{key}   {name}", font=f_label, fill=(216, 224, 212))
        d.text((bx + 72, cy + 30), desc, font=f_small, fill=(116, 124, 114))

    sheet.save(os.path.join(HERE, "preview-icons.png"))
    return sheet


if __name__ == "__main__":
    a = save(icon_a(), "icon-a-sprout")
    b = save(icon_b(), "icon-b-paper")
    c = save(icon_c(), "icon-c-four")
    contact_sheet([a, b, c])
    print("done ->", HERE)
    for f in sorted(os.listdir(HERE)):
        if f.endswith(".png"):
            p = os.path.join(HERE, f)
            print(" ", f, Image.open(p).size, f"{os.path.getsize(p) // 1024}KB")
