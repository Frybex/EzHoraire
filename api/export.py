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
import os
import sys
from http.server import BaseHTTPRequestHandler

ICI = os.path.dirname(os.path.abspath(__file__))
if ICI not in sys.path:
    sys.path.insert(0, ICI)

from _ecoles import ECOLES, debit, requete  # noqa: E402
from _moteurs import export_ics  # noqa: E402
from _moteurs.hyperplanning import Surcharge  # noqa: E402
from _moteurs.ical import horaire_ical  # noqa: E402
from _partage import cours_export, erreur, filtrer_cours, propre, repondre_ics  # noqa: E402

BUDGET = 75  # s, sous la limite de durée de la fonction chez l'hébergeur
PARAMS = ("ecole", "formation", "groupes", "ical", "uid", "nom")
TITRE = "Export impossible"


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        q = requete(self, PARAMS, lambda statut, msg: erreur(self, statut, TITRE, msg))
        if q is None:
            return
        ical = (q.get("ical") or "").strip()
        formation = (q.get("formation") or "").strip()
        ecole = q.get("ecole", "")
        nom = propre(q.get("nom"))[:60] or "Horaire"
        sel = [g.strip() for g in (q.get("groupes") or "").split("|") if g.strip()]
        if ical:
            if len(ical) > 1200:
                return erreur(self, 400, TITRE, "Lien d'abonnement trop long.")
        else:
            if ECOLES.get(ecole) is None or not formation:
                return erreur(self, 400, TITRE, "Paramètres attendus : ecole=%s et formation=<nom>."
                              % "|".join(ECOLES))
            if len(formation) > 200:
                return erreur(self, 400, TITRE, "Nom de formation trop long.")
        if not debit(self, "export", lambda statut, msg: erreur(self, statut, TITRE, msg)):
            return
        try:
            if ical:
                data = horaire_ical(ical)
                sel = []  # le flux d'abonnement est déjà la sélection personnelle
            else:
                data = ECOLES[ecole].horaire(formation, budget=BUDGET)
            cours = filtrer_cours(data.get("cours") or [], sel)
            if not cours:
                raise ValueError("Aucun cours à exporter pour cet horaire.")
            texte = export_ics.construire(
                {"meta": data.get("meta") or {}, "cours": cours_export(cours, sel)},
                nom, uid=propre(q.get("uid"))[:40])
            repondre_ics(self, texte, export_ics.nom_fichier(nom))
        except ValueError as e:  # formation ou lien invalide, calendrier vide
            erreur(self, 404, TITRE, str(e))
        except Surcharge as e:  # fuse anti-abus : dire d'attendre
            erreur(self, 429, TITRE, str(e))
        except Exception as e:  # noqa: BLE001 - message montré à l'utilisateur
            erreur(self, 502, TITRE, str(e)[-300:])

    def log_message(self, *args):
        pass  # silencieux
