"""Jev (TypeSafe) : petits jugements typés, côté serveur uniquement.

La clé `TYPESAFE_API_KEY` vit dans l'environnement (.env.local en local,
variables Vercel en ligne) : jamais dans le navigateur, jamais dans le
dépôt. Sans clé, `disponible()` est faux et l'appelant se rabat sur ce que
le code sait faire seul (pas d'IA).
"""
import os

import requests

URL = "https://api.typesafe.ai/v1/systemone"
MODELE = "jev-latest"
TIMEOUT = 25


def disponible():
    return bool(os.environ.get("TYPESAFE_API_KEY"))


def choix(state, questions, timeout=TIMEOUT):
    """Pose des questions Choice et renvoie la réponse brute par question.

    `questions` : {id: (instructions, {option: description})}. Le choix
    retourné est une clé de `option` ; `confidence` dit à quel point la
    distribution est tranchée (à lire, pas à subir).
    """
    cle = os.environ.get("TYPESAFE_API_KEY")
    if not cle:
        raise RuntimeError("Jev n'est pas configuré (TYPESAFE_API_KEY absente).")
    corps = {
        "state": state,
        "model": MODELE,
        "questions": {
            ident: {"type": "choice", "instructions": instructions, "criteria": criteres}
            for ident, (instructions, criteres) in questions.items()
        },
    }
    r = requests.post(URL, json=corps, timeout=timeout,
                      headers={"Authorization": f"Bearer {cle}",
                               "Content-Type": "application/json"})
    if r.status_code >= 400:
        # Jamais la clé ni les en-têtes dans le message : juste de quoi agir.
        raise RuntimeError(f"Jev a refusé la demande (HTTP {r.status_code}).")
    reponses = (r.json() or {}).get("answers") or {}
    return {ident: reponses.get(ident) or {} for ident in questions}
