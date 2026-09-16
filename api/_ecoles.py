"""Écoles prises en charge et petites aides HTTP communes aux points d'entrée.

Ajouter une école : un module (comme _heh.py) qui expose NOM, formations(),
horaire() et pdf_semaine(), puis une ligne dans ECOLES.
"""
import json
import os
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
if ICI not in sys.path:
    sys.path.insert(0, ICI)

import _heh  # noqa: E402

ECOLES = {"heh": _heh}


def ecole(q):
    """Module de l'école demandée (?ecole=heh), ou None."""
    return ECOLES.get((q.get("ecole") or [""])[0])


def repondre_json(h, statut, objet, cache="no-store"):
    payload = json.dumps(objet, ensure_ascii=False).encode("utf-8")
    h.send_response(statut)
    h.send_header("Content-Type", "application/json; charset=utf-8")
    h.send_header("Content-Length", str(len(payload)))
    h.send_header("Cache-Control", cache)
    h.end_headers()
    h.wfile.write(payload)


def repondre_texte(h, statut, message, cache="no-store"):
    payload = message.encode("utf-8")
    h.send_response(statut)
    h.send_header("Content-Type", "text/plain; charset=utf-8")
    h.send_header("Content-Length", str(len(payload)))
    h.send_header("Cache-Control", cache)
    h.end_headers()
    h.wfile.write(payload)
