"""Génère le logo EZ (calendrier 4x5 avec « EZ ») en SVG + PNG + ICO.

Variantes :
  - v1-original : reproduction fidèle du croquis, sans les 5 barres du bas.
  - v2-connecte : les trous sont comblés (rectangle rouge en haut du Z,
                  rectangle noir au bout de la barre basse du E).
  - v3-negatif  : fond noir, cases sombres, la grille découpe les lettres.
  - v4-bleu     : fond bleu plein, pas de cases visibles, la grille n'apparaît
                  que comme découpe dans les lettres.
  v3 et v4 : lettres connectées, arc du E propre, diagonale du Z droite.

Usage : python3 generate.py   (nécessite Pillow)
"""
import json
import math
import os

from PIL import Image, ImageDraw

ICI = os.path.dirname(os.path.abspath(__file__))

# Palette relevée sur le croquis
BLEU = "#0245B6"
ROUGE = "#E9170E"
NOIR = "#1A1A15"
CREME = "#F4F0E4"
GRIS = "#54514B"

# Grille : 4 colonnes x 5 lignes, traits de 10, cases 148 x 98
T, CW, RH = 10, 148, 98
COLS, ROWS = 4, 5
PX, PY = CW + T, RH + T  # pas de la grille : 158 x 108
W = COLS * CW + (COLS + 1) * T  # 642
H = ROWS * RH + (ROWS + 1) * T  # 550


def L1(y):  # bord gauche de la diagonale du Z
    return 587 - 0.6 * y


def L2(y):  # bord droit de l'ombre noire de la diagonale
    return 699 - 0.6 * y


def LR1(y):  # bord gauche de la bande rouge de la barre basse du Z
    return 1133.1 - 1.33 * y


LARGEUR_TRAIT_Z = 62  # version retouchée : largeur de la bande couleur de la diagonale


def rect(x0, y0, x1, y1):
    return [("M", x0, y0), ("L", x1, y0), ("L", x1, y1), ("L", x0, y1)]


def rect_arrondi(x0, y0, x1, y1, r):
    return [("M", x0 + r, y0), ("L", x1 - r, y0), ("A", r, 1, x1, y0 + r),
            ("L", x1, y1 - r), ("A", r, 1, x1 - r, y1), ("L", x0 + r, y1),
            ("A", r, 1, x0, y1 - r), ("L", x0, y0 + r), ("A", r, 1, x0 + r, y0)]


