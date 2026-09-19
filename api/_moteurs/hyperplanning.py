"""Moteur commun pour les écoles utilisant Pronote Campus / Hyperplanning (espace invités).

Utilisé par _ecoles/heh.py, _ecoles/umons.py et _ecoles/condorcet.py.
"""
import base64
import collections
import hashlib
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import requests
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
ONGLET = "DIPLOME.EDT.EDT_GRILLE"

TIMEOUT_APPEL = 15    # s par requête (un appel normal prend ~50 ms)
RECONNEXIONS = 4      # sessions neuves maximum après un raté
SESSIONS_PAR_MINUTE = 120  # fuse anti-abus : sessions école / min et par instance
FENETRE_SESSIONS = 60.0    # s
SESSIONS_PARALLELES = 3    # sessions école qui lisent les semaines en même temps


class Surcharge(RuntimeError):
    """Trop de sessions école demandées en peu de temps (fuse anti-abus)."""


def _cherche(obj, cle):
    """Première valeur de `cle` trouvée n'importe où dans un JSON imbriqué."""
    if isinstance(obj, dict):
        if cle in obj:
            return obj[cle]
        obj = list(obj.values())
    if isinstance(obj, list):
        for v in obj:
            trouve = _cherche(v, cle)
            if trouve is not None:
                return trouve
    return None


def _items(brut, genre):
    """Éléments d'un genre donné dans listeC (1 profs, 3 salles, 14 groupes...)."""
    out = []
    for cont in brut.get("listeC", []):
        if cont.get("G") == genre:
            c = cont.get("C")
            out.extend(i for i in (c if isinstance(c, list) else [c]) if isinstance(i, dict))
    return out


def parse_ensemble(txt):
    """'[1..6,12]' -> [1,2,3,4,5,6,12]"""
    out = []
    for part in str(txt).strip().strip("[]").split(","):
        part = part.strip()
        if ".." in part:
            a, b = part.split("..")
            out.extend(range(int(a), int(b) + 1))
        elif part:
            out.append(int(part))
    return out


def format_ensemble(nombres):
    """[1,2,3,5] -> '[1..3,5]'"""
    nombres = sorted(set(nombres))
    parts, i = [], 0
    while i < len(nombres):
        j = i
        while j + 1 < len(nombres) and nombres[j + 1] == nombres[j] + 1:
            j += 1
        parts.append(str(nombres[i]) if i == j else f"{nombres[i]}..{nombres[j]}")
        i = j + 1
    return "[" + ",".join(parts) + "]"


def _libelle(valeur):
    """Intitulé nettoyé, ou '' si l'école n'a mis qu'un bouche-trou ('_')."""
    texte = " ".join(str(valeur or "").split())
    return "" if not texte.strip("_") else texte


def decode_cours(brut, heures, places_par_jour=48):
    """Cours brut -> dict simple {jour, debut, fin, matiere, profs, salles, ...}."""
    # L'école renvoie parfois une heure fantôme de fin (ex. UMONS : 69
    # entrées pour 68 créneaux, la dernière à '01h00' sans fin) : on borne
    # aux vrais créneaux du jour, pas à la longueur de la liste.
    cran_max = min(len(heures), places_par_jour) - 1
    jour, slot = divmod(brut["p"], places_par_jour)
    fin_slot = min(slot + brut["d"] - 1, cran_max)
    slot = min(slot, cran_max)
    fin = heures[fin_slot]["Fin"] or heures[fin_slot]["Debut"]
    # L'UMONS laisse des séances 'événement' sans intitulé ('_') et met le
    # vrai libellé dans le commentaire (genre 5) : on s'en sert en repli.
    matiere = next((v for v in (_libelle(i.get("L")) for i in _items(brut, 0)) if v), "")
    if not matiere:
        matiere = next((v for v in (_libelle(i.get("L") or i.get("str"))
                                    for i in _items(brut, 5)) if v), "")
    typ = next((i.get("L", "") for i in _items(brut, 7)), "")
    return {
        "jour": jour,
        "debut": heures[slot]["Debut"],
        "fin": fin,
        "_slot": slot,
        "matiere": matiere,
        "profs": ", ".join(i.get("L", "") for i in _items(brut, 1)),
        "salles": ", ".join(i.get("L", "") for i in _items(brut, 3)),
        "type": typ,
        "couleur": brut.get("co", "#888888"),
    }


