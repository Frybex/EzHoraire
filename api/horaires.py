"""GET /api/horaires?ecole=heh&formation=<nom> — horaire complet d'une formation.

{"ok": true, "data": {"meta": {...}, "formation": ..., "groupes": [...], "cours": [...]}}
Chaque cours porte ses groupes (vide = toute la formation) : l'app filtre
selon les groupes choisis par l'étudiant.

La réponse peut être gardée 15 minutes par un cache partagé (tous les
étudiants de la formation la partagent) et, si l'école tombe, la dernière
bonne version reste servie jusqu'à 7 jours (stale-if-error). Pendant la
revalidation le cache sert l'ancienne version : personne n'attend l'école.

&frais=<seau de 60 s> : rafraîchit avant l'échéance (bouton « Actualiser »).
L'app envoie un numéro de seau et non l'horodatage exact, et la réponse est
elle-même gardée 60 s : dix étudiants qui actualisent en même temps ne
déclenchent qu'une seule récupération chez l'école.
Aucun secret requis : l'espace invités de l'école est public.
"""
import os
import sys
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

ICI = os.path.dirname(os.path.abspath(__file__))
if ICI not in sys.path:
    sys.path.insert(0, ICI)

from _ecoles import ECOLES, ecole, repondre_json  # noqa: E402

BUDGET = 75  # s, sous la limite de durée de la fonction chez l'hébergeur
CACHE_PARTAGE = "public, max-age=0, s-maxage=900, stale-while-revalidate=1800, stale-if-error=604800"
# « Actualiser » : assez court pour être utile, assez long pour absorber une rafale.
CACHE_FRAIS = "public, max-age=0, s-maxage=60, stale-if-error=604800"


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        q = parse_qs(urlparse(self.path).query)
        mod = ecole(q)
        formation = (q.get("formation") or [""])[0]
        if mod is None or not formation:
            return repondre_json(self, 400, {"ok": False, "erreur":
                                 f"Paramètres attendus : ecole={'|'.join(ECOLES)} et formation=<nom>."})
        frais = "frais" in q
        try:
            data = mod.horaire(formation, budget=BUDGET, frais=frais)
            repondre_json(self, 200, {"ok": True, "data": data},
                          CACHE_FRAIS if frais else CACHE_PARTAGE)
        except ValueError as e:  # formation inconnue
            repondre_json(self, 404, {"ok": False, "erreur": str(e)})
        except Exception as e:  # noqa: BLE001 - message affiché dans l'app
            repondre_json(self, 502, {"ok": False, "erreur": str(e)[-300:]})

    def log_message(self, *args):
        pass  # silencieux
