"""Moteur « publication Hyperplanning » : grilles publiées en images, lues par OCR.

Certaines écoles (l'IHECS) publient leurs plannings avec l'export
« publication » d'Hyperplanning : pas d'appelfonction, aucune donnée
structurée — seulement des listes JavaScript (_ressource.js,
_periode.js, _grille.js : ressources, semaines, chemins) et, pour chaque
ressource et chaque semaine, une grille PNG. Le moteur :

1. lit les listes (ressources publiées, semaines, chemin de chaque grille) ;
2. télécharge les grilles de la ressource demandée ;
3. relit chaque grille : cases colorées repérées par la géométrie (colonnes
   des jours, lignes des heures), texte des cases lu par OCR (tesserocr,
   modèle français embarqué dans _moteurs/tessdata/), classé en
   matière / profs / salle ;
4. corrige salles et profs contre les listes officielles du site (les
   grilles abrègent : « 5102 (Audi » doit redevenir « S102 (Audi) »), et
   vote le libellé des matières entre les semaines (la même case revient
   chaque semaine, les variantes d'OCR se départagent) ;
5. rend le même format que les autres moteurs (meta / formation / groupes /
   cours), groupes toujours vides : la ressource publiée est déjà un
   groupe.

Le « PDF » de la semaine n'existe pas chez ces écoles : `pdf_semaine`
rend l'image publiée telle quelle (l'app l'affiche comme document
officiel de la semaine, voir DOCUMENT_MIME dans _ecoles/ihecs.py).

tesserocr est importé au chargement du module (ses gestionnaires de
signaux exigent le fil principal) mais toléré absent : sans lui, seule
l'école en images est privée d'OCR — les autres écoles continuent de
fonctionner et formations() reste utilisable. Pillow, lui, est importé
dans les fonctions qui en ont besoin.
"""
import collections
import html
import io
import os
import re
import threading
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from datetime import date

import requests

from .hyperplanning import Surcharge, format_ensemble, maintenant

# tesserocr installe ses gestionnaires de signaux à l'import : il doit se
# faire dans le fil principal, au chargement du module (comme tout import
# Python). Le module n'est chargé que si l'école est exposée (EZH_IHECS=1,
# voir _ecoles/__init__.py) ; sans la dépendance, les autres écoles
# continuent de fonctionner et l'école en images répond une erreur claire.
try:  # noqa: SIM105 - l'échec est prévu
    from tesserocr import PyTessBaseAPI, PSM
    TESSEROCR = True
except Exception:  # noqa: BLE001 - dépend de l'installation : bibliothèque
    # native absente (ImportError) ou illisible (OSError) ; dans ce cas
    # seule l'école en images est privée d'OCR, pas les autres écoles.
    PyTessBaseAPI = PSM = None
    TESSEROCR = False

ICI = os.path.dirname(os.path.abspath(__file__))
TESSDATA = os.path.join(ICI, "tessdata")

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
TIMEOUT = 15        # s par appel (une grille fait ~35 Ko)
CASES_PAR_MINUTE = 600     # fuse anti-abus : cases lues / min / instance
GRILLES_PARALLELES = 3     # grilles téléchargées en même temps
SEUILS = (40, 60, 90)      # seuils de binarisation essayés par case

RE_RESSOURCE = re.compile(r'new Ressource \("([a-zA-Z]+)","([^"]*)","([^"]*)"\)')
RE_PERIODE = re.compile(r'new Periode \("([^"]*)","([^"]*)","([^"]*)"\)')
RE_GRILLE = re.compile(r'new Grille  \("([^"]*)","([^"]*)"')

MOIS = {"janvier": 1, "février": 2, "fevrier": 2, "mars": 3, "avril": 4,
        "mai": 5, "juin": 6, "juillet": 7, "août": 8, "aout": 8,
        "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12,
        "decembre": 12}

# Particules de noms (« de MARNEFFE ») : jamais prises seules comme nom.
PARTICULES = {"de", "du", "des", "van", "von", "le", "la", "el", "al", "ben", "da", "di"}


