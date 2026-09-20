"""GET /api/export?ecole=..&formation=..&groupes=..&ical=..&uid=..&nom=..

L'horaire en fichier iCalendar (.ics), servi sur une vraie adresse en
text/calendar. Sur iPhone, Safari ouvre alors Calendrier directement
(« Ajouter tout ») ; un fichier fabriqué dans la page (blob:) devrait être
rouvert à la main depuis Téléchargements. Les données sont les mêmes que
/api/horaires (ou /api/ical pour un lien d'abonnement), filtrées selon les
groupes de l'étudiant.

Cache privé : la sélection de groupes est personnelle, et le lien
d'abonnement ne doit jamais se retrouver chez un intermédiaire.
"""
import html
import os
import sys
from http.server import BaseHTTPRequestHandler
from urllib.parse import quote

ICI = os.path.dirname(os.path.abspath(__file__))
if ICI not in sys.path:
    sys.path.insert(0, ICI)

from _ecoles import ECOLES, debit, requete  # noqa: E402
from _moteurs import export_ics  # noqa: E402
from _moteurs.hyperplanning import Surcharge  # noqa: E402
from _moteurs.ical import horaire_ical  # noqa: E402

BUDGET = 75  # s, sous la limite de durée de la fonction chez l'hébergeur
PARAMS = ("ecole", "formation", "groupes", "ical", "uid", "nom")

PAGE_ERREUR = """<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Export impossible — EzHoraire</title>
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
  <h1>Export impossible</h1>
  <p>%s</p>
  <p><a href="/">Revenir à EzHoraire</a></p>
</main></body></html>
"""


def _erreur(h, statut, message):
    """Page lisible : cette adresse s'ouvre dans le navigateur, pas dans l'app."""
    corps = (PAGE_ERREUR % html.escape(str(message))).encode("utf-8")
    h.send_response(statut)
    h.send_header("Content-Type", "text/html; charset=utf-8")
    h.send_header("Content-Length", str(len(corps)))
    h.send_header("Cache-Control", "no-store")
    h.end_headers()
    h.wfile.write(corps)


def _repondre_ics(h, texte, nom):
    """Réponse text/calendar : Safari (iOS) l'ouvre dans Calendrier.

    `inline` et non `attachment` : iOS montre l'aperçu avec « Ajouter
    tout » au lieu de forcer un téléchargement."""
    corps = texte.encode("utf-8")
    ascii_nom = nom.encode("ascii", "replace").decode("ascii").replace('"', "")
    h.send_response(200)
    h.send_header("Content-Type", "text/calendar; charset=utf-8")
    h.send_header("Content-Disposition",
                  'inline; filename="%s"; filename*=UTF-8\'\'%s' % (ascii_nom, quote(nom)))
    h.send_header("Content-Length", str(len(corps)))
    h.send_header("Cache-Control", "private, no-store")
    h.end_headers()
    h.wfile.write(corps)


def _propre(s):
    return " ".join(str(s or "").split())


def _prefixe(s):
    return str(s or "").lstrip().startswith("<")


def _court(s):
    """Nom court d'un groupe UMONS : « <formation>Groupe 1 » -> « Groupe 1 »."""
    import re
    return _propre(re.sub(r"^\s*<[^>]*>", "", str(s or "")))


def _meme_groupe(a, b):
    """Mêmes règles que memeGroupe() de index.html (préfixe UMONS toléré)."""
    a, b = _propre(a), _propre(b)
    if a == b:
        return True
    if _prefixe(a) and _prefixe(b):
        return False
    return _court(a) == _court(b)


def _filtrer(cours, sel):
    """Cours d'un horaire pour les groupes choisis (mêmes règles que l'app)."""
    if not sel:
        return list(cours)
    out = []
    for c in cours:
        groupes = c.get("groupes") or []
        if not groupes or any(_meme_groupe(g, x) for g in groupes for x in sel):
            out.append(c)
    return out


def _cours_export(cours, sel):
    """Cours au format attendu par export_ics.construire()."""
    out = []
    for c in cours:
        matiere = c.get("matiere") or "Cours"
        out.append({
            "jour": c.get("jour"),
            "debut": c.get("debut"),
            "fin": c.get("fin"),
            "matiere": matiere,
            "type": c.get("type") or "",
            "profs": c.get("profs") or "",
            "salles": c.get("salles") or "",
            # Un seul groupe choisi : inutile de le répéter (comme l'app).
            "groupes": [] if len(sel) == 1 else (c.get("groupes") or []),
            "semaines": c.get("semaines") or [],
        })
    return out


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        q = requete(self, PARAMS, lambda statut, msg: _erreur(self, statut, msg))
        if q is None:
            return
        ical = (q.get("ical") or "").strip()
        formation = (q.get("formation") or "").strip()
        ecole = q.get("ecole", "")
        nom = _propre(q.get("nom"))[:60] or "Horaire"
        sel = [g.strip() for g in (q.get("groupes") or "").split("|") if g.strip()]
        if ical:
            if len(ical) > 1200:
                return _erreur(self, 400, "Lien d'abonnement trop long.")
        else:
            if ECOLES.get(ecole) is None or not formation:
                return _erreur(self, 400, "Paramètres attendus : ecole=%s et formation=<nom>."
                               % "|".join(ECOLES))
            if len(formation) > 200:
                return _erreur(self, 400, "Nom de formation trop long.")
        if not debit(self, "export", lambda statut, msg: _erreur(self, statut, msg)):
            return
        try:
            if ical:
                data = horaire_ical(ical)
                sel = []  # le flux d'abonnement est déjà la sélection personnelle
            else:
                data = ECOLES[ecole].horaire(formation, budget=BUDGET)
            cours = _filtrer(data.get("cours") or [], sel)
            if not cours:
                raise ValueError("Aucun cours à exporter pour cet horaire.")
            texte = export_ics.construire(
                {"meta": data.get("meta") or {}, "cours": _cours_export(cours, sel)},
                nom, uid=_propre(q.get("uid"))[:40])
            _repondre_ics(self, texte, export_ics.nom_fichier(nom))
        except ValueError as e:  # formation ou lien invalide, calendrier vide
            _erreur(self, 404, str(e))
        except Surcharge as e:  # fuse anti-abus : dire d'attendre
            _erreur(self, 429, str(e))
        except Exception as e:  # noqa: BLE001 - message montré à l'utilisateur
            _erreur(self, 502, str(e)[-300:])

    def log_message(self, *args):
        pass  # silencieux