def tri_naturel(texte):
    """'Groupe 10' après 'Groupe 2'."""
    texte = " ".join(texte.split())  # l'école double parfois les espaces
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", texte)]


def court_groupe(nom):
    """Nom de groupe affichable : l'UMONS préfixe chaque groupe par sa
    formation ('<.BAB1 - Droit>Dr. rom - Gr 1'), la HEH non. On retire ce
    préfixe pour l'affichage et la sélection ; le nom complet reste la clé
    côté école (voir HP.groupe)."""
    return " ".join(re.sub(r"^\s*<[^>]*>\s*", "", str(nom or "")).split())


def courts_uniques(pleins):
    """{nom court: nom complet} pour les courts NON ambigus.

    Si deux groupes distincts de la même formation produisent le même nom
    court (préfixes différents), on ne devine pas : ils gardent leur nom
    complet, sinon on pourrait servir le PDF du mauvais groupe."""
    par_court = {}
    for plein in pleins:
        par_court.setdefault(court_groupe(plein), []).append(plein)
    return {court: noms[0] for court, noms in par_court.items()
            if len(noms) == 1 and court}


def nom_groupe(plein, uniques):
    """Nom affichable d'un groupe : court s'il est unique, sinon complet."""
    court = court_groupe(plein)
    return court if uniques.get(court) == plein else plein


def _propre(valeur):
    """Rend une valeur sûre à écrire dans le journal."""
    if isinstance(valeur, int):
        return str(valeur)
    texte = "".join(c for c in str(valeur) if c.isprintable() and c != '"')
    return f'"{texte[:80]}"'


def journal(code, quoi, ec, debut, **details):
    """Une ligne par récupération réelle chez l'école (visible chez l'hébergeur).

    `ec` : une Ecole, ou la liste des Ecole d'une lecture parallèle."""
    ecs = ec if isinstance(ec, list) else [ec]
    champs = " ".join(f"{k}={_propre(v)}" for k, v in details.items())
    print(f'ezh [{code}] {quoi} {champs} appels={sum(e.total_appels() for e in ecs)} '
          f'reconnexions={sum(e.reconnexions for e in ecs)} '
          f'duree={time.monotonic() - debut:.1f}s', flush=True)


def maintenant():
    """Heure de Bruxelles, même sur un serveur en UTC."""
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("Europe/Brussels"))
    except Exception:  # noqa: BLE001 - repli sans base de fuseaux (tzdata)
        utc = datetime.now(timezone.utc)
        ete = 3 < utc.month < 11  # approximation : heure d'été d'avril à octobre
        return utc + timedelta(hours=2 if ete else 1)


