#!/usr/bin/env python3
"""Construit les assets publics du site : concaténation + minification.

Le site sert des fichiers minifiés et versionnés par empreinte dans
`assets/dist/`, jamais les sources. Écrire puis lancer :

    python3 tools/build_assets.py

Ce que fait la commande :
  1. assemble un bundle par entrée — `app.js` dans l'ordre de chargement
     (favicon, suivi, fusion, export_ics, semaine, app), puis un bundle
     par page à script long (legal, dashboard, motdepasse) — et minifie ;
  2. minifie les feuilles de style ;
  3. écrit le résultat dans `assets/dist/<nom>.<empreinte>.<ext>` et
     supprime l'ancienne empreinte du même nom ;
  4. réécrit les références `assets/js/...` et `assets/css/...` de toutes
     les pages HTML vers ces fichiers versionnés ;
  5. note dans `tools/assets-manifest.json` l'empreinte de chaque source.

Les fichiers produits sont committés : l'hébergeur (Vercel) sert l'arbre
tel quel, sans étape de build. Le hook de pré-commit et `tools/serve.py`
vérifient que `assets/dist/` est à jour (`--check`), pour qu'un commit ne
parte jamais avec des sources modifiées mais un bundle périmé.

`--check` ne demande ni Node ni esbuild : il compare les empreintes des
sources au manifeste et rejoue la réécriture des pages en mémoire.
"""

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
SORTIE = RACINE / "assets" / "dist"
# Hors de `assets/dist/` (non déployé) : la règle de cache un an de
# l'hébergeur couvre alors tout le dossier sans exception.
MANIFESTE = RACINE / "tools" / "assets-manifest.json"

# Un bundle JS par page : `app.js` est le seul utilisé par index.html, les
# autres restent séparés (pages légales, dashboard, mot de passe).
JS = {
    "app.js": [
        "assets/js/favicon.js",
        "assets/js/suivi.js",
        "assets/js/fusion.js",
        "assets/js/export_ics.js",
        "assets/js/semaine.js",
        "assets/js/recherche.js",
        "assets/js/app.js",
    ],
    "favicon.js": ["assets/js/favicon.js"],
    "legal.js": ["assets/js/legal.js"],
    "dashboard.js": ["assets/js/dashboard.js"],
    "motdepasse.js": ["assets/js/motdepasse.js"],
}
CSS = {
    "app.css": ["assets/css/app.css"],
    "legal.css": ["assets/css/legal.css"],
}
# Ordre d'affichage dans le manifeste et les messages.
NOMS = ["app.js", "app.css", "favicon.js", "legal.js", "legal.css",
        "dashboard.js", "motdepasse.js"]

# Pages réécrites (le labo et les ateliers ne sont pas déployés).
PAGES_IGNOREES = {
    "lab", "qr", "logos", "seo", "emails", ".vercel", "node_modules",
    ".git", ".venv", "supabase", "api", "tests", "tools",
}


