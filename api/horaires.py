"""GET /api/horaires?ecole=heh&formation=<nom> — horaire complet d'une formation.

{"ok": true, "data": {"meta": {...}, "formation": ..., "groupes": [...], "cours": [...]}}
Chaque cours porte ses groupes (vide = toute la formation) : l'app filtre
selon les groupes choisis par l'étudiant.

La réponse est gardée 15 minutes par un cache partagé (tous les
étudiants de la formation la partagent) et, si l'école tombe, la dernière
bonne version reste servie jusqu'à 7 jours (stale-if-error). Pendant la
revalidation le cache sert l'ancienne version : personne n'attend l'école.
Pas de rafraîchissement forcé : l'app se met à jour à l'ouverture, et un
paramètre de contournement exposerait l'école à des récupérations
complètes (~40 appels) à volonté.
Aucun secret requis : l'espace invités de l'école est public.
"""
import os
import sys
from http.server import BaseHTTPRequestHandler

ICI = os.path.dirname(os.path.abspath(__file__))
if ICI not in sys.path:
    sys.path.insert(0, ICI)

from _ecoles import ECOLES, debit, repondre_json, requete  # noqa: E402
from _hyperplanning import Surcharge  # noqa: E402

BUDGET = 75  # s, sous la limite de durée de la fonction chez l'hébergeur
CACHE_PARTAGE = "public, max-age=0, s-maxage=900, stale-while-revalidate=1800, stale-if-error=604800"
PARAMS = ("ecole", "formation")  # ordre de l'app (voir requete)


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Variantes d'adresse refusées ou redirigées : elles contourneraient
        # le cache partagé et atteindraient l'école pour chacune.
        q = requete(self, PARAMS, lambda statut, msg: repondre_json(
            self, statut, {"ok": False, "erreur": msg}))
        if q is None:
            return
        mod = ECOLES.get(q.get("ecole", ""))
        formation = q.get("formation", "")
        if mod is None or not formation:
            return repondre_json(self, 400, {"ok": False, "erreur":
                                 f"Paramètres attendus : ecole={'|'.join(ECOLES)} et formation=<nom>."})
        if len(formation) > 200:
            return repondre_json(self, 400, {"ok": False, "erreur": "Nom de formation trop long."})
        if not debit(self, "horaires", lambda statut, msg: repondre_json(
                self, statut, {"ok": False, "erreur": msg})):
            return
        try:
            data = mod.horaire(formation, budget=BUDGET)
            repondre_json(self, 200, {"ok": True, "data": data}, CACHE_PARTAGE)
        except ValueError as e:  # formation inconnue
            repondre_json(self, 404, {"ok": False, "erreur": str(e)})
        except Surcharge as e:  # fuse anti-abus de l'instance : dire d'attendre
            repondre_json(self, 429, {"ok": False, "erreur": str(e)})
        except Exception as e:  # noqa: BLE001 - message affiché dans l'app
            repondre_json(self, 502, {"ok": False, "erreur": str(e)[-300:]})

    def log_message(self, *args):
        pass  # silencieux
