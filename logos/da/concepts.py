# -*- coding: utf-8 -*-
"""Exploration : marques dans la DA du site (mat, filet 1 px, halo, accent bleu)."""

SOMBRE = dict(nom="sombre", haut="#20242c", bas="#0e1014", marque="#f0f3f7",
              accent="#4d7bff", filet="rgba(255,255,255,.075)", reflet="rgba(255,255,255,.16)",
              halo="rgba(77,123,255,.20)", sourd="#454c5a")
CLAIR = dict(nom="clair", haut="#ffffff", bas="#eceff4", marque="#17191d",
             accent="#2456e0", filet="rgba(23,25,29,.07)", reflet="rgba(255,255,255,.95)",
             halo="rgba(36,86,224,.10)", sourd="#c3c9d4")


def tuile(p, contenu, r=24, grille=True, halo=True):
    defs = f'''
  <linearGradient id="t" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="{p['haut']}"/><stop offset="1" stop-color="{p['bas']}"/>
  </linearGradient>
  <linearGradient id="e" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="{p['reflet']}"/><stop offset=".45" stop-color="{p['reflet']}" stop-opacity="0"/>
  </linearGradient>
  <radialGradient id="h" cx=".28" cy=".1" r=".85">
    <stop offset="0" stop-color="{p['halo']}"/><stop offset="1" stop-color="{p['halo']}" stop-opacity="0"/>
  </radialGradient>
  <clipPath id="c"><rect width="100" height="100" rx="{r}"/></clipPath>'''
    g = ""
    if grille:
        lignes = "".join(f'<path d="M0 {y}H100"/>' for y in (28, 44, 60, 76))
        g = f'<g clip-path="url(#c)" stroke="{p["filet"]}" stroke-width="1">{lignes}</g>'
    hl = f'<rect width="100" height="100" rx="{r}" fill="url(#h)"/>' if halo else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>{defs}</defs>'
            f'<rect width="100" height="100" rx="{r}" fill="url(#t)"/>{hl}{g}{contenu}'
            f'<rect x=".5" y=".5" width="99" height="99" rx="{r - .5}" fill="none" stroke="url(#e)"/></svg>')


def c_rows(p, petit=False):
    """E / lignes d'agenda : trois barres, la médiane en accent."""
    h, r = (13, 6.5) if petit else (11, 5.5)
    ys = (24, 43.5, 63) if petit else (25.5, 44.5, 63.5)
    w = (52, 36, 52)
    col = (p["marque"], p["accent"], p["marque"])
    return "".join(f'<rect x="24" y="{y}" width="{w[i]}" height="{h}" rx="{r}" fill="{col[i]}"/>'
                   for i, y in enumerate(ys))


def c_week(p, petit=False):
    """Vue semaine : colonnes creusées, un créneau en accent."""
    if petit:
        cols = [(27, 24, 30), (53, 46, 30)]
        w = 20
    else:
        cols = [(22, 30, 22), (41, 22, 17), (60, 46, 21)]
        w = 18
    out = "".join(f'<rect x="{x}" y="20" width="{w}" height="60" rx="6" fill="{p["filet"]}"/>'
                  for x, _, _ in cols)
    for i, (x, y, h) in enumerate(cols):
        c = p["accent"] if i == (0 if petit else 1) else p["sourd"]
        out += f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="{c}"/>'
    return out


def c_z(p, petit=False):
    """Z massif : la barre du haut en accent."""
    x0, x1, e = 24, 76, (15 if petit else 13)
    return (f'<path d="M{x0} 24H{x1}L{x0 + e * .1} {76 - e}H{x1}V76H{x0}L{x1 - e * .1} {24 + e}H{x0}Z" '
            f'fill="{p["marque"]}"/>'
            f'<path d="M{x0} 24H{x1}V{24 + e}H{x0}Z" fill="{p["accent"]}"/>')


def c_today(p, petit=False):
    """Grille de mois : une case allumée."""
    s, g = (20, 8) if petit else (16, 7)
    n = 2 if petit else 3
    d = n * s + (n - 1) * g
    o = (100 - d) / 2
    out = ""
    for i in range(n):
        for j in range(n):
            actif = (i, j) == ((1, 1) if petit else (1, 2))
            c = p["accent"] if actif else p["sourd"]
            out += (f'<rect x="{o + j * (s + g)}" y="{o + i * (s + g)}" width="{s}" height="{s}" '
                    f'rx="{s / 3.4:.1f}" fill="{c}"/>')
    return out


def c_slot(p, petit=False):
    """Un créneau : bloc plein, arête en accent (comme .ev dans le calendrier)."""
    x, y, w, h = (22, 26, 56, 48) if petit else (24, 28, 52, 44)
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{p["marque"]}"/>'
            f'<path d="M{x + 12} {y}h{w - 24}a12 12 0 0 1 12 12v0h-{w}v0a12 12 0 0 1 12-12Z" fill="{p["accent"]}"/>')


def c_flash(p, petit=False):
    """Contre-pied : Z en dégradé vif, arête lumineuse."""
    x0, x1, e = 24, 76, (15 if petit else 13)
    grad = ('<linearGradient id="f" x1="0" y1="0" x2="1" y2="1">'
            '<stop offset="0" stop-color="#6d9bff"/><stop offset=".55" stop-color="#2456e0"/>'
            '<stop offset="1" stop-color="#7b3df5"/></linearGradient>')
    return (f'<defs>{grad}</defs>'
            f'<path d="M{x0} 24H{x1}L{x0 + e * .1} {76 - e}H{x1}V76H{x0}L{x1 - e * .1} {24 + e}H{x0}Z" '
            f'fill="url(#f)"/>'
            f'<path d="M{x0} 24H{x1}v3H{x0}Z" fill="#ffffff" opacity=".45"/>')


CONCEPTS = [("rows", c_rows), ("week", c_week), ("z", c_z),
            ("today", c_today), ("slot", c_slot), ("flash", c_flash)]
