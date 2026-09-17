"""GET /api/ical?lien=<url> — horaire d'un lien d'abonnement TimeEdit.

L'étudiant colle le lien « S'abonner » de son Mon horaire (ULBID) : il
contient sa sélection personnelle et fonctionne sans mot de passe. La
réponse a la même forme que api/horaires (meta, groupes, cours).

Volontairement sans cache partagé : le lien est personnel. Il ne doit
jamais se retrouver dans un cache CDN ni dans les données envoyées à un
autre utilisateur.
"""
import os
import sys
from http.server import BaseHTTPRequestHandler

ICI = os.path.dirname(os.path.abspath(__file__))
if ICI not in sys.path:
    sys.path.insert(0, ICI)

from _ecoles import debit, repondre_json, requete  # noqa: E402
from _moteurs.hyperplanning import Surcharge  # noqa: E402
from _moteurs.ical import horaire_ical  # noqa: E402

PARAMS = ("lien",)


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        q = requete(self, PARAMS, lambda statut, msg: repondre_json(
            self, statut, {"ok": False, "erreur": msg}))
        if q is None:
            return
        lien = (q.get("lien") or "").strip()
        if not lien or len(lien) > 1200:
            return repondre_json(self, 400, {"ok": False, "erreur": "Lien manquant ou trop long."})
        if not debit(self, "ical", lambda statut, msg: repondre_json(
                self, statut, {"ok": False, "erreur": msg})):
            return
        try:
            data = horaire_ical(lien)
            # Cache privé du navigateur seulement : jamais chez un intermédiaire.
            repondre_json(self, 200, {"ok": True, "data": data}, "private, max-age=900")
        except ValueError as e:  # lien invalide, expiré ou non-TimeEdit
            repondre_json(self, 400, {"ok": False, "erreur": str(e)})
        except Surcharge as e:
            repondre_json(self, 429, {"ok": False, "erreur": str(e)})
        except Exception as e:  # noqa: BLE001 - message affiché dans l'app
            repondre_json(self, 502, {"ok": False, "erreur": str(e)[-300:]})

    def log_message(self, *args):
        pass  # silencieux
