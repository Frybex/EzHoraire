"""École de test : horaires fictifs pour la simulation locale.

Exposée seulement quand EZH_SIM=1 (posé par tools/serve.py) : un
déploiement Vercel, qui ne l'a pas, ne la propose jamais. Le format est
celui des écoles réelles (voir ClientHyperplanning.horaire) : l'app ne
voit aucune différence — mêmes cartes, mêmes en-têtes, même PDF absent.

Les données copient les habitudes de la HEH (relevées sur un horaire
réel) pour que la simulation soit fidèle : noms de profs seuls, salles
« 1/36A », groupes suffixés par la formation, types Laboratoires / Cours
/ vide / Examen, quelques cours sans salle ni prof (réels : 10 sur 129),
jamais plus d'un groupe par cours, année complète en 14 semaines, jours
fériés sous forme de plages.
"""
import datetime

NOM = "Simulation — école de test"
SOURCE = "données fictives (EZH_SIM=1, jamais en ligne)"

# Les quatre formations du menu (lab/simulation.html). Chacune balaie des
# combinaisons différentes de salle, prof et groupe : les trois à la fois,
# deux, un seul, ou aucun — c'est ce que la simulation doit montrer.
FORMATIONS = (
    "BA1 Informatique",
    "BA1 Droit belge",
    "BA1 Comptabilité",
    "BA1 Soins infirmiers",
)

# Une école publie l'année entière : les cours se répètent semaine après
# semaine, certains seulement une partie de l'année (stage, examen), et
# rien pendant la semaine de congé (4e) — c'est ce qui produit l'écran
# « Semaine de congé » de l'app, comme dans un vrai relevé.
TOUTES = tuple(range(1, 15))
CONGES = (4,)
COURS_TOUTES = tuple(w for w in TOUTES if w not in CONGES)
PREMIER_SEMESTRE = tuple(w for w in COURS_TOUTES if w <= 7)


def _cours(jour, debut, fin, matiere, salle="", prof="", groupes=(),
           type_="Laboratoires", semaines=COURS_TOUTES):
    """Un cours au format de l'app (jour : 0 = lundi)."""
    return {
        "jour": jour, "debut": debut, "fin": fin, "matiere": matiere,
        "salles": salle, "profs": prof, "groupes": list(groupes),
        "type": type_, "couleur": "#408080", "semaines": list(semaines),
    }


