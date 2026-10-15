"""Regenerate the extension's transparent UI artwork with Pillow (development only)."""
from math import atan2, exp, hypot, pi
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUTPUT = Path(__file__).resolve().parents[1] / "public" / "ui"
OUTPUT.mkdir(exist_ok=True)

# Two pixels per screen pixel keep edges smooth without relying on host SVG support.
for index in range(8):
    for state, rgb, opacity in [("idle", (137, 149, 156), 0.22), ("selected", (24, 160, 218), 0.64)]:
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
