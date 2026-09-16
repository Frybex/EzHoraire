"""Récupère les horaires HEH Planning (Pronote Campus, espace invités).

Utilisé par les points d'entrée de api/ (formations, horaires, pdf) et
par serve.py sur l'ordinateur.

Méthode : l'emploi du temps de la FORMATION est demandé semaine par
semaine. L'école renvoie alors uniquement les vraies séances de la semaine,
avec leur salle exacte et les groupes concernés. Chaque étudiant filtre
ensuite selon ses groupes : une seule récupération par formation, partagée
par tous ses étudiants (~15 appels, ~2 secondes).

Vérifié : filtrer la formation par groupe donne exactement les mêmes
séances que demander l'emploi du temps du groupe à l'école.

Les semaines publiées (PeriodeConsultation) et le premier lundi de l'année
sont lus chez l'école : quand de nouvelles semaines se débloquent, elles
apparaissent sans rien modifier ici.
"""
import base64
import hashlib
import os
import re
import time
from datetime import datetime, timedelta, timezone

import requests
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad

BASE = "https://hehplanning2026.umons.ac.be"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
ONGLET = "DIPLOME.EDT.EDT_GRILLE"
NOM = "HEH — Haute École en Hainaut"
SOURCE = "hehplanning2026.umons.ac.be (espace invités)"

PLACES_PAR_JOUR = 48  # 48 créneaux de 15 min par jour (08h00 -> 21h00)
PREMIER_LUNDI_DEFAUT = "2026-09-14"  # repli si l'école ne le donne pas

TIMEOUT_APPEL = 15    # s par requête (un appel normal prend ~50 ms)
RECONNEXIONS = 4      # sessions neuves maximum après un raté


class HP:
    """Mini-client pour l'API 'appelfonction' de l'espace invités.

    Une instance = une session. Chaque requête porte un numéro d'ordre que
    le serveur suit : après un raté, on ne sait plus où il en est, donc on
    ne réessaie jamais dans la même session (voir Ecole).
    """

    def __init__(self, timeout):
        self.timeout = timeout
        self.appels = 1  # le GET ci-dessous ; chaque call() ajoute le sien
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": UA, "Content-Type": "application/json",
                               "Referer": BASE + "/invite?fd=1", "Origin": BASE})
        r = self.s.get(BASE + "/invite?fd=1", timeout=timeout)
        m = re.search(r'Start \(\{"a":(\d+),"b":(\d+),"c":"([^"]+)","i":(\d+)\}', r.text)
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
        url = f"{BASE}/appelfonction/{self.genre}/{self.sess}/{no}"
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

    # --- Données de base (mises en cache pour la durée de la session) ---

    def heures(self):
        liste = self.dpu["dataSec"]["data"]["Horaire"]["ListeHeures"]
        return [{"Debut": h.get("Debut", ""), "Fin": h.get("Fin", "")}
                for h in liste if h.get("Debut")]

    def premier_lundi(self):
        """'14/09/2026' (paramètres de l'école) -> '2026-09-14'."""
        v = _cherche(self.params, "PremierLundi")
        m = re.fullmatch(r"(\d\d)/(\d\d)/(\d{4})", str((v or {}).get("V", "")))
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else PREMIER_LUNDI_DEFAUT

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
        """{"ressource": ..., "periode": "[1..14]", "semaines": [1, 2, ...]}."""
        if nom not in self._infos:
            form = next((f for f in self.formations() if f["L"] == nom), None)
            if form is None:
                raise ValueError(f"formation introuvable chez l'école : {nom}")
            periode = self.domaine(form)["PeriodeConsultation"]["V"]  # ex. "[1..14]"
            self._infos[nom] = {"ressource": form, "periode": periode,
                                "semaines": parse_ensemble(periode)}
        return self._infos[nom]

    def groupe(self, formation, nom):
        """Ressource d'un groupe (pour son PDF officiel)."""
        info = self.formation(formation)
        if "groupes" not in info:
            # Les groupes n'existent qu'à travers l'emploi du temps de la formation
            groupes = {}
            for c in self.edt(info["ressource"], info["periode"], filtre="[0,6..7]")["ListeCours"]:
                for it in _items(c, 14):
                    groupes[it["L"]] = {"L": it["L"], "N": it["N"], "G": 4}
            info["groupes"] = groupes
        if nom not in info["groupes"]:
            raise ValueError(f"groupe introuvable : {nom}")
        return info["groupes"][nom]

    # --- Appels bruts ---

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
        """PDF officiel d'une semaine (bouton « Générer un PDF » du site).

        Le pare-feu de l'UMONS bloque la requête si elle ne ressemble pas à
        celle du navigateur : on envoie donc exactement les mêmes paramètres,
        après avoir affiché la grille de la semaine comme le ferait le site.
        Seule différence : seulementHorairesUtiles=False, pour garder tous les
        jours (même sans cours) et la journée complète : un jour libre reste
        visible au lieu de disparaître comme s'il avait bugué.
        """
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
        url = r["dataSec"]["data"]["url"]["V"]  # "UrlUnique/Emploi du temps ... .pdf?S=..&ID=.."
        self.appels += 1
        f = self.s.get(f"{BASE}/{url}", timeout=self.timeout)
        f.raise_for_status()
        if not f.content.startswith(b"%PDF"):
            raise RuntimeError("GenerationPDF : l'école n'a pas renvoyé de PDF")
        return f.content


