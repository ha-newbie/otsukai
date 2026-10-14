"""Development-only icon generation. Requires Pillow; no runtime dependency."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent / "public"
scale = 4
background = "#47745a"
image = Image.new("RGB", (512 * scale, 512 * scale), background)
spoon = Image.new("RGBA", image.size)
draw = ImageDraw.Draw(spoon)
draw.ellipse(tuple(value * scale for value in (189, 81, 323, 261)), fill="#f6f8ee")
draw.rounded_rectangle(tuple(value * scale for value in (238, 231, 274, 417)), radius=18 * scale, fill="#f6f8ee")
spoon = spoon.rotate(-35, resample=Image.Resampling.BICUBIC, center=(256 * scale, 256 * scale))
image.paste(spoon, mask=spoon.getchannel("A"))
ImageDraw.Draw(image).ellipse(tuple(value * scale for value in (335, 345, 365, 375)), fill="#cbdcb4")
for size, name in [(192, "icon-192.png"), (512, "icon-512.png"), (180, "apple-touch-icon.png")]:
    image.resize((size, size), Image.Resampling.LANCZOS).save(root / name, optimize=True)
