"""Récupère les horaires Condorcet Planning (Pronote Campus, espace invités).

Utilisé par les points d'entrée de api/ (formations, horaires, pdf) et
par serve.py sur l'ordinateur.
"""
import os
import sys

ICI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ICI not in sys.path:
    sys.path.insert(0, ICI)

from _moteurs.hyperplanning import ClientHyperplanning  # noqa: E402

BASE = "https://horaires2026.condorcet.be"
NOM = "Condorcet — Haute École de la Province de Hainaut"
SOURCE = "horaires2026.condorcet.be (espace invités)"
PREMIER_LUNDI_DEFAUT = "2026-09-14"  # repli si l'école ne le donne pas
PLACES_PAR_JOUR = 84  # 84 créneaux de 10 min par jour (08h00 -> 22h00)

CLIENT = ClientHyperplanning(
    base=BASE,
    nom=NOM,
    source=SOURCE,
    premier_lundi_defaut=PREMIER_LUNDI_DEFAUT,
    places_par_jour_defaut=PLACES_PAR_JOUR,
    code="condorcet",
)

# L'école publie une ressource d'essai « TEST », sans horaire utile :
# on ne la propose pas (l'horaire, lui, reste servi si on le demande).
_FORMATIONS_ECOLE = CLIENT.formations


def formations(budget=20):
    return [f for f in _FORMATIONS_ECOLE(budget)
            if " ".join(f.split()).upper() != "TEST"]


horaire = CLIENT.horaire
pdf_semaine = CLIENT.pdf_semaine
