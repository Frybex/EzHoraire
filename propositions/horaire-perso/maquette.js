/* Maquette cliquable « horaire sur mesure ».
   Un routeur d'écrans par ancre (#horaire, #composer2…), le rendu de la
   semaine à partir d'une liste de cours, et trois broutilles d'interaction
   (thème, pastilles, dépliage d'un jour). Aucun rapport avec le vrai code
   de l'app : c'est une planche de travail. */
(function () {
  "use strict";

  /* Week-end du 16 au 20 novembre 2026. Heures et données plausibles. */
  var COURS = [
    { j: 0, m: "Analyse", src: "B1", h: 152, t: "08h30", f: "10h30", salle: "A.204", prof: "Mme Leroy" },
    { j: 0, m: "Réseaux", src: "B2", h: 292, t: "10h45", f: "12h45", salle: "A.018", prof: "Mme Lambert" },
    { j: 1, m: "Algorithmique", src: "B2", h: 221, t: "08h30", f: "10h30", salle: "A.204", prof: "M. Dupont" },
    { j: 1, m: "Analyse TP", src: "B1", h: 152, t: "10h45", f: "12h45", salle: "L2.11", prof: "Mme Leroy", choc: true },
    { j: 1, m: "Anglais", src: "B2", h: 332, t: "10h45", f: "12h45", salle: "C.301", prof: "Mme Smith", choc: true },
    { j: 2, m: "Cybersécurité", src: "OPT", h: 262, t: "09h00", f: "12h00", salle: "C.301", prof: "M. Peeters" },
    { j: 2, m: "Bases de données", src: "B2", h: 40, t: "13h45", f: "15h15", salle: "L2.11", prof: "M. Janssens" },
    { j: 3, m: "Systèmes", src: "B1", h: 204, t: "08h30", f: "10h30", salle: "A.204", prof: "M. Janssens" },
    { j: 3, m: "Mathématiques discrètes", src: "B1", h: 190, t: "10h45", f: "12h45", salle: "B.112", prof: "Mme Hardy" },
    { j: 3, m: "Projet", src: "B2", h: 18, t: "14h00", f: "17h00", salle: "L1.02", prof: "Mme Dubois" },
    { j: 4, m: "Analyse", src: "B1", h: 152, t: "10h45", f: "12h45", salle: "L2.11", prof: "Mme Leroy" },
    { j: 4, m: "Anglais", src: "B2", h: 332, t: "13h45", f: "15h15", salle: "C.301", prof: "Mme Smith" }
  ];
  var JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
  var DATES = [16, 17, 18, 19, 20];
  var SOURCES = {
    B1: { nom: "BA1 Informatique", detail: "3 cours choisis" },
    B2: { nom: "BA2 Informatique", detail: "Groupe B" },
    OPT: { nom: "Option Cybersécurité", detail: "BA3 Informatique" }
  };

  function tx(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function mins(h) { return (+h.slice(0, 2)) * 60 + (+h.slice(3, 5)); }
  function fmt(h) { return String(h).replace(/^0/, ""); }

  function coursDe(j) {
    return COURS.filter(function (c) { return c.j === j; })
      .sort(function (a, b) { return mins(a.t) - mins(b.t); });
  }

  function detailJour(liste) {
    var html = '<div><div class="box"><ol>';
    for (var i = 0; i < liste.length; i++) {
      var c = liste[i];
      var s = SOURCES[c.src];
      html += '<li class="c' + (c.choc ? " li-choc" : "") + '">' +
        '<button class="cbtn" type="button">' +
        '<span class="h">' + fmt(c.t) + " – " + fmt(c.f) + "</span>" +
        '<span class="cpoint" style="--h:' + c.h + ';--v:0" aria-hidden="true"></span>' +
        '<span class="m">' + tx(c.m) + "</span>" +
        '<span class="cfin">' +
        (c.choc ? '<span class="choc-tag">Chevauche</span>' : "") +
        '<span class="src-badge">' + c.src + "</span></span></button>" +
        '<div class="csub"><div><div class="csub-in">' +
        '<div><span class="k">Prof : </span>' + tx(c.prof) + "</div>" +
        '<div><span class="k">Salle : </span>' + tx(c.salle) + "</div>" +
        '<div><span class="k">Source : </span><span class="src">' + tx(s.nom + " · " + s.detail) + "</span></div>" +
        "</div></div></div></li>";
      if (i < liste.length - 1 && mins(liste[i + 1].t) >= mins(c.f)) {
        var p = mins(liste[i + 1].t) - mins(c.f);
        if (p > 0) html += '<li class="p">Pause · ' + fmt(c.f) + " – " + fmt(liste[i + 1].t) + "</li>";
      }
    }
    return html + "</ol></div></div>";
  }

  function rendreJours() {
    var html = "";
    for (var j = 0; j < 5; j++) {
      var liste = coursDe(j);
      var debut = liste[0].t, fin = liste.reduce(function (m, c) { return mins(c.f) > mins(m) ? c.f : m; }, liste[0].f);
      html += '<li class="day" data-jour="' + j + '">' +
        '<button type="button"><span class="dot" aria-hidden="true"></span>' +
        '<span class="dname"><strong>' + JOURS[j] + "</strong><span>" + DATES[j] + " nov.</span></span>" +
        '<span class="dsum busy">' + fmt(debut) + " → " + fmt(fin) + "</span>" +
        '<span class="chev" aria-hidden="true"></span></button>' +
        '<div class="detail">' + detailJour(liste) + "</div></li>";
    }
    Array.prototype.forEach.call(document.querySelectorAll("[data-jours]"), function (ul) {
      ul.innerHTML = html;
    });
  }

  /* ---------- Routeur d'écrans ---------- */
  var ECRANS = ["reglages", "formation", "composer0", "composer", "ajout", "source",
                "ajoutgroupes", "composer2", "composer3", "horaire", "modifier"];
  var VARIANTES = { detail: "horaire", pdf: "horaire",
                    "source-annee": "source", "source-cours": "source" };
  var ajouts = 0;
  var origineAjout = "composer0";
  var origineSource = "ajout";

  /* Écran « Les cours de cette année » : deux modes, l'année entière ou
     une sélection de cours (cours carrés). */
  function sourceMode(cours) {
    var panneauAnnee = document.querySelector('[data-source-panneau="annee"]');
    var panneauCours = document.querySelector('[data-source-panneau="cours"]');
    if (!panneauAnnee || !panneauCours) return;
    panneauAnnee.hidden = cours;
    panneauCours.hidden = !cours;
    var seg = document.querySelector('[data-ecran="source"] .seg');
    if (seg) seg.style.setProperty("--idx", cours ? 1 : 0);
    Array.prototype.forEach.call(document.querySelectorAll("[data-source-mode]"), function (b) {
      b.setAttribute("aria-selected",
        (b.getAttribute("data-source-mode") === (cours ? "cours" : "annee")) ? "true" : "false");
    });
    majCours();
  }
  function majCours() {
    var n = document.querySelectorAll('.cours-ligne[aria-pressed="true"]').length;
    var total = document.querySelectorAll(".cours-ligne").length;
    var compte = document.getElementById("cours-compte");
    if (compte) compte.textContent = n + (n === 1 ? " cours coché" : " cours cochés") + " sur " + total;
    var b = document.querySelector('[data-source-panneau="cours"] .primaire');
    if (!b) return;
    b.disabled = n === 0;
    b.textContent = n === 0 ? "Coche au moins un cours"
      : n === 1 ? "Ajouter ce cours" : "Ajouter ces " + n + " cours";
  }

  function ouvrirJour(n) {
    var d = document.querySelector('.day[data-jour="' + n + '"]');
    if (d) d.classList.add("open");
  }

  function afficher(id, majAncre) {
    var voulu = id;
    var variante = VARIANTES[id] || null;
    if (ECRANS.indexOf(id) < 0) id = variante || "reglages";
    Array.prototype.forEach.call(document.querySelectorAll("[data-ecran]"), function (s) {
      s.hidden = s.getAttribute("data-ecran") !== id;
    });
    // Replis de la semaine : jour ouvert / PDF ouvert seulement en variante.
    var zonePdf = document.getElementById("pdf-zone");
    if (zonePdf) zonePdf.hidden = (voulu !== "pdf");
    Array.prototype.forEach.call(document.querySelectorAll(".day"), function (d) {
      d.classList.remove("open");
    });
    if (voulu === "detail") ouvrirJour(1);
    if (id === "source") sourceMode(voulu === "source-cours");
    if (majAncre !== false) {
      try { history.replaceState(null, "", "#" + voulu); } catch (e) { /* fichier local */ }
    }
    var txtPdf = document.getElementById("pdf-btn-txt");
    if (txtPdf) txtPdf.innerHTML = voulu === "pdf"
      ? "Masquer le PDF" : 'PDF officiel<span class="sm"> de la semaine 47</span>';
    if (voulu === "pdf") {
      var b = document.getElementById("btn-pdf");
      if (b) setTimeout(function () { b.scrollIntoView({ block: "start" }); }, 0);
    } else {
      window.scrollTo(0, 0);
    }
  }
  window.maqAfficher = afficher;

  /* ---------- Clics ---------- */
  document.addEventListener("click", function (e) {
    var va = e.target.closest("[data-va]");
    if (va) {
      var cible = va.getAttribute("data-va");
      if (cible === "ajout") {
        var ici = document.querySelector("[data-ecran]:not([hidden])").getAttribute("data-ecran");
        origineAjout = ici;
        ajouts = (ici === "composer0") ? 0 : (ici === "composer" || ici === "ajoutgroupes") ? 1 : 2;
      }
      if (cible === "retour") {
        e.preventDefault();
        afficher(origineAjout);
        return;
      }
      if (cible === "retour-source") {
        e.preventDefault();
        afficher(origineSource);
        return;
      }
      if (cible === "source-annee" || cible === "source-cours" || cible === "source") {
        var dOu = document.querySelector("[data-ecran]:not([hidden])").getAttribute("data-ecran");
        origineSource = (dOu === "modifier") ? "modifier" : "ajout";
      }
      e.preventDefault();
      afficher(cible);
      return;
    }
    var sm = e.target.closest("[data-source-mode]");
    if (sm) {
      sourceMode(sm.getAttribute("data-source-mode") === "cours");
      return;
    }
    var cl = e.target.closest(".cours-ligne");
    if (cl) {
      cl.setAttribute("aria-pressed", cl.getAttribute("aria-pressed") === "true" ? "false" : "true");
      majCours();
      return;
    }
    var valid = e.target.closest("[data-valider-source]");
    if (valid) {
      ajouts++;
      afficher(ajouts <= 1 ? "composer" : ajouts === 2 ? "composer2" : "composer3");
      return;
    }
    var chip = e.target.closest(".chip");
    if (chip) {
      chip.setAttribute("aria-pressed", chip.getAttribute("aria-pressed") === "true" ? "false" : "true");
      return;
    }
    var th = e.target.closest(".theme-opt");
    if (th) {
      var groupe = th.parentElement;
      Array.prototype.forEach.call(groupe.querySelectorAll(".theme-opt"), function (b) {
        b.setAttribute("aria-checked", b === th ? "true" : "false");
      });
      var theme = th.querySelector(".theme-pastille").style.background;
      document.body.style.setProperty("--accent", theme);
      return;
    }
    var jour = e.target.closest(".day > button");
    if (jour) {
      jour.parentElement.classList.toggle("open");
      return;
    }
    var pdf = e.target.closest("#btn-pdf");
    if (pdf) {
      var z = document.getElementById("pdf-zone");
      z.hidden = !z.hidden;
      pdf.setAttribute("aria-expanded", z.hidden ? "false" : "true");
      var libelle = document.getElementById("pdf-btn-txt");
      if (libelle) libelle.innerHTML = z.hidden
        ? 'PDF officiel<span class="sm"> de la semaine 47</span>' : "Masquer le PDF";
      return;
    }
    var fermerPdf = e.target.closest(".pdf-fermer");
    if (fermerPdf) {
      document.getElementById("pdf-zone").hidden = true;
      return;
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") afficher("horaire");
  });

  window.addEventListener("hashchange", function () {
    afficher(location.hash.replace(/^#/, ""), false);
  });

  rendreJours();
  afficher(location.hash.replace(/^#/, "") || "reglages", false);
})();
