#!/usr/bin/env python3
"""
MicroPulse Screenshot Anonymizer
=================================
Visir myndunum: crop browser chrome, anonymize player names, save to public/screenshots/

Usage:
  1. Vista skjámyndirnar í scripts/raw/ möppuna með þessum nöfnum:
       today.png          - Today Command Center tab
       intelligence.png   - Intelligence tab (team overview)
       intelligence2.png  - Intelligence tab (team risk map / Readiness Mix)
       gps.png            - GPS Data squad load table
       mli.png            - Mechanical Load Index panel
       metabolic.png      - Metabolic Load Score panel
       volatility.png     - Readiness Volatility charts
       vald.png           - VALD / CMJ tab

  2. Keyra: python3 scripts/anonymize-screenshots.py

  Output fer í: public/screenshots/
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import sys

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE     = Path(__file__).parent.parent
RAW_DIR  = Path(__file__).parent / "raw"
OUT_DIR  = BASE / "public" / "screenshots"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ── Anonymized player names (30 generic names for replacement) ─────────────────
FAKE_NAMES = [
    "A. Eriksson",   "B. Hansen",     "C. Magnusson",  "D. Nilsson",
    "E. Lindqvist",  "F. Bergström",  "G. Johansson",  "H. Andersen",
    "I. Sigurdsson", "J. Petersen",   "K. Larsson",    "L. Møller",
    "M. Gustafsson", "N. Thorvaldsen","O. Sørensen",   "P. Karlsson",
    "Q. Bjørnstad",  "R. Ólafsson",   "S. Kristiansen","T. Halvorsen",
    "U. Rasmussen",  "V. Lund",       "W. Holm",       "X. Mikkelsen",
    "Y. Dahl",       "Z. Strand",     "A. Bertilsson",  "B. Clausen",
    "C. Frederiksen","D. Vestergaard"
]

def try_font(size=13):
    """Try to load a system font, fall back to default."""
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
    return ImageFont.load_default()

def crop_browser_chrome(img: Image.Image, top: int = 95, bottom: int = 40) -> Image.Image:
    """Remove browser bar from top and taskbar from bottom."""
    w, h = img.size
    return img.crop((0, top, w, h - bottom))

def blur_region(img: Image.Image, x1: int, y1: int, x2: int, y2: int, radius: int = 18) -> Image.Image:
    """Gaussian-blur a rectangular region in the image (looks much cleaner than rectangles)."""
    from PIL import ImageFilter
    region = img.crop((x1, y1, x2, y2))
    blurred = region.filter(ImageFilter.GaussianBlur(radius=radius))
    img.paste(blurred, (x1, y1))
    return img

def blur_left_name_column(img: Image.Image, col_width_px: int = 265, y_start_px: int = 0, radius: int = 35) -> Image.Image:
    """Blur the left name column from y_start_px to bottom of image."""
    w, h = img.size
    return blur_region(img, 0, y_start_px, col_width_px, h, radius=radius)

def save(img: Image.Image, name: str, max_width: int = 1200):
    """Resize if too wide, save as PNG."""
    if img.width > max_width:
        ratio = max_width / img.width
        img = img.resize((max_width, int(img.height * ratio)), Image.LANCZOS)
    out = OUT_DIR / name
    img.save(out, "PNG", optimize=True)
    print(f"  ✓  Saved {out.name}  ({img.width}×{img.height})")

# ── Per-screenshot processing ──────────────────────────────────────────────────

def process_today(raw: Path):
    """Today Command Center — no player names, just crop browser chrome."""
    img = Image.open(raw).convert("RGB")
    img = crop_browser_chrome(img)
    save(img, "today.png")

def process_intelligence(raw: Path):
    """Intelligence tab — team overview. No individual player names on first screen."""
    img = Image.open(raw).convert("RGB")
    img = crop_browser_chrome(img)
    save(img, "intelligence.png")

def process_intelligence2(raw: Path):
    """Intelligence detail with Readiness Mix risk map — no individual player names visible."""
    img = Image.open(raw).convert("RGB")
    img = crop_browser_chrome(img)
    save(img, "intelligence2.png")

def process_gps(raw: Path):
    """GPS Data squad load table — blur left name column (x=0–265 in raw ~1777px image)."""
    img = Image.open(raw).convert("RGB")
    img = crop_browser_chrome(img)
    # Names are in the leftmost column (measured: x=0 to ~265 in 1777px raw image)
    # Blur from the data row header downwards (y=130 = after section title)
    img = blur_left_name_column(img, col_width_px=265, y_start_px=130)
    save(img, "gps.png")

def process_mli(raw: Path):
    """Mechanical Load Index — blur left name column."""
    img = Image.open(raw).convert("RGB")
    img = crop_browser_chrome(img)
    # Similar layout to GPS; blur name column from table header downward
    img = blur_left_name_column(img, col_width_px=265, y_start_px=50)
    save(img, "mli.png")

def process_metabolic(raw: Path):
    """Metabolic Load Score — blur left name column."""
    img = Image.open(raw).convert("RGB")
    img = crop_browser_chrome(img)
    img = blur_left_name_column(img, col_width_px=265, y_start_px=50)
    save(img, "metabolic.png")

def process_volatility(raw: Path):
    """Readiness Volatility — names are tiny labels inside mini-charts; blur each card's top-left."""
    img = Image.open(raw).convert("RGB")
    img = crop_browser_chrome(img)
    w, h = img.size
    # Volatility is wide and short (~1808×446 after chrome crop).
    # Mini-chart cards: 2 columns. Blur the top-left 180×22px name label in each card.
    # Approximate positions (measured for ~1808px wide image):
    left_col_x  = int(w * 0.165)   # ≈ 298px for 1808px
    right_col_x = int(w * 0.545)   # ≈ 985px
    card_h_total = int(h * 0.46)   # each card row height
    card_start_y = int(h * 0.04)
    name_h = 22
    name_w = 180
    for row in range(4):
        y = card_start_y + row * card_h_total + 5
        for cx in [left_col_x, right_col_x]:
            img = blur_region(img, cx, y, cx + name_w, y + name_h, radius=10)
    save(img, "volatility.png")

