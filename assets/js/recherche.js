/* Recherche d'un cours dans l'horaire affiché : filtrage par le début de
   n'importe quel mot de l'intitulé (« obj » trouve « Programmation
   orientée objet »), et classement des séances d'un cours par semaine.
   Indépendant de l'école et du profil : l'app lui passe les cours déjà
   filtrés selon les groupes de l'étudiant (la même liste que la grille).

   Fonctions pures, sans DOM ni stockage : index.html les utilise via
   window.EZH_RECHERCHE, et test_recherche.mjs les vérifie avec
   `node --test`. */
(function (racine) {
  "use strict";

  function normaliser(s) {
    return String(s == null ? "" : s).toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  /* Découpe en mots : tout ce qui n'est pas lettre ou chiffre sépare
     (« Programmation orientée objet » -> [programmation, orientee,
     objet] ; « 1/36A » -> [1, 36a]). */
  function mots(s) {
    return normaliser(s).replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean);
  }
  /* Vrai quand chaque mot de `requete` commence un mot de `texte` :
     « an » trouve « Analyse » et « Anglais », « prog obj » trouve
     « Programmation orientée objet ». Sans requête, tout correspond. */
  function correspond(texte, requete) {
    var q = mots(requete);
    if (!q.length) return true;
    var m = mots(texte);
    for (var i = 0; i < q.length; i++) {
      var ok = false;
      for (var j = 0; j < m.length; j++) {
        if (m[j].indexOf(q[i]) === 0) { ok = true; break; }
      }
      if (!ok) return false;
    }
    return true;
  }

  function echapper(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  /* Intitulé prêt pour la liste : chaque mot commencé par un mot de la
     requête est marqué (<mark>), le reste est échappé. Le marquage porte
     sur le texte brut (accents compris) : sa longueur suit celle du mot
     normalisé, qui ne perd que les diacritiques. */
  function surligner(texte, requete) {
    var q = mots(requete);
    var t = String(texte == null ? "" : texte);
    if (!q.length) return echapper(t);
    var sortie = "", i = 0, m;
    var rx = /[0-9A-Za-z\u00C0-\u024F]+/g;
    while ((m = rx.exec(t))) {
      sortie += echapper(t.slice(i, m.index));
      var mot = m[0], n = normaliser(mot), coupe = 0;
      for (var k = 0; k < q.length; k++) {
        if (n.indexOf(q[k]) === 0 && q[k].length > coupe) coupe = q[k].length;
      }
      sortie += coupe
        ? "<mark>" + echapper(mot.slice(0, coupe)) + "</mark>" + echapper(mot.slice(coupe))
        : echapper(mot);
      i = m.index + mot.length;
    }
    return sortie + echapper(t.slice(i));
  }

  function erreur(c) { throw new Error("recherche : " + c); }

  /* Regroupe les cours de l'horaire par intitulé brut — c'est lui qui
     porte la couleur (voir COULEURS dans app.js). `nettoyer` (optionnel)
     donne le nom affiché, sans le code de l'école. Chaque groupe :
     { matiere, nom, seances: [{ cours, semaine }] } ; les séances sont
     triées par semaine puis jour puis heure. Les groupes sortent triés
     sur le nom affiché (ordre alphabétique français). */
  function grouper(cours, nettoyer) {
    if (cours != null && !Array.isArray(cours)) erreur("cours doit être un tableau");
    var parMatiere = {}, liste = [];
    (cours || []).forEach(function (c) {
      var brut = String(c.matiere == null ? "" : c.matiere) || "Cours";
      var g = parMatiere[brut];
      if (!g) {
        g = parMatiere[brut] = { matiere: brut, nom: nettoyer ? nettoyer(brut) : brut, seances: [] };
        liste.push(g);
      }
      (c.semaines || []).forEach(function (s) {
        g.seances.push({ cours: c, semaine: s });
      });
    });
    liste.forEach(function (g) {
      g.seances.sort(function (a, b) {
        if (a.semaine !== b.semaine) return a.semaine - b.semaine;
        if (a.cours.jour !== b.cours.jour) return a.cours.jour - b.cours.jour;
        return a.cours.debut < b.cours.debut ? -1 : a.cours.debut > b.cours.debut ? 1 : 0;
      });
    });
    liste.sort(function (a, b) { return normaliser(a.nom).localeCompare(normaliser(b.nom)); });
    return liste;
  }

  /* Groupes dont l'intitulé correspond à la requête. La recherche porte
     sur l'intitulé brut : le code de l'école reste cherchable (« droi »
     trouve « DROI-D-1001 - Droit romain »). */
  function filtrer(groupes, requete) {
    if (!mots(requete).length) return groupes.slice();
    return (groupes || []).filter(function (g) { return correspond(g.matiere, requete); });
  }

  var api = {
    normaliser: normaliser,
    mots: mots,
    correspond: correspond,
    surligner: surligner,
    grouper: grouper,
    filtrer: filtrer
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else racine.EZH_RECHERCHE = api;
})(typeof window !== "undefined" ? window : this);
