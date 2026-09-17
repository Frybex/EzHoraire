"""Sert l'app en local, avec la même API qu'en ligne.

Usage :  python3 serve.py
App :    http://localhost:8902 (8901 est pris par Horairelm)

GET /api/formations?ecole=heh                      formations de l'école
GET /api/horaires?ecole=heh&formation=..           horaire complet d'une formation
GET /api/recherche?ecole=ulb&genre=niveau&q=..     recherche en direct (ULB)
GET /api/ical?lien=..                              horaire d'un lien d'abonnement
GET /api/pdf?ecole=heh&formation=..&groupe=..&semaine=..   PDF officiel
"""
import os
import socket
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "api"))

import formations  # noqa: E402
import horaires  # noqa: E402
import ical  # noqa: E402
import pdf  # noqa: E402
import recherche  # noqa: E402
import config  # noqa: E402
import stats  # noqa: E402

PORT = 8902
ROUTES = {"/api/formations": formations.handler,
          "/api/horaires": horaires.handler,
          "/api/recherche": recherche.handler,
          "/api/ical": ical.handler,
          "/api/pdf": pdf.handler,
          "/api/config": config.handler,
          "/api/stats": stats.handler}

# En-têtes identiques à vercel.json (garder les deux synchronisés) : le site
# local doit se comporter comme la production, surtout pour la CSP.
# 'unsafe-inline' reste nécessaire pour le script et les styles embarqués
# dans index.html / dashboard.html ; le reste verrouille les sources.
CSP = ("default-src 'self'; "
       "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; "
       "style-src 'self' 'unsafe-inline'; "
       "img-src 'self' data: blob:; "
       "font-src 'self'; "
       "connect-src 'self' https://*.supabase.co; "
       "frame-src blob:; "
       "worker-src blob: https://cdnjs.cloudflare.com; "
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
    def _chemin_autorise(self):
        """Chemin décodé si la requête vient de la machine locale et ne vise
        pas un fichier caché, sinon None (une erreur a déjà été envoyée)."""
        # Sécurité : n'accepter que les connexions provenant de la machine locale
        ip = self.client_address[0]
        if ip not in ("127.0.0.1", "::1", "::ffff:127.0.0.1"):
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


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    charger_env_local()
    try:
        srv = Serveur(("::", PORT), Handler)
    except OSError:
        sys.exit(f"Le port {PORT} est déjà utilisé : un autre serve.py tourne sans doute encore "
                 f"(voir `lsof -i :{PORT}`).")
    with srv:
        print(f"EzHoraire : http://localhost:{PORT}")
        print("Ctrl+C pour arrêter.")
        srv.serve_forever()
