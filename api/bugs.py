"""Bugs & demandes — reports de l'app et du dashboard admin.

POST /api/bugs  (public, anonymes acceptés)
  Corps JSON : {"titre": "…", "message": "…", "etape": "v-formation", "type": "bug",
                "email": "", "contexte": {...}, "image_urls": ["uuid.jpg"],
                "site_web": ""}
  - `type` : "bug" (défaut, pour les anciens clients) ou "demande".
  - `titre` : résumé court (80 caractères), rangé dans `contexte.titre`
    (pas de migration). Les anciens clients n'en envoient pas : le
    dashboard reprend alors le début du message.
  - `site_web` est le piège à robots (comme #site-web dans index.html) :
    rempli = poubelle silencieuse (réponse OK factice, rien en base).
  - Débit : 10 / heure / IP (voir _ecoles.debit).
  - Si le navigateur joint son access_token Supabase, l'identité est
    vérifiée via /auth/v1/user et user_id/email sont repris du compte —
    jamais crus sur parole.
  - Les images sont téléversées AVANT, en direct vers le bucket privé
    `bug-images` (clé anon, chemins imprévisibles) ; ici on ne garde que
    leurs chemins, validés un par un.
  Réponse : {"ok": true, "data": {"id": 12}}

GET /api/bugs  (admin : même garde que /api/stats)
  ?statut=nouveau&limite=100 — les reports, plus récents d'abord, avec
  pour chaque image une URL signée (1 h) prête à afficher.
  Réponse : {"ok": true, "data": {"bugs": [...]}}

PATCH /api/bugs?id=12  (admin)
  Corps JSON : {"statut": "en_cours"} — nouveau | en_cours | corrige.
  Réponse : {"ok": true}

Env : SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (+ alias),
  ADMIN_USER_IDS / ADMIN_EMAILS (comme stats.py).
  Notif email (optionnelle, best-effort) : RESEND_API_KEY + BUGS_NOTIFY_TO
  (adresse perso de l'admin), BUGS_NOTIFY_FROM (optionnel, défaut
  "EzHoraire <contact@ezhoraire.be>" — doit appartenir à un domaine
  vérifié chez Resend). Sans ces variables, aucun mail ne part mais
  le report est quand même enregistré.
"""
import html
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

CORPS_MAX = 32 * 1024
MESSAGE_MAX = 5000
TITRE_MAX = 80
ETAPES = {"v-compte", "v-identite", "v-ecole", "v-formation",
          "v-groupes", "v-horaire", "dashboard", ""}
TYPES = ("bug", "demande")
STATUTS = ("nouveau", "en_cours", "corrige")
# Même forme que la politique du bucket (supabase/schema.sql) : uuid.jpg.
_CHEMIN_IMG = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$")
_UUID = re.compile(r"^[0-9a-fA-F-]{8,64}$")


def _env(*noms):
    for n in noms:
        v = (os.environ.get(n) or "").strip().strip('"').strip("'")
        if v:
            return v
    return ""


def _erreur(h, statut, message):
    repondre_json(h, statut, {"ok": False, "erreur": message})


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


def _get_json(url, entetes, timeout=15):
    req = Request(url, headers=entetes, method="GET")
    with urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8") or "null")


def _requete_json(methode, url, entetes, objet=None, timeout=20):
    corps = json.dumps(objet or {}, ensure_ascii=False).encode("utf-8") if objet is not None else None
    req = Request(url, data=corps, headers=dict(entetes, **({"Content-Type": "application/json"} if corps else {})),
                  method=methode)
    with urlopen(req, timeout=timeout) as r:
        brut = r.read().decode("utf-8") or ("[]" if methode == "GET" else "null")
        return json.loads(brut)


def _cles():
    url = _env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")
    anon = _env("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY")
    service = _env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY",
                   "SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY")
    return url, anon, service


def _est_admin(url, anon, h):
    """(admin, user_id, email) depuis le Bearer, comme stats.py."""
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


