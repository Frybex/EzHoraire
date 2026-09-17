"""Récupère les horaires ULB publiés sur TimeEdit (vue publique).

Utilisé par les points d'entrée de api/ (formations, horaires, recherche,
pdf) et par serve.py sur l'ordinateur. Aucun identifiant n'est requis :
c'est la vue « je n'ai pas encore d'ULBID ».

Deux façons de composer un horaire :
- par niveau d'études : « B-DROIB:2 · Bachelier en droit… » — le niveau
  et ses groupes (« groupe 01 », « PAD6 »…) forment l'horaire ;
- par cours (UE) : la clé commence par « PAR: » et liste des mnémoniques
  (« PAR:DROIC2001,DROIC2007 ») — utile pour les cours isolés et les
  programmes à la carte.
"""
import os
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
if ICI not in sys.path:
    sys.path.insert(0, ICI)

from _timeedit import ClientTimeEdit  # noqa: E402

BASE = "https://cloud.timeedit.net/be_ulb/web/public"
NOM = "ULB — Université libre de Bruxelles"
SOURCE = "cloud.timeedit.net/be_ulb (horaires publics)"
PREMIER_LUNDI_DEFAUT = "2026-09-14"  # premier lundi de l'année académique
ANNEE = "202627"                     # 2026-2027 : filtre des unités d'enseignement
# TimeEdit expose deux vues publiques : « par cours » (sid 10, la plus
# riche : profs, salles, groupes) et « par niveau » (sid 11).

CLIENT = ClientTimeEdit(
    base=BASE,
    nom=NOM,
    source=SOURCE,
    code="ulb",
    premier_lundi_defaut=PREMIER_LUNDI_DEFAUT,
    annee=ANNEE,
    sid_cours="10",
    sid_niveau="11",
)

formations = CLIENT.formations
horaire = CLIENT.horaire
pdf_semaine = CLIENT.pdf_semaine
recherche = CLIENT.recherche
