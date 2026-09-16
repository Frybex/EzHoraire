# -*- coding: utf-8 -*-
import base64, sys
from concepts import CONCEPTS, SOMBRE, CLAIR, tuile

def img(svg, px, extra=""):
    b = base64.b64encode(svg.encode()).decode()
    return f'<img src="data:image/svg+xml;base64,{b}" width="{px}" height="{px}" {extra}>'

lignes = []
for nom, f in CONCEPTS:
    cases = []
    for p in (SOMBRE, CLAIR):
        s_gr = tuile(p, f(p))
        s_pt = tuile(p, f(p, petit=True), r=20, grille=False, halo=False)
        cases.append('<div class="bloc">' + img(s_gr, 128) +
                     '<div class="petits">' + img(s_gr, 32) + img(s_pt, 32) +
                     img(s_gr, 16) + img(s_pt, 16) + '</div></div>')
    lignes.append(f'<div class="ligne"><div class="nom">{nom}</div>' + "".join(cases) + '</div>')

html = """<!doctype html><meta charset="utf-8"><style>
 body{margin:0;padding:24px;background:#8b8f96;font:13px system-ui;color:#fff}
 .ligne{display:flex;align-items:center;gap:28px;margin-bottom:18px}
 .nom{width:60px}
 .bloc{display:flex;align-items:center;gap:14px;padding:12px;border-radius:14px}
 .bloc:nth-child(2){background:#101216}.bloc:nth-child(3){background:#f4f5f7}
 .petits{display:flex;align-items:center;gap:10px}
 img{display:block}
</style>""" + "".join(lignes)
open("planche.html", "w").write(html)
