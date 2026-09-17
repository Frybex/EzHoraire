"""Lien d'abonnement iCal (TimeEdit ou Mon horaire UCLouvain) -> même format.

L'étudiant colle le lien que son école lui donne (« S'abonner » dans
TimeEdit, « Exporter → Lien d'abonnement » dans Mon horaire UCLouvain) :
il contient sa sélection personnelle et vaut sans mot de passe. On ne
stocke que le lien (côté compte, jamais dans l'URL publique) et on lit le
flux à la demande.

Le garde-fou SSRF n'accepte que les hôtes connus (TimeEdit et Mon
horaire) : ce point d'entrée fait une requête réseau à partir d'une
adresse fournie par l'utilisateur.
"""
import os
import re
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

import requests

from .hyperplanning import format_ensemble, maintenant, tri_naturel

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
TIMEOUT = 20
TAILLE_MAX = 2 * 1024 * 1024  # 2 Mo : un quadrimestre entier tient largement

HOTES = (".timeedit.net", ".timeedit.com")
HOTE_MONHORAIRE = "monhoraire.uclouvain.be"


def _monhoraire_ouvert():
    """Mon horaire (UCLouvain) n'est lu que si l'école est exposée.

    L'UCLouvain est codée mais pas publiée (EZH_UCL, voir _ecoles/) : sans
    la variable, ce point d'entrée ne doit pas non plus aller la chercher
    par la porte du lien d'abonnement."""
    return os.environ.get("EZH_UCL") == "1"
RX_UE = re.compile(r"^[A-Z]{2,6}[0-9]{2,4}$")
RX_GROUPE = re.compile(
    r"^[A-Z][A-Z0-9-]{1,12}\s*[:(-]"                       # B-DROIB:2, M-CRIMS:1 - PAD5
    r"|groupe|gr\.|s[ée]rie|pad\d|mineure|module|option", re.I)


def _fuseau():
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo("Europe/Brussels")
    except Exception:  # noqa: BLE001 - sans base de fuseaux (tzdata)
        return timezone(timedelta(hours=2))


def url_autorisee(lien):
    """https:// (ou webcal://) sur un hôte connu, terminé par « .ics ».

    Deux familles : TimeEdit (« S'abonner ») et Mon horaire UCLouvain
    (« Exporter → Lien d'abonnement »). Le copier-coller ajoute parfois
    des espaces ou perd le « s » final (le serveur répond alors 404) : on
    recoud la bonne adresse plutôt que d'échouer sur une virgule de trop."""
    lien = "".join(str(lien or "").split()).strip('"').strip("'").replace("&amp;", "&")
    if lien.startswith("webcal://"):
        lien = "https://" + lien[len("webcal://"):]
    if lien.startswith("webcals://"):
        lien = "https://" + lien[len("webcals://"):]
    u = urlparse(lien)
    hote = (u.hostname or "").lower()
    if hote == HOTE_MONHORAIRE and _monhoraire_ouvert():
        return _url_monhoraire(u)
    if u.scheme != "https" or not any(hote.endswith(h) for h in HOTES):
        # Le message ne cite une école que si elle est publiée : sinon il
        # annoncerait l'existence d'une école qu'on ne veut pas montrer.
        ou = (" ou « Exporter → Lien d'abonnement » (Mon horaire UCLouvain)"
              if _monhoraire_ouvert() else "")
        raise ValueError("Ce lien n'est pas un lien d'abonnement reconnu. "
                         "Copie-le depuis « S'abonner » (TimeEdit)" + ou + ".")
    chemin = u.path
    if not chemin.lower().endswith(".ics"):
        chemin = chemin + "s" if chemin.lower().endswith(".ic") else chemin + ".ics"
        u = u._replace(path=chemin)
    return urlunparse(u)


def _url_monhoraire(u):
    """Lien Mon horaire (UCLouvain) -> flux iCal de la sélection.

    Les deux liens de l'export portent le même code : « Lien de partage »
    (/calendar/share?link=…) ouvre la vue, « Lien d'abonnement »
    (/calendar/schedule?link=…) rend le .ics — c'est celui-ci qu'on lit,
    en recollant l'adresse depuis le code reçu."""
    chemin = u.path.rstrip("/")
    if chemin not in ("/calendar/schedule", "/calendar/share"):
        raise ValueError("Ce lien Mon horaire (UCLouvain) n'est pas un lien d'abonnement. "
                         "Ouvre « Exporter → Lien d'abonnement » sur monhoraire.uclouvain.be "
                         "et copie le lien en entier.")
    code = (parse_qs(u.query).get("link") or [""])[0].strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{10,200}", code):
        raise ValueError("Ce lien Mon horaire ne contient pas de code d'abonnement "
                         "(« link=… »). Recopie-le depuis « Exporter ».")
    return urlunparse(("https", HOTE_MONHORAIRE, "/calendar/schedule", "",
                       urlencode({"link": code}), ""))