class HP:
    """Mini-client pour l'API 'appelfonction' de l'espace invités."""

    def __init__(self, base, timeout, default_premier_lundi="2026-09-14", default_places_par_jour=48):
        self.base = base.rstrip("/")
        self.timeout = timeout
        self.default_premier_lundi = default_premier_lundi
        self.default_places_par_jour = default_places_par_jour
        self.appels = 1  # le GET ci-dessous ; chaque call() ajoute le sien
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": UA, "Content-Type": "application/json",
                               "Referer": self.base + "/invite?fd=1", "Origin": self.base})
        r = self.s.get(self.base + "/invite?fd=1", timeout=timeout)
        m = re.search(r'Start \(\{"a":(\d+),\"b\":(\d+),\"c\":\"([^\"]+)\",\"i\":(\d+)\}', r.text)
        if not m:
            raise RuntimeError("page d'accueil inattendue (Start introuvable)")
        self.genre, self.sess = int(m.group(1)), int(m.group(4))
        self.key = b""
        self.iv = os.urandom(16)
        uuid = base64.b64encode(self.iv).decode()
        self.params = self.call("FonctionParametres",
                                {"data": {"ModeJeton": False, "Uuid": uuid, "identifiantNav": ""}},
                                ordre=1, raw_iv=True)
        self.ordre = 3
        self.dpu = self.call("DemandeParametreUtilisateur", {"data": {}})
        self._formations = None
        self._infos = {}

    def enc(self, num, raw_iv=False):
        iv = b"" if raw_iv else self.iv
        k = hashlib.md5(self.key).digest()
        v = hashlib.md5(iv).digest() if len(iv) > 0 else bytes(16)
        return AES.new(k, AES.MODE_CBC, v).encrypt(pad(str(num).encode(), 16)).hex()

    def call(self, fid, datasec, ordre=None, raw_iv=False):
        no = self.enc(self.ordre if ordre is None else ordre, raw_iv)
        url = f"{self.base}/appelfonction/{self.genre}/{self.sess}/{no}"
        body = {"session": self.sess, "no": no, "id": fid, "dataSec": datasec}
        self.appels += 1
        r = self.s.post(url, json=body, timeout=self.timeout)
        r.raise_for_status()
        try:
            j = r.json()
        except ValueError:
            raise RuntimeError(f"{fid} : réponse vide") from None
        if "dataSec" not in j:
            raise RuntimeError(f"{fid} : réponse inattendue {str(j)[:150]}")
        sig = (j.get("dataSec") or {}).get("Signature") or {}
        if sig.get("Erreur"):
            raise RuntimeError(f"{fid} : {sig.get('MessageErreur')}")
        if ordre is None:
            self.ordre += 2
        return j

    # --- Données de base ---

    def heures(self):
        """Créneaux du jour. L'UMONS en publie jusqu'à 01h00 : passé minuit,
        les heures continuent ('00h15' -> '24h15'), sinon une séance du
        soir finirait avant d'avoir commencé."""
        liste = self.dpu["dataSec"]["data"]["Horaire"]["ListeHeures"]
        out, jour, prec = [], 0, -1
        for h in liste:
            if not h.get("Debut"):
                continue
            creneau = {}
            for k in ("Debut", "Fin"):
                v = h.get(k, "")
                m = re.fullmatch(r"(\d\d)h(\d\d)", v)
                if m:
                    t = int(m.group(1)) * 60 + int(m.group(2)) + jour
                    if t < prec:  # minuit franchi
                        jour += 24 * 60
                        t += 24 * 60
                    prec = t
                    v = f"{t // 60:02d}h{t % 60:02d}"
                creneau[k] = v
            out.append(creneau)
        return out

    def places_par_jour(self):
        v = _cherche(self.params, "PlacesParJour")
        try:
            return int(v) if v else self.default_places_par_jour
        except (ValueError, TypeError):
            return self.default_places_par_jour

    def premier_lundi(self):
        """'14/09/2026' (paramètres de l'école) -> '2026-09-14'."""
        v = _cherche(self.params, "PremierLundi")
        m = re.fullmatch(r"(\d\d)/(\d\d)/(\d{4})", str((v or {}).get("V", "")))
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else self.default_premier_lundi

    def feries(self):
        v = _cherche(self.params, "JoursFeries")
        try:
            return format_ensemble(parse_ensemble((v or {}).get("V", "")))
        except ValueError:
            return "[]"

    def formations(self):
        if self._formations is None:
            r = self.call("FonctionRenvoyerListeDeRessource",
                          {"Signature": {"Onglet": ONGLET},
                           "data": {"GenreRessource": 1, "GenreRecherche": 1,
                                    "AvecPublicationForcee": False, "NomRessource": "*",
                                    "PourEmail": False, "PourRessource": False,
                                    "filtresRessource": []}})
            self._formations = r["dataSec"]["data"]["ListeRessources"]["Liste"]
        return self._formations

    def formation(self, nom):
        """{'ressource': ..., 'periode': '[1..14]', 'semaines': [1, 2, ...]}."""
        if nom not in self._infos:
            form = next((f for f in self.formations() if f["L"] == nom), None)
            if form is None:
                raise ValueError(f"formation introuvable chez l'école : {nom}")
            periode = self.domaine(form)["PeriodeConsultation"]["V"]  # ex. "[1..14]"
            self._infos[nom] = {"ressource": form, "periode": periode,
                                "semaines": parse_ensemble(periode)}
        return self._infos[nom]

    def groupe(self, formation, nom):
        """Ressource d'un groupe (pour son PDF officiel).

        `nom` peut être le nom complet de l'école ('<.BAB1 - Droit>Dr. rom
        - Gr 1') ou le nom court affiché par l'app ('Dr. rom - Gr 1') s'il
        est unique dans la formation. Un nom court ambigu (deux groupes
        distincts qui s'affichent pareil) doit être donné en entier."""
        info = self.formation(formation)
        if "groupes" not in info:
            groupes = {}
            for c in self.edt(info["ressource"], info["periode"], filtre="[0,6..7]")["ListeCours"]:
                for it in _items(c, 14):
                    if it.get("L"):
                        groupes[it["L"]] = {"L": it["L"], "N": it["N"], "G": 4}
            info["groupes"] = groupes
            info["uniques"] = courts_uniques(groupes)
        if nom in info["groupes"]:
            return info["groupes"][nom]
        court = court_groupe(nom)
        if court in info["uniques"]:
            return info["groupes"][info["uniques"][court]]
        if any(court_groupe(plein) == court for plein in info["groupes"]):
            raise ValueError(f"nom de groupe ambigu, utilise le nom complet : {nom}")
        raise ValueError(f"groupe introuvable : {nom}")

    def domaine(self, ress, filtre="[0,6..7]"):
        sig = {"Onglet": ONGLET, "listeRecherche": [ress]}
        r = self.call("FonctionDomaineDePresence",
                      {"Signature": sig,
                       "data": {"FiltreRessources": {"_T": 26, "V": filtre},
                                "AvecCalendrier": False}})
        return r["dataSec"]["data"]

    def edt(self, ress, domaine, filtre="[0,2,6..8]"):
        sig = {"Onglet": ONGLET, "listeRecherche": [ress]}
        data = {"GenrePeriodeEDT": 2, "GenreAffichageEDT": 0,
                "FiltreRessources": {"_T": 26, "V": filtre},
                "AvecIndisponibilites": True, "AvecDomaineCours": True,
                "AvecDomainePere": False, "filterPlagesHoraires": False,
                "ignorerCoursAnnules": False, "avecInfosAppel": False,
                "Domaine": {"_T": 8, "V": domaine}}
        r = self.call("FonctionEmploiDuTemps", {"Signature": sig, "data": data})
        return r["dataSec"]["data"]

    def pdf(self, ress, semaine, periode):
        self.edt(ress, f"[{semaine}]")
        data = {"options": {"portrait": False, "taillePolice": 8, "taillePoliceMin": 3,
                            "couleur": 1, "renvoi": 0, "uneGrilleParSemaine": False,
                            "ignorerLesPlagesSansCours": False},
                "genreGenerationPDF": 0, "genreAffichageEDT": 0,
                "estPlanningOngletParJour": False,
                "filtre": {"_T": 26, "V": "[0,2,6..8]"},
                "domaine": {"_T": 8, "V": f"[{semaine}]"},
                "domaineConsultation": {"_T": 8, "V": periode},
                "verifierPublicationMatiere": True, "afficherSemaineVide": False,
                "seulementHorairesUtiles": False}
        r = self.call("GenerationPDF", {"Signature": {"Onglet": ONGLET, "listeRecherche": [ress]},
                                        "data": data})
        url = r["dataSec"]["data"]["url"]["V"]
        self.appels += 1
        f = self.s.get(f"{self.base}/{url}", timeout=self.timeout)
        f.raise_for_status()
        if not f.content.startswith(b"%PDF"):
            raise RuntimeError("GenerationPDF : l'école n'a pas renvoyé de PDF")
        return f.content


