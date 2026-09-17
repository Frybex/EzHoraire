"""Récupère les horaires UMONS Planning (Pronote Campus, espace invités).

Utilisé par les points d'entrée de api/ (formations, horaires, pdf) et
par serve.py sur l'ordinateur.
"""
import os
import sys

ICI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ICI not in sys.path:
    sys.path.insert(0, ICI)

from _moteurs.hyperplanning import ClientHyperplanning  # noqa: E402

BASE = "https://hplanning2026.umons.ac.be"
NOM = "UMONS — Université de Mons"
SOURCE = "hplanning2026.umons.ac.be (espace invités)"
PREMIER_LUNDI_DEFAUT = "2026-09-07"
PLACES_PAR_JOUR = 68

CLIENT = ClientHyperplanning(
    base=BASE,
    nom=NOM,
    source=SOURCE,
    premier_lundi_defaut=PREMIER_LUNDI_DEFAUT,
    places_par_jour_defaut=PLACES_PAR_JOUR,
    code="umons",
)

formations = CLIENT.formations
horaire = CLIENT.horaire
pdf_semaine = CLIENT.pdf_semaine
