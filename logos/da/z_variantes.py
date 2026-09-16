# -*- coding: utf-8 -*-
"""Famille « Z » : Z massif aux coins adoucis, décliné selon la place de l'accent."""
import base64
from concepts import SOMBRE, CLAIR, tuile

def z_poly(x0=24, x1=76, y0=24, y1=76, e=14, inset=4):
    """Polygone du Z, rentré de `inset` (le contour arrondi le regonfle)."""
    i = inset
    p = [(x0 + i, y0 + i), (x1 - i, y0 + i), (x0 + i + 2, y1 - e + i), (x1 - i, y1 - e + i),
         (x1 - i, y1 - i), (x0 + i, y1 - i), (x1 - i - 2, y0 + e - i), (x0 + i, y0 + e - i)]
    return " ".join(f"{a:.1f},{b:.1f}" for a, b in p)

def doux(pts, fill, r=4, extra=""):
    return (f'<polygon points="{pts}" fill="{fill}" stroke="{fill}" stroke-width="{2 * r}" '
            f'stroke-linejoin="round" {extra}/>')

def z_haut(p, petit=False):      # barre du haut en accent
    e = 16 if petit else 14
    return (doux(z_poly(e=e), p["marque"]) +
            f'<path d="M24 24H76V{24 + e}H24Z" fill="{p["accent"]}" clip-path="url(#zc)"/>')

def z_diag(p, petit=False):      # diagonale en accent
    e = 16 if petit else 14
    return (doux(z_poly(e=e), p["marque"]) +
            f'<path d="M24 {24 + e}H76V{76 - e}H24Z" fill="{p["accent"]}" clip-path="url(#zc)"/>')

def z_plein(p, petit=False):     # Z tout accent, arête haute allumée
    e = 16 if petit else 14
    return (doux(z_poly(e=e), p["accent"]) +
            f'<path d="M26 25H74V28H26Z" fill="#fff" opacity=".35" clip-path="url(#zc)"/>')

def z_sobre(p, petit=False):     # Z mat, seule l'arête s'allume (détail caché)
    e = 16 if petit else 14
    return (doux(z_poly(e=e), p["marque"]) +
            f'<path d="M26 25H74V27.5H26Z" fill="{p["accent"]}" clip-path="url(#zc)"/>')

def z_degrade(p, petit=False):   # contre-pied : dégradé vif
    e = 16 if petit else 14
    g = ('<defs><linearGradient id="g" x1="0" y1="0" x2=".9" y2="1">'
         '<stop offset="0" stop-color="#7fa6ff"/><stop offset=".5" stop-color="#2456e0"/>'
         '<stop offset="1" stop-color="#6d31e8"/></linearGradient></defs>')
    return g + doux(z_poly(e=e), "url(#g)")

def z_capsules(p, petit=False):  # trois capsules : barres d'agenda + Z
    e = 15 if petit else 13
    r = e / 2
    return (f'<g stroke-linecap="round" stroke-width="{e}" fill="none">'
            f'<path d="M{24 + r} {24 + r}H{76 - r}" stroke="{p["marque"]}"/>'
            f'<path d="M{72 - r} {26 + r}L{28 + r} {74 - r}" stroke="{p["accent"]}"/>'
            f'<path d="M{24 + r} {76 - r}H{76 - r}" stroke="{p["marque"]}"/></g>')

VARIANTES = [("z-haut", z_haut), ("z-diag", z_diag), ("z-plein", z_plein),
             ("z-sobre", z_sobre), ("z-degrade", z_degrade), ("z-capsules", z_capsules)]

def tuile_z(p, f, petit=False):
    clip = f'<clipPath id="zc"><polygon points="{z_poly(e=16 if petit else 14)}" stroke-width="8" stroke-linejoin="round" stroke="#000"/></clipPath>'
    svg = tuile(p, clip + f(p, petit), r=20 if petit else 24, grille=not petit, halo=not petit)
    return svg

if __name__ == "__main__":
    def img(svg, px):
        b = base64.b64encode(svg.encode()).decode()
        return f'<img src="data:image/svg+xml;base64,{b}" width="{px}" height="{px}">'
    lignes = []
    for nom, f in VARIANTES:
        cases = []
        for p in (SOMBRE, CLAIR):
            gr, pt = tuile_z(p, f), tuile_z(p, f, petit=True)
            cases.append('<div class="bloc">' + img(gr, 128) + '<div class="petits">' +
                         img(gr, 32) + img(pt, 32) + img(gr, 16) + img(pt, 16) + '</div></div>')
        lignes.append(f'<div class="ligne"><div class="nom">{nom}</div>' + "".join(cases) + "</div>")
    html = """<!doctype html><meta charset="utf-8"><style>
     body{margin:0;padding:24px;background:#8b8f96;font:13px system-ui;color:#fff}
     .ligne{display:flex;align-items:center;gap:28px;margin-bottom:18px}.nom{width:80px}
     .bloc{display:flex;align-items:center;gap:14px;padding:12px;border-radius:14px}
     .bloc:nth-child(2){background:#101216}.bloc:nth-child(3){background:#f4f5f7}
     .petits{display:flex;align-items:center;gap:10px}img{display:block}
    </style>""" + "".join(lignes)
    open("planche_z.html", "w").write(html)