def empreinte(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fichiers_pages() -> list[Path]:
    pages = []
    for chemin in sorted(RACINE.rglob("*.html")):
        rel = chemin.relative_to(RACINE)
        if any(part in PAGES_IGNOREES for part in rel.parts):
            continue
        pages.append(chemin)
    return pages


def motif_reference(logique: str) -> re.Pattern:
    """Toutes les écritures d'un asset dans le HTML.

    Reconnaît la source (`/assets/js/app.js?v=4`) comme une sortie déjà
    versionnée (`/assets/dist/app.1a2b3c4d5e.js`), pour qu'un rebuild
    remplace l'ancienne empreinte sans toucher au reste de la balise.
    """
    nom, ext = logique.rsplit(".", 1)
    nom, ext = re.escape(nom), re.escape(ext)
    source = rf"/assets/(?:js|css)/{nom}\.{ext}(?:\?v=\d+)?"
    sortie = rf"/assets/dist/{nom}(?:\.[0-9a-f]{{6,}})?\.{ext}"
    return re.compile(rf"(?:{sortie}|{source})")


def sorties_actuelles() -> dict:
    """Nom de fichier versionné retenu pour chaque bundle, d'après le manifeste."""
    manifeste = json.loads(MANIFESTE.read_text(encoding="utf-8"))
    return {logique: donnees["fichier"] for logique, donnees in manifeste["bundles"].items()}


def reecrire(pages: list[Path], sorties: dict, ecrire: bool) -> list[str]:
    """Remplace chaque référence par le fichier versionné. Renvoie les pages modifiées."""
    changees = []
    for page in pages:
        texte = page.read_text(encoding="utf-8")
        nouveau = texte
        for logique, fichier in sorties.items():
            nouveau = motif_reference(logique).sub(f"/assets/dist/{fichier}", nouveau)
        if nouveau != texte:
            changees.append(str(page.relative_to(RACINE)))
            if ecrire:
                page.write_text(nouveau, encoding="utf-8")
    return changees


def binaire_esbuild() -> list[str]:
    local = RACINE / "node_modules" / ".bin" / "esbuild"
    if local.exists():
        return [str(local)]
    if shutil.which("esbuild"):
        return ["esbuild"]
    if shutil.which("npx"):
        return ["npx", "--yes", "esbuild"]
    raise SystemExit(
        "esbuild est introuvable. Installez-le (npm i -D esbuild) ou "
        "laissez npx le récupérer : npm doit être dans le PATH."
    )


def minifier(contenu: str, extension: str, esbuild: list[str]) -> bytes:
    with tempfile.TemporaryDirectory(prefix="ezh-build-") as tmp:
        entree = Path(tmp) / f"entree.{extension}"
        sortie = Path(tmp) / f"sortie.{extension}"
        entree.write_text(contenu, encoding="utf-8")
        commande = [
            *esbuild, str(entree), "--minify", "--charset=utf8",
            "--legal-comments=none", f"--outfile={sortie}",
        ]
        resultat = subprocess.run(commande, capture_output=True, text=True)
        if resultat.returncode != 0:
            raise SystemExit("esbuild a échoué :\n" + (resultat.stderr or resultat.stdout))
        return sortie.read_bytes()


def construire() -> None:
    esbuild = binaire_esbuild()
    SORTIE.mkdir(parents=True, exist_ok=True)
    bundles = {}
    for logique in NOMS:
        sources = JS.get(logique) or CSS[logique]
        extension = logique.rsplit(".", 1)[1]
        morceaux = [(RACINE / src).read_text(encoding="utf-8") for src in sources]
        # Un point-virgule entre deux fichiers : même si l'un se termine par
        # une expression, la concaténation ne peut pas coller deux blocs.
        contenu = "\n;\n".join(morceaux)
        minifie = minifier(contenu, extension, esbuild)
        nom_base, ext = logique.rsplit(".", 1)
        fichier = f"{nom_base}.{empreinte(minifie)[:10]}.{ext}"
        anciens = list(SORTIE.glob(f"{nom_base}.*.{ext}"))
        (SORTIE / fichier).write_bytes(minifie)
        for ancien in anciens:
            if ancien.name != fichier:
                ancien.unlink()
        bundles[logique] = {
            "fichier": fichier,
            "octets": len(minifie),
            "sources": {src: empreinte((RACINE / src).read_bytes()) for src in sources},
        }
        print(f"{logique:12s} -> assets/dist/{fichier}  ({len(minifie) / 1024:.1f} Ko)")

    MANIFESTE.write_text(
        json.dumps({"version": 1, "bundles": bundles}, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    pages = fichiers_pages()
    changees = reecrire(pages, sorties_actuelles(), ecrire=True)
    print("Pages réécrites : " + (", ".join(changees) if changees else "aucune"))


def verifier(parler: bool = True) -> int:
    """0 si `assets/dist/` et les pages sont à jour, 1 sinon."""
    def dire(message):
        if parler:
            print(message)

    problemes = []
    if not MANIFESTE.exists():
        dire("tools/assets-manifest.json manquant : lancez « python3 tools/build_assets.py ».")
        return 1
    manifeste = json.loads(MANIFESTE.read_text(encoding="utf-8"))
    if manifeste.get("version") != 1:
        problemes.append("manifeste d'une version inconnue")
    for logique, donnees in manifeste.get("bundles", {}).items():
        if not (SORTIE / donnees["fichier"]).exists():
            problemes.append(f"{donnees['fichier']} manquant dans assets/dist/")
        for source, attendue in donnees.get("sources", {}).items():
            chemin = RACINE / source
            if not chemin.exists():
                problemes.append(f"{source} supprimé")
            elif empreinte(chemin.read_bytes()) != attendue:
                problemes.append(f"{source} modifié depuis le dernier build")
    if problemes:
        dire("\n".join(problemes))
        return 1
    sorties = sorties_actuelles()
    perimees = reecrire(fichiers_pages(), sorties, ecrire=False)
    if perimees:
        dire("Références d'assets périmées dans : " + ", ".join(perimees))
        return 1
    return 0


def main() -> int:
    if "--check" in sys.argv[1:]:
        return verifier()
    construire()
    return 0


if __name__ == "__main__":
    sys.exit(main())
