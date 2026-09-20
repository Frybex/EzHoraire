/* Semaine affichée d'office : celle de la date du jour, sauf une fois la
   semaine de cours terminée. Le basculement se fait le week-end, le
   lendemain du dernier jour de cours de la semaine en cours :
     - semaine du lundi au vendredi : dès le samedi ;
     - semaine qui va jusqu'au samedi (cours le samedi) : dès le dimanche ;
     - semaine qui va jusqu'au dimanche (cours le dimanche) : le lundi,
       comme d'habitude (le changement de semaine calendaire suffit).
   En semaine, rien ne change : un cours du mardi passé ne fait pas sauter
   la semaine dès le mercredi.

   Fonctions pures, sans DOM ni stockage : index.html les utilise via
   window.EZH_SEMAINE, et test_semaine.mjs les vérifie avec `node --test`. */
(function (racine) {
  "use strict";

  // Samedi : premier jour où la semaine peut basculer (0 = lundi … 6 = dimanche).
  var PREMIER_JOUR_BASCULE = 5;

  /* Jour (0 = lundi … 6 = dimanche) de la dernière séance de `cours` dans
     la semaine `s`, ou -1 si la semaine n'a aucun cours (congés, semaine
     vide). `cours` est déjà filtré selon les groupes de l'étudiant. */
  function dernierJourDeCours(cours, s) {
    var dernier = -1;
    (cours || []).forEach(function (c) {
      if ((c.semaines || []).indexOf(s) >= 0 && c.jour > dernier) dernier = c.jour;
    });
    return dernier;
  }

  /* Semaine à afficher pour la date `auj`, parmi les semaines publiées
     `semaines` (triées) : la semaine calendaire de `auj` par rapport au
     lundi `premierLundi` (Date ou « AAAA-MM-JJ »), avancée d'une semaine
     quand on est sur un jour de week-end déjà passé le dernier cours. */
  function semaineAffichee(premierLundi, semaines, cours, auj) {
    if (!semaines || !semaines.length) return 1;
    var lundi = premierLundi instanceof Date
      ? premierLundi
      : (function (iso) {
          var p = String(iso).split("-");
          return new Date(+p[0], +p[1] - 1, +p[2]);
        })(premierLundi);
    if (!lundi || isNaN(+lundi)) return semaines[0];
    var jour = new Date(auj.getFullYear(), auj.getMonth(), auj.getDate());
    // arrondi, pas plancher : deux minuits encadrant le changement d'heure
    // sont séparés de 23 h ou 25 h par jour calendaire, le plancher
    // reculerait alors d'un jour (donc parfois d'une semaine pile un lundi).
    var diff = Math.round((jour - lundi) / 86400000);
    var s = Math.floor(diff / 7) + 1;
    var jourSem = diff - (s - 1) * 7; // 0 = lundi … 6 = dimanche
    if (jourSem >= PREMIER_JOUR_BASCULE && jourSem > dernierJourDeCours(cours, s)) s += 1;
    if (s <= semaines[0]) return semaines[0];
    if (s >= semaines[semaines.length - 1]) return semaines[semaines.length - 1];
    if (semaines.indexOf(s) >= 0) return s;
    // Semaine « trou » non publiée par l'école (congés…) : la publiée suivante.
    for (var i = 0; i < semaines.length; i++) if (semaines[i] > s) return semaines[i];
    return semaines[semaines.length - 1];
  }

  var api = {
    dernierJourDeCours: dernierJourDeCours,
    semaineAffichee: semaineAffichee
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else racine.EZH_SEMAINE = api;
})(typeof window !== "undefined" ? window : this);
