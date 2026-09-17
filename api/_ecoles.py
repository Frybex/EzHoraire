"""Écoles prises en charge et petites aides HTTP communes aux points d'entrée.

Ajouter une école : un module (comme _heh.py ou _umons.py) qui expose NOM,
formations(), horaire() et pdf_semaine(), puis une ligne dans ECOLES.
"""
import json
import os
import sys
import threading
import time
from collections import deque
from urllib.parse import parse_qs, unquote_plus, urlparse

ICI = os.path.dirname(os.path.abspath(__file__))
if ICI not in sys.path:
    sys.path.insert(0, ICI)

import _heh  # noqa: E402
import _umons  # noqa: E402
import _ucl  # noqa: E402
import _ulb  # noqa: E402

ECOLES = {
    "heh": _heh,
    "umons": _umons,
    "ucl": _ucl,
    "ulb": _ulb,
}


def requete(h, ordre, erreur):
    """Paramètres d'une requête publique, ou None si une réponse est partie.

    Le cache partagé indexe l'adresse exacte : une variante (paramètre
    inconnu, en double, ou dans un autre ordre) passerait à côté et ferait
    travailler l'école. Inconnus et doublons sont refusés ; un ordre
    différent est redirigé (308) vers l'ordre de l'app. Les segments sont
    seulement réordonnés, jamais réencodés : pas de boucle possible si
    l'hébergeur retouche l'encodage.
    `erreur(statut, message)` répond dans le format du point d'entrée."""
    url = urlparse(h.path)
    q = parse_qs(url.query, keep_blank_values=True)
    inconnus = set(q) - set(ordre)
    if inconnus:
        erreur(400, "Paramètre inconnu : " + ", ".join(sorted(inconnus)) + ".")
        return None
    doubles = sorted(k for k, v in q.items() if len(v) > 1)
    if doubles:
        erreur(400, "Paramètre en double : " + ", ".join(doubles) + ".")
        return None
    segments = [s for s in url.query.split("&") if s]
    ranges = sorted(segments, key=lambda s: ordre.index(unquote_plus(s.split("=", 1)[0])))
    if ranges != segments:
        h.send_response(308)
        # « //hote/... » serait lu comme une autre origine : jamais de redirection externe.
        chemin = "/" + url.path.lstrip("/")
        h.send_header("Location", chemin + "?" + "&".join(ranges))
        h.send_header("Content-Length", "0")
        h.send_header("Cache-Control", "public, max-age=86400, s-maxage=86400")
        h.end_headers()
        return None
    return {k: v[0] for k, v in q.items()}


def repondre_json(h, statut, objet, cache="no-store"):
    payload = json.dumps(objet, ensure_ascii=False).encode("utf-8")
    h.send_response(statut)
    h.send_header("Content-Type", "application/json; charset=utf-8")
    h.send_header("Content-Length", str(len(payload)))
    h.send_header("Cache-Control", cache)
    h.end_headers()
    h.wfile.write(payload)


def repondre_texte(h, statut, message, cache="no-store"):
    payload = message.encode("utf-8")
    h.send_response(statut)
    h.send_header("Content-Type", "text/plain; charset=utf-8")
    h.send_header("Content-Length", str(len(payload)))
    h.send_header("Cache-Control", cache)
    h.end_headers()
    h.wfile.write(payload)


# Garde anti-balayage : un horaire complet coûte ~50 appels à l'école, un
# PDF une session entière. Le cache partagé absorbe les étudiants d'une
# même formation, mais pas quelqu'un qui balaie les 382 formations UMONS
# (chaque nom inédit = cache manqué = travail réel). On borne donc les
# appels par adresse IP et par point d'entrée. C'est un complément au fuse
# global par instance (SESSIONS_PAR_MINUTE dans _hyperplanning.py), pas un
# remplacement : en serverless, chaque instance a son propre compteur.
_DEBIT_MAX = {
    "formations": (60, 60.0),  # liste légère : 60 / min / IP
    "horaires": (12, 60.0),    # ~50 appels école chacun : 12 / min / IP
    "pdf": (12, 60.0),         # session + génération : 12 / min / IP
    "recherche": (60, 60.0),   # recherche en direct (niveaux, cours) : 60 / min / IP
    "ical": (12, 60.0),        # lien d'abonnement personnel : 12 / min / IP
}
_DEBIT = {}  # (point d'entrée, ip) -> deque des horodatages (monotonic)
_DEBIT_VERROU = threading.Lock()


def debit(h, cle, erreur):
    """True si l'appel passe, sinon répond 429 et False.

    `erreur(statut, message)` répond dans le format du point d'entrée
    (même convention que `requete`). À appeler après `requete`, avant
    tout travail : seules les requêtes bien formées consomment le quota.
    L'IP vient des en-têtes posés par l'hébergeur (Vercel les réécrit,
    le client ne peut pas les imposer), sinon de la connexion directe
    (serveur local, qui n'écoute que la machine)."""
    limite, fenetre = _DEBIT_MAX[cle]
    ip = ""
    try:
        for nom in ("X-Vercel-Forwarded-For", "X-Real-IP", "X-Forwarded-For"):
            ip = (h.headers.get(nom) or "").split(",")[0].strip()
            if ip:
                break
    except Exception:  # noqa: BLE001 - en-tête absent ou illisible
        ip = ""
    if not ip:
        try:
            ip = h.client_address[0]
        except Exception:  # noqa: BLE001
            ip = "?"
    maintenant = time.monotonic()
    with _DEBIT_VERROU:
        file = _DEBIT.get((cle, ip))
        if file is None:
            file = _DEBIT[(cle, ip)] = deque()
        while file and maintenant - file[0] > fenetre:
            file.popleft()
        if len(file) >= limite:
            erreur(429, "Trop de demandes : réessaie dans une minute.")
            return False
        file.append(maintenant)
        # Ménage occasionnel : le dictionnaire ne grossit pas sans borne
        # (une entrée par IP et par point d'entrée).
        if len(_DEBIT) > 5000:
            vieilles = [k for k, v in _DEBIT.items()
                        if not v or maintenant - v[-1] > fenetre]
            for k in vieilles:
                del _DEBIT[k]
    return True
