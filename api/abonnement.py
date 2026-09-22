"""GET /api/abonnement — l'horaire en flux d'abonnement (.ics qui se met à jour).

Deux usages :
  ?action=lien&ecole=…&formation=…&groupes=…&ical=…&cours=…&couleur=…&nom=…
      Fabrique l'adresse d'abonnement (jeton signé) et la renvoie en JSON.
  ?jeton=…
      Sert le flux : relit l'horaire (mêmes données que /api/horaires ou
      /api/ical), filtre les groupes et le cours demandés, répond en
      text/calendar. Le téléphone (Calendrier iOS, ICSx5 sur Android)
      rappelle cette adresse tout seul : l'horaire reste à jour sans
      réexporter.

Le jeton est signé (HMAC-SHA256) : personne ne peut le modifier pour lire
l'horaire d'un autre profil, et l'adresse ne montre ni la formation ni le
lien d'abonnement personnel (encodés). Il ne se révoque pas — supprimer le
calendrier suffit — et n'expire pas : un abonnement doit tenir des années.

Cache privé : la sélection de groupes est personnelle, et le lien
d'abonnement ne doit jamais se retrouver chez un intermédiaire.
"""
import base64
import hashlib
import hmac
import json
import os
import sys
from http.server import BaseHTTPRequestHandler
from urllib.parse import quote

ICI = os.path.dirname(os.path.abspath(__file__))
if ICI not in sys.path:
    sys.path.insert(0, ICI)

from _ecoles import ECOLES, debit, requete  # noqa: E402
from _moteurs import export_ics  # noqa: E402
from _moteurs.hyperplanning import Surcharge  # noqa: E402
from _moteurs.ical import horaire_ical  # noqa: E402
from _partage import cours_export, erreur, filtrer_cours, propre, repondre_ics  # noqa: E402

BUDGET = 75  # s, sous la limite de durée de la fonction chez l'hébergeur
PARAMS = ("action", "ecole", "formation", "groupes", "ical", "cours",
          "couleur", "nom", "uid", "jeton")
TITRE = "Abonnement impossible"


def _secret():
    """Clé de signature du jeton.

    Poser EZH_ABONNEMENT_SECRET en production ; sinon on prend la clé
    service_role (secrète, déjà posée pour le dashboard), sinon un repli
    local (les jetons ne sont alors pas fiables — développement seulement)."""
    v = (os.environ.get("EZH_ABONNEMENT_SECRET") or "").strip()
    if v:
        return v.encode("utf-8")
    for nom in ("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY",
                "SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"):
        v = (os.environ.get(nom) or "").strip()
        if v:
            return ("ezh-abonnement:" + v).encode("utf-8")
    return b"ezh-abonnement-local"


def _b64(octets):
    return base64.urlsafe_b64encode(octets).rstrip(b"=").decode("ascii")


def _deb64(texte):
    return base64.urlsafe_b64decode(texte + "=" * (-len(texte) % 4))


