"""GET /api/formations?ecole=heh — formations proposées par l'école.

{"ok": true, "ecole": "HEH — ...", "formations": ["BA1 Sciences industrielles", ...]}
"""
import os
import sys
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

ICI = os.path.dirname(os.path.abspath(__file__))
if ICI not in sys.path:
    sys.path.insert(0, ICI)

from _ecoles import ECOLES, ecole, repondre_json  # noqa: E402

# La liste bouge rarement : gardée 1 h par un éventuel cache partagé (CDN).
CACHE_PARTAGE = "public, max-age=0, s-maxage=3600, stale-if-error=604800"
PARAMS = {"ecole"}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        q = parse_qs(urlparse(self.path).query)
        # Paramètres inconnus refusés tout de suite (contournement du cache).
        inconnus = set(q) - PARAMS
        if inconnus:
            return repondre_json(self, 400, {"ok": False, "erreur":
                                 "Paramètre inconnu : " + ", ".join(sorted(inconnus)) + "."})
        mod = ecole(q)
        if mod is None:
            return repondre_json(self, 400, {"ok": False, "erreur": f"École attendue : {'|'.join(ECOLES)}."})
        try:
            repondre_json(self, 200, {"ok": True, "ecole": mod.NOM, "formations": mod.formations()},
                          CACHE_PARTAGE)
        except Exception as e:  # noqa: BLE001 - message affiché dans l'app
            repondre_json(self, 502, {"ok": False, "erreur": str(e)[-300:]})

    def log_message(self, *args):
        pass  # silencieux