# --------------------------------------------------------------- étiquettes

def etiquette(label):
    """« <M1 PI> Newsroom » -> « M1 PI - Newsroom », « <Bloc 1> Bloc 1 - Gr. A » -> « Bloc 1 - Gr. A ».

    Le préfixe entre chevrons dit la section (bloc ou master) ; quand le
    libellé la répète déjà, on ne la double pas."""
    label = " ".join(html.unescape(label).split())
    m = re.match(r"^<([^>]*)>\s*(.*)$", label)
    if not m:
        return label
    prefixe, reste = m.group(1).strip(), m.group(2).strip()
    if not reste:
        return prefixe
    if _norm(reste).startswith(_norm(prefixe)):
        return reste
    return f"{prefixe} - {reste}"


def _norm(texte):
    """Comparaison de texte : sans accents, minuscules, espaces et tirets normalisés."""
    t = unicodedata.normalize("NFD", str(texte or ""))
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    t = t.lower().replace("-", " ").replace("_", " ")
    return " ".join(t.split())


def _dist(a, b):
    """Distance de Levenshtein, bornée : 99 au-delà de 4 d'écart de longueur."""
    if a == b:
        return 0
    la, lb = len(a), len(b)
    if abs(la - lb) > 4:
        return 99
    prec = list(range(lb + 1))
    for i in range(1, la + 1):
        cour = [i] + [0] * lb
        for j in range(1, lb + 1):
            cour[j] = min(prec[j] + 1, cour[j - 1] + 1,
                          prec[j - 1] + (a[i - 1] != b[j - 1]))
        prec = cour
    return prec[lb]


def _date_lundi(libelle):
    """« du 5 au 10 octobre 2026 » -> date(2026, 10, 5), sinon None.

    Le libellé donne le premier jour publié (un lundi) et le dernier
    (samedi) ; le mois n'est écrit qu'une fois quand les deux dates sont
    dans le même mois (« du 12 au 17 octobre 2026 »), et l'année
    n'apparaît qu'à la fin, parfois après un changement de mois (« du 30
    novembre au 5 décembre 2026 »)."""
    m = re.match(r"du (\d{1,2})(?: (\w+))? au \d{1,2} (\w+)(?: (\d{4}))?$",
                 _norm(libelle))
    if not m:
        return None
    jour, mois_debut, mois_fin, annee = m.groups()
    mois = mois_debut or mois_fin
    if mois not in MOIS or mois_fin not in MOIS:
        return None
    annee = int(annee) if annee else maintenant().year
    if mois_debut and MOIS[mois_debut] > MOIS[mois_fin]:  # à cheval sur le nouvel an
        annee -= 1
    try:
        return date(annee, MOIS[mois], int(jour))
    except ValueError:
        return None


# ------------------------------------------------------------- correction

def vocab_salles(ressources):
    """Libellés des salles tels que les grilles les affichent.

    La liste du site écrit « 055 - B055 » ; les grilles affichent la
    partie après le tiret, seule ou concaténée (« A010 S115 (Audi) »)."""
    out = set()
    for genre, label, _ in ressources:
        if genre != "grSalle":
            continue
        label = " ".join(html.unescape(label).split())
        out.add(label.split(" - ", 1)[1].strip() if " - " in label else label)
    return sorted(out)


def vocab_profs(ressources):
    """Noms de prof tels que les grilles les affichent.

    La liste écrit le prénom en dernier (« LEYNEN Dorian ») : le nom est
    la partie avant, « DELEFORTRIE ANDRIES » pour « DELEFORTRIE ANDRIES
    Camille ». Certains prénoms sont composés (« TRÂN Kim Sa ») et la
    grille n'affiche alors que le premier mot : on ajoute aussi le
    premier nom quand il est assez long pour être un nom de famille (les
    particules « de », « van »… non). Les bouche-trous « A ATTRIBUER »
    sont écartés."""
    out = set()
    for genre, label, _ in ressources:
        if genre != "grEnseignant":
            continue
        mots = " ".join(html.unescape(label).split()).split()
        if not mots or _norm(mots[0]) == "a":
            continue
        if len(mots) == 1:
            out.add(mots[0])
            continue
        out.add(" ".join(mots[:-1]))
        premier = _norm(mots[0])
        if len(premier) >= 3 and premier not in PARTICULES:
            out.add(mots[0])
    return sorted(out)


