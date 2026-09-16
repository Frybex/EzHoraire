# -*- coding: utf-8 -*-
"""Logos EzHoraire alignés sur la DA du site (mat, relief, filet 1 px, accent bleu).

Quatre propositions, même famille :
  a-mat      : Z crème sur tuile sombre, diagonale en accent.
  b-accent   : Z entièrement en accent, arête haute allumée.
  c-degrade  : contre-pied, Z en dégradé bleu -> violet.
  d-barres   : sans lettre, trois barres = lignes d'agenda, la médiane en accent.

Détails cachés (visibles en grand, disparaissent en favicon) :
  lignes d'heures en filigrane, halo d'accent en haut à gauche,
  arête supérieure d'1 px allumée — exactement le langage des boutons du site.

Usage : python3 build.py   (nécessite Pillow + Brave pour le rendu PNG)
"""
import base64, json, math, os, subprocess, tempfile

from PIL import Image

ICI = os.path.dirname(os.path.abspath(__file__))
BRAVE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"

# Jetons repris de index.html
ACCENT = "#2456e0"          # --accent (clair)
ACCENT_CLAIR = "#5b86ff"    # accent éclairci pour fond sombre
INK = "#17191d"             # --ink
CREME = "#f4f5f7"           # --bg
TUILE_HAUT, TUILE_BAS = "#232832", "#101216"


def arrondi(points, r=4.5, fermer=True):
    """Chemin SVG passant par `points`, coins adoucis (rayon ≈ r)."""
    n = len(points)
    d = []
    for i in range(n):
        p0, p1, p2 = points[(i - 1) % n], points[i], points[(i + 1) % n]
        for voisin, sortie in ((p0, False), (p2, True)):
            vx, vy = voisin[0] - p1[0], voisin[1] - p1[1]
            lg = math.hypot(vx, vy)
            t = min(r, lg / 2) / lg
            pt = (p1[0] + vx * t, p1[1] + vy * t)
            if not sortie:
                d.append(("L" if d else "M", pt))
            else:
                d.append(("Q", p1, pt))
    out = ""
    for seg in d:
        if seg[0] == "Q":
            out += f"Q{seg[1][0]:.2f} {seg[1][1]:.2f} {seg[2][0]:.2f} {seg[2][1]:.2f}"
        else:
            out += f"{seg[0]}{seg[1][0]:.2f} {seg[1][1]:.2f}"
    return out + ("Z" if fermer else "")


def z_points(x0=21, y0=22, x1=79, y1=78, e=15, c=3):
    """Contour du Z : deux barres pleines reliées par la diagonale."""
    return [(x0, y0), (x1, y0), (x0 + c, y1 - e), (x1, y1 - e),
            (x1, y1), (x0, y1), (x1 - c, y0 + e), (x0, y0 + e)]


def z_path(petit=False):
    return arrondi(z_points(e=17, c=2) if petit else z_points(), r=5 if petit else 4.5)


def barres_path(petit=False):
    """Trois barres d'agenda ; renvoie une liste (chemin, accent ?)."""
    h, r = (15, 7.5) if petit else (13, 6.5)
    ys = (22, 42.5, 63) if petit else (23, 43.5, 64)
    w = (58, 40, 58) if petit else (56, 38, 56)
    return [(f'<rect x="21" y="{y}" width="{w[i]}" height="{h}" rx="{r}"/>', i == 1)
            for i, y in enumerate(ys)]


def svg_marque(variante, encre=None, accent=None):
    """Le signe seul, sans tuile. encre=None -> currentColor (à inliner dans la page ;
    un SVG chargé via <img> n'hérite pas de la couleur du texte)."""
    encre = encre or "currentColor"
    accent = accent or ACCENT
    defs = ""
    if variante == "d-barres":
        corps = "".join(b.replace("/>", f' fill="{accent if a else encre}"/>')
                        for b, a in barres_path())
    elif variante == "c-degrade":
        defs = ('<defs><linearGradient id="g" x1=".05" y1="0" x2=".95" y2="1">'
                '<stop offset="0" stop-color="#7fa6ff"/><stop offset=".52" stop-color="#2f5fe8"/>'
                '<stop offset="1" stop-color="#6d31e8"/></linearGradient></defs>')
        corps = f'<path d="{z_path()}" fill="url(#g)"/>'
    elif variante == "b-accent":
        corps = f'<path d="{z_path()}" fill="{accent}"/>'
    else:  # a-mat
        defs = '<defs><clipPath id="zd"><path d="M21 37H79V63H21Z"/></clipPath></defs>'
        corps = (f'<path d="{z_path()}" fill="{encre}"/>'
                 f'<path d="{z_path()}" fill="{accent}" clip-path="url(#zd)"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 19 64 62">'
            f'<title>EzHoraire</title>{defs}{corps}</svg>')


