"""Aides partagées par les points d'entrée qui servent un calendrier .ics.

api/export.py (fichier téléchargé) et api/abonnement.py (flux rappelé par
le téléphone) filtraient les cours et construisaient leur réponse chacun
de son côté — mêmes règles que l'app (index.html, memeGroupe) mais écrites
deux fois, donc deux risques de divergence. Elles vivent ici, en un seul
exemplaire.

Aucune dépendance hors bibliothèque standard : ce module est importé par
les fonctions serverless comme par serve.py.
"""
import html
import re
from urllib.parse import quote

PAGE_ERREUR = """<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%s — EzHoraire</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #f4f5f7; color: #17191d; }
  main { max-width: 420px; margin: 24px; padding: 28px; border-radius: 24px;
    background: #fff; box-shadow: 0 20px 60px -30px rgba(23, 32, 68, .5); }
  h1 { margin: 0 0 10px; font-size: 1.25rem; }
  p { margin: 0 0 16px; line-height: 1.5; color: #626977; }
  a { color: #2456e0; font-weight: 600; text-decoration: none; }
</style></head>
<body><main>
  <h1>%s</h1>
  <p>%s</p>
  <p><a href="/">Revenir à EzHoraire</a></p>
</main></body></html>
"""


def erreur(h, statut, titre, message):
    """Page lisible : ces adresses s'ouvrent dans le navigateur, pas dans l'app."""
    corps = (PAGE_ERREUR % (titre, titre, html.escape(str(message)))).encode("utf-8")
    h.send_response(statut)
    h.send_header("Content-Type", "text/html; charset=utf-8")
    h.send_header("Content-Length", str(len(corps)))
    h.send_header("Cache-Control", "no-store")
    h.end_headers()
    h.wfile.write(corps)


def propre(s):
    return " ".join(str(s or "").split())


def prefixe(s):
    return str(s or "").lstrip().startswith("<")


def court_groupe(s):
    """Nom court d'un groupe UMONS : « <formation>Groupe 1 » -> « Groupe 1 »."""
    return propre(re.sub(r"^\s*<[^>]*>", "", str(s or "")))


def meme_groupe(a, b):
    """Mêmes règles que memeGroupe() de index.html (préfixe UMONS toléré)."""
    a, b = propre(a), propre(b)
    if a == b:
        return True
    if prefixe(a) and prefixe(b):
        return False
    return court_groupe(a) == court_groupe(b)


def filtrer_cours(cours, sel, matiere=""):
    """Cours des groupes choisis, puis d'une seule matière si demandé.

    `sel` est normalisé une fois pour toutes : sans ça, chaque comparaison
    re-découpait les mêmes noms (une sélection peut compter des dizaines de
    groupes)."""
    sel = [propre(x) for x in sel]
    courts = {court_groupe(x) for x in sel}
    courts_nus = {court_groupe(x) for x in sel if not prefixe(x)}
    out = []
    for c in cours:
        if matiere and propre(c.get("matiere")) != matiere:
            continue
        groupes = c.get("groupes") or []
        if sel and groupes and not any(_groupe_choisi(g, sel, courts, courts_nus)
                                       for g in groupes):
            continue
        out.append(c)
    return out


def _groupe_choisi(g, sel, courts, courts_nus):
    """Équivalent de `any(meme_groupe(g, x) for x in sel)`, sans reparcourir
    la sélection à chaque groupe."""
    if propre(g) in sel:
        return True
    if prefixe(g):
        return court_groupe(g) in courts_nus
    return court_groupe(g) in courts


def cours_export(cours, sel):
    """Cours au format attendu par export_ics.construire()."""
    un_seul = len(sel) == 1
    out = []
    for c in cours:
        out.append({
            "jour": c.get("jour"),
            "debut": c.get("debut"),
            "fin": c.get("fin"),
            "matiere": c.get("matiere") or "Cours",
            "type": c.get("type") or "",
            "profs": c.get("profs") or "",
            "salles": c.get("salles") or "",
            # Un seul groupe choisi : inutile de le répéter (comme l'app).
            "groupes": [] if un_seul else (c.get("groupes") or []),
            "semaines": c.get("semaines") or [],
        })
    return out


def repondre_ics(h, texte, nom, etag="", cache="private, no-store"):
    """Réponse text/calendar : Safari (iOS) l'ouvre dans Calendrier.

    `inline` et non `attachment` : iOS montre l'aperçu avec « Ajouter
    tout » au lieu de forcer un téléchargement. `etag` non vide : le
    client qui annonce déjà cette version reçoit 304 sans le calendrier."""
    corps = texte.encode("utf-8")
    ascii_nom = nom.encode("ascii", "replace").decode("ascii").replace('"', "")
    h.send_response(200)
    h.send_header("Content-Type", "text/calendar; charset=utf-8")
    h.send_header("Content-Disposition",
                  'inline; filename="%s"; filename*=UTF-8\'\'%s' % (ascii_nom, quote(nom)))
    h.send_header("Content-Length", str(len(corps)))
    if etag:
        h.send_header("ETag", etag)
    h.send_header("Cache-Control", cache)
    h.end_headers()
    h.wfile.write(corps)