def signer(payload):
    """{…} -> jeton « corps.signature » (URL-safe, sans remplissage)."""
    corps = _b64(json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    sig = hmac.new(_secret(), corps.encode("ascii"), hashlib.sha256).digest()
    return corps + "." + _b64(sig)


def verifier(jeton):
    """Jeton -> {…}, ou None si le contenu a été modifié."""
    try:
        corps, sig = str(jeton).split(".", 1)
        attendu = hmac.new(_secret(), corps.encode("ascii"), hashlib.sha256).digest()
        if not hmac.compare_digest(attendu, _deb64(sig)):
            return None
        payload = json.loads(_deb64(corps))
        return payload if isinstance(payload, dict) else None
    except Exception:  # noqa: BLE001 - jeton illisible = refusé
        return None


def _adresse(h):
    """Origine absolue de l'adresse d'abonnement (l'agenda a besoin d'une
    adresse complète). Derrière Vercel, x-forwarded-* fait foi."""
    try:
        hote = (h.headers.get("x-forwarded-host") or h.headers.get("host") or "").split(",")[0].strip()
    except Exception:  # noqa: BLE001
        hote = ""
    if not hote:
        return ""
    proto = "https"
    try:
        if (h.headers.get("x-forwarded-proto") or "").split(",")[0].strip() == "http":
            proto = "http"
    except Exception:  # noqa: BLE001
        pass
    if hote.startswith(("localhost", "127.", "192.168.", "10.", "172.")):
        proto = "http"
    return proto + "://" + hote


# Cache privé : la copie du téléphone est fraîche 5 min — il ne redemande
# donc pas plus souvent, et dès qu'il redemande il reçoit la version à jour
# (ou « rien de neuf » grâce à l'ETag). L'école, elle, n'est relue qu'à
# l'expiration du cache des moteurs (~15 min) : le rappel d'un téléphone ne
# la fait pas travailler à chaque fois.
CACHE = "private, max-age=300"


def _etag(horaire, nom, uid, couleur):
    """Empreinte de tout ce qui compose le flux, sans l'horodatage du
    fichier (il change à chaque seconde) : le téléphone peut alors demander
    « rien de neuf ? » et recevoir une réponse vide au lieu du calendrier
    entier. Ne dépend que du contenu : deux appels identiques donnent la
    même empreinte, même sur deux machines différentes."""
    matiere = json.dumps([
        (horaire.get("meta") or {}).get("premier_lundi"),
        horaire.get("cours") or [],
        nom, uid, couleur
    ], sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return '"' + hashlib.sha256(matiere.encode("utf-8")).hexdigest() + '"'


def _non_modifie(h, etag):
    """Vrai si le client annonce déjà cette version (If-None-Match)."""
    try:
        entete = (h.headers.get("If-None-Match") or "").strip()
    except Exception:  # noqa: BLE001 - en-tête absent ou illisible
        return False
    if not entete:
        return False
    if entete == "*":
        return True
    for morceau in entete.split(","):
        morceau = morceau.strip()
        if morceau.startswith("W/"):  # validateur faible : même contenu
            morceau = morceau[2:].strip()
        if morceau == etag:
            return True
    return False


def _repondre_ics(h, texte, nom, etag):
    """Réponse du flux : « rien de neuf » (304, aucun octet de calendrier)
    quand le téléphone annonce déjà cette version, le calendrier sinon."""
    if _non_modifie(h, etag):
        h.send_response(304)
        h.send_header("ETag", etag)
        h.send_header("Cache-Control", CACHE)
        h.end_headers()
        return
    repondre_ics(h, texte, nom, etag=etag, cache=CACHE)


def _fabriquer(h, q):
    """Fabrique l'adresse d'abonnement (signée) et la renvoie en JSON."""
    ical = (q.get("ical") or "").strip()
    formation = (q.get("formation") or "").strip()
    ecole = q.get("ecole", "")
    nom = propre(q.get("nom"))[:60] or "Horaire"
    sel = [g.strip() for g in (q.get("groupes") or "").split("|") if g.strip()]
    if ical:
        if len(ical) > 1200:
            return erreur(h, 400, TITRE, "Lien d'abonnement trop long.")
    else:
        if ECOLES.get(ecole) is None or not formation:
            return erreur(h, 400, TITRE, "Paramètres attendus : ecole=%s et formation=<nom>."
                          % "|".join(ECOLES))
        if len(formation) > 200:
            return erreur(h, 400, TITRE, "Nom de formation trop long.")
    if not debit(h, "abonnement", lambda statut, msg: erreur(h, statut, TITRE, msg)):
        return
    payload = {"v": 1, "e": ecole, "f": formation, "g": sel, "i": ical,
               "c": propre(q.get("cours")), "k": propre(q.get("couleur"))[:9],
               "n": nom, "u": propre(q.get("uid"))[:40]}
    base = _adresse(h)
    if not base:
        return erreur(h, 500, TITRE, "Adresse du serveur introuvable.")
    url = base + "/api/abonnement?jeton=" + quote(signer(payload), safe="")
    corps = json.dumps({"ok": True, "url": url}, ensure_ascii=False).encode("utf-8")
    h.send_response(200)
    h.send_header("Content-Type", "application/json; charset=utf-8")
    h.send_header("Content-Length", str(len(corps)))
    h.send_header("Cache-Control", "no-store")
    h.end_headers()
    h.wfile.write(corps)


def _servir(h, jeton):
    """Sert le flux .ics décrit par le jeton."""
    payload = verifier(jeton)
    if not payload:
        return erreur(h, 400, TITRE, "Adresse d'abonnement invalide ou incomplète.")
    ecole, formation = payload.get("e", ""), payload.get("f", "")
    ical, matiere = payload.get("i", ""), payload.get("c", "")
    nom = propre(payload.get("n"))[:60] or "Horaire"
    couleur = propre(payload.get("k"))[:9]
    sel = payload.get("g") if isinstance(payload.get("g"), list) else []
    if not debit(h, "abonnement", lambda statut, msg: erreur(h, statut, TITRE, msg)):
        return
    try:
        if ical:
            data = horaire_ical(ical)
            sel = []  # le flux d'abonnement est déjà la sélection personnelle
        else:
            if ECOLES.get(ecole) is None or not formation:
                raise ValueError("Cet abonnement vise une école inconnue.")
            data = ECOLES[ecole].horaire(formation, budget=BUDGET)
        cours = filtrer_cours(data.get("cours") or [], sel, matiere)
        if not cours:
            raise ValueError("Aucun cours à exporter pour cet horaire.")
        uid = propre(payload.get("u"))[:40]
        horaire = {"meta": data.get("meta") or {}, "cours": cours_export(cours, sel)}
        _repondre_ics(h, export_ics.construire(horaire, nom, uid=uid, couleur=couleur),
                      export_ics.nom_fichier(nom), _etag(horaire, nom, uid, couleur))
    except ValueError as e:
        erreur(h, 404, TITRE, str(e))
    except Surcharge as e:
        erreur(h, 429, TITRE, str(e))
    except Exception as e:  # noqa: BLE001 - message montré à l'utilisateur
        erreur(h, 502, TITRE, str(e)[-300:])


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        q = requete(self, PARAMS, lambda statut, msg: erreur(self, statut, TITRE, msg))
        if q is None:
            return
        jeton = (q.get("jeton") or "").strip()
        if jeton:
            return _servir(self, jeton)
        if (q.get("action") or "").strip() != "lien":
            return erreur(self, 400, TITRE, "Paramètre attendu : action=lien ou jeton=<jeton>.")
        return _fabriquer(self, q)

    def log_message(self, *args):
        pass  # silencieux