def _deplier(texte):
    """Lignes iCalendar, lignes de continuation recollées (RFC 5545)."""
    lignes = []
    for brute in texte.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if brute[:1] in (" ", "\t") and lignes:
            lignes[-1] += brute[1:]
        else:
            lignes.append(brute)
    return lignes


def _texte(valeur):
    """Dé-échappement des valeurs iCalendar (virgules, retours, etc.)."""
    out, i = [], 0
    while i < len(valeur):
        c = valeur[i]
        if c == "\\" and i + 1 < len(valeur):
            suivant = valeur[i + 1]
            out.append({"n": "\n", "N": "\n", ",": ",", ";": ";", "\\": "\\"}.get(suivant, suivant))
            i += 2
        else:
            out.append(c)
            i += 1
    return "".join(out)


def _moment(valeur, fuseau):
    """'20260928T100000Z' -> (date, '10:00') ; '20261101' -> (date, None)."""
    m = re.fullmatch(r"(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?", str(valeur).strip())
    if not m:
        return None
    a, mo, j, h, mi, s, z = m.groups()
    if h is None:
        return datetime(int(a), int(mo), int(j)).date(), None
    quand = datetime(int(a), int(mo), int(j), int(h), int(mi), int(s),
                     tzinfo=timezone.utc if z else fuseau)
    if z:
        quand = quand.astimezone(fuseau)
    return quand.date(), quand.strftime("%H:%M")


def _heure(texte):
    m = re.fullmatch(r"(\d{1,2}):(\d{2})", str(texte or ""))
    return f"{int(m.group(1)):02d}h{m.group(2)}" if m else ""


def _analyse_resume(resume, description):
    """(matière, type, profs, groupes) depuis un résumé TimeEdit.

    Format observé : « DROIC2007, Théorie, Enseignant: ROMAIN Jean-François,
    B-DROIB:2 ». D'autres calendriers n'ont qu'un titre : on le garde tel quel
    et on ne devine ni type ni groupe."""
    parties = [p.strip() for p in str(resume or "").split(", ") if p.strip()]
    codes, i = [], 0
    while i < len(parties) and RX_UE.match(parties[i]):
        codes.append(parties[i])
        i += 1
    if not codes:
        titre = _texte(description or "").split("\n")[0].strip()
        return (parties[0] if parties else titre) or "Cours", "", "", []
    typ = ""
    if i < len(parties) and not parties[i].lower().startswith("enseignant:") and not RX_GROUPE.search(parties[i]):
        typ = parties[i]
        i += 1
    profs, groupes = "", []
    for p in parties[i:]:
        bas = p.lower()
        if bas.startswith("enseignant:"):
            profs = p.split(":", 1)[1].strip()
        elif RX_GROUPE.search(p):
            groupes.append(p)
    if not profs:
        for ligne in _texte(description or "").split("\n"):
            if ligne.lower().startswith("enseignant:"):
                profs = ligne.split(":", 1)[1].strip()
                break
    return ", ".join(codes), typ, profs, groupes


REDIRECTIONS_MAX = 4


def _hote_autorise(lien):
    """`lien` s'il est en https sur un hôte connu, sinon ValueError."""
    u = urlparse(lien)
    hote = (u.hostname or "").lower()
    connu = any(hote.endswith(h) for h in HOTES) or (
        hote == HOTE_MONHORAIRE and _monhoraire_ouvert())
    if u.scheme != "https" or not connu:
        raise ValueError("Ce lien redirige hors de l'école : recopie-le "
                         "depuis « S'abonner ».")
    return lien


def _lire(lien, timeout):
    """GET en suivant les redirections À LA MAIN, une par une.

    `url_autorisee` ne vérifie que l'adresse de départ : avec le suivi
    automatique, un hôte autorisé qui renvoie un « Location: » vers une
    adresse interne ferait faire à notre serveur une requête qu'un client
    ne peut pas faire lui-même (SSRF). Chaque saut repasse donc par le même
    contrôle d'hôte."""
    entetes = {"User-Agent": UA, "Accept": "text/calendar,*/*"}
    for _ in range(REDIRECTIONS_MAX + 1):
        r = requests.get(lien, headers=entetes, timeout=timeout, allow_redirects=False)
        if r.status_code not in (301, 302, 303, 307, 308):
            r.raise_for_status()
            return r
        suite = r.headers.get("Location") or ""
        if not suite:
            r.raise_for_status()
            return r
        # Une redirection relative reste sur le même hôte, déjà autorisé ;
        # une absolue doit repasser le contrôle d'hôte. Pas `url_autorisee`
        # ici : sa réparation du « .ics » abîmerait une adresse de
        # redirection légitime (« /telecharger?x=1 »).
        lien = _hote_autorise(urljoin(lien, suite))
    raise ValueError("Ce lien renvoie en boucle : recopie-le depuis « S'abonner ».")


