"""GET /api/formations?ecole=heh — formations proposées par l'école.

{"ok": true, "ecole": "HEH — ...", "formations": ["BA1 Sciences industrielles", ...]}
"""
import os
import sys
from http.server import BaseHTTPRequestHandler

ICI = os.path.dirname(os.path.abspath(__file__))
if ICI not in sys.path:
    sys.path.insert(0, ICI)

from _ecoles import ECOLES, debit, repondre_json, requete  # noqa: E402
from _hyperplanning import Surcharge  # noqa: E402

# La liste bouge rarement : gardée 1 h par un éventuel cache partagé (CDN).
CACHE_PARTAGE = "public, max-age=0, s-maxage=3600, stale-if-error=604800"
PARAMS = ("ecole",)


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Variantes d'adresse refusées ou redirigées (contournement du cache).
        q = requete(self, PARAMS, lambda statut, msg: repondre_json(
            self, statut, {"ok": False, "erreur": msg}))
        if q is None:
            return
        mod = ECOLES.get(q.get("ecole", ""))
        if mod is None:
            return repondre_json(self, 400, {"ok": False, "erreur": f"École attendue : {'|'.join(ECOLES)}."})
        if not debit(self, "formations", lambda statut, msg: repondre_json(
                self, statut, {"ok": False, "erreur": msg})):
            return
        try:
            repondre_json(self, 200, {"ok": True, "ecole": mod.NOM, "formations": mod.formations()},
                          CACHE_PARTAGE)
        except Surcharge as e:  # fuse anti-abus de l'instance : dire d'attendre
            repondre_json(self, 429, {"ok": False, "erreur": str(e)})
        except Exception as e:  # noqa: BLE001 - message affiché dans l'app
            repondre_json(self, 502, {"ok": False, "erreur": str(e)[-300:]})

    def log_message(self, *args):
        pass  # silencieux
