"""GET /api/stats?jours=30 — chiffres du dashboard admin.

Réservé aux emails listés dans ADMIN_EMAILS (env Vercel). Le navigateur
envoie son access_token Supabase (Authorization: Bearer ...), le serveur
vérifie qui c'est via /auth/v1/user, refuse les non-admins (403), puis
agrège avec la clé service_role (jamais exposée au navigateur) :

  comptes (auth.admin)  +  cours suivis (table profils)
  +  consultations / jour (table visites, dédoublonnées : une même
     personne qui rouvre le même horaire dans les 30 min ne compte
     qu'une fois ; jours à l'heure de Bruxelles)
  +  PDF officiels ouverts (table pdf_exports : total, par jour, par
     école, utilisateurs) — absent si schema.sql n'a pas été recollé.
  +  parcours anonyme (table evenements, agrégé côté base par
     stats_evenements() : arrivées, clics de connexion, comptes créés,
     pages d'arrêt, erreurs) — absent si schema.sql n'a pas été recollé.

Réponse : {"ok": true, "data": {
  "totaux": {...}, "precedent": {...}, "par_jour": [...],
  "par_ecole": [...], "par_formation": [...],
  "utilisateurs": [...], "parcours": {...} | null,
  "pdf": {...} | null,
  "limites": {"comptes": bool, "profils": bool, "visites": bool, "pdf": bool},
  "plus_ancienne_visite": "...", "plus_ancienne_absolue": "...",
  "plus_ancien_pdf": "..." }}

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

try:
    from zoneinfo import ZoneInfo
    _TZ = ZoneInfo("Europe/Brussels")
except Exception:  # noqa: BLE001 - sans tzdata : UTC, décalé d'une ou deux heures
    _TZ = timezone.utc

# Une consultation = une personne qui ouvre un de ses horaires. L'app
# réenregistre à chaque retour sur l'onglet : rouvrir le même horaire dans
# cette fenêtre ne recompte pas (côté app ET ici, pour l'historique).
FENETRE_CONSULTATION = timedelta(minutes=30)
VISITES_MAX = 40000
# PDF ouverts : volume faible (une poignée par semaine et par utilisateur),
# 10 000 lignes couvrent large sur 90 jours.
PDF_MAX = 10000

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


# Photos de profil affichées dans le dashboard : uniquement ces hôtes
# (les mêmes que la CSP img-src de vercel.json et serve.py).
_HOTES_AVATAR = ("lh3.googleusercontent.com", "avatars.githubusercontent.com")


def _avatar(compte):
    """URL https de la photo fournie par Google / GitHub, sinon ""."""
    sources = [compte.get("user_metadata") or {}] + [
        i.get("identity_data") or {} for i in (compte.get("identities") or [])]
    for m in sources:
        for cle in ("avatar_url", "picture"):
            u = str(m.get(cle) or "").strip()
            hote = urlparse(u).hostname or ""
            if u.startswith("https://") and hote in _HOTES_AVATAR and len(u) <= 500:
                return u
    return ""


def _iso_date(s):
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except Exception:
        return None


def _cle_formation(ecole, formation):
    """Clé de regroupement (école, formation) : les parcours « PAR:A,B »
    (ULB / UCL, cours choisis dans l'ordre de sélection) sont triés pour
    que le même panier dans un ordre différent compte comme une seule
    formation. Affiche la forme canonique triée."""
    eco = (ecole or "").strip()
    # Horaire sur mesure : pas de formation unique (visites : « sur mesure »).
    form = (formation or "").strip() or "sur mesure"
    if form.startswith("PAR:"):
        codes = sorted({c.strip().upper() for c in form[4:].split(",") if c.strip()})
        form = "PAR:" + ",".join(codes)
    return "%s\x00%s" % (eco, form), eco, form


def _texte_sur_mesure(sources):
    """« sur mesure (3 sources) » pour un horaire composé de plusieurs formations."""
    n = len(sources) if isinstance(sources, list) else 0
    return "sur mesure (%d source%s)" % (n, "s" if n > 1 else "") if n else ""


def _dedoublonner(visites):
    """Garde une visite par (compte, horaire) et par fenêtre de 30 min,
    triées de la plus ancienne à la plus récente. Renvoie [(date, v)]."""
    datees = []
    for v in visites:
        d = _iso_date(v.get("created_at"))
        if d:
            datees.append((d, v))
    datees.sort(key=lambda x: x[0])
    derniere, gardees = {}, []
    for d, v in datees:
        cle = (v.get("user_id") or "", v.get("profil_id") or
               "%s\x00%s" % (v.get("ecole") or "", v.get("formation") or ""))
        avant = derniere.get(cle)
        if avant is not None and d - avant < FENETRE_CONSULTATION:
            continue
        derniere[cle] = d
        gardees.append((d, v))
    return gardees


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
            # `sources` (horaires sur mesure) : relu sans elle tant que la
            # base n'a pas rejoué schema.sql.
            try:
                profils = _get_pagine(
                    base, "/rest/v1/profils?select=user_id,id,surnom,ecole,formation,groupes,sources,updated_at",
                    h_svc, 10000) or []
            except Exception:  # noqa: BLE001 - colonne absente
                profils = _get_pagine(
                    base, "/rest/v1/profils?select=user_id,id,surnom,ecole,formation,groupes,updated_at",
                    h_svc, 10000) or []
            profils_tronques = len(profils) >= 10000

            # Consultations sur la période ET la précédente (même durée),
            # pour la comparaison « vs 7 j précédents ». Jours calendaires
            # de Bruxelles : minuit local, pas minuit UTC.
            auj = datetime.now(_TZ).date()
            debut_periode = datetime.combine(auj - timedelta(days=jours - 1),
                                             datetime.min.time(), _TZ)
            debut_precedent = debut_periode - timedelta(days=jours)
            limite = debut_precedent.astimezone(timezone.utc).isoformat()
            visites = _get_pagine(
                base, "/rest/v1/visites?select=user_id,profil_id,ecole,formation,created_at"
                "&created_at=gte." + limite.replace("+", "%2B") +
                "&order=created_at.desc",
                dict(h_svc, Accept="application/json"), VISITES_MAX) or []
            visites_tronquees = len(visites) >= VISITES_MAX

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

            # PDF officiels ouverts : chaque ouverture réussie compte (pas
            # de dédoublonnage : c'est l'usage réel qui dit si on garde le
            # bouton). Table absente (schema.sql pas recollé) : on
            # continue sans, le dashboard l'indique au lieu d'échouer.
            pdf_lignes = None
            pdf_tronques = False
            ancien_pdf = ""
            try:
                pdf_lignes = _get_pagine(
                    base, "/rest/v1/pdf_exports?select=user_id,ecole,created_at"
                    "&created_at=gte." + limite.replace("+", "%2B") +
                    "&order=created_at.desc",
                    dict(h_svc, Accept="application/json"), PDF_MAX) or []
                pdf_tronques = len(pdf_lignes) >= PDF_MAX
                try:
                    vieux_pdf = _get_json(
                        base + "/rest/v1/pdf_exports?select=created_at"
                        "&order=created_at.asc&limit=1", h_svc, timeout=20)
                    ancien_pdf = (vieux_pdf[0].get("created_at")
                                  if isinstance(vieux_pdf, list) and vieux_pdf else "") or ""
                except Exception:  # noqa: BLE001 - indicateur seul
                    ancien_pdf = ""
            except HTTPError as e:
                if e.code not in (400, 404):
                    raise
                pdf_lignes = None
            except Exception:  # noqa: BLE001 - indicateur seul, jamais bloquant
                pdf_lignes = None
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

        jours_cles = [(auj - timedelta(days=i)).isoformat() for i in range(jours - 1, -1, -1)]
        par_jour = {j: {"jour": j, "visites": 0, "visiteurs": set()} for j in jours_cles}
        par_formation = {}
        par_ecole = {}
        visites_par_user = {}
        visiteurs_periode = set()
        precedent = {"consultations": 0, "visiteurs": set()}
        brutes = sum(1 for v in visites
                     if (_iso_date(v.get("created_at")) or debut_precedent) >= debut_periode)
        plus_ancienne = None  # pour voir d'un coup d'œil si la purge tourne
        for d, v in _dedoublonner(visites):
            uid_v = v.get("user_id") or ""
            if d < debut_periode:
                precedent["consultations"] += 1
                if uid_v:
                    precedent["visiteurs"].add(uid_v)
                continue
            if plus_ancienne is None or d < plus_ancienne:
                plus_ancienne = d
            jour = d.astimezone(_TZ).date().isoformat()
            if jour in par_jour:
                par_jour[jour]["visites"] += 1
                if uid_v:
                    par_jour[jour]["visiteurs"].add(uid_v)
            cle, eco, form = _cle_formation(v.get("ecole"), v.get("formation"))
            e = par_formation.setdefault(cle, {"ecole": eco,
                "formation": form, "visites": 0, "visiteurs": set()})
            e["visites"] += 1
            pe = par_ecole.setdefault(eco, {"visites": 0, "visiteurs": set()})
            pe["visites"] += 1
            if uid_v:
                e["visiteurs"].add(uid_v)
                pe["visiteurs"].add(uid_v)
                visiteurs_periode.add(uid_v)
                u = visites_par_user.setdefault(uid_v, {"total": 0, "dates": []})
                u["total"] += 1
                u["dates"].append(d)

        for cle in list(par_formation):
            par_formation[cle]["visiteurs"] = len(par_formation[cle]["visiteurs"])

        profils_par_user = {}
        inscrits_par_formation = {}
        inscrits_par_ecole = {}
        for p in profils:
            if p.get("user_id"):
                profils_par_user.setdefault(p["user_id"], []).append(p)
            cle, eco, _ = _cle_formation(p.get("ecole"), p.get("formation"))
            inscrits_par_formation.setdefault(cle, set()).add(p.get("user_id"))
            inscrits_par_ecole.setdefault(eco, set()).add(p.get("user_id"))

        utilisateurs = []
        for c in comptes:
            uid = c.get("id")
            prenom, nom = _identite(c)
            profs = profils_par_user.get(uid, [])
            stats = visites_par_user.get(uid, {"total": 0, "dates": []})
            dates = sorted(stats["dates"])
            j7 = sum(1 for d in dates if (auj - d.astimezone(_TZ).date()).days < 7)
            utilisateurs.append({
                "user_id": uid,
                "email": c.get("email") or "",
                "prenom": prenom,
                "nom": nom,
                "avatar": _avatar(c),
                "compte_cree": c.get("created_at") or "",
                "derniere_connexion": c.get("last_sign_in_at") or "",
                "profils": [{
                    "surnom": p.get("surnom") or "", "ecole": p.get("ecole") or "",
                    "formation": p.get("formation") or _texte_sur_mesure(p.get("sources")),
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

        lignes_ecoles = []
        for eco in set(par_ecole) | set(inscrits_par_ecole):
            pe = par_ecole.get(eco, {"visites": 0, "visiteurs": set()})
            lignes_ecoles.append({"ecole": eco, "visites": pe["visites"],
                                  "visiteurs": len(pe["visiteurs"]),
                                  "inscrits": len(inscrits_par_ecole.get(eco, set()))})
        lignes_ecoles.sort(key=lambda l: (l["visites"], l["inscrits"]), reverse=True)

        # PDF officiels : total, précédent, par jour, par école, utilisateurs.
        if pdf_lignes is None:
            pdf = None
        else:
            pdf_jours = {j: {"pdf": 0, "utilisateurs": set()} for j in jours_cles}
            pdf_ecoles = {}
            pdf_users = set()
            pdf_precedent = 0
            for row in pdf_lignes:
                d = _iso_date(row.get("created_at"))
                if not d or d < debut_precedent:
                    continue
                uid_p = row.get("user_id") or ""
                if d < debut_periode:
                    pdf_precedent += 1
                    continue
                jour_p = d.astimezone(_TZ).date().isoformat()
                if jour_p in pdf_jours:
                    pdf_jours[jour_p]["pdf"] += 1
                    if uid_p:
                        pdf_jours[jour_p]["utilisateurs"].add(uid_p)
                eco_p = (row.get("ecole") or "").strip()
                pe_p = pdf_ecoles.setdefault(eco_p, {"pdf": 0, "utilisateurs": set()})
                pe_p["pdf"] += 1
                if uid_p:
                    pe_p["utilisateurs"].add(uid_p)
                    pdf_users.add(uid_p)
            pdf = {
                "total": sum(v["pdf"] for v in pdf_jours.values()),
                "precedent": pdf_precedent,
                "utilisateurs": len(pdf_users),
                "aujourdhui": pdf_jours[auj.isoformat()]["pdf"] if auj.isoformat() in pdf_jours else 0,
                "par_jour": [{
                    "jour": j, "pdf": pdf_jours[j]["pdf"],
                    "utilisateurs": len(pdf_jours[j]["utilisateurs"])} for j in jours_cles],
                "par_ecole": sorted(
                    [{"ecole": eco, "pdf": v["pdf"],
                      "utilisateurs": len(v["utilisateurs"])} for eco, v in pdf_ecoles.items()],
                    key=lambda l: l["pdf"], reverse=True),
            }

        return repondre_json(self, 200, {"ok": True, "data": {
            "totaux": {
                "comptes": len(comptes),
                "horaires_suivis": len(profils),
                "consultations": sum(p["visites"] for p in par_jour.values()),
                "consultations_brutes": brutes,
                "visiteurs_uniques": len(visiteurs_periode),
                "aujourdhui": par_jour[auj.isoformat()]["visites"] if auj.isoformat() in par_jour else 0,
                "jours": jours,
            },
            "precedent": {"consultations": precedent["consultations"],
                          "visiteurs": len(precedent["visiteurs"])},
            "limites": {  # un plafond atteint = chiffres tronqués, à signaler
                "comptes": comptes_tronques,
                "profils": profils_tronques,
                "visites": visites_tronquees,
                "pdf": pdf_tronques,
            },
            "plus_ancienne_visite": plus_ancienne.isoformat() if plus_ancienne else "",
            "plus_ancienne_absolue": ancienne_absolue,
            "plus_ancien_pdf": ancien_pdf,
            "pdf": pdf,
            "parcours": parcours,
            "par_jour": [{
                "jour": j, "visites": par_jour[j]["visites"],
                "visiteurs": len(par_jour[j]["visiteurs"])} for j in jours_cles],
            "par_ecole": lignes_ecoles,
            "par_formation": lignes_formations,
            "utilisateurs": utilisateurs,
        }})

    def log_message(self, *args):
        pass  # silencieux
