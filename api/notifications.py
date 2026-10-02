"""Notifications in-app — messagerie admin → étudiant (v1 : envoi seul,
les réponses repartent par email).

POST /api/notifications  (admin : même garde que /api/stats et /api/bugs)
  Corps JSON : {"user_ids": ["<uuid>", …], "titre": "…", "message": "…",
                "lien": ""}  — ou {"tous": true, ...} pour tous les comptes.
  - `titre` : 80 caractères max (vide accepté) ; `message` : 1 à 1000 ;
    `lien` : "" ou un chemin interne ("/…", 300 max — jamais une URL
    externe, pour ne pas faire de l'app un tremplin à hameçonnage).
  - `user_ids` : 1 à 200 destinataires ; `tous` : ventilé côté serveur
    (500 envois max par appel).
  - Débit : 10 / heure / IP (voir _ecoles.debit) : un appel peut déjà
    écrire des centaines de lignes.
  Réponse : {"ok": true, "data": {"envoyees": 12}}

GET /api/notifications?limite=100  (admin)
  L'historique des messages envoyés, plus récents d'abord (le dashboard
  connaît déjà les emails via /api/stats, pas besoin de jointure).
  Réponse : {"ok": true, "data": {"notifications": [...]}}

Lecture côté app : directe avec la clé anon (RLS « chacun ne voit que
SES lignes », marquage « lu » verrouillé par trigger) — voir
supabase/schema.sql. Aucune écriture publique : pas de politique INSERT.

Env : SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (+ alias),
  ADMIN_USER_IDS / ADMIN_EMAILS (comme stats.py).
"""
import json
import os
import re
import sys
from http.server import BaseHTTPRequestHandler
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

ICI = os.path.dirname(os.path.abspath(__file__))
if ICI not in sys.path:
    sys.path.insert(0, ICI)

from _ecoles import debit, repondre_json  # noqa: E402

CORPS_MAX = 64 * 1024
TITRE_MAX = 80
MESSAGE_MAX = 1000
LIEN_MAX = 300
DESTINATAIRES_MAX = 200
DIFFUSION_MAX = 500
_UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


def _env(*noms):
    for n in noms:
        v = (os.environ.get(n) or "").strip().strip('"').strip("'")
        if v:
            return v
    return ""


def _erreur(h, statut, message):
    repondre_json(h, statut, {"ok": False, "erreur": message})


def _cles():
    url = _env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")
    anon = _env("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY")
    service = _env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY",
                   "SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY")
    return url, anon, service


def _lire_corps(h, champs):
    try:
        annonce = int(h.headers.get("Content-Length") or 0)
    except ValueError:
        annonce = -1
    if annonce < 0:
        _erreur(h, 400, "Requête mal formée.")
        return None
    if annonce > CORPS_MAX:
        _erreur(h, 413, "Requête trop longue.")
        return None
    brut = h.rfile.read(min(annonce, CORPS_MAX)) if annonce else b""
    try:
        corps = json.loads(brut.decode("utf-8") or "{}")
    except (UnicodeDecodeError, ValueError):
        _erreur(h, 400, "Corps de requête illisible (JSON attendu).")
        return None
    if not isinstance(corps, dict):
        _erreur(h, 400, "Corps de requête illisible (objet JSON attendu).")
        return None
    inconnus = set(corps) - champs
    if inconnus:
        _erreur(h, 400, "Champ inconnu : " + ", ".join(sorted(inconnus)) + ".")
        return None
    return corps


def _get_json(url, entetes, timeout=20):
    req = Request(url, headers=entetes, method="GET")
    with urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8") or "null")


def _requete_json(methode, url, entetes, objet=None, timeout=20):
    corps = json.dumps(objet, ensure_ascii=False).encode("utf-8") if objet is not None else None
    req = Request(url, data=corps, headers=dict(entetes, **({"Content-Type": "application/json"} if corps else {})),
                  method=methode)
    with urlopen(req, timeout=timeout) as r:
        brut = r.read().decode("utf-8") or ("[]" if methode == "GET" else "null")
        return json.loads(brut)


def _est_admin(url, anon, h):
    """(admin, user_id, email) depuis le Bearer, comme stats.py / bugs.py."""
    admins = {e.strip().lower() for e in _env("ADMIN_EMAILS").split(",") if e.strip()}
    admins_ids = {i.strip().lower() for i in _env("ADMIN_USER_IDS").split(",") if i.strip()}
    if not admins and not admins_ids:
        return False, "", ""
    auth = h.headers.get("Authorization") or ""
    if not auth.lower().startswith("bearer "):
        return False, "", ""
    token = auth.split(" ", 1)[1].strip()
    if not token:
        return False, "", ""
    try:
        moi = _get_json(url.rstrip("/") + "/auth/v1/user",
                        {"apikey": anon, "Authorization": "Bearer " + token}, timeout=15)
    except Exception:  # noqa: BLE001 - session invalide
        return False, "", ""
    email = str((moi or {}).get("email") or "").lower()
    uid = str((moi or {}).get("id") or "").lower()
    meta = (moi or {}).get("app_metadata") or {}
    admin = (
        (bool(uid) and uid in admins_ids)
        or (meta.get("admin") in (True, "true"))
        or (bool(email) and email in admins)
    )
    return admin, uid, email


def _tous_les_comptes(base, h_svc):
    """Tous les user_id, page par page (plafond : DIFFUSION_MAX)."""
    ids, page = [], 1
    while len(ids) < DIFFUSION_MAX and page <= 20:
        rep = _get_json(
            base + "/auth/v1/admin/users?page=%d&per_page=200" % page, h_svc, timeout=20)
        batch = rep.get("users") if isinstance(rep, dict) else rep
        if not batch:
            break
        ids.extend([u.get("id") for u in batch if u.get("id")])
        if len(batch) < 200:
            break
        page += 1
    return ids[:DIFFUSION_MAX]