def formes(connecte, retouche=False):
    """Lettres : liste (rôle, chemin) dans l'ordre de peinture, rôle ∈ B/R/N.
    Chemin = liste de ('M'|'L', x, y) ou ('A', r, sweep, x, y).
    retouche : arc du bas du E symétrique de celui du haut (il repose franchement
    sur la dernière ligne) et diagonale du Z en bandes droites, sans bosse."""
    f = []

    # ----- E -----
    # Bleu : barre haute + haut du fût, et fond du coin bas-gauche
    f.append(("B", [("M", 5, 5), ("L", 321, 5), ("L", 321, 113), ("L", 88, 113),
                    ("L", 88, 329), ("L", 5, 329)]))
    f.append(("B", rect(5, 437, 88, 545)))
    # Noir : quart de disque en haut (case r0c1)
    f.append(("N", [("M", 168, 113), ("L", 168, 108), ("A", 98, 1, 266, 10),
                    ("L", 321, 10), ("L", 321, 113)]))
    # Rouge : trait vertical + barre du milieu + barre basse
    f.append(("R", [("M", 88, 113), ("L", 128, 113), ("L", 128, 221), ("L", 245.5, 221),
                    ("L", 245.5, 329), ("L", 128, 329), ("L", 128, 437), ("L", 299.5, 437),
                    ("L", 299.5, 545), ("L", 88, 545)]))
    if retouche:
        f[-1] = ("R", [("M", 88, 113), ("L", 128, 113), ("L", 128, 221), ("L", 245.5, 221),
                       ("L", 245.5, 329), ("L", 128, 329), ("L", 128, 437), ("L", 321, 437),
                       ("L", 321, 545), ("L", 88, 545)])
    # Noir : bas du fût, coin arrondi en bas à gauche
    f.append(("N", [("M", 5, 329), ("L", 88, 329), ("L", 88, 540), ("A", 125, 1, 10, 442),
                    ("L", 5, 442)]))
    # Noir : quart de disque de la barre basse
    if retouche:
        # miroir exact du quart de disque du haut : même rayon, repose à plat sur la ligne du bas
        f.append(("N", [("M", 168, 437), ("L", 168, 442), ("A", 98, 0, 266, 540),
                        ("L", 266, 545), ("L", 321, 545), ("L", 321, 437)]))
    else:
        xd = 321 if connecte else 299.5
        f.append(("N", [("M", xd, 437), ("L", xd, 540), ("L", 299.5, 540),
                        ("A", 116, 1, 299.5 - math.sqrt(116**2 - 13**2), 437)]))

    # ----- Z -----
    # Ombre noire de la diagonale (entre L1 et L2) + barre basse noire
    f.append(("N", [("M", L1(5), 5), ("L", 637, 5), ("L", 637, (699 - 637) / 0.6),
                    ("L", L2(437), 437), ("L", L1(437), 437)]))
    f.append(("N", rect(321, 437, 637, 545)))
    # Barre haute bleue (+ prolongement rouge si connecté)
    f.append(("B", [("M", 383, 5), ("L", L1(5), 5), ("L", L1(113), 113), ("L", 383, 113)]))
    if connecte:
        f.append(("R", rect(321, 5, 383, 113)))
    if retouche:
        # Diagonale : bande rouge puis bleue, bords parallèles
        w = LARGEUR_TRAIT_Z
        f.append(("R", [("M", L1(113), 113), ("L", L1(113) + w, 113),
                        ("L", L1(329) + w, 329), ("L", L1(329), 329)]))
        y_bas = (587 + w - 321) / 0.6  # où le bord droit sort de la colonne
        f.append(("B", [("M", L1(329), 329), ("L", L1(329) + w, 329), ("L", 321, y_bas),
                        ("L", 321, (587 - 321) / 0.6)]))
    else:
        # Diagonale rouge avec coin arrondi en bas à droite
        f.append(("R", [("M", L1(113), 113), ("L", 554, 113), ("L", 554, 224),
                        ("A", 100, 1, 454, 324), ("L", 454, 329), ("L", L1(329), 329)]))
        # Bas de la diagonale en bleu, coupé en biais
        f.append(("B", [("M", L1(329), 329), ("L", 398.5, 329), ("L", 398.5, 494),
                        ("L", 321, 494 + 77.5 * 46 / 72.5), ("L", 321, 437), ("L", L1(437), 437)]))
    # Bande rouge oblique dans la barre basse
    y_sortie = (LR1(0) + 90 - 637) / 1.33
    f.append(("R", [("M", LR1(437), 437), ("L", 637, 437), ("L", 637, y_sortie),
                    ("L", LR1(545) + 90, 545), ("L", LR1(545), 545)]))
    return f


# ---------------------------------------------------------------- Scènes
# Une scène = (liste d'éléments (couleur, chemin, opacité), clip ou None),
# en coordonnées du logo ; le cadrage est donné à part (bornes).

def scene_classique(connecte, ep=T):
    """Style du croquis : cases crème, traits gris par-dessus."""
    d = (ep - T) / 2
    couleurs = {"B": BLEU, "R": ROUGE, "N": NOIR}
    el = [(CREME, rect(-d, -d, W + d, H + d), 1)]
    el += [(couleurs[r], ops, 1) for r, ops in formes(connecte)]
    for i in range(COLS + 1):
        el.append((GRIS, rect(i * PX - d, -d, i * PX + T + d, H + d), 1))
    for j in range(ROWS + 1):
        el.append((GRIS, rect(-d, j * PY - d, W + d, j * PY + T + d), 1))
    return el, None


def scene_plaque(pal, bornes, ep=T, autour=False, rayon=0):
    """Fond plein ; la grille est faite de rainures couleur fond qui découpent les lettres.
    autour : prolonge les cases jusqu'aux bords (icônes d'app)."""
    x0, y0, x1, y1 = bornes
    h = ep / 2
    plaque = rect_arrondi(*bornes, rayon) if rayon else rect(*bornes)
    el = [(pal["fond"], plaque, 1)]
    if autour:
        i_min, i_max = math.floor((x0 - 5) / PX), math.ceil((x1 - 5) / PX)
        j_min, j_max = math.floor((y0 - 5) / PY), math.ceil((y1 - 5) / PY)
    else:
        i_min, i_max, j_min, j_max = 0, COLS, 0, ROWS
    if pal["case"] != pal["fond"]:
        for i in range(i_min, i_max):
            for j in range(j_min, j_max):
                el.append((pal["case"], rect(5 + i * PX + h, 5 + j * PY + h,
                                             5 + (i + 1) * PX - h, 5 + (j + 1) * PY - h), 1))
    el += [(pal[r], ops, 1) for r, ops in formes(connecte=True, retouche=True)]
    # rainures (couvrent aussi les débords des lettres sur le pourtour)
    ya, yb = (y0, y1) if autour else (5 - h, 545 + h)
    xa, xb = (x0, x1) if autour else (5 - h, 637 + h)
    for i in range(i_min, i_max + 1):
        el.append((pal["fond"], rect(5 + i * PX - h, ya, 5 + i * PX + h, yb), 1))
    for j in range(j_min, j_max + 1):
        el.append((pal["fond"], rect(xa, 5 + j * PY - h, xb, 5 + j * PY + h), 1))
    return el, (plaque if rayon else None)


