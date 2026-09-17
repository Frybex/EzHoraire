"""GET /api/config — configuration publique de l'app.

{"ok": true, "supabase": {...}, "ecoles": ["heh", "umons", "ulb"]}

L'URL et la clé *anon* (publique) sont lues dans l'environnement Vercel
(SUPABASE_URL / SUPABASE_ANON_KEY, alias NEXT_PUBLIC_* acceptés). Sans
elles, l'app tourne en mode local (stub, comme avant) : rien ne casse.

`ecoles` est la liste réellement exposée par le serveur : l'app ne
propose que celles-là. Une école en test (UCLouvain) n'y apparaît que si
l'hébergeur pose EZH_UCL=1 (voir api/_ecoles.py).
"""
import os
import sys
from http.server import BaseHTTPRequestHandler

ICI = os.path.dirname(os.path.abspath(__file__))
if ICI not in sys.path:
    sys.path.insert(0, ICI)

from _ecoles import ECOLES, repondre_json  # noqa: E402


def lire_config():
    url = (os.environ.get("SUPABASE_URL")
           or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
    cle = (os.environ.get("SUPABASE_ANON_KEY")
           or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or "").strip()
    return url, cle


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        url, cle = lire_config()
        repondre_json(self, 200, {
            "ok": True,
            "supabase": {"url": url, "anonKey": cle, "configure": bool(url and cle)},
            "ecoles": list(ECOLES),
        })

    def log_message(self, *args):
        pass  # silencieux
