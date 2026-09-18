"""Monogramme E+Z — piste retenue : Monolithe (5), origine / lissé.

Principe commun : la barre haute et la barre basse sont partagées par le E et
le Z ; la barre médiane du E et la diagonale du Z forment une seule pièce
d'accent.

Corrections par rapport à la v2 :
- la diagonale a la même épaisseur que les barres, mesurée perpendiculairement
  (largeur horizontale = t * longueur / hauteur), au lieu de 12 px horizontaux
  qui donnaient ~8,5 px réels ;
- aucune jonction ne dépend d'un contact bord à bord : la pièce d'accent passe
  sous les barres (recouvrement) ou tout le glyphe est une seule forme, donc
  plus de liseré ni de coin arrondi qui laisse un trou.
"""

import math
import os

OUT = os.path.dirname(os.path.abspath(__file__))

INK_DARK = "#f4f5f7"   # encre sur fond sombre
INK_LIGHT = "#15181d"  # encre sur fond clair
THEMES = [("bleu", "#5b86ff"), ("vert", "#4cc38a"), ("rose", "#ff8fc0")]

T = 12            # épaisseur de trait
L, R = 18, 82     # bords gauche / droit du glyphe
TOP, BOT = 22, 78 # haut de la barre haute / bas de la barre basse


