"""Récupère les horaires HEH Planning (Pronote Campus, espace invités).

Utilisé par les points d'entrée de api/ (formations, horaires, pdf) et
par serve.py sur l'ordinateur.
"""
import os
import sys

ICI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ICI not in sys.path:
    sys.path.insert(0, ICI)

from _moteurs.hyperplanning import ClientHyperplanning  # noqa: E402

BASE = "https://hehplanning2026.umons.ac.be"
NOM = "HEH — Haute École en Hainaut"
SOURCE = "hehplanning2026.umons.ac.be (espace invités)"
PREMIER_LUNDI_DEFAUT = "2026-09-14"  # repli si l'école ne le donne pas
PLACES_PAR_JOUR = 48  # 48 créneaux de 15 min par jour (08h00 -> 21h00)

CLIENT = ClientHyperplanning(
    base=BASE,
    nom=NOM,
    source=SOURCE,
    premier_lundi_defaut=PREMIER_LUNDI_DEFAUT,
    places_par_jour_defaut=PLACES_PAR_JOUR,
    code="heh",
)

formations = CLIENT.formations
horaire = CLIENT.horaire
pdf_semaine = CLIENT.pdf_semaine
