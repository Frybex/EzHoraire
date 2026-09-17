"""GET /api/recherche?ecole=ulb&genre=niveau&q=droit — recherche en direct.

Toutes les écoles n'ont pas une liste de formations tenable (l'ULB a plus
de 2 000 niveaux d'études) : celles-là exposent une recherche serveur.

{"ok": true, "ecole": "ULB — ...", "resultats": [{"cle": ..., "code": ..., "titre": ...}]}
`cle` est la valeur à renvoyer telle quelle dans formation= (api/horaires).

Le résultat d'une requête est gardé 1 h par le cache partagé : les mêmes
recherches (« droit », « DROIC ») servent tous les étudiants sans retoucher
à l'école.
"""
import os
import sys
from http.server import BaseHTTPRequestHandler

ICI = os.path.dirname(os.path.abspath(__file__))
if ICI not in sys.path:
    sys.path.insert(0, ICI)

from _ecoles import ECOLES, debit, repondre_json, requete  # noqa: E402
from _hyperplanning import Surcharge  # noqa: E402

CACHE_PARTAGE = "public, max-age=0, s-maxage=3600, stale-if-error=604800"
PARAMS = ("ecole", "genre", "q")
GENRES = ("niveau", "ue")


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        q = requete(self, PARAMS, lambda statut, msg: repondre_json(
            self, statut, {"ok": False, "erreur": msg}))
        if q is None:
            return
        mod = ECOLES.get(q.get("ecole", ""))
        genre = q.get("genre", "")
        texte = " ".join((q.get("q") or "").split())
        if mod is None or not hasattr(mod, "recherche"):
            return repondre_json(self, 400, {"ok": False, "erreur":
                                 f"Recherche non disponible pour cette école (attendu : {'|'.join(ECOLES)})."})
        if genre not in GENRES:
            return repondre_json(self, 400, {"ok": False, "erreur":
                                 f"genre attendu : {'|'.join(GENRES)}."})
        if len(texte) < 2:
            return repondre_json(self, 200, {"ok": True, "ecole": mod.NOM, "resultats": []},
                                 CACHE_PARTAGE)
        if len(texte) > 60:
            return repondre_json(self, 400, {"ok": False, "erreur": "Recherche trop longue."})
        if not debit(self, "recherche", lambda statut, msg: repondre_json(
                self, statut, {"ok": False, "erreur": msg})):
            return
        try:
            repondre_json(self, 200, {"ok": True, "ecole": mod.NOM,
                                      "resultats": mod.recherche(texte, genre)},
                          CACHE_PARTAGE)
        except Surcharge as e:  # fuse anti-abus de l'instance : dire d'attendre
            repondre_json(self, 429, {"ok": False, "erreur": str(e)})
        except Exception as e:  # noqa: BLE001 - message affiché dans l'app
            repondre_json(self, 502, {"ok": False, "erreur": str(e)[-300:]})

    def log_message(self, *args):
        pass  # silencieux