def horaire_ical(lien, budget=30):
    """Flux iCal -> {meta, formation, groupes, cours} (format des écoles)."""
    lien = url_autorisee(lien)
    try:
        r = _lire(lien, timeout=min(TIMEOUT, max(5, budget)))
    except requests.RequestException as e:
        raise ValueError("Ce lien ne répond pas (expiré, révoqué ou réservé à ton compte) : "
                         "recopie-le depuis « S'abonner ».") from e
    texte = r.content[:TAILLE_MAX].decode("utf-8", "replace")
    if "BEGIN:VCALENDAR" not in texte:
        raise ValueError("Ce lien ne renvoie pas un calendrier iCalendar.")

    fuseau = _fuseau()
    evenements, bloc = [], None
    for ligne in _deplier(texte):
        if ligne == "BEGIN:VEVENT":
            bloc = {}
            continue
        if ligne == "END:VEVENT":
            if bloc is not None and bloc.get("debut") is not None:
                evenements.append(bloc)
            bloc = None
            continue
        if bloc is None or ":" not in ligne:
            continue
        nom, valeur = ligne.split(":", 1)
        nom = nom.split(";", 1)[0].upper()
        if nom in ("DTSTART", "DTEND"):
            quand = _moment(valeur, fuseau)
            if quand:
                bloc["debut" if nom == "DTSTART" else "fin"] = quand
        elif nom == "SUMMARY":
            bloc["summary"] = _texte(valeur)
        elif nom == "LOCATION":
            bloc["location"] = _texte(valeur)
        elif nom == "DESCRIPTION":
            bloc["description"] = _texte(valeur)

    cours_bruts = [e for e in evenements if e["debut"][1]]
    if not cours_bruts:
        raise ValueError("Le lien répond, mais son calendrier est vide. Ouvre-le dans une "
                         "fenêtre privée : s'il est vide là aussi, régénère-le connecté "
                         "(Mon horaire → « S'abonner » → toute la durée affichée).")
    lundi0 = min(e["debut"][0] for e in cours_bruts) - timedelta(
        days=min(e["debut"][0] for e in cours_bruts).weekday())

    cours, feries, noms_feries, semaines = {}, set(), {}, set()
    for e in evenements:
        date, heure = e["debut"]
        if heure is None:  # journée entière : congé
            n = (date - lundi0).days + 1
            if n > 0:
                feries.add(n)
                # TimeEdit préfixe le nom du congé par « Info: » dans le résumé.
                nom = re.sub(r"^\s*info\s*:\s*", "", str(e.get("summary") or ""), flags=re.I).strip()
                if nom and n not in noms_feries:
                    noms_feries[n] = nom
            continue
        sem = (date - lundi0).days // 7 + 1
        if sem < 1:
            continue
        fin_date, fin_heure = e.get("fin") or (date, heure)
        fin = _heure(fin_heure) if fin_date == date else "24h00"
        if not fin or fin == "00h00":
            fin = _heure(heure)
        matiere, typ, profs, groupes = _analyse_resume(e.get("summary"), e.get("description"))
        salles = " ".join(str(e.get("location") or "").split())
        cle = (date.weekday(), _heure(heure), fin, matiere, profs, salles, typ,
               tuple(sorted(set(groupes), key=tri_naturel)))
        ligne = cours.get(cle)
        if ligne is None:
            cours[cle] = {"jour": cle[0], "debut": cle[1], "fin": cle[2],
                          "matiere": matiere, "profs": profs, "salles": salles,
                          "type": typ, "couleur": "#888888",
                          "groupes": list(cle[7]), "semaines": [sem]}
        elif sem not in ligne["semaines"]:
            ligne["semaines"].append(sem)
        semaines.add(sem)

    liste = sorted(cours.values(), key=lambda c: (min(c["semaines"]), c["jour"], c["debut"]))
    for c in liste:
        c["semaines"].sort()
    maj = maintenant()
    source = ("Lien d'abonnement Mon horaire (UCLouvain)"
              if urlparse(lien).hostname == HOTE_MONHORAIRE
              else "Lien d'abonnement TimeEdit (iCal)")
    return {
        "meta": {
            "fetched_at": maj.strftime("%d/%m/%Y à %Hh%M"),
            "ts": int(maj.timestamp() * 1000),
            "premier_lundi": lundi0.isoformat(),
            "periode": format_ensemble(list(range(1, max(semaines) + 1))),
            "feries": format_ensemble(sorted(feries)),
            "feries_noms": {str(k): v for k, v in noms_feries.items()},
            "source": source,
        },
        "formation": "",
        "groupes": sorted({g for c in liste for g in c["groupes"]}, key=tri_naturel),
        "cours": liste,
    }
