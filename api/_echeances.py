"""Échéances perso (devoirs, examens) pour le flux d'abonnement.

Le flux .ics ne contient que les cours de l'école ; les devoirs et les
examens vivent dans Supabase (public.echeances), une ligne par échéance
et par profil. Le jeton d'abonnement v2 porte le user_id (« a ») : ici on
le vérifie auprès de Supabase (GET /auth/v1/user, clé anonyme), puis on
lit les lignes avec la clé service — elle ne sort jamais du serveur.

- cles() : (url, anon, service) depuis l'environnement, mêmes noms que
  notifications.py (serve.py lit .env.local en développement, Vercel les
  variables du projet en production).
- utilisateur(url, anon, bearer) : user_id du porteur du JWT, "" s'il est
  absent ou refusé ; lève pour le reste (réseau, 5xx).
- lire(url, service, user_id, profil_id, matiere="") : liste normalisée
  [{id, type, titre, date, heure}, …], filtrée sur user_id + profil_id
  (et, si `matiere` est donnée, sur la matière du cours de l'échéance —
  clé « jour|debut|matiere » des abonnements « cours par cours »).

Aucune dépendance hors bibliothèque standard : ce module est importé par
la fonction serverless comme par serve.py.
"""
import json
import os
import re
import sys
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

ICI = os.path.dirname(os.path.abspath(__file__))
if ICI not in sys.path:
    sys.path.insert(0, ICI)

from _ecoles import entetes_service  # noqa: E402

LIMITE = 500  # même plafond que limiter_echeances() (supabase/schema.sql)
RX_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
RX_HEURE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def _env(*noms):
    for n in noms:
        v = (os.environ.get(n) or "").strip().strip('"').strip("'")
        if v:
            return v
    return ""


def cles():
    """(url, anon, service) Supabase, "" si la variable est absente.

    La clé service (contournement RLS) ne part que d'ici vers Supabase :
    jamais dans une réponse, jamais dans le jeton d'abonnement."""
    return (
        _env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
        _env("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
        _env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY",
             "SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"),
    )


def _get_json(url, entetes, timeout=15):
    req = Request(url, headers=entetes, method="GET")
    with urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8") or "null")


def utilisateur(url, anon, bearer):
    """user_id (uuid) du porteur d'un jeton Supabase, vérifié par Supabase.

    "" si le jeton est absent, expiré ou refusé (401/403). Toute autre
    panne (réseau, 5xx) remonte : l'appelant répond « Supabase
    injoignable » au lieu de fabriquer un lien sans échéances."""
    jeton = str(bearer or "").strip()
    if not url or not anon or not jeton:
        return ""
    entetes = {"apikey": anon, "Authorization": "Bearer " + jeton}
    try:
        moi = _get_json(url.rstrip("/") + "/auth/v1/user", entetes, timeout=10)
    except HTTPError as e:
        if e.code in (401, 403):
            return ""
        raise
    return str((moi or {}).get("id") or "").strip()


def _normaliser(ligne):
    """Ligne PostgREST -> échéance nettoyée, ou None si illisible.

    Mêmes règles que echeancePropre() de app.js : id et titre requis,
    date ISO, heure « HH:MM » sinon vide (l'échéance devient une journée
    entière). L'id est débarrassé de tout espace : il finit dans un UID
    iCalendar, où un saut de ligne injecté casserait le flux."""
    if not isinstance(ligne, dict):
        return None
    id_ = re.sub(r"\s+", "", str(ligne.get("id") or ""))[:120]
    titre = " ".join(str(ligne.get("titre") or "").split())[:200]
    date = str(ligne.get("date") or "").strip()
    if not id_ or not titre or not RX_DATE.fullmatch(date):
        return None
    heure = str(ligne.get("heure") or "").strip()
    if heure and not RX_HEURE.fullmatch(heure):
        heure = ""
    return {
        "id": id_,
        "type": "examen" if ligne.get("type") == "examen" else "devoir",
        "titre": titre,
        "date": date,
        "heure": heure,
        "cle": str(ligne.get("cle") or ""),
    }


def _matiere(cle):
    """Matière portée par la clé « jour|debut|matière », ou "" (jour sans
    cours : « jour|| »)."""
    morceaux = str(cle or "").split("|", 2)
    return morceaux[2] if len(morceaux) == 3 else ""


def lire(url, service, user_id, profil_id, matiere=""):
    """Échéances d'un profil : [{id, type, titre, date, heure}, …].

    Lecture avec la clé service, filtrée sur user_id + profil_id : la RLS
    de la table ne s'applique pas, le filtre est donc explicite ici.
    `matiere` non vide : ne garder que les échéances d'un cours, pour les
    abonnements « cours par cours ». Lève si Supabase ne répond pas
    correctement : l'appelant répond 502 plutôt que de servir un flux
    amputé de ses devoirs."""
    user_id = str(user_id or "").strip()
    profil_id = str(profil_id or "").strip()
    if not user_id or not profil_id:
        return []
    requete = (url.rstrip("/") + "/rest/v1/echeances"
               "?select=id,type,titre,date,heure,cle"
               "&user_id=eq." + quote(user_id, safe="")
               + "&profil_id=eq." + quote(profil_id, safe="")
               + "&order=date.asc,heure.asc,id.asc&limit=%d" % LIMITE)
    lignes = _get_json(requete, dict(entetes_service(service),
                                     Accept="application/json"))
    if not isinstance(lignes, list):
        raise ValueError("réponse Supabase inattendue")
    out = []
    for ligne in lignes:
        e = _normaliser(ligne)
        if e is None:
            continue
        if matiere and _matiere(e["cle"]) != str(matiere):
            continue
        out.append({k: e[k] for k in ("id", "type", "titre", "date", "heure")})
    # Tri stable (date, heure, id) : l'ETag et le flux ne dépendent pas de
    # l'ordre de la réponse PostgREST.
    out.sort(key=lambda e: (e["date"], e["heure"], e["id"]))
    return out