def svg_tuile(variante, petit=False, rond=True, echelle=1.0, sombre=True):
    r = 0 if not rond else (20 if petit else 22)
    accent = ACCENT_CLAIR if sombre else ACCENT
    encre = CREME if sombre else INK
    haut, bas = (TUILE_HAUT, TUILE_BAS) if sombre else ("#ffffff", "#e9ecf2")
    filet = "rgba(255,255,255,.075)" if sombre else "rgba(23,25,29,.06)"
    reflet = "rgba(255,255,255,.18)" if sombre else "rgba(255,255,255,.95)"
    halo = f'{accent}33' if sombre else f'{accent}1f'

    defs = [f'<linearGradient id="t" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" stop-color="{haut}"/><stop offset="1" stop-color="{bas}"/></linearGradient>']
    fonds = [f'<rect width="100" height="100" rx="{r}" fill="url(#t)"/>']
    if not petit:
        defs.append(f'<radialGradient id="h" cx=".26" cy=".08" r=".9">'
                    f'<stop offset="0" stop-color="{halo}"/>'
                    f'<stop offset="1" stop-color="{halo}" stop-opacity="0"/></radialGradient>')
        defs.append(f'<clipPath id="c"><rect width="100" height="100" rx="{r}"/></clipPath>')
        fonds.append(f'<rect width="100" height="100" rx="{r}" fill="url(#h)"/>')
        lignes = "".join(f'<path d="M0 {y}H100"/>' for y in (28, 44, 60, 76))
        fonds.append(f'<g clip-path="url(#c)" stroke="{filet}" stroke-width="1">{lignes}</g>')

    if variante == "d-barres":
        signe = "".join(b.replace("/>", f' fill="{accent if a else encre}"/>')
                        for b, a in barres_path(petit))
    elif variante == "c-degrade":
        defs.append('<linearGradient id="g" x1=".05" y1="0" x2=".95" y2="1">'
                    '<stop offset="0" stop-color="#7fa6ff"/><stop offset=".52" stop-color="#2f5fe8"/>'
                    '<stop offset="1" stop-color="#6d31e8"/></linearGradient>')
        signe = f'<path d="{z_path(petit)}" fill="url(#g)"/>'
        if not petit:
            signe += f'<path d="{z_path(petit)}" fill="#fff" opacity=".28" clip-path="url(#zb)"/>'
            defs.append('<clipPath id="zb"><path d="M21 22H79V25.6H21Z"/></clipPath>')
    elif variante == "b-accent":
        signe = f'<path d="{z_path(petit)}" fill="{accent}"/>'
        if not petit:
            signe += f'<path d="{z_path(petit)}" fill="#fff" opacity=".3" clip-path="url(#zb)"/>'
            defs.append('<clipPath id="zb"><path d="M21 22H79V25.4H21Z"/></clipPath>')
    else:  # a-mat : diagonale en accent
        signe = f'<path d="{z_path(petit)}" fill="{encre}"/>'
        # la bande accent couvre exactement la diagonale, entre les deux barres
        y1, y2 = (37, 63) if not petit else (39, 61)
        signe += (f'<path d="{z_path(petit)}" fill="{accent}" clip-path="url(#zd)"/>')
        defs.append(f'<clipPath id="zd"><path d="M21 {y1}H79V{y2}H21Z"/></clipPath>')

    if echelle != 1.0:
        signe = f'<g transform="translate({50 * (1 - echelle):.2f} {50 * (1 - echelle):.2f}) scale({echelle})">{signe}</g>'

    arete = ""
    if not petit and rond:
        defs.append(f'<linearGradient id="e" x1="0" y1="0" x2="0" y2="1">'
                    f'<stop offset="0" stop-color="{reflet}"/>'
                    f'<stop offset=".42" stop-color="{reflet}" stop-opacity="0"/></linearGradient>')
        arete = f'<rect x=".5" y=".5" width="99" height="99" rx="{r - .5}" fill="none" stroke="url(#e)"/>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
            f'<title>EzHoraire</title><defs>{"".join(defs)}</defs>'
            f'{"".join(fonds)}{signe}{arete}</svg>')


