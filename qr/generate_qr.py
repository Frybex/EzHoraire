#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Générateur de QR Codes personnalisés, ultra-modernes pour EzHoraire.

Caractéristiques :
- Tuiles élégantes aux bords arrondis (squircles néo-suisses) SANS carré blanc derrière :
  Les 4 coins extérieurs sont 100% transparents (canal alpha pur).
- Conforme aux standards QR Code (Correction d'erreur niveau H : 30% de redondance).
- Modules squircle arrondis modernes et repères optiques personnalisés cobalt.
- Badge central intégré avec l'icône officielle EzHoraire (les 3 barres d'agenda).
- Déclinaisons :
    1. qr-dark.png / .svg         : Tuile sombre aux bords arrondis (titane & bleu) sur fond transparent
    2. qr-light.png / .svg        : Tuile blanche aux bords arrondis (épure suisse) sur fond transparent
    3. qr-cyber.png / .svg        : Tuile sombre aux bords arrondis avec dégradé cyan -> violet
    4. qr-noir-sans-fond.png      : Modules seuls sans aucune tuile (100% transparent pour fond clair)
    5. qr-blanc-sans-fond.png     : Modules seuls sans aucune tuile (100% transparent pour fond sombre)
    6. qr-bleu-sans-fond.png      : Modules seuls en bleu marque (100% transparent)
    7. qr-card-dark / qr-card-light : Présentoirs complets prêts à imprimer

Usage :
    python3 qr/generate_qr.py
    python3 qr/generate_qr.py --url "https://www.ezhoraire.be"
