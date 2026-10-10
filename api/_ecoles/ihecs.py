"""Récupère les horaires IHECS (Hyperplanning, grilles publiées en images).

Utilisé par les points d'entrée de api/ (formations, horaires, pdf) et
par serve.py sur l'ordinateur.

L'IHECS publie son planning avec l'export « publication »
d'Hyperplanning : https://horaires.ihecs.be ne sert pas l'espace invités
(pas d'appelfonction, vérifié : /invite?fd=1 et /appelfonction/ → 404),
seulement des listes JavaScript et, pour chaque promotion et chaque
semaine, une grille PNG. Le moteur _moteurs/publication.py relit ces
grilles par OCR ; le « PDF » officiel de la semaine est l'image publiée
(l'app l'affiche comme document, voir DOCUMENT_MIME ci-dessous).
"""
import os
import sys

ICI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ICI not in sys.path:
    sys.path.insert(0, ICI)

from _moteurs.publication import ClientPublication  # noqa: E402

BASE = "https://horaires.ihecs.be"
NOM = "IHECS — Institut des Hautes Études des Communications Sociales"
SOURCE = "horaires.ihecs.be (grilles publiées, lues par OCR)"
# Premier lundi de l'année scolaire (repère des numéros de semaine) : la
# publication ne le donne pas, à ajuster à chaque rentrée.
PREMIER_LUNDI_DEFAUT = "2026-09-14"

CLIENT = ClientPublication(
    base=BASE,
    nom=NOM,
    source=SOURCE,
    code="ihecs",
    premier_lundi_defaut=PREMIER_LUNDI_DEFAUT,
)

# Le « PDF » de la semaine est une image chez cette école : le point
# d'entrée api/pdf sert le bon type MIME (voir getattr dans pdf.py).
DOCUMENT_MIME = "image/png"

formations = CLIENT.formations
horaire = CLIENT.horaire
pdf_semaine = CLIENT.pdf_semaine
