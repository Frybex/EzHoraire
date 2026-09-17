"""Import d'une liste de cours (copier-coller de MonULB / TimeEdit).

Le code fait le travail sûr — découper les lignes, repérer les codes,
chercher dans le catalogue de l'année — et Jev (TypeSafe) tranche les cas
flous : un code abîmé (« COMMB3O5 »), une ligne sans code (« Espagnol I »).
L'app montre ensuite la liste trouvée à l'étudiant : c'est lui qui valide.
"""
import difflib
import re

from . import typesafe as _typesafe

RX_CODE = re.compile(r"\b([A-Z]{2,6}[0-9]{3,4})\b")
# Code abîmé (OCR, frappe) : O/0, I/1, S/5 se confondent — on le repère quand
# il reste au moins deux chiffres et une majorité de lettres.
RX_CODE_ABIME = re.compile(r"\b([A-Z]{3,6}[0-9A-Z]{2,6})\b")
RX_ANNEE = re.compile(r"\b(?:20[0-9]{2}[-/]20[0-9]{2}|20[0-9]{4})\b")
LIGNES_MAX = 40
# Chaque recherche inédite = un appel à l'école. Une liste collée en compte
# autant que de lignes ; on borne donc le nombre de recherches DIFFÉRENTES
# d'un import (les répétitions, elles, sont gratuites : `_Catalogue` les
# mémorise). Au-delà, les lignes restantes partent en « à confirmer »
# plutôt que de faire travailler l'école pour un copier-coller géant.
RECHERCHES_MAX = 25
# Sous ce seuil, on ne choisit pas à la place de l'étudiant : la ligne part
# en « à confirmer » avec les candidats (plusieurs cours peuvent porter le
# même intitulé — « Espagnol I » existe dans plusieurs facultés).
CONFIANCE_MIN = 0.6
COURS_MAX = 40
PROPOSITIONS = 5


def _ligne(texte):
    """(code ou '', intitulé) d'une ligne de liste."""
    t = " ".join(str(texte).split())
    m = RX_CODE.search(t)
    if not m:
        for essai in RX_CODE_ABIME.finditer(t):
            jeton = essai.group(1)
            if sum(c.isdigit() for c in jeton) >= 2 and sum(c.isalpha() for c in jeton) >= 3:
                m = essai
                break
    code = m.group(1) if m else ""
    reste = (t[:m.start()] + " " + t[m.end():]) if m else t
    reste = RX_ANNEE.sub(" ", reste)
    reste = " ".join(reste.split(" |,;–—·:\t")).strip(" ,;|–—·:\t")
    return code, reste


def _proches(candidats, cible, clef, nombre=PROPOSITIONS):
    """Les `nombre` candidats les plus proches de `cible` (texte)."""
    def note(c):
        return difflib.SequenceMatcher(None, cible.upper(), str(clef(c)).upper()).ratio()
    return sorted(candidats, key=note, reverse=True)[:nombre]


class _Catalogue:
    """Recherches de l'école pour un import : sans doublon, et bornées.

    Une liste collée cherche souvent la même chose plusieurs fois (deux
    lignes du même cours, le préfixe de lettres d'un code abîmé). Une fois
    le plafond atteint, `cherche()` ne rend que ce qui est déjà connu."""

    def __init__(self, mod, maximum=RECHERCHES_MAX):
        self.mod = mod
        self.maximum = maximum
        self.vu = {}

    def cherche(self, texte, genre="ue"):
        cle = (genre, " ".join(str(texte or "").split()).lower())
        if cle in self.vu:
            return self.vu[cle]
        if len(self.vu) >= self.maximum:
            return []
        essais = self.mod.recherche(texte, genre)
        self.vu[cle] = essais
        return essais


def _exact(resultats, code, annee):
    for r in resultats:
        if r.get("code") == code and str(r.get("annee") or annee) == annee:
            return r
    for r in resultats:
        if r.get("code") == code:
            return r
    return None