"""

import argparse
import base64
import os
import subprocess
import tempfile
import qrcode
from PIL import Image

BRAVE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
DEFAULT_URL = "https://www.ezhoraire.be"


def build_qr_matrix(url, version=3):
    qr = qrcode.QRCode(
        version=version,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=1,
        border=0,
    )
    qr.add_data(url)
    qr.make(fit=True)
    return qr.get_matrix()


def generate_svg_tile_qr(matrix, theme="dark", size_px=800, border_modules=4):
    """Génère un SVG avec tuile aux coins arrondis et extérieur 100% transparent (aucun carré blanc)."""
    qr_size = len(matrix)
    total_modules = qr_size + 2 * border_modules
    cell = size_px / total_modules
    pad = cell * 0.04
    rx = cell * 0.28
    dot_size = cell - 2 * pad

    def is_finder(r, c):
        if r < 7 and c < 7:
            return True
        if r < 7 and c >= qr_size - 7:
            return True
        if r >= qr_size - 7 and c < 7:
            return True
        return False

    c_start = (qr_size - 7) // 2
    c_end = c_start + 6

    def is_center(r, c):
        return c_start <= r <= c_end and c_start <= c <= c_end

    # Rayon des coins de la tuile (bords arrondis élégants)
    tile_rx = size_px * 0.075  # 60px pour 800px
    margin = 8

    defs = ""
    halo_rect = ""

    if theme == "dark":
        bg_card = "#0e1117"
        border_stroke = "rgba(255, 255, 255, 0.10)"
        module_col = "#f1f3f7"
        finder_ring = "#5b86ff"
        finder_eye = "#5b86ff"
        badge_bg = "#151922"
        badge_stroke = "rgba(91, 134, 255, 0.45)"
        bar1 = "#f1f3f7"
        bar2 = "#5b86ff"
        bar3 = "#f1f3f7"
        defs = f"""
        <radialGradient id="halo-dark" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stop-color="#5b86ff" stop-opacity="0.14"/>
            <stop offset="100%" stop-color="#0e1117" stop-opacity="0"/>
        </radialGradient>
        """
        halo_rect = f'<rect x="{margin}" y="{margin}" width="{size_px - 2*margin}" height="{size_px - 2*margin}" rx="{tile_rx}" fill="url(#halo-dark)"/>'
    elif theme == "light":
        bg_card = "#ffffff"
        border_stroke = "rgba(0, 0, 0, 0.08)"
        module_col = "#111317"
        finder_ring = "#2456e0"
        finder_eye = "#111317"
        badge_bg = "#ffffff"
        badge_stroke = "#e2e6ed"
        bar1 = "#111317"
        bar2 = "#2456e0"
        bar3 = "#111317"
    elif theme == "cyber":
        bg_card = "#090b10"
        border_stroke = "rgba(56, 189, 248, 0.25)"
        module_col = "url(#cyber-grad)"
        finder_ring = "url(#cyber-ring)"
        finder_eye = "#38bdf8"
        badge_bg = "#0f121a"
        badge_stroke = "url(#cyber-ring)"
        bar1 = "#f8fafc"
        bar2 = "#38bdf8"
        bar3 = "#f8fafc"
        defs = """
        <linearGradient id="cyber-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#38bdf8"/>
            <stop offset="50%" stop-color="#6366f1"/>
            <stop offset="100%" stop-color="#a855f7"/>
        </linearGradient>
        <linearGradient id="cyber-ring" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#38bdf8"/>
            <stop offset="100%" stop-color="#818cf8"/>
        </linearGradient>
        <radialGradient id="cyber-halo" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stop-color="#6366f1" stop-opacity="0.18"/>
            <stop offset="100%" stop-color="#090b10" stop-opacity="0"/>
        </radialGradient>
        """
        halo_rect = f'<rect x="{margin}" y="{margin}" width="{size_px - 2*margin}" height="{size_px - 2*margin}" rx="{tile_rx}" fill="url(#cyber-halo)"/>'

    svg = []
    # Note: viewBox sans fond global, fond transparent
    svg.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size_px} {size_px}" width="{size_px}" height="{size_px}">')
    if defs:
        svg.append(f'<defs>{defs}</defs>')

    # Tuile aux bords arrondis (l'extérieur des coins est 100% transparent !)
    svg.append(f'<rect x="{margin}" y="{margin}" width="{size_px - 2*margin}" height="{size_px - 2*margin}" rx="{tile_rx}" fill="{bg_card}" stroke="{border_stroke}" stroke-width="2"/>')
    if halo_rect:
        svg.append(halo_rect)

    # Modules
    for r in range(qr_size):
        for c in range(qr_size):
            if is_finder(r, c) or is_center(r, c):
                continue
            if matrix[r][c]:
                x = (c + border_modules) * cell + pad
                y = (r + border_modules) * cell + pad
                svg.append(f'<rect x="{x:.2f}" y="{y:.2f}" width="{dot_size:.2f}" height="{dot_size:.2f}" rx="{rx:.2f}" fill="{module_col}"/>')

    # Finder patterns
    def render_finder(top_r, left_c):
        fx = (left_c + border_modules) * cell
        fy = (top_r + border_modules) * cell
        f_size = 7 * cell
        svg.append(f'<rect x="{fx:.2f}" y="{fy:.2f}" width="{f_size:.2f}" height="{f_size:.2f}" rx="{cell*0.75:.2f}" fill="{finder_ring}"/>')
        svg.append(f'<rect x="{fx + cell:.2f}" y="{fy + cell:.2f}" width="{5*cell:.2f}" height="{5*cell:.2f}" rx="{cell*0.5:.2f}" fill="{bg_card}"/>')
        svg.append(f'<rect x="{fx + 2*cell:.2f}" y="{fy + 2*cell:.2f}" width="{3*cell:.2f}" height="{3*cell:.2f}" rx="{cell*0.35:.2f}" fill="{finder_eye}"/>')

    render_finder(0, 0)
    render_finder(0, qr_size - 7)
    render_finder(qr_size - 7, 0)

    # Badge central
    bx = (c_start + border_modules) * cell
    by = (c_start + border_modules) * cell
    b_size = 7 * cell
    svg.append(f'<rect x="{bx:.2f}" y="{by:.2f}" width="{b_size:.2f}" height="{b_size:.2f}" rx="{cell*0.9:.2f}" fill="{badge_bg}" stroke="{badge_stroke}" stroke-width="2.5"/>')

    # 3 barres EzHoraire
    scale = (b_size / 100.0) * 0.74
    tx = bx + (b_size - 100 * scale) / 2
    ty = by + (b_size - 100 * scale) / 2
    svg.append(f'<g transform="translate({tx:.2f}, {ty:.2f}) scale({scale:.4f})">')
    svg.append(f'<rect x="21" y="22" width="58" height="15" rx="7.5" fill="{bar1}"/>')
    svg.append(f'<rect x="21" y="42.5" width="40" height="15" rx="7.5" fill="{bar2}"/>')
    svg.append(f'<rect x="21" y="63" width="58" height="15" rx="7.5" fill="{bar3}"/>')
    svg.append('</g>')

    svg.append('</svg>')
    return "\n".join(svg)


def generate_svg_pure_transparent(matrix, style="black", size_px=800, border_modules=4):
    """Génère un SVG sans fond (transparent intégral, aucune tuile)."""
    qr_size = len(matrix)
    total_modules = qr_size + 2 * border_modules
    cell = size_px / total_modules
    pad = cell * 0.04
    rx = cell * 0.28
    dot_size = cell - 2 * pad

    def is_finder(r, c):
        if r < 7 and c < 7: return True
        if r < 7 and c >= qr_size - 7: return True
        if r >= qr_size - 7 and c < 7: return True
        return False

    c_start = (qr_size - 7) // 2
    c_end = c_start + 6
    def is_center(r, c):
        return c_start <= r <= c_end and c_start <= c <= c_end

    if style == "black":
        module_col = "#111317"
        accent_col = "#2456e0"
    elif style == "white":
        module_col = "#ffffff"
        accent_col = "#5b86ff"
    elif style == "blue":
        module_col = "#2456e0"
        accent_col = "#2456e0"

    svg = []
    svg.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size_px} {size_px}" width="{size_px}" height="{size_px}" fill="none">')

    # Modules
    for r in range(qr_size):
        for c in range(qr_size):
            if is_finder(r, c) or is_center(r, c):
                continue
            if matrix[r][c]:
                x = (c + border_modules) * cell + pad
                y = (r + border_modules) * cell + pad
                svg.append(f'<rect x="{x:.2f}" y="{y:.2f}" width="{dot_size:.2f}" height="{dot_size:.2f}" rx="{rx:.2f}" fill="{module_col}"/>')

    # Finders ajourés
    def render_finder(top_r, left_c):
        fx = (left_c + border_modules) * cell
        fy = (top_r + border_modules) * cell
        svg.append(f'<rect x="{fx + cell/2:.2f}" y="{fy + cell/2:.2f}" width="{6*cell:.2f}" height="{6*cell:.2f}" rx="{cell*0.75:.2f}" fill="none" stroke="{accent_col}" stroke-width="{cell:.2f}"/>')
        svg.append(f'<rect x="{fx + 2*cell:.2f}" y="{fy + 2*cell:.2f}" width="{3*cell:.2f}" height="{3*cell:.2f}" rx="{cell*0.35:.2f}" fill="{accent_col}"/>')

    render_finder(0, 0)
    render_finder(0, qr_size - 7)
    render_finder(qr_size - 7, 0)

    # 3 barres sans fond
    bx = (c_start + border_modules) * cell
    by = (c_start + border_modules) * cell
    b_size = 7 * cell
    scale = (b_size / 100.0) * 0.8
    tx = bx + (b_size - 100 * scale) / 2
    ty = by + (b_size - 100 * scale) / 2
    svg.append(f'<g transform="translate({tx:.2f}, {ty:.2f}) scale({scale:.4f})">')
    svg.append(f'<rect x="21" y="22" width="58" height="15" rx="7.5" fill="{module_col}"/>')
    svg.append(f'<rect x="21" y="42.5" width="40" height="15" rx="7.5" fill="{accent_col}"/>')
    svg.append(f'<rect x="21" y="63" width="58" height="15" rx="7.5" fill="{module_col}"/>')
    svg.append('</g>')

    svg.append('</svg>')
    return "\n".join(svg)


def generate_svg_card(matrix, theme="dark", width=1200, height=1600):
    """Génère une affiche / présentoir haute fidélité prêt à imprimer ou à afficher."""
    qr_svg = generate_svg_tile_qr(matrix, theme=theme, size_px=760, border_modules=4)
    b64_qr = base64.b64encode(qr_svg.encode("utf-8")).decode("ascii")

    is_dark = theme == "dark"
    bg_main = "#0b0d12" if is_dark else "#f4f5f8"
    card_bg = "#12151c" if is_dark else "#ffffff"
    card_stroke = "rgba(255, 255, 255, 0.08)" if is_dark else "rgba(0, 0, 0, 0.06)"
    text_primary = "#f1f3f7" if is_dark else "#11141a"
    text_secondary = "#8b94a5" if is_dark else "#606877"
    accent = "#5b86ff" if is_dark else "#2456e0"
    pill_bg = "rgba(91, 134, 255, 0.12)" if is_dark else "rgba(36, 86, 224, 0.08)"
    pill_border = "rgba(91, 134, 255, 0.3)" if is_dark else "rgba(36, 86, 224, 0.2)"

    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}">
  <defs>
    <radialGradient id="top-halo" cx="50%" cy="15%" r="60%">
      <stop offset="0%" stop-color="{accent}" stop-opacity="{0.18 if is_dark else 0.07}"/>
      <stop offset="100%" stop-color="{bg_main}" stop-opacity="0"/>
    </radialGradient>
    <filter id="card-shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="24" stdDeviation="36" flood-color="{'#000000' if is_dark else '#1a2233'}" flood-opacity="{0.55 if is_dark else 0.12}"/>
    </filter>
  </defs>

  <rect width="100%" height="100%" fill="{bg_main}"/>
  <rect width="100%" height="100%" fill="url(#top-halo)"/>

  <g filter="url(#card-shadow)">
    <rect x="150" y="110" width="900" height="1380" rx="44" fill="{card_bg}" stroke="{card_stroke}" stroke-width="2"/>
  </g>

  <g transform="translate(600, 220)" text-anchor="middle">
    <rect x="-42" y="-42" width="84" height="84" rx="22" fill="{accent}"/>
    <g transform="translate(-42, -42) scale(0.84)">
      <rect x="21" y="22" width="58" height="15" rx="7.5" fill="#ffffff"/>
      <rect x="21" y="42.5" width="40" height="15" rx="7.5" fill="{'#14171f' if is_dark else '#ffffff'}"/>
      <rect x="21" y="63" width="58" height="15" rx="7.5" fill="#ffffff"/>
    </g>

    <text y="105" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="52" font-weight="800" fill="{text_primary}" letter-spacing="-1">EzHoraire</text>
    <text y="152" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="24" font-weight="500" fill="{text_secondary}" letter-spacing="0.2">Les horaires de cours, lisibles sur téléphone</text>
  </g>

  <g transform="translate(220, 440)">
    <image href="data:image/svg+xml;base64,{b64_qr}" width="760" height="760" x="0" y="0"/>
  </g>

  <g transform="translate(600, 1270)" text-anchor="middle">
    <rect x="-190" y="-30" width="380" height="60" rx="30" fill="{pill_bg}" stroke="{pill_border}" stroke-width="1.5"/>
    <text y="8" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="24" font-weight="700" fill="{accent}" letter-spacing="0.5">www.ezhoraire.be</text>

    <text y="82" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="20" font-weight="500" fill="{text_secondary}">Scannez avec l'appareil photo de votre smartphone</text>
    <text y="112" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="16" font-weight="500" fill="{text_secondary}" opacity="0.75">Accès instantané sans téléchargement d'application</text>
  </g>
</svg>
"""


