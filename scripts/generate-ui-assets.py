"""Regenerate the extension's transparent UI artwork with Pillow (development only)."""
from math import atan2, cos, exp, hypot, pi, sin
from pathlib import Path
import re
from PIL import Image, ImageDraw, ImageFont

OUTPUT = Path(__file__).resolve().parents[1] / "public" / "ui"
OUTPUT.mkdir(exist_ok=True)
SCALE = 2
CANVAS = 728
CENTER = CANVAS // 2
INNER = 85
CARDINAL_OUTER = 180
DIAGONAL_OUTER = 150

def sector_radius(index):
    return CARDINAL_OUTER if index % 2 == 0 else DIAGONAL_OUTER

def sector_image(index, selected):
    rgb, opacity = ((24, 160, 218), 0.64) if selected else ((0, 0, 0), 0.68 if index % 2 == 0 else 0.38)
    image = Image.new("RGBA", (CANVAS, CANVAS))
    pixels = image.load()
    radius_limit = sector_radius(index)
    for y in range(CANVAS):
        for x in range(CANVAS):
            dx, dy = (x + 0.5) / SCALE - CENTER / SCALE, (y + 0.5) / SCALE - CENTER / SCALE
            radius = hypot(dx, dy)
            angle = (atan2(dy, dx) * 180 / pi + 112.5 - index * 45) % 360
            if INNER <= radius <= radius_limit and angle < 45:
                edge = min(1, angle / 0.8, (45 - angle) / 0.8, (radius - INNER) / 0.8,
                           (radius_limit - radius) / 0.8)
                distance = (radius - INNER) / max(1, radius_limit - INNER)
                if selected:
                    radial = max(0, 1 - distance) ** 0.7
                elif index % 2 == 0:
                    # Cardinal wedges are darker near the core and fade
                    # completely into the map at their curved outer edge.
                    radial = max(0, 1 - distance ** 0.8)
                else:
                    radial = 1
                pixels[x, y] = (*rgb, round(255 * opacity * radial * edge))
    return image

for index in range(8):
    sector_image(index, False).save(OUTPUT / f"sector-{index}-idle.png", optimize=True)
    sector_image(index, True).save(OUTPUT / f"sector-{index}-selected.png", optimize=True)

colors = {"red": "f12c55", "gold": "d8c79a", "blue": "22b9e9", "green": "16ce86", "yellow": "f6ba00"}
for name, color in colors.items():
    rgb = tuple(int(color[i:i + 2], 16) for i in (0, 2, 4))
    image = Image.new("RGBA", (256, 176))
    pixels = image.load()
    for y in range(176):
        for x in range(256):
            dx, dy = (x + 0.5) / 2 - 64, (y + 0.5) / 2 - 44
            outer = hypot(dx / 26, dy / 16)
            inner = hypot(dx / 20, dy / 10.5)
            outer_distance = (outer - 1) * 28
            inner_distance = (inner - 1) * 28
            glow = 0.25 * exp(-(outer_distance / 5.5) ** 2) + 0.20 * exp(-(inner_distance / 5.5) ** 2)
            rim = 0.72 * exp(-(outer_distance / 1.15) ** 2) + 0.64 * exp(-(inner_distance / 1.15) ** 2)
            pixels[x, y] = (*rgb, round(255 * min(1, glow + rim)))
    image.save(OUTPUT / f"ring-{name}.png", optimize=True)

image = Image.new("RGBA", (128, 64))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((3, 3, 124, 60), radius=9, fill=(31, 42, 47, 145), outline=(184, 175, 176, 220), width=3)
font = ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc", 34)
draw.text((64, 32), "ESC", font=font, fill=(206, 201, 195, 255), anchor="mm")
image.save(OUTPUT / "esc-key.png", optimize=True)

geometry = (OUTPUT.parents[1] / 'src' / 'geometry.js').read_text(encoding='utf-8')
inner, icon_radius, icon_size = [int(re.search(rf'{key}: (\d+)', geometry)[1])
    for key in ['innerRadius', 'iconRadius', 'iconSize']]