def f(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s == "-0" else s


def rounded(pts, radii):
    """Polygone à coins arrondis (congé en arc de cercle, rayon par sommet)."""
    n = len(pts)
    segs = []
    for i in range(n):
        px, py = pts[i]
        ax, ay = pts[i - 1]
        bx, by = pts[(i + 1) % n]
        r = radii[i] if isinstance(radii, (list, tuple)) else radii
        u1 = (ax - px, ay - py)
        u2 = (bx - px, by - py)
        l1, l2 = math.hypot(*u1), math.hypot(*u2)
        u1 = (u1[0] / l1, u1[1] / l1)
        u2 = (u2[0] / l2, u2[1] / l2)
        cosang = max(-1, min(1, u1[0] * u2[0] + u1[1] * u2[1]))
        theta = math.acos(cosang)
        if r <= 0 or theta < 1e-6 or abs(theta - math.pi) < 1e-6:
            segs.append(("P", (px, py)))
            continue
        d = r / math.tan(theta / 2)
        dmax = min(l1, l2) * 0.5
        if d > dmax:
            d = dmax
            r = d * math.tan(theta / 2)
        t1 = (px + u1[0] * d, py + u1[1] * d)
        t2 = (px + u2[0] * d, py + u2[1] * d)
        cross = (px - ax) * (by - py) - (py - ay) * (bx - px)
        segs.append(("A", t1, t2, r, 1 if cross > 0 else 0))
    out = []
    for s in segs:
        if s[0] == "P":
            x, y = s[1]
            out.append(f"{'L' if out else 'M'}{f(x)} {f(y)}")
        else:
            _, t1, t2, r, sw = s
            out.append(f"{'L' if out else 'M'}{f(t1[0])} {f(t1[1])}")
            out.append(f"A{f(r)} {f(r)} 0 0 {sw} {f(t2[0])} {f(t2[1])}")
    return " ".join(out) + " Z"


def band_width(dx, dy, t=T):
    """Largeur horizontale d'une bande oblique d'épaisseur réelle t."""
    return t * math.hypot(dx, dy) / abs(dy)


def line_x(p, q):
    """x(y) sur la droite passant par p et q."""
    (x1, y1), (x2, y2) = p, q
    return lambda y: x1 + (x2 - x1) * (y - y1) / (y2 - y1)


# ---------------------------------------------------------------------------
# 5. MONOLITHE — tout le glyphe est UNE forme, congés arrondis partout ;
#    la couleur d'accent est la même forme découpée entre les deux barres
# ---------------------------------------------------------------------------
_uid = [0]


def p5_avant(ink, acc):
    t = 13
    top, bot = TOP - .5, BOT + .5
    y1, y2 = top + t, bot - t
    m1, m2 = 50 - t / 2, 50 + t / 2
    w = t
    for _ in range(30):
        w = band_width((R - w / 2) - 50, y2 - y1, t)
    xr = line_x((R, y1), (50 + w / 2, y2))
    xl = line_x((R - w, y1), (50 - w / 2, y2))
    ro, ri, ra = 5, 3.5, 1.2  # extérieur, intérieur obtus, intérieur aigu
    pts = [(L, top), (R, top), (R, y1), (xr(y2), y2), (R, y2), (R, bot), (L, bot), (L, y2),
           (xl(y2), y2), (xl(m2), m2), (L, m2), (L, m1), (xl(m1), m1), (xl(y1), y1), (L, y1)]
    rad = [ro, ro, 7, ri, ro, ro, ro, ro, ri, ra, ro, ro, ra, ra, ro]
    d = rounded(pts, rad)
    _uid[0] += 1
    cid = f"m{_uid[0]}"
    return (f'<defs><clipPath id="{cid}"><rect x="0" y="{f(y1)}" width="100" height="{f(y2 - y1)}"/></clipPath></defs>'
            f'<path d="{d}" fill="{ink}"/><path d="{d}" fill="{acc}" clip-path="url(#{cid})"/>')


def p5(ink, acc):
    """Monolithe lissé : même dessin que la version d'origine, trois retouches.

    - coin haut droit : le congé commence exactement au bas de la barre blanche,
      qui garde donc un bord droit bien vertical (avant, l'arrondi débutait
      dans le blanc et le bleu semblait décalé) ;
    - jonction haute barre du E / diagonale : congé 3,5 au lieu de 1,2 ;
    - pointe sous la barre du E : congé 5 au lieu de 1,2, plus rond.
    """
    t = 13
    top, bot = TOP - .5, BOT + .5
    y1, y2 = top + t, bot - t
    m1, m2 = 50 - t / 2, 50 + t / 2
    r_coin = 7
    # le sommet du coin est descendu de d sous y1 pour que le point de
    # tangence du congé tombe pile sur y1
    d, w = 0, t
    for _ in range(60):
        yv = y1 + d
        w = band_width((R - w / 2) - 50, y2 - yv, t)
        dx, dy = (R - w / 2) - 50, y2 - yv
        d = r_coin / math.tan(math.acos(-dy / math.hypot(dx, dy)) / 2)
    yv = y1 + d
    xr = line_x((R, yv), (50 + w / 2, y2))
    xl = line_x((R - w, yv), (50 - w / 2, y2))
    ro, ri, ra = 5, 3.5, 1.2
    pts = [(L, top), (R, top), (R, yv), (xr(y2), y2), (R, y2), (R, bot), (L, bot), (L, y2),
           (xl(y2), y2), (xl(m2), m2), (L, m2), (L, m1), (xl(m1), m1), (xl(y1), y1), (L, y1)]
    rad = [ro, ro, r_coin, ri, ro, ro, ro, ro, ri, 5, ro, ro, 3.5, ra, ro]
    dd = rounded(pts, rad)
    _uid[0] += 1
    cid = f"m{_uid[0]}"
    return (f'<defs><clipPath id="{cid}"><rect x="0" y="{f(y1)}" width="100" height="{f(y2 - y1)}"/></clipPath></defs>'
            f'<path d="{dd}" fill="{ink}"/><path d="{dd}" fill="{acc}" clip-path="url(#{cid})"/>')


PROPS = [
    ("lisse", "Lissé", "Version d'origine, jonctions retouchées",
     "Le dessin d'origine, avec trois retouches : la barre blanche du haut garde un bord droit bien vertical jusqu'au bleu, la jonction entre la barre du E et la diagonale est plus arrondie, et la pointe sous la barre du E est moins écrasée.", p5),
    ("origine", "Origine", "Monolithe tel que présenté",
     "La version d'origine, gardée pour comparer.", p5_avant),
]


TIGHT = "12 12 76 76"  # cadrage serré du glyphe seul (sans tuile)


def svg(inner, size=None, extra="", vb="0 0 100 100"):
    sz = f' width="{size}" height="{size}"' if size else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"{sz}{extra}>{inner}</svg>'


def tile(inner, rx=22, glow="#5b86ff"):
    _uid[0] += 1
    g = f"g{_uid[0]}"
    return (f'<defs><linearGradient id="{g}" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" stop-color="#232832"/><stop offset="1" stop-color="#101216"/></linearGradient>'
            f'<radialGradient id="{g}h" cx=".25" cy=".05" r=".9"><stop offset="0" stop-color="{glow}" stop-opacity=".22"/>'
            f'<stop offset="1" stop-color="{glow}" stop-opacity="0"/></radialGradient></defs>'
            f'<rect width="100" height="100" rx="{rx}" fill="url(#{g})"/>'
            f'<rect width="100" height="100" rx="{rx}" fill="url(#{g}h)"/>'
            f'<rect x=".5" y=".5" width="99" height="99" rx="{rx - .5}" fill="none" stroke="#fff" stroke-opacity=".08"/>'
            f'<g transform="translate(50 50) scale(1.02) translate(-50 -50)">{inner}</g>')


def build():
    cards = []
    for key, name, tag, desc, fn in PROPS:
        # fichiers SVG
        for th, acc in THEMES:
            with open(os.path.join(OUT, f"monolithe-{key}-{th}-icone.svg"), "w") as fh:
                fh.write(svg(tile(fn(INK_DARK, acc), glow=acc)))
            with open(os.path.join(OUT, f"monolithe-{key}-{th}-glyphe-clair.svg"), "w") as fh:
                fh.write(svg(fn(INK_LIGHT, acc), vb=TIGHT))
            with open(os.path.join(OUT, f"monolithe-{key}-{th}-glyphe-sombre.svg"), "w") as fh:
                fh.write(svg(fn(INK_DARK, acc), vb=TIGHT))

        # grand format : une case par couleur, trois fonds possibles
        big = ""
        for th, acc in THEMES:
            big += (f'<figure class="big" title="Cliquer pour agrandir">'
                    f'<div class="v v-icone">{svg(tile(fn(INK_DARK, acc), glow=acc))}</div>'
                    f'<div class="v v-sombre">{svg(fn(INK_DARK, acc), vb=TIGHT)}</div>'
                    f'<div class="v v-clair">{svg(fn(INK_LIGHT, acc), vb=TIGHT)}</div>'
                    f'<figcaption><i style="background:{acc}"></i>{th}</figcaption></figure>')

        acc = THEMES[0][1]
        mono = svg(fn(INK_LIGHT, INK_LIGHT), 104, vb=TIGHT)
        mono_d = svg(fn(INK_DARK, INK_DARK), 104, vb=TIGHT)
        favs = "".join(svg(tile(fn(INK_DARK, acc), rx=20), s) for s in (64, 32, 16))
        cards.append(f'''
<section class="card" id="{key}" data-fond="icone">
  <header>
    <span class="num">Monolithe</span>
    <div><h2>{name}</h2><p class="tag">{tag}</p></div>
    <div class="seg" role="group" aria-label="Fond">
      <button data-f="icone" aria-pressed="true">Icône</button>
      <button data-f="sombre" aria-pressed="false">Fond sombre</button>
      <button data-f="clair" aria-pressed="false">Fond clair</button>
    </div>
  </header>
  <p class="desc">{desc}</p>
  <div class="bigs">{big}</div>
  <div class="row">
    <div class="panel pl">{mono}<span>une couleur</span></div>
    <div class="panel pd">{mono_d}<span>une couleur, sombre</span></div>
    <div class="favs"><div class="tab">{svg(tile(fn(INK_DARK, acc), rx=20), 16)}<b>EzHoraire</b></div>{favs}<span>favicon 64 / 32 / 16</span></div>
  </div>
</section>''')

    # comparaison directe avant / après, même taille, même couleur
    acc = THEMES[0][1]
    duo = "".join(
        f'<figure class="cmp"><div class="cmp-g">{svg(fn(INK_DARK, acc), vb=TIGHT)}</div>'
        f'<div class="cmp-s">{"".join(svg(tile(fn(INK_DARK, acc), rx=20), z) for z in (64, 32, 16))}</div>'
        f'<figcaption>{name}</figcaption></figure>'
        for key, name, tag, desc, fn in reversed(PROPS))

    html = f'''<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>EzHoraire — Monolithe</title>
<link rel="icon" type="image/svg+xml" href="monolithe-lisse-bleu-icone.svg">
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{background:#0e1014;color:#eef1f5;font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:48px 32px 96px}}
main{{max-width:1180px;margin:0 auto}}
h1{{font-size:30px;letter-spacing:-.02em}}
.lead{{color:#98a1b1;max-width:760px;margin:10px 0 30px}}
.card{{background:#15181e;border:1px solid #242a33;border-radius:20px;padding:28px;margin-bottom:28px}}
.card header{{display:flex;gap:16px;align-items:center;flex-wrap:wrap}}
.num{{font:600 13px ui-monospace,Menlo,monospace;color:#5b86ff}}
h2{{font-size:24px;letter-spacing:-.01em}}
.tag{{color:#98a1b1;font-size:13px}}
.seg{{margin-left:auto;display:flex;background:#0e1014;border:1px solid #2a303a;border-radius:999px;padding:3px}}
.seg button{{border:0;background:none;color:#98a1b1;font:inherit;font-size:13px;padding:6px 14px;border-radius:999px;cursor:pointer}}
.seg button[aria-pressed="true"]{{background:#2a303a;color:#fff}}
.desc{{color:#b8c0cc;margin:10px 0 22px;max-width:860px}}
.bigs{{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}}
.big{{position:relative;aspect-ratio:1;border-radius:18px;border:1px solid #242a33;background:#0b0c0f;display:grid;place-items:center;cursor:zoom-in;overflow:hidden}}
.big .v{{display:none;width:88%;height:88%}}
.card[data-fond="sombre"] .big .v,.card[data-fond="clair"] .big .v{{width:80%;height:80%}}
.big .v svg{{width:100%;height:100%;display:block}}
.card[data-fond="icone"] .v-icone,.card[data-fond="sombre"] .v-sombre,.card[data-fond="clair"] .v-clair{{display:block}}
.card[data-fond="icone"] .v-icone svg{{filter:drop-shadow(0 18px 36px rgba(0,0,0,.55))}}
.card[data-fond="clair"] .big{{background:#f4f5f7;border-color:#e1e4ea}}
.card[data-fond="clair"] figcaption{{color:#626977}}
figcaption{{position:absolute;left:14px;bottom:10px;font-size:12.5px;color:#98a1b1;display:flex;align-items:center;gap:6px}}
figcaption i{{width:9px;height:9px;border-radius:50%}}
.row{{display:flex;gap:14px;align-items:stretch;margin-top:16px;flex-wrap:wrap}}
.panel{{width:170px;border-radius:14px;height:140px;display:flex;align-items:center;justify-content:center;position:relative}}
.panel span{{font-size:11.5px;position:absolute;bottom:8px}}
.pl{{background:#f4f5f7;color:#626977}}
.pd{{background:#07080a;border:1px solid #242a33;color:#8b94a3}}
.favs{{flex:1;display:flex;align-items:center;gap:18px;background:#0e1014;border:1px solid #242a33;border-radius:14px;padding:12px 16px}}
.favs>span{{color:#98a1b1;font-size:12px;margin-left:auto}}
.tab{{display:flex;align-items:center;gap:8px;background:#232833;border-radius:8px 8px 0 0;padding:7px 14px;font-size:12.5px}}
.tab b{{font-weight:500}}
.duo{{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px}}
.cmp{{background:#15181e;border:1px solid #242a33;border-radius:20px;padding:22px;display:flex;flex-direction:column;align-items:center;gap:16px}}
.cmp-g{{width:100%;aspect-ratio:1;background:#0b0c0f;border-radius:14px;display:grid;place-items:center}}
.cmp-g svg{{width:84%;height:84%}}
.cmp-s{{display:flex;gap:16px;align-items:center}}
.cmp figcaption{{position:static;font-size:15px;font-weight:600;color:#eef1f5}}
.mob{{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;margin-top:20px;background:linear-gradient(160deg,#3a4a6b,#1c2230 60%,#2b1f33);border-radius:16px;padding:28px 18px}}
.mob figure{{display:flex;flex-direction:column;align-items:center;gap:10px}}
.mob figcaption{{position:static;color:#e6e9ef;font-size:12.5px}}
.m-ios,.m-and{{width:120px;height:120px;position:relative;overflow:hidden;display:block}}
.m-ios{{border-radius:27px}}
.m-dark{{background:#000}}
.m-dark img,.m-tint img{{width:100%;height:100%;display:block}}
.m-tint img{{filter:grayscale(1) sepia(1) hue-rotate(170deg) saturate(3) brightness(.95)}}
.m-and img{{position:absolute;width:150%;height:150%;left:-25%;top:-25%}}
.m-rond{{border-radius:50%}}
.m-squi{{border-radius:32%}}
.m-theme{{background:#d8e2ff}}
.m-theme img{{filter:brightness(0) saturate(100%) invert(18%) sepia(40%) saturate(2000%) hue-rotate(215deg)}}
#plein{{position:fixed;inset:0;display:none;place-items:center;background:rgba(5,6,8,.94);cursor:zoom-out;z-index:10}}
#plein.on{{display:grid}}
#plein.clair{{background:#f4f5f7}}
#plein svg{{width:min(86vw,86vh);height:min(86vw,86vh)}}
@media (max-width:860px){{.bigs{{grid-template-columns:1fr}}}}
</style></head><body><main>
<h1>Monolithe — origine / lissé</h1>
<p class="lead">En haut, les deux versions côte à côte. En dessous, chacune en grand dans les trois couleurs. Les boutons changent le fond (icône, sombre, clair). Clique sur un logo pour l'afficher en plein écran, puis clique ou appuie sur Échap pour revenir.</p>
<div class="duo">{duo}</div>
<section class="card mobile" data-c="bleu">
  <header>
    <span class="num">Origine</span>
    <div><h2>iOS et Android</h2><p class="tag">Fichiers dans logos/monolithe/mobile/&lt;couleur&gt;/ — aperçu avec les masques des systèmes</p></div>
    <div class="seg" role="group" aria-label="Couleur">
      <button data-c="bleu" aria-pressed="true">Bleu</button>
      <button data-c="vert" aria-pressed="false">Vert</button>
      <button data-c="rose" aria-pressed="false">Rose</button>
    </div>
  </header>
  <div class="mob">
    <figure><img data-src="ios/AppIcon.appiconset/AppIcon-1024.png" class="m-ios"><figcaption>iOS</figcaption></figure>
    <figure><div class="m-ios m-dark"><img data-src="ios/AppIcon.appiconset/AppIcon-1024-dark.png"></div><figcaption>iOS sombre</figcaption></figure>
    <figure><div class="m-ios m-tint"><img data-src="ios/AppIcon.appiconset/AppIcon-1024-tinted.png"></div><figcaption>iOS teinté</figcaption></figure>
    <figure><div class="m-and m-rond"><img data-src="android/res/mipmap-xxxhdpi/ic_launcher_background.png"><img data-src="android/res/mipmap-xxxhdpi/ic_launcher_foreground.png"></div><figcaption>Android rond</figcaption></figure>
    <figure><div class="m-and m-squi"><img data-src="android/res/mipmap-xxxhdpi/ic_launcher_background.png"><img data-src="android/res/mipmap-xxxhdpi/ic_launcher_foreground.png"></div><figcaption>Android arrondi</figcaption></figure>
    <figure><div class="m-and m-rond m-theme"><img data-src="android/res/mipmap-xxxhdpi/ic_launcher_monochrome.png"></div><figcaption>Android 13 thème</figcaption></figure>
  </div>
</section>
{"".join(cards)}
</main>
<div id="plein"></div>
<script>
document.querySelectorAll('.card[data-fond] .seg button').forEach(b => b.addEventListener('click', () => {{
  const card = b.closest('.card');
  card.dataset.fond = b.dataset.f;
  card.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', x === b));
}}));
const mobile = document.querySelector('.mobile');
const couleur = c => {{
  mobile.dataset.c = c;
  mobile.querySelectorAll('img[data-src]').forEach(i => i.src = '../../monolithe/mobile/' + c + '/' + i.dataset.src);
  mobile.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', x.dataset.c === c));
}};
mobile.querySelectorAll('.seg button').forEach(x => x.addEventListener('click', e => {{ e.stopPropagation(); couleur(x.dataset.c); }}));
couleur('bleu');
const plein = document.getElementById('plein');
document.querySelectorAll('.big').forEach(fig => fig.addEventListener('click', () => {{
  const fond = fig.closest('.card').dataset.fond;
  plein.innerHTML = fig.querySelector('.v-' + fond).innerHTML;
  plein.classList.toggle('clair', fond === 'clair');
  plein.classList.add('on');
}}));
const fermer = () => plein.classList.remove('on');
plein.addEventListener('click', fermer);
document.addEventListener('keydown', e => {{ if (e.key === 'Escape') fermer(); }});
</script>
</body></html>'''
    with open(os.path.join(OUT, "index.html"), "w") as fh:
        fh.write(html)


if __name__ == "__main__":
    build()