class Ecole:
    """Enchaîne les appels et repart sur une session neuve après un raté.

    `fin` : échéance (time.monotonic()) au-delà de laquelle on abandonne
    proprement, avant que l'hébergeur ne coupe la fonction.
    """

    def __init__(self, fin):
        self.fin = fin
        self.hp = None
        self.reconnexions = 0
        self.appels = 0  # requêtes des sessions déjà abandonnées

    def reste(self):
        return self.fin - time.monotonic()

    def total_appels(self):
        """Requêtes envoyées à l'école depuis le début (pour le journal)."""
        return self.appels + (self.hp.appels if self.hp else 0)

    def faire(self, action):
        while True:
            try:
                if self.hp is None:
                    self.hp = HP(timeout=max(3, min(TIMEOUT_APPEL, self.reste())))
                return action(self.hp)
            except ValueError:
                raise  # formation / groupe introuvable : réessayer n'y changera rien
            except Exception as e:  # noqa: BLE001 - réseau, réponse vide, session perdue
                if self.hp is not None:
                    self.appels += self.hp.appels
                self.hp = None
                self.reconnexions += 1
                attente = min(2 * self.reconnexions, 6)
                if self.reconnexions > RECONNEXIONS or self.reste() < attente + 3:
                    raise RuntimeError(f"L'école ne répond pas correctement ({e}).") from e
                print(f"  ! {e} -> nouvelle session dans {attente} s")
                time.sleep(attente)


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


