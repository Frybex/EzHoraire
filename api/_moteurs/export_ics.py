"""Horaire -> fichier iCalendar (.ics) — miroir de export_ics.js.

api/export.py sert ce contenu sur une vraie adresse en text/calendar :
sur iPhone, Safari ouvre alors Calendrier directement (« Ajouter tout »),
alors qu'un fichier fabriqué dans la page (blob:) doit être rouvert à la
main depuis Téléchargements.

Une séance = un événement, à sa date exacte : aucune règle de récurrence.
C'est plus verbeux, mais chaque date est explicite — l'aperçu d'import et
l'agenda affichent donc toutes les séances, sans dépendre de la façon dont
l'application d'agenda expanse les séries. Le format doit rester
identique à celui du module JS : un test compare les deux sorties.

Titre « pro » : [CODE · ]Intitulé[ · Type], sans emoji. Les agendas
colorent par calendrier, jamais par événement (la propriété COLOR de la
RFC 7986 est ignorée à l'import) : le titre est donc le seul repère
lisible partout. La salle vit dans LOCATION, pas dans le titre (la vue
Mois d'iOS n'en montre que ~10 caractères).

Entrée : l'horaire au format de l'API ({meta, cours}), des cours déjà
filtrés selon les groupes de l'étudiant. Sortie : texte iCalendar,
lignes pliées à 75 octets (RFC 5545).
"""
import re
from datetime import datetime, timedelta, timezone

TZID = "Europe/Brussels"
MAX_OCTETS = 73  # marge sous les 75 octets de la RFC (l'espace de continuation compte)
# Type écrit en fin d'intitulé : « -Th. », « -théo1 », « -TP », « -Labo ».
RX_TYPE_FIN = re.compile(
    r"\s*[-–]\s*(th[ée]o\s*(\d)?|th\.?|théorie|theorie|tp\s*(\d)?|labo\s*(\d)?|prat\.?)\s*$",
    re.I)
# Type donné par l'école, abrégé pour le titre. « Cours » est le défaut :
# il ne s'affiche pas. Un type inconnu est gardé tel quel.
TYPES_ECOLES = {
    "cours": "", "théorie": "Théorie", "theorie": "Théorie",
    "laboratoires": "Labo", "laboratoire": "Labo", "tp": "TP",
    "travaux pratiques": "TP", "séminaire": "Séminaire",
    "seminaire": "Séminaire", "examen": "Examen",
}
# Règles de l'heure d'été européenne, telles que les émettent Apple et Google.
VTIMEZONE = [
    "BEGIN:VTIMEZONE",
    "TZID:" + TZID,
    "X-LIC-LOCATION:" + TZID,
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
]
# Mêmes expressions que nettoyerMatiere()/codeMatiere() de index.html.
RX_CODE_MATIERE = re.compile(r"^([A-Z]{1,4}(?:-[A-Z0-9]{2,8}){1,3})\s*-\s+")
RX_HEURE = re.compile(r"^(\d{1,2})h(\d{2})$")


def _deux(n):
    return ("0" if n < 10 else "") + str(n)


def echapper(s):
    """Échappement des valeurs texte (RFC 5545 §3.3.11)."""
    return (str("" if s is None else s)
            .replace("\\", "\\\\")
            .replace(";", "\\;")
            .replace(",", "\\,")
            .replace("\r\n", "\\n").replace("\r", "\\n").replace("\n", "\\n"))


def plier(ligne):
    """Pliage : au-delà de 75 OCTETS, la suite commence par une espace.

    On compte en octets UTF-8, sans couper un caractère au milieu."""
    octets = ligne.encode("utf-8")
    if len(octets) <= MAX_OCTETS:
        return ligne
    morceaux = []
    while octets:
        coupe = min(MAX_OCTETS, len(octets))
        if coupe < len(octets):  # ne pas couper au milieu d'un caractère
            while coupe > 0 and (octets[coupe] & 0xC0) == 0x80:
                coupe -= 1
        morceaux.append(octets[:coupe].decode("utf-8"))
        octets = octets[coupe:]
    return "\r\n ".join(morceaux)


