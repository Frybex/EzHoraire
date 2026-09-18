"""GET /api/stats?jours=30 — chiffres du dashboard admin.

Réservé aux emails listés dans ADMIN_EMAILS (env Vercel). Le navigateur
envoie son access_token Supabase (Authorization: Bearer ...), le serveur
vérifie qui c'est via /auth/v1/user, refuse les non-admins (403), puis
agrège avec la clé service_role (jamais exposée au navigateur) :

  comptes (auth.admin)  +  cours suivis (table profils)
  +  consultations / jour (table visites)
  +  parcours anonyme (table evenements, agrégé côté base par
     stats_evenements() : arrivées, clics de connexion, comptes créés,
     pages d'arrêt, erreurs) — absent si schema.sql n'a pas été recollé.

Réponse : {"ok": true, "data": {
  "totaux": {...}, "par_jour": [...], "par_formation": [...],
  "utilisateurs": [...], "parcours": {...} | null,
  "limites": {"comptes": bool, "profils": bool, "visites": bool},
  "plus_ancienne_visite": "...", "plus_ancienne_absolue": "..." }}

Env requises : SUPABASE_URL, SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY (alias SERVICE_ROLE acceptés), puis au moins
  une des deux listes d'admins :
  - ADMIN_USER_IDS : UUID des comptes admins (recommandé : impossible à
    réclamer par quelqu'un d'autre, contrairement à une adresse email) ;
  - ADMIN_EMAILS : emails, séparés par des virgules (repli historique).
  Un compte est aussi admin si son app_metadata contient "admin": true
  (app_metadata n'est modifiable qu'avec la clé service_role).
"""
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ICI = os.path.dirname(os.path.abspath(__file__))
if ICI not in sys.path:
    sys.path.insert(0, ICI)

from _ecoles import repondre_json  # noqa: E402


def _env(*noms):
    for n in noms:
        v = (os.environ.get(n) or "").strip().strip('"').strip("'")
        if v:
            return v
    return ""


def _get_json(url, entetes, timeout=20):
    req = Request(url, headers=entetes, method="GET")
    with urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8") or "null")


def _get_pagine(base, chemin, entetes, maximum, pas=1000, timeout=20):
    """Toutes les lignes, page par page (PostgREST plafonne à 1000 par défaut).

    Sans ça, le dashboard s'arrêterait silencieusement à la 1000e ligne."""
    lignes, depart = [], 0
    while depart < maximum:
        bloc = _get_json(f"{base}{chemin}&limit={pas}&offset={depart}",
                         entetes, timeout)
        if not isinstance(bloc, list) or not bloc:
            break
        lignes.extend(bloc)
        if len(bloc) < pas:
            break
        depart += pas
    return lignes[:maximum]


def _post_json(url, entetes, corps, timeout=20):
    """Appel PostgREST en POST (RPC) : la base agrège, l'API transmet."""
    donnees = json.dumps(corps).encode("utf-8")
    req = Request(url, data=donnees, method="POST",
                  headers=dict(entetes, **{"Content-Type": "application/json"}))
    with urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8") or "null")


def _identite(compte):
    """(prénom, nom) d'un compte : d'abord ceux saisis dans l'app, sinon
    ceux fournis par Google / GitHub (nom complet coupé au 1er espace,
    comme l'app), sinon le pseudo GitHub en prénom."""
    sources = [compte.get("user_metadata") or {}] + [
        i.get("identity_data") or {} for i in (compte.get("identities") or [])]
    for m in sources:
        if m.get("prenom") or m.get("nom"):
            return m.get("prenom") or "", m.get("nom") or ""
    for m in sources:
        if m.get("given_name") or m.get("family_name"):
            return m.get("given_name") or "", m.get("family_name") or ""
    for m in sources:
        complet = " ".join(str(m.get("full_name") or m.get("name") or "").split())
        if complet:
            prenom, _, nom = complet.partition(" ")
            return prenom, nom
    for m in sources:
        pseudo = m.get("user_name") or m.get("preferred_username")
        if pseudo:
            return "@" + str(pseudo).lstrip("@"), ""
    return "", ""


