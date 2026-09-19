"""Récupère les horaires HELB Planning (Hyperplanning, espace invités).

Utilisé par les points d'entrée de api/ (formations, horaires, pdf) et
par serve.py sur l'ordinateur.

La HELB publie son planning à l'adresse « planning.helb-prigogine.be »
sous un dossier d'année (« /2026-2027 »). Elle parle le protocole
« moderne » d'Hyperplanning (clés numeroOrdre / nom / donneesSec, arrivé
avec la version 2024) — le moteur le détecte tout seul, mais on le fixe
ici pour ne pas dépendre de l'écriture de la page.
"""
import os
import sys

ICI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ICI not in sys.path:
    sys.path.insert(0, ICI)

from _moteurs.hyperplanning import ClientHyperplanning  # noqa: E402

BASE = "https://planning.helb-prigogine.be/2026-2027"
NOM = "HELB — Haute École libre de Bruxelles Ilya Prigogine"
SOURCE = "planning.helb-prigogine.be (espace invités)"
PREMIER_LUNDI_DEFAUT = "2026-09-14"  # repli si l'école ne le donne pas
PLACES_PAR_JOUR = 56  # 56 créneaux de 15 min par jour (08h00 -> 22h00)

CLIENT = ClientHyperplanning(
    base=BASE,
    nom=NOM,
    source=SOURCE,
    premier_lundi_defaut=PREMIER_LUNDI_DEFAUT,
    places_par_jour_defaut=PLACES_PAR_JOUR,
    code="helb",
    protocole="moderne",
)

formations = CLIENT.formations
horaire = CLIENT.horaire
pdf_semaine = CLIENT.pdf_semaine
