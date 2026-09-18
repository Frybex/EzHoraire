# -*- coding: utf-8 -*-
"""Logo EzHoraire : le Monolithe (E + Z en une seule forme).

La barre haute et la barre basse servent aux deux lettres ; la barre du milieu
du E et la diagonale du Z forment la zone d'accent. Tout le glyphe est un seul
tracé, l'accent est ce même tracé découpé entre les deux barres.
Dessin choisi dans logos/propositions/v3 (piste 5, version d'origine).

Écrit à la racine du site : favicon.svg, favicon.ico, apple-touch-icon.png,
icon-192.png, icon-512.png, icon-maskable-512.png, logo-email.png (logo de
l'e-mail de mot de passe, affiché en 46 px, rendu ×3).
Écrit ici : logo.svg, glyphe-sombre.svg, glyphe-clair.svg, logo-512.png.

Usage : python3 logos/monolithe/build.py   (nécessite Pillow + Brave)
"""
import base64
import os
import subprocess
import tempfile

from PIL import Image

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(os.path.dirname(ICI))
BRAVE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"

ACCENT = "#5b86ff"
ACCENT_FONCE = "#2456e0"   # accent sur fond clair (--accent du site)
CREME = "#f4f5f7"
INK = "#17191d"
TUILE_HAUT, TUILE_BAS = "#232832", "#101216"

# Contour du glyphe dans un carré 100 × 100 (épaisseur 13, congés 5 / 3,5 / 1,2).
GLYPHE = ("M18 26.5A5 5 0 0 1 23 21.5L77 21.5A5 5 0 0 1 82 26.5L82 32.12A7 7 0 0 1 80.55 36.39"
          "L62.52 59.87A3.5 3.5 0 0 0 65.3 65.5L77 65.5A5 5 0 0 1 82 70.5L82 73.5A5 5 0 0 1 77 78.5"
          "L23 78.5A5 5 0 0 1 18 73.5L18 70.5A5 5 0 0 1 23 65.5L40.08 65.5A3.5 3.5 0 0 0 42.86 64.13"
          "L47.23 58.43A1.2 1.2 0 0 0 46.28 56.5L23 56.5A5 5 0 0 1 18 51.5L18 48.5A5 5 0 0 1 23 43.5"
          "L58.11 43.5A1.2 1.2 0 0 0 59.06 43.03L64.13 36.43A1.2 1.2 0 0 0 63.17 34.5L23 34.5"
          "A5 5 0 0 1 18 29.5Z")
ZONE_ACCENT = (34.5, 65.5)   # entre le bas de la barre haute et le haut de la barre basse


def glyphe(encre=CREME, accent=ACCENT, id_="ezm"):
    y0, y1 = ZONE_ACCENT
    return (f'<clipPath id="{id_}"><rect y="{y0}" width="100" height="{y1 - y0:g}"/></clipPath>'
            f'<path d="{GLYPHE}" fill="{encre}"/>'
            f'<path d="{GLYPHE}" fill="{accent}" clip-path="url(#{id_})"/>')


def tuile(rx=20, echelle=1.0, halo=False, arete=False):
    """Glyphe sur tuile sombre. rx=0 : carré plein (iOS, masquable)."""
    halo_def = halo_rect = arete_rect = ""
    if halo:
        halo_def = (f'<radialGradient id="h" cx=".25" cy=".05" r=".9"><stop offset="0" stop-color="{ACCENT}" '
                    f'stop-opacity=".22"/><stop offset="1" stop-color="{ACCENT}" stop-opacity="0"/></radialGradient>')
        halo_rect = f'<rect width="100" height="100" rx="{rx}" fill="url(#h)"/>'
    if arete and rx:
        arete_rect = (f'<rect x=".5" y=".5" width="99" height="99" rx="{rx - .5}" fill="none" '
                      f'stroke="#fff" stroke-opacity=".08"/>')
    g = glyphe()
    if echelle != 1:
        g = f'<g transform="translate(50 50) scale({echelle}) translate(-50 -50)">{g}</g>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><title>EzHoraire</title>'
            f'<defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{TUILE_HAUT}"/>'
            f'<stop offset="1" stop-color="{TUILE_BAS}"/></linearGradient>{halo_def}</defs>'
            f'<rect width="100" height="100" rx="{rx}" fill="url(#t)"/>{halo_rect}{g}{arete_rect}</svg>')