# ---------------------------------------------------------------- SVG

def fmt(v):
    return ("%.2f" % v).rstrip("0").rstrip(".")


def chemin_svg(ops):
    out = []
    for op in ops:
        if op[0] == "A":
            _, r, sweep, x, y = op
            out.append(f"A{fmt(r)} {fmt(r)} 0 0 {sweep} {fmt(x)} {fmt(y)}")
        else:
            out.append(f"{op[0]}{fmt(op[1])} {fmt(op[2])}")
    return "".join(out) + "Z"


def svg(scene, bornes):
    elements, clip = scene
    x0, y0, x1, y1 = bornes
    # regroupe les éléments consécutifs de même couleur en un seul <path>
    paths, cur, d = [], None, ""
    for c, ops, a in elements + [(None, None, 1)]:
        if c != cur and cur is not None:
            paths.append(f'<path fill="{cur}" d="{d}"/>')
            d = ""
        cur = c
        if ops:
            d += chemin_svg(ops)
    corps = "\n  ".join(paths)
    if clip:
        corps = (f'<clipPath id="c"><path d="{chemin_svg(clip)}"/></clipPath>\n  '
                 f'<g clip-path="url(#c)">\n  {corps}\n  </g>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{fmt(x0)} {fmt(y0)} '
            f'{fmt(x1 - x0)} {fmt(y1 - y0)}">\n  <title>EzHoraire</title>\n  {corps}\n</svg>\n')


# ---------------------------------------------------------------- PNG

def centre_arc(x0, y0, x1, y1, r, sweep):
    """Conversion SVG endpoint -> centre (petit arc, sans rotation)."""
    xp, yp = (x0 - x1) / 2, (y0 - y1) / 2
    d2 = xp * xp + yp * yp
    k = math.sqrt(max(0.0, (r * r - d2) / d2)) * (1 if sweep == 1 else -1)
    cx, cy = k * yp + (x0 + x1) / 2, -k * xp + (y0 + y1) / 2
    a0 = math.atan2(y0 - cy, x0 - cx)
    da = math.atan2(y1 - cy, x1 - cx) - a0
    if sweep == 1 and da < 0:
        da += 2 * math.pi
    if sweep == 0 and da > 0:
        da -= 2 * math.pi
    return cx, cy, a0, da


def points(ops):
    pts = []
    for op in ops:
        if op[0] == "A":
            _, r, sweep, x, y = op
            cx, cy, a0, da = centre_arc(*pts[-1], x, y, r, sweep)
            n = 96
            pts += [(cx + r * math.cos(a0 + da * i / n), cy + r * math.sin(a0 + da * i / n))
                    for i in range(1, n + 1)]
        else:
            pts.append((op[1], op[2]))
    return pts


