"""Récupère les horaires UCLouvain publiés sur « Mon horaire ».

Utilisé par les points d'entrée de api/ (recherche, horaires) et par
serve.py sur l'ordinateur. Aucun identifiant n'est requis : Mon horaire
(monhoraire.uclouvain.be), l'outil officiel de l'UCLouvain, expose une
vue publique des horaires.

À l'UCLouvain, un « code » désigne aussi bien un cours (LINFO1101) qu'un
programme (SINF11BA) : la même recherche publique répond les deux, et un
code donne toutes ses séances. Deux façons de composer un horaire :
- par programme : « SINF11BA » — toutes les séances du programme ;
- par cours (sigles) : la clé commence par « PAR: » et liste des codes
  (« PAR:LINFO1101,LEPL1101 ») — utile pour les cours isolés et les
  programmes à la carte.

La recherche renvoie des entrées utilisables **telles quelles** : les
sous-sélections (« DROI11BA - Cours obligatoires ») et les variantes
(« SINF11BA - anglais ») sont des codes à part entière, avec leurs
propres séances — les replier sur leur préfixe perdrait la sélection.

L'année académique (year=2026-2027) est déduite de la date. Mon horaire
l'ignore aujourd'hui (vérifié : 2020-2021 répond la même chose que
2026-2027) et renvoie ce qui est publié ; le repli sur l'année
précédente reste en filet si l'API se remet à filtrer par année.
"""
import json
import re
import threading
import time
from datetime import datetime, timedelta
from urllib.parse import quote

import requests

from _moteurs.hyperplanning import Surcharge, format_ensemble, journal, maintenant, tri_naturel

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
BASE = "https://monhoraire.uclouvain.be"
TIMEOUT_APPEL = 20        # s par requête (un appel normal prend ~300 ms)
APPELS_PAR_MINUTE = 300   # fuse anti-abus : appels Mon horaire / min / instance
FENETRE_APPELS = 60.0

RX_UE = re.compile(r"^[A-Z]{2,6}[0-9]{3,4}[A-Z]?$")     # LINFO1101, WFARM2121
RX_TYPE = re.compile(r"^([A-Z]{2,6})\s*:\s*(.+)$")
RX_HORAIRE = re.compile(r"\d{1,2}[h:]\d{2}\s*-\s*\d{1,2}[h:]\d{2}")
RX_NOTE = re.compile(r"^(répartition|/!\\|étudiants)", re.I)
# Types d'audience : le code d'activité dit qui est concerné (tout le
# programme, une faculté…) ou une séance subie (examens, tests, concours,
# consultations), pas un choix d'étudiant. Sans groupe, le filtre de
# l'app garde ces séances toujours visibles — rien d'important n'est
# caché si l'étudiant ne coche que son TP. Seuls TP et LABO restent des
# choix (groupes de TP, créneaux de labo).
TYPES_AUDIENCE = {"CM", "EXAM", "OTHER"}
ERREUR_VIDE = ("Aucun cours pour cette sélection : le code est peut-être inconnu, "
               "ou l'UCLouvain n'a pas encore publié ces horaires.")


def _annee_scolaire(quand=None):
    """« 2026-2027 » : l'année académique en cours (bascule en août)."""
    quand = quand or maintenant()
    annee = quand.year
    return f"{annee}-{annee + 1}" if quand.month >= 8 else f"{annee - 1}-{annee}"


def _annee_precedente(annee):
    debut = int(annee.split("-")[0])
    return f"{debut - 1}-{debut}"


def _couper(brut):
    """Un code de la recherche, normalisé, prêt à réinterroger Mon horaire.

    La recherche renvoie des codes utilisables **tels quels**, y compris
    les sous-sélections (« DROI11BA - Cours obligatoires », 287 séances)
    et les variantes (« SINF11BA - anglais », 125 séances) : replier ces
    entrées sur leur préfixe ferait perdre la sélection (et dédoublonner
    les variantes avec le parent). On ne fait que nettoyer les espaces ;
    l'entrée entière se lit déjà bien dans la liste.
    """
    return " ".join(str(brut or "").split())


def _profs(description):
    """Le premier nom après la ligne d'horaires de la description.

    Format observé chez Mon horaire : code d'activité, horaires, puis
    enseignant(s). Suivent parfois des consignes (« - Etudiants du
    BARB04… », adresse, « Répartition : ») qui ne sont pas des noms, et
    certaines séances n'ont personne : on renvoie alors une chaîne vide.
    """
    lignes = [l.strip() for l in str(description or "").split("\n")]
    for i, ligne in enumerate(lignes):
        if not RX_HORAIRE.search(ligne):
            continue
        for suite in lignes[i + 1:]:
            if not suite:
                continue
            if suite.startswith("-") or RX_NOTE.match(suite):
                break
            return " ".join(suite.split())
        break
    return ""