class Ecole:
    """Enchaîne les appels et repart sur une session neuve après un raté."""

    def __init__(self, hp_factory, fin):
        self.hp_factory = hp_factory
        self.fin = fin
        self.hp = None
        self.reconnexions = 0
        self.appels = 0

    def reste(self):
        return self.fin - time.monotonic()

    def total_appels(self):
        return self.appels + (self.hp.appels if self.hp else 0)

    def faire(self, action):
        while True:
            try:
                if self.hp is None:
                    self.hp = self.hp_factory(timeout=max(3, min(TIMEOUT_APPEL, self.reste())))
                return action(self.hp)
            except (ValueError, Surcharge):
                raise
            except Exception as e:  # noqa: BLE001
                if self.hp is not None:
                    self.appels += self.hp.appels
                self.hp = None
                self.reconnexions += 1
                attente = min(2 * self.reconnexions, 6)
                if self.reconnexions > RECONNEXIONS or self.reste() < attente + 3:
                    raise RuntimeError(f"L'école ne répond pas correctement ({e}).") from e
                print(f"  ! {e} -> nouvelle session dans {attente} s")
                time.sleep(attente)


class ClientHyperplanning:
    """Fournit les méthodes formations(), horaire(), pdf_semaine() pour une école."""

    def __init__(self, base, nom, source, premier_lundi_defaut="2026-09-14",
                 places_par_jour_defaut=48, code="ecole"):
        self.base = base.rstrip("/")
        self.nom = nom
        self.source = source
        self.premier_lundi_defaut = premier_lundi_defaut
        self.places_par_jour_defaut = places_par_jour_defaut
        self.code = code
        self._memo_data = {}
        self._sessions = collections.deque()  # horodatages des sessions ouvertes
        self._verrou = threading.Lock()        # sessions ouvertes depuis plusieurs fils
        self._verrous = {}                     # un verrou par clé de _memo

    def _hp_factory(self, timeout):
        # Fuse anti-abus : borne le nombre de sessions école ouvertes par
        # minute et par instance. L'usage normal est bien en dessous (le
        # cache partagé absorbe les étudiants d'une même formation).
        with self._verrou:
            maintenant = time.monotonic()
            while self._sessions and maintenant - self._sessions[0] > FENETRE_SESSIONS:
                self._sessions.popleft()
            if len(self._sessions) >= SESSIONS_PAR_MINUTE:
                raise Surcharge("Trop de demandes en peu de temps : réessaie dans une minute.")
            self._sessions.append(maintenant)
        return HP(self.base, timeout, self.premier_lundi_defaut, self.places_par_jour_defaut)

    def _memo(self, cle, duree, calcul):
        vu = self._memo_data.get(cle)
        if vu and time.monotonic() - vu[0] < duree:
            return vu[1]
        # Une seule récupération à la fois par clé : deux étudiants qui
        # ouvrent la même formation en même temps n'appellent l'école qu'une fois.
        with self._verrou:
            verrou = self._verrous.setdefault(cle, threading.Lock())
        with verrou:
            vu = self._memo_data.get(cle)
            if vu and time.monotonic() - vu[0] < duree:
                return vu[1]
            resultat = calcul()
            self._memo_data[cle] = (time.monotonic(), resultat)
            return resultat

    def _info_memo(self, formation, duree=3600):
        """Infos de formation ('semaines', 'groupes'...) gardées 1 h.

        Sans échéance, une instance qui vit longtemps refuserait à jamais
        les semaines publiées après coup (PDF notamment)."""
        vu = self._memo_data.get(("info", formation))
        if vu and time.monotonic() - vu[0] < duree:
            return vu[1]
        return None

    def _formation_connue(self, nom):
        vu = self._memo_data.get(("formations",))
        if not vu or time.monotonic() - vu[0] >= 3600:
            return None  # liste absente ou périmée (formation ajoutée depuis ?)
        try:
            return nom in vu[1]
        except Exception:  # noqa: BLE001
            return None

    def _verifier_formation(self, nom):
        """Refuse un nom inconnu avant d'ouvrir une session école.

        La liste des formations (gardée 1 h) est chargée au besoin : sans
        elle, chaque nom inventé coûterait une session complète. Si l'école
        ne livre pas la liste, on laisse la récupération trancher."""
        connue = self._formation_connue(nom)
        if connue is None:
            try:
                self.formations(budget=15)
            except Exception:  # noqa: BLE001 - école en panne, fuse...
                return
            connue = self._formation_connue(nom)
        if connue is False:
            raise ValueError(f"formation introuvable chez l'école : {nom}")

    def _verifier_groupe(self, formation, groupe):
        """Refuse tout de suite un groupe inconnu, sans appeler l'école.

        L'app envoie le nom court ('Dr. rom - Gr 1'), l'école connaît le
        nom complet ('<.BAB1 - Droit>Dr. rom - Gr 1') : on compare décapé.
        Sans liste mémorisée (instance froide), on laisse passer : HP.groupe
        vérifiera après un seul balayage, pas un horaire complet."""
        if not groupe:
            return
        noms = None
        vu = self._memo_data.get(("horaire", formation))
        if vu and time.monotonic() - vu[0] < 900:
            noms = list(vu[1].get("groupes") or [])
        else:
            vg = self._memo_data.get(("groupes", formation))
            if vg and time.monotonic() - vg[0] < 3600:
                noms = list(vg[1])
        if noms is None:
            return
        court = court_groupe(groupe)
        if all(g != groupe and court_groupe(g) != court for g in noms):
            raise ValueError(f"groupe introuvable : {groupe}")

    def formations(self, budget=20):
        def calcul():
            ecole = Ecole(self._hp_factory, time.monotonic() + budget)
            return [f["L"] for f in ecole.faire(lambda hp: hp.formations())]
        return self._memo(("formations",), 3600, calcul)

    def horaire(self, formation, budget=75):
        # Vérifié avant _memo : un nom inventé ne crée ni verrou ni entrée.
        self._verifier_formation(formation)

        def calcul():
            debut = time.monotonic()
            ecoles = [Ecole(self._hp_factory, time.monotonic() + budget)]
            try:
                return self._recuperer(ecoles, formation)
            finally:
                journal(self.code, "horaire", ecoles, debut,
                        formation=formation)

        return self._memo(("horaire", formation), 900, calcul)

    def _recuperer(self, ecoles, formation):
        """`ecoles` : [Ecole principale] ; les sessions parallèles s'y ajoutent
        (pour le journal)."""
        ecole = ecoles[0]
        info = ecole.faire(lambda hp: hp.formation(formation))
        heures = ecole.faire(lambda hp: hp.heures())
        ppj = ecole.faire(lambda hp: hp.places_par_jour())
        # Les semaines sont lues d'abord, toutes ensemble : les noms de
        # groupes doivent être connus en entier avant de choisir leur forme
        # affichable (un nom court ambigu garde son nom complet partout).
        # Une requête par semaine : sur une école lente (UMONS, ~40 semaines)
        # quelques sessions en parallèle divisent l'attente d'autant.
        semaines = list(info["semaines"])
        n = max(1, min(SESSIONS_PARALLELES, len(semaines)))
        bruts = {}

        def lire(ec, lot):
            for w in lot:
                def semaine(hp, w=w):
                    return hp.edt(hp.formation(formation)["ressource"], f"[{w}]")["ListeCours"]
                bruts[w] = ec.faire(semaine)

        if n == 1:
            lire(ecole, semaines)
        else:
            ecoles.extend(Ecole(self._hp_factory, ecole.fin) for _ in range(n - 1))
            with ThreadPoolExecutor(max_workers=n) as pool:
                taches = [pool.submit(lire, ec, semaines[i::n]) for i, ec in enumerate(ecoles[:n])]
                for t in taches:
                    t.result()
        pleins = {i["L"] for liste in bruts.values() for brut in liste
                  for i in _items(brut, 14) if i.get("L")}
        uniques = courts_uniques(pleins)
        regroupes, tous = {}, set()
        for w in semaines:
            for brut in bruts[w]:
                c = decode_cours(brut, heures, places_par_jour=ppj)
                # Noms courts : '<.BAB1 - Droit>Dr. rom - Gr 1' -> 'Dr. rom - Gr 1'.
                c["groupes"] = sorted({nom_groupe(i["L"], uniques)
                                       for i in _items(brut, 14) if i.get("L")},
                                      key=tri_naturel)
                tous.update(c["groupes"])
                cle = tuple(c[k] for k in ("jour", "debut", "fin", "matiere", "profs",
                                          "salles", "type", "couleur")) + tuple(c["groupes"])
                regroupes.setdefault(cle, dict(c, semaines=[]))["semaines"].append(w)
        cours = sorted(regroupes.values(),
                       key=lambda c: (min(c["semaines"]), c["jour"], c["_slot"]))
        # Un cours tagué avec TOUS les groupes (ex. amphi listant chaque
        # demi-groupe) concerne toute la formation : on le marque commun.
        # Sans ça, un libellé ajouté/retiré par l'école le ferait disparaître
        # des sélections, et le détail afficherait une liste interminable.
        if len(tous) > 1:
            fusion = cours
            for c in fusion:
                if set(c["groupes"]) == tous:
                    c["groupes"] = []
            reunit = {}
            for c in fusion:
                cle = (c["jour"], c["debut"], c["fin"], c["matiere"], c["profs"],
                       c["salles"], c["type"], c["couleur"], tuple(c["groupes"]))
                if cle in reunit:
                    reunit[cle]["semaines"] = sorted(set(reunit[cle]["semaines"]) | set(c["semaines"]))
                else:
                    reunit[cle] = c
            cours = sorted(reunit.values(),
                           key=lambda c: (min(c["semaines"]), c["jour"], c["_slot"]))
        for c in cours:
            del c["_slot"]
        groupes = sorted(tous, key=tri_naturel)
        self._memo_data[("groupes", formation)] = (time.monotonic(), set(groupes))
        maj = maintenant()
        return {
            "meta": {
                "fetched_at": maj.strftime("%d/%m/%Y à %Hh%M"),
                "ts": int(maj.timestamp() * 1000),
                "premier_lundi": ecole.faire(lambda hp: hp.premier_lundi()),
                "periode": format_ensemble(info["semaines"]),
                "feries": ecole.faire(lambda hp: hp.feries()),
                "source": self.source,
            },
            "formation": formation,
            "groupes": groupes,
            "cours": cours,
        }

    def pdf_semaine(self, formation, groupe, semaine, budget=40):
        self._verifier_formation(formation)
        self._verifier_groupe(formation, groupe)
        vu = self._info_memo(formation)
        if vu and semaine not in (vu.get("semaines") or []):
            raise ValueError(f"semaine {semaine} non publiée par l'école")

        debut = time.monotonic()
        ecole = Ecole(self._hp_factory, time.monotonic() + budget)

        def action(hp):
            info = hp.formation(formation)
            self._memo_data[("info", formation)] = (time.monotonic(), info)
            if semaine not in (info.get("semaines") or []):
                raise ValueError(f"semaine {semaine} non publiée par l'école")
            try:
                ress = hp.groupe(formation, groupe) if groupe else info["ressource"]
            finally:
                # Le balayage a listé les groupes : les appels suivants
                # (valides ou non) sont vérifiés sans rappeler l'école.
                if "groupes" in info:
                    self._memo_data[("groupes", formation)] = (time.monotonic(), set(info["groupes"]))
            return hp.pdf(ress, semaine, format_ensemble(info["semaines"]))
        try:
            return ecole.faire(action)
        finally:
            journal(self.code, "pdf", ecole, debut, formation=formation,
                    groupe=groupe, semaine=semaine)