signals = [
    ('retreat', 'Retreat', '撤退', '#f12c55', 'red'),
    ('push', 'Push', '推进', '#16ce86', 'green'),
    ('omw', 'On_My_Way', '正在路上', '#22b9e9', 'blue'),
    ('allin', 'All_In', '全力进攻', '#d8c79a', 'gold'),
    ('assist', 'Assist_Me', '协助我', '#16ce86', 'green'),
    ('needvision', 'Need_Vision', '需要视野', '#16ce86', 'green'),
    ('missing', 'Enemy_Missing', '敌人消失', '#f6ba00', 'yellow'),
    ('enemyvision', 'Enemy_Vision', '敌方视野', '#f12c55', 'red'),
    ('caution', 'Caution', '谨慎行事', '#f6ba00', 'yellow'),
]

def paste_icon(canvas, signal, point, size):
    source = Image.open(OUTPUT.parent / 'assets' / f'{signal[1]}_ping.png').convert('RGBA')
    side = round(size * SCALE * (1.15 if signal[0] == 'bait' else 1))
    source = source.resize((side, side), Image.Resampling.LANCZOS)
    canvas.alpha_composite(source, (round(point[0] * SCALE - side / 2), round(point[1] * SCALE - side / 2)))

def draw_base():
    canvas = Image.new('RGBA', (CANVAS, CANVAS))
    center = CENTER / SCALE
    for index in range(8):
        canvas.alpha_composite(Image.open(OUTPUT / f'sector-{index}-idle.png'))
    draw = ImageDraw.Draw(canvas)
    for index in range(8):
        angle = (-112.5 + index * 45) * pi / 180
        radius = CARDINAL_OUTER
        draw.line(((center + INNER * cos(angle)) * SCALE, (center + INNER * sin(angle)) * SCALE,
                   (center + radius * cos(angle)) * SCALE, (center + radius * sin(angle)) * SCALE),
                  fill=(210, 180, 112, 210), width=2)
    draw.ellipse(((center - inner) * SCALE, (center - inner) * SCALE,
                  (center + inner) * SCALE, (center + inner) * SCALE),
                 fill=(11, 36, 38, 210), outline=(200, 170, 110, 250), width=3)
    draw.ellipse(((center - 78) * SCALE, (center - 78) * SCALE,
                  (center + 78) * SCALE, (center + 78) * SCALE),
                 outline=(216, 199, 154, 255), width=6)
    for index, outer_signal in enumerate(signals[:8]):
        angle = (-90 + index * 45) * pi / 180
        paste_icon(canvas, outer_signal, (center + icon_radius * cos(angle), center + icon_radius * sin(angle)), icon_size)
    canvas.alpha_composite(Image.open(OUTPUT / 'esc-key.png').resize((48, 24), Image.Resampling.LANCZOS),
                           (round(center * SCALE - 60), round(center * SCALE + 72)))
    ImageDraw.Draw(canvas).text((round(center * SCALE + 22), round(center * SCALE + 84)), '返回',
                                font=ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', 22), fill='#b8afb0', anchor='mm')
    return canvas

base = draw_base()
base.save(OUTPUT / 'wheel-base.png', optimize=True)
Image.new('RGBA', (CANVAS, CANVAS)).save(OUTPUT / 'wheel-selection-none.png', optimize=True)

for selected, signal in enumerate(signals):
    selection = Image.new('RGBA', (CANVAS, CANVAS))
    if selected < 8:
        selection.alpha_composite(Image.open(OUTPUT / f'sector-{selected}-selected.png'))
    selection.save(OUTPUT / f'wheel-selection-{signal[0]}.png', optimize=True)
    center = Image.new('RGBA', (CANVAS, CANVAS))
    paste_icon(center, signal, (CENTER / SCALE, CENTER / SCALE - 44), 32)
    label_font = ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', 28 if signal[0] == 'missing' else 30)
    ImageDraw.Draw(center).text((CENTER, CENTER), signal[2], font=label_font, fill=signal[3], anchor='mm')
    center.save(OUTPUT / f'wheel-center-{signal[0]}.png', optimize=True)
    full = base.copy()
    full.alpha_composite(selection)
    full.alpha_composite(center)
    full.save(OUTPUT / f'wheel-{signal[0]}.png', optimize=True)

for signal in signals:
    ping = Image.new('RGBA', (400, 256))
    ping.alpha_composite(Image.open(OUTPUT / f'ring-{signal[4]}.png'), (72, 12))
    paste_icon(ping, signal, (100, 25), 48)
    ping.save(OUTPUT / f'ping-{signal[0]}.png', optimize=True)