def corriger(texte, vocab):
    """Découpe `texte` en libellés du vocabulaire (flou), sinon le garde.

    Rend (texte corrigé, part couverte par le vocabulaire). Une grille
    abîmée par l'OCR (« 5102 (Audi », « CELEFORTRIE ANDRIE S ») retrouve
    les libellés officiels ; un texte qui ne ressemble à rien (une
    matière, par exemple) ressort tel quel, part faible.

    Le découpage est cherché de façon optimale (programmation dynamique) :
    garder « B155 » puis « (Learning Lab.) » orphelin coûte plus cher que
    reconnaître « B156 (Learning Lab.) » à une lettre près, alors qu'un
    choix glouton garderait le premier."""
    brut = " ".join(str(texte or "").split())
    if not brut:
        return "", 0.0
    norme = _norm(brut)
    total = len(norme.replace(" ", "")) or 1
    vocab = [(len(_norm(lab)), _norm(lab), lab) for lab in vocab]
    n = len(norme)
    # dp[i] : (coût, longueur consommée, libellé) du meilleur découpage de norme[i:]
    dp = [(0.0, 0, None)] * (n + 1)
    for i in range(n - 1, -1, -1):
        cout, coupe, lab = dp[i + 1]
        meilleur = (cout + 1.0, 1, None)  # garder un caractère
        if i and norme[i - 1] != " ":
            dp[i] = meilleur  # en plein mot : rien à reconnaître ici
            continue
        for nl, norme_lab, label in vocab:
            limite = 1 if nl <= 3 else (2 if nl <= 8 else 3)
            for taille in (nl, nl + 1, nl - 1, nl + 2):
                if taille <= 0 or i + taille > n:
                    continue
                if i + taille < n and norme[i + taille] != " ":
                    continue  # la reconnaissance doit finir un mot
                d = _dist(norme[i:i + taille], norme_lab)
                if d <= limite:
                    cout = d + dp[i + taille][0]
                    if cout < meilleur[0] or (cout == meilleur[0] and taille > meilleur[1]):
                        meilleur = (cout, taille, label)
        dp[i] = meilleur
    trouves, couverts, tampon, i = [], 0, "", 0
    while i < n:
        cout, coupe, label = dp[i]
        if label is not None:
            if tampon.strip():
                trouves.append(tampon.strip())
            tampon = ""
            trouves.append(label)
            couverts += len(_norm(label).replace(" ", ""))
            i += coupe
        else:
            tampon += norme[i]
            i += 1
    if tampon.strip():
        trouves.append(tampon.strip())
    return " ".join(trouves), couverts / total


def classer_lignes(lignes, salles, profs):
    """Lignes d'une case -> (matière, profs, salle).

    La salle est la dernière ligne, quand elle ressemble à une salle ;
    ensuite chaque ligne qui ressemble à un nom de prof est un prof ;
    le reste, dans l'ordre, forme la matière (un titre long peut tenir
    sur deux lignes). Une ligne d'OCR peut avoir avalé la suivante
    (« Boost Néerlandais B1 TRAN ») : la fin est détachée quand elle
    ressemble à une salle ou à un prof."""
    salle, profs_out, titre = "", [], []
    reste = list(lignes)
    if reste:
        corrige, part = corriger(reste[-1], salles)
        if part >= 0.6:
            salle = corrige
            reste.pop()
    for ligne in reste:
        corrige, part = corriger(ligne, profs)
        if part >= 0.6:
            profs_out.append(corrige)
        else:
            titre.append(ligne)
    if titre:
        mots = titre[-1].split()
        for vocab, vers in ((salles, "salle"), (profs, "profs")):
            if vers == "salle" and salle:
                continue
            for k in range(1, min(4, len(mots))):
                fin = " ".join(mots[-k:])
                if vers == "profs" and not (len(fin) >= 4 and fin.upper() == fin):
                    continue  # un prof s'écrit en capitales ; « son » n'en est pas un
                corrige, part = corriger(fin, vocab)
                if part >= 0.6:
                    if vers == "salle":
                        salle = corrige
                    else:
                        profs_out.append(corrige)
                    titre[-1] = " ".join(mots[:-k])
                    mots = titre[-1].split()
                    break
    return " ".join(titre).strip(), ", ".join(profs_out), salle