def _parse_iso(iso):
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", str(iso or ""))
    if not m:
        return None
    return int(m.group(1)), int(m.group(2)) - 1, int(m.group(3))


def _date_cours(lundi, sem, jour):
    """Date (année, mois, jour) de la semaine `sem` (1 = premier lundi) et
    du jour `jour` (0 = lundi). Arithmétique en UTC : aucun fuseau en jeu."""
    d = datetime(lundi[0], lundi[1] + 1, lundi[2]) + timedelta(days=(sem - 1) * 7 + jour)
    return d.year, d.month - 1, d.day


def _minutes(heure):
    m = RX_HEURE.fullmatch(str("" if heure is None else heure).strip())
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None


def _heure_ics(date, minutes):
    """« 20260928T083000 », en décalant la date si l'heure passe minuit."""
    jours, reste = divmod(minutes, 1440)
    d = datetime(date[0], date[1] + 1, date[2]) + timedelta(days=jours)
    return (f"{d.year}{_deux(d.month)}{_deux(d.day)}"
            f"T{_deux(reste // 60)}{_deux(reste % 60)}00")


def _horodatage(maintenant=None):
    maintenant = maintenant or datetime.now(timezone.utc)
    return maintenant.strftime("%Y%m%dT%H%M%SZ")


def nettoyer_matiere(m):
    brut = str("" if m is None else m)
    nettoye = RX_CODE_MATIERE.sub("", brut)
    nettoye = re.sub(r"\s*-?\s*AAEP\s*$", "", nettoye)
    nettoye = re.sub(r"\s+", " ", nettoye).strip()
    return nettoye or brut


def code_matiere(m):
    r = RX_CODE_MATIERE.match(str("" if m is None else m))
    return r.group(1) if r else ""


def _empreinte(c):
    """Identifiant stable d'une séance : réimporter le même horaire met à
    jour les événements au lieu de les dupliquer (même calcul que le JS)."""
    texte = "|".join([str(c.get("jour", "")), str(c.get("debut", "")), str(c.get("fin", "")),
                      nettoyer_matiere(c.get("matiere")), c.get("salles", ""),
                      c.get("profs", ""), c.get("type", ""),
                      "+".join(c.get("groupes") or [])])
    h = 5381
    for ch in texte:
        h = ((h * 33) ^ ord(ch)) & 0xFFFFFFFF
    return _base36(h)


def _base36(n):
    chiffres = "0123456789abcdefghijklmnopqrstuvwxyz"
    if n == 0:
        return "0"
    out = ""
    while n:
        n, r = divmod(n, 36)
        out = chiffres[r] + out
    return out


def type_matiere(base):
    """Type écrit dans l'intitulé : rend le type normalisé et l'intitulé
    débarrassé de ce suffixe (« Archit. des ordinateurs-Th. »)."""
    s = str("" if base is None else base)
    r = RX_TYPE_FIN.search(s)
    if not r:
        return "", s
    t = r.group(1).lower()
    if t.startswith("th"):
        nom = "Théorie" + (" " + r.group(2) if r.group(2) else "")
    elif t.startswith("tp"):
        nom = "TP" + (" " + r.group(3) if r.group(3) else "")
    elif t.startswith("labo"):
        nom = "Labo" + (" " + r.group(4) if r.group(4) else "")
    else:
        nom = "Pratique"
    return nom, s[:r.start()].strip()


def type_ecole(t):
    """Type donné par l'école, abrégé pour le titre (« Laboratoires » ->
    « Labo »). « Cours » disparaît : c'est le défaut."""
    s = str("" if t is None else t).strip()
    if not s:
        return ""
    return TYPES_ECOLES.get(s.lower(), s)


def titre_evenement(c):
    """Titre affiché dans l'agenda : [CODE · ]Intitulé[ · Type]."""
    brut = str((c or {}).get("matiere") or "Cours")
    code = code_matiere(brut)
    base = nettoyer_matiere(brut)
    typ, sans_type = type_matiere(base)
    base = sans_type or base
    typ = typ or type_ecole((c or {}).get("type"))
    # Type déjà dans l'intitulé (« CM: Analyse », type « CM ») : pas de doublon.
    if typ and typ.lower() in base.lower():
        typ = ""
    return " · ".join(x for x in (code, base, typ) if x) or "Cours"