def importer(texte, mod, annee, budget=40):
    """Liste collée -> cours reconnus, doublons retirés, flous tranchés par Jev."""
    lignes = [" ".join(l.split()) for l in str(texte or "").splitlines()]
    lignes = [l for l in lignes if l][:LIGNES_MAX]
    catalogue = _Catalogue(mod)
    resultats, doutes = [], []
    for i, ligne in enumerate(lignes):
        code, titre = _ligne(ligne)
        cible = code or titre
        if len(cible) < 2:
            doutes.append({"i": i, "ligne": ligne, "motif": "illisible", "propositions": []})
            continue
        essais = catalogue.cherche(cible)
        if code:
            trouve = _exact(essais, code, annee)
            if trouve:
                resultats.append(dict(trouve, source="code"))
                continue
            # Code abîmé (OCR, frappe) : on cherche par préfixe de lettres.
            lettres = re.match(r"[A-Z]+", code)
            if lettres and lettres.group(0) != code:
                essais = essais + catalogue.cherche(lettres.group(0))
        elif titre:
            if len(essais) == 1:
                resultats.append(dict(essais[0], source="titre"))
                continue
            if essais:
                note = difflib.SequenceMatcher(None, titre.upper(),
                                               str(essais[0].get("titre", "")).upper()).ratio()
                if note >= 0.9:
                    resultats.append(dict(essais[0], source="titre"))
                    continue
        vus, propositions = set(), []
        for c in _proches(essais, cible, lambda x: x.get("code") if code else x.get("titre")):
            if c.get("code") and c["code"] not in vus:
                vus.add(c["code"])
                propositions.append(c)
        doutes.append({"i": i, "ligne": ligne, "code": code, "titre": titre,
                       "propositions": propositions})

    # Jev tranche les cas flous (s'il est configuré) : un seul appel groupé.
    jev = False
    if doutes and _typesafe.disponible():
        questions = {}
        for d in doutes:
            if not d["propositions"]:
                continue
            criteres = {"%s|%s" % (p["code"], p.get("titre", "")): p.get("titre", "")
                        for p in d["propositions"]}
            criteres["aucun"] = "aucun de ces cours"
            questions["l%d" % d["i"]] = (
                "La ligne « %s » vient d'une liste de cours de l'ULB "
                "(année %s). Quel cours du catalogue est visé ?"
                % (d["ligne"][:160], annee), criteres)
        if questions:
            try:
                reponses = _typesafe.choix(
                    "Liste de cours relevée par un étudiant :\n" +
                    "\n".join("- " + l[:160] for l in lignes), questions)
                jev = True
                for d in doutes:
                    rep = reponses.get("l%d" % d["i"]) or {}
                    choix = str(rep.get("choice") or "")
                    d["confiance"] = rep.get("confidence")
                    if not choix or choix == "aucun":
                        continue
                    code_vise = choix.split("|", 1)[0]
                    for p in d["propositions"]:
                        if p["code"] != code_vise:
                            continue
                        entree = dict(p, source="jev", releve=d.get("code") or d.get("titre"),
                                      confiance=rep.get("confidence"))
                        if (rep.get("confidence") or 0) >= CONFIANCE_MIN:
                            resultats.append(entree)
                        else:
                            d["choix"] = code_vise
                            d["confiance"] = rep.get("confidence")
                        break
            except Exception as e:  # noqa: BLE001 - Jev en panne : on continue sans lui
                print(f"ezh [import] jev indisponible: {e}", flush=True)

    # Mise en forme : doublons retirés (le premier gagne), ordre de lecture.
    vus, cours = set(), []
    for r in resultats:
        if not r.get("cle") or r["cle"] in vus:
            continue
        vus.add(r["cle"])
        cours.append({"cle": r["cle"], "code": r["code"], "titre": r.get("titre", ""),
                      "source": r.get("source"), "releve": r.get("releve", ""),
                      "confiance": r.get("confiance")})
        if len(cours) >= COURS_MAX:
            break
    inconnus = [d["ligne"] for d in doutes
                if not any(c.get("releve") == (d.get("code") or d.get("titre"))
                           for c in cours)]
    # « À confirmer » : lignes douteuses, avec les candidats et le cas échéant
    # le choix proposé par Jev (à valider par l'étudiant).
    a_confirmer = []
    for d in doutes:
        if any(c.get("releve") == (d.get("code") or d.get("titre")) for c in cours):
            continue
        a_confirmer.append({
            "ligne": d["ligne"],
            "releve": d.get("code") or d.get("titre") or "",
            "choix": d.get("choix", ""),
            "confiance": d.get("confiance"),
            "propositions": [{"code": p["code"], "titre": p.get("titre", ""),
                              "cle": p.get("cle", "")} for p in d["propositions"]],
        })
    return {"cours": cours, "a_confirmer": a_confirmer,
            "inconnus": [d["ligne"] for d in doutes if not d["propositions"]],
            "jev": jev}
