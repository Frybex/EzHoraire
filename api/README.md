# `api/` — carte du serveur

Trois étages, du plus public au plus technique. Si tu cherches quelque
chose qui concerne **une école précise**, c'est dans `_ecoles/<école>.py`
et nulle part ailleurs.

```
api/
├── formations.py   GET /api/formations?ecole=…            liste des formations
├── horaires.py     GET /api/horaires?ecole=…&formation=…  horaire complet
├── export.py       GET /api/export?ecole=…&formation=…    horaire en .ics (Calendrier iPhone)
├── abonnement.py   GET /api/abonnement?jeton=…            flux .ics qui se met à jour (abonnement)
├── recherche.py    GET /api/recherche?ecole=…&genre=…&q=… recherche en direct
├── ical.py         GET /api/ical?lien=…                   horaire d'un lien perso
├── importer.py     POST /api/importer (corps JSON)        liste collée → cours
├── pdf.py          GET /api/pdf?ecole=…&semaine=…         PDF officiel
├── config.py       GET /api/config                        clés publiques + écoles exposées
├── stats.py        GET /api/stats                         dashboard admin (réservé : comptes, visites, parcours anonyme)
├── bugs.py         POST /api/bugs (public)                reports bug / demande (anonymes OK)
│                   GET /api/bugs + PATCH /api/bugs?id=..  lecture + statuts (admin)
├── _partage.py     aides communes à export.py et abonnement.py (groupes, filtre, .ics)
│
├── _ecoles/        UNE ÉCOLE = UN FICHIER
│   ├── __init__.py  registre ECOLES + aides HTTP (réponses, quotas par IP)
│   ├── heh.py       HEH — Haute École en Hainaut       → moteur hyperplanning
│   ├── umons.py     UMONS — Université de Mons         → moteur hyperplanning
│   ├── condorcet.py Condorcet — Haute École de la Province de Hainaut → moteur hyperplanning
│   ├── helb.py      HELB — Haute École libre de Bruxelles Ilya Prigogine → moteur hyperplanning
│   ├── ulb.py       ULB — Université libre de Bruxelles→ moteur timeedit
│   └── ucl.py       UCLouvain (en test, EZH_UCL=1)     → moteur propre
│
└── _moteurs/       LE TRAVAIL COMMUN À PLUSIEURS ÉCOLES
    ├── hyperplanning.py  Pronote Campus / Hyperplanning : session, décodage, PDF
    ├── timeedit.py       TimeEdit (vue publique) : objets, réservations, PDF
    ├── ical.py           flux iCalendar d'un lien d'abonnement → format des écoles
    ├── export_ics.py     horaire → fichier .ics (miroir de export_ics.js)
    ├── import_liste.py   liste de cours collée → codes du catalogue
    └── typesafe.py       Jev : les lignes floues d'un import (clé serveur)
```

Les noms commençant par `_` ne sont jamais servis comme fonctions par
l'hébergeur : ce sont des bibliothèques, pas des points d'entrée.

## Ajouter une école

1. `_ecoles/<code>.py` : expose `NOM`, `formations()`, `horaire(formation)`
   et `pdf_semaine(formation, groupe, semaine)`. Si l'école a trop de
   formations pour en télécharger la liste, ajoute `recherche(texte, genre)`
   et laisse `formations()` renvoyer `[]`.
   Si un moteur existant convient, le fichier n'est qu'une configuration
   (voir `heh.py` : une dizaine de lignes).
2. Une ligne dans `ECOLES`, dans `_ecoles/__init__.py`.
3. Une entrée dans le tableau `ECOLES` de `index.html` (et dans `RECHERCHE`
   si l'école passe par la recherche plutôt que par une liste).

Une école pas encore assez testée reste invisible : l'enregistrer derrière
une variable d'environnement (voir `EZH_UCL` pour l'UCLouvain). `/api/config`
ne liste alors pas l'école, et l'app ne la propose pas.

## Ne pas faire travailler l'école pour rien

Chaque point d'entrée le fait déjà, mais c'est la règle à retenir en
touchant à ce dossier :

- **Valider avant d'appeler.** Un nom de formation inventé, une semaine
  hors année, un groupe inconnu se refusent à partir de ce qui est déjà en
  mémoire — jamais en interrogeant l'école.
- **Mémoriser.** `_memo()` garde les horaires 15 min, les listes et les
  recherches 1 h, par instance. Une recherche refaite à chaque frappe
  corrigée ne doit coûter qu'une fois.
- **Borner.** `_ecoles.debit()` limite les appels par IP et par point
  d'entrée ; chaque moteur a en plus un fusible par instance
  (`SESSIONS_PAR_MINUTE`, `APPELS_PAR_MINUTE`). Un point d'entrée qui
  déclenche plusieurs appels école (l'import d'une liste) borne aussi le
  nombre d'appels d'une seule requête.
- **Servir le cache partagé.** Les réponses publiques portent un
  `s-maxage` : c'est l'hébergeur qui absorbe les étudiants d'une même
  formation. Une URL qui varie inutilement (paramètres en désordre) le
  contourne — d'où la normalisation dans `_ecoles.requete()`.
