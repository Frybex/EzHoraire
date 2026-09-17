"""GET /api/pdf?ecole=heh&formation=<nom>&groupe=<nom>&semaine=4 — PDF officiel d'une semaine.

`groupe` facultatif : sans lui, PDF de toute la formation.

Le PDF d'une semaine est le même pour tous les étudiants d'un même groupe :
un cache partagé le garde 30 minutes, ce qui évite de redemander à l'école
un document identique à chaque clic. C'est le point d'entrée le plus coûteux
(une session complète + génération + téléchargement), donc celui qu'il faut
le plus amortir. Si l'école tombe, le dernier bon PDF reste servi 24 h.
"""
import os
import re
import sys
from http.server import BaseHTTPRequestHandler
from urllib.parse import quote

ICI = os.path.dirname(os.path.abspath(__file__))
if ICI not in sys.path:
    sys.path.insert(0, ICI)

from _ecoles import ECOLES, debit, repondre_texte, requete  # noqa: E402
from _hyperplanning import Surcharge  # noqa: E402

BUDGET = 40  # s, sous la limite de durée de la fonction chez l'hébergeur
CACHE_PARTAGE = ("public, max-age=0, s-maxage=1800, "
                 "stale-while-revalidate=3600, stale-if-error=86400")
PARAMS = ("ecole", "formation", "groupe", "semaine")  # ordre de l'app


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Variantes d'adresse refusées ou redirigées : une URL inédite
        # contourne le cache partagé et atteint l'école à chaque fois.
        q = requete(self, PARAMS, lambda statut, msg: repondre_texte(self, statut, msg))
        if q is None:
            return
        mod = ECOLES.get(q.get("ecole", ""))
        formation = q.get("formation", "")
        groupe = q.get("groupe", "")
        semaine = q.get("semaine", "")
        if mod is None or not formation or not re.fullmatch(r"[0-9]{1,3}", semaine):
            return repondre_texte(self, 400, f"Paramètres attendus : ecole={'|'.join(ECOLES)}, "
                                             "formation=<nom>, semaine=<numéro> (groupe facultatif).")
        if len(formation) > 200 or len(groupe) > 120:
            return repondre_texte(self, 400, "Paramètre trop long.")
        if not 1 <= int(semaine) <= 60:
            return repondre_texte(self, 404, f"semaine {semaine} non publiée par l'école")
        if not debit(self, "pdf", lambda statut, msg: repondre_texte(self, statut, msg)):
            return
        try:
            contenu = mod.pdf_semaine(formation, groupe, int(semaine), budget=BUDGET)
        except ValueError as e:
            return repondre_texte(self, 404, str(e))
        except Surcharge as e:  # fuse anti-abus de l'instance : dire d'attendre
            return repondre_texte(self, 429, str(e))
        except Exception as e:  # noqa: BLE001 - école injoignable, pare-feu...
            return repondre_texte(self, 502, f"Impossible d'obtenir le PDF de l'école ({str(e)[-200:]}).")
        nom = f"Horaire {groupe or formation} - semaine {semaine}.pdf"
        self.send_response(200)
        self.send_header("Content-Type", "application/pdf")
        self.send_header("Content-Length", str(len(contenu)))
        self.send_header("Content-Disposition", f"inline; filename*=UTF-8''{quote(nom)}")
        self.send_header("Cache-Control", CACHE_PARTAGE)
        self.end_headers()
        self.wfile.write(contenu)

    def log_message(self, *args):
        pass  # silencieux
