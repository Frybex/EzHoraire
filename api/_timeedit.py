"""Moteur commun pour les écoles publiant leurs horaires sur TimeEdit.

Utilisé par _ulb.py. Contrairement aux écoles Hyperplanning, aucune session
n'est ouverte : la vue publique de TimeEdit (celle de « je n'ai pas encore
d'identifiant ») expose des points d'entrée JSON et PDF lisibles sans compte.
On s'en tient à ceux-là :

- objects.json : recherche d'objets (niveaux d'études, UE), paginée ;
- ri.json     : réservations (cours) d'une sélection d'objets ;
- ri.pdf      : grille officielle, une page par semaine.

Le cache mémoire (15 min horaire, 1 h listes) et le fuse par instance
imitent _hyperplanning : deux étudiants de la même formation ne font pas
travailler l'école deux fois.
"""
import json
import re
import threading
import time
from datetime import datetime, timedelta

import requests

from _hyperplanning import Surcharge, format_ensemble, journal, maintenant, tri_naturel

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

TIMEOUT_APPEL = 20       # s par requête (un appel normal prend ~200 ms)
PAGE_OBJETS = 100        # TimeEdit plafonne chaque page d'objets à 100
PAGES_MAX = 40           # garde-fou de la liste complète d'une école
PLAFOND_SEANCES = 1000   # réservations par réponse ri.json
APPELS_PAR_MINUTE = 400  # fuse anti-abus : appels TimeEdit / min / instance
FENETRE_APPELS = 60.0

RX_UE = re.compile(r"^[A-Z]{2,6}[0-9]{2,4}$")  # DROIC2001, LANGC2001
RX_GROUPE_ENCODE = re.compile(r"-\d{2}$")      # B-KIRE:2-01
# Division explicite dans la colonne « Info » : « Groupe 2 », « Série 3
# (Etudiants de R à Z) »… mais pas « TP Biochimie » ni « Allison ».
RX_INFO_GROUPE = re.compile(
    r"^(groupe|grp|gr\.?|s[ée]rie)\s*[- ]?\s*([0-9]{1,2}|[A-Z])\s*(\([^()]*\))?$", re.I)
# Un libellé que l'étudiant comprend tel quel (il le retrouve dans son PAE).
RX_LISIBLE = re.compile(r"groupe|gr\.|s[ée]rie|pad\d|mineure|module|option|anglais|espagnol|allemand|n[ée]erlandais|italien", re.I)


def _date(texte):
    """'28/09/2026' -> date."""
    return datetime.strptime(str(texte).strip(), "%d/%m/%Y").date()


def _heure(texte):
    """'08:00' -> '08h00' (même écriture que les autres écoles)."""
    m = re.fullmatch(r"(\d{1,2}):(\d{2})", str(texte or "").strip())
    return f"{int(m.group(1)):02d}h{m.group(2)}" if m else ""


class _Appels:
    """Faux compteur d'appels, pour réutiliser journal() de _hyperplanning."""

    def __init__(self, client):
        self.client = client

    def total_appels(self):
        return len(self.client._appels)

    reconnexions = 0


