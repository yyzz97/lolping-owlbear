"""Create a clean single-color toolbar mask from the supplied Generic ping image."""
import sys
from pathlib import Path
from PIL import Image

if len(sys.argv) != 2:
    raise SystemExit('Usage: python scripts/generate-tool-icon.py <Generic_ping.png>')

source = Image.open(Path(sys.argv[1])).convert('RGBA')
alpha = source.getchannel('A')
# Remove the soft drop shadow while keeping antialiased edges and the transparent cutout.
mask = alpha.point(lambda value: round(max(0, value - 64) * 255 / 191))
bounds = mask.getbbox()
if not bounds:
    raise SystemExit('The source image has no visible icon.')

mask = mask.crop(bounds)
scale = min(116 / mask.width, 116 / mask.height)
size = (round(mask.width * scale), round(mask.height * scale))
mask = mask.resize(size, Image.Resampling.LANCZOS)
canvas = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
white = Image.new('RGBA', size, (255, 255, 255, 0))
white.putalpha(mask)
canvas.alpha_composite(white, ((128 - size[0]) // 2, (128 - size[1]) // 2))
canvas.save(Path(__file__).resolve().parents[1] / 'public' / 'wheel-tool.png', optimize=True)
