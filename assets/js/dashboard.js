(function () {
  "use strict";
  var jours = 7, donnees = null, sb = null, requete = 0;
  var vue = { onglet: "apercu", ecoleOuverte: null, formsTout: {}, groupes: {}, n: {}, q: "", tri: "visite", ouvert: null };
  var $ = function (id) { return document.getElementById(id); };

  var ECOLES = {
    heh: { nom: "HEH", detail: "Haute École en Hainaut" },
    umons: { nom: "UMONS", detail: "Université de Mons" },
    condorcet: { nom: "Condorcet", detail: "Haute École de la Province de Hainaut" },
    helb: { nom: "HELB", detail: "Haute École libre de Bruxelles Ilya Prigogine" },
    ulb: { nom: "ULB", detail: "Université libre de Bruxelles" },
    ucl: { nom: "UCLouvain", detail: "Université catholique de Louvain" },
    ihecs: { nom: "IHECS", detail: "Institut des Hautes Études des Communications Sociales" }
  };
  var CHEV = '<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
  var ATTENTION = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>';

  function txt(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function nb(n) { return (+n || 0).toLocaleString("fr-BE"); }
  function pl(n, un, plusieurs) { return nb(n) + " " + ((+n || 0) > 1 ? (plusieurs || un + "s") : un); }
  // L'UMONS préfixe ses formations d'un point ('.BAB1 - Droit') : décapé à l'affichage.
  function joli(f) {
    return String(f == null ? "" : f).replace(/^\s*[.\s]+/, "").replace(/\s+/g, " ").trim();
  }
  // Groupe préfixé par sa formation ('<.BAB1 - Droit>Dr. rom - Gr 1') : on montre la fin.
  function groupe(g) {
    return String(g == null ? "" : g).replace(/^\s*<[^>]*>\s*/, "").replace(/\s+/g, " ").trim();
  }
  function aLaCarte(f) { return String(f || "").indexOf("PAR:") === 0; }
  function estLien(f) { return /^Mon horaire \(lien/.test(String(f || "")); }
  // Nom lisible d'un horaire : un panier ULB/UCL « PAR:A,B,C » devient « 3 cours choisis ».
  function nomFormation(f) {
    if (aLaCarte(f)) {
      var codes = String(f).slice(4).split(",").filter(Boolean);
      return codes.length > 2 ? codes.length + " cours choisis" : codes.join(" · ");
    }
    if (estLien(f)) return "Lien personnel";
    return joli(f) || "—";
  }
  function ecoleNom(id) { return (ECOLES[id] && ECOLES[id].nom) || (id ? String(id).toUpperCase() : "Autre"); }
  function logo(id) {
    if (ECOLES[id]) return '<span class="rang-logo"><img src="/logos/ecoles/' + txt(id) + '.svg" alt="" loading="lazy"></span>';
    return '<span class="rang-logo lettre">' + txt((id || "?").charAt(0).toUpperCase()) + "</span>";
  }
  function date(iso, heure) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d)) return "—";
    var s = d.toLocaleDateString("fr-BE", { day: "numeric", month: "short", year: "numeric" });
    return heure ? s + " à " + d.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" }) : s;
  }
  function ilya(iso) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d)) return "jamais";
    var min = Math.round((Date.now() - d) / 60000);
    if (min < 1) return "à l'instant";
    if (min < 60) return "il y a " + min + " min";
    if (min < 24 * 60) return "il y a " + Math.floor(min / 60) + " h";
    var j = Math.floor(min / 1440);
    if (j === 1) return "hier";
    if (j < 7) return "il y a " + j + " j";
    return d.toLocaleDateString("fr-BE", { day: "numeric", month: "short" });
  }
  function jourCourt(j) {
    return new Date(j + "T12:00:00Z").toLocaleDateString("fr-BE", { day: "numeric", month: "short" });
  }
  function jourLong(j) {
    return new Date(j + "T12:00:00Z").toLocaleDateString("fr-BE", { weekday: "short", day: "numeric", month: "short" });
  }
  function fmtDuree(s) {
    s = +s || 0;
    if (s < 60) return Math.round(s) + " s";
    return Math.floor(s / 60) + " min " + (Math.round(s % 60) ? Math.round(s % 60) + " s" : "");
  }
  function nomDe(u) { return ((u.prenom || "") + " " + (u.nom || "")).trim(); }
  function initiales(u) {
    var p = String(u.prenom || "").replace(/^@/, ""), n = String(u.nom || "");
    var s = (p.charAt(0) + n.charAt(0)) || String(u.email || "?").charAt(0);
    return s.toUpperCase();
  }
  function ecolesDe(u) {
    var vu = {};
    return u.profils.map(function (p) { return p.ecole || ""; }).filter(function (e) {
      if (vu[e]) return false;
      vu[e] = 1; return true;
    });
  }
  function actifSurPeriode(u) { return u.visites_periode > 0; }

  function etat(msg, erreur) {
    var el = $("etat");
    el.hidden = !msg; el.className = erreur ? "erreur" : "";
    el.innerHTML = msg || "";
    $("contenu").hidden = !!msg;
  }

  /* ---------- Onglets (#apercu, #comptes, #retours, #notifications) ---------- */
  var ONGLETS = ["apercu", "comptes", "retours", "notifications"];
  function ongletDepuisAdresse() {
    var h = (location.hash || "").replace("#", "");
    // #retours-12 (lien depuis la notif mail) ouvre l'onglet Retours et
    // déplie le report 12 une fois la liste chargée.
    if (h.indexOf("retours") === 0) return "retours";
    return ONGLETS.indexOf(h) >= 0 ? h : "apercu";
  }
  function cibleDepuisAdresse() {
    var m = /^retours-(\d+)$/.exec((location.hash || "").replace("#", ""));
    return m ? +m[1] : 0;
  }
  function montrerOnglet(o, defiler) {
    vue.onglet = o;
    ONGLETS.forEach(function (x) { $("vue-" + x).hidden = x !== o; });
    document.querySelectorAll(".onglets a").forEach(function (a) {
      if (a.getAttribute("data-vue") === o) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    fermerBulles();
    if (defiler) window.scrollTo(0, 0);
  }

  /* ---------- Aperçu : consultations ---------- */
  function consultations() {
    var t = donnees.totaux, prec = donnees.precedent || {};
    var serie = donnees.par_jour, n = serie.length;
    $("total").textContent = nb(t.consultations);
    var d = $("delta"), dt = $("delta-txt");
    if (+prec.consultations > 0) {
      var pct = Math.round((t.consultations - prec.consultations) / prec.consultations * 100);
      d.hidden = false;
      d.className = "delta " + (pct > 0 ? "haut" : pct < 0 ? "bas" : "egal");
      d.textContent = (pct > 0 ? "↑ " : pct < 0 ? "↓ " : "") + Math.abs(pct) + " %";
      dt.textContent = "vs les " + jours + " jours d'avant";
    } else {
      d.hidden = true;
      dt.textContent = jours + " derniers jours";
    }
    var auj = serie.length ? serie[n - 1] : { visites: 0 };
    $("m-auj").textContent = nb(auj.visites);
    $("m-moy").textContent = nb(Math.round(t.consultations / Math.max(1, n) * 10) / 10);
    $("m-pers").textContent = nb(t.visiteurs_uniques);
    /* 4 carrés du haut de l'Aperçu : comptes, consultations du jour,
       comptes venus aujourd'hui, consultations totales (période). */
    $("t-comptes").textContent = nb(t.comptes);
    $("t-auj").textContent = nb(t.aujourdhui != null ? t.aujourdhui : auj.visites);
    $("t-venus").textContent = nb(auj.visiteurs || 0);
    $("t-total").textContent = nb(t.consultations);
    var brut = +t.consultations_brutes || 0;
    $("bulle-consult").innerHTML = "<b>Une consultation</b> = une personne connectée qui ouvre un de ses horaires. " +
      "Revenir sur l'app dans les 30 minutes ne compte pas deux fois." +
      (brut > t.consultations ? "<br><br>" + nb(brut) + " ouvertures brutes sur la période." : "");
    graphique();
  }
  function arrondiHaut(m) {
    if (m <= 4) return 4;
    var p = Math.pow(10, Math.floor(Math.log(m) / Math.LN10)), r = m / p;
    return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * p;
  }
  function graphique() {
    var serie = donnees.par_jour, n = serie.length;
    var brutMax = Math.max.apply(null, serie.map(function (p) { return p.visites; }).concat([0]));
    var max = arrondiHaut(brutMax);
    var g = $("graph");
    var lignes = [max, Math.round(max / 2), 0].map(function (v) {
      return '<div class="grille-l" style="top:' + (100 - v / max * 100) + '%"><span>' + nb(v) + "</span></div>";
    }).join("");
    g.innerHTML = lignes + '<div class="barres" style="gap:' + (n > 45 ? 1 : n > 20 ? 2 : 4) + 'px">' +
      serie.map(function (p, i) {
        return '<div class="col' + (i === n - 1 ? " auj" : "") + (p.visites ? "" : " zero") + '" data-i="' + i + '">' +
          '<i style="height:' + (p.visites / max * 100) + '%"></i></div>';
      }).join("") + "</div>";
    g.setAttribute("aria-label", "Consultations par jour : " + nb(donnees.totaux.consultations) +
      " au total, pic à " + nb(brutMax));
    var marques = window.innerWidth < 560 ? 3 : 6;
    var pas = Math.max(1, Math.ceil((n - 1) / (marques - 1)));
    var html = "";
    for (var i = 0; i < n; i += pas) {
      if (i && n - 1 - i < pas / 2) break; // pas de collision avec « Auj. »
      html += '<span style="left:' + ((i + .5) / n * 100) + '%">' + txt(jourCourt(serie[i].jour)) + "</span>";
    }
    html += '<span style="left:' + ((n - .5) / n * 100) + '%">Auj.</span>';
    $("axe").innerHTML = html;
  }
  function montrerJour(i) {
    var g = $("graph");
    var ancien = g.querySelector(".tip");
    if (ancien) ancien.remove();
    g.querySelectorAll(".col.on").forEach(function (c) { c.classList.remove("on"); });
    if (i == null) return;
    var p = donnees.par_jour[i], n = donnees.par_jour.length;
    var col = g.querySelector('.col[data-i="' + i + '"]');
    if (col) col.classList.add("on");
    var tip = document.createElement("div");
    tip.className = "tip";
    var gauche = (i + .5) / n * 100;
    tip.style.left = gauche + "%";
    if (gauche < 18) tip.style.transform = "translateX(-12%)";
    else if (gauche > 82) tip.style.transform = "translateX(-88%)";
    tip.style.bottom = "calc(" + Math.min(100, p.visites / arrondiHaut(Math.max.apply(null,
      donnees.par_jour.map(function (x) { return x.visites; }).concat([0]))) * 100) + "% + 10px)";
    tip.innerHTML = "<small>" + txt(i === n - 1 ? "Aujourd'hui" : jourLong(p.jour)) + "</small><b>" + pl(p.visites, "consultation") +
      "</b> · " + pl(p.visiteurs, "personne");
    g.appendChild(tip);
  }
  function survol(e) {
    if (!donnees) return;
    var r = $("graph").getBoundingClientRect(), n = donnees.par_jour.length;
    var i = Math.floor((e.clientX - r.left) / r.width * n);
    montrerJour(Math.max(0, Math.min(n - 1, i)));
  }

  /* ---------- Aperçu : écoles → formations ---------- */
  function formationsDe(ecole) {
    // Les paniers de cours (ULB, UCL) sont presque tous uniques : un seul
    // rang « Cours à la carte », idem pour les liens personnels.
    var rangs = [], carte = null, liens = null;
    (donnees.par_formation || []).forEach(function (f) {
      if ((f.ecole || "") !== ecole) return;
      if (aLaCarte(f.formation) || estLien(f.formation)) {
        var cible = aLaCarte(f.formation) ? (carte = carte || { nom: "Cours à la carte", visites: 0, inscrits: 0, visiteurs: 0, n: 0 })
          : (liens = liens || { nom: "Liens personnels", visites: 0, inscrits: 0, visiteurs: 0, n: 0 });
        cible.visites += f.visites; cible.inscrits += f.inscrits; cible.visiteurs += f.visiteurs; cible.n++;
        return;
      }
      rangs.push({ nom: nomFormation(f.formation), visites: f.visites, inscrits: f.inscrits, visiteurs: f.visiteurs });
    });
    if (carte) rangs.push(carte);
    if (liens) rangs.push(liens);
    return rangs.sort(function (a, b) { return b.visites - a.visites || b.inscrits - a.inscrits; });
  }
  function ecoles() {
    var es = donnees.par_ecole || [];
    var total = Math.max(1, donnees.totaux.consultations);
    $("ecoles").innerHTML = es.map(function (e) {
      var id = e.ecole || "";
      var ouvert = vue.ecoleOuverte === id;
      var html = '<li><button class="rang" data-ecole="' + txt(id) + '" aria-expanded="' + ouvert + '">' +
        logo(id) + '<span class="rang-nom">' + txt(ecoleNom(id)) + "</span>" +
        '<span class="rang-val">' + nb(e.visites) + "<small>" + Math.round(e.visites / total * 100) + " %</small></span>" + CHEV +
        '<span class="rang-det">' + pl(e.visiteurs, "personne") + " · " + pl(e.inscrits, "inscrit") + "</span></button>";
      if (ouvert) {
        var fs = formationsDe(id), tout = vue.formsTout[id], montres = tout ? fs : fs.slice(0, 6);
        var max = Math.max.apply(null, fs.map(function (f) { return f.visites; }).concat([1]));
        html += '<div class="sous"><ul class="sous-liste">' + (montres.map(function (f) {
          return '<li><span class="nom" title="' + txt(f.nom) + '">' + txt(f.nom) + "</span>" +
            '<span class="val">' + nb(f.visites) + "</span>" +
            '<span class="barre"><i style="width:' + (f.visites / max * 100) + '%"></i></span>' +
            '<span class="det">' + (f.n ? pl(f.n, "combinaison") + " · " : "") + pl(f.inscrits, "inscrit") +
            " · " + pl(f.visiteurs, "actif") + "</span></li>";
        }).join("") || '<li class="vide">Aucune formation.</li>') + "</ul>" +
          (fs.length > 6 ? '<button class="lien" data-tout="' + txt(id) + '">' +
            (tout ? "Réduire" : "Voir les " + fs.length + " formations") + "</button>" : "") + "</div>";
      }
      return html + "</li>";
    }).join("") || '<li class="vide">Aucune consultation sur la période.</li>';
  }

  /* ---------- Aperçu : communauté ---------- */
  function communaute() {
    var t = donnees.totaux, us = donnees.utilisateurs;
    var limite = Date.now() - jours * 864e5;
    var nouveaux = us.filter(function (u) { return new Date(u.compte_cree) >= limite; }).length;
    var sans = us.filter(function (u) { return !u.profils.length; }).length;
    var actifs = us.filter(actifSurPeriode).length;
    var aTraiter = bugs ? bugs.filter(function (b) { return b.statut !== "corrige"; }).length : null;
    function ligne(href, l, s, v) {
      return '<li><a class="stat" href="' + href + '"><span class="stat-l">' + l + (s ? "<small>" + s + "</small>" : "") +
        "</span><b>" + v + "</b></a></li>";
    }
    $("communaute").innerHTML =
      ligne("#comptes", "Comptes", sans ? pl(sans, "compte") + " sans horaire" : "tous ont un horaire",
        nb(t.comptes) + (nouveaux ? "<em>+" + nb(nouveaux) + "</em>" : "")) +
      ligne("#comptes", "Actifs", "au moins une consultation sur " + jours + " j",
        nb(actifs) + ' <span class="mut" style="font-size:.8rem;font-weight:600">' +
        (t.comptes ? Math.round(actifs / t.comptes * 100) : 0) + " %</span>") +
      ligne("#comptes", "Horaires suivis", t.comptes ? (Math.round(t.horaires_suivis / t.comptes * 10) / 10).toLocaleString("fr-BE") + " par compte" : "",
        nb(t.horaires_suivis)) +
      ligne("#retours", "Retours à traiter", "bugs et demandes", aTraiter == null ? "…" : nb(aTraiter));
  }

  /* ---------- Aperçu : PDF officiels ---------- */
  function pdfs() {
    var p = donnees.pdf;
    if (!p) {
      $("pdf-resume").textContent = "";
      $("pdf-total").textContent = "—";
      $("pdf-auj").textContent = "—";
      $("pdf-moy").textContent = "—";
      $("pdf-pers").textContent = "—";
      $("pdf-delta").hidden = true;
      $("pdf-delta-txt").textContent = "";
      $("bulle-pdf").textContent = "Le comptage démarre quand supabase/schema.sql a été recollé.";
      $("pdf-ecoles").innerHTML = '<li class="vide">Recolle supabase/schema.sql dans Supabase pour activer le comptage des PDF.</li>';
      return;
    }
    var total = +p.total || 0, prec = +p.precedent || 0;
    $("pdf-total").textContent = nb(total);
    var d = $("pdf-delta"), dt = $("pdf-delta-txt");
    if (prec > 0) {
      var pct = Math.round((total - prec) / prec * 100);
      d.hidden = false;
      d.className = "delta " + (pct > 0 ? "haut" : pct < 0 ? "bas" : "egal");
      d.textContent = (pct > 0 ? "↑ " : pct < 0 ? "↓ " : "") + Math.abs(pct) + " %";
      dt.textContent = "vs les " + jours + " jours d'avant";
    } else {
      d.hidden = true;
      dt.textContent = jours + " derniers jours";
    }
    $("pdf-resume").textContent = total && donnees.totaux.comptes
      ? Math.round(total / Math.max(1, donnees.totaux.comptes) * 10) / 10 + " par compte" : "";
    $("pdf-auj").textContent = nb(p.aujourdhui);
    $("pdf-moy").textContent = nb(Math.round(total / Math.max(1, (p.par_jour || []).length) * 10) / 10);
    $("pdf-pers").textContent = nb(p.utilisateurs);
    $("bulle-pdf").innerHTML = "<b>Une ouverture</b> = un appui sur « PDF officiel » dont le téléchargement a réussi. " +
      "Rouvrir la même semaine recompte : c'est l'usage réel qui dit si le bouton doit rester.";
    var es = p.par_ecole || [];
    var max = Math.max.apply(null, es.map(function (e) { return e.pdf; }).concat([1]));
    $("pdf-ecoles").innerHTML = es.length ? '<li><ul class="sous-liste" style="padding:4px 0">' + es.map(function (e) {
      return '<li><span class="nom">' + txt(ecoleNom(e.ecole)) + "</span>" +
        '<span class="val">' + nb(e.pdf) + "</span>" +
        '<span class="barre"><i style="width:' + (e.pdf / max * 100) + '%"></i></span>' +
        '<span class="det">' + pl(e.utilisateurs, "personne") + "</span></li>";
    }).join("") + "</ul></li>" : '<li class="vide">Aucun PDF ouvert sur la période : le bouton ne sert peut-être à personne.</li>';
  }

  /* ---------- Comptes : par école, puis la liste ---------- */
  var TRIS = {
    visite: function (a, b) { return (b.derniere_visite || "").localeCompare(a.derniere_visite || ""); },
    actifs: function (a, b) { return b.visites_periode - a.visites_periode || (b.derniere_visite || "").localeCompare(a.derniere_visite || ""); },
    recents: function (a, b) { return (b.compte_cree || "").localeCompare(a.compte_cree || ""); }
  };
  var PAS = 30;
  function groupesComptes() {
    var parEcole = {}, ordre = [];
    donnees.utilisateurs.forEach(function (u) {
      var es = ecolesDe(u);
      if (!es.length) es = ["_sans"];
      es.forEach(function (e) {
        if (!parEcole[e]) { parEcole[e] = []; ordre.push(e); }
        parEcole[e].push(u);
      });
    });
    ordre.sort(function (a, b) {
      if (a === "_sans") return 1;
      if (b === "_sans") return -1;
      return parEcole[b].length - parEcole[a].length;
    });
    return ordre.map(function (e) { return { id: e, comptes: parEcole[e] }; });
  }
  function ligneCompte(u) {
    var nom = nomDe(u), ouvert = vue.ouvert === u.user_id, es = ecolesDe(u);
    var cours = u.profils.length ? u.profils.slice(0, 2).map(function (p) {
      return '<span class="pil" title="' + txt(ecoleNom(p.ecole) + " · " + nomFormation(p.formation)) + '">' +
        txt(p.surnom || nomFormation(p.formation)) + "</span>";
    }).join("") + (u.profils.length > 2 ? '<span class="pil">+' + (u.profils.length - 2) + "</span>" : "")
      : '<span class="pil vide">aucun horaire</span>';
    var av = u.avatar
      ? '<span class="av' + (actifSurPeriode(u) ? "" : " off") + '" aria-hidden="true" style="overflow:hidden">' +
        '<img src="' + txt(u.avatar) + '" alt="" referrerpolicy="no-referrer" loading="lazy" data-ini="' + txt(initiales(u)) +
        '" style="width:100%;height:100%;object-fit:cover"></span>'
      : '<span class="av' + (actifSurPeriode(u) ? "" : " off") + '" aria-hidden="true">' + txt(initiales(u)) + "</span>";
    var html = '<li><button class="compte" data-u="' + txt(u.user_id) + '" aria-expanded="' + ouvert + '">' + av +
      '<span class="qui"><b><span>' + txt(nom || u.email || "—") + "</span>" +
      (es.length > 1 ? '<span class="mini-ecoles" title="Horaires de ' + txt(es.map(ecoleNom).join(" et ")) + '">' +
        es.length + " écoles</span>" : "") + "</b>" +
      (nom ? "<small>" + txt(u.email) + "</small>" : "") + "</span>" +
      '<span class="horaires">' + cours + "</span>" +
      '<span class="cv"><b>' + nb(u.visites_periode) + "</b><small>" + txt(ilya(u.derniere_visite)) + "</small></span>" +
      '<span class="cv-q">' + txt(ilya(u.derniere_visite)) + "</span></button>";
    if (ouvert) {
      html += '<div class="fiche">' +
        (es.length > 1 ? '<div class="avert">' + ATTENTION + "<span>Horaires dans " + es.length + " écoles : " +
          txt(es.map(ecoleNom).join(", ")) + "</span></div>" : "") + "<dl>" +
        "<dt>Consultations</dt><dd>" + nb(u.visites_periode) + " sur " + jours + " j</dd>" +
        "<dt>Dernière visite</dt><dd>" + txt(date(u.derniere_visite, true)) + "</dd>" +
        "<dt>Connexion</dt><dd>" + txt(date(u.derniere_connexion, true)) + "</dd>" +
        "<dt>Compte créé</dt><dd>" + txt(date(u.compte_cree)) + "</dd>" +
        u.profils.map(function (p) {
          return "<dt>" + txt(p.surnom || "Horaire") + "</dt><dd>" + txt(ecoleNom(p.ecole)) + " · " + txt(nomFormation(p.formation)) +
            ((p.groupes || []).length ? '<br><span class="mut">' + txt(p.groupes.map(groupe).join(", ")) + "</span>" : "") + "</dd>";
        }).join("") +
        "<dt>ID</dt><dd><code>" + txt(u.user_id) + "</code></dd></dl></div>";
    }
    return html + "</li>";
  }
  function entete() {
    return '<div class="entete" aria-hidden="true"><span></span><span>Compte</span><span>Horaires</span>' +
      "<span>Consult. " + jours + " j</span><span>Dernière visite</span></div>";
  }
  function listeComptes(cle, us) {
    us = us.slice().sort(TRIS[vue.tri]);
    var n = vue.n[cle] || PAS;
    return entete() + '<ul class="liste">' + us.slice(0, n).map(ligneCompte).join("") + "</ul>" +
      (us.length > n ? '<button class="lien" data-plus="' + txt(cle) + '">Afficher ' + Math.min(PAS, us.length - n) + " de plus</button>" : "");
  }
  function comptes() {
    var us = donnees.utilisateurs, q = vue.q.toLowerCase().trim();
    var groupes = groupesComptes();
    $("comptes-resume").textContent = pl(us.length, "compte") + " · " + pl(groupes.filter(function (g) { return g.id !== "_sans"; }).length, "école");
    if (q) {
      var trouves = us.filter(function (u) {
        return (u.email + " " + nomDe(u) + " " + u.profils.map(function (p) {
          return p.formation + " " + nomFormation(p.formation) + " " + p.surnom + " " + ecoleNom(p.ecole) + " " + (p.groupes || []).join(" ");
        }).join(" ")).toLowerCase().indexOf(q) >= 0;
      });
      $("groupes").innerHTML = '<li class="groupe-comptes">' + (trouves.length ? listeComptes("_q", trouves)
        : '<p class="vide">Aucun compte ne correspond.</p>') + "</li>";
      return;
    }
    $("groupes").innerHTML = groupes.map(function (g) {
      var ouvert = !!vue.groupes[g.id];
      var actifs = g.comptes.filter(actifSurPeriode).length;
      var multi = g.comptes.filter(function (u) { return ecolesDe(u).length > 1; }).length;
      var sans = g.id === "_sans";
      var det = sans ? "comptes créés, aucun horaire" : pl(actifs, "actif") + " sur " + jours + " j";
      var html = '<li><button class="rang" data-groupe="' + txt(g.id) + '" aria-expanded="' + ouvert + '">' +
        (sans ? '<span class="rang-logo lettre">–</span>' : logo(g.id)) +
        '<span class="rang-nom">' + txt(sans ? "Sans horaire" : ecoleNom(g.id)) +
        (multi ? ' <span class="mini-ecoles" title="' + pl(multi, "compte") + ' avec des horaires dans plusieurs écoles">' +
          nb(multi) + " multi-écoles</span>" : "") + "</span>" +
        '<span class="rang-val">' + nb(g.comptes.length) + "<small>" + (g.comptes.length > 1 ? "comptes" : "compte") + "</small></span>" + CHEV +
        '<span class="rang-det">' + txt(det) + "</span></button>";
      if (ouvert) html += '<div class="groupe-comptes">' + listeComptes(g.id, g.comptes) + "</div>";
      return html + "</li>";
    }).join("") || '<li class="vide">Aucun compte.</li>';
  }

  /* ---------- Retours : bugs & demandes (via /api/bugs) ---------- */
  var bugs = null, reqBugs = 0;
  var vueBugs = { filtre: "bug", ouvert: null, cible: 0 };
  var NOMS_STATUT = { nouveau: "Nouveau", en_cours: "En cours", corrige: "Corrigé" };
  var NOMS_ETAPE = { "v-compte": "Connexion", "v-identite": "Nom et prénom", "v-ecole": "Choix de l'école",
    "v-formation": "Choix de la formation", "v-groupes": "Groupes", "v-horaire": "Horaire", dashboard: "Dashboard" };
  var ICONES_TYPE = {
    bug: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="14" r="6"/><path d="M12 8V5M9 5.5 12 8l3-2.5M5.5 10 3 8.5M18.5 10 21 8.5M4.5 16 2 17M19.5 16l2.5 1"/></svg>',
    demande: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4.5 12.3c.8.7 1.5 1.6 1.5 2.7h6c0-1.1.7-2 1.5-2.7A7 7 0 0 0 12 2z"/></svg>'
  };
  function typeDe(b) { return b.type === "demande" ? "demande" : "bug"; }
  // Anciens reports sans titre : le début du message, coupé à un mot.
  function titreDe(b) {
    if (b.titre) return b.titre;
    var m = String(b.message || "").replace(/\s+/g, " ").trim();
    if (m.length <= 70) return m;
    var c = m.slice(0, 70), e = c.lastIndexOf(" ");
    return (e > 40 ? c.slice(0, e) : c) + "…";
  }
  function appareil(ua) {
    ua = String(ua || "");
    var sys = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" :
      /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
    var nav = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /CriOS|Chrome\//.test(ua) ? "Chrome" :
      /Safari\//.test(ua) ? "Safari" : "";
    return [sys, nav].filter(Boolean).join(" · ") || ua.slice(0, 60);
  }
  // Contexte du report sur une seule ligne discrète (qui, où, sur quoi, quand).
  function metaDetail(b) {
    var ctx = b.contexte || {}, m = [];
    if (ctx.ecole || ctx.formation) m.push([ctx.ecole ? ecoleNom(ctx.ecole) : "", ctx.formation ? nomFormation(ctx.formation) : ""].filter(Boolean).join(" "));
    if (ctx.donnee) m.push(ctx.donnee);
    if (ctx.ua) m.push(appareil(ctx.ua) + (ctx.largeur ? " " + nb(ctx.largeur) + " px" : ""));
    m.push(date(b.created_at, true));
    return m;
  }
  function dansFiltre(b, f) {
    if (f === "corrige") return b.statut === "corrige";
    return b.statut !== "corrige" && typeDe(b) === f;
  }
  function filtresBugs() {
    var FS = [["bug", "Bugs"], ["demande", "Demandes"], ["corrige", "Corrigés"]];
    $("retours-filtre").innerHTML = FS.map(function (f) {
      var n = bugs ? bugs.filter(function (b) { return dansFiltre(b, f[0]); }).length : 0;
      return '<button data-f="' + f[0] + '" aria-pressed="' + (vueBugs.filtre === f[0]) + '">' + f[1] +
        "<span>" + nb(n) + "</span></button>";
    }).join("");
  }
  function ligneBug(b) {
    var t = typeDe(b), ouvert = vueBugs.ouvert === b.id;
    var meta = [b.email || "Anonyme", ilya(b.created_at)];
    if (NOMS_ETAPE[b.etape]) meta.push(NOMS_ETAPE[b.etape]);
    var html = '<li id="retour-' + b.id + '"><button class="retour-l" data-b="' + b.id + '" aria-expanded="' + ouvert + '">' +
      '<span class="ic ' + (b.statut === "corrige" ? "" : t) + '">' + ICONES_TYPE[t] + "</span>" +
      '<span class="t">' + (b.statut === "nouveau" ? '<span class="point" aria-label="Nouveau"></span>' : "") +
      txt(titreDe(b)) + "</span>" +
      '<span class="m">' + txt(meta.join(" · ")) + "</span>" +
      (b.statut === "en_cours" ? '<span class="statut en_cours">En cours</span>' : "") + CHEV + "</button>";
    if (ouvert) {
      var ctx = b.contexte || {};
      var ims = (b.images || []).filter(function (im) { return im.url; });
      html += '<div class="retour-d">' +
        '<p class="msg">' + txt(b.message) + "</p>" +
        (ims.length ? '<div class="imgs">' + ims.map(function (im, i) {
          return '<a href="' + txt(im.url) + '" target="_blank" rel="noopener"><img src="' + txt(im.url) +
            '" alt="Capture ' + (i + 1) + '" loading="lazy"></a>';
        }).join("") + "</div>" : "") +
        '<p class="meta-d">' + metaDetail(b).map(txt).join(" · ") + "</p>" +
        '<div class="seg" role="group" aria-label="Statut">' + ["nouveau", "en_cours", "corrige"].map(function (s) {
          return '<button data-s="' + s + '" data-id="' + b.id + '" aria-pressed="' + (b.statut === s) + '">' + NOMS_STATUT[s] + "</button>";
        }).join("") + "</div></div>";
    }
    return html + "</li>";
  }
  function rendreBugs() {
    // Lien de la notif mail (#retours-12) : bon filtre, report déplié et
    // amené à l'écran, une seule fois (ensuite la liste redevient libre).
    if (bugs && vueBugs.cible) {
      var vise = bugs.filter(function (x) { return x.id === vueBugs.cible; })[0];
      vueBugs.cible = 0;
      if (vise) {
        vueBugs.filtre = vise.statut === "corrige" ? "corrige" : typeDe(vise);
        vueBugs.ouvert = vise.id;
        rendreBugs();
        var ligne = document.getElementById("retour-" + vise.id);
        if (ligne) ligne.scrollIntoView({ block: "center" });
        return;
      }
    }
    filtresBugs();
    var nouveaux = bugs ? bugs.filter(function (b) { return b.statut === "nouveau"; }).length : 0;
    var pastille = $("retours-pastille");
    pastille.hidden = !nouveaux;
    pastille.textContent = nouveaux;
    if (donnees) communaute();
    if (!bugs) { $("retours-liste").innerHTML = '<li class="vide">Chargement…</li>'; return; }
    var lignes = bugs.filter(function (b) { return dansFiltre(b, vueBugs.filtre); });
    $("retours-liste").innerHTML = lignes.map(ligneBug).join("") ||
      '<li class="vide">' + (vueBugs.filtre === "corrige" ? "Rien de corrigé pour l'instant." : "Rien à traiter. Tout roule.") + "</li>";
  }
  function chargerBugs() {
    var id = ++reqBugs;
    if (!sb) return;
    sb.auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      if (!session || id !== reqBugs) return;
      return fetch("/api/bugs?limite=200", {
        headers: { "Authorization": "Bearer " + session.access_token }, cache: "no-store"
      }).then(function (r) { return r.json(); }).then(function (rep) {
        if (id !== reqBugs || !rep.ok) throw new Error((rep && rep.erreur) || "Erreur.");
        bugs = rep.data.bugs || [];
        rendreBugs();
      });
    }).catch(function () {
      if (id !== reqBugs) return;
      bugs = bugs || [];
      rendreBugs();
      $("retours-liste").innerHTML = '<li class="vide">Lecture des retours impossible.</li>';
    });
  }
  function changerStatutBug(id, statut) {
    if (!sb || !bugs) return;
    var b = bugs.filter(function (x) { return x.id === id; })[0];
    if (!b || b.statut === statut) return;
    var avant = b.statut;
    b.statut = statut; // optimiste, annulé si le serveur refuse
    rendreBugs();
    sb.auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      if (!session) throw new Error("Session expirée.");
      return fetch("/api/bugs?id=" + id, {
        method: "PATCH", cache: "no-store",
        headers: { "Authorization": "Bearer " + session.access_token, "Content-Type": "application/json" },
        body: JSON.stringify({ statut: statut })
      }).then(function (r) { return r.json(); }).then(function (rep) {
        if (!rep.ok) throw new Error(rep.erreur || "Erreur.");
      });
    }).catch(function () { b.statut = avant; rendreBugs(); });
  }

  /* ---------- Notifications : messagerie admin → étudiant (v1 : envoi
     seul, les réponses repartent par email) ---------- */
  var notifs = null, reqNotifs = 0, choixDest = [];
  var vueNotifs = { ouvert: null };
  function compteParId(id) {
    if (!donnees) return null;
    for (var i = 0; i < donnees.utilisateurs.length; i++) {
      if (donnees.utilisateurs[i].user_id === id) return donnees.utilisateurs[i];
    }
    return null;
  }
  function nomDestinataire(id) {
    var u = compteParId(id);
    if (!u) return "compte supprimé";
    return nomDe(u) || u.email || id.slice(0, 8);
  }
  function contactDe(u) { return (nomDe(u) ? nomDe(u) + " · " : "") + (u.email || ""); }
  function majChoixDest() {
    var q = $("notif-dest").value.toLowerCase().trim();
    var tous = $("notif-tous").checked;
    var html = choixDest.map(function (id) {
      return '<button data-x="' + txt(id) + '" aria-pressed="true">' + txt(nomDestinataire(id)) + " ✕</button>";
    }).join("");
    if (!tous && q.length >= 2 && donnees) {
      var vus = {}, sug = [];
      choixDest.forEach(function (id) { vus[id] = 1; });
      for (var i = 0; i < donnees.utilisateurs.length && sug.length < 6; i++) {
        var u = donnees.utilisateurs[i];
        if (vus[u.user_id]) continue;
        if ((u.email + " " + nomDe(u)).toLowerCase().indexOf(q) < 0) continue;
        sug.push(u);
      }
      html += sug.map(function (u) {
        return '<button data-add="' + txt(u.user_id) + '" aria-pressed="false">' + txt(contactDe(u)) + "</button>";
      }).join("");
    }
    $("notif-choix").innerHTML = html;
    $("notif-nb-comptes").textContent = nb(donnees ? donnees.utilisateurs.length : 0);
  }
  function ligneNotif(n) {
    var ouvert = vueNotifs.ouvert === n.id;
    var titre = n.titre || String(n.message || "").replace(/\s+/g, " ").trim().slice(0, 70);
    var html = '<li><button class="notif-l" data-n="' + n.id + '" aria-expanded="' + ouvert + '">' +
      '<span class="t">' + (!n.lu_at ? '<span class="point" aria-label="Non lue"></span>' : "") +
      txt(titre || "Message") + "</span>" +
      '<span class="m">' + txt(nomDestinataire(n.user_id) + " · " + ilya(n.created_at)) + "</span>" +
      '<span class="lu' + (n.lu_at ? " ok" : "") + '">' + (n.lu_at ? "lu" : "non lu") + "</span></button>";
    if (ouvert) {
      html += '<div class="notif-d"><p class="msg">' + txt(n.message) + "</p>" +
        '<p class="meta-d">' + txt("À " + nomDestinataire(n.user_id) + " · envoyé " + date(n.created_at, true) +
        (n.lu_at ? " · lu " + date(n.lu_at, true) : " · pas encore lu") +
        (n.lien ? " · lien " + n.lien : "")) + "</p></div>";
    }
    return html + "</li>";
  }
  function rendreNotifs() {
    if (!notifs) { $("notifs-liste").innerHTML = '<li class="vide">Chargement…</li>'; return; }
    var nonlues = notifs.filter(function (n) { return !n.lu_at; }).length;
    $("notifs-resume").textContent = pl(notifs.length, "message envoyé") +
      (nonlues ? " · " + pl(nonlues, "non lu") : " · tout lu");
    $("notifs-liste").innerHTML = notifs.map(ligneNotif).join("") ||
      '<li class="vide">Aucun message envoyé pour l\'instant.</li>';
  }
  function chargerNotifs() {
    var id = ++reqNotifs;
    if (!sb) return;
    sb.auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      if (!session || id !== reqNotifs) return;
      return fetch("/api/notifications?limite=100", {
        headers: { "Authorization": "Bearer " + session.access_token }, cache: "no-store"
      }).then(function (r) { return r.json(); }).then(function (rep) {
        if (id !== reqNotifs || !rep.ok) throw new Error((rep && rep.erreur) || "Erreur.");
        notifs = rep.data.notifications || [];
        rendreNotifs();
      });
    }).catch(function () {
      if (id !== reqNotifs) return;
      notifs = notifs || [];
      rendreNotifs();
      $("notifs-liste").innerHTML = '<li class="vide">Lecture des messages impossible.</li>';
    });
  }
  function envoyerNotif() {
    var status = $("notif-status"), btn = $("notif-envoyer");
    var message = $("notif-message").value.replace(/\s+/g, " ").trim();
    var titre = $("notif-titre").value.replace(/\s+/g, " ").trim().slice(0, 80);
    var lien = $("notif-lien").value.trim().slice(0, 300);
    var tous = $("notif-tous").checked;
    status.textContent = "";
    if (!message) { status.textContent = "Écris le message d'abord."; return; }
    if (lien && !/^\/[^ ]*$/.test(lien)) { status.textContent = "Le lien doit être un chemin interne (« /… »)."; return; }
    if (!tous && !choixDest.length) { status.textContent = "Choisis au moins un destinataire (ou « Tous »)."; return; }
    if (!sb) return;
    btn.disabled = true;
    status.textContent = "Envoi…";
    sb.auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      if (!session) throw new Error("Session expirée.");
      var corps = tous ? { tous: true } : { user_ids: choixDest.slice() };
      corps.titre = titre;
      corps.message = message;
      corps.lien = lien;
      return fetch("/api/notifications", {
        method: "POST", cache: "no-store",
        headers: { "Authorization": "Bearer " + session.access_token, "Content-Type": "application/json" },
        body: JSON.stringify(corps)
      }).then(function (r) { return r.json(); }).then(function (rep) {
        if (!rep.ok) throw new Error(rep.erreur || "Erreur.");
        status.textContent = "Envoyé à " + pl(rep.data.envoyees, "compte") + ".";
        $("notif-message").value = "";
        $("notif-titre").value = "";
        $("notif-lien").value = "";
        $("notif-tous").checked = false;
        choixDest = [];
        majChoixDest();
        chargerNotifs();
      });
    }).catch(function (e) {
      status.textContent = "Échec : " + ((e && e.message) || "réessaie.");
    }).then(function () { btn.disabled = false; });
  }

  /* ---------- Alertes : plafonds atteints, purge à planifier ---------- */
  function alertes() {
    var msgs = [], lim = donnees.limites || {}, quels = [];
    if (lim.comptes) quels.push("comptes (4 000)");
    if (lim.profils) quels.push("horaires (10 000)");
    if (lim.visites) quels.push("consultations (40 000)");
    if (lim.pdf) quels.push("PDF (10 000)");
    if (quels.length) msgs.push("Chiffres tronqués — plafond atteint : " + txt(quels.join(", ")) + ". Augmente les plafonds dans api/stats.py.");
    var pa = donnees.plus_ancienne_absolue;
    if (pa && !isNaN(new Date(pa)) && (Date.now() - new Date(pa)) / 864e5 > 200) {
      msgs.push("Table visites jamais purgée (depuis le " + txt(date(pa)) + ") : planifie <code>select public.purger_visites(180)</code>.");
    }
    var pe = donnees.parcours && donnees.parcours.plus_ancien;
    if (pe && !isNaN(new Date(pe)) && (Date.now() - new Date(pe)) / 864e5 > 100) {
      msgs.push("Table evenements jamais purgée (depuis le " + txt(date(pe)) + ") : planifie <code>select public.purger_evenements(90)</code>.");
    }
    var pp = donnees.plus_ancien_pdf;
    if (pp && !isNaN(new Date(pp)) && (Date.now() - new Date(pp)) / 864e5 > 200) {
      msgs.push("Table pdf_exports jamais purgée (depuis le " + txt(date(pp)) + ") : planifie <code>select public.purger_pdf_exports(180)</code>.");
    }
    $("alerte").hidden = !msgs.length;
    $("alerte").innerHTML = msgs.map(function (m) { return "<div>" + m + "</div>"; }).join("");
  }

  function fermerBulles() {
    document.querySelectorAll("[data-info]").forEach(function (b) {
      b.setAttribute("aria-expanded", "false");
      b.nextElementSibling.hidden = true;
    });
  }

  function rendre() {
    var maj = new Date().toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" });
    $("sous-titre").textContent = jours + " derniers jours · à jour à " + maj;
    alertes(); consultations(); ecoles(); communaute(); pdfs(); comptes(); rendreBugs(); majChoixDest(); rendreNotifs();
  }

  /* ---------- Données ---------- */
  function charger() {
    var id = ++requete;
    $("rafraichir").classList.add("tourne");
    if (!donnees) etat("Chargement…");
    return sb.auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      if (!session) {
        $("sous-titre").textContent = "Non connecté";
        etat('Connecte-toi d\'abord sur <a href="/">l\'app</a>, puis reviens ici avec le même navigateur.', true);
        return;
      }
      return fetch("/api/stats?jours=" + jours, {
        headers: { "Authorization": "Bearer " + session.access_token }, cache: "no-store"
      }).then(function (r) { return r.json(); }).then(function (rep) {
        if (id !== requete) return;
        if (!rep.ok) throw new Error(rep.erreur || "Erreur.");
        donnees = rep.data;
        etat("");
        rendre();
        chargerBugs();
        chargerNotifs();
      });
    }).catch(function (e) {
      if (id !== requete) return;
      var msg = (e && e.message) || "Erreur.";
      if (/réservé|403/.test(msg)) msg = "Accès réservé : ce compte n'est pas admin.";
      donnees = null;
      $("sous-titre").textContent = "Erreur";
      etat(txt(msg) + '<br><br><a class="btn" href="/">Retour à l\'app</a>', true);
    }).then(function () {
      if (id === requete) $("rafraichir").classList.remove("tourne");
    });
  }

  /* ---------- Événements ---------- */
  $("periode").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-j]");
    if (!b || !sb) return;
    jours = +b.getAttribute("data-j");
    this.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
    charger();
  });
  $("rafraichir").addEventListener("click", function () { if (sb) charger(); });
  window.addEventListener("hashchange", function () {
    vueBugs.cible = cibleDepuisAdresse();
    montrerOnglet(ongletDepuisAdresse(), true);
    if (bugs) rendreBugs();
  });

  var g = $("graph");
  g.addEventListener("pointermove", survol);
  g.addEventListener("pointerdown", survol);
  g.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") montrerJour(null); });
  document.addEventListener("pointerdown", function (e) {
    if (donnees && !e.target.closest("#graph")) montrerJour(null);
  });

  document.addEventListener("click", function (e) {
    var info = e.target.closest("[data-info]");
    if (info) {
      var ouvre = info.getAttribute("aria-expanded") !== "true";
      fermerBulles();
      info.setAttribute("aria-expanded", String(ouvre));
      info.nextElementSibling.hidden = !ouvre;
      return;
    }
    if (!e.target.closest(".bulle")) fermerBulles();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") fermerBulles(); });
  // Photo de profil introuvable (lien expiré) : retour aux initiales.
  document.addEventListener("error", function (e) {
    var img = e.target;
    if (img && img.tagName === "IMG" && img.hasAttribute("data-ini")) {
      var av = img.parentNode;
      av.removeAttribute("style");
      av.textContent = img.getAttribute("data-ini");
    }
  }, true);

  $("ecoles").addEventListener("click", function (e) {
    var t = e.target.closest("button[data-tout]");
    if (t) { var id = t.getAttribute("data-tout"); vue.formsTout[id] = !vue.formsTout[id]; ecoles(); return; }
    var b = e.target.closest("button[data-ecole]");
    if (!b) return;
    var ec = b.getAttribute("data-ecole");
    vue.ecoleOuverte = vue.ecoleOuverte === ec ? null : ec;
    ecoles();
  });
  $("recherche").addEventListener("input", function (e) { vue.q = e.target.value; vue.n._q = PAS; comptes(); });
  $("tri").addEventListener("change", function (e) { vue.tri = e.target.value; comptes(); });
  $("groupes").addEventListener("click", function (e) {
    var plus = e.target.closest("button[data-plus]");
    if (plus) { var k = plus.getAttribute("data-plus"); vue.n[k] = (vue.n[k] || PAS) + PAS; comptes(); return; }
    var c = e.target.closest("button[data-u]");
    if (c) { var u = c.getAttribute("data-u"); vue.ouvert = vue.ouvert === u ? null : u; comptes(); return; }
    var gr = e.target.closest("button[data-groupe]");
    if (gr) { var id = gr.getAttribute("data-groupe"); vue.groupes[id] = !vue.groupes[id]; comptes(); }
  });

  $("retours-filtre").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-f]");
    if (!b) return;
    vueBugs.filtre = b.getAttribute("data-f");
    rendreBugs();
  });
  $("retours-liste").addEventListener("click", function (e) {
    var s = e.target.closest("button[data-s]");
    if (s) { changerStatutBug(+s.getAttribute("data-id"), s.getAttribute("data-s")); return; }
    var b = e.target.closest("button[data-b]");
    if (!b) return;
    var id = +b.getAttribute("data-b");
    vueBugs.ouvert = vueBugs.ouvert === id ? null : id;
    rendreBugs();
  });

  $("notif-dest").addEventListener("input", function () { majChoixDest(); });
  $("notif-choix").addEventListener("click", function (e) {
    var add = e.target.closest("button[data-add]");
    if (add) {
      var id = add.getAttribute("data-add");
      if (choixDest.indexOf(id) < 0 && choixDest.length < 200) choixDest.push(id);
      $("notif-dest").value = "";
      majChoixDest();
      return;
    }
    var rm = e.target.closest("button[data-x]");
    if (rm) {
      choixDest = choixDest.filter(function (x) { return x !== rm.getAttribute("data-x"); });
      majChoixDest();
    }
  });
  $("notif-tous").addEventListener("change", function (e) {
    if (e.target.checked) { choixDest = []; $("notif-dest").value = ""; }
    majChoixDest();
  });
  $("notif-envoyer").addEventListener("click", function () { envoyerNotif(); });
  $("notifs-liste").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-n]");
    if (!b || !notifs) return;
    var id = +b.getAttribute("data-n");
    vueNotifs.ouvert = vueNotifs.ouvert === id ? null : id;
    rendreNotifs();
  });

  var largeur = window.innerWidth;
  window.addEventListener("resize", function () {
    if (donnees && (largeur < 560) !== (window.innerWidth < 560)) graphique();
    largeur = window.innerWidth;
  });

  vueBugs.cible = cibleDepuisAdresse();
  montrerOnglet(ongletDepuisAdresse(), false);
  fetch("/api/config", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (rep) {
    var s = (rep && rep.supabase) || {};
    if (!s.url || !s.anonKey || !window.supabase) throw new Error("Supabase non configuré.");
    sb = window.supabase.createClient(s.url, s.anonKey);
    return charger();
  }).catch(function (e) {
    $("sous-titre").textContent = "Erreur";
    etat(txt(e.message || "Erreur."), true);
  });
})();
/* Apparence (Claire / Sombre / Système, même clé que l'app : ezh_apparence).
   Le bouton de l'en-tête reflète le choix ; la barre du navigateur suit. */