# ---------------------------------------------------------------- rendu PNG
# Tous les PNG sont rendus en une seule passe : une page qui pose chaque image
# à sa taille exacte, une capture, puis découpe. (Un Brave par image = trop lent.)

def _uri(svg):
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()


def rendre(travaux, marge=8):
    """travaux : liste (clé, svg, px). Renvoie {clé: Image}. Les tailles < 128
    sont rendues x4 puis réduites, pour un anti-crénelage propre."""
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
        open(f_html, "w").write(
            '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;'
            'background:transparent}</style>' + balises)
        subprocess.run([BRAVE, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                        "--force-device-scale-factor=1", "--default-background-color=00000000",
                        f"--window-size={larg},{haut}", f"--screenshot={f_png}",
                        "file://" + f_html], capture_output=True, timeout=300)
        planche = Image.open(f_png).convert("RGBA")
    sortie = {}
    for cle, _, px, rendu, px_x, px_y in poses:
        im = planche.crop((px_x, px_y, px_x + rendu, px_y + rendu))
        sortie[cle] = im if rendu == px else im.resize((px, px), Image.LANCZOS)
    return sortie


def sortir_tout(variantes):
    travaux, dossiers = [], {}
    for v in variantes:
        d = os.path.join(ICI, v)
        os.makedirs(d, exist_ok=True)
        dossiers[v] = d
        plein, petit = svg_tuile(v), svg_tuile(v, petit=True)
        carre_ = svg_tuile(v, rond=False)
        masque = svg_tuile(v, rond=False, echelle=0.72)
        travaux += [((v, "logo-512.png"), plein, 512), ((v, "icon-512.png"), plein, 512),
                    ((v, "icon-192.png"), plein, 192), ((v, "apple-touch-icon.png"), carre_, 180),
                    ((v, "icon-maskable-512.png"), masque, 512)]
        travaux += [((v, f"ico{t}"), petit, t) for t in (16, 32, 48)]
    images = rendre(travaux)
    for v in variantes:
        d = dossiers[v]
        p = lambda f: os.path.join(d, f)
        ecrire = lambda f, t: open(p(f), "w").write(t)
        ecrire("logo.svg", svg_tuile(v))
        ecrire("logo-clair.svg", svg_tuile(v, sombre=False))
        ecrire("marque.svg", svg_marque(v))
        ecrire("marque-claire.svg", svg_marque(v, INK, ACCENT))
        ecrire("marque-sombre.svg", svg_marque(v, CREME, ACCENT_CLAIR))
        ecrire("favicon.svg", svg_tuile(v, petit=True))
        ecrire("icon-maskable.svg", svg_tuile(v, rond=False, echelle=0.72))
        for f in ("logo-512.png", "icon-512.png", "icon-192.png", "icon-maskable-512.png"):
            images[(v, f)].save(p(f), optimize=True)
        images[(v, "apple-touch-icon.png")].convert("RGB").save(p("apple-touch-icon.png"), optimize=True)
        icos = [images[(v, f"ico{t}")] for t in (16, 32, 48)]
        icos[-1].save(p("favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)], append_images=icos[:2])
        ecrire("site.webmanifest", json.dumps({
            "name": "EzHoraire", "short_name": "EzHoraire",
            "icons": [{"src": "/icon-192.png", "sizes": "192x192", "type": "image/png"},
                      {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png"},
                      {"src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png",
                       "purpose": "maskable"}],
            "theme_color": TUILE_BAS, "background_color": TUILE_BAS,
            "display": "standalone", "start_url": "/",
        }, indent=2, ensure_ascii=False) + "\n")


VARIANTES = ["a-mat", "b-accent", "c-degrade", "d-barres"]

if __name__ == "__main__":
    sortir_tout(VARIANTES)
    print("ok :", ", ".join(VARIANTES))
