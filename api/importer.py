"""GET /api/importer?ecole=ulb&liste=<texte> — liste de cours collée -> codes.

L'étudiant colle sa liste (MonULB, TimeEdit, capture OCR) : le code repère
les codes, vérifie chacun dans le catalogue de l'année et Jev tranche les
lignes floues. L'app affiche le résultat pour validation humaine.

Réponse : {"ok": true, "data": {"cours": [...], "inconnus": [...], "jev": bool}}
Volontairement sans cache partagé : la liste est propre à l'étudiant.
"""
import os
import sys
from http.server import BaseHTTPRequestHandler

ICI = os.path.dirname(os.path.abspath(__file__))
if ICI not in sys.path:
    sys.path.insert(0, ICI)

from _ecoles import ECOLES, debit, repondre_json, requete  # noqa: E402
from _moteurs.hyperplanning import Surcharge  # noqa: E402
from _moteurs.import_liste import importer  # noqa: E402

PARAMS = ("ecole", "liste")
LONGUEUR_MAX = 4000


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        q = requete(self, PARAMS, lambda statut, msg: repondre_json(
            self, statut, {"ok": False, "erreur": msg}))
        if q is None:
            return
        mod = ECOLES.get(q.get("ecole", ""))
        liste = q.get("liste") or ""
        if mod is None or not hasattr(mod, "recherche"):
            return repondre_json(self, 400, {"ok": False, "erreur":
                                 f"Import non disponible pour cette école (attendu : {'|'.join(ECOLES)})."})
        if len(liste.strip()) < 3:
            return repondre_json(self, 400, {"ok": False, "erreur": "Liste vide."})
        if len(liste) > LONGUEUR_MAX:
            return repondre_json(self, 400, {"ok": False, "erreur": "Liste trop longue."})
        if not debit(self, "importer", lambda statut, msg: repondre_json(
                self, statut, {"ok": False, "erreur": msg})):
            return
        try:
            data = importer(liste, mod, getattr(mod, "ANNEE", ""))
            repondre_json(self, 200, {"ok": True, "data": data}, "no-store")
        except Surcharge as e:
            repondre_json(self, 429, {"ok": False, "erreur": str(e)})
        except Exception as e:  # noqa: BLE001 - message affiché dans l'app
            repondre_json(self, 502, {"ok": False, "erreur": str(e)[-300:]})

    def log_message(self, *args):
        pass  # silencieux