class ClientTimeEdit:
    """Fournit formations(), recherche(), horaire() et pdf_semaine()."""

    def __init__(self, base, nom, source, code, premier_lundi_defaut="2026-09-14",
                 annee="202627", sid_cours="10", sid_niveau="11",
                 fin_fenetre="20301231"):
        self.base = base.rstrip("/")
        self.nom = nom
        self.source = source
        self.code = code
        self.premier_lundi_defaut = premier_lundi_defaut
        self.annee = annee                    # « 202627 » : année académique
        self.sid_cours = sid_cours            # vue riche : UE, prof, salle, groupes
        self.sid_niveau = sid_niveau          # vue « par niveau »
        self.fin_fenetre = fin_fenetre        # TimeEdit plafonne à sa propre fin
        self._s = requests.Session()
        self._s.headers.update({"User-Agent": UA, "Accept-Language": "fr-BE,fr;q=0.9"})
        self._memo_data = {}
        self._verrou = threading.Lock()
        self._verrous = {}
        self._appels = []                     # horodatages (monotonic) des appels

    # ---------- transport ----------

    def _appel(self, chemin, params, timeout=None, flot=False):
        """GET chez TimeEdit, avec le fuse par instance et un essai de plus."""
        with self._verrou:
            t = time.monotonic()
            while self._appels and t - self._appels[0] > FENETRE_APPELS:
                self._appels.pop(0)
            if len(self._appels) >= APPELS_PAR_MINUTE:
                raise Surcharge("Trop de demandes en peu de temps : réessaie dans une minute.")
            self._appels.append(t)
        url = f"{self.base}/{chemin}"
        dernier = None
        for essai in range(2):
            try:
                r = self._s.get(url, params=params, timeout=timeout or TIMEOUT_APPEL)
                r.raise_for_status()
                return r.content
            except requests.RequestException as e:
                dernier = e
                if essai == 0:
                    time.sleep(0.6)
        raise RuntimeError(f"TimeEdit ne répond pas correctement ({dernier}).")

    def _json(self, chemin, params, timeout=None):
        contenu = self._appel(chemin, params, timeout=timeout, flot=True)
        try:
            donnees = json.loads(contenu.decode("utf-8"))
        except Exception as e:  # noqa: BLE001 - réponse inattendue
            raise RuntimeError("TimeEdit a renvoyé une réponse illisible.") from e
        # TimeEdit répond parfois une simple chaîne (« Aucun résultats de
        # recherche ») : à traiter comme une réponse vide.
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

    # ---------- objets ----------

    def _objets(self, texte, types, fe=None, pages=2, budget=20):
        """Pages de résultats de recherche, s'arrête à `pages` ou à la fin."""
        debut = time.monotonic()
        trouves, start = [], 0
        for _ in range(pages):
            params = {"sid": self.sid_cours if types == 5 else self.sid_niveau,
                      "l": "fr_SY", "search_text": texte, "types": types,
                      "max": PAGE_OBJETS, "part": "t", "start": start}
            if fe:
                params["fe"] = fe
            d = self._json("objects.json", params)
            lot = d.get("objects") or []
            trouves += lot
            if not d.get("hasMore") or not lot:
                break
            if time.monotonic() - debut > budget:
                break
            start += len(lot)
        return trouves

    # ---------- listes ----------

    @staticmethod
    def nom_formation(code, description):
        return f"{code} · {description}".strip(" ·") if description else code

    @staticmethod
    def _est_niveau(nom):
        """Un vrai niveau d'études : pas un groupe (« CODE - groupe 01 »)
        ni un groupe encodé dans le code (« B-KIRE:2-01 »)."""
        return bool(nom) and " - " not in nom and not RX_GROUPE_ENCODE.search(nom)

    @staticmethod
    def _parent_niveau(nom):
        """« B-DROIB:2 - groupe 01 » -> « B-DROIB:2 », « B-KIRE:2-01 » -> « B-KIRE:2 ».

        La recherche de l'ULB renvoie des groupes quand les mots-clés
        ressemblent à un intitulé (« bloc 2 droit ») : l'app, elle, ne
        propose que des niveaux, puis l'écran des groupes."""
        if " - " in nom:
            return nom.split(" - ", 1)[0]
        if RX_GROUPE_ENCODE.search(nom):
            return re.sub(r"-\d{2}$", "", nom)
        return None

    def formations(self, budget=30):
        """Liste complète des niveaux (repli : l'app fait une recherche)."""
        def calcul():
            debut = time.monotonic()
            objets, start = [], 0
            for _ in range(PAGES_MAX):
                d = self._json("objects.json", {"sid": self.sid_niveau, "l": "fr_SY",
                                                "search_text": "", "types": 6,
                                                "max": PAGE_OBJETS, "part": "t",
                                                "start": start})
                lot = d.get("objects") or []
                objets += lot
                if not d.get("hasMore") or not lot:
                    break
                if time.monotonic() - debut > budget:
                    raise RuntimeError("L'ULB met trop de temps à répondre.")
                start += len(lot)
            noms, vus = [], set()
            for o in objets:
                f = o.get("fields") or {}
                nom = str(f.get("Nom") or "")
                if not self._est_niveau(nom):
                    continue
                affiche = self.nom_formation(nom, f.get("Description") or "")
                if affiche not in vus:
                    vus.add(affiche)
                    noms.append(affiche)
            journal(self.code, "formations", _Appels(self), debut, objets=len(objets))
            return sorted(noms, key=tri_naturel)
        return self._memo(("formations",), 3600, calcul)

    def recherche(self, texte, genre="niveau", budget=15):
        """Recherche en direct : niveaux d'études ou unités d'enseignement."""
        texte = " ".join(str(texte or "").split())
        if len(texte) < 2:
            return []
        types = 5 if genre == "ue" else 6
        fe = f"89.{self.annee}" if genre == "ue" else None
        objets = self._objets(texte, types, fe=fe, pages=2, budget=budget)
        resultats, vus = [], {}
        for o in objets:
            f = o.get("fields") or {}
            if types == 5:
                if str(f.get("Année académique") or "") != self.annee:
                    continue
                code, titre = str(f.get("UE") or ""), str(f.get("Description") or "")
                reel = True
            else:
                code, titre = str(f.get("Nom") or ""), str(f.get("Description") or "")
                reel = self._est_niveau(code)
                if not reel:
                    code = self._parent_niveau(code) or ""
            if not code:
                continue
            entree = {"cle": self.nom_formation(code, titre), "code": code, "titre": titre}
            if code in vus:
                # Le vrai niveau remplace la version déduite d'un groupe.
                if reel:
                    resultats[vus[code]] = entree
                continue
            vus[code] = len(resultats)
            resultats.append(entree)
        return resultats[:60]

    # ---------- résolution d'une formation ----------

    def _niveau_et_enfants(self, code, budget=20):
        objets = self._objets(code, 6, pages=2, budget=budget)
        niveau, enfants = None, []
        prefixe = code + " - "
        for o in objets:
            nom = str((o.get("fields") or {}).get("Nom") or "")
            if nom == code and niveau is None:
                niveau = o
            elif nom.startswith(prefixe) or re.fullmatch(re.escape(code) + r"-\d{2}", nom):
                enfants.append(o)
        if niveau is None:
            raise ValueError(f"formation introuvable chez l'école : {code}")
        return niveau, enfants

    def _ue(self, code, budget=20):
        objets = self._objets(code, 5, fe=f"89.{self.annee}", pages=1, budget=budget)
        for o in objets:
            f = o.get("fields") or {}
            if str(f.get("UE") or "") == code and str(f.get("Année académique") or "") == self.annee:
                return o
        raise ValueError(f"cours introuvable cette année : {code}")

    @staticmethod
    def _court_nom(niveau_code, nom):
        """« B-DROIB:2 - groupe 01 » -> « groupe 01 »."""
        if nom.startswith(niveau_code + " - "):
            return nom[len(niveau_code) + 3:].strip()
        court = nom[len(niveau_code):].lstrip("- ").strip()
        return f"groupe {court}" if court.isdigit() else (court or nom)

    def _selection(self, formation, budget=20):
        """Résout la clé de formation : objets à interroger, groupes connus."""
        if formation.startswith("PAR:"):
            codes = [c.strip() for c in formation[4:].split(",") if c.strip()]
            if not codes:
                raise ValueError("aucun code de cours dans cette sélection.")
            if len(codes) > 30:
                raise ValueError("trop de cours dans cette sélection (30 maximum).")
            ids, vus = [], set()
            for code in codes:
                o = self._ue(code, budget=budget)
                if o["idAndType"] not in vus:
                    vus.add(o["idAndType"])
                    ids.append(o["idAndType"])
            return {"ids": ids, "niveau": None, "enfants": {}}
        code = formation.split(" · ", 1)[0].strip()
        niveau, enfants = self._niveau_et_enfants(code, budget=budget)
        noms = {str((o.get("fields") or {}).get("Nom")): o["idAndType"] for o in enfants}
        return {"ids": [niveau["idAndType"]] + list(noms.values()),
                "niveau": niveau, "niveau_code": code, "niveau_id": niveau["idAndType"],
                "ids_par_nom": noms,
                "enfants": {nom: self._court_nom(code, nom) for nom in noms}}

    # ---------- horaire ----------

    def horaire(self, formation, budget=75):
        return self._memo(("horaire", formation), 900,
                          lambda: self._recuperer(formation, budget))

    def _reservations(self, ids, budget=60):
        """Réservations de la sélection, au-delà du plafond si nécessaire.

        La fenêtre « p=0.w,<fin>.x » part du lundi de la semaine en cours :
        avec « 0.m » TimeEdit ne renvoyait qu'à partir d'aujourd'hui (les
        cours du lundi au mercredi de la semaine affichée manquaient).
        Quand une sélection dépasse le plafond, on découpe la fin de fenêtre
        en tranches et on déduplique par identifiant de séance."""
        params = {"sid": self.sid_cours, "objects": ",".join(ids), "h": "t",
                  "ox": 0, "types": 0, "fe": 0, "max": PLAFOND_SEANCES}
        d = self._json("ri.json", dict(params, p=f"0.w,{self.fin_fenetre}.x"),
                       timeout=max(20, min(budget, 60)))
        seances = {r.get("id"): r for r in (d.get("reservations") or [])}
        total = (d.get("info") or {}).get("reservationcount") or 0
        if total >= PLAFOND_SEANCES:
            debut = time.monotonic()
            fin = datetime.strptime(self.fin_fenetre, "%Y%m%d").date()
            tranche = datetime.now().date() + timedelta(days=35)
            while tranche < fin and time.monotonic() - debut < budget:
                d = self._json("ri.json", dict(params, p=f"0.w,{tranche.strftime('%Y%m%d')}.x"),
                               timeout=max(20, min(budget, 60)))
                for r in d.get("reservations") or []:
                    seances.setdefault(r.get("id"), r)
                tranche += timedelta(days=35)
        return list(seances.values())

    def _recuperer(self, formation, budget=75):
        debut = time.monotonic()
        sel = self._selection(formation, budget=budget)
        lundi0 = datetime.strptime(self.premier_lundi_defaut, "%Y-%m-%d").date()
        reservations = self._reservations(sel["ids"], budget=budget)
        i_ens, i_salle = 4, 5
        seances, feries, noms_feries, semaines = [], [], {}, set()
        for r in reservations:
            cols = list(r.get("columns") or [])
            while len(cols) <= max(i_ens, i_salle):
                cols.append("")
            if self._est_conge(r):
                # L'ULB nomme ses fermetures (« Toussaint », « St Verhaegen ») :
                # le nom part avec le jour, pour l'afficher au lieu de « férié ».
                nom = str(cols[0] or "").strip()
                for jour in self._jours_conge(r):
                    n = (jour - lundi0).days + 1
                    if n > 0:
                        feries.append(n)
                        if nom.strip("_ ") and str(n) not in noms_feries:
                            noms_feries[str(n)] = nom
                continue
            try:
                date = _date(r["startdate"])
            except Exception:  # noqa: BLE001 - séance illisible
                continue
            sem = (date - lundi0).days // 7 + 1
            debut_h = _heure(r.get("starttime"))
            if not debut_h or sem < 1:
                continue
            fin_h = _heure(r.get("endtime"))
            if str(r.get("endtime")) == "00:00" and r.get("enddate") != r.get("startdate"):
                fin_h = "24h00"
            matiere = str(cols[0] or "").strip()
            if not matiere:
                continue
            codes = [c.strip() for c in matiere.split(",") if RX_UE.match(c.strip())]
            seances.append({
                "jour": date.weekday(), "debut": debut_h, "fin": fin_h,
                "matiere": matiere, "codes": codes or [matiere],
                "profs": str(cols[3] or "").strip(),
                "salles": str(cols[i_salle] or "").strip(),
                "type": str(cols[2] or "").strip(),
                # Division dite dans la colonne « Info » (« Groupe 2 », « Série 3
                # (Etudiants de R à Z) ») : c'est aussi un choix à proposer.
                "ens": [t.strip() for t in str(cols[i_ens] or "").split(",") if t.strip()],
                "info": self._groupe_info(cols[1] if len(cols) > 1 else ""),
                # Info brut : sert d'étiquette quand un atelier n'a que ça
                # (« Allison », le nom de l'encadrant) — le filtre de groupe
                # ci-dessus, lui, ne garde que les vraies divisions.
                "info_brut": " ".join(str(cols[1] if len(cols) > 1 else "").split()),
                "sem": sem,
            })
            semaines.add(sem)
        # Mode parcours : ne garder que les choix qui changent l'horaire.
        labels = {} if sel.get("niveau_code") else self._choix_utiles(seances)
        cours = {}
        for sc in seances:
            if sel.get("niveau_code"):
                groupes = set(self._groupes(", ".join(sc["ens"]), sel))
                if sc["info"]:
                    groupes.add(sc["info"])
            else:
                groupes = {labels[t] for t in sc["ens"] if t in labels}
                if sc["info"]:
                    groupes.add(labels.get(sc["info"], sc["info"]))
                if sc.get("synth"):
                    groupes.add(sc["synth"])  # atelier en parallèle
            groupes = sorted(groupes, key=tri_naturel)
            cle = (sc["jour"], sc["debut"], sc["fin"], sc["matiere"], sc["profs"],
                   sc["salles"], sc["type"], tuple(groupes))
            ligne = cours.get(cle)
            if ligne is None:
                cours[cle] = {"jour": cle[0], "debut": sc["debut"], "fin": sc["fin"],
                              "matiere": sc["matiere"], "profs": sc["profs"],
                              "salles": sc["salles"], "type": sc["type"],
                              "couleur": "#888888", "groupes": list(groupes),
                              "semaines": [sc["sem"]]}
            elif sc["sem"] not in ligne["semaines"]:
                ligne["semaines"].append(sc["sem"])
        liste = sorted(cours.values(), key=lambda c: (min(c["semaines"]), c["jour"], c["debut"]))
        for c in liste:
            c["semaines"].sort()
        if not semaines:
            raise ValueError("Aucun cours publié pour l'instant pour cette formation.")
        maj = maintenant()
        journal(self.code, "horaire", _Appels(self), debut,
                formation=(sel.get("niveau_code") or formation)[:60],
                cours=len(liste), semaines=max(semaines))
        return {
            "meta": {
                "fetched_at": maj.strftime("%d/%m/%Y à %Hh%M"),
                "ts": int(maj.timestamp() * 1000),
                "premier_lundi": self.premier_lundi_defaut,
                "periode": format_ensemble(list(range(1, max(semaines) + 1))),
                "feries": format_ensemble(sorted(set(feries))),
                "feries_noms": noms_feries,
                "source": self.source,
            },
            "formation": formation,
            "groupes": sorted({g for c in liste for g in c["groupes"]}, key=tri_naturel),
            "cours": liste,
        }

    @staticmethod
    def _est_conge(r):
        """Une réservation sans heure (00:00 → 00:00) est une fermeture."""
        return (str(r.get("starttime")) in ("", "00:00")
                and str(r.get("endtime")) in ("", "00:00"))

    @staticmethod
    def _jours_conge(r):
        """Jours couverts par une fermeture (fin exclusive)."""
        try:
            premier = _date(r["startdate"])
        except Exception:  # noqa: BLE001
            return []
        try:
            fin = _date(r["enddate"])
        except Exception:  # noqa: BLE001
            fin = premier + timedelta(days=1)
        jours, cur = [], premier
        while cur < fin and len(jours) < 90:
            jours.append(cur)
            cur += timedelta(days=1)
        return jours

    @staticmethod
    def _signature(sc):
        return (sc["jour"], sc["debut"], sc["fin"], sc["profs"], sc["salles"])

    @staticmethod
    def _creneau(sc):
        return (sc["jour"], sc["debut"], sc["fin"])

    @staticmethod
    def _etiquette(sc):
        """« KEMLO Justine — S.K.4.601 » : le choix se lit sur la séance."""
        morceaux = [m for m in (sc["profs"], sc["salles"]) if m]
        return " — ".join(morceaux) if morceaux else sc["matiere"]

    def _choix_utiles(self, seances):
        """Choix qui changent réellement l'horaire (mode parcours).

        Beaucoup d'« ensembles d'étudiants » ne sont que des étiquettes :
        tous les inscrits au cours ont le même horaire. On ne garde que les
        jetons qui séparent les séances d'un cours, et quand la seule
        différence est le prof ou la salle, on l'annonce tel quel plutôt que
        par un code obscur (« M-COMUA:1 »).

        Un code de promo opaque (« M-COMUA:1 », « B1-COMM ») n'est proposé
        que s'il ne change que le prof ou la salle — sinon l'étudiant ne
        peut rien en faire, on le laisse hors des choix.

        Retourne {jeton: libellé affiché}."""
        par_ue = {}
        for i, sc in enumerate(seances):
            for code in sc["codes"]:
                par_ue.setdefault(code, []).append(i)
        candidats = set()
        for sc in seances:
            candidats.update(sc["ens"])
            if sc["info"]:
                candidats.add(sc["info"])
        labels, deja = {}, {}
        for jeton in sorted(candidats, key=tri_naturel):
            utile, prof_salle_seul, temoin = False, True, None
            for indices in par_ue.values():
                avec = [i for i in indices if jeton in seances[i]["ens"] or seances[i]["info"] == jeton]
                if not avec or len(avec) == len(indices):
                    continue  # ne sépare pas ce cours : étiquette de promo
                sans = [i for i in indices if i not in set(avec)]
                sig_avec = {self._signature(seances[i]) for i in avec}
                sig_sans = {self._signature(seances[i]) for i in sans}
                if sig_avec == sig_sans:
                    continue  # exactement les mêmes séances des deux côtés
                utile = True
                temoin = temoin or seances[avec[0]]
                if {self._creneau(seances[i]) for i in avec} != {self._creneau(seances[i]) for i in sans}:
                    prof_salle_seul = False
            if not utile:
                continue
            lisible = bool(RX_LISIBLE.search(jeton) or RX_INFO_GROUPE.match(jeton))
            if lisible:
                libelle = jeton
            elif prof_salle_seul and temoin:
                libelle = self._etiquette(temoin)
            else:
                continue  # code opaque qui déplace des séances : inexploitable
            if libelle in deja:
                continue  # deux jetons qui donnent le même choix : un seul suffit
            deja[libelle] = jeton
            labels[jeton] = libelle
        self._ateliers_paralleles(seances, deja)
        return labels

    @staticmethod
    def _minutes(heure):
        m = re.fullmatch(r"(\d{1,2})h(\d{2})", str(heure or ""))
        return int(m.group(1)) * 60 + int(m.group(2)) if m else None

    def _ateliers_paralleles(self, seances, deja):
        """Ateliers en parallèle : le choix se lit sur la séance, pas sur un code.

        L'ULB met parfois plusieurs ateliers du même cours au même moment
        (COMMB320 : même prof, encadrants et salles différents). Rien dans
        « Ensemble d'étudiants » ne les distingue : le nom de l'encadrant est
        dans la colonne « Info ». On en fait un choix par séance
        (« Allison — S.NB7.BOUT »), posé sur la séance elle-même."""
        par_ue = {}
        for i, sc in enumerate(seances):
            for code in sc["codes"]:
                par_ue.setdefault(code, []).append(i)
        for indices in par_ue.values():
            par_lot = {}
            for i in indices:
                par_lot.setdefault((seances[i]["jour"], seances[i]["sem"]), []).append(i)
            for lot in par_lot.values():
                if len(lot) < 2:
                    continue
                lot.sort(key=lambda i: (seances[i]["debut"], seances[i]["fin"], i))
                clusters, fin_max = [], None
                for i in lot:
                    a = self._minutes(seances[i]["debut"])
                    b = self._minutes(seances[i]["fin"]) or a
                    if clusters and a is not None and fin_max is not None and a < fin_max:
                        clusters[-1].append(i)
                        fin_max = max(fin_max, b or a or 0)
                    else:
                        clusters.append([i])
                        fin_max = b
                for cl in clusters:
                    if len(cl) < 2:
                        continue
                    cles = {(seances[i]["info"], seances[i]["salles"]) for i in cl}
                    if len(cles) < 2:
                        continue  # mêmes séances listées deux fois : rien à choisir
                    for i in cl:
                        bouts = [b for b in (seances[i].get("info_brut"), seances[i]["salles"]) if b]
                        if bouts:
                            libelle = " — ".join(bouts)
                            if libelle in deja and deja[libelle] is not None:
                                continue
                            deja[libelle] = None
                            seances[i]["synth"] = libelle

    @staticmethod
    def _groupe_info(texte):
        """Nom de groupe annoncé dans la colonne « Info », ou ''.

        L'ULB y met parfois la division (« Groupe 2 ») alors que la colonne
        « Ensemble d'étudiants » ne porte que la cohorte. On ne garde que les
        libellés qui sont *entièrement* un groupe (pas « TP Biochimie »,
        « Partim - Kuty » ni « Allison »)."""
        t = " ".join(str(texte or "").split())
        if not t or len(t) > 60:
            return ""
        return t if RX_INFO_GROUPE.match(t) else ""

    def _groupes(self, ensemble, sel):
        """Noms de groupes concernés par une réservation.

        En mode niveau, les jetons d'autres formations sont ignorés (cours
        mutualisé : « B-DROIB:2, B-PPHIL:2 ») et le niveau lui-même est un
        cours commun. En mode parcours, tous les jetons d'« Ensemble
        d'étudiants » deviennent des filtres possibles (la cohorte
        « B-COMM:2 », les mineures, les groupes…) : c'est exactement ce que
        l'ULB affiche à l'étudiant dans le détail d'une séance.
        """
        niveau_code = sel.get("niveau_code")
        if not niveau_code:
            return sorted({t.strip() for t in str(ensemble).split(",")
                           if re.search(r"[A-Za-z0-9]", t)
                           and not RX_UE.match(t.strip())}, key=tri_naturel)
        enfants = sel.get("enfants") or {}
        trouve = set()
        for jeton in str(ensemble).split(","):
            jeton = jeton.strip()
            if not jeton or jeton == niveau_code:
                continue
            if jeton in enfants:
                trouve.add(enfants[jeton])
            elif jeton.startswith(niveau_code + " - "):
                trouve.add(jeton[len(niveau_code) + 3:].strip())
            elif re.fullmatch(re.escape(niveau_code) + r"-\d{2}", jeton):
                trouve.add(self._court_nom(niveau_code, jeton))
        return sorted(trouve, key=tri_naturel)

    # ---------- PDF ----------

    def pdf_semaine(self, formation, groupe, semaine, budget=40):
        try:
            semaine = int(semaine)
        except (TypeError, ValueError):
            raise ValueError("semaine invalide")
        if not 1 <= semaine <= 60:
            raise ValueError("semaine invalide")
        sel = self._selection(formation, budget=20)
        ids = list(sel["ids"])
        if groupe and sel.get("niveau_code"):
            cible = None
            for nom, affiche in (sel.get("enfants") or {}).items():
                if affiche == groupe or nom == groupe:
                    cible = nom
                    break
            if cible is None:
                raise ValueError(f"groupe introuvable : {groupe}")
            ids = [sel["niveau_id"], sel["ids_par_nom"][cible]]
        lundi0 = datetime.strptime(self.premier_lundi_defaut, "%Y-%m-%d").date()
        fin = lundi0 + timedelta(days=semaine * 7 - 1)
        debut = time.monotonic()
        # Options du PDF TimeEdit (celles du dialogue d'impression) :
        # ps/page, sp/orientation (ignorée par ce point d'entrée), fs/police,
        # cl/couleur, shf/en-tête, pl/lignes, wpp/semaines par page,
        # dpp/colonnes par page, title/titre, rop/lignes du planning.
        # fs=8 : la police par défaut (11) fait chevaucher les intitulés ;
        # c'est le seul vrai levier de lisibilité. Le reste reste au défaut
        # (A4, couleur, en-tête et pied, ligné, une semaine par page).
        contenu = self._appel("ri.pdf", {
            "h": "t", "sid": self.sid_cours, "objects": ",".join(ids),
            "p": f"{semaine - 1}.w,{fin.strftime('%Y%m%d')}.x", "mw": 300,
            "fs": 8,
        }, timeout=max(20, min(budget, 60)), flot=True)
        if not contenu.startswith(b"%PDF"):
            raise RuntimeError("L'ULB n'a pas renvoyé de PDF pour cette semaine.")
        journal(self.code, "pdf", _Appels(self), debut,
                formation=(sel.get("niveau_code") or formation)[:60], semaine=semaine)
        return contenu
