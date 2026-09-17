"""Sert l'app en local, avec la même API qu'en ligne.

Usage :  python3 serve.py [--lan] [--port 8902]
App :    http://localhost:8902 (8901 est pris par Horairelm)

--lan : accepte aussi les autres appareils du réseau local (téléphone,
        second ordinateur) et affiche l'adresse à ouvrir. Sans lui, seules
        les connexions de la machine répondent : en production c'est
        Vercel qui protège, ici c'est ce garde-fou qui tient le rôle.
--port : change le port (utile quand deux dossiers de travail tournent
        en même temps).

GET /api/formations?ecole=heh                      formations de l'école
GET /api/horaires?ecole=heh&formation=..           horaire complet d'une formation
GET /api/recherche?ecole=ulb&genre=niveau&q=..     recherche en direct (ULB, UCLouvain)
GET /api/ical?lien=..                              horaire d'un lien d'abonnement
POST /api/importer  {"ecole":"ulb","liste":"…"}     liste de cours collée -> cours
GET /api/pdf?ecole=heh&formation=..&groupe=..&semaine=..   PDF officiel
"""
import os
import socket
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "api"))

# Le serveur local montre toutes les écoles, y compris celles en test
# (UCLouvain) : sur Vercel, sans EZH_UCL, elles restent invisibles.
# `EZH_UCL=0 python3 serve.py` simule la production.
os.environ.setdefault("EZH_UCL", "1")

import formations  # noqa: E402
import horaires  # noqa: E402
import ical  # noqa: E402
import importer  # noqa: E402
import pdf  # noqa: E402
import recherche  # noqa: E402
import config  # noqa: E402
import stats  # noqa: E402

PORT_DEFAUT = 8902
ROUTES = {"/api/formations": formations.handler,
          "/api/horaires": horaires.handler,
          "/api/recherche": recherche.handler,
          "/api/ical": ical.handler,
          "/api/importer": importer.handler,
          "/api/pdf": pdf.handler,
          "/api/config": config.handler,
          "/api/stats": stats.handler}

# En-têtes identiques à vercel.json (garder les deux synchronisés) : le site
# local doit se comporter comme la production, surtout pour la CSP.
# 'unsafe-inline' reste nécessaire pour le script et les styles embarqués
# dans index.html / dashboard.html ; le reste verrouille les sources.
CSP = ("default-src 'self'; "
       "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; "
       "style-src 'self' 'unsafe-inline'; "
       "img-src 'self' data: blob:; "
       "font-src 'self'; "
       "connect-src 'self' https://*.supabase.co https://cdn.jsdelivr.net; "
       "frame-src blob:; "
       "worker-src blob: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; "
       "object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'")
ENTETES_SECURITE = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": CSP,
}


class Serveur(ThreadingHTTPServer):
    """Écoute en IPv4 ET IPv6 : « localhost » marche quel que soit le navigateur."""
    address_family = socket.AF_INET6

    def server_bind(self):
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


class Handler(SimpleHTTPRequestHandler):
    LAN = False  # réglé par --lan : accepte les autres appareils du réseau

    def _chemin_autorise(self):
        """Chemin décodé si l'accès est permis et qu'il ne vise pas un
        fichier caché, sinon None (une erreur a déjà été envoyée)."""
        # Sécurité : sans --lan, n'accepter que la machine locale.
        ip = self.client_address[0]
        if not Handler.LAN and ip not in ("127.0.0.1", "::1", "::ffff:127.0.0.1"):
            self.send_error(403, "Accès interdit : serveur de développement local uniquement")
            return None

        # Sécurité : décoder AVANT de filtrer, sinon « %2Eenv » passe le test
        # puis est décodé par SimpleHTTPRequestHandler, qui sert le fichier.
        chemin = unquote(self.path.split("?")[0])

        # Sécurité : bloquer l'accès aux fichiers et dossiers cachés (.env, .git, etc.)
        parties = [p for p in chemin.strip("/").split("/") if p]
        if any(p.startswith(".") for p in parties):
            self.send_error(404, "Fichier non trouvé")
            return None
        return chemin

    def do_GET(self):
        chemin = self._chemin_autorise()
        if chemin is None:
            return
        route = ROUTES.get(chemin)
        if route:
            route.do_GET(self)
        else:
            super().do_GET()

    def do_POST(self):
        # Seuls les points d'entrée de l'API acceptent POST ; le reste du
        # serveur local ne sert que des fichiers.
        chemin = self._chemin_autorise()
        if chemin is None:
            return
        route = ROUTES.get(chemin)
        if route and hasattr(route, "do_POST"):
            route.do_POST(self)
        else:
            self.send_error(405, "Méthode non autorisée")

    def do_HEAD(self):
        # Même garde que GET : do_HEAD hérité la contournerait entièrement.
        if self._chemin_autorise() is None:
            return
        super().do_HEAD()

    def log_message(self, *args):
        pass  # silencieux

    def end_headers(self):
        for cle, valeur in ENTETES_SECURITE.items():
            self.send_header(cle, valeur)
        super().end_headers()


def charger_env_local(chemin=".env.local"):
    """Clés Supabase en local : `vercel env pull .env.local` les récupère,
    on les charge ici (sans écraser une variable déjà définie)."""
    if not os.path.exists(chemin):
        return
    with open(chemin, encoding="utf-8") as f:
        for ligne in f:
            ligne = ligne.strip()
            if not ligne or ligne.startswith("#") or "=" not in ligne:
                continue
            cle, val = ligne.split("=", 1)
            os.environ.setdefault(cle.strip(), val.strip().strip('"').strip("'"))


def adresse_reseau():
    """Adresse IPv4 de la machine sur le réseau local, vide si introuvable.

    Un socket UDP « connecté » n'envoie rien : il laisse le système
    choisir la route, donc la bonne carte (Wi-Fi, Ethernet)."""
    for cible in (("8.8.8.8", 53), ("1.1.1.1", 53)):
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(cible)
            return s.getsockname()[0]
        except OSError:
            continue
        finally:
            s.close()
    try:
        return socket.gethostbyname(socket.gethostname())
    except OSError:
        return ""


def main(argv):
    lan = "--lan" in argv or os.environ.get("EZH_LAN") == "1"
    port = PORT_DEFAUT
    if "--port" in argv:
        try:
            port = int(argv[argv.index("--port") + 1])
        except (IndexError, ValueError):
            sys.exit("--port attend un numéro, ex. --port 8912.")
    Handler.LAN = lan
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    charger_env_local()
    try:
        srv = Serveur(("::", port), Handler)
    except OSError:
        sys.exit(f"Le port {port} est déjà utilisé : un autre serve.py tourne sans doute "
                 f"encore (voir `lsof -i :{port}`) — `--port 8912` en prend un autre.")
    with srv:
        print(f"EzHoraire : http://localhost:{port}", flush=True)
        if lan:
            ip = adresse_reseau()
            if ip:
                print(f"Réseau local : http://{ip}:{port}", flush=True)
            print("Mode réseau local : tout appareil du réseau peut lire l'app "
                  "(pas d'authentification côté serveur).", flush=True)
        print("Ctrl+C pour arrêter.", flush=True)
        srv.serve_forever()


if __name__ == "__main__":
    main(sys.argv[1:])
