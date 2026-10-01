#!/usr/bin/env python3
"""Empreintes CSP des scripts embarqués dans les pages.

Les pages du site n'ont plus qu'un petit script `inline` chacune (le thème
posé avant le premier rendu). Leur empreinte sha256 permet de retirer
`'unsafe-inline'` de `script-src` : un script injecté ou modifié ne
s'exécute plus. Encore faut-il que les empreintes annoncées restent
exactement celles des pages — c'est le rôle de cet outil.

    python3 tools/valider_csp.py           # vérifie (0 si à jour)
    python3 tools/valider_csp.py --write   # recalcule et réécrit
    python3 tools/valider_csp.py --print   # affiche la directive script-src

`--write` met à jour `vercel.json` (production) et la constante CSP de
`tools/serve.py` (mêmes en-têtes en local), sans toucher au reste. Le hook
de pré-commit le lance en vérification : une page modifiée sans réécriture
des empreintes ferait refuser le commit au lieu de casser silencieusement
le thème en ligne.

La policy compte aussi `style-src 'unsafe-inline'` : les pages utilisent des
attributs `style="…"` (impossibles à hacher) et c'est assumé — le risque
d'injection de style est très inférieur à celui d'un script, et les feuilles
restent verrouillées sur `'self'`.
"""
import base64
import hashlib
import json
import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
VERCEL = RACINE / "vercel.json"
SERVE = RACINE / "tools" / "serve.py"

# Mêmes exclusions que build_assets.py : les pages déployées seulement.
PAGES_IGNOREES = {
    "lab", "qr", "logos", "seo", "emails", ".vercel", "node_modules",
    ".git", ".venv", "supabase", "api", "tests", "tools", ".cache",
}

# Directive complète, du premier `script-src` au `;` qui le termine.
RX_SCRIPT_SRC = re.compile(r"script-src [^;]*;")
RX_CSP_SERVE = re.compile(r'CSP = \((.*?)\)\nENTETES_SECURITE', re.S)


def pages() -> list[Path]:
    out = []
    for chemin in sorted(RACINE.rglob("*.html")):
        rel = chemin.relative_to(RACINE)
        if any(part in PAGES_IGNOREES for part in rel.parts):
            continue
        out.append(chemin)
    return out


def empreintes() -> list[str]:
    """Empreintes sha256 des scripts inline exécutables, triées et dédupliquées."""
    trouves = set()
    for page in pages():
        texte = page.read_text(encoding="utf-8")
        for m in re.finditer(r"<script((?![^>]*\bsrc=)[^>]*)>(.*?)</script>", texte, re.S):
            attributs, corps = m.group(1), m.group(2)
            if "application/ld+json" in attributs:
                continue  # bloc de données, jamais exécuté
            digest = base64.b64encode(
                hashlib.sha256(corps.encode("utf-8")).digest()).decode()
            trouves.add("sha256-" + digest)
    return sorted(trouves)


def directive(hashes: list[str]) -> str:
    """La directive script-src voulue, sources tierces comprises."""
    sources = ["'self'", *["'%s'" % h for h in hashes], "'wasm-unsafe-eval'",
               "https://cdn.jsdelivr.net"]
    return "script-src " + " ".join(sources) + ";"


def verifier(hashes: list[str]) -> int:
    voulue = directive(hashes)
    problemes = []

    vercel = VERCEL.read_text(encoding="utf-8")
    csp_vercel = json.loads(vercel)["headers"]
    actuelle = ""
    for bloc in csp_vercel:
        for h in bloc.get("headers", []):
            if h.get("key") == "Content-Security-Policy":
                actuelle = h["value"]
    if not actuelle:
        problemes.append("CSP absente de vercel.json")
    elif RX_SCRIPT_SRC.search(actuelle).group(0) != voulue:
        problemes.append("vercel.json : script-src différent des pages")
    if "'unsafe-inline'" in (RX_SCRIPT_SRC.search(actuelle).group(0) if actuelle else ""):
        problemes.append("vercel.json : script-src contient encore 'unsafe-inline'")

    serve = SERVE.read_text(encoding="utf-8")
    bloc = RX_CSP_SERVE.search(serve)
    if not bloc:
        problemes.append("tools/serve.py : constante CSP introuvable")
    else:
        csp_serve = bloc.group(1)
        if "'unsafe-inline'" in (RX_SCRIPT_SRC.search(csp_serve).group(0)
                                 if RX_SCRIPT_SRC.search(csp_serve) else ""):
            problemes.append("tools/serve.py : script-src contient encore 'unsafe-inline'")
        elif RX_SCRIPT_SRC.search(csp_serve).group(0) != voulue:
            problemes.append("tools/serve.py : script-src différent des pages")

    if problemes:
        for p in problemes:
            print(p)
        print("Lancez « python3 tools/valider_csp.py --write ».")
        return 1
    print("CSP à jour : %d empreinte(s) de script." % len(hashes))
    return 0


def ecrire(hashes: list[str]) -> int:
    voulue = directive(hashes)

    vercel = VERCEL.read_text(encoding="utf-8")
    if RX_SCRIPT_SRC.search(vercel) is None:
        sys.exit("vercel.json : script-src introuvable.")
    VERCEL.write_text(RX_SCRIPT_SRC.sub(voulue, vercel, count=1), encoding="utf-8")

    serve = SERVE.read_text(encoding="utf-8")
    bloc = RX_CSP_SERVE.search(serve)
    if not bloc:
        sys.exit("tools/serve.py : constante CSP introuvable.")
    csp = bloc.group(1)
    if RX_SCRIPT_SRC.search(csp) is None:
        sys.exit("tools/serve.py : script-src introuvable dans la CSP.")
    nouveau = RX_SCRIPT_SRC.sub(voulue, csp, count=1)
    SERVE.write_text(serve[:bloc.start(1)] + nouveau + serve[bloc.end(1):],
                     encoding="utf-8")
    print("CSP réécrite : %d empreinte(s)." % len(hashes))
    return 0


def main(argv: list[str]) -> int:
    hashes = empreintes()
    if "--print" in argv:
        print(directive(hashes))
        return 0
    if "--write" in argv:
        return ecrire(hashes)
    return verifier(hashes)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