def _voter_titres(titres):
    """Départage les libellés d'OCR du même cours entre les semaines.

    Les variantes proches (≤ 2) sont rapprochées (proche-voisin : une
    variante rejoint une grappe si elle ressemble à N'IMPORTE quel
    membre), puis la plus fréquente gagne — le même cours revient chaque
    semaine, la lecture la plus courante est la bonne. Le seuil est serré
    exprès : « Psychologie » et « Sociologie » (distance 3) ne doivent
    jamais se mélanger, même si l'un revient plus souvent que l'autre."""
    uniques = sorted(set(titres))
    normes = {t: _norm(t) for t in uniques}
    grappes = []
    for t in uniques:
        for grappe in grappes:
            if any(_dist(normes[t], normes[m]) <= 2 for m in grappe):
                grappe.append(t)
                break
        else:
            grappes.append([t])
    freq = collections.Counter(titres)
    gagnants = {}
    for grappe in grappes:
        if len(grappe) < 2:
            continue
        gagnant = min(grappe, key=lambda t: (
            -freq[t], -len(normes[t]),
            sum(_dist(normes[t], normes[u]) for u in grappe)))
        for t in grappe:
            gagnants[t] = gagnant
    return [gagnants.get(t, t) for t in titres]


# ------------------------------------------------------------------ OCR

def _fond_gris(image):
    h = image.histogram()
    return max(range(256), key=lambda v: h[v])


def preparer_case(crop, seuil):
    """Case -> image noire sur blanc, agrandie, avec marge pour Tesseract.

    Le fond de la case (la couleur la plus fréquente) devient blanc, tout
    ce qui s'en écarte devient noir : le texte peut être clair sur fond
    foncé ou l'inverse, la binarisation ne s'en occupe pas."""
    from PIL import Image, ImageOps
    g = crop.convert("L")
    fond = _fond_gris(g)
    g = g.point(lambda v: 0 if abs(v - fond) > seuil else 255)
    g = g.resize((g.width * 4, g.height * 4), Image.LANCZOS)
    return ImageOps.expand(g, border=14, fill=255)


def geometrie(image):
    """(y du haut, y du bas, [x des lignes verticales]) de la grille.

    Le haut et le bas sont les deux lignes horizontales qui traversent
    toute l'image (8h00 et 22h00) ; les verticales, cherchées dans la
    grille, séparent les six jours."""
    l, h = image.size
    ys = _lignes(image, "y", 0, l)
    if len(ys) < 2:
        raise RuntimeError("grille sans lignes horizontales")
    haut, bas = ys[0], ys[-1]
    xs = [x for x in _lignes(image, "x", haut + 2, bas - 2) if 2 < x < l - 2]
    if len(xs) < 3:
        raise RuntimeError("grille sans lignes verticales")
    return haut, bas, xs