(function () {
  "use strict";
  var CLE = "ezh_apparence";
  var CLE_COULEUR = "ezh_admin_couleur";
  var ICONES = {
    clair: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    sombre: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 13.5A8 8 0 0 1 10.5 4 8 8 0 1 0 20 13.5z"/></svg>',
    systeme: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6M12 16v4"/></svg>'
  };
  var LIBELLES = { clair: "Claire", sombre: "Sombre", systeme: "Système" };
  function lire() {
    try { var v = localStorage.getItem(CLE); return (v === "clair" || v === "sombre") ? v : "systeme"; }
    catch (e) { return "systeme"; }
  }
  function lireCouleur() {
    try { var v = +localStorage.getItem(CLE_COULEUR); return (v === 1 || v === 3) ? v : 2; }
    catch (e) { return 2; }
  }
  function appliquerCouleur() {
    var v = lireCouleur();
    document.documentElement.setAttribute("data-couleur", String(v));
    var opts = document.querySelectorAll("#menu-apparence [data-couleur-opt]");
    for (var i = 0; i < opts.length; i++) {
      opts[i].setAttribute("aria-checked", +opts[i].getAttribute("data-couleur-opt") === v ? "true" : "false");
    }
  }
  function maj() {
    var clair = document.querySelector('meta[name="theme-color"][media*="light"]');
    var sombre = document.querySelector('meta[name="theme-color"][media*="dark"]');
    var v = lire();
    if (v === "systeme") {
      if (clair) clair.setAttribute("media", "(prefers-color-scheme: light)");
      if (sombre) sombre.setAttribute("media", "(prefers-color-scheme: dark)");
      return;
    }
    var fond = (v === "sombre") ? "#101216" : "#f4f5f7";
    if (clair) { clair.setAttribute("content", fond); clair.setAttribute("media", "all"); }
    if (sombre) sombre.setAttribute("media", "not all");
  }
  function appliquer() {
    var v = lire();
    document.documentElement.setAttribute("data-apparence", v);
    document.getElementById("apparence-icone").innerHTML = ICONES[v];
    document.getElementById("btn-apparence").setAttribute("aria-label", "Apparence : " + LIBELLES[v]);
    var opts = document.querySelectorAll("#menu-apparence [data-apparence-opt]");
    for (var i = 0; i < opts.length; i++) {
      opts[i].setAttribute("aria-checked", opts[i].getAttribute("data-apparence-opt") === v ? "true" : "false");
    }
    maj();
  }
  function fermer() {
    document.getElementById("menu-apparence").hidden = true;
    document.getElementById("btn-apparence").setAttribute("aria-expanded", "false");
  }
  document.getElementById("btn-apparence").addEventListener("click", function () {
    var m = document.getElementById("menu-apparence");
    var ouvre = m.hidden;
    m.hidden = !ouvre;
    this.setAttribute("aria-expanded", ouvre ? "true" : "false");
  });
  document.getElementById("menu-apparence").addEventListener("click", function (e) {
    var c = e.target.closest("[data-couleur-opt]");
    if (c) {
      // Le menu reste ouvert : on peut comparer les couleurs à la volée.
      try { localStorage.setItem(CLE_COULEUR, c.getAttribute("data-couleur-opt")); } catch (err) { /* navigation privée */ }
      appliquerCouleur();
      return;
    }
    var b = e.target.closest("[data-apparence-opt]");
    if (!b) return;
    try { localStorage.setItem(CLE, b.getAttribute("data-apparence-opt")); } catch (err) { /* navigation privée */ }
    appliquer();
    fermer();
  });
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".theme-wrap") && !document.getElementById("menu-apparence").hidden) fermer();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !document.getElementById("menu-apparence").hidden) fermer();
  });
  appliquer();
  appliquerCouleur();
  try {
    window.addEventListener("storage", function (e) {
      if (e.key === CLE) appliquer();
      else if (e.key === CLE_COULEUR) appliquerCouleur();
    });
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").addEventListener) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
        if (lire() === "systeme") maj();
      });
    }
  } catch (e) { /* jetable */ }
})();
