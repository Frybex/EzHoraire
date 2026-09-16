# -*- coding: utf-8 -*-
"""Page d'aperçu : chaque proposition en situation (en-tête, onglet, iPhone, Android)."""
import os
from build import VARIANTES

ICI = os.path.dirname(os.path.abspath(__file__))
inline = lambda v, t: open(os.path.join(ICI, v, f"marque-{t}.svg")).read().replace("\n", "")

TITRES = {
    "a-mat": ("A — Z mat, diagonale accent",
              "Le parti pris principal : signe crème sur tuile mate, seule la diagonale s'allume."),
    "b-accent": ("B — Z accent",
                 "Tout le signe en bleu de marque, arête haute allumée. Le plus visible en onglet."),
    "c-degrade": ("C — Z dégradé",
                  "Contre-pied plus expressif : bleu vers violet, arête lumineuse en haut."),
    "d-barres": ("D — Barres d'agenda",
                 "Sans lettre : trois lignes d'emploi du temps, la médiane en accent."),
}

blocs = []
for v in VARIANTES:
    t, d = TITRES[v]
    blocs.append(f'''
  <section class="carte">
    <h2>{t}</h2><p class="d">{d}</p>
    <div class="grand">
      <img src="{v}/logo.svg" width="132" height="132" alt="">
      <img src="{v}/logo-clair.svg" width="132" height="132" alt="">
      <div class="entetes">
        <div class="entete sombre">{inline(v, "sombre")}<span>Ez<b>Horaire</b></span></div>
        <div class="entete clair">{inline(v, "claire")}<span>Ez<b>Horaire</b></span></div>
      </div>
    </div>
    <div class="rangee">
      <div class="onglet clair"><img src="{v}/favicon.svg" width="16" height="16" alt="">EzHoraire</div>
      <div class="onglet sombre"><img src="{v}/favicon.svg" width="16" height="16" alt="">EzHoraire</div>
      <img src="{v}/favicon.svg" width="32" height="32" alt="">
      <img src="{v}/favicon.svg" width="16" height="16" alt="">
    </div>
    <div class="ecran">
      <figure><div class="app ios"><img src="{v}/apple-touch-icon.png" alt=""></div>iPhone</figure>
      <figure><div class="app rond"><img src="{v}/icon-maskable-512.png" alt=""></div>Android rond</figure>
      <figure><div class="app squircle"><img src="{v}/icon-maskable-512.png" alt=""></div>Android carré</figure>
    </div>
  </section>''')

html = f'''<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>EzHoraire — logos</title>
<link rel="icon" href="a-mat/favicon.svg" type="image/svg+xml">
<style>
  body {{ margin:0; padding:40px; background:#e9ebef; color:#17191d;
         font:15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }}
  h1 {{ font-size:22px; letter-spacing:-.02em; margin:0 0 28px; }}
  #g {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(560px,1fr)); gap:28px; }}
  .carte {{ background:#fff; border-radius:18px; padding:26px; box-shadow:0 16px 40px -28px rgba(23,32,68,.4); }}
  .carte h2 {{ font-size:16px; margin:0 0 2px; letter-spacing:-.015em; }}
  .d {{ margin:0 0 22px; color:#6d7482; font-size:13px; }}
  .grand {{ display:flex; align-items:center; gap:20px; margin-bottom:22px; flex-wrap:wrap; }}
  .entetes {{ display:flex; flex-direction:column; gap:10px; }}
  .entete {{ display:flex; align-items:center; gap:10px; padding:10px 16px; border-radius:12px;
             font-size:17px; font-weight:750; letter-spacing:-.02em; }}
  .entete svg {{ width:22px; height:22px; display:block; }}
  .entete.sombre {{ background:#101216; color:#f0f3f7; }}
  .entete.sombre .m {{ color:#f0f3f7; }} .entete.sombre b {{ color:#8ba6ff; font-weight:750; }}
  .entete.clair {{ background:#f4f5f7; color:#17191d; }}
  .entete.clair .m {{ color:#17191d; }} .entete.clair b {{ color:#2456e0; font-weight:750; }}
  .rangee {{ display:flex; gap:22px; align-items:center; flex-wrap:wrap; margin-bottom:22px; }}
  .onglet {{ display:flex; align-items:center; gap:8px; padding:8px 14px; border-radius:9px 9px 0 0; font-size:13px; }}
  .onglet.clair {{ background:#f1f3f4; }} .onglet.sombre {{ background:#35363a; color:#e8eaed; }}
  .ecran {{ display:flex; gap:26px; padding:22px; border-radius:20px;
            background:linear-gradient(160deg,#39406b,#6d3f63); }}
  .ecran figure {{ margin:0; color:#fff; font-size:12px; text-align:center; }}
  .app {{ width:62px; height:62px; overflow:hidden; margin-bottom:6px; }}
  .app img {{ width:100%; height:100%; display:block; }}
  .ios {{ border-radius:14px; }}
  .rond img, .squircle img {{ transform:scale(1.25); }}  /* recadrage réel des lanceurs Android */
  .rond {{ border-radius:50%; }} .squircle {{ border-radius:30%; }}
</style></head>
<body><h1>EzHoraire — propositions dans la DA du site</h1><div id="g">{"".join(blocs)}</div></body></html>'''
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "apercu.html"), "w").write(html)