def process_vald(raw: Path):
    """VALD / CMJ tab — full Mac screenshot (2940×1912); crop OS chrome + blur name column."""
    img = Image.open(raw).convert("RGB")
    w, h = img.size
    # This is a full Mac screenshot: remove macOS chrome (traffic lights, tabs, address bar)
    # ~390px from top, and Mac Dock + status bar ~130px from bottom
    top    = 390
    bottom = 130
    img = img.crop((0, top, w, h - bottom))
    # Names measured at x=588–980 in 2940px raw — cover generously with strong blur
    img = blur_region(img, 0, 80, 1020, img.size[1], radius=50)
    save(img, "vald.png")

# ── Main ───────────────────────────────────────────────────────────────────────

JOBS = {
    "today.png":         process_today,
    "intelligence.png":  process_intelligence,
    "intelligence2.png": process_intelligence2,
    "gps.png":           process_gps,
    "mli.png":           process_mli,
    "metabolic.png":     process_metabolic,
    "volatility.png":    process_volatility,
    "vald.png":          process_vald,
}

if __name__ == "__main__":
    if not RAW_DIR.exists():
        RAW_DIR.mkdir()
        print(f"Created {RAW_DIR} — vista skjámyndirnar þar með réttu nöfnum.")
        print("Sjá README í skriftunni.")
        sys.exit(0)

    processed = 0
    for filename, fn in JOBS.items():
        raw = RAW_DIR / filename
        if raw.exists():
            print(f"Processing {filename}...")
            try:
                fn(raw)
                processed += 1
            except Exception as e:
                print(f"  ✗  Error: {e}")
        else:
            print(f"  –  Skipping {filename} (not found in scripts/raw/)")

    print(f"\nDone. {processed}/{len(JOBS)} screenshots processed → public/screenshots/")
