"""GET /api/stats?jours=30 — chiffres du dashboard admin.

Réservé aux emails listés dans ADMIN_EMAILS (env Vercel). Le navigateur
envoie son access_token Supabase (Authorization: Bearer ...), le serveur
vérifie qui c'est via /auth/v1/user, refuse les non-admins (403), puis
agrège avec la clé service_role (jamais exposée au navigateur) :

  comptes (auth.admin)  +  cours suivis (table profils)
  +  consultations / jour (table visites)

Réponse : {"ok": true, "data": {
  "totaux": {...}, "par_jour": [...], "par_formation": [...],
  "utilisateurs": [...] }}

Env requises : SUPABASE_URL, SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY (alias SERVICE_ROLE acceptés),
  ADMIN_EMAILS (séparés par des virgules).
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


def _iso_date(s):
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except Exception:
        return None


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        q = parse_qs(urlparse(self.path).query)
        try:
            jours = max(1, min(90, int((q.get("jours") or ["30"])[0])))
        except ValueError:
            jours = 30

        url = _env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")
        anon = _env("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY")
        service = _env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY",
                       "SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY")
        admins = {e.strip().lower() for e in _env("ADMIN_EMAILS").split(",") if e.strip()}
        if not url or not anon or not service:
            return repondre_json(self, 500, {"ok": False,
                "erreur": "Dashboard non configuré (clés Supabase / ADMIN_EMAILS manquantes)."})
        if not admins:
            return repondre_json(self, 500, {"ok": False,
                "erreur": "Dashboard non configuré (ADMIN_EMAILS vide)."})

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
        if not email or email not in admins:
            return repondre_json(self, 403, {"ok": False, "erreur": "Accès réservé."})

        # Sonde légère de l'app (bouton « Tableau admin ») : pas d'agrégation.
        if "check" in q:
            return repondre_json(self, 200, {"ok": True, "admin": True})

        base = url.rstrip("/")
        h_svc = {"apikey": service, "Authorization": "Bearer " + service,
                 "Accept": "application/json"}
        try:
            # Comptes (pagination, 200 / page, plafond 4000).
            comptes = []
            page = 1
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

            # Cours suivis.
            profils = _get_json(
                base + "/rest/v1/profils?select=user_id,id,surnom,ecole,formation,groupes,updated_at&limit=10000",
                dict(h_svc, Accept="application/json"), timeout=20) or []

            # Consultations sur la période.
            limite = (datetime.now(timezone.utc) - timedelta(days=jours)).isoformat()
            visites = _get_json(
                base + "/rest/v1/visites?select=user_id,profil_id,ecole,formation,created_at"
                "&created_at=gte." + limite.replace("+", "%2B") +
                "&order=created_at.desc&limit=20000",
                dict(h_svc, Accept="application/json"), timeout=20) or []
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
        for v in visites:
            d = _iso_date(v.get("created_at"))
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
            meta = c.get("user_metadata") or {}
            profs = profils_par_user.get(uid, [])
            stats = visites_par_user.get(uid, {"total": 0, "dates": []})
            dates = sorted(stats["dates"])
            j7 = sum(1 for d in dates if (auj - d.date()).days < 7)
            utilisateurs.append({
                "user_id": uid,
                "email": c.get("email") or "",
                "prenom": meta.get("prenom") or meta.get("given_name") or "",
                "nom": meta.get("nom") or meta.get("family_name") or "",
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
            "par_jour": [{
                "jour": j, "visites": par_jour[j]["visites"],
                "visiteurs": len(par_jour[j]["visiteurs"])} for j in jours_cles],
            "par_formation": lignes_formations,
            "utilisateurs": utilisateurs,
        }})

    def log_message(self, *args):
        pass  # silencieux