def glyphe_seul(encre, accent):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="12 12 76 76"><title>EzHoraire</title>'
            f'{glyphe(encre, accent)}</svg>')


# ---------------------------------------------------------------- rendu PNG

def _uri(svg):
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()


def rendre(travaux, marge=8):
    """travaux : liste (clé, svg, px). Une seule capture Brave pour tout, puis
    découpe. Les petites tailles sont rendues ×4 puis réduites."""
    poses, x, y, ligne = [], marge, marge, 0
    for cle, svg, px in travaux:
        rendu = px * 4 if px < 128 else px
        if x + rendu + marge > 2000:
            x, y, ligne = marge, y + ligne + marge, 0
        poses.append((cle, svg, px, rendu, x, y))
        x += rendu + marge
        ligne = max(ligne, rendu)
    larg, haut = 2000, y + ligne + marge
    balises = "".join(
        f'<img src="{_uri(svg)}" style="position:absolute;left:{px_x}px;top:{px_y}px;'
        f'width:{rendu}px;height:{rendu}px">'
        for _, svg, _, rendu, px_x, px_y in poses)
    with tempfile.TemporaryDirectory() as d:
        f_html, f_png = os.path.join(d, "p.html"), os.path.join(d, "o.png")
        with open(f_html, "w") as fh:
            fh.write('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;'
                     'background:transparent}</style>' + balises)
        subprocess.run([BRAVE, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                        "--force-device-scale-factor=1", "--default-background-color=00000000",
                        f"--window-size={larg},{haut}", f"--screenshot={f_png}",
                        "file://" + f_html], check=True, capture_output=True, timeout=300)
        planche = Image.open(f_png).convert("RGBA")
    sortie = {}
    for cle, _, px, rendu, px_x, px_y in poses:
        im = planche.crop((px_x, px_y, px_x + rendu, px_y + rendu))
        sortie[cle] = im if rendu == px else im.resize((px, px), Image.LANCZOS)
    return sortie


def main():
    ecrire = lambda chemin, texte: open(chemin, "w").write(texte)
    racine = lambda f: os.path.join(RACINE, f)
    ici = lambda f: os.path.join(ICI, f)

    favicon = tuile()
    grand = tuile(rx=22, halo=True, arete=True)
    carre = tuile(rx=0, halo=True)
    masquable = tuile(rx=0, halo=True, echelle=.8)   # glyphe dans la zone sûre (cercle 80 %)

    ecrire(racine("favicon.svg"), favicon)
    ecrire(ici("logo.svg"), grand)
    ecrire(ici("glyphe-sombre.svg"), glyphe_seul(CREME, ACCENT))
    ecrire(ici("glyphe-clair.svg"), glyphe_seul(INK, ACCENT_FONCE))

    images = rendre([("512", grand, 512), ("192", grand, 192), ("apple", carre, 180),
                     ("masque", masquable, 512), ("i16", favicon, 16), ("i32", favicon, 32),
                     ("i48", favicon, 48), ("email", grand, 138)])
    images["512"].save(racine("icon-512.png"), optimize=True)
    images["512"].save(ici("logo-512.png"), optimize=True)
    images["192"].save(racine("icon-192.png"), optimize=True)
    images["masque"].convert("RGB").save(racine("icon-maskable-512.png"), optimize=True)
    images["apple"].convert("RGB").save(racine("apple-touch-icon.png"), optimize=True)
    images["email"].save(racine("logo-email.png"), optimize=True)
    images["i48"].save(racine("favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)],
                       append_images=[images["i16"], images["i32"]])


if __name__ == "__main__":
    main()
    print("ok")