def _identite_optionnelle(url, anon, h):
    """user_id/email vérifiés si un Bearer valide est joint, sinon ("","")."""
    auth = h.headers.get("Authorization") or ""
    if not auth.lower().startswith("bearer "):
        return "", ""
    token = auth.split(" ", 1)[1].strip()
    if not token:
        return "", ""
    try:
        moi = _get_json(url.rstrip("/") + "/auth/v1/user",
                        {"apikey": anon, "Authorization": "Bearer " + token}, timeout=15)
    except Exception:  # noqa: BLE001 - anonyme, tant pis
        return "", ""
    return str((moi or {}).get("id") or ""), str((moi or {}).get("email") or "")


def _signer(base, service, chemin):
    """URL signée (1 h) pour une image du bucket privé, "" si échec."""
    try:
        rep = _requete_json("POST", base + "/storage/v1/object/sign/bug-images/" + chemin,
                            {"apikey": service, "Authorization": "Bearer " + service},
                            {"expiresIn": 3600}, timeout=15)
        signe = (rep or {}).get("signedURL") or ""
        # Supabase renvoie un chemin relatif à /storage/v1 ("/object/sign/…").
        if signe.startswith("/storage/v1/"):
            return base + signe
        return base + "/storage/v1" + signe if signe.startswith("/") else signe
    except Exception:  # noqa: BLE001 - une image illisible ne bloque pas la liste
        return ""


def _notifier_resend(typ, bug_id, titre, message, etape, email, user_id, contexte, nb_images):
    """Prévient l'admin par email via Resend. Best-effort : le report est
    déjà en base et l'utilisateur a déjà sa réponse OK, un échec ne doit
    donc jamais remonter — mais il est journalisé (stderr, visible dans
    les logs Vercel) pour pouvoir diagnostiquer une notif qui ne part
    pas."""
    cle = _env("RESEND_API_KEY")
    destinataire = _env("BUGS_NOTIFY_TO")
    if not cle or not destinataire:
        print("Resend : notif bug #%s ignorée — RESEND_API_KEY ou BUGS_NOTIFY_TO "
              "absente de l'environnement." % bug_id, file=sys.stderr)
        return
    expediteur = _env("BUGS_NOTIFY_FROM") or "EzHoraire <contact@ezhoraire.be>"
    libelle = "Demande" if typ == "demande" else "Bug"
    accroche = titre or (message[:60] + ("…" if len(message) > 60 else ""))
    sujet = "[%s #%d] %s" % (libelle, bug_id, accroche)
    lignes = [
        "Nouveau signalement %s #%d" % (libelle.lower(), bug_id),
        "",
        "Titre : %s" % (titre or "—"),
        "Étape : %s" % (etape or "—"),
        "Email déclarant : %s" % (email or "—"),
        "Compte : %s" % (user_id or "anonyme"),
        "Images : %d" % nb_images,
        "",
        message,
    ]
    try:
        ctx_txt = json.dumps(contexte, ensure_ascii=False, indent=2)[:2000]
    except (TypeError, ValueError):
        ctx_txt = "{}"
    lignes += ["", "Contexte : " + ctx_txt,
               "", "Voir : https://www.ezhoraire.be/dashboard.html"]
    texte = "\n".join(lignes)
    corps_html = (
        "<h2>Nouveau signalement %s #%d</h2>"
        "<p><strong>%s</strong></p>"
        "<ul><li>Étape : %s</li><li>Email : %s</li>"
        "<li>Compte : %s</li><li>Images : %d</li></ul>"
        "<p>%s</p>"
        "<pre>%s</pre>"
        '<p><a href="https://www.ezhoraire.be/dashboard.html">Ouvrir le dashboard</a></p>'
    ) % (html.escape(libelle.lower()), bug_id, html.escape(accroche),
         html.escape(etape or "—"), html.escape(email or "—"),
         html.escape(user_id or "anonyme"), nb_images,
         html.escape(message).replace("\n", "<br>"),
         html.escape(ctx_txt))
    try:
        # Cloudflare (devant api.resend.com) refuse le User-Agent par défaut
        # d'urllib avec un 403 « error code: 1010 » : d'où cet en-tête.
        rep = _requete_json("POST", "https://api.resend.com/emails",
                            {"Authorization": "Bearer " + cle,
                             "User-Agent": "EzHoraire/1.0 (+https://www.ezhoraire.be)"},
                            {"from": expediteur, "to": [destinataire],
                             "subject": sujet, "text": texte, "html": corps_html},
                            timeout=10)
        identifiant = (rep or {}).get("id") or "?"
        print(("Resend : notif bug #%s envoyée à %s (id %s)."
               % (bug_id, destinataire, identifiant))[:400], file=sys.stderr)
    except HTTPError as e:
        try:
            detail = e.read().decode("utf-8", "replace")
        except Exception:  # noqa: BLE001
            detail = ""
        print(("Resend : notif bug #%s refusée — HTTP %s %s"
               % (bug_id, e.code, detail))[:700], file=sys.stderr)
    except Exception as e:  # noqa: BLE001 - un mail raté ne doit jamais faire échouer le report
        print(("Resend : notif bug #%s en échec — %s: %s"
               % (bug_id, type(e).__name__, e))[:700], file=sys.stderr)


