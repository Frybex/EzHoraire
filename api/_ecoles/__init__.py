"""Écoles prises en charge et petites aides HTTP communes aux points d'entrée.

Un fichier par école, à côté de celui-ci : heh.py, umons.py, condorcet.py,
helb.py, ulb.py, ucl.py. Chacun n'est qu'une configuration — l'adresse de
l'école, son nom, sa rentrée — posée sur un moteur de `_moteurs/`
(hyperplanning.py pour la HEH, l'UMONS, Condorcet et la HELB, timeedit.py
pour l'ULB). Une école sans moteur commun (ucl.py) écrit le sien dans son
propre fichier.

Ajouter une école : un module ici qui expose NOM, formations(), horaire()
et pdf_semaine() — recherche() en plus si sa liste de formations est trop
grosse à télécharger —, une ligne dans ECOLES ci-dessous, et une entrée
dans le tableau ECOLES de index.html.
"""
import json
import os
import sys
import threading
import time
from collections import deque
from urllib.parse import parse_qs, unquote_plus, urlparse

# api/ sur le chemin : les écoles y trouvent _moteurs/ quel que soit le
# point d'entrée qui les importe.
ICI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ICI not in sys.path:
    sys.path.insert(0, ICI)

from . import heh  # noqa: E402
from . import umons  # noqa: E402
from . import condorcet  # noqa: E402
from . import helb  # noqa: E402
from . import ulb  # noqa: E402

# L'UCLouvain est développé mais pas encore publié : il n'est exposé
# (proposé par l'app, accepté par recherche/horaires, listé dans
# /api/config) que si l'hébergeur pose EZH_UCL=1. serve.py le pose pour le
# développement ; sur Vercel, sans la variable, rien ne l'expose.
ECOLES = {
    "heh": heh,
    "umons": umons,
    "condorcet": condorcet,
    "helb": helb,
    "ulb": ulb,
}
if os.environ.get("EZH_UCL") == "1":
    from . import ucl  # noqa: E402

    ECOLES["ucl"] = ucl


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
# global par instance (SESSIONS_PAR_MINUTE dans _moteurs/hyperplanning.py), pas un
# remplacement : en serverless, chaque instance a son propre compteur.
_DEBIT_MAX = {
    "formations": (60, 60.0),  # liste légère : 60 / min / IP
    "horaires": (12, 60.0),    # ~50 appels école chacun : 12 / min / IP
    "pdf": (12, 60.0),         # session + génération : 12 / min / IP
    "recherche": (40, 60.0),   # recherche en direct (niveaux, cours) : 40 / min / IP
    "ical": (12, 60.0),        # lien d'abonnement personnel : 12 / min / IP
    # Un import cherche jusqu'à RECHERCHES_MAX (25) fois chez l'école :
    # 6 / min / IP le garde sous le fuse d'instance (400 appels / min),
    # même quand plusieurs imports tombent en même temps.
    "importer": (6, 60.0),
    # Un report de bug ne coûte rien à l'école, mais l'écriture est ouverte
    # aux anonymes : 10 / heure / IP suffit aux humains et calme les robots.
    "bugs": (10, 3600.0),
}
_DEBIT = {}  # (point d'entrée, ip) -> deque des horodatages (monotonic)
_DEBIT_VERROU = threading.Lock()


def _ip_client(h):
    """IP du client pour le quota, non falsifiable.

    Sur Vercel, `x-vercel-forwarded-for` (comme `x-real-ip`) est écrit par
    la plateforme à partir de la connexion TCP et écrase toute valeur fournie
    par le client : celui-ci ne peut pas choisir sa case. On ne lit que ces
    deux en-têtes Vercel — jamais `x-forwarded-for` seul, qu'un proxy au-dessus
    de Vercel peut réécrire — et on prend la DERNIÈRE adresse de la liste :
    c'est le dernier relais, forcément posé par la plateforme (une valeur
    inventée par le client resterait à gauche). En local (serve.py, qui refuse
    toute connexion non locale), l'IP de la connexion fait foi."""
    for nom in ("x-vercel-forwarded-for", "x-real-ip"):
        try:
            valeurs = h.headers.get(nom) or ""
        except Exception:  # noqa: BLE001 - en-tête absent ou illisible
            valeurs = ""
        ip = valeurs.split(",")[-1].strip()
        if ip:
            return ip
    try:
        return h.client_address[0]
    except Exception:  # noqa: BLE001
        return "?"


def debit(h, cle, erreur):
    """True si l'appel passe, sinon répond 429 et False.

    `erreur(statut, message)` répond dans le format du point d'entrée
    (même convention que `requete`). À appeler après `requete`, avant
    tout travail : seules les requêtes bien formées consomment le quota.
    L'IP est celle de `_ip_client` (en-têtes plateforme uniquement)."""
    limite, fenetre = _DEBIT_MAX[cle]
    ip = _ip_client(h)
    maintenant = time.monotonic()
    with _DEBIT_VERROU:
        file = _DEBIT.get((cle, ip))
        if file is None:
            file = _DEBIT[(cle, ip)] = deque()
        while file and maintenant - file[0] > fenetre:
            file.popleft()
        if len(file) >= limite:
            erreur(429, "Trop de demandes : réessaie dans une minute." if fenetre <= 60
                  else "Trop de demandes : réessaie plus tard.")
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