def png(scene, bornes, largeur, ss=8):
    elements, clip = scene
    x0, y0, x1, y1 = bornes
    k = largeur * ss / (x1 - x0)
    taille = (largeur * ss, round((y1 - y0) * k))
    tr = lambda ops: [((x - x0) * k, (y - y0) * k) for x, y in points(ops)]
    im = Image.new("RGBA", taille, (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    for c, ops, a in elements:
        dr.polygon(tr(ops), fill=c)
    if clip:
        masque = Image.new("L", taille, 0)
        ImageDraw.Draw(masque).polygon(tr(clip), fill=255)
        im.putalpha(masque)
    return im.resize((largeur, round((y1 - y0) * largeur / (x1 - x0))), Image.LANCZOS)


# ---------------------------------------------------------------- Cadrages

def carre(cote):
    """Carré de côté `cote` centré sur le logo."""
    cx, cy, h = W / 2, H / 2, cote / 2
    return (cx - h, cy - h, cx + h, cy + h)


LOGO = (0, 0, W, H)
# apple-touch / 192 / 512 : iOS arrondit lui-même ; bords haut/bas tombent dans une rainure
ICONE = carre(H + 2 * (PY - 5))
# Android adaptatif : le logo doit tenir dans le cercle de 80 %
MASKABLE = carre(1080)

# Traits plus épais pour les petites tailles (onglet du navigateur) :
# à 16 px des traits trop épais noient les lettres, à 32 px trop fins on perd la grille.
EP_FAVICON = 18
EP_FAVICON_16 = 12


# ---------------------------------------------------------------- Sortie

def ecrire(chemin, texte):
    with open(chemin, "w") as fh:
        fh.write(texte)


def manifeste(couleur):
    return json.dumps({
        "name": "EzHoraire",
        "short_name": "EzHoraire",
        "icons": [
            {"src": "/icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png"},
            {"src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
        "theme_color": couleur,
        "background_color": couleur,
        "display": "standalone",
        "start_url": "/",
    }, indent=2, ensure_ascii=False) + "\n"


def sortir(nom, fabrique, couleur_theme):
    """fabrique(cadre, ep) -> (scène, bornes) ; cadre ∈ logo/favicon/icone/maskable."""
    dossier = os.path.join(ICI, nom)
    os.makedirs(dossier, exist_ok=True)
    p = lambda f: os.path.join(dossier, f)

    s, b = fabrique("logo", T)
    ecrire(p("logo.svg"), svg(s, b))
    png(s, b, 1200, ss=4).save(p("logo.png"), optimize=True)

    s, b = fabrique("favicon", EP_FAVICON)
    ecrire(p("favicon.svg"), svg(s, b))
    tailles = [16, 32, 48]
    icos = [png(*fabrique("favicon", EP_FAVICON_16 if t == 16 else EP_FAVICON), t) for t in tailles]
    icos[-1].save(p("favicon.ico"), sizes=[(t, t) for t in tailles], append_images=icos[:-1])

    s, b = fabrique("icone", T)
    ecrire(p("icon.svg"), svg(s, b))
    png(s, b, 180).convert("RGB").save(p("apple-touch-icon.png"), optimize=True)
    png(s, b, 192).save(p("icon-192.png"), optimize=True)
    png(s, b, 512).save(p("icon-512.png"), optimize=True)
    png(*fabrique("maskable", T), 512).save(p("icon-maskable-512.png"), optimize=True)

    ecrire(p("site.webmanifest"), manifeste(couleur_theme))


def fabrique_classique(connecte):
    marges = {"logo": 0, "favicon": 0, "icone": 0.10, "maskable": 0.20}

    def f(cadre, ep):
        d = (ep - T) / 2
        gw = W + 2 * d
        s = gw / (1 - 2 * marges[cadre])
        if cadre == "logo":
            b = (-d, -d, W + d, H + d)
        else:
            b = (W / 2 - s / 2, H / 2 - s / 2, W / 2 + s / 2, H / 2 + s / 2)
        el, clip = scene_classique(connecte, ep)
        if cadre in ("icone", "maskable"):
            el = [(CREME, rect(*b), 1)] + el
        return (el, clip), b
    return f


def fabrique_plaque(pal):
    def f(cadre, ep):
        if cadre == "logo":
            return scene_plaque(pal, LOGO, ep, rayon=26), LOGO
        if cadre == "favicon":
            b = carre(W + 12)
            return scene_plaque(pal, b, ep, rayon=110), b
        b = ICONE if cadre == "icone" else MASKABLE
        return scene_plaque(pal, b, ep, autour=True), b
    return f


NEGATIF = {"fond": "#121210", "case": "#26251F", "B": "#2F66EA", "R": "#F02A1A", "N": CREME}
PLAQUE_BLEUE = {"fond": BLEU, "case": BLEU, "B": CREME, "R": ROUGE, "N": NOIR}


if __name__ == "__main__":
    sortir("v1-original", fabrique_classique(False), CREME)
    sortir("v2-connecte", fabrique_classique(True), CREME)
    sortir("v3-negatif", fabrique_plaque(NEGATIF), NEGATIF["fond"])
    sortir("v4-bleu", fabrique_plaque(PLAQUE_BLEUE), PLAQUE_BLEUE["fond"])
    print("OK")
