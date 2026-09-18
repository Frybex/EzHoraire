"""Exports iOS et Android du Monolithe (version d'origine), pour chaque couleur d'accent.

    python3 export.py

Rendu PNG par Brave en mode headless, puis réduction avec sips (macOS).
"""

import json
import os
import shutil
import subprocess
import tempfile

import build as b

BRAVE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
OUT = os.path.join(b.OUT, "..", "..", "monolithe", "mobile")
GLYPH = b.p5_avant
BG_TOP, BG_BOT = "#232832", "#101216"

# densités Android : (dossier, taille du calque adaptatif 108 dp, taille de l'icône 48 dp)
DENSITES = [("mdpi", 108, 48), ("hdpi", 162, 72), ("xhdpi", 216, 96),
            ("xxhdpi", 324, 144), ("xxxhdpi", 432, 192)]


def scaled(inner, k):
    return f'<g transform="translate(50 50) scale({k}) translate(-50 -50)">{inner}</g>'


def fond(glow, forme="carre"):
    """Fond sombre en dégradé + halo d'accent. forme : carre, arrondi, rond."""
    b._uid[0] += 1
    g = f"f{b._uid[0]}"
    defs = (f'<defs><linearGradient id="{g}" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" stop-color="{BG_TOP}"/><stop offset="1" stop-color="{BG_BOT}"/></linearGradient>'
            f'<radialGradient id="{g}h" cx=".25" cy=".05" r=".9"><stop offset="0" stop-color="{glow}" stop-opacity=".22"/>'
            f'<stop offset="1" stop-color="{glow}" stop-opacity="0"/></radialGradient></defs>')
    if forme == "rond":
        shape = '<circle cx="50" cy="50" r="50" fill="url(#{})"/>'
    elif forme == "arrondi":
        shape = '<rect width="100" height="100" rx="22" fill="url(#{})"/>'
    else:
        shape = '<rect width="100" height="100" fill="url(#{})"/>'
    return defs + shape.format(g) + shape.format(g + "h")


def render(svg_markup, path, size):
    """Rend un SVG en PNG (fond transparent) à la taille demandée."""
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "i.html")
        big = max(size, 512)
        markup = svg_markup.replace("<svg ", '<svg width="100%" height="100%" ', 1)
        with open(src, "w") as fh:
            fh.write('<html><body style="margin:0;background:transparent">'
                     f'<div style="width:{big}px;height:{big}px">{markup}</div>'
                     '</body></html>')
        shot = os.path.join(tmp, "o.png")
        subprocess.run([BRAVE, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                        "--force-device-scale-factor=1", "--default-background-color=00000000",
                        f"--window-size={big},{big}", f"--screenshot={shot}", f"file://{src}"],
                       check=True, capture_output=True)
        if size != big:
            subprocess.run(["sips", "-z", str(size), str(size), shot], check=True, capture_output=True)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        shutil.copy(shot, path)


def ios(dossier, acc):
    ink = b.INK_DARK
    render(b.svg(fond(acc) + scaled(GLYPH(ink, acc), 1.02)), f"{dossier}/AppIcon-1024.png", 1024)
    # iOS 18 : l'icône sombre a un fond transparent (le système pose le sien)
    render(b.svg(scaled(GLYPH(ink, acc), 1.02)), f"{dossier}/AppIcon-1024-dark.png", 1024)
    # teintée : niveaux de gris sur noir, l'accent en gris pour garder la lecture E / Z
    render(b.svg('<rect width="100" height="100" fill="#000"/>' + scaled(GLYPH("#ffffff", "#8f8f8f"), 1.02)),
           f"{dossier}/AppIcon-1024-tinted.png", 1024)
    contents = {
        "images": [
            {"filename": "AppIcon-1024.png", "idiom": "universal", "platform": "ios", "size": "1024x1024"},
            {"appearances": [{"appearance": "luminosity", "value": "dark"}],
             "filename": "AppIcon-1024-dark.png", "idiom": "universal", "platform": "ios", "size": "1024x1024"},
            {"appearances": [{"appearance": "luminosity", "value": "tinted"}],
             "filename": "AppIcon-1024-tinted.png", "idiom": "universal", "platform": "ios", "size": "1024x1024"},
        ],
        "info": {"author": "xcode", "version": 1},
    }
    with open(f"{dossier}/Contents.json", "w") as fh:
        json.dump(contents, fh, indent=2)


def android(dossier, acc):
    ink = b.INK_DARK
    res = f"{dossier}/res"
    # calque de premier plan 108 dp : le glyphe tient dans la zone sûre (cercle de 66 dp)
    fg = b.svg(scaled(GLYPH(ink, acc), .70))
    bg = b.svg(fond(acc))
    mono = b.svg(scaled(GLYPH("#ffffff", "#ffffff"), .70))
    legacy = b.svg(fond(acc, "arrondi") + scaled(GLYPH(ink, acc), 1.02))
    legacy_round = b.svg(fond(acc, "rond") + scaled(GLYPH(ink, acc), .92))
    for dens, s108, s48 in DENSITES:
        d = f"{res}/mipmap-{dens}"
        render(fg, f"{d}/ic_launcher_foreground.png", s108)
        render(bg, f"{d}/ic_launcher_background.png", s108)
        render(mono, f"{d}/ic_launcher_monochrome.png", s108)
        render(legacy, f"{d}/ic_launcher.png", s48)
        render(legacy_round, f"{d}/ic_launcher_round.png", s48)
    xml = ('<?xml version="1.0" encoding="utf-8"?>\n'
           '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
           '    <background android:drawable="@mipmap/ic_launcher_background"/>\n'
           '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
           '    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>\n'
           '</adaptive-icon>\n')
    os.makedirs(f"{res}/mipmap-anydpi-v26", exist_ok=True)
    for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
        with open(f"{res}/mipmap-anydpi-v26/{name}", "w") as fh:
            fh.write(xml)
    # Play Store : carré plein 512, Google applique lui-même l'arrondi
    render(b.svg(fond(acc) + scaled(GLYPH(ink, acc), 1.02)), f"{dossier}/playstore-512.png", 512)


if __name__ == "__main__":
    shutil.rmtree(OUT, ignore_errors=True)
    for th, acc in b.THEMES:
        ios(f"{OUT}/{th}/ios/AppIcon.appiconset", acc)
        android(f"{OUT}/{th}/android", acc)
        print("ok", th)
