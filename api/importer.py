"""POST /api/importer — liste de cours collée -> codes du catalogue.

Corps JSON : {"ecole": "ulb", "liste": "<le texte collé>"}
Réponse    : {"ok": true, "data": {"cours": [...], "a_confirmer": [...],
                                   "inconnus": [...], "jev": bool}}

L'étudiant colle sa liste (MonULB, TimeEdit, capture OCR) : le code repère
les codes, vérifie chacun dans le catalogue de l'année et Jev tranche les
lignes floues. L'app affiche le résultat pour validation humaine.

En POST, et pas en GET : la liste est le programme de cours d'une personne
identifiable. Dans une adresse, elle serait recopiée dans les journaux de
l'hébergeur, dans l'historique du navigateur et dans le `Referer` envoyé
aux liens sortants. Dans un corps de requête, elle ne va nulle part
ailleurs que dans cette fonction. Volontairement sans cache partagé, pour
la même raison.

Note d'écriture : les aides sont des fonctions du module, pas des méthodes.
serve.py appelle `handler.do_POST(son_propre_handler)` pour rejouer l'API
en local — une méthode d'instance n'existerait pas sur cet objet-là.
"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse

ICI = os.path.dirname(os.path.abspath(__file__))
if ICI not in sys.path:
    sys.path.insert(0, ICI)

from _ecoles import ECOLES, debit, repondre_json  # noqa: E402
from _moteurs.hyperplanning import Surcharge  # noqa: E402
from _moteurs.import_liste import importer  # noqa: E402

LONGUEUR_MAX = 4000        # caractères de liste acceptés
CORPS_MAX = 16 * 1024      # octets lus au maximum, quoi qu'annonce l'appelant
CHAMPS = {"ecole", "liste"}


def _erreur(h, statut, message):
    repondre_json(h, statut, {"ok": False, "erreur": message})


def _corps(h):
    """Le JSON envoyé, ou None si une réponse d'erreur est déjà partie.

    La taille est bornée deux fois : sur l'en-tête annoncé et sur ce qui
    est réellement lu. Un `Content-Length` menteur ne peut donc pas faire
    lire un flux sans fin."""
    try:
        annonce = int(h.headers.get("Content-Length") or 0)
    except ValueError:
        annonce = -1
    if annonce < 0:
        _erreur(h, 400, "Requête mal formée.")
        return None
    if annonce > CORPS_MAX:
        _erreur(h, 413, "Liste trop longue.")
        return None
    brut = h.rfile.read(min(annonce, CORPS_MAX)) if annonce else b""
    try:
        corps = json.loads(brut.decode("utf-8") or "{}")
    except (UnicodeDecodeError, ValueError):
        _erreur(h, 400, "Corps de requête illisible (JSON attendu).")
        return None
    if not isinstance(corps, dict):
        _erreur(h, 400, "Corps de requête illisible (objet JSON attendu).")
        return None
    inconnus = set(corps) - CHAMPS
    if inconnus:
        _erreur(h, 400, "Champ inconnu : " + ", ".join(sorted(inconnus)) + ".")
        return None
    return corps


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # Rien n'est attendu dans l'adresse : tout passe par le corps.
        if urlparse(self.path).query:
            return _erreur(self, 400, "Ce point d'entrée ne prend pas de paramètre "
                                      "dans l'adresse : envoie un corps JSON.")
        corps = _corps(self)
        if corps is None:
            return
        ecole = corps.get("ecole")
        liste = corps.get("liste")
        if not isinstance(ecole, str) or not isinstance(liste, str):
            return _erreur(self, 400, "Corps attendu : "
                                      '{"ecole": "…", "liste": "…"} (deux textes).')
        mod = ECOLES.get(ecole)
        if mod is None or not hasattr(mod, "recherche"):
            return _erreur(self, 400, "Import non disponible pour cette école "
                                      f"(attendu : {'|'.join(ECOLES)}).")
        if len(liste.strip()) < 3:
            return _erreur(self, 400, "Liste vide.")
        if len(liste) > LONGUEUR_MAX:
            return _erreur(self, 400, "Liste trop longue.")
        if not debit(self, "importer", lambda statut, msg: _erreur(self, statut, msg)):
            return
        try:
            data = importer(liste, mod, getattr(mod, "ANNEE", ""))
            repondre_json(self, 200, {"ok": True, "data": data}, "no-store")
        except Surcharge as e:
            _erreur(self, 429, str(e))
        except Exception as e:  # noqa: BLE001 - message affiché dans l'app
            _erreur(self, 502, str(e)[-300:])

    def do_GET(self):
        # Une page ouverte avant ce changement enverrait la liste dans
        # l'adresse : lui dire de se recharger plutôt que de l'accepter.
        self.send_response(405)
        self.send_header("Allow", "POST")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        corps = json.dumps({"ok": False, "erreur": "Recharge la page : l'import se "
                            "fait maintenant en POST."}, ensure_ascii=False).encode("utf-8")
        self.send_header("Content-Length", str(len(corps)))
        self.end_headers()
        self.wfile.write(corps)

    def log_message(self, *args):
        pass  # silencieux
