"""Regenerate the extension's transparent UI artwork with Pillow (development only)."""
from math import atan2, cos, exp, hypot, pi, sin
from pathlib import Path
import re

from PIL import Image, ImageDraw, ImageFont

OUTPUT = Path(__file__).resolve().parents[1] / "public" / "ui"
OUTPUT.mkdir(exist_ok=True)

# Two pixels per screen pixel keep edges smooth without relying on host SVG support.
for index in range(8):
    for state, rgb, opacity in [("idle", (0, 0, 0), 0.42), ("selected", (24, 160, 218), 0.64)]:
        image = Image.new("RGBA", (688, 688))
        pixels = image.load()
        for y in range(688):
            for x in range(688):
                dx, dy = (x + 0.5) / 2 - 172, (y + 0.5) / 2 - 172
                radius = hypot(dx, dy)
                angle = (atan2(dy, dx) * 180 / pi + 112.5 - index * 45) % 360
                if 85 <= radius <= 170 and angle < 45:
                    radial = max(0, 1 - (radius - 85) / 85) ** 0.7
                    edge = min(1, angle / 0.6, (45 - angle) / 0.6, (radius - 85) / 0.6)
                    pixels[x, y] = (*rgb, round(255 * opacity * radial * edge))
        image.save(OUTPUT / f"sector-{index}-{state}.png", optimize=True)

colors = {"red": "f12c55", "gold": "d8c79a", "blue": "22b9e9", "green": "16ce86", "yellow": "f6ba00"}
for name, color in colors.items():
    rgb = tuple(int(color[i:i + 2], 16) for i in (0, 2, 4))
    image = Image.new("RGBA", (256, 176))
    pixels = image.load()
    for y in range(176):
        for x in range(256):
            dx, dy = (x + 0.5) / 2 - 64, (y + 0.5) / 2 - 44
            radius = hypot(dx / 36, dy / 23)
            distance = (radius - 1) * 28
            glow = 0.32 * exp(-(distance / 6) ** 2)
            rim = 0.64 * exp(-(distance / 1.15) ** 2)
            interior = 0.045 * max(0, 1 - radius) if radius < 1 else 0
            pixels[x, y] = (*rgb, round(255 * min(1, glow + rim + interior)))
    image.save(OUTPUT / f"ring-{name}.png", optimize=True)

image = Image.new("RGBA", (128, 64))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((3, 3, 124, 60), radius=9, fill=(31, 42, 47, 145), outline=(184, 175, 176, 220), width=3)
font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 34)
draw.text((64, 32), "ESC", font=font, fill=(206, 201, 195, 255), anchor="mm")
image.save(OUTPUT / "esc-key.png", optimize=True)

geometry = (OUTPUT.parents[1] / 'src' / 'geometry.js').read_text(encoding='utf-8')
inner, outer, icon_radius, icon_size = [int(re.search(rf'{key}: (\d+)', geometry)[1])
    for key in ['innerRadius', 'outerRadius', 'iconRadius', 'iconSize']]
signals = [
    ('retreat', 'Retreat', 'RETREAT', '#f12c55', 'red'),
    ('bait', 'Bait', 'BAIT', '#d8c79a', 'gold'),
    ('omw', 'On_My_Way', 'ON MY WAY', '#22b9e9', 'blue'),
    ('allin', 'All_In', 'ALL IN', '#d8c79a', 'gold'),
    ('assist', 'Assist_Me', 'ASSIST ME', '#16ce86', 'green'),
    ('hold', 'Hold', 'HOLD', '#d8c79a', 'gold'),
    ('missing', 'Enemy_Missing', 'ENEMY MISSING', '#f6ba00', 'yellow'),
    ('push', 'Push', 'PUSH', '#16ce86', 'green'),
    ('caution', 'Caution', 'CAUTION', '#f6ba00', 'yellow'),
]

def paste_icon(canvas, signal, point, size):
    source = Image.open(OUTPUT.parent / 'assets' / f'{signal[1]}_ping.png').convert('RGBA')
    side = round(size * 2 * (1.15 if signal[0] == 'bait' else 1))
    source = source.resize((side, side), Image.Resampling.LANCZOS)
    canvas.alpha_composite(source, (round(point[0] * 2 - side / 2), round(point[1] * 2 - side / 2)))

for selected, signal in enumerate(signals):
    canvas = Image.new('RGBA', (688, 688))
    for index in range(8):
        state = 'selected' if index == selected else 'idle'
        canvas.alpha_composite(Image.open(OUTPUT / f'sector-{index}-{state}.png'))
    draw = ImageDraw.Draw(canvas)
    for index in range(8):
        angle = (-112.5 + index * 45) * pi / 180
        draw.line(((172 + inner * cos(angle)) * 2, (172 + inner * sin(angle)) * 2,
                   (172 + outer * cos(angle)) * 2, (172 + outer * sin(angle)) * 2), fill=(200, 170, 110, 100), width=2)
    draw.ellipse(((172 - inner) * 2, (172 - inner) * 2, (172 + inner) * 2, (172 + inner) * 2),
                 fill=(11, 36, 38, 210), outline=(200, 170, 110, 250), width=3)
    for index, outer_signal in enumerate(signals[:8]):
        angle = (-90 + index * 45) * pi / 180
        paste_icon(canvas, outer_signal, (172 + icon_radius * cos(angle), 172 + icon_radius * sin(angle)), icon_size)
    paste_icon(canvas, signal, (172, 128), 32)
    draw = ImageDraw.Draw(canvas)
    label_font = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 28 if signal[0] == 'missing' else 30)
    draw.text((344, 344), signal[2], font=label_font, fill=signal[3], anchor='mm')
    # Keycap and Back share one baseline inside the same image.
    canvas.alpha_composite(Image.open(OUTPUT / 'esc-key.png').resize((48, 24), Image.Resampling.LANCZOS), (284, 416))
    ImageDraw.Draw(canvas).text((366, 428), 'Back', font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 22), fill='#b8afb0', anchor='mm')
    canvas.save(OUTPUT / f'wheel-{signal[0]}.png', optimize=True)

    ping = Image.new('RGBA', (400, 256))
    ping.alpha_composite(Image.open(OUTPUT / f'ring-{signal[4]}.png'), (72, 12))
    paste_icon(ping, signal, (100, 25), 48)
    ping.save(OUTPUT / f'ping-{signal[0]}.png', optimize=True)