def render_png_transparent_canvas(svg_content, out_png_path, width, height):
    """Rend un SVG sur un canevas 100% transparent via Brave headless."""
    b64 = base64.b64encode(svg_content.encode("utf-8")).decode("ascii")
    html = f"""<!doctype html><html><head><style>
    * {{ margin:0; padding:0; }}
    html, body {{ background: transparent !important; }}
    </style></head><body>
    <img src="data:image/svg+xml;base64,{b64}" width="{width}" height="{height}" style="display:block;">
    </body></html>"""

    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False) as f:
        f.write(html)
        tmp_html = f.name

    try:
        cmd = [
            BRAVE,
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--default-background-color=00000000",
            f"--window-size={width},{height}",
            f"--screenshot={out_png_path}",
            f"file://{tmp_html}",
        ]
        subprocess.run(cmd, check=True, capture_output=True)
    finally:
        if os.path.exists(tmp_html):
            os.remove(tmp_html)


def main():
    parser = argparse.ArgumentParser(description="Générateur de QR codes EzHoraire avec tuiles à bords arrondis")
    parser.add_argument("--url", default=DEFAULT_URL, help="URL cible du QR code")
    parser.add_argument("--output", default="qr", help="Dossier de sortie")
    args = parser.parse_args()

    out_dir = os.path.abspath(args.output)
    os.makedirs(out_dir, exist_ok=True)

    print(f"[*] Génération de la matrice QR (Error Correction H) pour : {args.url}")
    matrix = build_qr_matrix(args.url)

    # 1. Versions Tuiles aux Bords Arrondis (Extérieur des coins 100% transparent, AUCUN carré blanc !)
    variantes_tuiles = [
        ("qr-dark", "dark"),
        ("qr-light", "light"),
        ("qr-cyber", "cyber"),
    ]

    sz = 800
    for name, theme in variantes_tuiles:
        svg_content = generate_svg_tile_qr(matrix, theme=theme, size_px=sz)
        svg_path = os.path.join(out_dir, f"{name}.svg")
        with open(svg_path, "w", encoding="utf-8") as f:
            f.write(svg_content)

        png_path = os.path.join(out_dir, f"{name}.png")
        render_png_transparent_canvas(svg_content, png_path, sz, sz)

        png_hd_path = os.path.join(out_dir, f"{name}-hd.png")
        render_png_transparent_canvas(svg_content, png_hd_path, sz * 2, sz * 2)
        print(f"  -> Tuile à bords arrondis créée (coins extérieurs transparents) : {png_path}")

    # 2. Versions Sans Fond (Modules seuls sans tuile)
    variantes_sans_fond = [
        ("qr-noir-sans-fond", "black"),
        ("qr-blanc-sans-fond", "white"),
        ("qr-bleu-sans-fond", "blue"),
    ]
    for name, style in variantes_sans_fond:
        svg_content = generate_svg_pure_transparent(matrix, style=style, size_px=sz)
        svg_path = os.path.join(out_dir, f"{name}.svg")
        with open(svg_path, "w", encoding="utf-8") as f:
            f.write(svg_content)

        png_path = os.path.join(out_dir, f"{name}.png")
        render_png_transparent_canvas(svg_content, png_path, sz, sz)

        png_hd_path = os.path.join(out_dir, f"{name}-hd.png")
        render_png_transparent_canvas(svg_content, png_hd_path, sz * 2, sz * 2)
        print(f"  -> QR sans fond pur créé : {png_path}")

    # 3. Affiches / Présentoirs
    cards = [
        ("qr-card-dark", "dark", 1200, 1600),
        ("qr-card-light", "light", 1200, 1600),
    ]
    for name, theme, w, h in cards:
        svg_content = generate_svg_card(matrix, theme=theme, width=w, height=h)
        svg_path = os.path.join(out_dir, f"{name}.svg")
        with open(svg_path, "w", encoding="utf-8") as f:
            f.write(svg_content)

        png_path = os.path.join(out_dir, f"{name}.png")
        render_png_transparent_canvas(svg_content, png_path, w, h)
        print(f"  -> Présentoir créé : {png_path}")

    print("[✓] Tous les QR codes et tuiles arrondies ont été générés avec succès !")


if __name__ == "__main__":
    main()
