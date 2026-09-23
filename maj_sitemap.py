"""Régénère les <lastmod> de sitemap.xml depuis l'historique git :

    python3 maj_sitemap.py          # écrit sitemap.xml
    python3 maj_sitemap.py --check  # n'écrit rien, code 1 si écart

Le <lastmod> d'une page est la date du dernier commit qui a touché son
fichier HTML — aujourd'hui tant que ce fichier est modifié mais pas
encore commité. Sans dépôt git, repli sur la date de modification du
fichier. À lancer après toute retouche d'une page, avant de déployer.

test_sitemap.py vérifie que le fichier reste synchronisé.
"""
import os
import re
import subprocess
import sys
from datetime import date

RACINE = os.path.dirname(os.path.abspath(__file__))
DOMAINE = "https://www.ezhoraire.be"
RE_LIGNE_URL = re.compile(
    r"^\s*<url>\s*<loc>(?P<loc>[^<]+)</loc>\s*"
    r"<lastmod>(?P<lastmod>[^<]*)</lastmod>\s*</url>\s*$"
)


def url_vers_fichier(url):
    if not url.startswith(DOMAINE):
        raise ValueError(f"URL hors domaine : {url}")
    chemin = url[len(DOMAINE):]
    if chemin in ("", "/"):
        return "index.html"
    if chemin.endswith("/"):
        return chemin[1:] + "index.html"
    return chemin[1:]


def git(*args):
    """Sortie de `git <args>` depuis la racine du dépôt, None si échec."""
    resultat = subprocess.run(
        ["git", "-C", RACINE, *args],
        capture_output=True, text=True,
    )
    return resultat.stdout.strip() if resultat.returncode == 0 else None


def dans_depot_git():
    return git("rev-parse", "--is-inside-work-tree") == "true"


def derniere_modification(chemin):
    """Date ISO (AAAA-MM-JJ) de la dernière modification de `chemin`."""
    if dans_depot_git():
        if git("status", "--porcelain", "--", chemin):
            return date.today().isoformat()
        commit = git("log", "-1", "--format=%cs", "--", chemin)
        if commit:
            return min(commit, date.today().isoformat())
    return date.fromtimestamp(
        os.path.getmtime(os.path.join(RACINE, chemin))
    ).isoformat()


def maj_texte(texte):
    """Renvoie (nouveau texte, [(url, ancienne date, nouvelle date), ...])."""
    changements = []
    vues = 0
    lignes = []

    for ligne in texte.splitlines(keepends=True):
        if "<loc>" not in ligne:
            lignes.append(ligne)
            continue
        m = RE_LIGNE_URL.match(ligne)
        if not m:
            raise ValueError(
                f"ligne <url> illisible (un <loc>, un <lastmod> et </url> "
                f"sur la même ligne attendus) : {ligne.strip()}"
            )
        fichier = url_vers_fichier(m.group("loc"))
        if not os.path.isfile(os.path.join(RACINE, fichier)):
            raise ValueError(f"{m.group('loc')} ne correspond à aucun fichier")
        vues += 1
        ancienne = m.group("lastmod")
        nouvelle = derniere_modification(fichier)
        if ancienne != nouvelle:
            changements.append((m.group("loc"), ancienne, nouvelle))
        lignes.append(
            ligne[:m.start("lastmod")] + nouvelle + ligne[m.end("lastmod"):]
        )

    if vues != texte.count("<loc>"):
        raise ValueError("toutes les URLs n'ont pas pu être traitées")
    return "".join(lignes), changements


def main():
    verification = "--check" in sys.argv[1:]
    chemin = os.path.join(RACINE, "sitemap.xml")
    with open(chemin, encoding="utf-8") as f:
        texte = f.read()

    try:
        nouveau, changements = maj_texte(texte)
    except ValueError as erreur:
        print(f"sitemap.xml : {erreur}", file=sys.stderr)
        return 1

    for loc, ancienne, nouvelle in changements:
        print(f"  {loc} : {ancienne} -> {nouvelle}")

    if not changements:
        print("sitemap.xml : lastmod à jour.")
        return 0
    if verification:
        sys.stdout.flush()
        print("sitemap.xml périmé : lancer python3 maj_sitemap.py", file=sys.stderr)
        return 1

    with open(chemin, "w", encoding="utf-8") as f:
        f.write(nouveau)
    print(f"sitemap.xml : {len(changements)} lastmod mis à jour.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
