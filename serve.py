"""Sert l'app en local, avec la même API qu'en ligne.

Usage :  python3 serve.py
App :    http://localhost:8902 (8901 est pris par Horairelm)

GET /api/formations?ecole=heh                      formations de l'école
GET /api/horaires?ecole=heh&formation=..           horaire complet d'une formation
GET /api/pdf?ecole=heh&formation=..&groupe=..&semaine=..   PDF officiel
"""
import os
import socket
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "api"))

import formations  # noqa: E402
import horaires  # noqa: E402
import pdf  # noqa: E402
import config  # noqa: E402

PORT = 8902
ROUTES = {"/api/formations": formations.handler,
          "/api/horaires": horaires.handler,
          "/api/pdf": pdf.handler,
          "/api/config": config.handler}


class Serveur(ThreadingHTTPServer):
    """Écoute en IPv4 ET IPv6 : « localhost » marche quel que soit le navigateur."""
    address_family = socket.AF_INET6

    def server_bind(self):
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        route = ROUTES.get(self.path.split("?")[0])
        if route:
            route.do_GET(self)
        else:
            super().do_GET()

    def log_message(self, *args):
        pass  # silencieux


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    try:
        srv = Serveur(("::", PORT), Handler)
    except OSError:
        sys.exit(f"Le port {PORT} est déjà utilisé : un autre serve.py tourne sans doute encore "
                 f"(voir `lsof -i :{PORT}`).")
    with srv:
        print(f"EzHoraire : http://localhost:{PORT}")
        print("Ctrl+C pour arrêter.")
        srv.serve_forever()