class handler(BaseHTTPRequestHandler):
    # ---- POST admin : envoyer un message ----
    def do_POST(self):
        if urlparse(self.path).query:
            return _erreur(self, 400, "Paramètre inattendu.")
        if not debit(self, "notifications", _erreur):
            return
        corps = _lire_corps(self, {"user_ids", "tous", "titre", "message", "lien"})
        if corps is None:
            return
        url, anon, service = _cles()
        if not url or not anon or not service:
            return _erreur(self, 500, "Messagerie non configurée (clés Supabase manquantes).")
        admin, _, _ = _est_admin(url, anon, self)
        if not admin:
            auth = self.headers.get("Authorization") or ""
            if not auth.lower().startswith("bearer "):
                return _erreur(self, 401, "Connecte-toi d'abord.")
            return _erreur(self, 403, "Accès réservé.")

        titre = " ".join(str(corps.get("titre") or "").split())[:TITRE_MAX]
        message = " ".join(str(corps.get("message") or "").split())
        lien = str(corps.get("lien") or "").strip()[:LIEN_MAX]
        if len(message) < 1:
            return _erreur(self, 400, "Le message ne peut pas être vide.")
        if len(message) > MESSAGE_MAX:
            return _erreur(self, 400, "Message trop long (1000 caractères max).")
        if lien and not re.match(r"^/[^ ]*$", lien):
            return _erreur(self, 400, "Le lien doit être un chemin interne (« /… »).")

        base = url.rstrip("/")
        h_svc = {"apikey": service, "Authorization": "Bearer " + service}
        try:
            if corps.get("tous") is True:
                ids = _tous_les_comptes(base, dict(h_svc, Accept="application/json"))
            else:
                bruts = corps.get("user_ids")
                if not isinstance(bruts, list) or not 1 <= len(bruts) <= DESTINATAIRES_MAX:
                    return _erreur(self, 400,
                        "Choisis 1 à %d destinataires (ou « tous »)." % DESTINATAIRES_MAX)
                vus, ids = set(), []
                for b in bruts:
                    u = str(b or "").strip().lower()
                    if not _UUID.match(u) or u in vus:
                        if not _UUID.match(u):
                            return _erreur(self, 400, "Destinataire invalide.")
                        continue
                    vus.add(u)
                    ids.append(u)
            if not ids:
                return _erreur(self, 400, "Aucun destinataire.")
            lignes = [{"user_id": u, "titre": titre, "message": message, "lien": lien}
                      for u in ids]
            _requete_json("POST", base + "/rest/v1/notifications", dict(
                h_svc, Prefer="return=minimal"), lignes, timeout=30)
        except HTTPError as e:
            if e.code == 404:
                return _erreur(self, 502, "Table introuvable : recolle supabase/schema.sql dans le SQL Editor.")
            return _erreur(self, 502, "Supabase injoignable (erreur %s)." % e.code)
        except Exception as e:  # noqa: BLE001 - imprévu : journal, message générique
            print("notifications : envoi refusé %r" % (e,), file=sys.stderr)
            return _erreur(self, 502, "Supabase injoignable. Réessaie dans un instant.")
        return repondre_json(self, 200, {"ok": True, "data": {"envoyees": len(ids)}})

    # ---- GET admin : historique des envois ----
    def do_GET(self):
        q = parse_qs(urlparse(self.path).query)
        inconnus = set(q) - {"limite"}
        if inconnus:
            return _erreur(self, 400, "Paramètre inconnu : " + ", ".join(sorted(inconnus)) + ".")
        url, anon, service = _cles()
        if not url or not anon or not service:
            return _erreur(self, 500, "Messagerie non configurée (clés Supabase manquantes).")
        admin, _, _ = _est_admin(url, anon, self)
        if not admin:
            auth = self.headers.get("Authorization") or ""
            if not auth.lower().startswith("bearer "):
                return _erreur(self, 401, "Connecte-toi d'abord.")
            return _erreur(self, 403, "Accès réservé.")
        try:
            limite = max(1, min(300, int((q.get("limite") or ["100"])[0])))
        except ValueError:
            limite = 100
        try:
            lignes = _requete_json(
                "GET", url.rstrip("/") + "/rest/v1/notifications"
                "?select=id,created_at,user_id,titre,message,lien,lu_at"
                "&order=created_at.desc&limit=%d" % limite,
                {"apikey": service, "Authorization": "Bearer " + service,
                 "Accept": "application/json"}, None, timeout=20) or []
        except HTTPError as e:
            if e.code == 404:
                return _erreur(self, 502, "Table introuvable : recolle supabase/schema.sql dans le SQL Editor.")
            return _erreur(self, 502, "Supabase injoignable (erreur %s)." % e.code)
        except Exception as e:  # noqa: BLE001 - imprévu : journal, message générique
            print("notifications : lecture refusée %r" % (e,), file=sys.stderr)
            return _erreur(self, 502, "Supabase injoignable. Réessaie dans un instant.")
        notifs = [{
            "id": n.get("id"), "created_at": n.get("created_at") or "",
            "user_id": n.get("user_id") or "", "titre": n.get("titre") or "",
            "message": n.get("message") or "", "lien": n.get("lien") or "",
            "lu_at": n.get("lu_at") or "",
        } for n in lignes if isinstance(n, dict)]
        return repondre_json(self, 200, {"ok": True, "data": {"notifications": notifs}})

    def log_message(self, *args):
        pass  # silencieux
