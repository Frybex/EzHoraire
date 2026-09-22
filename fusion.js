/* Horaire sur mesure : fusion de plusieurs sources (formations d'une même
   école) en un seul horaire, au format des réponses de api/horaires
   ({meta, formation, groupes, cours}).

   Fonctions pures, sans DOM ni stockage : index.html les utilise via
   window.EZH_FUSION, et test_fusion.mjs les vérifie avec `node --test`.
   Règles détaillées : propositions/horaire-perso/PLAN.md, §4.

   Une source : { ecole, formation, ical, role: "principale" | "ajout",
   groupes: [...], sans: [clés retirées], avec: [clés gardées] }.
   `avec` absent sur une année d'ajout = toute la sélection (parcours
   « PAR:… » de l'ULB / l'UCLouvain : les codes choisis sont déjà la
   sélection). */
(function (racine) {
  "use strict";

  var MAX_SOURCES = 6;
  var ECART_MAX_SEMAINES = 26; // au-delà : horaire d'une autre année (repli UCLouvain)
  // Code d'unité d'enseignement (ULB, UCLouvain) : même motif que RX_UE
  // dans api/_moteurs/timeedit.py.
  var RX_UE = /^[A-Z]{2,6}[0-9]{3,4}[A-Z]?$/;

  function propre(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }

  /* Groupes : même logique que memeGroupe() de index.html (nom complet
     « <formation>groupe » de l'UMONS ou nom court). */
  function aPrefixe(s) { return /^\s*</.test(String(s)); }
  function courtGroupe(s) { return propre(String(s).replace(/^\s*<[^>]*>/, "")); }
  function memeGroupe(a, b) {
    a = propre(a); b = propre(b);
    if (a === b) return true;
    if (aPrefixe(a) && aPrefixe(b)) return false;
    return courtGroupe(a) === courtGroupe(b);
  }
  function groupeDans(liste, g) {
    for (var i = 0; i < liste.length; i++) if (memeGroupe(liste[i], g)) return true;
    return false;
  }

  /* Clés de cours d'une séance : ce que l'étudiant coche.
     - ULB : `matiere` est une liste de codes UE (« COMMB115, COMMB230 ») ;
       une séance mutualisée appartient à chacun de ses codes ;
     - ailleurs : l'intitulé exact de l'école, code compris
       (« D-SCJU-200 - Obligations - partie 2 »). */
  function clesCours(matiere) {
    var brut = propre(matiere);
    var parts = brut.split(",").map(propre).filter(Boolean);
    if (parts.length && parts.every(function (p) { return RX_UE.test(p); })) return parts;
    return [brut || "Cours"];
  }

  /* Liste des cours d'une source, pour l'écran « quels cours ? » :
     [{cle, seances}] trié par clé (TP et théorie d'un même cours voisins). */
  function coursDeSource(data) {
    var compte = {};
    ((data && data.cours) || []).forEach(function (c) {
      clesCours(c.matiere).forEach(function (k) {
        compte[k] = (compte[k] || 0) + c.semaines.length;
      });
    });
    return Object.keys(compte).sort(function (a, b) {
      return a.localeCompare(b, "fr", { sensitivity: "base", numeric: true });
    }).map(function (k) { return { cle: k, seances: compte[k] }; });
  }

  function estParcours(source) {
    return String((source && source.formation) || "").indexOf("PAR:") === 0;
  }

  /* Règle 1 : le rôle décide des cours gardés. */
  function garderCours(c, source) {
    var cles = clesCours(c.matiere);
    if (source.role === "principale") {
      var sans = source.sans || [];
      return cles.some(function (k) { return sans.indexOf(k) < 0; });
    }
    if (!Array.isArray(source.avec)) return true; // parcours PAR: : tout
    return cles.some(function (k) { return source.avec.indexOf(k) >= 0; });
  }

  /* Règle 2 : les groupes de la source, filtrés chez elle (même règle
     que installer() de index.html). */
  function garderGroupe(c, sel) {
    if (!sel.length || !c.groupes || !c.groupes.length) return true;
    return c.groupes.some(function (g) { return groupeDans(sel, g); });
  }

  /* Séances gardées d'une source (copies, semaines non décalées). */
  function filtrerSource(data, source) {
    var sel = (source.groupes || []).map(propre).filter(Boolean);
    return ((data && data.cours) || []).filter(function (c) {
      return garderCours(c, source) && garderGroupe(c, sel);
    });
  }

  /* Copie de `data` réduite aux cours gardés : l'écran des groupes d'une
     source n'y voit que les groupes des cours cochés (PLAN §3.6). */
  function donneesCochees(data, source) {
    var cours = ((data && data.cours) || []).filter(function (c) { return garderCours(c, source); });
    var vus = {};
    cours.forEach(function (c) { (c.groupes || []).forEach(function (g) { vus[g] = true; }); });
    var copie = {};
    for (var k in data) if (Object.prototype.hasOwnProperty.call(data, k)) copie[k] = data[k];
    copie.cours = cours;
    copie.groupes = (data.groupes || []).filter(function (g) { return vus[g]; });
    return copie;
  }

  /* Ensembles « [1..14,16] » (format de l'API). */
  function parseEns(txt) {
    var out = [];
    String(txt == null ? "" : txt).replace(/[\[\]]/g, "").split(",").forEach(function (part) {
      part = part.trim();
      if (!part) return;
      if (part.indexOf("..") >= 0) {
        var b = part.split("..");
        for (var i = +b[0]; i <= +b[1]; i++) out.push(i);
      } else if (!isNaN(+part)) out.push(+part);
    });
    return out;
  }
  /* Numéros de semaine publiés par l'école qu'on n'a pas encore vus
     (`connues` et `periode` sont des ensembles au format de l'API).
     Sert à l'alerte « nouvelles semaines disponibles » : l'école publie
     l'année par tranches (la HEH commence par [1..14], puis allonge). */
  function nouvellesSemaines(connues, periode) {
    var vues = parseEns(connues == null ? "[]" : connues);
    return parseEns(periode == null ? "[]" : periode).filter(function (w) {
      return vues.indexOf(w) < 0;
    }).sort(function (a, b) { return a - b; });
  }
  function formatEns(nombres) {
    var t = nombres.slice().sort(function (a, b) { return a - b; })
      .filter(function (n, i, arr) { return i === 0 || n !== arr[i - 1]; });
    var morceaux = [], i = 0;
    while (i < t.length) {
      var j = i;
      while (j + 1 < t.length && t[j + 1] === t[j] + 1) j++;
      morceaux.push(j > i ? t[i] + ".." + t[j] : String(t[i]));
      i = j + 1;
    }
    return "[" + morceaux.join(",") + "]";
  }
  function jourUTC(iso) {
    var p = String(iso).split("-");
    return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000;
  }
  function mins(h) { return (+String(h).slice(0, 2)) * 60 + (+String(h).slice(3, 5)); }

  function valide(d) {
    return !!(d && d.meta && d.meta.periode && d.meta.premier_lundi && d.cours && d.groupes);
  }

  /* Fusion. `entrees` : [{ source, data }] dans l'ordre des sources
     (la principale d'abord) ; `data` null = source indisponible.
     Renvoie un horaire au format de l'API, plus :
       perso: true, et infos = { manquantes: [i], ecartees: [i],
       perdus: [{ i, groupes }], disparus: [{ i, cles }] }.
     Chaque séance porte `src` (index de la source d'origine) et `srcs`
     (toutes les sources qui la donnent, après dédoublonnage). */
  function fusionner(entrees) {
    // deltas : décalage (en semaines) de chaque source gardée, pour lui
    // redemander sa propre semaine (PDF officiel).
    var infos = { manquantes: [], ecartees: [], perdus: [], disparus: [], deltas: {} };
    var dispo = [];
    entrees.forEach(function (e, i) {
      if (e && e.data && valide(e.data)) dispo.push({ i: i, source: e.source, data: e.data });
      else infos.manquantes.push(i);
    });
    // Règle 3. L'ancre est la première source disponible (la principale) :
    // une source à plus de 26 semaines d'elle est l'horaire d'une autre
    // année (repli UCLouvain) et part. Parmi les autres, la référence est
    // le lundi le plus tôt : aucun décalage négatif, aucune semaine perdue.
    var ancre = dispo.length ? jourUTC(dispo[0].data.meta.premier_lundi) : NaN;
    var gardees = [];
    dispo.forEach(function (x) {
      var ecart = jourUTC(x.data.meta.premier_lundi) - ancre;
      if (isNaN(ecart) || ecart % 7 !== 0 || Math.abs(ecart / 7) > ECART_MAX_SEMAINES) {
        infos.ecartees.push(x.i);
        return;
      }
      gardees.push(x);
    });
    var ref = gardees.length
      ? Math.min.apply(null, gardees.map(function (x) { return jourUTC(x.data.meta.premier_lundi); }))
      : null;
    gardees.forEach(function (x) {
      x.delta = (jourUTC(x.data.meta.premier_lundi) - ref) / 7;
      infos.deltas[x.i] = x.delta;
    });

    var periode = [], feries = [], feriesNoms = {}, ts = 0, fetched = "", cours = [];
    var parCle = {}; // séances des sources déjà traitées (dédoublonnage entre sources)
    gardees.forEach(function (x) {
      var d = x.data, delta = x.delta;
      parseEns(d.meta.periode).forEach(function (w) { periode.push(w + delta); });
      parseEns(d.meta.feries || "[]").forEach(function (n) { feries.push(n + 7 * delta); });
      var noms = d.meta.feries_noms;
      if (noms && typeof noms === "object") {
        Object.keys(noms).forEach(function (k) {
          var n = +k + 7 * delta;
          if (!isNaN(n) && feriesNoms[n] == null) feriesNoms[n] = noms[k];
        });
      }
      if ((d.meta.ts || 0) > ts) { ts = d.meta.ts || 0; fetched = d.meta.fetched_at || ""; }

      // Groupes choisis qui n'existent plus chez l'école (par source).
      var sel = (x.source.groupes || []).map(propre).filter(Boolean);
      var perdus = sel.filter(function (g) { return !groupeDans(d.groupes || [], g); });
      if (perdus.length) infos.perdus.push({ i: x.i, groupes: perdus });
      // Cours cochés d'une année d'ajout qui n'existent plus (renommés).
      if (x.source.role !== "principale" && Array.isArray(x.source.avec)) {
        var existe = {};
        coursDeSource(d).forEach(function (c) { existe[c.cle] = true; });
        var disparus = x.source.avec.filter(function (k) { return !existe[k]; });
        if (disparus.length) infos.disparus.push({ i: x.i, cles: disparus });
      }

      var ajouts = {};
      filtrerSource(d, x.source).forEach(function (c) {
        var semaines = c.semaines.map(function (w) { return w + delta; });
        var cle = [c.matiere, c.jour, c.debut, c.fin, c.salles, c.profs, c.type].join("\u0001");
        var deja = parCle[cle];
        if (deja) { // Règle 4 : même séance donnée par une source précédente
          var union = {};
          deja.semaines.concat(semaines).forEach(function (w) { union[w] = true; });
          deja.semaines = Object.keys(union).map(Number).sort(function (a, b) { return a - b; });
          (c.groupes || []).forEach(function (g) { if (deja.groupes.indexOf(g) < 0) deja.groupes.push(g); });
          if (deja.srcs.indexOf(x.i) < 0) deja.srcs.push(x.i);
          return;
        }
        var copie = {};
        for (var k in c) if (Object.prototype.hasOwnProperty.call(c, k)) copie[k] = c[k];
        copie.semaines = semaines;
        copie.groupes = (c.groupes || []).slice();
        copie.src = x.i;
        copie.srcs = [x.i];
        cours.push(copie);
        if (!ajouts[cle]) ajouts[cle] = copie;
      });
      for (var c2 in ajouts) if (!parCle[c2]) parCle[c2] = ajouts[c2];
    });
    cours.sort(function (a, b) {
      return (a.semaines[0] - b.semaines[0]) || (a.jour - b.jour) || (mins(a.debut) - mins(b.debut));
    });
    return {
      meta: {
        fetched_at: fetched,
        ts: ts,
        premier_lundi: ref === null ? "" : isoDe(ref),
        periode: formatEns(periode),
        feries: formatEns(feries),
        feries_noms: feriesNoms,
        source: gardees.length + " source" + (gardees.length > 1 ? "s" : "")
      },
      formation: "",
      groupes: [],
      cours: cours,
      perso: true,
      infos: infos
    };
  }
  function isoDe(jour) {
    var d = new Date(jour * 86400000);
    function deux(n) { return (n < 10 ? "0" : "") + n; }
    return d.getUTCFullYear() + "-" + deux(d.getUTCMonth() + 1) + "-" + deux(d.getUTCDate());
  }

  /* Chevauchements entre sources différentes (PLAN §4.3). À l'intérieur
     d'une source, les superpositions sont celles d'un horaire normal
     (groupes, séances communes) : on ne les signale pas.
     Renvoie [{ a, b, semaines }] (a et b : séances de `cours`). */
  function chevauchements(cours) {
    var parJour = {};
    (cours || []).forEach(function (c) { (parJour[c.jour] || (parJour[c.jour] = [])).push(c); });
    var chocs = [];
    Object.keys(parJour).forEach(function (j) {
      var l = parJour[j].slice().sort(function (a, b) { return mins(a.debut) - mins(b.debut); });
      for (var i = 0; i < l.length; i++) {
        var a = l[i], finA = mins(a.fin);
        for (var k = i + 1; k < l.length; k++) {
          var b = l[k];
          if (mins(b.debut) >= finA) break; // triées par début : plus rien ne chevauche a
          var srcsA = a.srcs || [a.src], srcsB = b.srcs || [b.src];
          if (srcsA.some(function (s) { return srcsB.indexOf(s) >= 0; })) continue; // même source
          var communes = a.semaines.filter(function (w) { return b.semaines.indexOf(w) >= 0; });
          if (communes.length) chocs.push({ a: a, b: b, semaines: communes });
        }
      }
    });
    return chocs;
  }

  /* Contrôle d'une source venue du stockage ou du cloud : copie propre,
     ou null. `ecoleOk(id)` dit si l'école existe. */
  function normaliserSource(s, ecoleOk) {
    if (!s || typeof s !== "object") return null;
    var formation = String(s.formation || "");
    if (!formation || formation.length > 200 || typeof s.ecole !== "string" || !ecoleOk(s.ecole)) return null;
    function liste(v, max) {
      return Array.isArray(v)
        ? v.filter(function (x) { return typeof x === "string"; }).map(propre).filter(Boolean).slice(0, max)
        : null;
    }
    var out = {
      ecole: s.ecole,
      formation: formation,
      ical: typeof s.ical === "string" ? s.ical.slice(0, 1200) : "",
      role: s.role === "principale" ? "principale" : "ajout",
      groupes: liste(s.groupes, 60) || [],
      surnom: typeof s.surnom === "string" ? propre(s.surnom).slice(0, 40) : ""
    };
    if (out.role === "principale") out.sans = liste(s.sans, 120) || [];
    else {
      var avec = liste(s.avec, 120);
      if (avec && avec.length) out.avec = avec;
      else if (!estParcours(out)) return null; // une année d'ajout sans cours ne sert à rien
    }
    return out;
  }
  /* Sources d'un profil : 1 à 6, même école, au plus une principale.
     Renvoie la liste nettoyée, ou null si le profil n'est pas un perso valide. */
  function sourcesValides(p, ecoleOk) {
    if (!p || !Array.isArray(p.sources) || !p.sources.length || p.sources.length > MAX_SOURCES) return null;
    var out = [], principale = false;
    for (var i = 0; i < p.sources.length; i++) {
      var s = normaliserSource(p.sources[i], ecoleOk);
      if (!s || s.ecole !== p.ecole) return null;
      if (s.role === "principale") {
        if (principale) { s.role = "ajout"; delete s.sans; if (!estParcours(s)) return null; }
        principale = true;
      }
      out.push(s);
    }
    return out;
  }
  function memeSource(a, b) {
    return a.ecole === b.ecole && a.formation === b.formation && (a.ical || "") === (b.ical || "");
  }

  var api = {
    MAX_SOURCES: MAX_SOURCES,
    ECART_MAX_SEMAINES: ECART_MAX_SEMAINES,
    propre: propre,
    courtGroupe: courtGroupe,
    aPrefixe: aPrefixe,
    memeGroupe: memeGroupe,
    groupeDans: groupeDans,
    clesCours: clesCours,
    coursDeSource: coursDeSource,
    estParcours: estParcours,
    garderCours: garderCours,
    filtrerSource: filtrerSource,
    donneesCochees: donneesCochees,
    parseEns: parseEns,
    formatEns: formatEns,
    nouvellesSemaines: nouvellesSemaines,
    fusionner: fusionner,
    chevauchements: chevauchements,
    normaliserSource: normaliserSource,
    sourcesValides: sourcesValides,
    memeSource: memeSource
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else racine.EZH_FUSION = api;
})(typeof window !== "undefined" ? window : this);