def _salle(texte):
    """« BARB 12 | BARB 13 » -> « BARB 12, BARB 13 » (écriture des autres écoles)."""
    return ", ".join(p.strip() for p in str(texte or "").split("|") if p.strip())


class ClientUCL:
    """Fournit formations(), recherche() et horaire()."""

    def __init__(self, nom, source, code="ucl"):
        self.nom = nom
        self.source = source
        self.code = code
        self._s = requests.Session()
        self._s.headers.update({"User-Agent": UA, "Accept-Language": "fr-BE,fr;q=0.9",
                                "Accept": "application/json, text/calendar, */*"})
        self._memo_data = {}
        self._verrou = threading.Lock()
        self._verrous = {}
        self._appels = []

    # ---------- transport ----------

    def _appel(self, chemin, params=None, budget=None):
        """GET chez Mon horaire, avec le fuse par instance et un essai de plus."""
        with self._verrou:
            t = time.monotonic()
            while self._appels and t - self._appels[0] > FENETRE_APPELS:
                self._appels.pop(0)
            if len(self._appels) >= APPELS_PAR_MINUTE:
                raise Surcharge("Trop de demandes en peu de temps : réessaie dans une minute.")
            self._appels.append(t)
        url = BASE + chemin
        dernier = None
        for essai in range(2):
            try:
                r = self._s.get(url, params=params,
                                timeout=max(5, min(TIMEOUT_APPEL, budget or TIMEOUT_APPEL)))
                r.raise_for_status()
                return r
            except requests.RequestException as e:
                dernier = e
                if essai == 0:
                    time.sleep(0.6)
        raise RuntimeError(f"Mon horaire ne répond pas correctement ({dernier}).")

    def _json(self, chemin, params=None, budget=None):
        contenu = self._appel(chemin, params=params, budget=budget).content
        try:
            donnees = json.loads(contenu.decode("utf-8"))
        except Exception as e:  # noqa: BLE001 - réponse inattendue
            raise RuntimeError("Mon horaire a renvoyé une réponse illisible.") from e
        return donnees if isinstance(donnees, (dict, list)) else {}

    # ---------- cache ----------

    def _memo(self, cle, duree, calcul):
        vu = self._memo_data.get(cle)
        if vu and time.monotonic() - vu[0] < duree:
            return vu[1]
        with self._verrou:
            verrou = self._verrous.setdefault(cle, threading.Lock())
        with verrou:
            vu = self._memo_data.get(cle)
            if vu and time.monotonic() - vu[0] < duree:
                return vu[1]
            resultat = calcul()
            self._memo_data[cle] = (time.monotonic(), resultat)
            return resultat

    # ---------- listes ----------

    def formations(self):
        """L'UCLouvain n'a pas de liste tenable : l'app fait une recherche."""
        return []

    def recherche(self, texte, genre="niveau", budget=12):
        """Recherche en direct : programmes ou cours, selon `genre`."""
        texte = " ".join(str(texte or "").split())
        if len(texte) < 2:
            return []

        def calcul():
            d = self._json("/calendar/" + quote(texte, safe=""), budget=budget)
            resultats, vus = [], set()
            for brut in d.get("codes") or []:
                code = _couper(brut)
                if not code or code in vus:
                    continue
                # Un cours (UE) est un sigle seul : « CODE - libellé » est
                # un programme ou une sous-sélection, du côté « niveau ».
                if (genre == "ue") != bool(RX_UE.match(code)):
                    continue
                vus.add(code)
                resultats.append({"cle": code, "code": code, "titre": ""})
            return resultats[:60]

        return self._memo(("recherche", genre, texte.lower()), 3600, calcul)

    # ---------- horaire ----------

    @staticmethod
    def _codes(formation):
        """« PAR:A,B » ou « SINF11BA · … » -> liste de codes."""
        cle = str(formation or "").split(" · ")[0].strip().upper()
        if cle.startswith("PAR:"):
            return [c.strip() for c in cle[4:].split(",") if c.strip()]
        return [cle] if cle else []

    def horaire(self, formation, budget=75):
        debut = time.monotonic()
        codes = self._codes(formation)
        if not codes:
            raise ValueError("Aucun code de cours dans cette sélection.")
        annee = _annee_scolaire()

        def calcul():
            evenements = self._evenements(codes, annee, budget)
            if not evenements:
                # En début d'année, la nouvelle année n'est pas encore
                # publiée : on montre la précédente plutôt que rien.
                evenements = self._evenements(codes, _annee_precedente(annee), budget)
            return evenements

        evenements = self._memo(("horaire", tuple(codes), annee), 900, calcul)
        if not evenements:
            raise ValueError(ERREUR_VIDE)

        parse = []
        for e in evenements:
            try:
                d0 = datetime.fromisoformat(str(e.get("start")))
                d1 = datetime.fromisoformat(str(e.get("end")))
            except ValueError:
                continue
            parse.append((e, d0, d1))
        if not parse:
            raise ValueError(ERREUR_VIDE)
        lundi0 = min(d0.date() for _, d0, _ in parse)
        lundi0 -= timedelta(days=lundi0.weekday())

        cours, semaines = {}, set()
        for e, d0, d1 in parse:
            sem = (d0.date() - lundi0).days // 7 + 1
            if sem < 1:
                continue
            debut_h = d0.strftime("%Hh%M")
            fin_h = d1.strftime("%Hh%M") if d1.date() == d0.date() else "24h00"
            titre = " ".join(str(e.get("title") or e.get("code") or "").split())
            if not titre:
                continue
            type_cours = ""
            m = RX_TYPE.match(titre)
            if m:
                type_cours = m.group(1)
            profs = _profs(e.get("description"))
            salles = _salle(e.get("location"))
            activite = " ".join(str(e.get("event_code") or "").split())
            groupes = ([activite] if activite and activite != titre
                       and type_cours not in TYPES_AUDIENCE else [])
            cle = (d0.weekday(), debut_h, fin_h, titre, profs, salles, type_cours,
                   tuple(groupes))
            ligne = cours.get(cle)
            if ligne is None:
                cours[cle] = {"jour": cle[0], "debut": cle[1], "fin": cle[2],
                              "matiere": titre, "profs": profs, "salles": salles,
                              "type": type_cours, "couleur": "#888888",
                              "groupes": list(groupes), "semaines": [sem]}
            elif sem not in ligne["semaines"]:
                ligne["semaines"].append(sem)
            semaines.add(sem)

        if not semaines:
            raise ValueError(ERREUR_VIDE)
        liste = sorted(cours.values(), key=lambda c: (min(c["semaines"]), c["jour"], c["debut"]))
        for c in liste:
            c["semaines"].sort()
        maj = maintenant()
        journal(self.code, "horaire", _Appels(self), debut,
                formation=formation[:60], cours=len(liste), semaines=max(semaines))
        return {
            "meta": {
                "fetched_at": maj.strftime("%d/%m/%Y à %Hh%M"),
                "ts": int(maj.timestamp() * 1000),
                "premier_lundi": lundi0.isoformat(),
                "periode": format_ensemble(list(range(1, max(semaines) + 1))),
                "feries": format_ensemble([]),
                "source": self.source,
            },
            "formation": formation,
            "groupes": sorted({g for c in liste for g in c["groupes"]}, key=tri_naturel),
            "cours": liste,
        }

    def _evenements(self, codes, annee, budget):
        """Toutes les séances des codes, en un appel (code répété)."""
        params = [("year", annee)] + [("code", c) for c in codes]
        d = self._json("/api/events", params=params, budget=budget)
        return d.get("events") or []

    def pdf_semaine(self, formation, groupe, semaine, budget=40):
        """L'UCLouvain ne publie pas de PDF : l'app n'affiche pas le bouton."""
        raise ValueError("Pas de PDF officiel pour l'UCLouvain : utilise l'horaire affiché "
                         "ou le lien d'abonnement iCal.")


class _Appels:
    """Faux compteur d'appels, pour réutiliser journal() de hyperplanning.py."""

    def __init__(self, client):
        self.client = client

    def total_appels(self):
        return len(self.client._appels)

    reconnexions = 0


NOM = "UCLouvain — Université catholique de Louvain"
NOM_COURT = "l'UCLouvain"  # dans les phrases (import, messages)
SOURCE = "monhoraire.uclouvain.be (horaire public)"

CLIENT = ClientUCL(nom=NOM, source=SOURCE)

formations = CLIENT.formations
recherche = CLIENT.recherche
horaire = CLIENT.horaire
pdf_semaine = CLIENT.pdf_semaine