_SEMAINES = {
    "BA1 Informatique": [
        # Lundi : les trois (salle, prof, groupe) deux fois, dont une avec
        # un nom de salle volontairement long (trois lignes sur téléphone
        # une fois le cours déroulé) : les vraies écoles ont des libellés
        # pareils (« Auditoire Pierre Drion (bâtiment R) »), et ça permet
        # de voir que l'heure de fin descend en douceur.
        _cours(0, "08h15", "10h15", "Programmation orientée objet",
               "1/36A", "Delcourt", ("Groupe 1 BA1 Informatique",)),
        _cours(0, "10h30", "12h30", "Analyse",
               "Grand auditoire 1/14 du bâtiment Z, deuxième étage, aile Nord, fond du couloir",
               "Delcourt", ("Groupe 1 BA1 Informatique",), type_="Cours"),
        # Mardi : profs seuls (plusieurs), puis groupe seul.
        _cours(1, "08h15", "12h30", "Bases de données", prof="Martin, Leroy"),
        _cours(1, "13h30", "15h30", "Anglais",
               groupes=("Groupe 1 BA1 Informatique",), type_="Cours"),
        # Mercredi : les trois sans groupe, salle + groupe, prof + groupe.
        _cours(2, "08h15", "10h15", "Programmation orientée objet",
               "1/36A", "Delcourt"),
        _cours(2, "10h30", "12h30", "Projet", "2/17A",
               groupes=("Groupe 2 BA1 Informatique",)),
        _cours(2, "13h30", "15h30", "Introduction au droit", prof="Petit",
               groupes=("Groupe 1 BA1 Informatique",), type_="Cours"),
        # Jeudi : stage (ni salle, ni prof, ni groupe), premier semestre.
        _cours(3, "09h00", "12h00", "Stage en entreprise",
               semaines=PREMIER_SEMESTRE),
        # Jeudi après-midi : cours de test en 8 séances (semaines 1, 2,
        # 3 puis 5 à 9, la 4e étant le congé), pour essayer la recherche.
        _cours(3, "13h30", "15h30", "Cours test", "1/20", type_="Cours",
               semaines=(1, 2, 3, 5, 6, 7, 8, 9)),
        # Vendredi : deux salles, un cours sans prof, un examen.
        _cours(4, "08h15", "10h15", "Bases de données", "1/36A, 1/36B",
               "Martin", ("Groupe 1 BA1 Informatique",)),
        _cours(4, "10h30", "12h30", "Analyse", "1/14", type_=""),
        _cours(4, "13h30", "15h30", "Examen d'analyse", "1/23", "Vanhove",
               type_="Examen", semaines=(8, 9)),
    ],
    "BA1 Droit belge": [
        _cours(0, "09h00", "12h00", "Droit civil", prof="Petit",
               groupes=("Groupe 1 BA1 Droit belge",), type_="Cours"),
        _cours(1, "08h15", "10h15", "Droit constitutionnel", "1/23",
               type_="Cours"),
        _cours(2, "13h30", "15h30", "Histoire du droit", "2/09A", "Lambert",
               ("Groupe 1 BA1 Droit belge",), type_="Cours"),
        _cours(3, "10h30", "12h30", "Droit pénal",
               groupes=("Groupe 1 BA1 Droit belge",), type_="Cours"),
        _cours(4, "08h15", "12h30", "Économie politique", "1/10B",
               "Vanhove, Demaret", type_="Cours"),
    ],
    "BA1 Comptabilité": [
        _cours(0, "08h15", "12h30", "Comptabilité générale", "1/10B",
               "Demaret", type_="Cours"),
        _cours(1, "13h30", "15h30", "Comptabilité analytique", prof="Demaret",
               groupes=("Groupe 1 BA1 Comptabilité",), type_="Cours"),
        _cours(2, "08h15", "10h15", "Fiscalité", "1/27", type_="Cours"),
        _cours(3, "13h30", "15h30", "Anglais",
               groupes=("Groupe 1 BA1 Comptabilité",), type_="Cours"),
        _cours(4, "10h30", "12h30", "Économie politique", "1/10B", "Vanhove",
               type_="Cours"),
    ],
    "BA1 Soins infirmiers": [
        _cours(0, "08h15", "10h15", "Anatomie", "2/09A", "Lambert"),
        _cours(0, "10h30", "12h30", "Soins infirmiers de base", prof="Dupont",
               groupes=("Groupe 1 BA1 Soins infirmiers",), type_="Cours"),
        _cours(1, "08h15", "12h30", "Stage clinique", "1/23"),
        _cours(2, "13h30", "15h30", "Psychologie",
               groupes=("Groupe 1 BA1 Soins infirmiers",), type_="Cours"),
        _cours(3, "08h15", "10h15", "Biologie", "1/14", "Demaret"),
        # Cas limite de l'app (aucune info) : la HEH n'en produit pas.
        _cours(4, "10h30", "12h30", "Hygiène hospitalière", type_=""),
    ],
}

# Parcours « PAR:… » (sélection de codes de cours, comme l'ULB) : chaque
# code porte un cours d'une formation, et l'app affiche le code (l'ULB ne
# donne pas d'intitulé dans ce mode). Le mélange Informatique + Droit
# produit trois conflits entre deux cours choisis (lundi, mardi,
# mercredi) — la règle que l'app applique à ces sélections.
PAR_CODES = {
    "SIMU1101": ("BA1 Informatique", "Programmation orientée objet"),
    "SIMU1102": ("BA1 Informatique", "Introduction au droit"),
    "SIMU1103": ("BA1 Informatique", "Bases de données"),
    "SIMU2101": ("BA1 Droit belge", "Droit civil"),
    "SIMU2102": ("BA1 Droit belge", "Droit constitutionnel"),
    "SIMU2103": ("BA1 Droit belge", "Histoire du droit"),
}

# Plages de jours fériés, comme les écoles (numéro de jour depuis le
# premier lundi) : la semaine de congé (4e) et un jeudi de la 8e, libre
# pour l'Informatique (le stage s'arrête) — de quoi voir la pastille
# « Férié » d'un jour sans cours.
FERIES = "[22..26, 53]"


def formations(budget=15):
    return list(FORMATIONS)


JOURS = ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")


def _echapper(texte):
    return str(texte).replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")