def decode_cours(brut, heures):
    """Cours brut -> dict simple {jour, debut, fin, matiere, profs, salles, ...}."""
    jour, slot = divmod(brut["p"], PLACES_PAR_JOUR)
    fin_slot = min(slot + brut["d"] - 1, len(heures) - 1)
    matiere = next((i.get("L", "") for i in _items(brut, 0)), "")
    typ = next((i.get("L", "") for i in _items(brut, 7)), "")
    return {
        "jour": jour,
        "debut": heures[slot]["Debut"],
        "fin": heures[fin_slot]["Fin"],
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


def _propre(valeur):
    """Rend une valeur sûre à écrire dans le journal.

    Le nom de formation vient de l'adresse demandée et n'est pas vérifié
    avant d'être journalisé (journal() tourne dans un finally, donc même
    pour une formation inexistante). Sans ce filtrage, un saut de ligne
    dans le paramètre permettrait de fabriquer de fausses lignes « ezh »
    et de fausser le comptage qu'on veut justement mesurer.
    """
    if isinstance(valeur, int):
        return str(valeur)
    texte = "".join(c for c in str(valeur) if c.isprintable() and c != '"')
    return f'"{texte[:80]}"'  # les noms contiennent des espaces


def journal(quoi, ec, debut, **details):
    """Une ligne par récupération réelle chez l'école (visible chez l'hébergeur).

    Ne se déclenche que sur un vrai passage à l'école : ni les réponses
    servies par le cache partagé, ni celles servies par _memo n'apparaissent.
    Chercher « ezh » dans les journaux donne donc directement le nombre de
    requêtes envoyées à l'école, et par quelle formation.
    """
    champs = " ".join(f"{k}={_propre(v)}" for k, v in details.items())
    print(f'ezh {quoi} {champs} appels={ec.total_appels()} '
          f'reconnexions={ec.reconnexions} duree={time.monotonic() - debut:.1f}s',
          flush=True)  # sans flush, l'hébergeur peut perdre la ligne


_MEMO = {}


def _memo(cle, duree, calcul, frais=False):
    """Garde un résultat en mémoire `duree` secondes (tant que le serveur vit) :
    les étudiants d'une même formation partagent la même récupération."""
    vu = _MEMO.get(cle)
    if vu and not frais and time.monotonic() - vu[0] < duree:
        return vu[1]
    resultat = calcul()
    _MEMO[cle] = (time.monotonic(), resultat)
    return resultat


def formations(budget=20):
    """Noms des formations proposées par l'école (uniques, ordre de l'école)."""
    def calcul():
        ecole = Ecole(time.monotonic() + budget)
        return [f["L"] for f in ecole.faire(lambda hp: hp.formations())]
    return _memo(("formations",), 3600, calcul)


def horaire(formation, budget=75, frais=False):
    """Emploi du temps complet d'une formation, avec les groupes de chaque séance.

    Un cours identique sur plusieurs semaines n'apparaît qu'une fois, avec la
    liste de ses semaines. `groupes` vide = séance de toute la formation.
    """
    def calcul():
        debut = time.monotonic()
        ecole = Ecole(time.monotonic() + budget)
        try:
            return _recuperer(ecole, formation)
        finally:
            journal("horaire", ecole, debut,
                    formation=formation, frais=int(frais))

    def _recuperer(ecole, formation):
        info = ecole.faire(lambda hp: hp.formation(formation))
        heures = ecole.faire(lambda hp: hp.heures())
        regroupes, tous = {}, set()
        for w in info["semaines"]:
            def semaine(hp, w=w):
                # session neuve après un raté : ressource relue
                return hp.edt(hp.formation(formation)["ressource"], f"[{w}]")["ListeCours"]
            for brut in ecole.faire(semaine):
                c = decode_cours(brut, heures)
                c["groupes"] = sorted({i.get("L", "") for i in _items(brut, 14)} - {""},
                                      key=tri_naturel)
                tous.update(c["groupes"])
                cle = tuple(c[k] for k in ("jour", "debut", "fin", "matiere", "profs",
                                          "salles", "type", "couleur")) + tuple(c["groupes"])
                regroupes.setdefault(cle, dict(c, semaines=[]))["semaines"].append(w)
        cours = sorted(regroupes.values(),
                       key=lambda c: (min(c["semaines"]), c["jour"], c["_slot"]))
        for c in cours:
            del c["_slot"]
        maj = maintenant()
        return {
            "meta": {
                "fetched_at": maj.strftime("%d/%m/%Y à %Hh%M"),
                "ts": int(maj.timestamp() * 1000),  # pour comparer deux versions
                "premier_lundi": ecole.faire(lambda hp: hp.premier_lundi()),
                "periode": format_ensemble(info["semaines"]),
                "source": SOURCE,
            },
            "formation": formation,
            "groupes": sorted(tous, key=tri_naturel),
            "cours": cours,
        }
    return _memo(("horaire", formation), 900, calcul, frais)


def pdf_semaine(formation, groupe, semaine, budget=40):
    """PDF officiel d'une semaine, pour un groupe ou (groupe vide) toute la formation.

    Généré à la demande et renvoyé tel quel : rien n'est stocké ici. Le cache
    partagé, lui, le garde une demi-heure (voir api/pdf.py) — c'est l'appel le
    plus coûteux pour l'école, et le document est identique pour tous les
    étudiants d'un même groupe.
    """
    debut = time.monotonic()
    ecole = Ecole(time.monotonic() + budget)

    def action(hp):
        info = hp.formation(formation)
        if semaine not in info["semaines"]:
            raise ValueError(f"semaine {semaine} non publiée par l'école")
        ress = hp.groupe(formation, groupe) if groupe else info["ressource"]
        return hp.pdf(ress, semaine, format_ensemble(info["semaines"]))
    try:
        return ecole.faire(action)
    finally:
        journal("pdf", ecole, debut, formation=formation,
                groupe=groupe, semaine=semaine)


def maintenant():
    """Heure de Bruxelles, même sur un serveur en UTC."""
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("Europe/Brussels"))
    except Exception:  # noqa: BLE001 - repli sans base de fuseaux (tzdata)
        utc = datetime.now(timezone.utc)
        ete = 3 < utc.month < 11  # approximation : heure d'été d'avril à octobre
        return utc + timedelta(hours=2 if ete else 1)