class handler(BaseHTTPRequestHandler):
    # ---- POST public : déposer un report ----
    def do_POST(self):
        if urlparse(self.path).query:
            return _erreur(self, 400, "Paramètre inattendu.")
        if not debit(self, "bugs", _erreur):
            return
        corps = _lire_corps(self, {"titre", "message", "etape", "type", "email", "contexte",
                                   "image_urls", "site_web"})
        if corps is None:
            return
        # Piège à robots : réponse OK factice, rien en base.
        if str(corps.get("site_web") or "").strip():
            return repondre_json(self, 200, {"ok": True, "data": {"id": 0}})

        message = " ".join(str(corps.get("message") or "").split())
        titre = " ".join(str(corps.get("titre") or "").split())
        etape = str(corps.get("etape") or "")[:40]
        typ = str(corps.get("type") or "bug").strip().lower() or "bug"
        email = str(corps.get("email") or "").strip()[:320]
        contexte = corps.get("contexte") if isinstance(corps.get("contexte"), dict) else {}
        images = corps.get("image_urls") if isinstance(corps.get("image_urls"), list) else []

        if len(message) < 3:
            if typ == "demande":
                return _erreur(self, 400, "Décris ta demande en quelques mots.")
            return _erreur(self, 400, "Décris le bug en quelques mots.")
        if len(message) > MESSAGE_MAX:
            return _erreur(self, 400, "Message trop long (5000 caractères max).")
        if etape not in ETAPES:
            return _erreur(self, 400, "Étape inconnue.")
        if typ not in TYPES:
            return _erreur(self, 400, "Type inconnu.")
        if "@" in email and not re.match(r"^[^@\s]{1,120}@[^@\s]{1,200}\.[^@\s]{2,}$", email):
            return _erreur(self, 400, "Adresse email invalide.")
        if len(titre) > TITRE_MAX:
            return _erreur(self, 400, "Titre trop long (%d caractères max)." % TITRE_MAX)
        if len(json.dumps(contexte, ensure_ascii=False)) > 8000:
            return _erreur(self, 400, "Contexte trop long.")
        contexte = {k: v for k, v in contexte.items() if k != "titre"}
        if titre:
            contexte["titre"] = titre
        chemins = []
        for img in images[:3]:
            c = str(img or "")
            if ".." in c or not _CHEMIN_IMG.match(c):
                return _erreur(self, 400, "Image invalide.")
            chemins.append(c)
        if len(images) > 3:
            return _erreur(self, 400, "3 images maximum.")

        url, anon, service = _cles()
        if not url or not service:
            return _erreur(self, 500, "Signalement non configuré (clés Supabase manquantes).")

        uid_verifie, email_verifie = _identite_optionnelle(url, anon, self) if anon else ("", "")
        if uid_verifie:
            user_id = uid_verifie
            email = email_verifie or email
        else:
            user_id = None

        try:
            insere = _requete_json(
                "POST", url.rstrip("/") + "/rest/v1/bug_reports",
                {"apikey": service, "Authorization": "Bearer " + service,
                 "Prefer": "return=representation"},
                {"user_id": user_id, "email": email, "message": message,
                 "etape": etape, "type": typ, "contexte": contexte,
                 "image_urls": chemins}, timeout=20)
        except HTTPError as e:
            # Colonne `type` pas encore créée (schema.sql pas rejoué) :
            # on dépose sans — une demande reste lisible via le contexte.
            if e.code != 400:
                return _erreur(self, 502, "Base injoignable (erreur %s)." % e.code)
            if typ == "demande":
                contexte = dict(contexte, type_demande=True)
            try:
                insere = _requete_json(
                    "POST", url.rstrip("/") + "/rest/v1/bug_reports",
                    {"apikey": service, "Authorization": "Bearer " + service,
                     "Prefer": "return=representation"},
                    {"user_id": user_id, "email": email, "message": message,
                     "etape": etape, "contexte": contexte,
                     "image_urls": chemins}, timeout=20)
            except HTTPError as e2:
                return _erreur(self, 502, "Base injoignable (erreur %s)." % e2.code)
            except Exception as e2:  # noqa: BLE001
                return _erreur(self, 502, "Base injoignable : " + str(e2)[-160:])
        except Exception as e:  # noqa: BLE001
            return _erreur(self, 502, "Base injoignable : " + str(e)[-160:])
        bug_id = (insere[0].get("id") if isinstance(insere, list) and insere else 0) or 0
        try:
            _notifier_resend(typ, bug_id, titre, message, etape, email,
                             user_id or "", contexte, len(chemins))
        except Exception:  # noqa: BLE001 - ceinture et bretelles, voir _notifier_resend
            pass
        return repondre_json(self, 200, {"ok": True, "data": {"id": bug_id}})

    # ---- GET admin : lire les reports ----
    def do_GET(self):
        q = parse_qs(urlparse(self.path).query)
        inconnus = set(q) - {"statut", "type", "limite"}
        if inconnus:
            return _erreur(self, 400, "Paramètre inconnu : " + ", ".join(sorted(inconnus)) + ".")
        url, anon, service = _cles()
        if not url or not anon or not service:
            return _erreur(self, 500, "Dashboard non configuré (clés Supabase manquantes).")
        admin, _, _ = _est_admin(url, anon, self)
        if not admin:
            auth = self.headers.get("Authorization") or ""
            if not auth.lower().startswith("bearer "):
                return _erreur(self, 401, "Connecte-toi d'abord.")
            return _erreur(self, 403, "Accès réservé.")

        statut = (q.get("statut") or [""])[0]
        if statut and statut not in STATUTS:
            return _erreur(self, 400, "Statut inconnu.")
        typ = (q.get("type") or [""])[0]
        if typ and typ not in TYPES:
            return _erreur(self, 400, "Type inconnu.")
        try:
            limite = max(1, min(300, int((q.get("limite") or ["100"])[0])))
        except ValueError:
            limite = 100
        chemin = ("/rest/v1/bug_reports?select=id,created_at,user_id,email,message,"
                  "etape,type,contexte,statut,image_urls&order=created_at.desc&limit=%d" % limite)
        if statut:
            chemin += "&statut=eq." + statut
        if typ:
            chemin += "&type=eq." + typ
        try:
            lignes = _requete_json("GET", url.rstrip("/") + chemin,
                                   {"apikey": service, "Authorization": "Bearer " + service,
                                    "Accept": "application/json"}, None, timeout=20) or []
        except HTTPError as e:
            # Colonne `type` pas encore créée (schema.sql pas rejoué) :
            # on relit sans, les demandes passées restent visibles via le contexte.
            if e.code != 400:
                if e.code == 404:
                    return _erreur(self, 502, "Table introuvable : recolle supabase/schema.sql dans le SQL Editor.")
                return _erreur(self, 502, "Supabase injoignable (erreur %s)." % e.code)
            chemin_secours = ("/rest/v1/bug_reports?select=id,created_at,user_id,email,message,"
                              "etape,contexte,statut,image_urls&order=created_at.desc&limit=%d" % limite)
            if statut:
                chemin_secours += "&statut=eq." + statut
            try:
                lignes = _requete_json("GET", url.rstrip("/") + chemin_secours,
                                       {"apikey": service, "Authorization": "Bearer " + service,
                                        "Accept": "application/json"}, None, timeout=20) or []
            except HTTPError as e2:
                if e2.code == 404:
                    return _erreur(self, 502, "Table introuvable : recolle supabase/schema.sql dans le SQL Editor.")
                return _erreur(self, 502, "Supabase injoignable (erreur %s)." % e2.code)
            except Exception as e2:  # noqa: BLE001
                return _erreur(self, 502, "Supabase injoignable : " + str(e2)[-160:])
        except Exception as e:  # noqa: BLE001
            return _erreur(self, 502, "Supabase injoignable : " + str(e)[-160:])

        base = url.rstrip("/")
        bugs = []
        for b in lignes:
            if not isinstance(b, dict):
                continue
            urls = [c for c in (b.get("image_urls") or []) if isinstance(c, str) and c]
            # Lignes d'avant le rail Bug / Demande : pas de type → "bug"
            # (ou "demande" si le contexte le dit : dépôt de secours).
            ctx_brut = b.get("contexte") if isinstance(b.get("contexte"), dict) else {}
            t = b.get("type") if b.get("type") in TYPES else ("demande" if ctx_brut.get("type_demande") else "bug")
            bugs.append({
                "id": b.get("id"), "created_at": b.get("created_at") or "",
                "titre": str(ctx_brut.get("titre") or "")[:TITRE_MAX],
                "user_id": b.get("user_id") or "", "email": b.get("email") or "",
                "message": b.get("message") or "", "etape": b.get("etape") or "",
                "type": t,
                "contexte": b.get("contexte") if isinstance(b.get("contexte"), dict) else {},
                "statut": b.get("statut") or "nouveau",
                "images": [{"chemin": c, "url": _signer(base, service, c)} for c in urls[:3]],
            })
        return repondre_json(self, 200, {"ok": True, "data": {"bugs": bugs}})

    # ---- PATCH admin : changer le statut ----
    def do_PATCH(self):
        q = parse_qs(urlparse(self.path).query)
        if set(q) != {"id"}:
            return _erreur(self, 400, "Paramètre id requis.")
        try:
            bug_id = int((q.get("id") or [""])[0])
        except ValueError:
            return _erreur(self, 400, "Paramètre id invalide.")
        corps = _lire_corps(self, {"statut"})
        if corps is None:
            return
        statut = str(corps.get("statut") or "")
        if statut not in STATUTS:
            return _erreur(self, 400, "Statut inconnu.")
        url, anon, service = _cles()
        if not url or not anon or not service:
            return _erreur(self, 500, "Dashboard non configuré (clés Supabase manquantes).")
        admin, _, _ = _est_admin(url, anon, self)
        if not admin:
            return _erreur(self, 403, "Accès réservé.")
        try:
            _requete_json("PATCH", url.rstrip("/") + "/rest/v1/bug_reports?id=eq.%d" % bug_id,
                          {"apikey": service, "Authorization": "Bearer " + service},
                          {"statut": statut}, timeout=15)
        except HTTPError as e:
            return _erreur(self, 502, "Supabase injoignable (erreur %s)." % e.code)
        except Exception as e:  # noqa: BLE001
            return _erreur(self, 502, "Supabase injoignable : " + str(e)[-160:])
        return repondre_json(self, 200, {"ok": True})

    def log_message(self, *args):
        pass  # silencieux