def _iso_date(s):
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except Exception:
        return None


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        q = parse_qs(urlparse(self.path).query)
        inconnus = set(q) - {"jours", "check"}
        if inconnus:
            return repondre_json(self, 400, {"ok": False, "erreur":
                                 "Paramètre inconnu : " + ", ".join(sorted(inconnus)) + "."})
        try:
            jours = max(1, min(90, int((q.get("jours") or ["30"])[0])))
        except ValueError:
            jours = 30

        url = _env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")
        anon = _env("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY")
        service = _env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY",
                       "SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY")
        admins = {e.strip().lower() for e in _env("ADMIN_EMAILS").split(",") if e.strip()}
        admins_ids = {i.strip().lower() for i in _env("ADMIN_USER_IDS").split(",") if i.strip()}
        if not url or not anon or not service:
            return repondre_json(self, 500, {"ok": False,
                "erreur": "Dashboard non configuré (clés Supabase manquantes)."})
        if not admins and not admins_ids:
            return repondre_json(self, 500, {"ok": False,
                "erreur": "Dashboard non configuré (ADMIN_USER_IDS ou ADMIN_EMAILS vide)."})

        auth = self.headers.get("Authorization") or ""
        if not auth.lower().startswith("bearer "):
            return repondre_json(self, 401, {"ok": False, "erreur": "Connecte-toi d'abord."})
        token = auth.split(" ", 1)[1].strip()
        if not token:
            return repondre_json(self, 401, {"ok": False, "erreur": "Connecte-toi d'abord."})

        # Qui demande ? (le token n'est jamais faire confiance aveuglément)
        try:
            moi = _get_json(url.rstrip("/") + "/auth/v1/user",
                            {"apikey": anon, "Authorization": "Bearer " + token}, timeout=15)
        except Exception:
            return repondre_json(self, 401, {"ok": False, "erreur": "Session invalide."})
        email = str((moi or {}).get("email") or "").lower()
        uid = str((moi or {}).get("id") or "").lower()
        meta = (moi or {}).get("app_metadata") or {}
        # user_id et app_metadata (écriture service_role uniquement) ne
        # peuvent pas être réclamés par un tiers, contrairement à un email.
        est_admin = (
            (bool(uid) and uid in admins_ids)
            or (meta.get("admin") in (True, "true"))
            or (bool(email) and email in admins)
        )
        if not est_admin:
            return repondre_json(self, 403, {"ok": False, "erreur": "Accès réservé."})

        # Sonde légère de l'app (bouton « Tableau admin ») : pas d'agrégation.
        if "check" in q:
            return repondre_json(self, 200, {"ok": True, "admin": True})

        base = url.rstrip("/")
        h_svc = {"apikey": service, "Authorization": "Bearer " + service,
                 "Accept": "application/json"}
        try:
            # Comptes (pagination, 200 / page, plafond 4000 : au-delà, le
            # dashboard le signale au lieu de tronquer en silence).
            comptes = []
            page = 1
            comptes_tronques = False
            while page <= 20:
                rep = _get_json(
                    base + "/auth/v1/admin/users?page=%d&per_page=200" % page, h_svc, timeout=20)
                batch = rep.get("users") if isinstance(rep, dict) else rep
                if not batch:
                    break
                comptes.extend(batch)
                if len(batch) < 200:
                    break
                page += 1
            comptes_tronques = page > 20

            # Cours suivis.
            profils = _get_pagine(
                base, "/rest/v1/profils?select=user_id,id,surnom,ecole,formation,groupes,updated_at",
                h_svc, 10000) or []
            profils_tronques = len(profils) >= 10000

            # Consultations sur la période.
            limite = (datetime.now(timezone.utc) - timedelta(days=jours)).isoformat()
            visites = _get_pagine(
                base, "/rest/v1/visites?select=user_id,profil_id,ecole,formation,created_at"
                "&created_at=gte." + limite.replace("+", "%2B") +
                "&order=created_at.desc",
                dict(h_svc, Accept="application/json"), 20000) or []
            visites_tronquees = len(visites) >= 20000

            # La plus vieille consultation tout court (1 ligne) : si elle
            # dépasse 200 jours, la purge (purger_visites, voir schema.sql)
            # ne tourne pas — le dashboard le signale.
            try:
                vieille = _get_json(
                    base + "/rest/v1/visites?select=created_at"
                    "&order=created_at.asc&limit=1", h_svc, timeout=20)
                ancienne_absolue = (vieille[0].get("created_at")
                                    if isinstance(vieille, list) and vieille else "") or ""
            except Exception:  # noqa: BLE001 - indicateur seul, jamais bloquant
                ancienne_absolue = ""

            # Parcours anonyme : la base calcule, l'API transmet (quelques
            # kilo-octets, quel que soit le volume). Fonction absente
            # (schema.sql pas encore recollé) : on continue sans, le
            # dashboard l'indique au lieu d'échouer.
            parcours = None
            try:
                parcours = _post_json(
                    base + "/rest/v1/rpc/stats_evenements", h_svc, {"jours": jours})
            except HTTPError as e:
                if e.code not in (400, 404):
                    raise
            except Exception:  # noqa: BLE001 - indicateur seul, jamais bloquant
                parcours = None
        except HTTPError as e:  # noqa: BLE001 - clé invalide, table manquante…
            if e.code == 401:
                return repondre_json(self, 502, {"ok": False, "erreur":
                    "Clé service_role refusée par Supabase : vérifie SUPABASE_SERVICE_ROLE_KEY "
                    "dans Vercel (c'est la clé « service_role » secrète, pas « anon »), puis redéploie."})
            if e.code == 404:
                return repondre_json(self, 502, {"ok": False, "erreur":
                    "Table introuvable : recolle supabase/schema.sql dans le SQL Editor."})
            return repondre_json(self, 502, {"ok": False,
                "erreur": "Supabase injoignable (erreur %s)." % e.code})
        except Exception as e:  # noqa: BLE001
            return repondre_json(self, 502, {"ok": False,
                "erreur": "Supabase injoignable : " + str(e)[-200:]})

        auj = datetime.now(timezone.utc).date()
        jours_cles = [(auj - timedelta(days=i)).isoformat() for i in range(jours - 1, -1, -1)]
        par_jour = {j: {"jour": j, "visites": 0, "visiteurs": set()} for j in jours_cles}
        par_formation = {}
        visites_par_user = {}
        plus_ancienne = None  # pour voir d'un coup d'œil si la purge tourne
        for v in visites:
            d = _iso_date(v.get("created_at"))
            if d and (plus_ancienne is None or d < plus_ancienne):
                plus_ancienne = d
            if d and d.date().isoformat() in par_jour:
                par_jour[d.date().isoformat()]["visites"] += 1
                if v.get("user_id"):
                    par_jour[d.date().isoformat()]["visiteurs"].add(v["user_id"])
            cle = "%s\x00%s" % (v.get("ecole") or "", v.get("formation") or "")
            e = par_formation.setdefault(cle, {"ecole": v.get("ecole") or "",
                "formation": v.get("formation") or "", "visites": 0, "visiteurs": set()})
            e["visites"] += 1
            if v.get("user_id"):
                e["visiteurs"].add(v["user_id"])
            if v.get("user_id"):
                u = visites_par_user.setdefault(v["user_id"], {"total": 0, "dates": []})
                u["total"] += 1
                if d:
                    u["dates"].append(d)

        for cle in list(par_formation):
            par_formation[cle]["visiteurs"] = len(par_formation[cle]["visiteurs"])

        profils_par_user = {}
        inscrits_par_formation = {}
        for p in profils:
            if p.get("user_id"):
                profils_par_user.setdefault(p["user_id"], []).append(p)
            cle = "%s\x00%s" % (p.get("ecole") or "", p.get("formation") or "")
            inscrits_par_formation.setdefault(cle, set()).add(p.get("user_id"))

        utilisateurs = []
        for c in comptes:
            uid = c.get("id")
            prenom, nom = _identite(c)
            profs = profils_par_user.get(uid, [])
            stats = visites_par_user.get(uid, {"total": 0, "dates": []})
            dates = sorted(stats["dates"])
            j7 = sum(1 for d in dates if (auj - d.date()).days < 7)
            utilisateurs.append({
                "user_id": uid,
                "email": c.get("email") or "",
                "prenom": prenom,
                "nom": nom,
                "compte_cree": c.get("created_at") or "",
                "derniere_connexion": c.get("last_sign_in_at") or "",
                "profils": [{
                    "surnom": p.get("surnom") or "", "ecole": p.get("ecole") or "",
                    "formation": p.get("formation") or "",
                    "groupes": p.get("groupes") or []} for p in profs],
                "visites_periode": stats["total"],
                "visites_7j": j7,
                "derniere_visite": max(dates).isoformat() if dates else "",
            })
        utilisateurs.sort(key=lambda u: u["derniere_visite"] or "", reverse=True)

        lignes_formations = []
        for cle, e in par_formation.items():
            lignes_formations.append({
                "ecole": e["ecole"], "formation": e["formation"],
                "inscrits": len(inscrits_par_formation.get(cle, set())),
                "visites": e["visites"], "visiteurs": e["visiteurs"]})
        for cle, ids in inscrits_par_formation.items():
            if cle not in par_formation:
                eco, form = cle.split("\x00", 1)
                lignes_formations.append({"ecole": eco, "formation": form,
                    "inscrits": len(ids), "visites": 0, "visiteurs": 0})
        lignes_formations.sort(key=lambda l: (l["visites"], l["inscrits"]), reverse=True)

        return repondre_json(self, 200, {"ok": True, "data": {
            "totaux": {
                "comptes": len(comptes),
                "horaires_suivis": len(profils),
                "consultations": len(visites),
                "visiteurs_uniques": len(visites_par_user),
                "aujourdhui": par_jour[auj.isoformat()]["visites"] if auj.isoformat() in par_jour else 0,
                "jours": jours,
            },
            "limites": {  # un plafond atteint = chiffres tronqués, à signaler
                "comptes": comptes_tronques,
                "profils": profils_tronques,
                "visites": visites_tronquees,
            },
            "plus_ancienne_visite": plus_ancienne.isoformat() if plus_ancienne else "",
            "plus_ancienne_absolue": ancienne_absolue,
            "parcours": parcours,
            "par_jour": [{
                "jour": j, "visites": par_jour[j]["visites"],
                "visiteurs": len(par_jour[j]["visiteurs"])} for j in jours_cles],
            "par_formation": lignes_formations,
            "utilisateurs": utilisateurs,
        }})

    def log_message(self, *args):
        pass  # silencieux