def _description(c, code=""):
    lignes = []
    if c.get("type"):
        lignes.append("Type : " + c["type"])
    if code:
        lignes.append("Code : " + code)
    if c.get("profs"):
        lignes.append("Prof : " + c["profs"])
    if c.get("salles"):
        lignes.append("Salle : " + c["salles"])
    if c.get("groupes"):
        lignes.append("Groupe : " + ", ".join(c["groupes"]))
    lignes.append("Exporté depuis EzHoraire (ezhoraire.be)")
    return "\n".join(lignes)


def construire(horaire, nom="Horaire", uid="", depuis=0, maintenant=None, couleur=""):
    """Horaire {meta, cours} -> texte iCalendar complet.

    `uid` : préfixe stable (id du profil) ; `depuis` : ne garder que les
    semaines à partir de ce numéro ; `maintenant` : pour les tests ;
    `couleur` : couleur du calendrier (#rrggbb) — un abonnement par cours
    l'utilise pour que l'agenda prenne la couleur du cours (lue
    automatiquement par ICSx5 sur Android ; Apple la propose)."""
    lundi = _parse_iso((horaire.get("meta") or {}).get("premier_lundi"))
    if not lundi:
        raise ValueError("premier lundi manquant")
    stamp = _horodatage(maintenant)
    lignes = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//EzHoraire//Horaire//FR",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:" + echapper(nom or "Horaire"),
        "X-WR-TIMEZONE:" + TZID,
    ]
    if re.fullmatch(r"#[0-9A-Fa-f]{6}", couleur or ""):
        # Couleur du calendrier : propriété Apple (reconnue au niveau du
        # flux) et COLOR de la RFC 7986 (lue par ICSx5, Thunderbird…).
        lignes.append("X-APPLE-CALENDAR-COLOR:" + couleur)
        lignes.append("COLOR:" + couleur)
    lignes += VTIMEZONE
    for c in horaire.get("cours") or []:
        debut = _minutes(c.get("debut"))
        fin = _minutes(c.get("fin"))
        jour = c.get("jour")
        if debut is None or jour is None or not (0 <= jour <= 6):
            continue
        if fin is None or fin <= debut:
            fin = debut + 60  # fin absente ou incohérente
        vues, semaines = set(), []
        for s in c.get("semaines") or []:
            if s >= depuis and s not in vues:
                vues.add(s)
                semaines.append(s)
        semaines.sort()
        if not semaines:
            continue
        h = _empreinte(c)
        titre = titre_evenement(c)
        code = code_matiere(c.get("matiere"))
        for s in semaines:
            date = _date_cours(lundi, s, jour)
            lignes.append("BEGIN:VEVENT")
            # UID stable : la séance du jour précis. Réimporter met à jour
            # au lieu de dupliquer, et une semaine ajoutée par l'école
            # arrive comme un nouvel événement.
            lignes.append("UID:ezh-" + (uid + "-" if uid else "") + h + "-" +
                          f"{date[0]}{_deux(date[1] + 1)}{_deux(date[2])}@ezhoraire.be")
            lignes.append("DTSTAMP:" + stamp)
            lignes.append("DTSTART;TZID=" + TZID + ":" + _heure_ics(date, debut))
            lignes.append("DTEND;TZID=" + TZID + ":" + _heure_ics(date, fin))
            lignes.append("SUMMARY:" + echapper(titre))
            if c.get("salles"):
                lignes.append("LOCATION:" + echapper(c["salles"]))
            lignes.append("DESCRIPTION:" + echapper(_description(c, code)))
            lignes.append("TRANSP:OPAQUE")
            lignes.append("END:VEVENT")
    lignes.append("END:VCALENDAR")
    return "\r\n".join(plier(l) for l in lignes) + "\r\n"


def nom_fichier(nom):
    """Nom du fichier téléchargé, débarrassé des caractères interdits."""
    base = re.sub(r'[\\/:*?"<>|\r\n\t]+', " ", str(nom or "Horaire"))
    base = re.sub(r"\s+", " ", base).strip()[:60] or "Horaire"
    return "EzHoraire - " + base + ".ics"