def _lignes(image, axe, debut, fin):
    """Positions des lignes sombres traversant la zone [debut, fin].

    Sur une ligne horizontale on échantillonne des x (et l'inverse) :
    ~200 points suffisent, une ligne de grille est continue."""
    px = image.load()
    l, h = image.size

    def sombre(p):
        return p[0] < 110 and p[1] < 110 and p[2] < 110

    borne = h if axe == "y" else l
    pas = max(1, (fin - debut) // 200)
    out, i = [], 0
    while i < borne:
        n, tot = 0, 0
        for v in range(debut, fin, pas):
            tot += 1
            p = px[v, i] if axe == "y" else px[i, v]
            n += 1 if sombre(p) else 0
        if tot and n > tot * 0.9:
            out.append(i)
        i += 1
    groupes, j = [], 0
    while j < len(out):
        k = j
        while k + 1 < len(out) and out[k + 1] <= out[k] + 2:
            k += 1
        groupes.append((out[j] + out[k]) // 2)
        j = k + 1
    return groupes


def cases(image):
    """[(jour, début, fin, couleur, image de la case)] de la grille.

    Le texte est centré mais les titres longs touchent les bords : on
    échantillonne les bords des colonnes (fond pur) et on tolère des
    trous courts (≤ 8 px) tant que la couleur des bords ne change pas
    (deux cases voisines diffèrent de couleur et sont séparées par un
    blanc plus large)."""
    haut, bas, xs = geometrie(image)
    px = image.load()
    out = []
    for jour in range(len(xs) - 1):
        xg, xd = xs[jour] + 1, xs[jour + 1] - 1
        bords = list(range(xg + 2, min(xg + 8, xd))) + \
            list(range(max(xd - 7, xg + 8), xd - 1))
        if not bords:
            continue

        def rempli(y):
            n = sum(1 for x in bords if max(px[x, y][:3]) - min(px[x, y][:3]) > 40)
            return n > len(bords) * 0.15

        def couleur(y):
            c = collections.Counter(px[x, y][:3] for x in bords
                                    if max(px[x, y][:3]) - min(px[x, y][:3]) > 40)
            return c.most_common(1)[0][0] if c else None

        y = haut
        while y < bas:
            if not rempli(y):
                y += 1
                continue
            y0 = y
            y += 1
            while y < bas:
                if rempli(y):
                    y += 1
                    continue
                t = y
                while t < bas and not rempli(t) and t - y < 8:
                    t += 1
                if t - y < 8 and t < bas:
                    y = t
                    continue
                break
            col0 = couleur((y0 + min(y - 1, y0 + 6)) // 2)
            if y - y0 >= 12 and col0:
                coupe = y0
                for yy in range(y0 + 3, y - 3):
                    c = couleur(yy)
                    if c and sum(abs(a - b) for a, b in zip(c, col0)) > 80 and all(
                            couleur(z) and sum(abs(a - b) for a, b in zip(couleur(z), col0)) > 80
                            for z in range(yy, min(yy + 3, y))):
                        coupe = yy
                        break
                if coupe > y0:
                    out.append((jour, y0, coupe, col0,
                                image.crop((xg, y0, xd + 1, coupe))))
                    out.append((jour, coupe, y, couleur(coupe + 1),
                                image.crop((xg, coupe, xd + 1, y))))
                else:
                    out.append((jour, y0, y, col0, image.crop((xg, y0, xd + 1, y))))
            while y < bas and not rempli(y):
                y += 1
    return haut, bas, out


class ClientPublication:
    """Fournit formations(), horaire() et pdf_semaine() pour une école publiée en images."""

    def __init__(self, base, nom, source, code="ecole",
                 premier_lundi_defaut="2026-09-14"):
        self.base = base.rstrip("/")
        self.nom = nom
        self.source = source
        self.code = code
        self.premier_lundi_defaut = premier_lundi_defaut
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": UA})
        self._listes_data = None
        self._memo_data = {}
        self._verrou = threading.Lock()   # une récupération à la fois par clé
        self._verrous = {}
        self._ocr_verrou = threading.Lock()
        self._ocr_serial = threading.Lock()  # un seul lecteur OCR à la fois
        self._ocr_api = None
        self._ocr_recents = collections.deque()  # fuse anti-abus

    # --- listes du site ---

    def _texte(self, chemin):
        r = self.s.get(f"{self.base}/{chemin}", timeout=TIMEOUT)
        r.raise_for_status()
        return r.text

    def _listes(self):
        """Ressources, semaines et grilles, lues une fois par heure."""
        def calcul():
            ressources = [(g, " ".join(html.unescape(l).split()), c)
                          for g, l, c in RE_RESSOURCE.findall(self._texte("_ressource.js"))
                          if c != "vide"]
            semaines = {}
            for code, libelle, cle in RE_PERIODE.findall(self._texte("_periode.js")):
                if cle != "vide":
                    semaines.setdefault(code, []).append(
                        (" ".join(html.unescape(libelle).split()), cle))
            grilles = dict(RE_GRILLE.findall(self._texte("_grille.js")))
            return {
                "ressources": ressources,
                "semaines": semaines,
                "grilles": grilles,
                "salles": vocab_salles(ressources),
                "profs": vocab_profs(ressources),
            }
        return self._memo(("listes",), 3600, calcul)

    def _labels(self):
        """{étiquette affichable: code de la ressource} des promotions.

        L'étiquette est nettoyée (« <M1 PI> Newsroom » -> « M1 PI -
        Newsroom ») ; une ressource publiée deux fois sous des codes
        différents (mêmes libellé et grilles) n'apparaît qu'une fois ; si
        deux ressources distinctes produisent la même étiquette, elles
        gardent toutes deux leur libellé brut (avec chevrons) pour ne pas
        se confondre."""
        data = self._listes()
        paires, vus = [], set()
        for genre, label, code in data["ressources"]:
            if genre != "grDiplome" or label in vus:
                continue
            vus.add(label)
            paires.append((etiquette(label), label, code))
        par_etiquette = collections.defaultdict(list)
        for etq, brut, code in paires:
            par_etiquette[etq].append((brut, code))
        labels = {}
        for etq, liste in par_etiquette.items():
            if len(liste) == 1:
                labels[etq] = liste[0][1]
            else:
                for brut, code in liste:
                    labels[brut] = code
        return labels

    def premier_lundi(self):
        """Premier lundi de l'année scolaire (repère des numéros de semaine).

        La publication ne le donne pas : constante de l'école, à ajuster à
        chaque rentrée."""
        return self.premier_lundi_defaut

    def _semaines(self, code_ressource):
        """[(numéro, code de période, libellé)] publiées pour la ressource."""
        data = self._listes()
        lundi = date.fromisoformat(self.premier_lundi())
        out = []
        for libelle, cle in data["semaines"].get(code_ressource, []):
            d = _date_lundi(libelle)
            if d is None:
                continue
            out.append(((d - lundi).days // 7 + 1, cle, libelle))
        out.sort()
        return out

    # --- cache et fuse ---

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

    def _fuse_ocr(self):
        with self._ocr_verrou:
            maintenant_mono = time.monotonic()
            while self._ocr_recents and maintenant_mono - self._ocr_recents[0] > 60:
                self._ocr_recents.popleft()
            if len(self._ocr_recents) >= CASES_PAR_MINUTE:
                raise Surcharge("Trop de demandes en peu de temps : réessaie dans une minute.")
            self._ocr_recents.append(maintenant_mono)

    def _ocr(self):
        """Le moteur OCR partagé (tesserocr) : créé au premier usage, réutilisé."""
        if not TESSEROCR:
            raise RuntimeError("tesserocr manquant : impossible de lire les grilles publiées")
        if self._ocr_api is None:
            with self._ocr_serial:  # deux requêtes ne créent pas deux moteurs
                if self._ocr_api is None:
                    self._ocr_api = PyTessBaseAPI(path=TESSDATA, lang="fra",
                                                  psm=PSM.SINGLE_BLOCK)
        return self._ocr_api

    # --- lecture d'une grille ---

    def _image(self, chemin):
        r = self.s.get(f"{self.base}/{chemin}", timeout=TIMEOUT)
        r.raise_for_status()
        if not r.content.startswith(b"\x89PNG"):
            raise RuntimeError("la grille publiée n'est pas une image PNG")
        from PIL import Image
        return Image.open(io.BytesIO(r.content)).convert("RGB")

    def _lire_case(self, crop, salles, profs):
        """Image d'une case -> (matière, profs, salle) par OCR.

        Trois binarisations sont essayées. La bonne est souvent la plus
        « centrale » (la lecture que les trois partagent, à une ou deux
        lettres près) — « Néerlandais 4 » / « Néerlandais 1 » /
        « Néerlanchis 1 » : la médiane est la bonne, pas la plus
        confiante. À centralité égale, la confiance de Tesseract et la
        cohérence avec les listes officielles départagent."""
        api = self._ocr()
        self._fuse_ocr()
        variantes = []
        # tesserocr n'est pas réentrant : deux requêtes IHECS en même temps
        # (serve.py est multi-fils) sur la même instance le font tomber. Le
        # verrou sérialise la lecture ; elle est déjà séquentielle par requête.
        with self._ocr_serial:
            for seuil in SEUILS:
                api.SetImage(preparer_case(crop, seuil))
                # Un « | » traîne parfois en début de ligne (bord de case lu
                # comme un trait) : on l'enlève, il n'appartient à aucun texte.
                lignes = [l.strip(" |¦").strip() for l in api.GetUTF8Text().splitlines()]
                lignes = [l for l in lignes if l]
                note = api.MeanTextConf()
                if lignes:
                    _, part = corriger(lignes[-1], salles)
                    if part >= 0.6:
                        note += 12
                    for ligne in lignes[:-1]:
                        _, part = corriger(ligne, profs)
                        if part >= 0.6:
                            note += 6
                variantes.append((note, lignes))
        normes = [_norm(v[1][0]) if v[1] else "" for v in variantes]

        def centralite(i):
            return sum(_dist(normes[i], normes[j]) for j in range(len(variantes)) if j != i)

        # La bonne lecture est souvent la plus « centrale » (celle que les
        # trois partagent, à une ou deux lettres près) ; à centralité
        # égale, la confiance de Tesseract et la cohérence avec les listes
        # officielles départagent.
        choix = min(range(len(variantes)), key=lambda i: (centralite(i), -variantes[i][0]))
        return classer_lignes(variantes[choix][1], salles, profs)

    def _lire_grille(self, image, salles, profs):
        """Grille (PIL) -> [(jour, début min, fin min, couleur, matière, profs, salle)]."""
        haut, bas, boites = cases(image)
        if bas <= haut:
            return []
        out = []
        for jour, y0, y1, couleur, crop in boites:
            matiere, pr, salle = self._lire_case(crop, salles, profs)
            if not (matiere or pr or salle):
                continue
            debut = round((y0 - haut) / (bas - haut) * 14 * 60 / 5) * 5 + 8 * 60
            fin = round((y1 - haut) / (bas - haut) * 14 * 60 / 5) * 5 + 8 * 60
            out.append((jour, debut, fin, "#%02x%02x%02x" % couleur,
                        matiere, pr, salle))
        return out

    # --- API des écoles ---

    def formations(self, budget=20):
        """Étiquettes des promotions publiées (grDiplome)."""
        def calcul():
            return list(self._labels())
        return self._memo(("formations",), 3600, calcul)

    def horaire(self, formation, budget=75):
        """Horaire complet d'une promotion, toutes semaines publiées."""
        labels = self._labels()
        if formation not in labels:
            raise ValueError(f"formation introuvable chez l'école : {formation}")

        def calcul():
            debut = time.monotonic()
            data = self._recuperer(formation, labels[formation], budget)
            grilles, cases_lues = data.pop("_grilles", (0, 0)), data.pop("_cases", 0)
            print(f'ezh [{self.code}] horaire formation="{formation}" '
                  f'grilles={grilles[0]}/{grilles[1]} cases={cases_lues} '
                  f'cours={len(data["cours"])} duree={time.monotonic() - debut:.1f}s', flush=True)
            return data

        return self._memo(("horaire", formation), 900, calcul)

    def _recuperer(self, formation, code, budget):
        data = self._listes()
        semaines = self._semaines(code)
        if not semaines:
            raise ValueError(f"aucune semaine publiée pour : {formation}")
        grilles = []
        for numero, cle, libelle in semaines:
            chemin = data["grilles"].get(cle)
            if chemin:
                grilles.append((numero, chemin))
        if not grilles:
            raise ValueError(f"aucune grille publiée pour : {formation}")
        salles, profs = data["salles"], data["profs"]
        self._ocr()  # tesserocr vit dans le fil appelant, jamais dans un fil de travail
        fin = time.monotonic() + budget

        # Les grilles sont téléchargées en parallèle (réseau), puis lues une
        # à une : la géométrie et l'OCR sont locaux et rapides.
        images = {}

        def telecharger(numero, chemin):
            images[numero] = self._image(chemin)

        echecs = []
        with ThreadPoolExecutor(max_workers=min(GRILLES_PARALLELES, len(grilles))) as pool:
            taches = [pool.submit(telecharger, numero, chemin) for numero, chemin in grilles]
            for t in taches:
                try:
                    t.result()
                except Exception as e:  # noqa: BLE001 - une grille absente
                    echecs.append(e)  # ne doit pas perdre les autres semaines
        if echecs and not images:
            raise echecs[0]

        resultats = {}
        for numero, chemin in grilles:
            if time.monotonic() > fin - 3:
                break
            image = images.get(numero)
            if image is not None:
                resultats[numero] = self._lire_grille(image, salles, profs)

        # Regroupe les cases identiques entre les semaines : mêmes cours,
        # mêmes profs, même salle ; le libellé est voté entre les semaines
        # (les variantes d'OCR du même texte se départagent).
        lues = []
        for numero in sorted(resultats):
            for jour, debut_min, fin_min, couleur, matiere, pr, salle in resultats[numero]:
                lues.append((numero, jour, debut_min, fin_min, couleur,
                             matiere, pr, salle))
        titres = _voter_titres([c[5] for c in lues])

        cours = {}
        for (numero, jour, debut_min, fin_min, couleur, _, pr, salle), matiere in zip(lues, titres):
            g = cours.setdefault((jour, debut_min, fin_min, matiere, pr, salle, couleur),
                                 {"jour": jour, "debut": _heure(debut_min),
                                  "fin": _heure(fin_min), "matiere": matiere,
                                  "profs": pr, "salles": salle,
                                  "type": "", "couleur": couleur, "groupes": [],
                                  "semaines": []})
            if numero not in g["semaines"]:
                g["semaines"].append(numero)
        liste = sorted(cours.values(), key=lambda c: (min(c["semaines"]), c["jour"],
                                                      c["debut"]))
        maj = maintenant()
        return {
            "meta": {
                "fetched_at": maj.strftime("%d/%m/%Y à %Hh%M"),
                "ts": int(maj.timestamp() * 1000),
                "premier_lundi": self.premier_lundi(),
                "periode": format_ensemble([n for n, _, _ in semaines]),
                "feries": "[]",
                "source": self.source,
            },
            "formation": formation,
            "groupes": [],
            "cours": liste,
            "_grilles": (len(resultats), len(grilles)),
            "_cases": len(lues),
        }

    def pdf_semaine(self, formation, groupe, semaine, budget=40):
        """Image publiée de la semaine (le « PDF » de ces écoles)."""
        labels = self._labels()
        if formation not in labels:
            raise ValueError(f"formation introuvable chez l'école : {formation}")
        data = self._listes()
        chemin = None
        for numero, cle, _ in self._semaines(labels[formation]):
            if numero == int(semaine):
                chemin = data["grilles"].get(cle)
                break
        if chemin is None:
            raise ValueError(f"semaine {semaine} non publiée par l'école")
        r = self.s.get(f"{self.base}/{chemin}", timeout=min(TIMEOUT, max(3, budget)))
        r.raise_for_status()
        if not r.content.startswith(b"\x89PNG"):
            raise RuntimeError("la grille publiée n'est pas une image PNG")
        return r.content


def _heure(minutes):
    return f"{minutes // 60:02d}h{minutes % 60:02d}"
