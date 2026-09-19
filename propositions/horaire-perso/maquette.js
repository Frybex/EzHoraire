/* Maquette cliquable « horaire sur mesure ».
   Un routeur d'écrans par ancre (#horaire, #composer2…), le rendu de la
   semaine à partir d'une liste de cours, et trois broutilles d'interaction
   (thème, pastilles, dépliage d'un jour). Aucun rapport avec le vrai code
   de l'app : c'est une planche de travail. */
(function () {
  "use strict";

  /* Week-end du 16 au 20 novembre 2026. Heures et données plausibles.
     Les teintes suivent l'algorithme de l'app (preparerCouleurs) sur les
     13 intitulés des 3 sources, triés : un intitulé = une couleur. */
  var COURS = [
    { j: 0, m: "Analyse", src: "B1", h: 332, t: "08h30", f: "10h30", salle: "A.204", prof: "Mme Leroy" },
    { j: 0, m: "Réseaux", src: "B2", h: 96, t: "10h45", f: "12h45", salle: "A.018", prof: "Mme Lambert" },
    { j: 1, m: "Algorithmique", src: "B2", h: 221, t: "08h30", f: "10h30", salle: "A.204", prof: "M. Dupont" },
    { j: 1, m: "Analyse TP", src: "B1", h: 332, t: "10h45", f: "12h45", salle: "L2.11", prof: "Mme Leroy", choc: true },
    { j: 1, m: "Anglais II", src: "B2", h: 262, t: "10h45", f: "12h45", salle: "C.301", prof: "Mme Smith", choc: true },
    { j: 2, m: "Cybersécurité", src: "OPT", h: 18, t: "09h00", f: "12h00", salle: "C.301", prof: "M. Peeters" },
    { j: 2, m: "Bases de données", src: "B2", h: 190, t: "13h45", f: "15h15", salle: "L2.11", prof: "M. Janssens" },
    { j: 3, m: "Systèmes", src: "B1", h: 172, t: "08h30", f: "10h30", salle: "A.204", prof: "M. Janssens" },
    { j: 3, m: "Mathématiques discrètes", src: "B1", h: 292, t: "10h45", f: "12h45", salle: "B.112", prof: "Mme Hardy" },
    { j: 4, m: "Analyse", src: "B1", h: 332, t: "10h45", f: "12h45", salle: "L2.11", prof: "Mme Leroy" },
    { j: 4, m: "Anglais II", src: "B2", h: 262, t: "13h45", f: "15h15", salle: "C.301", prof: "Mme Smith" }
  ];
  var JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
  var DATES = [16, 17, 18, 19, 20];
  var SOURCES = {
    B1: { nom: "BA1 Informatique", detail: "3 cours ajoutés" },
    B2: { nom: "BA2 Informatique", detail: "Année principale · 5 cours sur 6" },
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
  var VARIANTES = { detail: "horaire", pdf: "horaire", source: "source",
                    "source-principal": "source", "source-ajout": "source" };
  var ajouts = 0;
  var origineAjout = "composer0";
  var origineSource = "ajout";

  /* Cours de chaque année, pour l'écran de sélection.
     p : coché par défaut quand c'est l'année principale (on décoche).
     a : coché par défaut quand c'est une année d'ajout (on coche). */
  var SOURCES_COURS = {
    principal: {
      rang: 1, couleur: "#1d4fd7", nom: "BA2 Informatique",
      cours: [
        { m: "Algorithmique", d: "3 séances par semaine · CM + TP", c: "INF2101", p: true, a: false },
        { m: "Anglais II", d: "2 séances par semaine · CM", c: "LAN2101", p: true, a: false },
        { m: "Bases de données", d: "2 séances par semaine · CM + labo", c: "INF2102", p: true, a: false },
        { m: "Projet", d: "1 séance par semaine · Atelier", c: "INF2104", p: false, a: false },
        { m: "Réseaux", d: "2 séances par semaine · CM + labo", c: "INF2105", p: true, a: false },
        { m: "Tests logiciels", d: "1 séance par semaine · CM", c: "INF2106", p: true, a: false }
      ]
    },
    ajout: {
      rang: 2, couleur: "#0e8655", nom: "BA1 Informatique",
      cours: [
        { m: "Analyse", d: "2 séances par semaine · CM + TP", c: "MAT1101", p: true, a: true },
        { m: "Anglais I", d: "1 séance par semaine · CM", c: "LAN1101", p: true, a: false },
        { m: "Algorithmique I", d: "3 séances par semaine · CM + TP", c: "INF1101", p: true, a: false },
        { m: "Mathématiques discrètes", d: "1 séance par semaine · CM", c: "MAT1102", p: true, a: true },
        { m: "Structures de données", d: "2 séances par semaine · CM + TP", c: "INF1102", p: true, a: false },
        { m: "Systèmes", d: "2 séances par semaine · CM + labo", c: "INF1103", p: true, a: true }
      ]
    }
  };
  var sourceCle = "ajout";
  var roleSource = "ajout";

  function rendreSource(cle) {
    var s = SOURCES_COURS[cle];
    if (!s) return;
    sourceCle = cle;
    roleSource = (cle === "principal") ? "principale" : "ajout";
    var racine = document.querySelector('[data-ecran="source"]');
    if (!racine) return;
    var num = racine.querySelector("[data-src-num]");
    num.textContent = s.rang;
    num.style.setProperty("--src", s.couleur);
    racine.querySelector("[data-src-nom]").textContent = s.nom;
    racine.querySelector("[data-src-role]").textContent =
      roleSource === "principale" ? "Année principale" : "Source " + s.rang;
    var html = s.cours.map(function (c) {
      var coche = roleSource === "principale" ? c.p : c.a;
      return '<button type="button" class="cours-ligne" aria-pressed="' + (coche ? "true" : "false") + '">' +
        '<span class="coche" aria-hidden="true"></span>' +
        '<span class="ct"><strong>' + tx(c.m) + "</strong><small>" + tx(c.d) + "</small></span>" +
        '<span class="src-badge">' + tx(c.c) + "</span></button>";
    }).join("");
    racine.querySelector("[data-cours-liste]").innerHTML = html;
    appliquerRole(roleSource);
  }

  /* Change le rôle de la source : les cases reprennent le défaut du rôle
     (tout coché pour l'année principale, rien pour une année d'ajout). */
  function appliquerRole(role) {
    roleSource = role === "principale" ? "principale" : "ajout";
    var seg = document.querySelector('[data-ecran="source"] .seg');
    if (seg) seg.style.setProperty("--idx", roleSource === "principale" ? 0 : 1);
    Array.prototype.forEach.call(document.querySelectorAll("[data-source-mode]"), function (b) {
      b.setAttribute("aria-selected",
        b.getAttribute("data-source-mode") === roleSource ? "true" : "false");
    });
    var s = SOURCES_COURS[sourceCle];
    Array.prototype.forEach.call(document.querySelectorAll(".cours-ligne"), function (b, i) {
      var c = s.cours[i];
      if (!c) return;
      b.setAttribute("aria-pressed", ((roleSource === "principale" ? c.p : c.a) ? "true" : "false"));
    });
    document.getElementById("source-aide").textContent = roleSource === "principale"
      ? "Tous les cours de " + s.nom + " sont cochés : décoche ceux que tu ne suis pas cette année."
      : "Coche seulement les cours que tu ajoutes à ta semaine : le reste vient de ton année principale.";
    var bouton = document.querySelector('[data-ecran="source"] .primaire');
    if (bouton) {
      bouton.setAttribute("data-va", roleSource === "principale" ? "modifier" : "ajoutgroupes");
    }
    majCours();
  }

  function toutCocher(oui) {
    Array.prototype.forEach.call(document.querySelectorAll(".cours-ligne"), function (b) {
      b.setAttribute("aria-pressed", oui ? "true" : "false");
    });
    majCours();
  }

  function majCours() {
    var n = document.querySelectorAll('.cours-ligne[aria-pressed="true"]').length;
    var total = document.querySelectorAll(".cours-ligne").length;
    var compte = document.getElementById("cours-compte");
    var princip = roleSource === "principale";
    if (compte) {
      compte.textContent = princip
        ? n + (n === 1 ? " cours gardé" : " cours gardés") + " sur " + total +
          (total - n ? " · " + (total - n) + (total - n === 1 ? " retiré" : " retirés") : "")
        : n + (n === 1 ? " cours coché" : " cours cochés") + " sur " + total;
    }
    var b = document.querySelector('[data-ecran="source"] .primaire');
    if (!b) return;
    b.disabled = n === 0;
    b.textContent = n === 0
      ? (princip ? "Garde au moins un cours" : "Coche au moins un cours")
      : (princip ? (n === 1 ? "Garder ce cours" : "Garder ces " + n + " cours")
                 : (n === 1 ? "Ajouter ce cours" : "Ajouter ces " + n + " cours"));
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
    if (id === "source") rendreSource(voulu === "source-principal" ? "principal" : "ajout");
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
      if (cible === "source-annee" || cible === "source-principal" ||
          cible === "source-ajout" || cible === "source") {
        var dOu = document.querySelector("[data-ecran]:not([hidden])").getAttribute("data-ecran");
        origineSource = (dOu === "modifier") ? "modifier" : "ajout";
      }
      e.preventDefault();
      afficher(cible);
      return;
    }
    var sm = e.target.closest("[data-source-mode]");
    if (sm) {
      appliquerRole(sm.getAttribute("data-source-mode"));
      return;
    }
    var tt = e.target.closest("[data-cours-tout]");
    if (tt) {
      toutCocher(tt.getAttribute("data-cours-tout") === "1");
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