def _pdf(titre, lignes):
    """PDF 1.4 minimal (une page A4 paysage) : catalogue, page, police
    Helvetica, flux de texte, table xref recalculée. Volontairement écrit
    à la main — pas de dépendance pour une école de test."""
    flux = ["BT /F1 18 Tf 40 545 Td (" + _echapper(titre) + ") Tj ET"]
    y = 505
    for ligne in lignes[:24]:
        flux.append(f"BT /F1 11 Tf 40 {y} Td (" + _echapper(ligne) + ") Tj ET")
        y -= 19
    contenu = "\n".join(flux).encode("latin-1", "replace")
    objets = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica "
        b"/Encoding /WinAnsiEncoding >>",
        b"<< /Length " + str(len(contenu)).encode() + b" >>\nstream\n"
        + contenu + b"\nendstream",
    ]
    sortie = bytearray(b"%PDF-1.4\n")
    positions = []
    for i, objet in enumerate(objets, start=1):
        positions.append(len(sortie))
        sortie += str(i).encode() + b" 0 obj\n" + objet + b"\nendobj\n"
    xref = len(sortie)
    sortie += b"xref\n0 " + str(len(objets) + 1).encode() + b"\n0000000000 65535 f \n"
    for position in positions:
        sortie += ("%010d 00000 n \n" % position).encode()
    sortie += (b"trailer\n<< /Size " + str(len(objets) + 1).encode()
               + b" /Root 1 0 R >>\nstartxref\n" + str(xref).encode() + b"\n%%EOF\n")
    return bytes(sortie)


def _lundi_courant():
    """Lundi de la semaine du jour : la simulation se regarde tout de
    suite (« cette semaine » tombe sur les cours servis)."""
    auj = datetime.date.today()
    return auj - datetime.timedelta(days=auj.weekday())


def _cours_de(formation):
    """Les cours d'une formation, ou d'un parcours « PAR:… » (codes)."""
    if formation.startswith("PAR:"):
        codes = [c.strip().upper() for c in formation[4:].split(",") if c.strip()]
        if not codes or len(codes) > 30:
            raise ValueError("aucun cours dans cette sélection.")
        cours = []
        for code in sorted(set(codes)):
            entree = PAR_CODES.get(code)
            if entree is None:
                raise ValueError(f"cours introuvable chez l'école : {code}")
            nom, matiere = entree
            for c in _SEMAINES[nom]:
                if c["matiere"] == matiere:
                    cours.append(dict(c, matiere=code))
        if not cours:
            raise ValueError("aucun cours dans cette sélection.")
        return cours
    if formation not in _SEMAINES:
        raise ValueError(f"formation introuvable chez l'école : {formation}")
    return [dict(c) for c in _SEMAINES[formation]]


def horaire(formation, budget=75):
    cours = _cours_de(formation)
    groupes = sorted({g for c in cours for g in c["groupes"]})
    maintenant = datetime.datetime.now()
    return {
        "meta": {
            "fetched_at": maintenant.strftime("%d/%m/%Y à %Hh%M"),
            "ts": int(maintenant.timestamp() * 1000),
            "premier_lundi": _lundi_courant().isoformat(),
            "periode": "[1..14]",
            "feries": FERIES,
            "source": SOURCE,
        },
        "formation": formation,
        "groupes": groupes,
        "cours": cours,
    }


def pdf_semaine(formation, groupe, semaine, budget=40):
    """PDF minimal (une page, Helvetica) écrit à la main : assez pour que
    la visionneuse de l'app ait un vrai document à rendre — maison, sans
    dépendance. Les vraies écoles, elles, renvoient leur PDF officiel."""
    cours = _cours_de(formation)
    connus = {g for c in cours for g in c["groupes"]}
    if groupe and groupe not in connus:
        raise ValueError(f"groupe introuvable : {groupe}")
    lignes = []
    for c in cours:
        if semaine not in c["semaines"]:
            continue
        if groupe and c["groupes"] and groupe not in c["groupes"]:
            continue
        lignes.append((c["jour"], c["debut"], "%s  %s-%s  %s%s%s" % (
            JOURS[c["jour"]].capitalize(), c["debut"], c["fin"], c["matiere"],
            "  ·  " + c["salles"] if c["salles"] else "",
            "  ·  " + c["profs"] if c["profs"] else "")))
    if not lignes:
        raise ValueError(f"semaine {semaine} non publiée par l'école")
    titre = (f"Horaire - {formation} · semaine {semaine}"
             + (f" · {groupe}" if groupe else ""))
    lignes.sort()
    return _pdf(titre, [ligne for _, _, ligne in lignes])
