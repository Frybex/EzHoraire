
(function () {
  "use strict";
  /* Version du parcours, jointe aux étapes anonymes : à incrémenter à
     chaque correctif, pour comparer « avant / après » dans le dashboard. */
  window.EZH_VERSION = "9";
  var JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  var MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin",
              "juil.", "août", "sept.", "oct.", "nov.", "déc."];

  /* Écoles prises en charge (même identifiant que ECOLES dans api/_ecoles/).
     `lw`/`lh` : le viewBox du logo, copié dans les attributs width/height
     du <img>. Sans ces attributs le navigateur ignore le ratio tant que le
     SVG n'est pas décodé — le badge se comble sans forme stable (audit
     « unsized-images », décalage de mise en page au premier rendu). */
  var ECOLES = [
    { id: "heh", nom: "HEH", detail: "Haute École en Hainaut · Mons, Tournai", logo: "/logos/ecoles/heh.svg", lw: 350, lh: 140 },
    { id: "umons", nom: "UMONS", detail: "Université de Mons · Mons, Charleroi", logo: "/logos/ecoles/umons.svg", lw: 151, lh: 52, beta: true },
    { id: "condorcet", nom: "Condorcet", detail: "Haute École de la Province de Hainaut · Mons, Charleroi, Tournai…",
      logo: "/logos/ecoles/condorcet.svg", lw: 250, lh: 71, beta: true },
    { id: "helb", nom: "HELB", detail: "Haute École libre de Bruxelles Ilya Prigogine · Bruxelles",
      logo: "/logos/ecoles/helb.svg", lw: 250, lh: 167, beta: true },
    { id: "ulb", nom: "ULB", detail: "Université libre de Bruxelles · Bruxelles, Charleroi", logo: "/logos/ecoles/ulb.svg", lw: 75, lh: 75, recherche: true, beta: true },
    { id: "ucl", nom: "UCLouvain", detail: "Université catholique de Louvain · Louvain-la-Neuve, Bruxelles, Mons…",
      logo: "/logos/ecoles/ucl.svg", lw: 460, lh: 90, recherche: true, pdf: false, beta: true },
    /* École de test (horaires fictifs, voir api/_ecoles/sim.py) : proposée
       seulement si le serveur la liste (/api/config), donc jamais en ligne —
       serve.py la pose pour la simulation locale (lab/simulation.html). */
    { id: "sim", nom: "Simulation", detail: "École de test · horaires fictifs (développement local)",
      logo: "/logos/ecoles/sim.svg", lw: 120, lh: 48, sim: true }
  ];
  function ecoleDe(id) {
    for (var i = 0; i < ECOLES.length; i++) if (ECOLES[i].id === id) return ECOLES[i];
    return null;
  }
  /* Écoles réellement publiées : le serveur les liste dans /api/config.
     Tant qu'il n'a pas répondu, on reste sur les écoles sûres — une école
     développée mais pas encore ouverte (l'UCLouvain, voir EZH_UCL côté
     api/) ne doit jamais apparaître par défaut. */
  var ECOLES_ACTIVES = ["heh", "umons", "condorcet", "helb", "ulb"];
  function ecoleActive(id) { return ECOLES_ACTIVES.indexOf(id) >= 0; }

  /* Libellés des écoles « recherche » (pas de liste complète à
     télécharger : l'app interroge api/recherche). Chaque école donne les
     siens — rien n'est deviné à partir de l'autre. */
  var RECHERCHE = {
    ulb: {
      // L'ULB compose par cours (UE) : l'import et « Par codes de cours »
      // d'abord, puis le niveau d'études ; le lien perso en dernier.
      ordre: ["cours", "niveau", "lien"],
      recommande: "cours",
      modes: { cours: "Par codes de cours", niveau: "Par niveau d'études", lien: "Mon horaire ULB" },
      niveau: { titre: "Ton niveau d'études", placeholder: "Recherche, ex. droit bloc 2, polytech…",
                aide: "Écris au moins 2 lettres : l'ULB publie plus de 2 000 niveaux d'études." },
      cours: { titre: "Tes cours (UE)", placeholder: "Code ou intitulé, ex. DROIC2001, droit pénal…",
               aide: "Coche les cours que tu suis, puis « Voir mon horaire »." },
      lien: { titre: "Ton horaire personnel", placeholder: "https://cloud.timeedit.net/be_ulb/web/…",
              aide: "Le lien d'abonnement de MonULB (TimeEdit). Il donne accès à ton horaire : " +
                "garde-le pour toi, et supprime-le d'ici si tu le révoques un jour.",
              mode: "Ton horaire personnel (MonULB) s'abonne dans TimeEdit : ouvre " +
                '<a href="https://cloud.timeedit.net/be_ulb/web/etudiant/" target="_blank" rel="noopener">Mon horaire</a> ' +
                "avec ton ULBID, choisis « toute la durée affichée » puis « S'abonner », " +
                "et colle ici le lien obtenu." },
      import_texte: "COMMB300, Droit de l'information et de la communication\nLANGB305, Anglais III"
    },
    ucl: {
      // Un code UCLouvain suffit : le programme (SINF11BA) donne toutes les
      // séances de l'année — c'est le chemin recommandé. Les codes de cours
      // et l'import restent là pour les programmes à la carte et les cours
      // isolés ; le lien perso en dernier.
      ordre: ["niveau", "cours", "lien"],
      recommande: "niveau",
      modes: { cours: "Par codes de cours", niveau: "Par programme", lien: "Mon horaire UCLouvain" },
      niveau: { titre: "Ton programme", placeholder: "Recherche, ex. ingénieur civil, droit bloc 1…",
                aide: "Un code suffit : le programme (SINF11BA, DROI11BA…) donne tout ton horaire." },
      cours: { titre: "Tes cours", placeholder: "Code du cours, ex. LINFO1101, LDROI1001…",
               aide: "Cherche par code (le début suffit) et coche les cours que tu suis." },
      lien: { titre: "Ton horaire personnel", placeholder: "https://monhoraire.uclouvain.be/…",
              aide: "Le lien d'abonnement de Mon horaire. Il donne accès à ton horaire : " +
                "garde-le pour toi, et supprime-le d'ici si tu le révoques un jour.",
              mode: "Ton horaire personnel s'exporte depuis Mon horaire : ouvre " +
                '<a href="https://monhoraire.uclouvain.be/" target="_blank" rel="noopener">monhoraire.uclouvain.be</a>, ' +
                "connecte-toi avec ton identifiant UCLouvain, puis « Exporter » → " +
                "« Lien d'abonnement » et colle ici le lien obtenu." },
      import_texte: "LINFO1101, Introduction à la programmation\nLDROI1001, Droit constitutionnel"
    }
  };

  /* Mémoire de l'appareil (local, sans compte pour l'instant) :
     - ezh_profils : [{id, surnom, ecole, formation, groupes: [...], theme: 0..5}]
     - ezh_courant : id du profil affiché à l'ouverture (connecté par défaut)
     - ezh_horaire:<école>:<formation> : dernière réponse de l'école (hors ligne)
     Étape suivante (comptes) : ces mêmes objets seront lus/écrits dans
     Supabase/Firebase (table profils, user_id = compte Google/Apple/GitHub).
     Voir AUTH plus bas : brancher login() puis syncProfils() vers le cloud. */
  var CLE_PROFILS = "ezh_profils";
  var CLE_COURANT = "ezh_courant";
  var CLE_PROFIL_LEGACY = "ezh_profil";
  var CLE_PWA_PROPOSE = "ezh_pwa_propose";
  var CLE_BROUILLON = "ezh_brouillon";
  // Horaires mis de côté par lab/simulation.html avant la simulation,
  // rendus par « Quitter la simulation » (voir btn-quitter-sim).
  var CLE_SIM_SAUVE = "ezh_sim_sauve";

  /* Ajout à l'écran d'accueil : proposé une seule fois, à la première
     connexion du compte sur mobile (plus à la création d'horaire). Le
     « déjà proposé » est mémorisé côté compte (user_metadata Supabase,
     donc partagé entre téléphones) avec un repli local par compte puis
     global (installs d'avant le suivi par compte). Android capture
     l'évènement natif pour déclencher la vraie invite d'install ;
     iOS n'a pas cet évènement, on affiche juste la marche à suivre. */
  var inviteInstallAndroid = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    inviteInstallAndroid = e;
  });
  function appDejaInstallee() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
           window.navigator.standalone === true;
  }
  function estIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream; }
  function estAndroid() { return /Android/.test(navigator.userAgent); }
  function clePwaPropose(uid) { return uid ? CLE_PWA_PROPOSE + ":" + uid : CLE_PWA_PROPOSE; }
  function pwaDejaProposeCompte(uid) {
    var um = null;
    try { um = sessionSupabase && sessionSupabase.user && sessionSupabase.user.user_metadata; } catch (e) { um = null; }
    if (um && um.pwa_mobile_propose === true) return true;
    if (uid && lire(clePwaPropose(uid))) return true;
    if (lire(CLE_PWA_PROPOSE)) return true; // installs d'avant le suivi par compte
    return false;
  }
  function marquerPwaPropose(uid) {
    ecrire(CLE_PWA_PROPOSE, true);
    if (uid) ecrire(clePwaPropose(uid), true);
    try {
      if (SUPABASE_OK && sb && sessionSupabase && sessionSupabase.user &&
          (!uid || sessionSupabase.user.id === uid)) {
        var meta = sessionSupabase.user.user_metadata || {};
        if (meta.pwa_mobile_propose !== true) {
          sb.auth.updateUser({ data: { pwa_mobile_propose: true } }).then(function (res) {
            if (res && res.data && res.data.user) {
              sessionSupabase.user = res.data.user;
              try { if (AUTH) AUTH.user = res.data.user; } catch (e2) { /* jetable */ }
            }
          }, function () { /* hors ligne : le repli local suffit */ });
          meta.pwa_mobile_propose = true; // optimiste : pas de 2e pop-up avant le retour réseau
          sessionSupabase.user.user_metadata = meta;
          try {
            if (AUTH && AUTH.user) {
              AUTH.user.user_metadata = AUTH.user.user_metadata || {};
              AUTH.user.user_metadata.pwa_mobile_propose = true;
            }
          } catch (e3) { /* jetable */ }
        }
      }
    } catch (e) { /* jetable */ }
  }
  function proposerEcranAccueil() {
    var uid = null;
    try {
      uid = (compte && compte.supabase_id) ||
            (sessionSupabase && sessionSupabase.user && sessionSupabase.user.id) || null;
    } catch (e) { uid = null; }
    if (appDejaInstallee() || pwaDejaProposeCompte(uid)) return;
    if (!estIOS() && !estAndroid()) return; // seulement sur mobile
    marquerPwaPropose(uid);
    if (estAndroid()) {
      demanderConfirmation({
        titre: "Ajouter à l'écran d'accueil ?",
        message: "Installe EzHoraire comme une appli pour la retrouver en un tapotement, sans passer par le navigateur.",
        annuler: "Plus tard", confirmer: "Installer", danger: false
      }).then(function (ok) {
        if (ok && inviteInstallAndroid) { inviteInstallAndroid.prompt(); inviteInstallAndroid = null; }
        else if (ok) {
          // Chrome n'a pas proposé l'invite (déjà refusée, ou version qui
          // n'émet plus l'événement) : on montre le chemin manuel plutôt
          // que de fermer sans rien faire.
          demanderConfirmation({
            titre: "Installer depuis le menu",
            message: "Ouvre le <strong>menu ⋮</strong> de Chrome, puis touche <strong>« Installer l'application »</strong> (ou « Ajouter à l'écran d'accueil »).",
            annuler: "Plus tard", confirmer: "Compris", danger: false
          });
        }
      });
    } else if (estIOS()) {
      demanderConfirmation({
        titre: "Ajouter à l'écran d'accueil",
        message: "Touche <strong>Partager</strong>, puis « Sur l'écran d'accueil » pour retrouver EzHoraire en un tapotement.",
        annuler: "Plus tard", confirmer: "Compris", danger: false
      });
    }
  }
  /* Première connexion du compte sur mobile uniquement : à appeler après
     une connexion (retour OAuth, session restaurée, identité complétée).
     Jamais sur ordinateur, jamais si déjà installée, jamais deux fois.

     Et jamais pendant le premier rendu. Une fenêtre modale ouverte à
     700 ms devient le plus grand painting de la page : elle prend le
     relais du contenu comme LCP (elle ajoutait ~1,2 s à ce chiffre,
     mesuré) et elle bouche l'écran au moment précis où l'étudiant
     ouvre son horaire. On attend donc la fin du chargement, du repos
     du thread et au moins cinq secondes d'écoulement. */
  var DEBUT_PAGE = Date.now();
  var pwaTentative = null;
  function planifierPropositionPwa() {
    if (!estIOS() && !estAndroid()) return;
    if (appDejaInstallee()) return;
    if (pwaTentative) return; // déjà en attente : un seul compte à rebours
    var essayer = function () {
      pwaTentative = null;
      if (document.hidden || confirmationOuverte()) {
        pwaTentative = setTimeout(essayer, 4000); // onglet caché ou fenêtre déjà ouverte
        return;
      }
      var reste = 5000 - (Date.now() - DEBUT_PAGE);
      if (reste > 0) { pwaTentative = setTimeout(essayer, reste); return; }
      proposerEcranAccueil();
    };
    var auRepos = function () {
      if (window.requestIdleCallback) requestIdleCallback(essayer, { timeout: 3000 });
      else pwaTentative = setTimeout(essayer, 0);
    };
    if (document.readyState === "complete") auRepos();
    else window.addEventListener("load", auRepos, { once: true });
  }
  var THEMES = [
    { id: 2, nom: "Bleu", couleur: "#1d4fd7" },
    { id: 1, nom: "Vert", couleur: "#0e8655" },
    { id: 3, nom: "Rose", couleur: "#d14d8a" }
  ];
  /* Choix de thème : un seul générateur pour les quatre endroits qui
     l'affichent (identité, horaires, composeur, fenêtre de modification). */
  function choixThemesHTML(t) {
    var actuel = normaliserTheme(t);
    return THEMES.map(function (th) {
      return '<button type="button" class="theme-opt" data-theme-opt="' + th.id + '" role="radio" aria-checked="' +
        (actuel === th.id) + '"><span class="theme-pastille" style="background:' + th.couleur + '"></span>' +
        "<span>" + txt(th.nom) + "</span></button>";
    }).join("");
  }
  /* Même choix, avec le conteneur en grille et son libellé d'accessibilité
     (les deux volets qui le construisent entièrement : composeur, édition). */
  function choixThemesBlocHTML(t, id, label) {
    return '<div class="choix-themes" id="' + id + '" role="radiogroup" aria-label="' + label + '">' +
      choixThemesHTML(t) + "</div>";
  }
  ["identite-themes", "groupes-themes"].forEach(function (id) {
    var zone = document.getElementById(id);
    if (zone) zone.innerHTML = choixThemesHTML(2);
  });
  function normaliserTheme(t) {
    if (t === 1) return 1; // Vert
    if (t === 3) return 3; // Rose
    return 2;              // Bleu (2, 0 ou autre)
  }
  function couleurTheme(t) {
    var id = normaliserTheme(t);
    if (id === 1) return "#0e8655";
    if (id === 3) return "#d14d8a";
    return "#1d4fd7";
  }
  function suggereThemeSuivant() {
    var dispo = [2, 1, 3];
    var comptes = { 2: 0, 1: 0, 3: 0 };
    (profils || []).forEach(function (p) {
      var t = normaliserTheme(p.theme);
      comptes[t] = (comptes[t] || 0) + 1;
    });
    var min = Infinity, choisi = 2;
    dispo.forEach(function (id) {
      if (comptes[id] < min) { min = comptes[id]; choisi = id; }
    });
    return choisi;
  }
  function majThemeSelection(conteneurId, idTheme) {
    var cont = document.getElementById(conteneurId);
    if (!cont) return;
    var norm = normaliserTheme(idTheme);
    var btns = cont.querySelectorAll("[data-theme-opt]");
    Array.prototype.forEach.call(btns, function (b) {
      b.setAttribute("aria-checked", +b.getAttribute("data-theme-opt") === norm ? "true" : "false");
    });
  }
  var themeChoisiIdentite = 2;
  function lire(cle) {
    try { return JSON.parse(localStorage.getItem(cle) || "null"); } catch (e) { return null; }
  }
  function ecrire(cle, valeur) {
    try { localStorage.setItem(cle, JSON.stringify(valeur)); return true; }
    catch (e) { return false; /* plein / privé */ }
  }
  /* Lien d'abonnement personnel (ULB) : la clé de cache ne doit jamais
     contenir le lien (localStorage partagé, journaux…) — une empreinte
     suffit, et deux liens différents ne se marchent pas dessus. */
  function empreinteLien(lien) {
    var h = 5381, s = String(lien);
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  function cleHoraire(ecole, formation, ical) {
    if (ical) return "ezh_horaire:" + ecole + ":lien:" + empreinteLien(ical);
    return "ezh_horaire:" + ecole + ":" + formation;
  }
  function valide(d) {
    return !!(d && d.meta && d.meta.periode && d.meta.premier_lundi && d.cours && d.groupes);
  }
  /* Horaire sur mesure : plusieurs sources (formations d'une même école)
     fusionnées en une semaine — voir fusion.js et
     propositions/horaire-perso/PLAN.md. Un profil sur mesure a `sources`
     (1 à 6), `formation` vide et `groupes` vide : les groupes sont ceux de
     chaque source. `sources` absent ou vide = horaire normal. */
  var FUSION = window.EZH_FUSION;
  var EXPORT_ICS = window.EZH_EXPORT_ICS;
  var SEMAINE = window.EZH_SEMAINE;
  var RECHERCHE_COURS = window.EZH_RECHERCHE;
  /* Règles de groupes : une seule implémentation (fusion.js), pour que
     l'app et la fusion voient exactement les mêmes correspondances. */
  var propre = FUSION.propre;
  var courtGroupe = FUSION.courtGroupe;
  var aPrefixe = FUSION.aPrefixe;
  var memeGroupe = FUSION.memeGroupe;
  var groupeDans = FUSION.groupeDans;
  function estPerso(p) { return !!(p && Array.isArray(p.sources) && p.sources.length); }
  function ecoleExiste(id) { return !!ecoleDe(id); }
  function profilValide(p) {
    if (!(p && p.id && ecoleDe(p.ecole))) return false;
    // Lien d'abonnement (ULB) : chaîne courte uniquement, jamais un objet.
    if (p.ical != null && typeof p.ical !== "string") return false;
    if (estPerso(p)) return !!(FUSION && FUSION.sourcesValides(p, ecoleExiste));
    return !!(p.formation && Array.isArray(p.groupes));
  }
  /* Profil sur mesure venu du stockage ou du cloud : sources nettoyées,
     champs de l'horaire normal vidés (un ancien client ne l'affiche pas). */
  function normaliserPerso(p) {
    p.sources = FUSION.sourcesValides(p, ecoleExiste) || [];
    p.formation = "";
    p.groupes = [];
    p.ical = "";
    if (!p.surnom) p.surnom = SURNOM_PERSO;
    return p;
  }
  var SURNOM_PERSO = "Sur mesure";
  /* Alerte « nouvelles semaines » : l'école publie son année par tranches
     (la HEH commence par [1..14], puis allonge). Par horaire, on retient
     la période connue (la dernière servie par l'école) et la période vue
     (déjà annoncée), dans `ezh_semaines` — local à l'appareil, l'alerte
     n'a pas à voyager. Première ouverture d'un horaire : vue = connue,
     donc aucune alerte (tout y est « nouveau » sans l'être). Une fois
     l'alerte montrée, elle est consommée (`vue` = `connue`) : seule la
     première ouverture après la publication la voit. Un horaire supprimé
     efface son entrée (`oublierSemaines`). */
  var CLE_SEMAINES = "ezh_semaines";
  function etatSemaines(id) {
    var m = lire(CLE_SEMAINES);
    return (m && m[id]) || null;
  }
  function retenirSemaines(id, periode) {
    if (!id || !periode) return;
    var m = lire(CLE_SEMAINES) || {}, e = m[id];
    if (!e) m[id] = { vue: periode, connue: periode };
    else e.connue = periode;
    ecrire(CLE_SEMAINES, m);
  }
  function semainesARevoir(id) {
    var e = etatSemaines(id);
    return e && typeof e.vue === "string" && typeof e.connue === "string"
      ? FUSION.nouvellesSemaines(e.vue, e.connue) : [];
  }
  function marquerSemainesVues(id) {
    var m = lire(CLE_SEMAINES) || {}, e = m[id];
    if (!e) return;
    e.vue = e.connue;
    ecrire(CLE_SEMAINES, m);
  }
  function oublierSemaines(id) {
    var m = lire(CLE_SEMAINES) || {};
    if (m[id] == null) return;
    delete m[id];
    ecrire(CLE_SEMAINES, m);
  }
  /* Une sélection de cours « PAR:… » n'existe qu'à l'ULB et à l'UCLouvain.
     Rangée sous une autre école (HEH, UMONS), l'horaire devient
     introuvable : on la rend à la bonne école (sigles UCLouvain en
     « L…1234 », sinon ULB). L'école de test, elle, accepte les codes :
     ses scénarios se servent des vrais chemins de l'app. Renvoie vrai si
     le profil a été réparé. */
  function reparerEcoleParcours(p) {
    if (!p || String(p.formation || "").indexOf("PAR:") !== 0) return false;
    var ec = ecoleDe(p.ecole);
    if (ec && (ec.recherche || ec.sim)) return false;
    var codes = p.formation.slice(4).split(",").filter(Boolean);
    var ucl = codes.length && codes.every(function (c) { return /^L[A-Z]{2,6}\d{4}[A-Z]?$/.test(c.trim()); });
    p.ecole = ucl ? "ucl" : "ulb";
    return true;
  }
  function nouveauId() {
    return "p" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  }
  /* Nom par défaut d'un horaire : le nom complet de l'option, tel quel
     (sans le point initial de l'UMONS : '.BAB1 - Droit' -> 'BAB1 - Droit'). */
  /* Au-delà de 24 caractères, on coupe au dernier mot entier (avec « … »)
     plutôt qu'au milieu : '.MAB1 - Sc. de gestion, FS' -> 'MAB1 Sc. de gestion, FS'. */
  function surnomDefaut(formation) {
    var f = joliFormation(formation).replace(/^(\S+)\s+-\s+/, "$1 ");
    if (!f) return "Mon horaire";
    if (f.length <= 24) return f;
    var coupe = f.slice(0, 23), espace = coupe.lastIndexOf(" ");
    if (espace > 10) coupe = coupe.slice(0, espace);
    return coupe.replace(/[\s,.;:\-–·]+$/, "") + "…";
  }
  // Noms par défaut des versions précédentes (réparés comme les autres).
  function anciensSurnomsAuto(formation) {
    var brut = String(formation || "").replace(/\s+/g, " ").trim();
    return [brut.slice(0, 24), joliFormation(formation).slice(0, 24)];
  }
  /* Ancienne version raccourcie (« BA1P Infographie » -> « P Infographie ») :
     sert une fois à repérer et réparer les noms auto-générés moches. */
  function ancienSurnomAuto(formation, groupes) {
    var f = String(formation || "").trim();
    var court = f.replace(/^(BA|MA)\d*\s*/i, "").trim() || f;
    if (court.length > 18) court = court.slice(0, 18).trim();
    if (groupes && groupes.length === 1) {
      var g = propre(groupes[0]);
      if (g && g.length <= 18) return g;
    }
    return court || "Mon horaire";
  }

  /* Migration : ancien profil unique -> liste à 1 élément. */
  var profils = lire(CLE_PROFILS);
  var profilsSales = false; // vrais noms à réparer -> à réécrire
  if (!Array.isArray(profils)) profils = null;
  if (profils) {
    profils = profils.filter(profilValide);
    profils.forEach(function (p, i) {
      p.theme = normaliserTheme(p.theme);
      if (estPerso(p)) { normaliserPerso(p); return; }
      if (reparerEcoleParcours(p)) { p.maj = Date.now(); profilsSales = true; }
      // Groupes : espaces nettoyés. Le préfixe éventuel ('<…>…', UMONS)
      // est gardé : c'est la clé de l'école quand le nom court est ambigu
      // (voir memeGroupe pour les profils des anciennes versions).
      var nets = (p.groupes || []).map(propre).filter(Boolean);
      if (nets.join("\x00") !== (p.groupes || []).join("\x00")) {
        p.groupes = nets;
        profilsSales = true;
      }
      if (typeof p.ical !== "string") p.ical = "";
      else if (p.ical.length > 1200) p.ical = p.ical.slice(0, 1200);
      if (!p.surnom) p.surnom = surnomDefaut(p.formation);
      // Répare les noms auto-générés par l'ancienne version raccourcie.
      else if (p.surnom !== p.formation && p.surnom === ancienSurnomAuto(p.formation, p.groupes)) {
        p.surnom = surnomDefaut(p.formation);
        profilsSales = true;
      }
      // Répare les noms auto-générés des versions précédentes (point initial
      // de l'UMONS, coupure brute à 24 caractères) : seul le nom change.
      else if (p.surnom !== surnomDefaut(p.formation) &&
               anciensSurnomsAuto(p.formation).indexOf(p.surnom) >= 0) {
        p.surnom = surnomDefaut(p.formation);
        profilsSales = true;
      }
    });
    if (!profils.length) profils = null;
  }
  if (!profils) {
    var legacy = lire(CLE_PROFIL_LEGACY);
    if (legacy && ecoleDe(legacy.ecole) && legacy.formation && Array.isArray(legacy.groupes)) {
      profils = [{
        id: nouveauId(), surnom: surnomDefaut(legacy.formation, legacy.groupes),
        ecole: legacy.ecole, formation: legacy.formation,
        groupes: legacy.groupes.slice(), theme: 2
      }];
      ecrire(CLE_PROFILS, profils);
      ecrire(CLE_COURANT, profils[0].id);
      try { localStorage.removeItem(CLE_PROFIL_LEGACY); } catch (e) { /* jetable */ }
    } else {
      profils = [];
    }
  }
  var courantId = lire(CLE_COURANT);
  var profil = null;
  if (courantId) {
    for (var _pi = 0; _pi < profils.length; _pi++) {
      if (profils[_pi].id === courantId) { profil = profils[_pi]; break; }
    }
  }
  if (!profil && profils.length) profil = profils[0];
  if (profilsSales) ecrire(CLE_PROFILS, profils);
  var _sauveHorodatage = 0;
  function sauverProfils() {
    _sauveHorodatage = Date.now();
    for (var _si = 0; _si < profils.length; _si++) {
      if (!profils[_si].maj) profils[_si].maj = _sauveHorodatage;
    }
    ecrire(CLE_PROFILS, profils);
    ecrire(CLE_COURANT, profil ? profil.id : null);
    planifierPush(); // cloud (Supabase) si connecté, sinon rien
  }

  /* ---------- Compte : connexion AVANT tout ----------
     Écran d'entrée = 2 boutons OAuth (Google / GitHub) + email
     (mot de passe), puis nom+prénom demandés une fois et
     affichés dans les Réglages. Session persistante : par défaut, on
     rouvre directement sur son horaire.
     Cloud : Supabase Auth. L'app lit l'URL + la clé publique anon via
     GET /api/config (env Vercel SUPABASE_URL / SUPABASE_ANON_KEY). Sans
     clés (ou hors ligne), les boutons OAuth retombent en mode local, comme
     avant : rien ne casse.
     Les horaires sont synchronisés dans la table `profils`
     (voir supabase/schema.sql) : fusion par id, le dernier écrit gagne.
     Les devoirs et examens suivent dans la table `echeances` : fusion
     par id, chaque échéance garde son identifiant.
     Côté consoles, reste à activer les fournisseurs (guide dans README,
     section Comptes) : Google (Client ID OAuth), GitHub (OAuth App),
     Email (natif). */
  var CLE_COMPTE = "ezh_compte";
  var SUPABASE_CONFIG = { URL: "", CLE_ANON: "" }; // rempli par /api/config au démarrage
  var sb = null;               // client Supabase (null = mode local)
  var SUPABASE_OK = false;     // vrai quand le cloud est branché
  var sessionSupabase = null;
  var pousseeMinutee = 0;
  var generationCompte = 0;
  var demarrageFini = false;   // vrai une fois le routeur de démarrage passé
  var recuperationEnCours = false; // vrai après un clic sur le lien « mot de passe oublié »
  var compte = lire(CLE_COMPTE);
  if (!compte || !compte.fournisseur) compte = null;
  var fournisseurChoisi = compte ? compte.fournisseur : null;
  function sauverCompte() { ecrire(CLE_COMPTE, compte); }
  function connecte() { return !!(compte && compte.nom && compte.prenom); }
  function reinitialiserHoraires() {
    generationCompte++;
    clearTimeout(pousseeMinutee);
    pousseeMinutee = 0;
    profils = [];
    profil = null;
    courantId = null;
    DATA = null;
    COURS = [];
    LUNDI0 = null;
    SEMAINES = [];
    choix = { ecole: null, formation: null, data: null, groupes: [], ical: null, editionId: null, theme: null };
    themeChoisiIdentite = 2;
    ecrire(CLE_PROFILS, profils);
    ecrire(CLE_COURANT, null);
    _echTout = null; // devoirs d'un autre compte : le cloud les rendra si besoin
    try { localStorage.removeItem(CLE_ECHEANCES); } catch (e) { /* jetable */ }
    try { localStorage.removeItem(CLE_ECH_SUPPR); } catch (e) { /* jetable */ }
    try { localStorage.removeItem(CLE_ECH_SYNC); } catch (e) { /* jetable */ }
    effacerBrouillon();
    try { localStorage.removeItem(CLE_PROFIL_LEGACY); } catch (e) { /* jetable */ }
    notifs = [];
    majCaseNotifs();
    adminVerifie = false;
    var boutonAdmin = document.getElementById("btn-admin");
    if (boutonAdmin) boutonAdmin.hidden = true;
  }
  function effacerSession() {
    reinitialiserHoraires();
    sessionSupabase = null;
    AUTH.user = null;
    compte = null;
    fournisseurChoisi = null;
    sauverCompte();
    rendreAvatar();
  }

  /* Connexion email : deux modes, choisis sur le rail #seg-auth.
     « login » ne fait que signInWithPassword — une adresse inconnue
     reste une erreur, pas un compte fantôme créé par une faute de
     frappe. « signup » ne fait que signUp — une adresse déjà inscrite
     est refusée. Google / GitHub ne sont pas concernés : c'est le
     fournisseur qui décide.
     « Mot de passe oublié ? » : caché au départ, révélé au premier
     échec de connexion, et jamais en mode création. Pendant le choix
     du nouveau mot de passe, il reste masqué et ne réapparaît qu'en
     refermant ce bloc. */
  var oublieMontre = false;
  var modeAuth = "login";
  function majOublie() {
    var o = document.getElementById("mdp-oublie");
    if (!o) return;
    var br = document.getElementById("bloc-reset");
    o.hidden = !(oublieMontre && modeAuth === "login") || !!(br && !br.hidden);
  }
  function montrerOublie() {
    oublieMontre = true;
    majOublie();
  }
  function majModeAuth() {
    var rail = document.getElementById("seg-auth");
    if (rail) {
      rail.style.setProperty("--idx", modeAuth === "signup" ? "1" : "0");
      Array.prototype.forEach.call(rail.querySelectorAll("[data-mode]"), function (b) {
        b.setAttribute("aria-pressed", b.getAttribute("data-mode") === modeAuth ? "true" : "false");
      });
    }
    var lib = document.querySelector("#btn-email .be-lib");
    if (lib) lib.textContent = modeAuth === "signup" ? "Créer un compte" : "Se connecter";
    var mdp = document.getElementById("mdp");
    if (mdp) mdp.setAttribute("autocomplete", modeAuth === "signup" ? "new-password" : "current-password");
    majOublie();
  }
  function definirModeAuth(m) {
    modeAuth = m === "signup" ? "signup" : "login";
    majModeAuth();
    effacerErreurLogin(); // le message d'erreur de l'autre mode ne suit pas
  }
  /* Échec de connexion par email : le bloc email / mot de passe passe en
     rouge (contour + icônes, comme .champs.erreur ailleurs) et tout
     s'efface dès qu'on y retouche. */
  function marquerChampsErreur() {
    var cl = document.getElementById("champs-login");
    if (cl) cl.classList.add("erreur");
    Array.prototype.forEach.call(["email", "mdp"], function (id) {
      var inp = document.getElementById(id);
      if (inp) inp.setAttribute("aria-invalid", "true");
    });
  }
  function effacerErreurLogin() {
    var cl = document.getElementById("champs-login");
    if (cl) cl.classList.remove("erreur");
    Array.prototype.forEach.call(["email", "mdp"], function (id) {
      var inp = document.getElementById(id);
      if (inp) inp.removeAttribute("aria-invalid");
    });
    statutAuthEffacer();
  }
  /* Petits messages sous les boutons de connexion. */
  function statutAuthChargement(msg) {
    var el = document.getElementById("auth-status");
    if (el) attente(el, msg);
  }
  function statutAuthErreur(msg, code) {
    var el = document.getElementById("auth-status");
    if (el) erreur(el, msg);
    // Premier échec sur l'écran de connexion : on révèle
    // « Mot de passe oublié ? », caché jusque-là (mode connexion seul :
    // en création de compte, il n'a rien à faire là).
    var vc = document.getElementById("v-compte");
    if (vc && !vc.hidden && modeAuth === "login") montrerOublie();
    if (code && window.EZH_SUIVI) {
      EZH_SUIVI.envoyer("connexion_erreur", { erreur: code, fournisseur: fournisseurChoisi || "" });
    }
  }
  function statutAuthInfo(msg) {
    var el = document.getElementById("auth-status");
    if (!el) return;
    el.hidden = false;
    el.classList.remove("erreur");
    el.style.display = "";
    el.textContent = msg;
  }
  function statutAuthEffacer() {
    var el = document.getElementById("auth-status");
    if (el) { el.hidden = true; effacer(el); }
  }
  var EN_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  // Mode essai (?essai=1) : uniquement depuis une origine locale (cette
  // machine ou le réseau privé) ou un tunnel de preview jetable
  // (*.trycloudflare.com, lancé par serve.py --tunnel pour ouvrir la
  // preview de l'extérieur), jamais depuis le site en ligne ni un
  // domaine durable. Aucun compte, aucun cloud : tout reste dans ce
  // navigateur.
  var MODE_ESSAI = /[?&]essai=1(?:&|$)/.test(location.search) &&
    (/^(localhost|127\.0\.0\.1|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(location.hostname) ||
     /(\.|^)trycloudflare\.com$/.test(location.hostname));
  /* Erreurs Supabase Auth → phrase claire (le code est stable, le texte non). */
  function codeAuth(err) {
    if (!err) return "";
    // Supabase en panne ou injoignable (réseau, 5xx) : rien à corriger côté utilisateur.
    if (err.name === "AuthRetryableFetchError" || err.status === 0 || err.status >= 500) return "indisponible";
    if (err.code) return err.code;
    var m = String(err.message || "");
    if (/invalid login credentials/i.test(m)) return "invalid_credentials";
    if (/email not confirmed/i.test(m)) return "email_not_confirmed";
    if (/rate limit/i.test(m)) return "over_email_send_rate_limit";
    return "";
  }
  function messageAuth(err) {
    switch (codeAuth(err)) {
      case "invalid_credentials": return "Email ou mot de passe incorrect.";
      case "email_not_confirmed": return "Adresse pas encore confirmée : clique sur le lien reçu par email.";
      case "user_already_exists":
      case "email_exists":
      case "email_existe": return "Cette adresse email a déjà un compte : connecte-toi.";
      case "over_email_send_rate_limit":
      case "over_request_rate_limit": return "Trop de tentatives : réessaie dans quelques minutes.";
      case "weak_password": return "Mot de passe trop faible : choisis-en un plus long.";
      case "indisponible": return "Service de connexion indisponible : réessaie dans quelques minutes.";
      case "signup_disabled": return "Les inscriptions sont fermées pour le moment.";
      default: return "Échec : " + ((err && err.message) || "erreur inconnue") + ".";
    }
  }

  /* Config publique depuis le serveur (/api/config lit l'env Vercel).
     Sans clés : mode local, comme avant. */
  function chargerConfigSupabase() {
    if (window.__SUPABASE__ && window.__SUPABASE__.URL) {
      SUPABASE_CONFIG = { URL: window.__SUPABASE__.URL, CLE_ANON: window.__SUPABASE__.CLE_ANON || "" };
      return Promise.resolve(!!(SUPABASE_CONFIG.URL && SUPABASE_CONFIG.CLE_ANON));
    }
    // Servie depuis le cache du navigateur quand elle est encore fraîche :
    // l'app n'attend pas un aller-retour serveur pour se lancer.
    return fetchDelai("/api/config", 8000, undefined, "default").then(function (r) { return r.json(); }).then(function (rep) {
      var s = (rep && rep.supabase) || {};
      SUPABASE_CONFIG = { URL: s.url || "", CLE_ANON: s.anonKey || "" };
      // Le serveur dit quelles écoles il expose (UCLouvain en test :
      // absente tant qu'EZH_UCL n'est pas posé côté hébergeur). Une
      // réponse en échec laisse la liste sûre en place.
      if (rep && Array.isArray(rep.ecoles) && rep.ecoles.length) {
        ECOLES_ACTIVES = rep.ecoles.filter(function (id) { return !!ecoleDe(id); });
      }
      return !!(SUPABASE_CONFIG.URL && SUPABASE_CONFIG.CLE_ANON);
    }, function () { return false; });
  }

  /* SDK Supabase : jamais chargé pour un simple visiteur. index.html ne
     pose plus la balise ; elle est ajoutée ici au premier besoin réel
     (clic de connexion, session déjà enregistrée, retour OAuth). Les
     pages qui en ont besoin d'emblée (dashboard) gardent la leur. Le SDK
     est servi par le site (assets/vendor/, version dans le nom, cache un
     an) : aucune dépendance à un CDN tiers, plus rapide au premier clic. */
  var SDK_SUPABASE = {
    src: "/assets/vendor/supabase-2.116.0.min.js"
  };
  var sdkSupabase = null;
  function chargerSdkSupabase() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve(true);
    if (sdkSupabase) return sdkSupabase;
    sdkSupabase = new Promise(function (ok) {
      var s = document.querySelector("script[data-supabase]");
      if (!s) {
        s = document.createElement("script");
        s.src = SDK_SUPABASE.src;
        s.setAttribute("data-supabase", "");
        document.head.appendChild(s);
      }
      s.addEventListener("load", function () { ok(!!(window.supabase && window.supabase.createClient)); });
      s.addEventListener("error", function () { ok(false); });
      setTimeout(function () { ok(!!(window.supabase && window.supabase.createClient)); }, 8000);
    });
    return sdkSupabase;
  }
  /* Une session cloud est-elle déjà dans le stockage local ? Le SDK ne
     se télécharge que dans ce cas (ou au clic de connexion, ou au retour
     OAuth) : un visiteur neuf n'en paie ni le téléchargement ni le parse. */
  function sessionCloudEnLocal() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var cle = localStorage.key(i);
        if (/^sb-.*-auth-token(\.\d+)?$/.test(cle)) return true;
      }
    } catch (e) { /* stockage refusé : connexion manuelle seulement */ }
    return false;
  }
  /* Prêt à parler au cloud : config chargée, SDK chargé, client branché.
     Les boutons de connexion l'attendent, sans bloquer l'affichage. */
  function pretCloud() {
    var cfg = window.EZH_CONFIG_PROMESSE || chargerConfigSupabase();
    return cfg.then(function () { return SUPABASE_OK && sb ? true : initSupabase(); });
  }
  /* Branche le client Supabase, restaure la session (retour OAuth :
     supabase-js échange seul le ?code= de l'URL). Une seule fois — un
     échec (SDK pas encore arrivé, hors ligne) peut se retenter. */
  var initSupabaseEnCours = null;
  function initSupabase() {
    if (initSupabaseEnCours) return initSupabaseEnCours;
    var p = initSupabaseMaintenant();
    initSupabaseEnCours = p;
    var rate = function () { initSupabaseEnCours = null; };
    p.then(function (ok) { if (!ok) rate(); }, rate);
    return p;
  }
  function initSupabaseMaintenant() {
    if (!(SUPABASE_CONFIG.URL && SUPABASE_CONFIG.CLE_ANON)) return Promise.resolve(false);
    return chargerSdkSupabase().then(function (pret) {
      if (!pret || !window.supabase || !window.supabase.createClient) return false;
      try {
        sb = window.supabase.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.CLE_ANON);
      } catch (e) { sb = null; return false; }
      SUPABASE_OK = true;
      sb.auth.onAuthStateChange(function (evt, session) {
        sessionSupabase = session || null;
        if (session && session.user) AUTH.user = session.user;
        if (evt === "SIGNED_IN" && session && session.user) retourOAuth(session.user);
        else if (evt === "PASSWORD_RECOVERY") {
          recuperationEnCours = true;
          if (!demarrageFini) return;
          ouvrirResetMdp();
        }
        else if (evt === "SIGNED_OUT") {
          effacerSession();
          if (demarrageFini) {
            fermerFeuille();
            fermerPdf();
            pile = [];
            ouvrirCompte();
          }
        }
      });
      return sb.auth.getSession().then(function (res) {
        var session = res && res.data && res.data.session;
        sessionSupabase = session || null;
        try {
          if (/[?&](code|access_token)=/.test(location.search + " " + location.hash)) {
            history.replaceState(null, "", location.pathname);
          }
        } catch (e) { /* jetable */ }
        // Lien « mot de passe oublié » (type=recovery dans l'adresse) : on
        // montre le choix d'un nouveau mot de passe au lieu d'entrer.
        if (/(^|[&#?])type=recovery/.test(location.search + " " + location.hash)) recuperationEnCours = true;
        if (session && session.user && !recuperationEnCours) { AUTH.user = session.user; retourOAuth(session.user); }
        return true;
      }, function () { return true; });
    });
  }

  function fournisseurDe(user) {
    var f = (user.app_metadata && user.app_metadata.provider) || "";
    if (!f && user.identities && user.identities.length) f = user.identities[0].provider || "";
    f = String(f).toLowerCase();
    if (f === "github") return "github";
    if (f === "apple") return "apple";
    if (f === "google") return "google";
    return "email";
  }
  /* Pseudo GitHub depuis le compte cloud (user_metadata puis identités).
     Sert à afficher « @pseudo » sous le nom. */
  function pseudoDepuisUser(user) {
    if (!user) return "";
    var cands = [];
    var meta = user.user_metadata || {};
    cands.push(meta.user_name, meta.preferred_username, meta.nickname);
    var ids = user.identities || [];
    for (var i = 0; i < ids.length; i++) {
      var d = (ids[i] && ids[i].identity_data) || {};
      cands.push(d.user_name, d.preferred_username, d.nickname);
    }
    for (var j = 0; j < cands.length; j++) {
      var c = String(cands[j] || "").trim().replace(/^@+/, "");
      if (c) return c.slice(0, 39);
    }
    return "";
  }
  /* Prénom/nom devinés depuis le fournisseur (modifiable juste après). */
  function identiteDepuisUser(user) {
    var meta = user.user_metadata || {};
    var prenom = "", nom = "";
    if (meta.prenom || meta.nom) { prenom = meta.prenom || ""; nom = meta.nom || ""; }
    else if (meta.full_name || meta.name) {
      var parts = String(meta.full_name || meta.name).replace(/\s+/g, " ").trim().split(" ");
      prenom = parts.shift() || ""; nom = parts.join(" ");
    } else if (meta.given_name || meta.family_name) { prenom = meta.given_name || ""; nom = meta.family_name || ""; }
    if ((!prenom || !nom) && user.email) {
      var base = String(user.email).split("@")[0].replace(/[._-]+/g, " ").trim();
      if (!prenom && base) prenom = base.charAt(0).toUpperCase() + base.slice(1);
    }
    return { prenom: String(prenom).slice(0, 30), nom: String(nom).slice(0, 30) };
  }
  /* Mémorise le prénom/nom côté compte cloud (retrouvés sur un autre appareil). */
  function pousserIdentite() {
    if (!SUPABASE_OK || !sb || !sessionSupabase || !compte) return;
    sb.auth.updateUser({ data: { prenom: compte.prenom || "", nom: compte.nom || "" } })
      .then(function () { /* jetable */ }, function () { /* jetable */ });
  }
  /* Compte créé (ou retrouvé) pendant cette visite : compté une seule
     fois, et seulement si un clic de connexion a eu lieu ici — sinon
     c'est une session restaurée au rechargement, déjà connue. Un compte
     est « neuf » s'il est né pendant la visite (retour Google/GitHub). */
  function suiviCompte(user) {
    if (!window.EZH_SUIVI || !EZH_SUIVI.aClique() || EZH_SUIVI.deja("compte")) return;
    EZH_SUIVI.marquer("compte");
    var creation = Date.parse((user && user.created_at) || "") || 0;
    var nouveau = creation > 0 && creation >= EZH_SUIVI.debut() - 5 * 60000;
    EZH_SUIVI.envoyer(nouveau ? "compte_cree" : "connexion_ok", { fournisseur: fournisseurDe(user) });
  }

  /* Arrivée d'une session (retour OAuth ou mot de passe) :
     on prépare le compte + on tire le cloud. La navigation n'a lieu que si
     le démarrage est fini (sinon c'est le routeur qui décidera). */
  function retourOAuth(user) {
    var precId = (compte && compte.supabase_id) || null;
    var idn = identiteDepuisUser(user);
    fournisseurChoisi = fournisseurDe(user);
    if (precId !== user.id) reinitialiserHoraires();
    var generation = generationCompte;
    var ancien = compte && (!compte.supabase_id || compte.supabase_id === user.id) ? compte : null;
    compte = { fournisseur: fournisseurChoisi,
               nom: (ancien && ancien.nom) || idn.nom,
               prenom: (ancien && ancien.prenom) || idn.prenom,
               email: user.email || "", pseudo: pseudoDepuisUser(user) || ((ancien && ancien.pseudo) || ""),
               supabase_id: user.id };
    sauverCompte();
    rendreAvatar();
    statutAuthEffacer();
    // Le compte est bien là : l'attente d'activation n'a plus lieu d'être
    // (rechargement d'onglet après avoir cliqué le lien reçu).
    try {
      sessionStorage.removeItem(ATTENTE_ACTIVATION);
      sessionStorage.removeItem(ATTENTE_ACTIVATION_EXISTE);
    } catch (e) { /* jetable */ }
    suiviCompte(user);
    var p = pullProfils().then(function () { return pullEcheances(); }, function () { return pullEcheances(); })
      .then(function () { return tirerNotifs(); }, function () { return tirerNotifs(); })
      .then(function () { return null; }, function () { return null; });
    if (!demarrageFini) return p;
    return p.then(function () {
      if (generation !== generationCompte || !compte || compte.supabase_id !== user.id) return;
      // Même compte, création en cours à l'écran : SIGNED_IN est juste
      // réémis au retour sur l'onglet — on reste où on est, brouillon
      // intact, au lieu de renvoyer vers l'horaire (tout serait à refaire).
      if (precId === user.id && creationEnCours()) {
        planifierPropositionPwa();
        return;
      }
      // Même compte et horaire déjà ouvert par le routeur local (démarrage
      // instantané) : on redessine avec les profils fusionnés, sans
      // re-router — l'horaire ne repart pas pour un second chargement.
      // La consultation est comptée ici : au démarrage, l'horaire en cache
      // s'affiche avant que la session Supabase soit prête, donc le
      // tracerVisite() de demarrerHoraire() a échoué faute de session. Le
      // dédoublonnage (30 min par compte et horaire) évite tout doublon.
      if (precId === user.id && vue === "horaire" && profil) {
        rafraichirHoraireLocal();
        tracerVisite();
        planifierPropositionPwa();
        return;
      }
      pile = [];
      if (compte.nom && compte.prenom) {
        if (profil) demarrerHoraire();
        else ouvrirEcoles();
      } else {
        ouvrirIdentite();
      }
      planifierPropositionPwa(); // 1re connexion du compte sur mobile : pop-up écran d'accueil
    });
  }

  /* ---------- Synchro des horaires (local <-> table `profils`) ----------
     Fusion par id, le dernier écrit gagne (horodatage maj / updated_at).
     Hors ligne ou sans cloud : le localStorage seul fait foi. */
  // Colonne `sources` absente du cloud (schema.sql pas rejoué) : les
  // horaires sur mesure restent sur l'appareil (voir pushProfils).
  var baseSansSources = false;
  var pullEnVol = null; // synchro en vol : deux appels ne font qu'une requête
  function pullProfils() {
    if (!SUPABASE_OK || !sb || !sessionSupabase || !sessionSupabase.user || !compte || compte.supabase_id !== sessionSupabase.user.id) return Promise.resolve(false);
    if (pullEnVol) return pullEnVol;
    pullEnVol = pullProfilsMaintenant();
    var fin = function () { pullEnVol = null; };
    pullEnVol.then(fin, fin);
    return pullEnVol;
  }
  function pullProfilsMaintenant() {
    var uid = sessionSupabase.user.id;
    var generation = generationCompte;
    // Base pas encore migrée (colonne `ical` ou `sources` absente) : on
    // relit sans elle, la synchro reste vivante en attendant le schema.sql
    // à jour. Les deux replis se cumulent.
    var colonnes = ["id", "surnom", "ecole", "formation", "groupes", "ical", "sources", "theme", "updated_at"];
    function lire() {
      return sb.from("profils").select(colonnes.join(",")).eq("user_id", uid).then(function (res) {
        var msg = res.error ? String(res.error.message || "") : "";
        var manque = ["ical", "sources"].filter(function (c) {
          return colonnes.indexOf(c) >= 0 && new RegExp(c, "i").test(msg);
        });
        if (!manque.length) return res;
        if (manque.indexOf("sources") >= 0) baseSansSources = true;
        colonnes = colonnes.filter(function (c) { return manque.indexOf(c) < 0; });
        return lire();
      });
    }
    return lire().then(function (res) {
      if (generation !== generationCompte || !sessionSupabase || !sessionSupabase.user || sessionSupabase.user.id !== uid || !compte || compte.supabase_id !== uid) return false;
      if (res.error) throw res.error;
      var parId = {}, aReecrire = false;
      profils.forEach(function (p) { parId[p.id] = p; });
      (res.data || []).forEach(function (l, i) {
        if (!l || !l.id) return;
        var distant = { id: l.id, surnom: String(l.surnom || "Mon horaire").slice(0, 24),
                        ecole: ecoleDe(l.ecole) ? l.ecole : "heh",
                        formation: String(l.formation || ""),
                        groupes: Array.isArray(l.groupes) ? l.groupes.map(propre).filter(Boolean) : [],
                        ical: typeof l.ical === "string" ? l.ical.slice(0, 1200) : "",
                        theme: normaliserTheme(l.theme),
                        maj: Date.parse(l.updated_at) || 0 };
        if (Array.isArray(l.sources) && l.sources.length) {
          distant.sources = l.sources;
          if (profilValide(distant)) normaliserPerso(distant);
        }
        // Nom auto-généré avec l'ancien format ('.BAB1 - …', point UMONS) :
        // réparé comme en local (un choix explicite identique y survivrait aussi).
        if (distant.surnom !== surnomDefaut(l.formation) &&
            anciensSurnomsAuto(l.formation).indexOf(distant.surnom) >= 0) {
          distant.surnom = surnomDefaut(l.formation);
        }
        // École faussée côté cloud : réparée ici, puis réécrite plus bas.
        if (reparerEcoleParcours(distant)) { distant.maj = Date.now(); aReecrire = true; }
        var local = parId[l.id];
        // Ligne distante illisible (perso poussé sans `sources` par une
        // base non migrée…) : elle ne remplace jamais l'horaire local.
        if (!profilValide(distant)) return;
        if (!local || (distant.maj && distant.maj > (local.maj || 0))) parId[l.id] = distant;
      });
      if (aReecrire) planifierPush();
      profils = Object.keys(parId).map(function (k) { return parId[k]; }).filter(profilValide);
      if (profil) {
        var t = null;
        for (var i = 0; i < profils.length; i++) if (profils[i].id === profil.id) t = profils[i];
        profil = t || profils[0] || null;
      } else if (profils.length) {
        profil = profils[0];
      }
      ecrire(CLE_PROFILS, profils);
      ecrire(CLE_COURANT, profil ? profil.id : null);
      return true;
    });
  }
  function pushProfils() {
    if (!SUPABASE_OK || !sb || !sessionSupabase || !sessionSupabase.user || !compte || compte.supabase_id !== sessionSupabase.user.id) return Promise.resolve(false);
    var uid = sessionSupabase.user.id;
    // Base pas encore migrée : on pousse sans `ical` plutôt que d'échouer.
    // Sans colonne `sources`, les horaires sur mesure ne partent PAS (une
    // ligne sans ses sources reviendrait vide et effacerait l'horaire
    // local) : ils restent sur l'appareil.
    var avecIcal = true;
    function ecrire() {
      var lignes = profils.filter(profilValide).filter(function (p) {
        return !baseSansSources || !estPerso(p);
      }).map(function (p) {
        var l = { user_id: uid, id: p.id, surnom: p.surnom, ecole: p.ecole,
                  formation: p.formation, groupes: p.groupes,
                  theme: normaliserTheme(p.theme) };
        if (avecIcal) l.ical = typeof p.ical === "string" ? p.ical.slice(0, 1200) : "";
        if (!baseSansSources) l.sources = estPerso(p) ? p.sources : [];
        return l;
      });
      if (!lignes.length) return Promise.resolve({});
      return sb.from("profils").upsert(lignes, { onConflict: "user_id,id" }).then(function (res) {
        var msg = res.error ? String(res.error.message || "") : "";
        if (msg && !baseSansSources && /sources/i.test(msg)) { baseSansSources = true; rendreListeProfils(); return ecrire(); }
        if (msg && avecIcal && /ical/i.test(msg)) { avecIcal = false; return ecrire(); }
        return res;
      });
    }
    return ecrire().then(function (res) {
      if (res.error) throw res.error;
      return true;
    });
  }
  /* Poussée différée après chaque changement local (renommage, ajout…,
     devoir, suppression…). */
  function planifierPush() {
    if (!SUPABASE_OK || !sb || !sessionSupabase) return;
    clearTimeout(pousseeMinutee);
    var generation = generationCompte;
    pousseeMinutee = setTimeout(function () {
      if (generation !== generationCompte) return;
      pushProfils().then(function () { /* jetable */ }, function () { /* réessaiera au prochain changement */ });
      pushEcheances().then(function () { /* jetable */ }, function () { /* réessaiera au prochain changement */ });
    }, 800);
  }
  function supprimerProfilDistant(id) {
    if (!SUPABASE_OK || !sb || !sessionSupabase) return;
    sb.from("profils").delete().eq("id", id).then(function () { /* jetable */ }, function () { /* jetable */ });
  }
  /* ---------- Suivi d'usage (dashboard admin) ----------
     Une consultation = ouverture de l'app sur un horaire, ou changement
     d'horaire. Fire-and-forget : jamais bloquant, jamais d'erreur visible.
     Table `visites` (voir supabase/schema.sql), RLS insert-only.
     Au démarrage instantané, la session Supabase n'est pas encore prête
     quand l'horaire en cache s'affiche : retourOAuth() (SIGNED_IN, y
     compris réémis au retour sur l'onglet) rattrape le comptage une fois
     la session là. Le même horaire rouvert dans les 30 min ne recompte
     pas (même fenêtre que api/stats.py). */
  var CLE_VISITES = "ezh_visites_tracees";
  function tracerVisite() {
    try {
      if (!SUPABASE_OK || !sb || !sessionSupabase || !sessionSupabase.user || !profil) return;
      var cle = sessionSupabase.user.id + ":" + profil.id, maintenant = Date.now();
      var tracees = {};
      try { tracees = JSON.parse(localStorage.getItem(CLE_VISITES) || "{}") || {}; } catch (e) { tracees = {}; }
      if (maintenant - (+tracees[cle] || 0) < 30 * 60 * 1000) return;
      tracees[cle] = maintenant;
      for (var k in tracees) if (maintenant - tracees[k] > 30 * 60 * 1000) delete tracees[k];
      try { localStorage.setItem(CLE_VISITES, JSON.stringify(tracees)); } catch (e) { /* navigation privée */ }
      sb.from("visites").insert({
        user_id: sessionSupabase.user.id,
        profil_id: profil.id,
        ecole: profil.ecole,
        formation: estPerso(profil) ? "sur mesure" : profil.formation
      }).then(function () { /* jetable */ }, function () { /* jetable */ });
    } catch (e) { /* jetable */ }
  }
  /* PDF officiel affiché avec succès : une ligne dans `pdf_exports`
     (voir supabase/schema.sql), pour savoir si la fonctionnalité sert.
     Chaque ouverture réussie compte, même la même semaine rouverte :
     c'est l'usage réel qui décide si on garde le bouton. */
  function tracerPdf(cible) {
    try {
      if (!SUPABASE_OK || !sb || !sessionSupabase || !sessionSupabase.user || !cible) return;
      sb.from("pdf_exports").insert({
        user_id: sessionSupabase.user.id,
        ecole: String(cible.ecole || "").slice(0, 120),
        formation: String(cible.formation || "").slice(0, 160),
        groupe: String(cible.groupe || "").slice(0, 120),
        semaine: Math.max(0, Math.min(99, +cible.semaine || 0))
      }).then(function () { /* jetable */ }, function () { /* jetable */ });
    } catch (e) { /* jetable */ }
  }
  /* ---------- Notifications in-app (messagerie admin → étudiant) ----------
     Tirage à la connexion et à l'ouverture des Réglages, pastille sur
     l'avatar tant qu'il reste des non lues, tap = lue (et suit le lien
     interne si la notif en porte un). Lecture seule via la clé anon
     (RLS « chacun ne voit que SES lignes », marquage « lu » verrouillé
     par trigger) ; l'envoi passe par POST /api/notifications (admin).
     Table absente (schema.sql pas rejoué) : on n'essaie plus, la section
     reste vide — comme les horaires sans colonne `sources`. */
  var notifs = [], baseSansNotifs = false, notifsEnVol = null;
  function tirerNotifs() {
    if (!SUPABASE_OK || !sb || !sessionSupabase || !sessionSupabase.user || baseSansNotifs) return Promise.resolve(false);
    if (notifsEnVol) return notifsEnVol;
    var uid = sessionSupabase.user.id;
    notifsEnVol = sb.from("notifications").select("id,created_at,titre,message,lien,lu_at")
      .eq("user_id", uid).order("created_at", { ascending: false }).limit(100)
      .then(function (res) {
        notifsEnVol = null;
        if (res.error) {
          if (/notif/i.test(String(res.error.message || ""))) baseSansNotifs = true;
          return false;
        }
        notifs = (res.data || []).filter(function (n) { return n && n.id != null; }).map(function (n) {
          return { id: n.id, created_at: n.created_at || "", titre: String(n.titre || "").slice(0, 80),
                   message: String(n.message || "").slice(0, 1000),
                   lien: String(n.lien || "").slice(0, 300), lu_at: n.lu_at || "" };
        });
        majCaseNotifs();
        if (notifsOuvertes()) rendreNotifs();
        return true;
      }, function () { notifsEnVol = null; return false; });
    return notifsEnVol;
  }
  function dateNotif(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(+d)) return "";
      return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    } catch (e) { return ""; }
  }
  /* Pastille de l'avatar + case « Notifications » du dos de la carte
     (compteur). La case n'existe que pour un vrai compte connecté. */
  function majCaseNotifs() {
    var n = notifs.filter(function (x) { return !x.lu_at; }).length;
    var past = document.getElementById("notif-dot");
    if (past) past.hidden = !n;
    var moi = document.getElementById("btn-moi");
    if (moi) moi.setAttribute("aria-label", n ? "Réglages (" + n + " notification" + (n > 1 ? "s" : "") + " non lue" + (n > 1 ? "s" : "") + ")" : "Réglages");
    var reel = !!(SUPABASE_OK && sb && sessionSupabase && sessionSupabase.user);
    var b = document.getElementById("btn-notifs");
    if (b) b.hidden = !reel;
    var badge = document.getElementById("notifs-badge");
    if (badge) { badge.hidden = !n; badge.textContent = n > 9 ? "9+" : String(n); }
  }
  function notifsOuvertes() { return !document.getElementById("voile-notifs").hidden; }
  function ouvrirNotifs() {
    rendreNotifs();
    document.getElementById("voile-notifs").hidden = false;
    tirerNotifs();
  }
  function fermerNotifs() { document.getElementById("voile-notifs").hidden = true; }
  function rendreNotifs() {
    var zone = document.getElementById("liste-notifs");
    if (!zone) return;
    if (!notifs.length) {
      zone.innerHTML = '<p class="notifs-vide">Aucune notification pour le moment.</p>';
      return;
    }
    zone.innerHTML = notifs.map(function (n) {
      return '<button type="button" class="notif' + (n.lu_at ? "" : " nonlue") + '" data-notif="' + n.id + '">' +
        (n.titre ? '<span class="notif-titre">' + txt(n.titre) + "</span>" : "") +
        '<span class="notif-texte">' + txt(n.message) + "</span>" +
        (n.created_at ? '<span class="notif-date">' + txt(dateNotif(n.created_at)) + "</span>" : "") + "</button>";
    }).join("");
  }
  document.getElementById("liste-notifs").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-notif]");
    if (!b || !SUPABASE_OK || !sb || !sessionSupabase || !sessionSupabase.user) return;
    var id = +b.getAttribute("data-notif");
    var n = null;
    for (var i = 0; i < notifs.length; i++) if (notifs[i].id === id) n = notifs[i];
    if (!n || n.lu_at) { if (n && n.lien) suivreLienNotif(n.lien); return; }
    n.lu_at = new Date().toISOString();
    majCaseNotifs();
    rendreNotifs();
    sb.from("notifications").update({ lu_at: n.lu_at }).eq("id", id)
      .eq("user_id", sessionSupabase.user.id).then(function () { /* jetable */ }, function () { /* jetable */ });
    if (n.lien) suivreLienNotif(n.lien);
  });
  function suivreLienNotif(lien) {
    // Chemin interne uniquement (la base refuse le reste) : on reste dans l'app.
    if (/^\/[^ ]*$/.test(lien)) { fermerNotifs(); fermerFeuille(); location.assign(lien); }
  }
  document.getElementById("notifs-fermer").addEventListener("click", fermerNotifs);
  // Le panneau vit hors de la feuille : sans ce stop, le clic-extérieur
  // (document) refermerait aussi les Réglages derrière.
  document.getElementById("voile-notifs").addEventListener("click", function (e) {
    e.stopPropagation();
    if (e.target === this) fermerNotifs();
  });
  /* ---------- Bouton « Tableau admin » (menu ⋮ du compte) ----------
     Visible uniquement si /api/stats confirme que ce compte est admin
     (ADMIN_USER_IDS ou app_metadata côté serveur). Vérifié une fois par
     session, en arrière-plan à l'ouverture des réglages. */
  var adminVerifie = false;
  function montrerBoutonAdmin() {
    var b = document.getElementById("btn-admin");
    if (b) b.hidden = false;
  }
  function verifierAdmin() {
    if (adminVerifie) return;
    try {
      if (!SUPABASE_OK || !sb || !sessionSupabase || !sessionSupabase.access_token) return;
      fetch("/api/stats?check=1", {
        headers: { "Authorization": "Bearer " + sessionSupabase.access_token },
        cache: "no-store"
      }).then(function (r) { return r.json(); }).then(function (rep) {
        if (rep && rep.ok) { adminVerifie = true; montrerBoutonAdmin(); }
        // 403 = pas admin : le bouton reste caché, rien à signaler.
      }, function () { /* hors ligne : on réessaiera à la prochaine ouverture */ });
    } catch (e) { /* jetable */ }
  }

  var AUTH = {
    user: null,
    // OAuth (Google / GitHub) via Supabase. Sans cloud : faux compte local
    // uniquement en développement (localhost) ; en ligne, on le dit
    // clairement au lieu de faire semblant de connecter.
    login: function (fournisseur) {
      fournisseurChoisi = fournisseur;
      if (window.EZH_SUIVI) {
        EZH_SUIVI.envoyer("clic_connexion", { fournisseur: fournisseur });
        EZH_SUIVI.marquer("clic");
      }
      // Le SDK peut être encore en route (defer) : on l'attend avant de
      // décider (vrai OAuth ou repli local), sans bloquer l'affichage.
      return pretCloud().then(function () {
        if (!SUPABASE_OK || !sb) {
          if (!EN_LOCAL) {
            statutAuthErreur("Service de connexion injoignable : réessaie dans quelques minutes.", "connexion_injoignable");
            return false;
          }
          compte = { fournisseur: fournisseur, nom: "", prenom: "" };
          sauverCompte();
          aller("identite");
          return false;
        }
        statutAuthChargement("Redirection vers " + (fournisseur === "github" ? "GitHub" : "Google") + "…");
        var options = { redirectTo: location.origin + location.pathname };
        // Google : forcer l'écran de choix du compte. Sans ça, après une
        // déconnexion, Google reconnecte silencieusement le dernier compte
        // au lieu de proposer d'en choisir un autre.
        if (fournisseur === "google") options.queryParams = { prompt: "select_account" };
        return sb.auth.signInWithOAuth({
          provider: fournisseur,
          options: options
        }).then(function (res) {
          if (res.error) statutAuthErreur("Échec : " + res.error.message, codeAuth(res.error) || "connexion_echouee");
          return !res.error; // vrai = redirection en cours
        });
      });
    },
    // Email + mot de passe, selon le mode choisi sur le rail :
    //   « login »  : signInWithPassword seul. Une adresse inconnue
    //                garde l'erreur « Email ou mot de passe incorrect »
    //                d'avant (le signUp de secours créait un compte
    //                fantôme sur une simple faute de frappe).
    //   « signup » : signUp seul. Une adresse déjà inscrite est refusée
    //                (Supabase renvoie alors un utilisateur sans
    //                identité, sans erreur, pour ne pas révéler qui est
    //                inscrit : on le transforme en message clair).
    loginEmail: function (email, mdp, mode) {
      var self = this;
      // Même attente que « login » : le SDK chargé en arrière-plan peut
      // encore arriver quand on touche le bouton.
      return pretCloud().then(function () {
        if (!SUPABASE_OK || !sb) {
          statutAuthErreur("Service de connexion injoignable : réessaie dans quelques minutes.", "connexion_injoignable");
          return false;
        }
        email = String(email || "").trim();
        var creation = mode === "signup";
        statutAuthChargement(creation ? "Création du compte…" : "Connexion en cours…");
        var demande;
        if (creation) {
          demande = sb.auth.signUp({
            email: email, password: mdp,
            options: { emailRedirectTo: location.origin + location.pathname }
          }).then(function (ins) {
            if (ins.error || (ins.data && ins.data.session)) return ins;
            var u = ins.data && ins.data.user;
            // Adresse déjà inscrite : Supabase renvoie un utilisateur
            // « flouté » (aucune identité) pour ne pas révéler qui est
            // inscrit. Impossible de savoir si ce compte est confirmé : on
            // renvoie vers l'attente d'activation ET la connexion, au lieu
            // d'un « connecte-toi » qui mène à un cul-de-sac quand le compte
            // n'est pas encore confirmé.
            if (u && u.identities && u.identities.length === 0) {
              ouvrirActivation(email, true);
              return null;
            }
            if (window.EZH_SUIVI) {
              EZH_SUIVI.marquer("compte");
              EZH_SUIVI.envoyer("compte_cree", { fournisseur: "email", details: { activation: "email" } });
            }
            ouvrirActivation(email, false);
            return null;
          });
        } else {
          demande = sb.auth.signInWithPassword({ email: email, password: mdp });
        }
        return demande.then(function (res) {
          if (!res) return false;
          if (res.error) {
            statutAuthErreur(messageAuth(res.error), codeAuth(res.error) || "connexion_echouee");
            marquerChampsErreur();
            return false;
          }
          if (res.data && res.data.session && res.data.session.user) {
            self.user = res.data.session.user;
            sessionSupabase = res.data.session;
            statutAuthEffacer();
            return retourOAuth(res.data.session.user);
          }
          return true;
        });
      });
    },
    logout: function () {
      effacerSession();
      if (SUPABASE_OK && sb) return sb.auth.signOut().then(function (res) {
        return !res.error;
      }, function () { return false; });
      return Promise.resolve(true);
    }
  };
  function initiales() {
    var p = ((compte && compte.prenom) || "").replace(/\s+/g, " ").trim().charAt(0);
    var n = ((compte && compte.nom) || "").replace(/\s+/g, " ").trim().charAt(0);
    return (p + n).toUpperCase();
  }
  function rendreAvatar() {
    var ini = initiales();
    function poser(t, ic) {
      if (ini) { t.textContent = ini; t.hidden = false; t.style.display = ""; ic.style.display = "none"; }
      else { t.textContent = ""; t.hidden = true; t.style.display = "none"; ic.style.display = ""; }
    }
    var t = document.getElementById("avatar-init"), ic = document.getElementById("avatar-icone");
    if (t && ic) {
      // Note : `hidden = true` ne cache PAS un SVG (pas de reflet vers
      // l'attribut hors HTML) : on passe par style.display pour l'icône.
      // Mais `t` est un <span> : son attribut `hidden` le masque via la
      // règle `[hidden] { display: none !important }`, que style.display
      // seul ne peut pas surcharger. Il faut donc basculer `hidden` aussi,
      // sinon les initiales restent invisibles et le rond paraît vide.
      poser(t, ic);
    }
    // Copies du bouton profil sur la page de recherche : mêmes initiales.
    Array.prototype.forEach.call(document.querySelectorAll("#rc .avatar"), function (av) {
      var tc = av.querySelector(".rc-avatar-init"), icc = av.querySelector(".rc-avatar-icone");
      if (tc && icc) poser(tc, icc);
    });
    var ra = document.getElementById("reg-avatar");
    if (ra) ra.textContent = ini || "?";
  }

  var DATA = null;       // horaire complet de la formation affichée
  var COURS = [];        // ses cours, filtrés selon les groupes de l'étudiant
  var COURS_PAR_JOUR = {}; // « sem|jour » -> cours triés (index d'affichage)
  var CHOCS = [];        // sur mesure : entre sources ; codes de cours : entre cours
  var CHOCS_SEM = {};    // sem -> chevauchements de la semaine
  var COURS_EN_CHOC = {}; // sem -> Set des cours qui se chevauchent
  var NOUVELLES_SEMAINES = []; // semaines publiées depuis la dernière visite
  var SANS_PROFS = false; // l'école ne publie aucun nom de prof (calculé à l'installation)
  var ALERTES_SEMAINES = {}; // profils déjà alertés depuis l'ouverture de la page
  var LUNDI0 = null, SEMAINES = [];
  var FERIES = {};       // jours fériés / de congé de l'école : { n° de jour : true }
  var FERIES_NOMS = {};  // leur nom quand l'école en donne un (« Toussaint »)
  var sem = 1;
  // Faux dès que l'utilisateur a choisi une semaine (flèches, bandeau) :
  // tous les horaires restent alors sur la même semaine. Vrai de nouveau
  // avec « Cette semaine » ou tant qu'il n'a jamais navigué — et tant
  // qu'il est vrai, chaque installation (ouverture, retour sur l'onglet)
  // repose la semaine d'office : un week-end qui passe bascule tout seul.
  var semaineAuto = true;

  function parseDate(iso) {
    var p = iso.split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function dateSemJour(s, jour) {
    var d = new Date(LUNDI0.getTime());
    d.setDate(d.getDate() + (s - 1) * 7 + jour);
    return d;
  }
  function fmtDate(d) { return d.getDate() + " " + MOIS[d.getMonth()]; }
  function fmtH(h) { h = String(h); return h.charAt(1) === "h" ? "0" + h : h; } // "8h15" -> "08h15"
  /* Dates d'une semaine au format du bandeau (« 28 sept. – 2 oct. 2026 ») :
     du lundi au dernier jour où il y a cours — dimanche quand l'école en
     donne un, sinon samedi (ULB), sinon vendredi. Sert au bandeau de la
     semaine et aux dates d'un cours (voir la recherche). */
  function datesSemaine(s) {
    var lun = dateSemJour(s, 0);
    var fin = coursDe(s, 6).length ? dateSemJour(s, 6)
            : coursDe(s, 5).length ? dateSemJour(s, 5)
            : dateSemJour(s, 4);
    return (lun.getMonth() === fin.getMonth()
      ? lun.getDate() + " – " + fmtDate(fin)
      : fmtDate(lun) + " – " + fmtDate(fin)) + " " + fin.getFullYear();
  }
  // n° de jour de l'école : 1 = premier lundi (voir HP.feries côté API).
  function numJour(s, jour) { return (s - 1) * 7 + jour + 1; }
  function estFerie(s, jour) { return !!FERIES[numJour(s, jour)]; }
  // « Férié » remplacé par le nom officiel quand l'école le donne.
  function nomFerie(s, jour) { return FERIES_NOMS[numJour(s, jour)] || "Férié"; }
  function memeJour(a, b) {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  function parseEns(txt) {
    var out = [];
    String(txt).replace(/[\[\]]/g, "").split(",").forEach(function (part) {
      part = part.trim();
      if (!part) return;
      if (part.indexOf("..") >= 0) {
        var b = part.split("..");
        for (var i = +b[0]; i <= +b[1]; i++) out.push(i);
      } else out.push(+part);
    });
    return out;
  }
  // Semaine à afficher d'office : celle de la date du jour, sauf une fois
  // la semaine de cours terminée — l'app passe à la suivante le week-end,
  // dès le samedi quand le dernier cours est le vendredi, dès le dimanche
  // quand il est le samedi, et le lundi quand il est le dimanche. La règle
  // vit dans semaine.js (test_semaine.mjs).
  function semaineCourante() {
    return SEMAINE.semaineAffichee(LUNDI0, SEMAINES, COURS, new Date());
  }
  // Clé d'un groupe : voir les règles partagées en tête de script
  // (propre, courtGroupe, aPrefixe, memeGroupe, groupeDans).
  function nomGroupe(s) {
    var m = /^\s*<([^>]*)>(.*)$/.exec(String(s));
    return m ? propre(m[2]) + " (" + joliFormation(m[1]) + ")" : propre(s);
  }
  // Nom de formation affichable : l'UMONS préfixe d'un point
  // ('.BAB1 - Droit'). La valeur complète reste la clé d'API.
  // ULB : « PAR:CODE1,CODE2 » (cours choisis) et le libellé du lien perso
  // sont résumés pour l'affichage.
  function joliFormation(f) {
    var s = String(f == null ? "" : f);
    if (s.indexOf("PAR:") === 0) {
      var codes = s.slice(4).split(",").filter(Boolean);
      return codes.length > 3 ? codes.length + " cours choisis" : codes.join(" · ");
    }
    if (/^Mon horaire \(lien/.test(s)) return "Mon horaire";
    return s.replace(/^\s*[.\s]+/, "").replace(/\s+/g, " ").trim();
  }
  function txt(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* Bouton retour Android : chaque fenêtre / feuille empile une entrée
     history ; le retour ferme la couche du dessus au lieu de quitter
     l'app. Les menus et la carte retournée sont une sous-couche de la feuille (pas d'entrée
     propre) : un retour les ferme d'abord, la feuille reste. */
  var histPile = [];
  var histIgnore = 0; // popstate dus à un history.back() programmatique
  function histOuvrir(id) {
    if (histPile.indexOf(id) !== -1) return;
    histPile.push(id);
    try { history.pushState({ ezh: id }, ""); } catch (e) { /* jetable */ }
  }
  function histFermer(id) {
    var i = histPile.lastIndexOf(id);
    if (i === -1) return;
    histPile.splice(i, 1);
    if (i !== histPile.length) return; // pas la couche du dessus
    histIgnore++;
    try { history.back(); } catch (e) { histIgnore--; }
  }
  function histCoucheFermer(id) {
    if (id === "confirm") repondreConfirmation(false);
    else if (id === "edition") fermerEdition();
    else if (id === "echeance") fermerEcheance();
    else if (id === "export") fermerExport();
    else if (id === "bug") fermerBug();
    else if (id === "menus") fermerMenus();
    else if (id === "feuille") fermerFeuille();
    else if (id === "pop") fermerPop();
    else if (id === "rc") rcFermer();
  }
  window.addEventListener("popstate", function () {
    if (histIgnore > 0) { histIgnore--; return; }
    // Menus ouverts : sous-couche sans entrée propre. On les ferme et on
    // rejoue l'entrée de la feuille, ainsi le prochain retour la ferme.
    if (menusOuverts() && histPile.length) {
      fermerMenus();
      try { history.pushState({ ezh: histPile[histPile.length - 1] }, ""); } catch (e) { /* jetable */ }
      return;
    }
    // Recherche ouverte sur les dates d'un cours : même principe, le
    // retour ramène d'abord à la liste des cours, puis rejoue l'entrée.
    // Seulement quand « rc » est la couche du dessus : le formulaire
    // d'échéance ouvert par-dessus part avec un Retour, pas la recherche.
    // Ouverte directement sur un cours (pastille), le retour ferme tout :
    // pas d'étape « liste des cours » dans ce parcours.
    if (rcGroupe && !rcDirect && histPile[histPile.length - 1] === "rc") {
      rcRetourListe();
      try { history.pushState({ ezh: "rc" }, ""); } catch (e) { /* jetable */ }
      return;
    }
    if (!histPile.length) return;
    var id = histPile.pop();
    histCoucheFermer(id);
  });

  /* Demande de confirmation custom (remplace window.confirm partout).
     Usage : demanderConfirmation({ titre, message, confirmer, annuler, danger })
     -> Promise<boolean>. Voile flouté, Échap / clic dehors = non,
     focus piégé dans la carte, fond bloqué pendant la demande. */
  var ICONE_POUBELLE = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 4h7M7 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1L18 7"/>' +
    '<path d="M10 11v6M14 11v6"/></svg>';
  var ICONE_POINT_INTERRO = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
    'stroke-linecap="round"><path d="M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4"/><circle cx="12" cy="17.5" r=".5" fill="currentColor"/></svg>';
  var confirmerResolve = null, confirmerDernierFocus = null;
  function demanderConfirmation(opts) {
    opts = opts || {};
    var voile = document.getElementById("voile-confirm");
    var boite = document.getElementById("boite-confirm");
    var icone = document.getElementById("confirm-icone");
    var titre = document.getElementById("confirm-titre");
    var msg = document.getElementById("confirm-msg");
    var btnNon = document.getElementById("confirm-non");
    var btnOui = document.getElementById("confirm-oui");
    // Une seule demande à la fois : la précédente répond non.
    if (confirmerResolve) { var prev = confirmerResolve; confirmerResolve = null; prev(false); }
    var danger = opts.danger !== false;
    titre.textContent = opts.titre || "Confirmer ?";
    msg.innerHTML = opts.message || "";
    btnNon.textContent = opts.annuler || "Annuler";
    btnOui.textContent = opts.confirmer || "Confirmer";
    boite.classList.toggle("info", !danger);
    icone.innerHTML = danger ? ICONE_POUBELLE : ICONE_POINT_INTERRO;
    confirmerDernierFocus = document.activeElement;
    voile.hidden = false;
    document.body.classList.add("confirm-ouverte");
    histOuvrir("confirm");
    // Rejoue l'animation à chaque ouverture.
    try { void boite.offsetWidth; } catch (e) { /* jetable */ }
    setTimeout(function () { try { btnNon.focus(); } catch (e) { /* jetable */ } }, 30);
    return new Promise(function (resolve) { confirmerResolve = resolve; });
  }
  function repondreConfirmation(ok) {
    if (!confirmerResolve) return;
    histFermer("confirm");
    var resolve = confirmerResolve;
    confirmerResolve = null;
    document.getElementById("voile-confirm").hidden = true;
    document.body.classList.remove("confirm-ouverte");
    if (confirmerDernierFocus && confirmerDernierFocus.focus) {
      try { confirmerDernierFocus.focus(); } catch (e) { /* jetable */ }
    }
    resolve(!!ok);
  }
  document.getElementById("confirm-non").addEventListener("click", function () { repondreConfirmation(false); });
  document.getElementById("confirm-oui").addEventListener("click", function () { repondreConfirmation(true); });
  document.getElementById("voile-confirm").addEventListener("click", function (e) {
    e.stopPropagation(); // la réponse ne doit pas fermer les réglages derrière
    if (e.target === this) repondreConfirmation(false);
  });
  // Échap = non, Tab reste dans la carte (tant qu'une demande est ouverte,
  // les autres raccourcis Échap de l'app sont ignorés — voir plus bas).
  document.addEventListener("keydown", function (e) {
    if (!confirmerResolve || document.getElementById("voile-confirm").hidden) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); repondreConfirmation(false); }
    else if (e.key === "Tab") {
      var btns = [document.getElementById("confirm-non"), document.getElementById("confirm-oui")];
      var i = btns.indexOf(document.activeElement);
      e.preventDefault();
      if (e.shiftKey) btns[(i <= 0 ? btns.length : i) - 1].focus();
      else btns[(i + 1) % btns.length].focus();
    }
  }, true);
  function confirmationOuverte() {
    return !!confirmerResolve && !document.getElementById("voile-confirm").hidden;
  }
  var sansAnim = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var MQ_BUREAU = window.matchMedia("(min-width: 1024px)");
  function bureau() { return MQ_BUREAU.matches; }
  // Chaque vue ne construit que ce qu'elle affiche (voir rendre) : en
  // changeant de taille d'écran, on repose celle qui devient visible.
  if (MQ_BUREAU.addEventListener) {
    MQ_BUREAU.addEventListener("change", function () {
      if (DATA && vue === "horaire") rendre();
    });
  }

  var joursOuverts = {}; // jours dépliés {index: true}, interrupteurs indépendants
  var coursOuverts = {}; // cours dépliés {"jour:index": true}, interrupteurs indépendants
  var suppOuverts = {};  // sections soir dépliées {jour: true}
  function resetDepliage() { joursOuverts = {}; coursOuverts = {}; suppOuverts = {}; }

  /* Visionneuse PDF intégrée : le PDF s'affiche sous le bouton, sans
     nouvel onglet. Pendant le téléchargement, un reflet balaie le texte
     d'attente en boucle ; il disparaît dès que le PDF est là. */
  var pdfURL = null, pdfCharge = false, pdfOuvert = false, pdfDemande = 0, pdfDoc = null;
  /* pdf.js est servi par le site (assets/vendor/pdfjs/, version dans le
     dossier, cache un an) : même origine, pas de CDN tiers, et le PDF
     s'ouvre même si le CDN est injoignable. */
  var PDFJS_BASE = "/assets/vendor/pdfjs/";
  /* pdf.js (~320 Ko) n'est chargé qu'à la première ouverture d'un PDF :
     la plupart des visites n'en ouvrent aucun, inutile de le payer au
     démarrage. */
  var pdfJsPromesse = null;
  function chargerPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!pdfJsPromesse) {
      pdfJsPromesse = new Promise(function (ok, ko) {
        var s = document.createElement("script");
        s.src = PDFJS_BASE + "pdf.min.js";
        s.onload = function () { if (window.pdfjsLib) ok(window.pdfjsLib); else { pdfJsPromesse = null; ko(); } };
        s.onerror = function () { pdfJsPromesse = null; ko(); };
        document.head.appendChild(s);
      });
    }
    return pdfJsPromesse;
  }
  var ICONE_PDF = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>' +
    '<path d="M14 3v5h5M9 13h6M9 17h4"/></svg>';
  function majBoutonPdf() {
    var btn = document.getElementById("btn-pdf");
    // Horaire importé d'un lien, ou école qui ne publie pas de PDF :
    // il n'y a pas de document officiel à montrer.
    var ec = profil && ecoleDe(profil.ecole);
    if (profil && (profil.ical || (ec && ec.pdf === false) || (estPerso(profil) && !optionsPdfPerso().length))) {
      btn.hidden = true;
      document.getElementById("horaire-contenu").classList.remove("pdf-ouvert");
      return;
    }
    btn.hidden = false;
    var ouvert = pdfOuvert || pdfCharge;
    // Sur ordinateur, juste le mot PDF (la semaine est déjà en titre).
    if (bureau()) {
      btn.textContent = "PDF";
      var etiquette = (ouvert ? "Masquer le PDF officiel de la semaine " : "Afficher le PDF officiel de la semaine ") + sem;
      btn.setAttribute("aria-label", etiquette);
      btn.setAttribute("title", etiquette);
    } else {
      btn.removeAttribute("aria-label");
      btn.removeAttribute("title");
      // Sur téléphone, le texte complet s'affiche.
      btn.innerHTML = ICONE_PDF + "<span>" + (ouvert ? "Masquer le PDF" : "PDF officiel") +
        '<span class="sm"> de la semaine ' + sem + "</span></span>";
    }
    btn.setAttribute("aria-expanded", ouvert ? "true" : "false");
    document.getElementById("horaire-contenu").classList.toggle("pdf-ouvert", ouvert);
    document.getElementById("pdf-sem").textContent = "Semaine " + sem;
    majOutilsPdf();
  }
  function majOutilsPdf() {
    document.getElementById("pdf-niveau").textContent = Math.round(pdfEchelle * 100) + " %";
    document.getElementById("pdf-moins").disabled = !pdfZoomable || pdfEchelle <= 1.001;
    document.getElementById("pdf-plus").disabled = !pdfZoomable || pdfEchelle >= PDF_ZOOM_MAX - 0.001;
    document.getElementById("pdf-niveau").disabled = !pdfZoomable;
    var onglet = document.getElementById("pdf-onglet");
    onglet.hidden = !pdfURL || pdfCharge;
    if (pdfURL) { onglet.href = pdfURL; onglet.target = "_blank"; onglet.rel = "noopener"; }
    else { onglet.removeAttribute("href"); onglet.removeAttribute("target"); onglet.removeAttribute("rel"); }
  }
  /* Rend les pages du PDF en images à la définition de l'écran, pour la
     largeur affichée (donc zoom compris) : net à tout niveau de zoom.
     Une page déjà assez nette est gardée ; sinon elle est redessinée à
     côté puis échangée, sans clignotement. Un nouveau rendu annule le
     précédent (jeton). */
  var pdfJetonRendu = 0, pdfTacheRendu = null, pdfMinuteurNettete = null;
  function annulerRenduPdf() {
    pdfJetonRendu++;
    clearTimeout(pdfMinuteurNettete);
    if (pdfTacheRendu) { try { pdfTacheRendu.cancel(); } catch (e) { /* jetable */ } pdfTacheRendu = null; }
  }
  function rendrePagesPdf(conteneur) {
    annulerRenduPdf();
    var jeton = pdfJetonRendu, page = 1;
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var largeurPx = conteneur.getBoundingClientRect().width * dpr;
    // Plafond par image : la mémoire des canvas est limitée sur iPhone.
    var maxPx = pdfDoc ? Math.max(2.5e6, Math.min(1e7, 3e7 / pdfDoc.numPages)) : 1e7;
    (function suivante() {
      if (jeton !== pdfJetonRendu || !pdfDoc || !conteneur.isConnected) return;
      if (page > pdfDoc.numPages) {
        // Rendu complet : la réserve saute (le contenu a sa vraie hauteur,
        // quasi identique si elle était calibrée : aucun saut visible),
        // puis on retient la hauteur et on corrige le cadrage une fois.
        var zf = document.getElementById("pdf-zone");
        if (zf) { zf.classList.remove("attente"); zf.style.minHeight = ""; }
        memoriserHauteurPdf(); recadrerPdfFinal(); return;
      }
      pdfDoc.getPage(page).then(function (pg) {
        if (jeton !== pdfJetonRendu) return;
        var base = pg.getViewport({ scale: 1 });
        var echelle = largeurPx / base.width;
        if (base.width * base.height * echelle * echelle > maxPx) {
          echelle = Math.sqrt(maxPx / (base.width * base.height));
        }
        var ancien = conteneur.children[page - 1];
        if (ancien && ancien.width >= Math.floor(base.width * echelle) * 0.9) { page++; suivante(); return; }
        var vp = pg.getViewport({ scale: echelle });
        var cv = document.createElement("canvas");
        cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
        pdfTacheRendu = pg.render({ canvasContext: cv.getContext("2d"), viewport: vp });
        pdfTacheRendu.promise.then(function () {
          pdfTacheRendu = null;
          if (jeton !== pdfJetonRendu) return;
          if (ancien) { conteneur.replaceChild(cv, ancien); ancien.width = ancien.height = 0; }
          else conteneur.appendChild(cv);
          page++; suivante();
        }, function () {
          pdfTacheRendu = null;
          cv.width = cv.height = 0;
          if (jeton === pdfJetonRendu) { page++; suivante(); }
        });
      }, function () { page++; suivante(); });
    })();
  }
  // Après un zoom, redessine en haute définition une fois le geste posé.
  function planifierNettetePdf() {
    clearTimeout(pdfMinuteurNettete);
    pdfMinuteurNettete = setTimeout(function () {
      if (pdfPagesEl && pdfDoc && !pdfGeste) rendrePagesPdf(pdfPagesEl);
    }, 220);
  }
  function oublierPdfDoc() {
    annulerRenduPdf();
    if (pdfDoc) { try { pdfDoc.destroy(); } catch (e) { /* jetable */ } pdfDoc = null; }
  }
  // Texte d'attente du PDF (voir attente(), partagée avec les autres écrans).
  function statutPdfAttente(status) {
    attente(status, "Le PDF est en cours de téléchargement…");
  }
  function fermerPdf() {
    pdfDemande++; // invalide un téléchargement en cours
    pdfCharge = false; pdfOuvert = false;
    pdfOublierMain(); pdfMainUtilisateur = false;
    oublierPdfDoc();
    arreterAnimZoomPdf();
    pdfPagesEl = null; pdfPinceEl = null; pdfDezoomEl = null; pdfEchelle = 1; pdfZoomable = false;
    if (pdfURL) { try { URL.revokeObjectURL(pdfURL); } catch (e) { /* jetable */ } pdfURL = null; }
    var zone = document.getElementById("pdf-zone");
    var status = document.getElementById("pdf-status");
    zone.hidden = true;
    zone.classList.remove("attente");
    zone.style.minHeight = "";
    statutPdfAttente(status);
    Array.prototype.forEach.call(zone.querySelectorAll(".pdf-apercu, .pdf-astuce"), function (n) {
      n.remove();
    });
    var btn = document.getElementById("btn-pdf");
    btn.disabled = false;
    majBoutonPdf();
  }
  /* Zoom du PDF : pincement, double-toucher, Ctrl+molette (pavé tactile).
     Le zoom élargit vraiment les pages : la hauteur grandit avec, la page
     défile verticalement normalement et le cadre défile horizontalement.
     Le point sous les doigts reste sous les doigts, et déplacer les deux
     doigts fait glisser le PDF avec eux (comme dans Photos). Au-delà des
     limites, le zoom résiste puis revient en douceur. */
  var pdfEchelle = 1, pdfPagesEl = null, pdfPinceEl = null, pdfDezoomEl = null;
  var pdfZoomable = false, pdfGeste = false, pdfAnimZoom = 0;
  var PDF_ZOOM_MAX = 5;
  function zoomPdfAppliquer() {
    if (!pdfPagesEl) return;
    pdfPagesEl.style.width = pdfEchelle === 1 ? "" : (pdfEchelle * 100) + "%";
    if (pdfDezoomEl) pdfDezoomEl.classList.toggle("visible", pdfEchelle > 1.02);
    majOutilsPdf();
  }
  // Sur ordinateur, le panneau PDF défile lui-même ; sur téléphone, c'est la page.
  function pdfDefileSeul() {
    return !!pdfPinceEl && getComputedStyle(pdfPinceEl).overflowY === "auto";
  }
  /* Passe à l'échelle voulue : le point du PDF qui était sous (cx, cy)
     se retrouve sous (cx + dx, cy + dy). Horizontal : défilement du cadre ;
     vertical : défilement de la page. */
  function zoomPdfVers(echelle, cx, cy, dx, dy) {
    if (!pdfPinceEl || !pdfPagesEl) return;
    var r0 = pdfPagesEl.getBoundingClientRect();
    var k = echelle / pdfEchelle;
    var gaucheVoulue = cx + (dx || 0) - (cx - r0.left) * k;
    var hautVoulu = cy + (dy || 0) - (cy - r0.top) * k;
    pdfEchelle = echelle;
    zoomPdfAppliquer();
    var r1 = pdfPagesEl.getBoundingClientRect();
    pdfPinceEl.scrollLeft += r1.left - gaucheVoulue;
    if (pdfDefileSeul()) pdfPinceEl.scrollTop += r1.top - hautVoulu;
    else window.scrollBy(0, r1.top - hautVoulu);
  }
  function arreterAnimZoomPdf() {
    if (pdfAnimZoom) { cancelAnimationFrame(pdfAnimZoom); pdfAnimZoom = 0; }
  }
  // Transition douce vers une échelle, ancrée sur (cx, cy).
  function animerZoomPdf(cible, cx, cy) {
    arreterAnimZoomPdf();
    var depart = pdfEchelle, t0 = 0, duree = sansAnim ? 0 : 280;
    if (Math.abs(cible - depart) < 0.001) { planifierNettetePdf(); return; }
    function pas(t) {
      if (!t0) t0 = t;
      var p = duree ? Math.min(1, (t - t0) / duree) : 1;
      var e = 1 - Math.pow(1 - p, 3); // décélération
      zoomPdfVers(depart + (cible - depart) * e, cx, cy);
      if (p < 1) pdfAnimZoom = requestAnimationFrame(pas);
      else { pdfAnimZoom = 0; planifierNettetePdf(); }
    }
    pdfAnimZoom = requestAnimationFrame(pas);
  }
  // Point d'ancrage par défaut : le centre de la partie visible du PDF.
  function centreVisiblePdf() {
    var r = pdfPinceEl.getBoundingClientRect();
    var haut = Math.max(r.top, 0), bas = Math.min(r.bottom, window.innerHeight);
    return { x: r.left + r.width / 2, y: bas > haut ? (haut + bas) / 2 : r.top };
  }
  function dezoomerPdf() {
    if (!pdfPinceEl) return;
    var c = centreVisiblePdf();
    animerZoomPdf(1, c.x, c.y);
  }
  // Boutons − / + du panneau PDF (ordinateur), par paliers de 25 %.
  function zoomPasPdf(sens) {
    if (!pdfZoomable || !pdfPinceEl) return;
    var c = centreVisiblePdf();
    var cible = sens > 0 ? pdfEchelle * 1.25 : pdfEchelle / 1.25;
    if (Math.abs(cible - 1) < 0.08) cible = 1;
    animerZoomPdf(Math.min(PDF_ZOOM_MAX, Math.max(1, cible)), c.x, c.y);
  }
  document.getElementById("pdf-plus").addEventListener("click", function () { zoomPasPdf(1); });
  document.getElementById("pdf-moins").addEventListener("click", function () { zoomPasPdf(-1); });
  document.getElementById("pdf-niveau").addEventListener("click", dezoomerPdf);
  document.getElementById("pdf-fermer").addEventListener("click", function () { fermerPdf(); });
  // Résistance au-delà des limites (×1 et ×5), comme un élastique.
  function elastiquePdf(s) {
    if (s < 1) return 1 - (1 - s) * 0.35;
    if (s > PDF_ZOOM_MAX) return Math.min(PDF_ZOOM_MAX * 1.25, PDF_ZOOM_MAX + (s - PDF_ZOOM_MAX) * 0.35);
    return s;
  }
  function surveillerPincePdf(pince) {
    var pince0 = null; // { dist, echelle } au début du pincement
    var milieu = null; // dernier point milieu des deux doigts
    var tape = null, dernierTape = null; // détection du double-toucher
    var derniereTouche = 0; // un double-toucher ne doit pas rejouer dblclick
    function distance(a, b) { return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
    function debutPince(e) {
      var a = e.touches[0], b = e.touches[1];
      pince0 = { dist: distance(a, b) || 1, echelle: pdfEchelle };
      milieu = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
    }
    pince.addEventListener("touchstart", function (e) {
      if (!pdfZoomable) return;
      derniereTouche = Date.now();
      arreterAnimZoomPdf();
      annulerRenduPdf(); // le rendu HD attendra la fin du geste
      pdfGeste = true;
      if (e.touches.length >= 2) {
        e.preventDefault(); // pas de défilement natif pendant le pincement
        tape = dernierTape = null;
        debutPince(e);
      } else if (e.touches.length === 1) {
        var t = e.touches[0];
        tape = { x: t.clientX, y: t.clientY, quand: Date.now() };
      }
    }, { passive: false });
    pince.addEventListener("touchmove", function (e) {
      if (!pdfZoomable) return;
      if (tape && e.touches.length === 1) {
        var t = e.touches[0];
        if (Math.hypot(t.clientX - tape.x, t.clientY - tape.y) > 10) tape = dernierTape = null;
      }
      if (!pince0) return; // un seul doigt : défilement natif
      e.preventDefault(); // seul le PDF zoome, jamais le site
      if (e.touches.length < 2) return; // un doigt levé : on attend la fin
      var a = e.touches[0], b = e.touches[1];
      var m = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
      var s = elastiquePdf(pince0.echelle * distance(a, b) / pince0.dist);
      zoomPdfVers(s, milieu.x, milieu.y, m.x - milieu.x, m.y - milieu.y);
      milieu = m;
    }, { passive: false });
    function finToucher(e) {
      if (!pdfZoomable) return;
      if (pince0 && e.touches.length === 2) { debutPince(e); return; } // 3e doigt levé
      if (e.touches.length > 0) return;
      pdfGeste = false;
      if (pince0) {
        pince0 = null;
        // Retour élastique dans les limites, ancré au dernier point milieu.
        var cible = Math.min(PDF_ZOOM_MAX, Math.max(1, pdfEchelle));
        animerZoomPdf(cible, milieu.x, milieu.y);
        return;
      }
      if (!tape || e.type !== "touchend" || Date.now() - tape.quand > 300) {
        tape = dernierTape = null; planifierNettetePdf(); return;
      }
      if (dernierTape && tape.quand - dernierTape.quand < 320 &&
          Math.hypot(tape.x - dernierTape.x, tape.y - dernierTape.y) < 40) {
        // Double-toucher : zoome ×2,5 à cet endroit, ou revient à ×1.
        e.preventDefault();
        animerZoomPdf(pdfEchelle > 1.1 ? 1 : 2.5, tape.x, tape.y);
        dernierTape = null;
      } else {
        dernierTape = tape;
        planifierNettetePdf();
      }
      tape = null;
    }
    pince.addEventListener("touchend", finToucher, { passive: false });
    pince.addEventListener("touchcancel", finToucher);
    pince.addEventListener("wheel", function (e) { // pavés tactiles / souris
      if (!pdfZoomable || !e.ctrlKey) return;
      e.preventDefault();
      arreterAnimZoomPdf();
      var s = Math.min(PDF_ZOOM_MAX, Math.max(1, pdfEchelle * Math.exp(-e.deltaY * 0.01)));
      zoomPdfVers(s, e.clientX, e.clientY);
      planifierNettetePdf();
    }, { passive: false });
    pince.addEventListener("dblclick", function (e) { // souris uniquement
      if (!pdfZoomable || e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
      if (Date.now() - derniereTouche < 1000) return;
      animerZoomPdf(pdfEchelle > 1.1 ? 1 : 2.5, e.clientX, e.clientY);
    });
  }
  window.addEventListener("resize", function () { if (pdfZoomable) planifierNettetePdf(); });

  /* Texte d'attente avec reflet (même effet que pour le PDF). */
  function attente(el, texte) {
    el.hidden = false;
    el.classList.remove("erreur");
    el.style.display = "";
    el.textContent = "";
    var bloc = document.createElement("span");
    bloc.className = "pdf-texte";
    bloc.textContent = texte;
    var reflet = document.createElement("span");
    reflet.className = "pdf-reflet";
    reflet.setAttribute("aria-hidden", "true");
    var copie = document.createElement("span");
    copie.textContent = texte;
    reflet.appendChild(copie);
    bloc.appendChild(reflet);
    el.appendChild(bloc);
  }
  function erreur(el, texte) {
    el.hidden = false;
    el.style.display = "";
    el.classList.add("erreur");
    el.textContent = texte;
  }
  function effacer(el) { el.textContent = ""; el.style.display = "none"; }

  /* Requêtes vers l'API, avec délai maximum et message lisible.
     `corps` (facultatif) = objet envoyé en POST, au format JSON : ce qui
     ne doit pas voyager dans une adresse (journaux de l'hébergeur,
     historique, Referer) passe par là. */
  function fetchDelai(url, ms, corps, cache) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, ms);
    // « no-store » par défaut (réponses fraîches de l'école) ; la config,
    // elle, est servie depuis le cache du navigateur (voir /api/config).
    var options = { cache: cache || "no-store", signal: ctrl.signal };
    if (corps !== undefined) {
      options.method = "POST";
      options.headers = { "Content-Type": "application/json" };
      options.body = JSON.stringify(corps);
    }
    return fetch(url, options)
      .then(function (r) { clearTimeout(timer); return r; }, function (e) {
        clearTimeout(timer);
        throw new Error(e && e.name === "AbortError"
          ? "l'école met trop de temps à répondre."
          : "pas de connexion à internet ?");
      });
  }
  function api(url, ms, corps) {
    return fetchDelai(url, ms, corps).then(function (r) {
      return r.json().catch(function () {
        throw new Error("réponse illisible du serveur (" + r.status + ").");
      });
    }).then(function (rep) {
      if (!rep.ok) throw new Error(rep.erreur || "réponse incomplète.");
      return rep;
    }).catch(function (e) {
      // Friction comptée une fois par visite et par code (voir suivi.js) :
      // distingue l'école trop lente du hors ligne et de la vraie erreur.
      var msg = String((e && e.message) || "");
      if (window.EZH_SUIVI) {
        EZH_SUIVI.friction(/trop de temps/.test(msg) ? "api_lente"
          : /connexion|internet/i.test(msg) ? "api_hors_ligne"
          : "api_erreur");
      }
      throw e;
    });
  }
  /* L'horaire se met à jour à l'ouverture : recharger la page suffit.
     Pas de rafraîchissement forcé (l'API n'en propose pas : elle sert
     un cache partagé de 15 min pour protéger l'école). Un profil « lien
     d'abonnement » (ULB) lit son flux iCal à la place. */
  function chargerHoraire(ecole, formation, ical) {
    var url = ical
      ? "/api/ical?lien=" + encodeURIComponent(ical)
      : "/api/horaires?ecole=" + encodeURIComponent(ecole) +
        "&formation=" + encodeURIComponent(formation);
    return api(url, 95000)
      .then(function (rep) {
        if (!valide(rep.data)) throw new Error("réponse incomplète.");
        var cle = cleHoraire(ecole, formation, ical);
        if (ecrire(cle, rep.data)) delete cacheRate[cle]; else cacheRate[cle] = true;
        return rep.data;
      });
  }
  var cacheRate = {}; // clés d'horaire que le stockage plein n'a pas pu garder
  function memoHoraire(ecole, formation, ical) {
    var m = lire(cleHoraire(ecole, formation, ical));
    return valide(m) ? m : null;
  }
  /* Horaire d'un profil, normal ou sur mesure. memoProfil : tout de suite,
     depuis le cache local (null si rien) ; chargerProfil : depuis l'école. */
  function fusionPerso(p, datas) {
    var d = FUSION.fusionner(p.sources.map(function (s, i) { return { source: s, data: datas[i] }; }));
    d.profilId = p.id;
    return d;
  }
  function memoProfil(p) {
    if (!estPerso(p)) return memoHoraire(p.ecole, p.formation, p.ical);
    var datas = p.sources.map(function (s) { return memoHoraire(s.ecole, s.formation, s.ical); });
    if (!datas.some(Boolean)) return null;
    var d = fusionPerso(p, datas);
    d.infos.cache = true;
    return d;
  }
  /* Sources par lots de 3 : une formation froide coûte ~30 appels à
     l'école et api/horaires est limité à 12 appels / min / IP. Une source
     en échec garde sa dernière version en cache ; sans cache, elle est
     absente et signalée. */
  function chargerPerso(p) {
    var datas = [], echecs = [], erreurs = [], k = 0;
    function suivant() {
      if (k >= p.sources.length) return Promise.resolve();
      var i = k++, s = p.sources[i];
      return chargerHoraire(s.ecole, s.formation, s.ical).then(function (d) { datas[i] = d; }, function (e) {
        echecs.push(i); erreurs.push(e);
        datas[i] = memoHoraire(s.ecole, s.formation, s.ical);
      }).then(suivant);
    }
    return Promise.all([suivant(), suivant(), suivant()]).then(function () {
      if (!datas.some(Boolean)) throw erreurs[0] || new Error("aucune source disponible.");
      var d = fusionPerso(p, datas);
      d.infos.echecs = echecs.sort();
      d.infos.horsLigneKo = p.sources.some(function (s) { return cacheRate[cleHoraire(s.ecole, s.formation, s.ical)]; });
      return d;
    });
  }
  function chargerProfil(p) {
    return estPerso(p) ? chargerPerso(p) : chargerHoraire(p.ecole, p.formation, p.ical);
  }

  /* ---------- Navigation entre les écrans ---------- */
  var VUES = ["compte", "identite", "ecole", "formule", "formation", "groupes", "perso", "cours", "horaire"];
  var vue = null, pile = []; // pile : écrans précédents (bouton Retour)
  function montrer(v) {
    vue = v;
    try { document.documentElement.classList.remove("est-connecte"); } catch (e) {}
    if (window.EZH_SUIVI) EZH_SUIVI.ecran(v);
    VUES.forEach(function (n) { document.getElementById("v-" + n).hidden = n !== v; });
    document.getElementById("btn-retour").hidden = !pile.length;
    var moi = document.getElementById("btn-moi");
    moi.hidden = v !== "horaire" || !profil;
    // Copies du bouton profil sur la page de recherche : même visibilité.
    Array.prototype.forEach.call(document.querySelectorAll(".rc-moi"), function (b) {
      b.hidden = moi.hidden;
    });
    window.scrollTo(0, 0);
    // L'écran affiché fait foi : création en cours = brouillon gardé,
    // retour à l'horaire (ou connexion) = brouillon abandonné.
    if (VUES_BROUILLON.indexOf(v) >= 0) sauverBrouillon(); else effacerBrouillon();
  }
  function aller(v) {
    if (vue && vue !== v) pile.push(vue);
    ouvrir[v]();
  }
  document.getElementById("btn-retour").addEventListener("click", function () {
    if (guideRetour()) return;
    var prec = pile.pop();
    if (prec) ouvrir[prec]();
  });
  var ouvrir = {
    compte: ouvrirCompte,
    identite: ouvrirIdentite,
    ecole: ouvrirEcoles,
    formule: ouvrirFormule,
    formation: ouvrirFormations,
    groupes: function () { ouvrirGroupes(choix.groupes); },
    perso: ouvrirPerso,
    cours: ouvrirCours,
    horaire: afficherHoraire
  };

  /* ---------- Brouillon d'ajout : reprendre où on s'était arrêté ----------
     Quitter l'app en pleine création (vérifier un mail, prendre une capture
     d'écran…) peut recharger la page : sans mémoire, l'école, la formation,
     les cours cochés et les groupes étaient perdus. On garde le parcours en
     cours dans localStorage et on le rouvre au démarrage. Un brouillon ne
     vit pas plus d'un jour et n'est jamais écrit depuis l'horaire. */
  var VUES_BROUILLON = ["ecole", "formule", "formation", "groupes", "perso", "cours"];
  var BROUILLON_MAX_MS = 24 * 3600 * 1000;
  function sauverBrouillon() {
    if (VUES_BROUILLON.indexOf(vue) < 0) return;
    var champRech = document.getElementById("recherche");
    var champLien = document.getElementById("rech-lien-champ");
    var champSurnom = document.getElementById("surnom");
    var champTexte = document.getElementById("rech-import-texte");
    ecrire(CLE_BROUILLON, {
      v: 1,
      ts: Date.now(),
      vue: vue,
      pile: pile.slice(0, 8),
      ecole: choix.ecole,
      formation: choix.formation,
      groupes: choix.groupes.slice(),
      ical: choix.ical,
      editionId: choix.editionId,
      theme: choix.theme,
      // Horaire sur mesure en cours (sans les horaires téléchargés : ils
      // sont déjà dans le cache local).
      perso: choix.perso || null,
      source: sourceSansBrut(choix.source),
      rech: {
        mode: rech.mode,
        cours: rech.cours.slice(),
        q: champRech ? champRech.value : "",
        lien: champLien ? champLien.value : ""
      },
      surnom: champSurnom ? champSurnom.value : "",
      importTexte: champTexte ? champTexte.value : ""
    });
  }
  function effacerBrouillon() {
    try { localStorage.removeItem(CLE_BROUILLON); } catch (e) { /* navigation privée */ }
  }
  function reprendreBrouillon() {
    var d = lire(CLE_BROUILLON);
    if (!d || d.v !== 1 || typeof d.ts !== "number" ||
        Date.now() - d.ts > BROUILLON_MAX_MS ||
        VUES_BROUILLON.indexOf(d.vue) < 0 ||
        !d.ecole || !ecoleDe(d.ecole) || !ecoleActive(d.ecole)) {
      effacerBrouillon();
      return false;
    }
    // Un brouillon d'édition n'a de sens que si l'horaire modifié existe encore.
    var edite = null;
    if (d.editionId) {
      for (var i = 0; i < profils.length; i++) if (profils[i].id === d.editionId) edite = d.editionId;
    }
    var vueVoulue = d.vue;
    if (vueVoulue === "groupes" && !d.formation) vueVoulue = "formation";
    choix = {
      ecole: d.ecole,
      formation: d.formation || null,
      data: null,
      groupes: Array.isArray(d.groupes) ? d.groupes.slice() : [],
      ical: typeof d.ical === "string" && d.ical ? d.ical : null,
      editionId: edite,
      theme: d.theme == null ? null : normaliserTheme(d.theme),
      perso: null,
      source: null
    };
    reprendrePerso(d, edite);
    if (!choix.perso && (vueVoulue === "perso" || vueVoulue === "cours")) vueVoulue = "formation";
    // Guide sur mesure : reprise au récap ou aux options, jamais à mi-parcours.
    if (choix.perso) {
      if (!choix.perso.sources.length) vueVoulue = "formation";
      else if (vueVoulue !== "formation") vueVoulue = "perso";
    }
    if (vueVoulue === "cours" && !(choix.source && choix.source.formation)) vueVoulue = "perso";
    if (vueVoulue === "groupes") {
      // L'horaire déjà téléchargé ressort du cache : l'écran s'ouvre même hors ligne.
      var memo = lire(cleHoraire(choix.ecole, choix.formation, choix.ical));
      if (valide(memo)) {
        choix.data = memo;
        if (choix.source) {
          choix.source.brut = memo;
          if (!FUSION.estParcours(choix.source)) choix.data = FUSION.donneesCochees(memo, choix.source);
        }
      } else if (choix.source && !FUSION.estParcours(choix.source)) vueVoulue = "cours";
    }
    rech.ecole = choix.ecole;
    rech.arme = null;
    rech.resultats = [];
    rech.cours = d.rech && Array.isArray(d.rech.cours) ? d.rech.cours.slice() : [];
    var mode = d.rech && d.rech.mode;
    rech.mode = mode === "niveau" || mode === "lien" ? mode : "cours";
    pile = Array.isArray(d.pile)
      ? d.pile.filter(function (n) { return VUES_BROUILLON.indexOf(n) >= 0 || n === "horaire"; })
      : [];
    // ULB : la formule n'existe plus, un vieux brouillon ne doit ni
    // l'afficher ni y revenir avec Retour.
    if (d.ecole === "ulb") {
      if (vueVoulue === "formule") vueVoulue = "formation";
      pile = pile.filter(function (n) { return n !== "formule"; });
    }
    var champRech = document.getElementById("recherche");
    var champLien = document.getElementById("rech-lien-champ");
    var champSurnom = document.getElementById("surnom");
    var champTexte = document.getElementById("rech-import-texte");
    if (champRech) champRech.value = (d.rech && d.rech.q) || "";
    if (champLien) champLien.value = (d.rech && d.rech.lien) || choix.ical || "";
    if (champSurnom) champSurnom.value = d.surnom || "";
    if (champTexte) champTexte.value = d.importTexte || "";
    if (choix.theme != null) document.body.setAttribute("data-theme", String(choix.theme));
    if (vueVoulue === "ecole") {
      ouvrirEcoles();
    } else if (vueVoulue === "formule") {
      ouvrirFormule();
    } else if (vueVoulue === "formation") {
      ouvrirFormations();
      var ec = ecoleDe(choix.ecole);
      if (ec && ec.recherche && rech.mode !== "lien" &&
          champRech.value.replace(/\s+/g, " ").trim().length >= 2) {
        rechChercher();
      }
    } else if (vueVoulue === "perso") {
      ouvrirPerso();
    } else if (vueVoulue === "cours") {
      ouvrirCours();
    } else {
      ouvrirGroupes(choix.groupes);
    }
    // Le champ de recherche est souvent remis au focus par l'écran :
    // au retour, pas de clavier qui s'ouvre tout seul.
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) { /* jetable */ }
    return true;
  }
  /* Création d'horaire à l'écran, avec son brouillon gardé : supabase-js
     réémet SIGNED_IN à chaque retour sur l'onglet, et ce signal ne doit
     pas rerouter vers l'horaire (voir retourOAuth) — sinon la progression
     est effacée et l'étudiant doit tout recommencer. */
  function creationEnCours() {
    if (VUES_BROUILLON.indexOf(vue) < 0) return false;
    var d = lire(CLE_BROUILLON);
    return !!(d && d.v === 1 && d.vue === vue);
  }

  /* ---------- 0. Connexion + identité (avant tout) ---------- */
  function ouvrirCompte() {
    pile = [];
    oublieMontre = false; // écran frais : le lien reste caché jusqu'au premier échec
    modeAuth = "login";   // et on revient au mode « Se connecter »
    fermerResetMdp();
    majModeAuth();
    document.body.removeAttribute("data-theme");
    montrer("compte");
    preparerApercu();
    // Une inscription attend peut-être encore son activation (l'adresse est
    // gardée pour la session) : on remet le panneau, plutôt que de reproposer
    // le formulaire comme si de rien n'était.
    var attente = "", attenteExiste = false;
    try {
      attente = sessionStorage.getItem(ATTENTE_ACTIVATION) || "";
      attenteExiste = sessionStorage.getItem(ATTENTE_ACTIVATION_EXISTE) === "1";
    } catch (e) { /* jetable */ }
    if (attente) ouvrirActivation(attente, attenteExiste);
    // Pour le développeur seulement (localhost) : l'utilisateur n'a rien
    // à en faire, et prévenir en ligne ferait télécharger le SDK Supabase
    // à chaque visiteur pour un simple message de console.
    if (EN_LOCAL && window.console) {
      pretCloud().then(function () {
        if (!SUPABASE_OK) {
          console.warn("EzHoraire : Supabase non branché (clés absentes de /api/config ou SDK non chargé). " +
            "Connexion factice en local, connexion refusée en ligne.");
        }
      });
    }
  }
  /* Aperçu de l'écran de connexion : dates de la semaine en cours et jour
     actuel en couleur. */
  function preparerApercu() {
    var ap = document.querySelector("#v-compte .apercu");
    if (!ap) return;
    var auj = new Date();
    var lundi = new Date(auj);
    lundi.setDate(auj.getDate() - ((auj.getDay() + 6) % 7));
    var jours = ap.querySelectorAll(".ap-jour"), cols = ap.querySelectorAll(".ap-col");
    Array.prototype.forEach.call(jours, function (j, i) {
      var d = new Date(lundi);
      d.setDate(lundi.getDate() + i);
      var estAuj = d.toDateString() === auj.toDateString();
      j.querySelector("strong").textContent = d.getDate();
      j.classList.toggle("today", estAuj);
      cols[i].classList.toggle("today", estAuj);
    });
    // Les cours se posent en cascade, colonne par colonne.
    Array.prototype.forEach.call(ap.querySelectorAll(".ap-ev"), function (ev, i) {
      ev.style.setProperty("--i", i);
    });
  }
  document.getElementById("voir-mdp").addEventListener("click", function () {
    var champ = document.getElementById("mdp");
    var voir = champ.type === "password";
    champ.type = voir ? "text" : "password";
    this.setAttribute("aria-pressed", voir ? "true" : "false");
    this.setAttribute("aria-label", voir ? "Masquer le mot de passe" : "Afficher le mot de passe");
  });
  function ouvrirIdentite() {
    montrer("identite");
    if (compte) {
      if (!document.getElementById("prenom").value) document.getElementById("prenom").value = compte.prenom || "";
      if (!document.getElementById("nom").value) document.getElementById("nom").value = compte.nom || "";
    }
    themeChoisiIdentite = normaliserTheme(themeChoisiIdentite);
    majThemeSelection("identite-themes", themeChoisiIdentite);
    document.body.setAttribute("data-theme", String(themeChoisiIdentite));
  }
  var elIdThemes = document.getElementById("identite-themes");
  if (elIdThemes) {
    elIdThemes.addEventListener("click", function (e) {
      var b = e.target.closest("[data-theme-opt]");
      if (!b) return;
      var t = +b.getAttribute("data-theme-opt");
      themeChoisiIdentite = t;
      choix.theme = t;
      majThemeSelection("identite-themes", t);
      document.body.setAttribute("data-theme", String(t));
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll("#v-compte [data-auth]"), function (b) {
    b.addEventListener("click", function () {
      if (b.classList.contains("charge")) return;
      b.classList.add("charge"); // le logo laisse place au rond jusqu'à la redirection
      var fin = function (ok) { if (!ok) b.classList.remove("charge"); };
      AUTH.login(b.getAttribute("data-auth")).then(fin, function () { fin(false); });
    });
  });
  // Halo qui suit le pointeur (voir .halo::before/::after), partout dans
  // l'app : un seul écouteur, valable aussi pour les listes rendues après.
  document.addEventListener("pointermove", function (e) {
    if (e.pointerType !== "mouse") return;
    var el = e.target.closest ? e.target.closest(".halo") : null;
    if (!el) return;
    var r = el.getBoundingClientRect();
    el.style.setProperty("--mx", (e.clientX - r.left) + "px");
    el.style.setProperty("--my", (e.clientY - r.top) + "px");
  }, { passive: true });
  // Retour arrière depuis Google / GitHub (page restaurée du cache) : plus de rond.
  window.addEventListener("pageshow", function () {
    Array.prototype.forEach.call(document.querySelectorAll("#v-compte .charge"), function (b) {
      b.classList.remove("charge");
    });
  });
  /* Connexion classique par email (mot de passe). */
  function emailValide(v) { return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/i.test(String(v || "").trim()); }
  function majBoutonEmail() {
    document.getElementById("btn-email").classList.toggle("pret",
      emailValide(document.getElementById("email").value) && document.getElementById("mdp").value.length >= 10);
  }
  document.getElementById("btn-email").addEventListener("click", function () {
    var btn = this;
    if (btn.classList.contains("charge")) return;
    var em = document.getElementById("email").value;
    var mp = document.getElementById("mdp").value;
    var piege = document.getElementById("site-web");
    if (piege && piege.value) { statutAuthErreur("Connexion impossible pour le moment.", "interdit"); return; }
    if (!emailValide(em)) {
      try { document.getElementById("email").focus(); } catch (e) { /* jetable */ }
      statutAuthErreur("Indique une adresse email valide.", "email_invalide");
      marquerChampsErreur();
      return;
    }
    if (String(mp).length < 10) {
      try { document.getElementById("mdp").focus(); } catch (e) { /* jetable */ }
      statutAuthErreur("Mot de passe : 10 caractères minimum.", "mot_de_passe_court");
      marquerChampsErreur();
      return;
    }
    if (window.EZH_SUIVI) {
      EZH_SUIVI.envoyer("clic_connexion", { fournisseur: "email", details: { mode: modeAuth } });
      EZH_SUIVI.marquer("clic");
    }
    btn.classList.add("charge");
    btn.setAttribute("aria-busy", "true");
    var fin = function () { btn.classList.remove("charge"); btn.removeAttribute("aria-busy"); };
    AUTH.loginEmail(em, mp, modeAuth).then(fin, fin);
  });
  Array.prototype.forEach.call(document.querySelectorAll("#seg-auth [data-mode]"), function (b) {
    b.addEventListener("click", function () { definirModeAuth(b.getAttribute("data-mode")); });
  });
  Array.prototype.forEach.call([document.getElementById("email"), document.getElementById("mdp")], function (inp) {
    if (inp) inp.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); document.getElementById("btn-email").click(); }
    });
    if (inp) inp.addEventListener("input", majBoutonEmail);
    if (inp) inp.addEventListener("input", effacerErreurLogin);
  });
  /* Mot de passe oublié (comptes email) : envoie le lien de
     réinitialisation. Il ouvre /mot-de-passe.html, la page dédiée qui
     affiche l'adresse concernée et enregistre le nouveau mot de passe.
     Le bloc ci-dessous reste le filet de secours : si Supabase renvoie
     quand même sur « / » (URL de redirection non autorisée, vieux modèle
     d'email), l'app propose le même choix sur place (PASSWORD_RECOVERY). */
  function ouvrirResetMdp() {
    var f = document.querySelector("#v-compte .fournisseurs");
    var sep = document.querySelector("#v-compte .email-sep");
    if (f) f.hidden = true;
    if (sep) sep.hidden = true;
    var cl = document.getElementById("champs-login");
    var be = document.getElementById("btn-email");
    var o = document.getElementById("mdp-oublie");
    var sg = document.getElementById("seg-auth");
    if (cl) cl.hidden = true;
    if (be) be.hidden = true;
    if (o) o.hidden = true;
    if (sg) sg.hidden = true;
    var br = document.getElementById("bloc-reset");
    if (br) br.hidden = false;
    statutAuthEffacer();
    pile = [];
    montrer("compte");
    preparerApercu();
    try { document.getElementById("mdp-nouveau").focus(); } catch (e) { /* jetable */ }
  }
  function fermerResetMdp() {
    var f = document.querySelector("#v-compte .fournisseurs");
    var sep = document.querySelector("#v-compte .email-sep");
    if (f) f.hidden = false;
    if (sep) sep.hidden = false;
    var cl = document.getElementById("champs-login");
    var be = document.getElementById("btn-email");
    var sg = document.getElementById("seg-auth");
    if (cl) cl.hidden = false;
    if (be) be.hidden = false;
    if (sg) sg.hidden = false;
    var br = document.getElementById("bloc-reset");
    if (br) br.hidden = true;
    majOublie();
  }
  /* Attente d'activation (inscription par email) : le compte est créé mais
     il faut ouvrir le lien reçu avant de pouvoir se connecter. Le panneau
     remplace le formulaire ; l'adresse est gardée pour la session, donc il
     survit à un rechargement au lieu de disparaître. */
  var ATTENTE_ACTIVATION = "ezh_attente_activation";
  var ATTENTE_ACTIVATION_EXISTE = "ezh_attente_activation_existe";
  function ouvrirActivation(email, dejaCompte) {
    email = String(email || "").trim();
    if (email) {
      try {
        sessionStorage.setItem(ATTENTE_ACTIVATION, email);
        sessionStorage.setItem(ATTENTE_ACTIVATION_EXISTE, dejaCompte ? "1" : "0");
      } catch (e) { /* jetable */ }
    }
    var f = document.querySelector("#v-compte .fournisseurs");
    var sep = document.querySelector("#v-compte .email-sep");
    var cl = document.getElementById("champs-login");
    var be = document.getElementById("btn-email");
    var o = document.getElementById("mdp-oublie");
    var sg = document.getElementById("seg-auth");
    var cgu = document.getElementById("mention-cgu");
    var br = document.getElementById("bloc-reset");
    var ba = document.getElementById("bloc-activation");
    [f, sep, cl, be, o, sg, cgu, br].forEach(function (el) { if (el) el.hidden = true; });
    if (ba) ba.hidden = false;
    var adN = document.getElementById("act-adresse-neuf");
    var adE = document.getElementById("act-adresse-existe");
    var neuf = document.getElementById("act-texte-neuf");
    var exist = document.getElementById("act-texte-existe");
    var connecter = document.getElementById("btn-act-connecter");
    if (adN) adN.textContent = email;
    if (adE) adE.textContent = email;
    if (neuf) neuf.hidden = !!dejaCompte;
    if (exist) exist.hidden = !dejaCompte;
    if (connecter) connecter.hidden = !dejaCompte;
    statutActivation("");
    statutAuthEffacer();
    pile = [];
    montrer("compte");
    preparerApercu();
    try { document.getElementById("btn-act-renvoyer").focus(); } catch (e) { /* jetable */ }
  }
  function fermerActivation() {
    try {
      sessionStorage.removeItem(ATTENTE_ACTIVATION);
      sessionStorage.removeItem(ATTENTE_ACTIVATION_EXISTE);
    } catch (e) { /* jetable */ }
    var ba = document.getElementById("bloc-activation");
    if (ba) ba.hidden = true;
    var f = document.querySelector("#v-compte .fournisseurs");
    var sep = document.querySelector("#v-compte .email-sep");
    var cl = document.getElementById("champs-login");
    var be = document.getElementById("btn-email");
    var sg = document.getElementById("seg-auth");
    var cgu = document.getElementById("mention-cgu");
    [f, sep, cl, be, sg, cgu].forEach(function (el) { if (el) el.hidden = false; });
    majOublie();
  }
  function statutActivation(texte, erreur) {
    var el = document.getElementById("act-status");
    if (!el) return;
    if (!texte) { el.hidden = true; el.textContent = ""; el.classList.remove("erreur"); return; }
    el.hidden = false;
    el.classList.toggle("erreur", !!erreur);
    el.textContent = texte;
  }
  function adresseEnAttente() {
    var email = "";
    try { email = sessionStorage.getItem(ATTENTE_ACTIVATION) || ""; } catch (e) { /* jetable */ }
    if (!email) {
      var champ = document.getElementById("email");
      email = String((champ && champ.value) || "").trim();
    }
    return email;
  }
  document.getElementById("btn-act-renvoyer").addEventListener("click", function () {
    var btn = this;
    if (btn.classList.contains("charge")) return;
    var email = adresseEnAttente();
    if (!emailValide(email)) {
      statutActivation("Adresse introuvable : reviens au formulaire pour la corriger.", true);
      return;
    }
    pretCloud().then(function () {
      if (!SUPABASE_OK || !sb) {
        statutActivation("Service de connexion injoignable : réessaie dans quelques minutes.", true);
        return;
      }
      btn.classList.add("charge");
      btn.setAttribute("aria-busy", "true");
      var fin = function () { btn.classList.remove("charge"); btn.removeAttribute("aria-busy"); };
      sb.auth.resend({ type: "signup", email: email, options: { emailRedirectTo: location.origin + location.pathname } })
        .then(function (res) {
          fin();
          if (res.error) { statutActivation(messageAuth(res.error), true); return; }
          statutActivation("Email renvoyé à " + email + ". Regarde aussi dans les spams.");
        }, function (err) {
          fin();
          statutActivation(messageAuth(err), true);
        });
    });
  });
  document.getElementById("btn-act-autre").addEventListener("click", function () {
    var mail = adresseEnAttente();
    fermerActivation();
    var champ = document.getElementById("email");
    if (champ) { champ.value = mail; try { champ.focus(); } catch (e) { /* jetable */ } }
  });
  document.getElementById("btn-act-connecter").addEventListener("click", function () {
    var mail = adresseEnAttente();
    fermerActivation();
    definirModeAuth("login");
    var champ = document.getElementById("email");
    if (champ && mail) champ.value = mail;
    var mdp = document.getElementById("mdp");
    try { (mdp || champ).focus(); } catch (e) { /* jetable */ }
  });
  document.getElementById("mdp-oublie").addEventListener("click", function () {
    pretCloud().then(function () {
      if (!SUPABASE_OK || !sb) {
        statutAuthErreur("Service de connexion injoignable : réessaie dans quelques minutes.");
        return;
      }
      var em = String(document.getElementById("email").value || "").trim();
      if (!emailValide(em)) {
        try { document.getElementById("email").focus(); } catch (e) { /* jetable */ }
        statutAuthErreur("Indique ton adresse email ci-dessus, puis retouche « Mot de passe oublié ? ».");
        return;
      }
      statutAuthChargement("Envoi de l'email…");
      sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + "/mot-de-passe.html" }).then(function (res) {
        if (res.error) { statutAuthErreur(messageAuth(res.error)); return; }
        statutAuthInfo("Email envoyé : clique sur le lien pour choisir un nouveau mot de passe.");
      }, function (err) { statutAuthErreur(messageAuth(err)); });
    });
  });
  document.getElementById("btn-mdp-nouveau").addEventListener("click", function () {
    var btn = this;
    if (btn.classList.contains("charge")) return;
    if (!SUPABASE_OK || !sb || !sessionSupabase || !sessionSupabase.user) {
      statutAuthErreur("Lien expiré ou déjà utilisé : redemande un email via « Mot de passe oublié ? ».", "lien_expire");
      fermerResetMdp();
      return;
    }
    var mp = document.getElementById("mdp-nouveau").value;
    if (String(mp).length < 10) {
      try { document.getElementById("mdp-nouveau").focus(); } catch (e) { /* jetable */ }
      statutAuthErreur("Mot de passe : 10 caractères minimum.");
      return;
    }
    btn.classList.add("charge");
    btn.setAttribute("aria-busy", "true");
    var fin = function () { btn.classList.remove("charge"); btn.removeAttribute("aria-busy"); };
    sb.auth.updateUser({ password: mp }).then(function (res) {
      fin();
      if (res.error) { statutAuthErreur(messageAuth(res.error)); return; }
      document.getElementById("mdp-nouveau").value = "";
      recuperationEnCours = false;
      fermerResetMdp();
      statutAuthEffacer();
      var u = (res.data && res.data.user) || sessionSupabase.user;
      retourOAuth(u);
    }, function (err) {
      fin();
      statutAuthErreur(messageAuth(err));
    });
  });
  document.getElementById("mdp-nouveau").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); document.getElementById("btn-mdp-nouveau").click(); }
  });
  document.getElementById("btn-identite").addEventListener("click", function () {
    var p = document.getElementById("prenom").value.replace(/\s+/g, " ").trim().slice(0, 30);
    var n = document.getElementById("nom").value.replace(/\s+/g, " ").trim().slice(0, 30);
    var st = document.getElementById("identite-status");
    var lettre = /\p{L}/u;
    var fautif = !lettre.test(p) ? "prenom" : (!lettre.test(n) ? "nom" : null);
    ["prenom", "nom"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) { if (id === fautif) el.setAttribute("aria-invalid", "true"); else el.removeAttribute("aria-invalid"); }
    });
    if (fautif) {
      if (st) { st.textContent = fautif === "prenom" ? "Indique ton prénom." : "Indique ton nom."; st.hidden = false; }
      try { document.getElementById(fautif).focus(); } catch (e) { /* jetable */ }
      return;
    }
    if (st) { st.hidden = true; st.textContent = ""; }
    if (!compte) compte = { fournisseur: fournisseurChoisi || "local", nom: "", prenom: "" };
    compte.prenom = p; compte.nom = n;
    sauverCompte();
    pousserIdentite();
    rendreAvatar();
    if (window.EZH_SUIVI && !EZH_SUIVI.deja("identite")) {
      EZH_SUIVI.marquer("identite");
      EZH_SUIVI.envoyer("identite_ok");
    }
    choix.theme = themeChoisiIdentite;
    document.body.setAttribute("data-theme", String(themeChoisiIdentite));
    pile = [];
    if (profil) {
      afficherHoraire();
      actualiser().catch(function () { /* hors ligne */ });
    } else {
      ouvrirEcoles();
    }
    planifierPropositionPwa(); // identité complétée = connexion terminée sur ce mobile
  });

  /* ---------- 1. École ---------- */
  // choix.editionId : null = nouvel horaire ; sinon id du profil modifié.
  var choix = { ecole: null, formation: null, data: null, groupes: [], ical: null, editionId: null, theme: null };
  function demarrerAjout() {
    choix = { ecole: profil ? profil.ecole : "heh", formation: null, data: null, groupes: [], ical: null, editionId: null, theme: suggereThemeSuivant() };
    // Un nouvel horaire repart d'un formulaire vierge : rien ne doit rester
    // d'un ajout précédent (recherche, cours cochés, liste collée).
    document.getElementById("surnom").value = "";
    document.getElementById("recherche").value = "";
    document.getElementById("rech-lien-champ").value = "";
    document.getElementById("rech-import-texte").value = "";
    document.getElementById("rech-import-doutes").innerHTML = "";
    document.getElementById("rech-import-doutes").hidden = true;
    document.getElementById("rech-import-status").hidden = true;
    rech.ecole = null;
    rech.mode = "cours";
    rech.cours = [];
    rech.resultats = [];
    pile = ["horaire"];
    ouvrirEcoles();
  }
  /* Compose un nouvel horaire sur mesure depuis l'horaire affiché (bandeau
     « nouvelles semaines ») : l'intention est explicite, le guide démarre
     directement, sans passer par l'écran des formules. */
  function demarrerPerso() {
    fermerFeuille();
    choix = {
      ecole: (profil && profil.ecole) || "heh", formation: null, data: null,
      groupes: [], ical: null, editionId: null, theme: suggereThemeSuivant()
    };
    pile = ["horaire"];
    demarrerGuidePerso();
  }
  function ouvrirEcoles() {
    montrer("ecole");
    document.getElementById("liste-ecoles").innerHTML = ECOLES.filter(function (e) {
      return ecoleActive(e.id);
    }).map(function (e) {
      // Le sigle/logo est dans le carré : le titre donne le nom complet.
      var parts = String(e.detail).split(" · ");
      var badge = e.logo
        ? '<span class="sigle sigle-logo" aria-hidden="true"><img src="' + txt(e.logo) + '" alt="" width="' + (e.lw || 100) +
          '" height="' + (e.lh || 100) + '" loading="lazy" onerror="this.parentElement.classList.remove(\'sigle-logo\'); this.remove();"><span class="sigle-txt">' + txt(e.nom) + '</span></span>'
        : '<span class="sigle" aria-hidden="true">' + txt(e.nom) + '</span>';
      // « Bêta » : école branchée récemment, pas encore éprouvée par une
      // année entière. Dit à l'étudiant, pas caché dans le code.
      var tag = e.beta ? '<span class="ecole-tag">Bêta</span>' : "";
      return '<li><button type="button" class="halo" data-ecole="' + txt(e.id) + '">' + tag +
             badge + '<span class="nom">' + txt(parts[0]) +
             "<small>" + txt(parts.slice(1).join(" · ")) + '</small></span><span class="chev" aria-hidden="true"></span></button></li>';
    }).join("");
  }
  document.getElementById("liste-ecoles").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-ecole]");
    if (!b) return;
    var keepEdition = choix.editionId;
    var keepTheme = choix.theme;
    choix = { ecole: b.getAttribute("data-ecole"), formation: null, data: null, groupes: [], ical: null, editionId: keepEdition, theme: keepTheme };
    // Nouvel horaire : on choisit d'abord la formule (année complète ou
    // sur mesure). Rechoix d'école en pleine modification : on garde
    // l'ancien parcours direct, sans détour.
    // ULB : pas de choix de formule, les horaires se composent via des
    // codes de cours et sont donc forcément sur mesure.
    aller(keepEdition || choix.ecole === "ulb" ? "formation" : "formule");
  });
  /* ---------- 1c. Formule : année complète ou horaire sur mesure ----------
     Deux vrais choix, avec leur explication lisible sous le titre : c'est
     ici — et plus sur une carte perdue dans les formations — que
     l'étudiant entre deux années trouve le sur mesure. */
  function ouvrirFormule() {
    if (!choix.ecole) { ouvrirEcoles(); return; }
    // ULB : pas de choix de formule, on va direct aux cours (via codes).
    if (choix.ecole === "ulb") { ouvrirFormations(); return; }
    montrer("formule");
    var ec = ecoleDe(choix.ecole);
    document.getElementById("formule-aide").textContent =
      ec ? ec.nom + " · " + String(ec.detail).split(" · ").slice(1).join(" · ") : "";
  }
  document.getElementById("btn-formule-classique").addEventListener("click", function () {
    if (!choix.ecole) { ouvrirEcoles(); return; }
    aller("formation");
  });
  document.getElementById("btn-formule-perso").addEventListener("click", function () {
    if (!choix.ecole) { ouvrirEcoles(); return; }
    demarrerGuidePerso();
  });
  function demarrerGuidePerso() {
    choix.perso = {
      editionId: null, ecole: choix.ecole, sources: [], surnom: "",
      theme: choix.theme != null ? normaliserTheme(choix.theme)
        : (profils.length ? suggereThemeSuivant() : themeChoisiIdentite),
      pile: null, etape: "options"
    };
    choix.source = null; choix.formation = null; choix.data = null; choix.groupes = []; choix.ical = null;
    var champ = document.getElementById("recherche");
    if (champ && champ.blur) champ.blur();
    // Direct, sans empiler : on est déjà sur l'écran des formules, et
    // Retour doit revenir au choix de l'école, pas à cette page.
    ouvrirOptions();
  }

  /* ---------- 1b. École manquante : « Mon école n'est pas là » ----------
     Nom de l'école, lien du site avec les horaires, case « je n'ai pas
     le lien ». Part en type "demande" vers /api/bugs (même tuyau que
     Signaler, visible dans le dashboard) : pas de table ni de migration
     en plus. Le lien est normalisé (https:// ajouté si absent) et
     vérifié côté app ; le serveur revérifie la taille et le type. */
  (function () {
    var btn = document.getElementById("btn-ecole-manquante");
    var form = document.getElementById("form-ecole-manquante");
    if (!btn || !form) return;
    var nom = document.getElementById("ecole-manquante-nom");
    var lien = document.getElementById("ecole-manquante-lien");
    var sansLien = document.getElementById("ecole-manquante-sans-lien");
    var status = document.getElementById("ecole-manquante-status");
    var envoyerBtn = document.getElementById("ecole-manquante-envoyer");
    function majLien() {
      var off = sansLien.checked;
      lien.disabled = off;
      lien.closest(".champs").classList.toggle("off", off);
      if (off) effacer(status);
    }
    btn.addEventListener("click", function () {
      var ouvrir = form.hidden;
      form.hidden = !ouvrir;
      btn.setAttribute("aria-expanded", String(ouvrir));
      if (ouvrir) {
        if (window.EZH_SUIVI) EZH_SUIVI.friction("ecole_manquante");
        setTimeout(function () { try { nom.focus({ preventScroll: true }); } catch (e) { nom.focus(); } }, 60);
      }
    });
    sansLien.addEventListener("change", majLien);
    function normaliserLien(v) {
      v = String(v || "").trim();
      if (!v) return "";
      if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = "https://" + v;
      return v;
    }
    function lienValide(v) {
      return /^(https?:\/\/)[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/\S*)?$/i.test(v);
    }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var nomEcole = nom.value.replace(/\s+/g, " ").trim();
      if (nomEcole.length < 2) {
        erreur(status, "Donne le nom de ton école en quelques mots.");
        nom.focus();
        return;
      }
      var url = "";
      if (!sansLien.checked) {
        url = normaliserLien(lien.value);
        if (!lienValide(url)) {
          erreur(status, "Ce lien ne ressemble pas à une adresse web, vérifie-le — ou coche la case si tu ne l'as pas.");
          lien.focus();
          return;
        }
      }
      envoyerBtn.disabled = true;
      status.classList.remove("ok");
      attente(status, "Envoi en cours…");
      var corps = {
        titre: "Nouvelle école : " + nomEcole.slice(0, 60),
        message: "École demandée : " + nomEcole +
          (url ? "\nSite des horaires : " + url
               : "\nSite des horaires : non renseigné (l'étudiant ne l'a pas)."),
        etape: "v-ecole", email: bugEmail(), type: "demande",
        contexte: bugContexte(""), image_urls: [], site_web: ""
      };
      corps.contexte.ecole_nom = nomEcole.slice(0, 120);
      corps.contexte.ecole_lien = url;
      corps.contexte.lien_inconnu = sansLien.checked;
      var entetes = { "Content-Type": "application/json" };
      if (sessionSupabase && sessionSupabase.access_token) {
        entetes.Authorization = "Bearer " + sessionSupabase.access_token;
      }
      fetch("/api/bugs", { method: "POST", cache: "no-store", headers: entetes, body: JSON.stringify(corps) })
        .then(function (r) {
          return r.json().catch(function () { throw new Error("réponse illisible (" + r.status + ")."); });
        })
        .then(function (rep) {
          if (!rep.ok) throw new Error(rep.erreur || "réponse incomplète.");
          effacer(status);
          status.hidden = false;
          status.style.display = "";
          status.classList.remove("erreur");
          status.classList.add("ok");
          status.textContent = "Merci, c'est noté. On y jettera un œil.";
          if (window.EZH_SUIVI) EZH_SUIVI.friction("ecole_demandee");
          nom.value = "";
          lien.value = "";
          sansLien.checked = false;
          majLien();
        }, function (err) {
          erreur(status, "Échec de l'envoi : " + (err && err.message ? err.message : "réessaie."));
        })
        .then(function () { envoyerBtn.disabled = false; });
    });
    majLien();
  })();

  /* ---------- 2. Formation ---------- */
  var formations = { ecole: null, liste: null };
  function sansAccents(s) {
    return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  function ouvrirFormations() {
    montrer("formation");
    if (guidePerso()) { ouvrirOptions(); return; }
    // Retour depuis le composeur sans source en cours : on quitte le sur mesure.
    if (choix.perso && !choix.source) choix.perso = null;
    majEnteteSource();
    var ec = ecoleDe(choix.ecole);
    document.getElementById("formation-aide").textContent = ec.nom + " · " + ec.detail;
    var status = document.getElementById("formations-status");
    var champ = document.getElementById("recherche");
    var estUlb = !!(ec && ec.recherche);
    document.getElementById("rech-modes").hidden = !estUlb;
    if (estUlb) { rechOuvrir(); return; }
    document.getElementById("rech-cours").hidden = true;
    document.getElementById("rech-lien").hidden = true;
    document.getElementById("formation-recherche").hidden = false;
    document.getElementById("liste-formations").hidden = false;
    document.getElementById("formation-titre").textContent = "Ta formation";
    document.getElementById("btn-options-suivant").hidden = true;
    if (formations.ecole === choix.ecole && formations.liste) {
      effacer(status); listerFormations(); return;
    }
    document.getElementById("liste-formations").innerHTML = "";
    attente(status, "Chargement des formations…");
    var demande = choix.ecole;
    api("/api/formations?ecole=" + encodeURIComponent(demande), 30000).then(function (rep) {
      formations = { ecole: demande, liste: rep.formations };
      if (vue !== "formation" || choix.ecole !== demande) return;
      effacer(status); listerFormations();
      if (window.matchMedia("(hover: hover)").matches) champ.focus();
    }, function (e) {
      if (vue === "formation") erreur(status, "Échec : " + e.message + " Reviens en arrière pour réessayer.");
    });
  }

  /* ---------- 2-gu. Sur mesure, étape 1 : « Choisis tes options » ----------
     Une page, une action : on coche tout ce qu'on suit (années, options),
     puis « Suivant ». La 1re option garde tous ses cours sans le dire,
     les suivantes partent tout décochées. */
  function optionChoisie(formation, ical) {
    var perso = choix.perso;
    if (!perso) return false;
    return perso.sources.some(function (s) {
      return s.formation === formation && (s.ical || "") === (ical || "");
    });
  }
  function ouvrirOptions() {
    montrer("formation");
    var perso = choix.perso;
    if (!perso) { ouvrirEcoles(); return; }
    perso.etape = "options";
    majEnteteSource();
    var ec = ecoleDe(choix.ecole);
    document.getElementById("formation-titre").textContent = "Choisis tes options";
    document.getElementById("formation-aide").textContent = "Coche tout ce que tu suis.";
    var status = document.getElementById("formations-status");
    var champ = document.getElementById("recherche");
    var estUlb = !!(ec && ec.recherche);
    // Écoles à recherche : le guide ne propose que les niveaux /
    // programmes (une page par action, pas de codes ni de lien ici).
    document.getElementById("rech-modes").hidden = true;
    if (estUlb) {
      if (rech.ecole !== choix.ecole) {
        rech.ecole = choix.ecole; rech.cours = []; rech.resultats = [];
        champ.value = "";
        document.getElementById("rech-lien-champ").value = "";
      }
      rech.mode = "niveau";
      rechAppliquerModeGuide();
      majSuivantOptions();
      return;
    }
    document.getElementById("rech-cours").hidden = true;
    document.getElementById("rech-lien").hidden = true;
    document.getElementById("formation-recherche").hidden = false;
    document.getElementById("liste-formations").hidden = false;
    majSuivantOptions();
    if (formations.ecole === choix.ecole && formations.liste) {
      effacer(status); listerFormations(); return;
    }
    document.getElementById("liste-formations").innerHTML = "";
    attente(status, "Chargement des formations…");
    var demande = choix.ecole;
    api("/api/formations?ecole=" + encodeURIComponent(demande), 30000).then(function (rep) {
      formations = { ecole: demande, liste: rep.formations };
      if (vue !== "formation" || choix.ecole !== demande || !guidePerso()) return;
      effacer(status); listerFormations();
      if (window.matchMedia("(hover: hover)").matches) champ.focus();
    }, function (e) {
      if (vue === "formation") erreur(status, "Échec : " + e.message + " Reviens en arrière pour réessayer.");
    });
  }
  /* Une option à cocher du guide : même bouton aux 3 endroits
     (sélection épinglée, résultats de recherche, liste des formations). */
  function htmlOption(f, pris) {
    return '<li><button type="button" class="halo opt" data-formation="' + txt(f) +
      '" aria-pressed="' + pris + '"><span class="coche" aria-hidden="true"></span><span class="nom">' +
      txt(joliFormation(f)) + "</span></button></li>";
  }
  /* Sélection épinglée en tête de liste : ce qu'on a coché reste
     visible même quand la recherche change (pour trouver la 2e option). */
  function htmlSelectionEpinglee() {
    var perso = choix.perso;
    if (!perso || !perso.sources.length) return "";
    return '<li class="liste-titre">Ta sélection · ' + perso.sources.length + "</li>" +
      perso.sources.map(function (s) {
        return htmlOption(s.formation, true);
      }).join("");
  }
  function majSuivantOptions() {
    var btn = document.getElementById("btn-options-suivant");
    if (!guidePerso()) { btn.hidden = true; return; }
    var n = choix.perso.sources.length;
    btn.hidden = false;
    btn.disabled = !n;
    btn.textContent = !n ? "Coche au moins une option" : n === 1 ? "Suivant" : "Suivant · " + n + " options";
    sauverBrouillon();
  }
  document.getElementById("btn-options-suivant").addEventListener("click", function () {
    var perso = choix.perso;
    if (!perso || !perso.sources.length) return;
    if (perso.sources.length > FUSION.MAX_SOURCES) {
      perso.sources = perso.sources.slice(0, FUSION.MAX_SOURCES);
    }
    // La 1re garde tout (sans = []), les autres partent vides (avec = []).
    // On ne le dit plus : fini le mot « principal ».
    perso.sources.forEach(function (s, i) {
      if (i === 0) { s.role = "principale"; s.sans = []; delete s.avec; }
      else if (!FUSION.estParcours(s)) { s.role = "ajout"; s.avec = s.avec || []; delete s.sans; }
      if (!Array.isArray(s.groupes)) s.groupes = [];
    });
    perso.retour = null;
    demarrerCoursGuide();
  });
  /* ---------- 2b. Écoles « recherche » : par niveau/programme, par codes
     de cours, ou lien perso ----------
     L'ULB publie plus de 2 000 niveaux d'études, l'UCLouvain des milliers
     de codes : pas de liste complète à télécharger, une recherche serveur
     (api/recherche). Trois entrées :
     - « Par niveau d'études » (ULB) / « Par programme » (UCLouvain) : les
       blocs d'année (« B-DROIB:2 · Bachelier en droit… »), puis l'écran
       des groupes habituel (groupe 01, PAD6, options…) ;
     - « Par codes de cours » : on coche des unités d'enseignement (code ou
       intitulé), la clé de formation devient « PAR:CODE1,CODE2 » ;
     - « Mon horaire … » : l'horaire personnel via le lien d'abonnement
       iCal de l'école (api/ical) — aucun identifiant ne passe par nous.
     Les libellés viennent de RECHERCHE[école] : le reste de l'écran est
     commun. */
  var LIEN_FORMATION = "Mon horaire (lien d'abonnement)";
  var rech = { ecole: null, mode: "cours", cours: [], resultats: [], arme: null, requete: 0, minuteur: 0, ocr: null };
  function rechConfig() { return RECHERCHE[choix.ecole] || RECHERCHE.ulb; }
  function rechOuvrir() {
    // Changer d'école repart de zéro : les cours cochés pour l'ULB n'ont
    // pas de sens pour l'UCLouvain. On ouvre sur le mode conseillé par
    // l'école (ULB : codes de cours ; UCLouvain : le programme, un code).
    if (rech.ecole !== choix.ecole) {
      rech.ecole = choix.ecole;
      rech.mode = rechConfig().recommande || "cours";
      rech.cours = [];
      rech.resultats = [];
      document.getElementById("recherche").value = "";
      document.getElementById("rech-lien-champ").value = "";
      sauverBrouillon();
    }
    rechAppliquerMode(false);
    if (window.matchMedia("(hover: hover)").matches && rech.mode !== "lien") {
      document.getElementById("recherche").focus();
    }
  }
  function rechAppliquerMode(relancer) {
    var cfg = rechConfig();
    var champ = document.getElementById("recherche");
    var liste = document.getElementById("liste-formations");
    var titre = document.getElementById("formation-titre");
    var aide = document.getElementById("formation-aide");
    // Les onglets suivent l'ordre de l'école et « Recommandé » va sur son
    // mode conseillé (ULB : codes de cours ; UCLouvain : le programme).
    var modesEl = document.getElementById("rech-modes");
    (cfg.ordre || ["cours", "niveau", "lien"]).forEach(function (id) {
      var b = modesEl.querySelector('button[data-mode="' + id + '"]');
      if (b) modesEl.appendChild(b); // déplace le bouton existant
    });
    Array.prototype.forEach.call(modesEl.querySelectorAll("button"), function (b) {
      var mode = b.getAttribute("data-mode");
      var etiquette = b.querySelector(".mode-nom");
      if (etiquette && cfg.modes[mode]) etiquette.textContent = cfg.modes[mode];
      b.setAttribute("aria-pressed", String(mode === rech.mode));
      var doit = mode === (cfg.recommande || "cours");
      var tag = b.querySelector(".mode-tag");
      if (doit && !tag) {
        tag = document.createElement("span");
        tag.className = "mode-tag";
        b.appendChild(tag);
      }
      if (tag) { tag.textContent = "Recommandé"; tag.hidden = !doit; }
    });
    document.getElementById("rech-import-texte").placeholder = cfg.import_texte || "";
    if (!guidePerso()) document.getElementById("btn-options-suivant").hidden = true;
    effacer(document.getElementById("formations-status"));
    rech.arme = null;
    rech.requete++; // invalide une recherche en vol
    liste.innerHTML = "";
    document.getElementById("formation-recherche").hidden = rech.mode === "lien";
    document.getElementById("rech-cours").hidden = rech.mode !== "cours";
    document.getElementById("rech-lien").hidden = rech.mode !== "lien";
    var mode = cfg[rech.mode] || cfg.cours;
    titre.textContent = mode.titre;
    aide.textContent = mode.aide;
    if (rech.mode === "niveau") {
      champ.placeholder = mode.placeholder;
      champ.setAttribute("aria-label", "Rechercher un " + (choix.ecole === "ucl" ? "programme" : "niveau d'études"));
    } else if (rech.mode === "cours") {
      champ.placeholder = mode.placeholder;
      champ.setAttribute("aria-label", "Rechercher un cours");
      rechRendreCours();
      setTimeout(rechAjusterChamp, 0);
    } else {
      // Le mode d'emploi du lien porte un lien cliquable : innerHTML sur
      // une chaîne écrite ici, jamais sur une donnée reçue.
      document.getElementById("rech-lien-aide").innerHTML = mode.mode;
      var champLien = document.getElementById("rech-lien-champ");
      champLien.placeholder = mode.placeholder;
      if (choix.ical) champLien.value = choix.ical;
      champLien.focus();
    }
    if (relancer && rech.mode !== "lien") rechChercher();
  }
  /* Guide sur mesure (écoles à recherche) : que des niveaux à cocher. */
  function rechAppliquerModeGuide() {
    var cfg = rechConfig();
    var champ = document.getElementById("recherche");
    var mode = cfg.niveau || cfg.cours;
    effacer(document.getElementById("formations-status"));
    rech.arme = null;
    rech.requete++;
    document.getElementById("liste-formations").innerHTML = "";
    document.getElementById("formation-recherche").hidden = false;
    document.getElementById("rech-cours").hidden = true;
    document.getElementById("rech-lien").hidden = true;
    document.getElementById("liste-formations").hidden = false;
    document.getElementById("formation-titre").textContent = "Choisis tes options";
    document.getElementById("formation-aide").textContent = "Coche tout ce que tu suis.";
    if (mode && mode.placeholder) {
      champ.placeholder = mode.placeholder;
      champ.setAttribute("aria-label", "Rechercher une option");
    }
    if (window.matchMedia("(hover: hover)").matches) champ.focus();
  }
  function rechChercher() {
    var champ = document.getElementById("recherche");
    var status = document.getElementById("formations-status");
    var texte = champ.value.replace(/\s+/g, " ").trim();
    var genre = rech.mode === "cours" ? "ue" : "niveau";
    var seq = ++rech.requete;
    if (texte.length < 2) { effacer(status); return; }
    attente(status, "Recherche…");
    api("/api/recherche?ecole=" + encodeURIComponent(choix.ecole) +
         "&genre=" + genre + "&q=" + encodeURIComponent(texte), 20000)
      .then(function (rep) {
        if (seq !== rech.requete || vue !== "formation") return;
        effacer(status);
        var resultats = rep.resultats || [];
        if (!resultats.length && window.EZH_SUIVI) {
          EZH_SUIVI.friction("recherche_0", { genre: genre, taille: texte.length });
        }
        rechRendreResultats(resultats);
      }, function (e) {
        if (seq !== rech.requete || vue !== "formation") return;
        erreur(status, "Échec : " + e.message + " Vérifie ta connexion et réessaie.");
      });
  }
  function rechRendreResultats(resultats) {
    var liste = document.getElementById("liste-formations");
    if (resultats) rech.resultats = resultats;
    // Un cours déjà choisi quitte la liste : pas de second clic ambigu.
    // `rech.resultats` garde la liste brute, pour qu'il revienne quand on
    // retire le cours de la sélection.
    var visibles = rech.mode === "cours"
      ? rech.resultats.filter(function (r) { return rech.cours.indexOf(r.cle) < 0; })
      : rech.resultats;
    if (rech.mode === "cours" && rech.resultats.length && !visibles.length) {
      liste.innerHTML = '<li class="empty">Tous ces résultats sont déjà dans ta sélection.</li>';
      return;
    }
    if (!visibles.length) {
      liste.innerHTML = '<li class="empty">Aucun résultat. Essaie un autre mot ou le code exact.</li>';
      return;
    }
    var parCours = rech.mode === "cours";
    if (guidePerso() && !parCours) {
      liste.innerHTML = visibles.map(function (r) {
        return htmlOption(r.cle, optionChoisie(r.cle, null));
      }).join("") || '<li class="empty">Aucun résultat. Essaie un autre mot.</li>';
      return;
    }
    liste.innerHTML = visibles.map(function (r) {
      if (!parCours && dejaAjoutee(r.cle, null)) {
        return '<li><button type="button" class="halo deja" data-formation="' + txt(r.cle) + '" data-deja aria-disabled="true">' +
          '<span class="nom">' + txt(joliFormation(r.cle)) + "<small>Déjà dans ton horaire</small></span></button></li>";
      }
      return '<li><button type="button" class="halo" data-formation="' + txt(r.cle) + '"' +
        (parCours ? ' aria-pressed="false"' : "") + '><span class="nom">' +
        txt(joliFormation(r.cle)) + '</span><span class="chev" aria-hidden="true"></span></button></li>';
    }).join("");
  }
  function rechAjouterCours(cle) {
    if (rech.cours.indexOf(cle) >= 0) return;
    rech.cours.push(cle);
    rech.arme = null;
    rechRendreCours();
    rechRendreResultats(rech.resultats);
    sauverBrouillon();
  }
  function rechRetirerCours(cle) {
    var i = rech.cours.indexOf(cle);
    if (i >= 0) rech.cours.splice(i, 1);
    rech.arme = null;
    rechRendreCours();
    rechRendreResultats(rech.resultats);
    sauverBrouillon();
  }
  function rechDesarmer() {
    if (rech.arme == null) return;
    rech.arme = null;
    rechRendreCours();
  }
  function rechRendreCours() {
    document.getElementById("rech-cours-chips").innerHTML = rech.cours.map(function (cle) {
      var arme = rech.arme === cle;
      var parties = String(cle).split(" · ");
      var code = parties[0] || cle, titre = parties.slice(1).join(" · ");
      return '<button type="button" class="chip' + (arme ? " chip-suppr" : "") + '" data-cours="' + txt(cle) +
        '" aria-pressed="true"><span class="coche" aria-hidden="true"></span>' +
        '<span class="chip-textes"><span>' + txt(code) + "</span>" +
        (titre ? "<small>" + txt(titre) + "</small>" : "") + "</span></button>";
    }).join("");
    var btn = document.getElementById("rech-cours-voir");
    btn.textContent = rech.cours.length
      ? "Voir mon horaire · " + rech.cours.length + " cours"
      : "Voir mon horaire";
    btn.disabled = !rech.cours.length;
    document.getElementById("rech-cours-vide").hidden = !!rech.cours.length;
  }
  function rechVoirCours() {
    if (!rech.cours.length) return;
    // Clé triée : le même panier dans un ordre différent reste le même horaire
    // (et une seule ligne « formation » dans le dashboard).
    choix.formation = "PAR:" + rech.cours.map(function (c) { return c.split(" · ")[0].trim(); }).sort().join(",");
    choix.data = null; choix.groupes = []; choix.ical = null;
    document.getElementById("recherche").blur();
    allerApresFormation();
  }
  function rechVerifierLien() {
    var statut = document.getElementById("rech-lien-status");
    var btn = document.getElementById("rech-lien-voir");
    // Le copier-coller ajoute parfois des espaces ou coupe un caractère :
    // on colle le lien recollé (sans espaces) tel quel.
    var lien = document.getElementById("rech-lien-champ").value.replace(/\s+/g, "");
    if (!lien) { erreur(statut, "Colle d'abord le lien d'abonnement (« S'abonner » dans Mon horaire)."); return; }
    btn.disabled = true;
    attente(statut, "Lecture de ton calendrier…");
    api("/api/ical?lien=" + encodeURIComponent(lien), 40000).then(function (rep) {
      btn.disabled = false;
      effacer(statut);
      choix.formation = LIEN_FORMATION;
      choix.ical = lien;
      choix.data = rep.data;
      choix.groupes = [];
      allerApresFormation();
    }, function (e) {
      btn.disabled = false;
      erreur(statut, "Échec : " + e.message);
    });
  }
  document.getElementById("rech-modes").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-mode]");
    if (!b || b.getAttribute("data-mode") === rech.mode) return;
    rech.mode = b.getAttribute("data-mode");
    document.getElementById("recherche").value = "";
    sauverBrouillon();
    rechAppliquerMode(true);
  });
  document.getElementById("rech-cours-chips").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-cours]");
    if (!b) return;
    var cle = b.getAttribute("data-cours");
    if (rech.arme === cle) { rechRetirerCours(cle); return; } // confirmation
    rech.arme = cle;                                        // premier appui : rouge
    rechRendreCours();
  });
  var OCR_LIB = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  var OCR_INTEGRITE = "sha384-GJqSu7vueQ9qN0E9yLPb3Wtpd7OrgK8KmYzC8T1IysG1bcvxvIO4qtYR/D3A991F";
  var OCR_LANGUES = "https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0_fast";
  function rechAjusterChamp() {
    var zone = document.getElementById("rech-import-texte");
    if (!zone || zone.hidden || vue !== "formation") return;
    var max = Math.round(window.innerHeight * 0.42);
    zone.style.height = "auto";
    var voulu = Math.min(zone.scrollHeight + 2, max);
    zone.style.height = voulu + "px";
    zone.style.overflowY = zone.scrollHeight > max ? "auto" : "hidden";
  }
  function rechChargerOCR() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (!rech.ocr) {
      rech.ocr = new Promise(function (ok, ko) {
        var s = document.createElement("script");
        s.src = OCR_LIB; s.integrity = OCR_INTEGRITE; s.crossOrigin = "anonymous";
        s.onload = function () { ok(window.Tesseract); };
        s.onerror = function () { ko(new Error("lecteur d'image indisponible (hors ligne ?)")); };
        document.head.appendChild(s);
      });
    }
    return rech.ocr;
  }
  function rechLireCapture(fichier, source) {
    var statut = document.getElementById("rech-import-status");
    var image = fichier && (/^image\//.test(fichier.type || "") ||
      /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(fichier.name || ""));
    if (!image) {
      erreur(statut, "Ce fichier n'est pas une image.");
      if (window.EZH_SUIVI) EZH_SUIVI.friction("capture_invalide");
      return;
    }
    if (window.EZH_SUIVI) {
      EZH_SUIVI.envoyer("capture_choisie", { details: {
        source: source || "fichier", octets: +fichier.size || 0 } });
    }
    attente(statut, "Ouverture de la capture…");
    rechChargerOCR().then(function (T) {
      return T.recognize(fichier, "fra", {
        langPath: OCR_LANGUES,
        logger: function (m) {
          if (m && m.status === "recognizing text") {
            attente(statut, "Lecture de la capture… " + Math.round((m.progress || 0) * 100) + " %");
          }
        }
      });
    }).then(function (r) {
      var texte = ((r && r.data && r.data.text) || "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      if (!texte) {
        erreur(statut, "Aucun texte lisible sur cette image.");
        if (window.EZH_SUIVI) EZH_SUIVI.friction("capture_vide");
        return;
      }
      document.getElementById("rech-import-texte").value = texte;
      rechAjusterChamp();
      if (window.EZH_SUIVI) EZH_SUIVI.envoyer("capture_lue", { details: { caracteres: texte.length } });
      rechImporter(true); // on enchaîne tout seuls : l'étudiant voit ses cours, pas le texte
    }, function (e) {
      erreur(statut, "Impossible de lire la capture : " + e.message);
      if (window.EZH_SUIVI) EZH_SUIVI.friction("capture_echec");
    });
  }
  window.addEventListener("resize", rechAjusterChamp);
  (function () {
    // Glisser-déposer une capture sur le bloc (enfants compris) : compteur
    // pour ne pas clignoter quand la souris passe d'un élément à un autre.
    var bloc = document.getElementById("rech-import");
    function allumer(e) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      bloc.classList.add("depot-sur");
    }
    function eteindre() { bloc.classList.remove("depot-sur"); }
    bloc.addEventListener("dragenter", allumer);
    bloc.addEventListener("dragover", allumer);
    // On ne retire qu'en sortant VRAIMENT du bloc : passer d'un enfant à
    // l'autre (bouton, champ) déclenche aussi un dragleave, sans quitter.
    bloc.addEventListener("dragleave", function (e) {
      var vers = e.relatedTarget;
      if (!vers || !bloc.contains(vers)) eteindre();
    });
    // Dépôt ailleurs sur la page, ou glisser annulé (Échap) : on éteint.
    document.addEventListener("dragend", eteindre);
    document.addEventListener("drop", eteindre);
    bloc.addEventListener("drop", function (e) {
      e.preventDefault();
      eteindre();
      var fichiers = (e.dataTransfer && e.dataTransfer.files) || [];
      if (!fichiers.length) {
        erreur(document.getElementById("rech-import-status"), "Aucune image dans ce dépôt.");
        return;
      }
      rechLireCapture(fichiers[0], "depot");
    });
  })();
  document.getElementById("rech-capture-fichier").addEventListener("change", function () {
    if (this.files && this.files[0]) rechLireCapture(this.files[0], "fichier");
    this.value = "";
  });
  // Coller une image (⌘V / Ctrl+V) quand le bloc d'import est affiché.
  document.addEventListener("paste", function (e) {
    var bloc = document.getElementById("rech-import");
    if (!bloc || vue !== "formation") return;
    if (document.getElementById("rech-cours").hidden) return;
    var items = (e.clipboardData && e.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf("image/") === 0) {
        var f = items[i].getAsFile();
        if (f) { e.preventDefault(); rechLireCapture(f, "colle"); return; }
      }
    }
  });
  function rechImporter(depuisCapture) {
    var texte = document.getElementById("rech-import-texte").value;
    var statut = document.getElementById("rech-import-status");
    var btn = document.getElementById("rech-import-voir");
    if (texte.replace(/\s+/g, "").length < 3) {
      if (depuisCapture) erreur(statut, "Aucun texte lisible sur cette capture.");
      else erreur(statut, "Colle d'abord ta liste de cours.");
      return;
    }
    if (btn) btn.disabled = true;
    attente(statut, "Vérification des cours…");
    // En POST : la liste de cours d'un étudiant n'a rien à faire dans une
    // adresse (journaux, historique, Referer).
    api("/api/importer", 60000, { ecole: choix.ecole, liste: texte })
      .then(function (rep) {
        if (btn) btn.disabled = false;
        var d = rep.data || {};
        (d.cours || []).forEach(function (c) {
          if (c.cle && rech.cours.indexOf(c.cle) < 0) rech.cours.push(c.cle);
        });
        rech.arme = null;
        rechRendreCours();
        rechRendreResultats(rech.resultats);
        // Rien à raconter : seules les lignes VRAIMENT ambivalentes (des
        // candidats crédibles, plusieurs cours du même intitulé) proposent un
        // choix ; les lignes illisibles sont simplement ignorées.
        var doutes = (d.a_confirmer || []).filter(function (x) { return x.propositions.length; });
        if (window.EZH_SUIVI) {
          EZH_SUIVI.envoyer("analyse", { details: {
            resultats: (d.cours || []).length, doutes: doutes.length, capture: !!depuisCapture } });
          if (!(d.cours || []).length) EZH_SUIVI.friction("analyse_0", { capture: !!depuisCapture });
        }
        var zone = document.getElementById("rech-import-doutes");
        zone.hidden = !doutes.length;
        zone.innerHTML = !doutes.length ? "" :
          '<div class="prop">' + doutes.map(function (x) {
            return x.propositions.map(function (p) {
              return '<button type="button" class="chip" data-cle="' + txt(p.cle) +
                '" aria-pressed="false"><span class="coche" aria-hidden="true"></span>' +
                '<span class="chip-textes"><span>' + txt(p.code) + "</span>" +
                (p.titre ? "<small>" + txt(p.titre) + "</small>" : "") + "</span></button>";
            }).join("");
          }).join("") + "</div>";
        statut.hidden = false;
        statut.classList.remove("erreur");
        statut.textContent = d.cours.length
          ? (depuisCapture ? d.cours.length + " cours retrouvés sur ta capture" : "J'ai trouvé " + d.cours.length + " cours") +
            " — vérifie qu'ils sont tous là, puis « Voir mon horaire »."
          : (depuisCapture ? "Aucun cours reconnu sur cette capture." : "Aucun cours reconnu : vérifie la liste collée.");
        sauverBrouillon();
      }, function (e) {
        if (btn) btn.disabled = false;
        erreur(statut, "Échec : " + e.message);
      });
  }
  document.getElementById("rech-import-voir").addEventListener("click", function () { rechImporter(false); });
  document.getElementById("rech-import-doutes").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-cle]");
    if (!b) return;
    var cle = b.getAttribute("data-cle");
    if (rech.cours.indexOf(cle) < 0) rech.cours.push(cle);
    rech.arme = null;
    rechRendreCours();
    b.closest(".doute").hidden = true;
    sauverBrouillon();
  });
  document.getElementById("rech-cours-voir").addEventListener("click", rechVoirCours);
  document.getElementById("rech-lien-voir").addEventListener("click", rechVerifierLien);
  document.getElementById("rech-lien-champ").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); rechVerifierLien(); }
  });
  document.getElementById("rech-lien-champ").addEventListener("input", sauverBrouillon);
  /* Recherche : les écoles abrègent (UMONS : « BAB1 », « MAB2 », « Ir. »,
     « (Ch) » ; Condorcet : « B1-Bac », « B1-Mas », « op », « sp »…). Chaque
     nom reçoit des mots-clés en clair, pour qu'on trouve « bac 1 droit »,
     « master gestion », « ingénieur civil » ou « charleroi ». */
  var ALIAS_FORMATION = [
    [/\bbab?(\d)\b/g, " ba$1 bac$1 bachelier bloc$1 b$1 "],
    [/\bba(\d)p?\b/g, " bac$1 bachelier bloc$1 b$1 "],
    [/\bmab?(\d)\b/g, " ma$1 master m$1 "],
    [/\bma(60|120)\b/g, " master "],
    [/\bms\b/g, " master de specialisation "],
    [/\baess\b/g, " agregation enseignement secondaire superieur "],
    [/\baesi\b/g, " agrege enseignement secondaire inferieur "],
    [/\bcapaes\b/g, " certificat aptitude pedagogique "],
    [/\bciu?\b/g, " certificat universitaire formation continue "],
    [/\bb([1-9])-bac/g, " bac$1 bachelier bloc$1 b$1 "],
    [/\bb([1-9])-mas/g, " ma$1 master m$1 "],
    [/\bb([1-9])-cer/g, " certificat "],
    [/\bir\b\.?/g, " ingenieur "],
    [/\bing\b\.?/g, " ingenieur "],
    [/\bsc\b\.?/g, " sciences "],
    [/\bpsycho\b\.?/g, " psychologie "],
    [/\beduc\b\.?/g, " education "],
    [/\bor\b\.?/g, " orientation "],
    [/\bop\b\.?/g, " option "],
    [/\bsp\b/g, " specialisation "],
    [/\btec\b/g, " technique "],
    [/\bsys\b/g, " systemes "],
    [/\bres\b/g, " ressources "],
    [/\beco\b\.?/g, " economie economiques "],
    [/\binfo\b/g, " informatique "],
    [/\bmlz\b/g, " morlanwelz "],
    [/\bst-(?=[a-z])/g, " saint "],
    [/\(ch\)/g, " charleroi "],
    // HELB : sigles de cursus (« IODA B1 », « SF 2 », « OPTI 1 », « KINE 1T »…).
    [/\bioda\b/g, " informatique developpement applications "],
    [/\bsf\b/g, " sage-femme "],
    [/\bsi\b/g, " soins infirmiers "],
    [/\bopti?\b/g, " optometrie optique "],
    [/\bopto\b/g, " optometrie optique "],
    [/\bortho\b/g, " orthoptie "],
    [/\bkine\b/g, " kinesitherapie kine "],
    [/\bergo\b/g, " ergotherapie "],
    [/\bhbd\b/g, " hygiene bucco-dentaire "],
    [/\bpodo\b/g, " podologie "],
    [/\bpsychomot\b/g, " psychomotricite "],
    [/\bmsi\b/g, " sciences infirmieres "],
    [/\bfm\b/g, " facility management "],
    [/\brp\b/g, " relations publiques "],
    [/\bphoto\b/g, " photographie "],
    [/\bscom\b/g, " communication "],
    [/\bas\b/g, " assistant social "],
    [/\btim\b/g, " technologue imagerie medicale "],
    [/\bfs\b/g, " finalite specialisee "],
    [/\bfd\b/g, " finalite didactique "],
    [/\bfa\b/g, " finalite approfondie "]
  ];
  function motsFormation(f) {
    var n = sansAccents(joliFormation(f)), plus = "";
    ALIAS_FORMATION.forEach(function (a) {
      n.replace(a[0], function () {
        var args = arguments;
        plus += a[1].replace(/\$(\d)/g, function (_, k) { return args[+k] || ""; });
        return "";
      });
    });
    return n + " " + plus;
  }
  /* Ordre de lecture : bacheliers, masters, compléments, certificats, puis
     les formations d'autres établissements hébergées par l'école (UMONS :
     formation des enseignants co-organisée avec les hautes écoles) et les
     activités d'aide à la réussite (Condorcet : « B1-Activités d'aide… »,
     des séances de soutien, pas des formations diplômantes). Dans chaque
     rubrique : année puis nom. Les sigles de Condorcet (« B1-Bac »,
     « B2-Mas », « B3-Cer ») rejoignent leur rubrique. */
  var RUBRIQUES = [
    [/^ba(b)?\d|^b[1-9]-bac/, "Bacheliers"],
    [/^ma(b)?\d|^ma60|^ma120|^m\d|^b[1-9]-mas/, "Masters"],
    [/^bloc compl|^ms\b|^ms /, "Compléments et masters de spécialisation"],
    [/^aess|^capaes/, "Agrégations"],
    [/^cu\b|^ciu\b|^cu-|^ciu-|^ifa\b|^mobilite|^b[1-9]-cer/, "Certificats et formations continues"],
    [/^(heh|hephc|namur|tournai|marcinelle|morlanwelz)\b/, "Formation des enseignants (hautes écoles partenaires)"],
    [/^b[1-9]-activites/, "Activités d'aide à la réussite"]
  ];
  /* La HELB abrège tout (« IODA B1 », « SI 3 », « KINE 1T »…) : le niveau
     est dans le sigle, pas au début. Règles à elle, appliquées seulement
     quand c'est son tour : ailleurs, « HEH Mons - B1 - Section 2 » (UMONS)
     doit garder sa rubrique « hautes écoles partenaires ». */
  function rubriqueHelb(n) {
    if (/ b[1-4]( |$)/.test(n) || / (1t|2t|3t|4t)$/.test(n) ||
        /^(si|sf|opti|tim) [1-4]$/.test(n)) return 0;  // bacheliers (blocs)
    if (/ m[1-2]( |$)/.test(n)) return 1;             // masters
    return RUBRIQUES.length;                          // spécialisations, formations continues
  }
  function rubrique(f, ecole) {
    var n = sansAccents(joliFormation(f));
    if (ecole === "helb") return rubriqueHelb(n);
    for (var i = 0; i < RUBRIQUES.length; i++) if (RUBRIQUES[i][0].test(n)) return i;
    return RUBRIQUES.length;
  }
  var collateur = typeof Intl !== "undefined" && Intl.Collator
    ? new Intl.Collator("fr", { numeric: true, sensitivity: "base" }) : null;
  function listerFormations() {
    var mots = sansAccents(document.getElementById("recherche").value).split(/\s+/).filter(Boolean);
    var avecRubriques = formations.liste.length > 40;
    var trouvees = formations.liste.filter(function (f) {
      var n = motsFormation(f);
      return mots.every(function (m) { return n.indexOf(m) >= 0; });
    });
    if (avecRubriques) {
      trouvees = trouvees.map(function (f, i) { return { f: f, r: rubrique(f, choix.ecole), i: i }; })
        .sort(function (a, b) {
          if (a.r !== b.r) return a.r - b.r;
          var c = collateur ? collateur.compare(joliFormation(a.f), joliFormation(b.f)) : 0;
          return c || a.i - b.i;
        });
    } else {
      trouvees = trouvees.map(function (f) { return { f: f, r: -1 }; });
    }
    var derniere = null;
    var enGuide = guidePerso();
    if (enGuide) {
      // La sélection remonte en tête et ne se filtre pas ; le reste de la
      // liste ne montre que ce qui n'est pas déjà coché.
      trouvees = trouvees.filter(function (x) { return !optionChoisie(x.f, null); });
    }
    var corps = trouvees.length
      ? trouvees.map(function (x) {
          var titre = "";
          if (avecRubriques && x.r !== derniere) {
            derniere = x.r;
            titre = '<li class="liste-titre">' + txt(x.r < RUBRIQUES.length ? RUBRIQUES[x.r][1] : "Autres") + "</li>";
          }
          if (enGuide) {
            return titre + htmlOption(x.f, false);
          }
          if (dejaAjoutee(x.f, null)) {
            return titre + '<li><button type="button" class="halo deja" data-formation="' + txt(x.f) +
                   '" data-deja aria-disabled="true"><span class="nom">' + txt(joliFormation(x.f)) +
                   "<small>Déjà dans ton horaire</small></span></button></li>";
          }
          return titre + '<li><button type="button" class="halo" data-formation="' + txt(x.f) + '"><span class="nom">' +
                 txt(joliFormation(x.f)) + '</span><span class="chev" aria-hidden="true"></span></button></li>';
        }).join("")
      : '<li class="empty">Aucune formation ne correspond.</li>';
    document.getElementById("liste-formations").innerHTML =
      (enGuide ? htmlSelectionEpinglee() : "") + corps;
  }
  document.getElementById("recherche").addEventListener("input", function () {
    var ec = ecoleDe(choix.ecole);
    if (ec && ec.recherche) { // ULB : recherche serveur, avec un petit délai
      rechDesarmer();
      clearTimeout(rech.minuteur);
      rech.minuteur = setTimeout(rechChercher, 220);
      sauverBrouillon();
      return;
    }
    if (formations.liste) listerFormations();
    sauverBrouillon();
  });
  document.getElementById("liste-formations").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-formation]");
    if (!b || b.hasAttribute("data-deja")) return;
    if (guidePerso()) {
      // Guide : on coche / décoche, la sélection remonte en tête de liste.
      var f = b.getAttribute("data-formation");
      var at = -1;
      choix.perso.sources.forEach(function (s, i) {
        if (s.formation === f && !(s.ical || "")) at = i;
      });
      if (at >= 0) choix.perso.sources.splice(at, 1);
      else {
        if (choix.perso.sources.length >= FUSION.MAX_SOURCES) return;
        choix.perso.sources.push({ ecole: choix.ecole, formation: f, ical: "",
          role: "ajout", groupes: [], avec: [], sans: [], surnom: "" });
      }
      var ecg = ecoleDe(choix.ecole);
      if (ecg && ecg.recherche) rechRendreResultats(rech.resultats);
      else listerFormations();
      majSuivantOptions();
      return;
    }
    var ec = ecoleDe(choix.ecole);
    if (ec && ec.recherche && rech.mode === "cours") { // on ajoute le cours
      rechAjouterCours(b.getAttribute("data-formation"));
      return;
    }
    var memeFormation = choix.formation === b.getAttribute("data-formation");
    choix.formation = b.getAttribute("data-formation");
    if (!memeFormation) { choix.data = null; choix.groupes = []; }
    choix.ical = null;
    document.getElementById("recherche").blur();
    allerApresFormation();
  });

  /* ---------- 3. Groupe(s) (+ surnom seulement s'il y a déjà un horaire) ----------
     Selon la formation, l'école a un groupe par classe (on en choisit un),
     un groupe par cours (on choisit tous les siens) ou aucun groupe.
     Choisir plusieurs groupes est donc toujours permis.
     Le surnom (ex. Info, Droit) nomme l'onglet du haut : il n'est demandé
     qu'à partir du 2e horaire. Un seul horaire = affichage classique,
     sans nom ni sélecteur. */
  function ouvrirGroupes(preselection) {
    if (guidePerso() && choix.perso.etape === "groupes") { ouvrirGroupesGuide(); return; }
    montrer("groupes");
    document.getElementById("groupes-titre").textContent = "Ton groupe";
    document.getElementById("groupes-compte").hidden = true;
    choix.groupes = (preselection || []).slice();
    var status = document.getElementById("groupes-status");
    var aide = document.getElementById("groupes-aide");
    var chips = document.getElementById("chips");
    var btn = document.getElementById("btn-valider");
    var champSurnom = document.getElementById("surnom");
    aide.textContent = joliFormation(choix.formation);
    chips.innerHTML = ""; btn.hidden = true;
    document.getElementById("filtre-groupes").hidden = true;
    document.getElementById("filtre-groupes-champ").value = "";
    document.getElementById("chips-avis").textContent = "";
    document.getElementById("chips-avis").hidden = true;
    document.getElementById("groupes-modifiable").hidden = true;
    var edite = null;
    if (choix.editionId) {
      for (var k = 0; k < profils.length; k++) if (profils[k].id === choix.editionId) edite = profils[k];
    }
    if (edite && edite.formation === choix.formation) {
      champSurnom.value = choix.surnomEdit != null ? choix.surnomEdit : edite.surnom;
    } else champSurnom.value = surnomDefaut(choix.formation, choix.groupes);
    // Premier horaire : pas de nom, pas de choix, juste l'horaire. Une
    // source d'un horaire sur mesure : le nom et le thème sont au composeur.
    document.getElementById("bloc-surnom").style.display =
      (choix.source || (!edite && profils.length === 0)) ? "none" : "";
    document.getElementById("bloc-theme").hidden = !!choix.source;
    if (choix.theme == null) {
      choix.theme = edite
        ? normaliserTheme(edite.theme)
        : (profils.length === 0 ? themeChoisiIdentite : suggereThemeSuivant());
    }
    choix.theme = normaliserTheme(choix.theme);
    majThemeSelection("groupes-themes", choix.theme);
    document.body.setAttribute("data-theme", String(choix.theme));
    if (choix.data) { effacer(status); listerGroupes(); return; }
    attente(status, "Recherche des groupes de " + joliFormation(choix.formation) + "…");
    var demande = choix.formation;
    var icalDemande = choix.ical;
    chargerHoraire(choix.ecole, demande, icalDemande).then(function (data) {
      if (choix.formation !== demande || choix.ical !== icalDemande) return;
      choix.data = data;
      if (choix.source) {
        choix.source.brut = data; choix.source.brutFrais = true;
        if (!FUSION.estParcours(choix.source)) choix.data = FUSION.donneesCochees(data, choix.source);
      }
      if (vue !== "groupes") return;
      effacer(status); listerGroupes();
    }, function (e) {
      if (vue === "groupes" && choix.formation === demande) {
        erreur(status, "Échec : " + e.message + " Reviens en arrière pour réessayer.");
      }
    });
  }
  /* Les groupes ne montrent que les cours gardés (l'étape des cours
     vient avant) : pas de groupe proposé pour un cours non suivi. */
  function demarrerGroupesGuide() {
    var perso = choix.perso;
    if (!perso || !perso.sources.length) { ouvrirPerso(); return; }
    guideOuvrirGroupes(0);
  }
  /* Guide, étapes groupes : une page par option. Le nom de l'option
     en grand, ses groupes, « Suivant ». Peu de texte, on guide. */
  function ouvrirGroupesGuide() {
    var perso = choix.perso, src = perso && perso.sources[perso.idx];
    if (!src) { ouvrirPerso(); return; }
    montrer("groupes");
    // Retour à chaque étape (voir guideRetour) ; en retouche, vers le récap.
    if (perso.retour === "recap") pile = ["perso"];
    else pile = ["groupes"];
    document.getElementById("btn-retour").hidden = !pile.length;
    document.getElementById("groupes-titre").textContent = joliFormation(src.formation);
    var compte = document.getElementById("groupes-compte");
    compte.hidden = false;
    compte.innerHTML = "Option <strong>" + (perso.idx + 1) + " sur " + perso.sources.length + "</strong>";
    document.getElementById("groupes-aide").textContent = "Choisis ton groupe.";
    var chips = document.getElementById("chips");
    var btn = document.getElementById("btn-valider");
    chips.innerHTML = ""; btn.hidden = true;
    document.getElementById("filtre-groupes").hidden = true;
    document.getElementById("filtre-groupes-champ").value = "";
    document.getElementById("chips-avis").textContent = "";
    document.getElementById("chips-avis").hidden = true;
    document.getElementById("groupes-modifiable").hidden = true;
    document.getElementById("bloc-surnom").style.display = "none";
    document.getElementById("bloc-theme").hidden = true;
    var status = document.getElementById("groupes-status");
    if (choix.data) {
      if (!src.ical) choix.data = FUSION.donneesCochees(choix.data, src);
      effacer(status); listerGroupesGuide(); return;
    }
    attente(status, "Chargement des groupes…");
    var demande = choix.formation, icalDemande = choix.ical;
    chargerHoraire(choix.ecole, demande, icalDemande).then(function (data) {
      if (choix.formation !== demande || choix.ical !== icalDemande) return;
      choix.data = data;
      if (vue !== "groupes" || !guidePerso()) return;
      effacer(status); listerGroupesGuide();
    }, function (e) {
      if (vue === "groupes" && choix.formation === demande) {
        erreur(status, "Échec : " + e.message + " Reviens en arrière pour réessayer.");
      }
    });
  }
  function listerGroupesGuide() {
    var idxAvant = choix.perso ? choix.perso.idx : -1;
    // Même pastilles que le parcours normal, sans le discours.
    listerGroupes();
    // Écran sauté (aucun groupe à choisir) : la suite est déjà affichée.
    if (!choix.perso || choix.perso.idx !== idxAvant || vue !== "groupes") return;
    var perso = choix.perso, src = perso && perso.sources[perso.idx];
    if (!src) return;
    document.getElementById("groupes-titre").textContent = joliFormation(src.formation);
    var compte = document.getElementById("groupes-compte");
    compte.hidden = false;
    compte.innerHTML = "Option <strong>" + (perso.idx + 1) + " sur " + perso.sources.length + "</strong>";
    document.getElementById("bloc-surnom").style.display = "none";
    document.getElementById("bloc-theme").hidden = true;
    document.getElementById("groupes-modifiable").hidden = true;
    var groupes = (choix.data && choix.data.groupes) || [];
    document.getElementById("groupes-aide").textContent =
      groupes.length ? "Choisis ton groupe." : "Pas de groupes ici : tout le monde a le même horaire.";
    majValiderGuide();
  }
  function majValiderGuide() {
    var perso = choix.perso;
    var btn = document.getElementById("btn-valider");
    btn.hidden = false;
    btn.disabled = false;
    var n = choix.groupes.length;
    var dernier = perso.idx >= perso.sources.length - 1;
    if (groupeObligatoire() && !n) {
      btn.disabled = true;
      btn.textContent = "Sélectionne au moins un groupe";
    } else if (perso.retour === "recap") {
      btn.textContent = "Enregistrer";
    } else {
      btn.textContent = dernier ? "Voir le récap" : "Suivant" + (n > 1 ? " · " + n + " groupes" : "");
    }
    majAvisGroupes();
    sauverBrouillon();
  }
  function sauverGroupesGuide() {
    var perso = choix.perso, src = perso && perso.sources[perso.idx];
    if (!src) { ouvrirPerso(); return; }
    var groupes = choix.data.groupes || [];
    var sel = groupes.filter(function (g) { return choix.groupes.indexOf(g) >= 0; })
                     .map(propre).filter(Boolean);
    if (groupeObligatoire() && !sel.length) return;
    src.groupes = sel;
    if (perso.retour === "recap") {
      // Retouche terminée : retour au récap.
      perso.retour = null;
      ouvrirPerso();
      return;
    }
    if (perso.idx + 1 < perso.sources.length) {
      // Option suivante : ses cours, ou ses groupes si elle n'en a pas.
      var sv = perso.sources[perso.idx + 1];
      if (!FUSION.estParcours(sv) && !sv.ical) guideOuvrirCours(perso.idx + 1);
      else guideOuvrirGroupes(perso.idx + 1);
      return;
    }
    ouvrirPerso();
  }
  /* Retour en arrière à chaque étape du guide (options → cours →
     groupes → récap) : la sélection en cours est gardée (les coches de
     cours sont déjà dans la source, les groupes sont enregistrés ici). */
  function guideRetour() {
    var perso = choix.perso;
    if (!perso || !perso.etape || perso.retour === "recap") return false;
    if (perso.etape === "groupes") {
      if (perso.idx < 0 || perso.idx >= perso.sources.length) return false;
      var src = perso.sources[perso.idx];
      if (choix.data && src) {
        var groupes = choix.data.groupes || [];
        src.groupes = groupes.filter(function (g) { return choix.groupes.indexOf(g) >= 0; })
                             .map(propre).filter(Boolean);
      }
      // Recule d'un cran : les cours de la même option, ou les groupes de
      // la précédente si elle n'a pas de cours.
      var s0 = perso.sources[perso.idx];
      if (!FUSION.estParcours(s0) && !s0.ical) return guideOuvrirCours(perso.idx);
      if (perso.idx > 0) return guideOuvrirGroupes(perso.idx - 1);
      return guideOuvrirOptions();
    }
    if (perso.etape === "cours") {
      // Recule d'un cran : les groupes de l'option précédente, ou les
      // options si on est au premier écran de cours.
      if (perso.idx > 0) return guideOuvrirGroupes(perso.idx - 1);
      return guideOuvrirOptions();
    }
    return false;
  }
  /* Retour aux options (fin de la remontée). */
  function guideOuvrirOptions() {
    var perso = choix.perso;
    if (!perso) return false;
    perso.etape = "options";
    choix.ecole = perso.ecole;
    choix.formation = null; choix.data = null; choix.groupes = []; choix.ical = null;
    pile = [];
    ouvrirOptions();
    return true;
  }
  /* (Ré)ouvre les groupes de l'option i (données en cache ou rechargées). */
  function guideOuvrirGroupes(i) {
    var perso = choix.perso, s = perso.sources[i];
    if (!s) return false;
    perso.etape = "groupes";
    perso.idx = i;
    choix.ecole = s.ecole;
    choix.formation = s.formation; choix.ical = s.ical || null;
    choix.groupes = (s.groupes || []).slice();
    choix.data = memoHoraire(s.ecole, s.formation, s.ical);
    ouvrirGroupesGuide();
    if (!choix.data) {
      chargerHoraire(s.ecole, s.formation, s.ical || null).then(function (data) {
        if (!guidePerso() || choix.perso.etape !== "groupes" || choix.perso.idx !== i) return;
        choix.data = s.ical ? data : FUSION.donneesCochees(data, s);
        if (vue === "groupes") { effacer(document.getElementById("groupes-status")); listerGroupesGuide(); }
      }, function () { /* erreur affichée sur l'écran */ });
    }
    return true;
  }
  /* (Ré)ouvre les cours de l'option i (données en cache ou rechargées). */
  function guideOuvrirCours(i) {
    var perso = choix.perso, s = perso.sources[i];
    if (!s || FUSION.estParcours(s) || s.ical) return false;
    perso.etape = "cours";
    perso.idx = i;
    choix.ecole = s.ecole;
    choix.formation = s.formation; choix.ical = s.ical || null;
    choix.groupes = (s.groupes || []).slice();
    choix.data = memoHoraire(s.ecole, s.formation, s.ical);
    ouvrirCoursGuide();
    if (!choix.data) chargerCoursGuide();
    return true;
  }
  function listerGroupes() {
    var groupes = choix.data.groupes || [];
    var aide = document.getElementById("groupes-aide");
    var btn = document.getElementById("btn-valider");
    var filtre = document.getElementById("filtre-groupes");
    if (!groupes.length) {
      // Aucun groupe à choisir : on saute l'écran (sélection vide).
      validerGroupes();
      return;
    }
    // En modification, le rappel « tu pourras les changer plus tard » n'a
    // plus rien à annoncer : on ne l'affiche qu'à la création.
    document.getElementById("groupes-modifiable").hidden = !!choix.editionId;
    // Groupes disparus de l'horaire : oubliés. Les autres reprennent le nom
    // exact de l'école (un nom enregistré sans préfixe retrouve le sien).
    choix.groupes = groupes.filter(function (g) { return groupeDans(choix.groupes, g); });
    var sections = sectionsGroupes();
    var multi = sections.filter(function (x) { return !x.option; });
    var options = sections.filter(function (x) { return x.option; });
    aide.textContent = options.length && multi.length > 1
      ? "Choisis ton groupe dans chaque cours, puis coche les options que tu suis."
      : options.length && multi.length
        ? "Choisis ton groupe, puis coche les options que tu suis."
        : options.length
          ? "Coche les cours et options que tu suis."
          : multi.length > 1
            ? "Ta formation a des groupes par cours : choisis ton groupe dans chaque cours."
            : "Sélectionne ton groupe (plusieurs si besoin).";
    // Longue liste : un filtre évite de faire défiler des écrans de pastilles.
    filtre.hidden = groupes.length <= 20;
    var champ = document.getElementById("filtre-groupes-champ");
    if (filtre.hidden) champ.value = "";
    var html = "";
    var titres = sections.length > 1;
    multi.forEach(function (x) {
      var pastilles = x.groupes.map(function (g) { return pastilleGroupe(g, ""); }).join("");
      // Toujours la même disposition (pastilles côte à côte), qu'il y ait
      // une ou plusieurs sections : sans ce cadre, une section seule
      // s'étirait en liste verticale plein écran.
      html += '<div class="section-groupe">' +
        (titres ? '<p class="section-titre"' +
          (x.matieres.length > 1 ? ' title="' + txt(x.matieres.join(", ")) + '"' : "") + ">" +
          txt(libelleSection(x)) + "</p>" : "") +
        '<div class="chips">' + pastilles + "</div></div>";
    });
    if (options.length) {
      // Les options d'un même cours restent côte à côte, sous le nom du
      // cours : « ROMAB245 » puis ses trois choix, plutôt qu'un tri par nom
      // de groupe qui les éparpille.
      var parCours = {}, ordreCours = [];
      options.forEach(function (x) {
        var cle = x.cours || "";
        if (!parCours[cle]) { parCours[cle] = []; ordreCours.push(cle); }
        parCours[cle].push(x);
      });
      var blocs = ordreCours.map(function (cle) {
        var lot = parCours[cle];
        if (lot.length > 1) {
          return '<div class="section-groupe">' + (cle ? '<p class="section-titre">' + txt(cle) + "</p>" : "") +
            '<div class="options-liste">' + lot.map(function (x) {
              return pastilleGroupe(x.groupes[0], "", true, cle);
            }).join("") + "</div></div>";
        }
        var x = lot[0];
        // Le détail ne répète pas le nom ('Corporate Finance / Corporate Finance').
        var nom = sansAccents(nomGroupe(x.groupes[0])).replace(/[^a-z0-9]/g, "");
        var mats = x.matieres.filter(function (m) {
          var n = sansAccents(m).replace(/[^a-z0-9]/g, "");
          return n !== nom && nom.indexOf(n) < 0 && n.indexOf(nom) < 0;
        });
        return '<div class="options-liste">' + pastilleGroupe(x.groupes[0], mats.join(" · "), true) + "</div>";
      });
      html += '<div class="section-groupe">' +
        (titres && multi.length ? '<p class="section-titre">Options et cours au choix</p>' : "") +
        blocs.join("") + "</div>";
    }
    document.getElementById("chips").innerHTML = html;
    filtrerGroupes();
    majValider();
  }
  function pastilleGroupe(g, detail, option, cherchePlus) {
    var cherche = sansAccents(nomGroupe(g) + " " + detail + " " + (cherchePlus || ""));
    return '<button type="button" class="chip' + (option ? " chip-option" : "") + '" data-groupe="' + txt(g) +
      '" data-cherche="' + txt(cherche) + '" aria-pressed="' + (choix.groupes.indexOf(g) >= 0) + '">' +
      '<span class="coche" aria-hidden="true"></span>' +
      (option
        ? '<span class="chip-textes"><span>' + txt(nomGroupe(g)) + "</span>" + (detail ? "<small>" + txt(detail) + "</small>" : "") + "</span>"
        : txt(nomGroupe(g))) +
      "</button>";
  }
  function filtrerGroupes() {
    var champ = document.getElementById("filtre-groupes-champ");
    var mots = sansAccents(champ.value).split(/\s+/).filter(Boolean);
    var zone = document.getElementById("chips");
    Array.prototype.forEach.call(zone.querySelectorAll(".chip"), function (b) {
      var t = b.getAttribute("data-cherche") || "";
      b.hidden = !mots.every(function (m) { return t.indexOf(m) >= 0; });
    });
    Array.prototype.forEach.call(zone.querySelectorAll(".section-groupe"), function (sec) {
      sec.hidden = !sec.querySelector(".chip:not([hidden])");
    });
    var vide = document.getElementById("filtre-groupes-vide");
    vide.hidden = !mots.length || !!zone.querySelector(".chip:not([hidden])");
  }
  document.getElementById("filtre-groupes-champ").addEventListener("input", filtrerGroupes);
  /* Sections de pastilles. Les groupes d'un même cours portent le même nom
     à un numéro/une lettre près ('Dr. rom - Gr 1'..'Gr 16', 'Groupe A'..'X') :
     ils forment une section « choisis ton groupe ». Un groupe seul de son
     espèce ('Finance', 'Luxury Marketing') est une option : il rejoint la
     liste des options, où l'on coche seulement celles qu'on suit. Le
     regroupement par nom reste stable quand l'école publie de nouvelles
     semaines (les matières d'un groupe, elles, changent). */
  function racineGroupe(g) {
    return sansAccents(courtGroupe(g))
      .replace(/\s*\([^)]*\)\s*$/, "") // « Série 3 (Etudiants de R à Z) » -> « Série 3 »
      .replace(/[\s\-_.]*(?:\d+|\b[a-z])\s*$/, "")
      .replace(/[\s\-_.]*\bgr\.?$/, "")
      .replace(/[^a-z0-9]/g, "");
  }
  function baseGroupe(g) {
    return courtGroupe(g)
      .replace(/[\s\-_.]*(?:\d+|\b[A-Za-z])\s*$/, "")
      .replace(/[\s\-_.]*\bgr\.?$/i, "").trim();
  }
  function sectionsGroupes() {
    var parGroupe = {};
    (choix.data.cours || []).forEach(function (c) {
      (c.groupes || []).forEach(function (g) {
        (parGroupe[g] || (parGroupe[g] = {}))[nettoyerMatiere(c.matiere || "Cours")] = true;
      });
    });
    var sections = [], parCle = {};
    (choix.data.groupes || []).forEach(function (g) {
      var cle = "r:" + racineGroupe(g);
      var x = parCle[cle];
      if (!x) { x = parCle[cle] = { groupes: [], vu: {} }; sections.push(x); }
      x.groupes.push(g);
      Object.keys(parGroupe[g] || {}).forEach(function (m) { x.vu[m] = true; });
    });
    // Un cours mutualisé porte plusieurs codes dans sa case (« COMMB115,
    // COMMB230, … ») : on n'affiche que ceux de l'étudiant, sinon des
    // intitulés qui ne lui parlent pas apparaissent dans les titres.
    var codesChoisis = (choix.formation && choix.formation.indexOf("PAR:") === 0)
      ? choix.formation.slice(4).split(",").map(propre).filter(Boolean) : null;
    sections.forEach(function (x) {
      x.matieres = Object.keys(x.vu).sort(function (a, b) { return a.localeCompare(b, "fr"); });
      if (codesChoisis) {
        var gardees = [];
        x.matieres.forEach(function (m) {
          var siens = m.split(",").map(propre)
            .filter(function (c) { return codesChoisis.indexOf(c) >= 0; });
          if (siens.length) gardees.push(siens.join(", "));
        });
        if (gardees.length) x.matieres = gardees;
      }
      x.option = x.groupes.length === 1;
      x.cours = x.matieres[0] || ""; // cours principal de la section
    });
    // L'ordre suit le cours (le « sous-titre »), pas le nom du groupe : c'est
    // lui que l'étudiant cherche, et ses options restent côte à côte.
    sections.sort(function (a, b) {
      var x = sansAccents(a.cours), y = sansAccents(b.cours);
      if (x !== y) return x < y ? -1 : 1;
      return collateur ? collateur.compare(a.groupes[0], b.groupes[0]) : 0;
    });
    // Une seule espèce de groupe (ex. 'Groupe A'..'X') : pas d'options, une liste.
    if (sections.length === 1) sections[0].option = false;
    // Presque que des groupes isolés (petite formation) : liste simple.
    var options = sections.filter(function (x) { return x.option; }).length;
    if (options && options === sections.length && (choix.data.groupes || []).length <= 4) {
      return [{ groupes: choix.data.groupes.slice(), matieres: [], option: false }];
    }
    return sections;
  }
  // 'D-SCJU-136 - Droit romain - partie 2' -> 'Droit romain - partie 2' ;
  // 'Corporate Finance - AAEP' -> 'Corporate Finance'.
  var RX_CODE_MATIERE = /^([A-Z]{1,4}(?:-[A-Z0-9]{2,8}){1,3})\s*-\s+/;
  function nettoyerMatiere(m) {
    var brut = String(m == null ? "" : m);
    return brut.replace(RX_CODE_MATIERE, "").replace(/\s*-?\s*AAEP\s*$/, "")
               .replace(/\s+/g, " ").trim() || brut;
  }
  function codeMatiere(m) {
    var r = RX_CODE_MATIERE.exec(String(m == null ? "" : m));
    return r ? r[1] : "";
  }
  function libelleSection(x) {
    var noms = x.matieres;
    if (!noms.length) return baseGroupe(x.groupes[0]) || "Autres groupes";
    var joint = noms.join(" · ");
    if (noms.length <= 2 && joint.length <= 64) return joint;
    return (baseGroupe(x.groupes[0]) || "Groupes") + " · " + noms.length + " cours";
  }
  /* Rappel : un cours à plusieurs groupes sans aucune pastille cochée =
     des séances qui n'apparaîtront pas dans l'horaire. Les options non
     cochées sont normales (on ne les suit pas toutes) : pas de rappel. */
  function majAvisGroupes(sections) {
    var avis = document.getElementById("chips-avis");
    if (!avis) return;
    sections = sections || (choix.data && choix.data.groupes && choix.data.groupes.length ? sectionsGroupes() : []);
    var multi = sections.filter(function (x) { return !x.option; });
    var noms = [];
    if (choix.groupes.length && multi.length > 1) {
      noms = multi.filter(function (x) {
        return !x.groupes.some(function (g) { return choix.groupes.indexOf(g) >= 0; });
      }).map(libelleSection);
    }
    avis.hidden = !noms.length;
    if (!noms.length) { avis.textContent = ""; return; }
    var montre = noms.slice(0, 3).join(", ");
    avis.textContent = "Aucun groupe choisi pour : " + montre +
      (noms.length > 3 ? " et " + (noms.length - 3) + " autre" + (noms.length > 4 ? "s" : "") : "") +
      ". Vérifie que ce n'est pas un oubli.";
  }
  /* Groupes par cours (options, langues…) : sans sélection, l'horaire
     mélangerait toutes les options, illisible et trompeur. On exige au
     moins un groupe au-delà de 8. Ni un parcours ULB (« PAR:… ») ni un
     horaire importé (lien d'abonnement) n'ont d'options : rien à exiger. */
  function groupeObligatoire() {
    if (choix.ical) return false;
    if (choix.formation && choix.formation.indexOf("PAR:") === 0) return false;
    return !!(choix.data && choix.data.groupes && choix.data.groupes.length > 8);
  }
  function majValider() {
    if (guidePerso() && choix.perso.etape === "groupes") { majValiderGuide(); return; }
    var btn = document.getElementById("btn-valider");
    btn.hidden = false;
    btn.disabled = false;
    var n = choix.groupes.length;
    // Sans sélection, « tout afficher » superpose aussi les options entre
    // elles (créneaux incompatibles) : on le dit quand il y en a.
    var aOptions = false;
    try {
      aOptions = sectionsGroupes().some(function (x) { return x.option; });
    } catch (e) { aOptions = false; }
    if (groupeObligatoire() && !n) {
      btn.disabled = true;
      btn.textContent = "Sélectionne au moins un groupe";
    } else {
      btn.textContent = !n ? (aOptions ? "Tout afficher (options superposées)"
                                       : "Tout afficher, sans filtre")
        : n === 1 ? "Voir mon horaire" : "Voir mon horaire · " + n + " groupes";
      if (choix.source && n) btn.textContent = texteValiderSource() + (n > 1 ? " · " + n + " groupes" : "");
    }
    majAvisGroupes();
    sauverBrouillon();
  }
  document.getElementById("chips").addEventListener("click", function (e) {
    var b = e.target.closest(".chip");
    if (!b) return;
    var g = b.getAttribute("data-groupe"), i = choix.groupes.indexOf(g);
    if (i >= 0) choix.groupes.splice(i, 1); else choix.groupes.push(g);
    b.setAttribute("aria-pressed", i < 0 ? "true" : "false");
    if (guidePerso() && choix.perso.etape === "groupes") majValiderGuide();
    else majValider();
  });
  var elGrThemes = document.getElementById("groupes-themes");
  if (elGrThemes) {
    elGrThemes.addEventListener("click", function (e) {
      var b = e.target.closest("[data-theme-opt]");
      if (!b) return;
      var t = +b.getAttribute("data-theme-opt");
      choix.theme = t;
      majThemeSelection("groupes-themes", t);
      document.body.setAttribute("data-theme", String(t));
      sauverBrouillon();
    });
  }
  document.getElementById("surnom").addEventListener("input", sauverBrouillon);
  document.getElementById("btn-valider").addEventListener("click", validerGroupes);
  function validerGroupes() {
    if (guidePerso() && choix.perso.etape === "groupes") { sauverGroupesGuide(); return; }
    var groupes = choix.data.groupes;
    var sel = groupes.filter(function (g) { return choix.groupes.indexOf(g) >= 0; }) // ordre de l'école
                     .map(propre).filter(Boolean);
    if (groupeObligatoire() && !sel.length) return; // garde-fou (le bouton est déjà grisé)
    var surnom = document.getElementById("surnom").value.replace(/\s+/g, " ").trim() ||
                 surnomDefaut(choix.formation, sel);
    surnom = surnom.slice(0, 24);
    reparerEcoleParcours(choix); // jamais une sélection de cours ULB rangée à la HEH
    var premierHoraire = !choix.editionId && profils.length === 0;
    if (choix.editionId) {
      for (var i = 0; i < profils.length; i++) {
        if (profils[i].id === choix.editionId) {
          profils[i].ecole = choix.ecole;
          profils[i].formation = choix.formation;
          profils[i].groupes = sel;
          profils[i].ical = choix.ical || "";
          profils[i].surnom = surnom;
          if (choix.theme != null) profils[i].theme = normaliserTheme(choix.theme);
          profil = profils[i];
          break;
        }
      }
    } else {
      var theme = choix.theme != null ? normaliserTheme(choix.theme) : (profils.length === 0 ? themeChoisiIdentite : suggereThemeSuivant());
      profil = {
        id: nouveauId(), surnom: surnom,
        ecole: choix.ecole, formation: choix.formation,
        groupes: sel, ical: choix.ical || "", theme: theme
      };
      profils.push(profil);
    }
    sauverProfils();
    if (window.EZH_SUIVI) {
      if (premierHoraire) {
        EZH_SUIVI.envoyer("horaire_ok", { details: {
          ecole: choix.ecole, groupes: sel.length, ical: !!choix.ical } });
      }
      // Cours à plusieurs groupes sans sélection : l'horaire restera
      // incomplet. Même condition que le rappel affiché (chips-avis).
      var incomplets = 0, multi = [];
      try { multi = sectionsGroupes().filter(function (x) { return !x.option; }); } catch (e) { multi = []; }
      if (choix.groupes.length && multi.length > 1) {
        incomplets = multi.filter(function (x) {
          return !x.groupes.some(function (g) { return choix.groupes.indexOf(g) >= 0; });
        }).length;
      }
      if (incomplets) EZH_SUIVI.friction("groupes_partiels", { manquants: incomplets });
    }
    effacerBrouillon();
    document.getElementById("surnom").value = "";
    choix.editionId = null;
    choix.theme = null;
    pile = [];
    fermerPdf();
    installer(choix.data);
    if (semaineAuto) sem = semaineCourante();
    resetDepliage(); deplierAujourdhui();
    afficherHoraire();
    actualiser().catch(function () { /* garde le cache local */ });
  }

  /* ---------- Horaire sur mesure : guide options -> groupes -> cours -> récap -> nom ---
     choix.perso  : l'horaire en cours de composition
                    { editionId, ecole, sources: [...], surnom, theme, pile,
                      etape ("options"|"groupes"|"cours"|"recap"|"nom"), idx, retour } */
  var ICONE_CALQUES = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 8 4.5-8 4.5-8-4.5z"/>' +
    '<path d="m4 12 8 4.5 8-4.5"/><path d="m4 16.5 8 4.5 8-4.5"/></svg>';
  function sourceSansBrut(src) {
    if (!src) return null;
    var c = {};
    for (var k in src) if (k !== "brut" && k !== "brutFrais") c[k] = src[k];
    return c;
  }
  function reprendrePerso(d, edite) {
    if (!d.perso || typeof d.perso !== "object" || !Array.isArray(d.perso.sources)) return;
    choix.perso = {
      editionId: edite,
      ecole: d.ecole,
      sources: d.perso.sources.map(function (x) { return FUSION.normaliserSource(x, ecoleExiste); })
        .filter(function (x) { return x && x.ecole === d.ecole; }).slice(0, FUSION.MAX_SOURCES),
      surnom: typeof d.perso.surnom === "string" ? d.perso.surnom.slice(0, 24) : "",
      theme: normaliserTheme(d.perso.theme),
      pile: Array.isArray(d.perso.pile) ? d.perso.pile.filter(function (n) {
        return VUES_BROUILLON.indexOf(n) >= 0 || n === "horaire";
      }) : [],
      // Un brouillon interrompu en plein guide reprend au récap (ou aux
      // options s'il n'y a rien) : pas de restauration à mi-parcours.
      etape: "recap", idx: 0, retour: null
    };
    if (!choix.perso.sources.length) choix.perso.etape = "options";
    choix.source = null;
  }
  // Une formation déjà présente dans l'horaire sur mesure (hors celle qu'on modifie).
  function dejaAjoutee(formation, ical) {
    if (!choix.perso || !choix.source) return false;
    return choix.perso.sources.some(function (s, i) {
      return i !== choix.source.index && s.formation === formation && (s.ical || "") === (ical || "");
    });
  }
  function majEnteteSource() {
    document.getElementById("formation-rappel").hidden = true;
  }
  function guidePerso() { return !!(choix.perso && choix.perso.etape); }
  /* Formation choisie : parcours normal -> groupes ; guide sur mesure ->
     bascule vers les étapes guidées (groupes puis cours, option par option). */
  function allerApresFormation() {
    if (guidePerso()) { return; } // le guide choisit plusieurs options : voir btn-options-suivant
    aller("groupes");
  }
  function texteValiderSource() {
    return "Suivant";
  }

  /* --- Guide sur mesure : options, puis cours et groupes option par
     option (C1 -> G1 -> C2 -> G2...), récap, nom et thème ---
     En interne, la 1re option garde tous ses cours (role "principale",
     sans = []) et les suivantes ne gardent que les cours cochés (role
     "ajout", avec = []) : on ne le dit plus, il n'y a plus de mot
     "principal" dans l'interface. */
  function ouvrirPerso() {
    montrer("perso");
    var perso = choix.perso;
    if (!perso || !perso.sources.length) { ouvrirEcoles(); return; }
    if (!perso.pile) perso.pile = pile.slice();
    if (!perso.etape || perso.etape === "options") perso.etape = "recap";
    document.body.setAttribute("data-theme", String(normaliserTheme(perso.theme)));
    if (perso.etape === "nom") ouvrirPersoNom();
    else ouvrirPersoRecap();
  }
  function carteRecapHTML(src, i) {
    var grp = !src.groupes.length ? "Sans filtre de groupe"
      : src.groupes.length === 1 ? nomGroupe(src.groupes[0]) : src.groupes.length + " groupes";
    var detail;
    if (i === 0 && src.role === "principale" && (src.sans || []).length) {
      var memo = memoHoraire(src.ecole, src.formation, src.ical);
      var total = memo ? FUSION.coursDeSource(memo).length : 0;
      var gardes = total ? FUSION.coursDeSource(memo).map(function (x) { return x.cle; })
        .filter(function (k) { return src.sans.indexOf(k) < 0; }).length : 0;
      detail = grp + " · " + (total ? gardes + " cours" : "année modifiée");
    } else if (i === 0) {
      detail = grp + " · toute l'année";
    } else {
      var nCours = (src.avec || []).length;
      detail = grp + " · " + (nCours ? nCours + " cours" : "aucun cours");
    }
    return '<li class="ech-item" data-src-index="' + i + '" data-ouvert="0">' +
      '<div class="ech-fond-modifier"><button type="button" class="ech-action-btn" data-src-edit="' + i +
      '" aria-label="Modifier ' + txt(nomSource(src)) + '">' + ICONE_CRAYON_ECH +
      '<span class="btn-libelle-normal">Modifier</span><span class="btn-libelle-auto">Relâcher</span></button></div>' +
      '<div class="ech-fond-suppr"><button type="button" class="ech-action-btn" data-src-suppr="' + i +
      '" aria-label="Supprimer ' + txt(nomSource(src)) + '">' + ICONE_CORBEILLE_ECH +
      '<span class="btn-libelle-normal">Suppr</span><span class="btn-libelle-auto">Relâcher</span></button></div>' +
      '<div class="ech" data-src-carte="' + i + '" title="Touche pour modifier ou supprimer">' +
      '<span class="src-num" aria-hidden="true">' + (i + 1) + "</span>" +
      '<span class="ech-corps"><span class="ech-titre"><span class="ech-titre-txt">' + txt(nomSource(src)) + "</span></span>" +
      '<span class="ech-quand">' + txt(detail) + "</span></span></div></li>";
  }
  function ouvrirPersoRecap() {
    var perso = choix.perso;
    perso.etape = "recap";
    pile = [];
    document.getElementById("btn-retour").hidden = true;
    document.getElementById("perso-titre").textContent = "Récap";
    document.getElementById("perso-sources").innerHTML =
      '<ul class="ech-liste src-liste">' + perso.sources.map(carteRecapHTML).join("") + "</ul>";
    var plein = perso.sources.length >= FUSION.MAX_SOURCES;
    document.getElementById("perso-ajouter").hidden = plein;
    document.getElementById("perso-max").hidden = !plein;
    document.getElementById("perso-reglages").hidden = true;
    document.getElementById("perso-bloc-surnom").hidden = true;
    var btn = document.getElementById("perso-valider");
    btn.disabled = !perso.sources.length;
    btn.textContent = "Valider";
    // Pas d'alerte de conflits ici : trop d'infos, l'utilisateur les verra
    // via les gants dans son horaire.
    document.getElementById("perso-choc").hidden = true;
    sauverBrouillon();
  }
  function ouvrirPersoNom() {
    var perso = choix.perso;
    perso.etape = "nom";
    pile = [];
    document.getElementById("btn-retour").hidden = true;
    document.getElementById("perso-titre").textContent = "Nom et thème";
    document.getElementById("perso-sources").innerHTML = perso.sources.map(function (src, i) {
      var grp = !src.groupes.length ? "Sans filtre de groupe"
        : src.groupes.length === 1 ? nomGroupe(src.groupes[0]) : src.groupes.length + " groupes";
      return '<div class="srccard"><div class="srccard-ligne">' +
        '<span class="src-num">' + (i + 1) + "</span>" +
        '<span class="src-textes"><span class="src-nom"><span class="src-nom-txt">' + txt(nomSource(src)) + "</span></span>" +
        '<span class="src-detail">' + txt(grp) + "</span></span></div></div>";
    }).join("");
    document.getElementById("perso-ajouter").hidden = true;
    document.getElementById("perso-max").hidden = true;
    document.getElementById("perso-reglages").hidden = false;
    document.getElementById("perso-bloc-surnom").hidden = false;
    document.getElementById("perso-surnom").value = perso.surnom || "";
    document.getElementById("perso-themes").innerHTML =
      choixThemesBlocHTML(perso.theme, "perso-themes-choix", "Thème de cet horaire");
    var btn = document.getElementById("perso-valider");
    majValiderNom();
    document.getElementById("perso-choc").hidden = true;
    sauverBrouillon();
  }
  /* Nom obligatoire : pas de titre, pas d'horaire. */
  function majValiderNom() {
    var perso = choix.perso;
    if (!perso || perso.etape !== "nom") return;
    var btn = document.getElementById("perso-valider");
    var ok = propre(perso.surnom || "").length > 0;
    btn.disabled = !ok;
    btn.textContent = !ok ? "Donne un nom à ton horaire"
      : perso.editionId ? "Enregistrer" : "Voir mon horaire";
  }
  document.getElementById("perso-ajouter").addEventListener("click", function () {
    var perso = choix.perso;
    if (!perso || perso.sources.length >= FUSION.MAX_SOURCES) return;
    perso.etape = "options";
    choix.ecole = perso.ecole;
    choix.formation = null; choix.data = null; choix.groupes = []; choix.ical = null;
    aller("formation");
  });
  /* Récap : même geste que les devoirs (clic = Modifier / Supprimer,
     glisser à gauche ou à droite pareil). */
  function srcRetirer(i) {
    var perso = choix.perso;
    if (!perso || !perso.sources[i]) return;
    perso.sources.splice(i, 1);
    if (!perso.sources.length) {
      perso.etape = "options";
      choix.ecole = perso.ecole;
      choix.formation = null; choix.data = null; choix.groupes = []; choix.ical = null;
      aller("formation");
      return;
    }
    // Toujours une 1re option qui garde tout : on ne le dit plus.
    var p0 = perso.sources[0];
    if (p0.role !== "principale") { p0.role = "principale"; p0.sans = []; delete p0.avec; }
    ouvrirPersoRecap();
  }
  function srcModifier(i) {
    var perso = choix.perso;
    var s = perso && perso.sources[i];
    if (!s) return;
    // Retouche : cours puis groupes, comme à la création.
    perso.retour = "recap";
    if (!FUSION.estParcours(s) && !s.ical) guideOuvrirCours(i);
    else guideOuvrirGroupes(i);
  }
  document.getElementById("perso-sources").addEventListener("click", function (e) {
    var ed = e.target.closest("[data-src-edit]");
    if (ed) { e.stopPropagation(); srcModifier(+ed.getAttribute("data-src-edit")); return; }
    var re = e.target.closest("[data-src-suppr]");
    if (re) { e.stopPropagation(); srcRetirer(+re.getAttribute("data-src-suppr")); return; }
    var carte = e.target.closest("[data-src-carte]");
    if (carte) {
      if (typeof glissementEchEffectue !== "undefined" && glissementEchEffectue) return;
      var item = carte.closest(".ech-item");
      if (!item) return;
      e.stopPropagation();
      var etat = item.getAttribute("data-ouvert");
      if (etat && etat !== "0" && !item._enFermeture) fermerItemEch(item, true);
      else { fermerTousItemsEch(item); ouvrirSplitEch(item); }
    }
  });
  document.getElementById("perso-surnom").addEventListener("input", function () {
    if (choix.perso) choix.perso.surnom = this.value;
    majValiderNom();
    sauverBrouillon();
  });
  document.getElementById("perso-themes").addEventListener("click", function (e) {
    var b = e.target.closest("[data-theme-opt]");
    if (!b || !choix.perso) return;
    var t = normaliserTheme(+b.getAttribute("data-theme-opt"));
    choix.perso.theme = t;
    majThemeSelection("perso-themes", t);
    document.body.setAttribute("data-theme", String(t));
    sauverBrouillon();
  });
  document.getElementById("perso-valider").addEventListener("click", function () {
    var perso = choix.perso;
    if (!perso || !perso.sources.length) return;
    if (perso.etape === "recap") { ouvrirPersoNom(); return; }
    if (!propre(perso.surnom || "").length) return; // garde-fou (bouton déjà grisé)
    var sources = JSON.parse(JSON.stringify(perso.sources));
    var theme = normaliserTheme(perso.theme);
    var saisi = propre(perso.surnom || "").slice(0, 24);
    // Une seule année, entière : c'est un horaire normal, sans fusion.
    var s0 = sources[0];
    var simple = sources.length === 1 && s0.role === "principale" && !(s0.sans || []).length;
    var champs = simple
      ? { ecole: s0.ecole, formation: s0.formation, groupes: s0.groupes.slice(), ical: s0.ical || "",
          sources: [], surnom: saisi || surnomDefaut(s0.formation) }
      : { ecole: perso.ecole, formation: "", groupes: [], ical: "", sources: sources, surnom: saisi || SURNOM_PERSO };
    var premierHoraire = !perso.editionId && profils.length === 0;
    var cible = perso.editionId ? profilParId(perso.editionId) : null;
    if (cible) {
      for (var k in champs) cible[k] = champs[k];
      cible.theme = theme;
      cible.maj = Date.now();
      profil = cible;
    } else {
      champs.id = nouveauId();
      champs.theme = theme;
      profil = champs;
      profils.push(profil);
    }
    if (simple) delete profil.sources;
    sauverProfils();
    if (window.EZH_SUIVI && premierHoraire) {
      EZH_SUIVI.envoyer("horaire_ok", { details: {
        ecole: perso.ecole, groupes: 0, ical: false, perso: !simple, sources: sources.length } });
    }
    effacerBrouillon();
    choix = { ecole: null, formation: null, data: null, groupes: [], ical: null, editionId: null, theme: null, perso: null, source: null };
    pile = [];
    fermerPdf();
    DATA = null;
    var memo = memoProfil(profil);
    if (memo) installer(memo);
    if (semaineAuto) sem = semaineCourante();
    resetDepliage(); deplierAujourdhui();
    afficherHoraire();
    actualiser().catch(function (e) {
      if (!DATA && vue === "horaire") {
        erreur(document.getElementById("horaire-status"),
               "Impossible de charger ton horaire : " + e.message + " Recharge la page pour réessayer.");
      }
    });
  });
  // ⋮ → Modifier d'un horaire sur mesure : le récap, en édition.
  // `srcIndex` : ouvre directement cette option.
  function modifierPerso(id, srcIndex) {
    var p = profilParId(id);
    if (!p || !estPerso(p)) return;
    fermerEdition();
    fermerFeuille();
    choix = {
      ecole: p.ecole, formation: null, data: null, groupes: [], ical: null,
      editionId: p.id, theme: normaliserTheme(p.theme), source: null,
      perso: { editionId: p.id, ecole: p.ecole, sources: JSON.parse(JSON.stringify(p.sources)),
               surnom: p.surnom, theme: normaliserTheme(p.theme), pile: ["horaire"], etape: "recap" }
    };
    pile = ["horaire"];
    ouvrirPerso();
    if (srcIndex != null && choix.perso.sources[srcIndex]) srcModifier(srcIndex);
  }

  /* --- Cours d'une option ajoutée : on coche ce qu'on suit, tout
     part décoché. La 1re option n'a pas cette page : tout est gardé
     sans le dire. --- */
  function ouvrirCours() {
    if (guidePerso() && choix.perso.etape === "cours") { ouvrirCoursGuide(); return; }
    montrer("cours");
    document.getElementById("cours-titre").textContent = "Tes cours dans cette année";
    document.getElementById("cours-compte").hidden = true;
    var src = choix.source;
    if (!src || !src.formation) { ouvrirPerso(); return; }
    document.getElementById("cours-rappel").innerHTML = ICONE_CALQUES.replace(/26/g, "20") +
      "<span><strong>" + txt(nomSource(src)) + "</strong> · " +
      (src.index == null ? "source " + (choix.perso.sources.length + 1) : "source " + (src.index + 1)) + "</span>";
    var status = document.getElementById("cours-status");
    document.getElementById("cours-liste").innerHTML = "";
    document.getElementById("cours-liens").hidden = true;
    document.getElementById("cours-valider").hidden = true;
    if (src.brut) { effacer(status); listerCours(); }
    else attente(status, "Chargement des cours de " + nomSource(src) + "…");
    if (src.brutFrais) return;
    chargerHoraire(src.ecole, src.formation, src.ical || null).then(function (data) {
      if (choix.source !== src) return;
      src.brut = data; src.brutFrais = true;
      if (vue === "cours") { effacer(status); listerCours(); }
    }, function (e) {
      if (choix.source !== src || vue !== "cours" || src.brut) return;
      erreur(status, "Échec : " + e.message + " Reviens en arrière pour réessayer.");
    });
  }
  function cochee(src, cle) {
    return src.role === "principale" ? (src.sans || []).indexOf(cle) < 0 : (src.avec || []).indexOf(cle) >= 0;
  }
  function coursSuivantAjout(depuis) {
    var perso = choix.perso;
    for (var i = depuis; i < perso.sources.length; i++) {
      var s = perso.sources[i];
      if (!FUSION.estParcours(s) && !s.ical) return i;
    }
    return -1;
  }
  function demarrerCoursGuide() {
    var perso = choix.perso;
    var j = coursSuivantAjout(0);
    if (j < 0) { demarrerGroupesGuide(); return; }
    perso.etape = "cours";
    perso.idx = j;
    perso.retour = perso.retour === "recap" ? "recap" : null;
    var s = perso.sources[j];
    choix.ecole = s.ecole;
    choix.formation = s.formation; choix.ical = s.ical || null;
    choix.groupes = (s.groupes || []).slice();
    choix.data = memoHoraire(s.ecole, s.formation, s.ical);
    ouvrirCoursGuide();
    if (!choix.data) chargerCoursGuide();
  }
  function ouvrirCoursGuide() {
    var perso = choix.perso, src = perso && perso.sources[perso.idx];
    if (!src) { ouvrirPerso(); return; }
    montrer("cours");
    // Retour à chaque étape (voir guideRetour) ; en retouche, vers le récap.
    if (perso.retour === "recap") pile = ["perso"];
    else pile = ["groupes"];
    document.getElementById("btn-retour").hidden = !pile.length;
    document.getElementById("cours-titre").textContent = joliFormation(src.formation);
    var compte = document.getElementById("cours-compte");
    var nbCours = perso.sources.filter(function (s) {
      return !FUSION.estParcours(s) && !s.ical;
    }).length;
    compte.hidden = nbCours < 2;
    if (!compte.hidden) {
      var rang = 0;
      for (var i = 0; i <= perso.idx; i++) {
        var s2 = perso.sources[i];
        if (!FUSION.estParcours(s2) && !s2.ical) rang++;
      }
      compte.innerHTML = "Cours <strong>" + rang + " sur " + nbCours + "</strong>";
    }
    document.getElementById("cours-rappel").hidden = true;
    document.getElementById("cours-role").hidden = true;
    var status = document.getElementById("cours-status");
    document.getElementById("cours-liste").innerHTML = "";
    document.getElementById("cours-liens").hidden = true;
    document.getElementById("cours-valider").hidden = true;
    document.getElementById("filtre-cours").hidden = true;
    document.getElementById("filtre-cours-champ").value = "";
    document.getElementById("filtre-cours-vide").hidden = true;
    if (choix.data) { effacer(status); listerCoursGuide(); return; }
    attente(status, "Chargement des cours…");
  }
  function chargerCoursGuide() {
    var perso = choix.perso, j = perso.idx;
    var s = perso.sources[j];
    chargerHoraire(s.ecole, s.formation, s.ical || null).then(function (data) {
      if (!guidePerso() || choix.perso.etape !== "cours" || choix.perso.idx !== j) return;
      choix.data = data;
      if (vue === "cours") { effacer(document.getElementById("cours-status")); listerCoursGuide(); }
    }, function (e) {
      if (guidePerso() && choix.perso.idx === j && vue === "cours") {
        erreur(document.getElementById("cours-status"), "Échec : " + e.message + " Reviens en arrière pour réessayer.");
      }
    });
  }
  function listerCoursGuide() {
    var src = choix.perso.sources[choix.perso.idx];
    var liste = FUSION.coursDeSource(choix.data);
    var status = document.getElementById("cours-status");
    if (!liste.length) {
      erreur(status, "Cette option n'a encore aucun cours publié.");
      document.getElementById("cours-liste").innerHTML = "";
      document.getElementById("cours-liens").hidden = true;
      document.getElementById("cours-valider").hidden = true;
      return;
    }
    if (!Array.isArray(src.avec)) src.avec = [];
    if (!Array.isArray(src.sans)) src.sans = [];
    // 1re option : tout est coché, on décoche. Les autres : tout est
    // décoché, on coche.
    var prem = choix.perso.idx === 0 && src.role === "principale";
    document.getElementById("cours-aide").textContent = prem
      ? "Tout est coché : décoche ce que tu ne suis pas."
      : "Coche les cours que tu suis.";
    document.getElementById("cours-liens").hidden = liste.length < 4;
    document.getElementById("cours-liste").innerHTML = liste.map(function (x) {
      var code = codeMatiere(x.cle);
      var detail = [code, x.seances + " séance" + (x.seances > 1 ? "s" : "")].filter(Boolean).join(" · ");
      var on = src.role === "principale" ? src.sans.indexOf(x.cle) < 0 : src.avec.indexOf(x.cle) >= 0;
      var cherche = sansAccents(nettoyerMatiere(x.cle) + " " + code);
      return '<button type="button" class="cours-ligne" data-cle="' + txt(x.cle) + '" data-cherche="' + txt(cherche) +
        '" aria-pressed="' + on + '">' +
        '<span class="coche" aria-hidden="true"></span><span class="ct"><strong>' + txt(nettoyerMatiere(x.cle)) +
        "</strong><small>" + txt(detail) + "</small></span></button>";
    }).join("");
    document.getElementById("filtre-cours").hidden = liste.length < 8;
    filtrerCours();
    majValiderCoursGuide();
  }
  function filtrerCours() {
    var champ = document.getElementById("filtre-cours-champ");
    var mots = sansAccents(champ.value).split(/\s+/).filter(Boolean);
    var zone = document.getElementById("cours-liste");
    Array.prototype.forEach.call(zone.querySelectorAll(".cours-ligne"), function (b) {
      var t = b.getAttribute("data-cherche") || "";
      b.hidden = !mots.every(function (m) { return t.indexOf(m) >= 0; });
    });
    var vide = document.getElementById("filtre-cours-vide");
    vide.hidden = !mots.length || !!zone.querySelector(".cours-ligne:not([hidden])");
  }
  document.getElementById("filtre-cours-champ").addEventListener("input", filtrerCours);
  function majValiderCoursGuide() {
    var perso = choix.perso, src = perso.sources[perso.idx];
    var cles = choix.data ? FUSION.coursDeSource(choix.data).map(function (x) { return x.cle; }) : [];
    var n = src.role === "principale"
      ? cles.filter(function (k) { return (src.sans || []).indexOf(k) < 0; }).length
      : (src.avec || []).length;
    var btn = document.getElementById("cours-valider");
    btn.hidden = false;
    btn.disabled = !n;
    if (!n) btn.textContent = "Coche au moins un cours";
    else if (perso.retour === "recap") btn.textContent = "Enregistrer";
    else btn.textContent = "Suivant" + (n > 1 ? " · " + n + " cours" : "");
    sauverBrouillon();
  }
  function sauverCoursGuide() {
    var perso = choix.perso, src = perso && perso.sources[perso.idx];
    if (!src || !choix.data) return;
    var cles = FUSION.coursDeSource(choix.data).map(function (x) { return x.cle; });
    var gardes;
    if (src.role === "principale") {
      src.sans = (src.sans || []).filter(function (k) { return cles.indexOf(k) >= 0; });
      delete src.avec;
      gardes = cles.filter(function (k) { return src.sans.indexOf(k) < 0; });
    } else {
      src.avec = (src.avec || []).filter(function (k) { return cles.indexOf(k) >= 0; });
      delete src.sans;
      gardes = src.avec;
    }
    if (!gardes.length) return;
    if (perso.retour === "recap") { guideOuvrirGroupes(perso.idx); return; }
    // Cours puis groupes, option par option : après les cours, les groupes
    // de la même option.
    guideOuvrirGroupes(perso.idx);
  }
  function listerCours() {
    var src = choix.source;
    var liste = FUSION.coursDeSource(src.brut);
    var status = document.getElementById("cours-status");
    Array.prototype.forEach.call(document.querySelectorAll("#cours-role button"), function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-role") === src.role));
    });
    if (!liste.length) {
      erreur(status, "Cette formation n'a encore aucun cours publié : reviens en arrière et choisis-en une autre.");
      document.getElementById("cours-liste").innerHTML = "";
      document.getElementById("cours-liens").hidden = true;
      document.getElementById("cours-valider").hidden = true;
      return;
    }
    if (!Array.isArray(src.avec)) src.avec = [];
    if (!Array.isArray(src.sans)) src.sans = [];
    document.getElementById("cours-aide").textContent = src.role === "principale"
      ? "Tout est coché : décoche les cours que tu ne suis pas. Les cours que l'école ajoutera en cours d'année arriveront tout seuls."
      : "Coche seulement les cours que tu suis dans cette année.";
    document.getElementById("cours-liens").hidden = liste.length < 4;
    document.getElementById("cours-liste").innerHTML = liste.map(function (x) {
      var code = codeMatiere(x.cle);
      var detail = [code, x.seances + " séance" + (x.seances > 1 ? "s" : "")].filter(Boolean).join(" · ");
      return '<button type="button" class="cours-ligne" data-cle="' + txt(x.cle) + '" aria-pressed="' + cochee(src, x.cle) + '">' +
        '<span class="coche" aria-hidden="true"></span><span class="ct"><strong>' + txt(nettoyerMatiere(x.cle)) +
        "</strong><small>" + txt(detail) + "</small></span></button>";
    }).join("");
    majValiderCours();
  }
  function clesListe() { return FUSION.coursDeSource(choix.source.brut).map(function (x) { return x.cle; }); }
  function majValiderCours() {
    var src = choix.source, cles = clesListe();
    var n = cles.filter(function (k) { return cochee(src, k); }).length;
    var btn = document.getElementById("cours-valider");
    btn.hidden = false;
    btn.disabled = !n;
    if (src.role === "principale") {
      btn.textContent = !n ? "Garde au moins un cours" : n === cles.length ? "Garder toute l'année"
        : "Garder ces " + n + " cours sur " + cles.length;
    } else {
      btn.textContent = !n ? "Coche au moins un cours" : n === 1 ? "Ajouter ce cours" : "Ajouter ces " + n + " cours";
    }
    sauverBrouillon();
  }
  document.getElementById("cours-role").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-role]");
    var src = choix.source;
    if (!b || !src || !src.brut || b.getAttribute("data-role") === src.role) return;
    // Changer de rôle remet les cases à leur état de départ.
    src.role = b.getAttribute("data-role");
    src.sans = []; src.avec = [];
    listerCours();
  });
  document.getElementById("cours-liste").addEventListener("click", function (e) {
    var b = e.target.closest(".cours-ligne");
    if (!b) return;
    if (guidePerso() && choix.perso.etape === "cours") {
      var gs = choix.perso.sources[choix.perso.idx];
      if (!gs) return;
      var cle = b.getAttribute("data-cle");
      if (gs.role === "principale") {
        if (!Array.isArray(gs.sans)) gs.sans = [];
        var j = gs.sans.indexOf(cle);
        if (j >= 0) gs.sans.splice(j, 1); else gs.sans.push(cle);
        b.setAttribute("aria-pressed", String(j >= 0));
      } else {
        if (!Array.isArray(gs.avec)) gs.avec = [];
        var i = gs.avec.indexOf(cle);
        if (i >= 0) gs.avec.splice(i, 1); else gs.avec.push(cle);
        b.setAttribute("aria-pressed", String(i < 0));
      }
      majValiderCoursGuide();
      return;
    }
    var src = choix.source;
    if (!b || !src) return;
    var cle2 = b.getAttribute("data-cle");
    var liste = src.role === "principale" ? src.sans : src.avec;
    var j = liste.indexOf(cle2);
    if (j >= 0) liste.splice(j, 1); else liste.push(cle2);
    b.setAttribute("aria-pressed", String(cochee(src, cle2)));
    majValiderCours();
  });
  function toutCocher(oui) {
    if (guidePerso() && choix.perso.etape === "cours") {
      var gs = choix.perso.sources[choix.perso.idx];
      if (!gs || !choix.data) return;
      var cles = FUSION.coursDeSource(choix.data).map(function (x) { return x.cle; });
      if (gs.role === "principale") gs.sans = oui ? [] : cles.slice();
      else gs.avec = oui ? cles.slice() : [];
      listerCoursGuide();
      return;
    }
    var src = choix.source;
    if (!src || !src.brut) return;
    if (src.role === "principale") src.sans = oui ? [] : clesListe();
    else src.avec = oui ? clesListe() : [];
    listerCours();
  }
  document.getElementById("cours-tout").addEventListener("click", function () { toutCocher(true); });
  document.getElementById("cours-rien").addEventListener("click", function () { toutCocher(false); });
  document.getElementById("cours-valider").addEventListener("click", function () {
    if (guidePerso() && choix.perso.etape === "cours") { sauverCoursGuide(); return; }
    var src = choix.source;
    if (!src || !src.brut) return;
    // Les cours qui n'existent plus chez l'école quittent la sélection :
    // l'étudiant vient de revoir la liste complète.
    var cles = clesListe();
    if (src.role === "principale") {
      src.sans = src.sans.filter(function (k) { return cles.indexOf(k) >= 0; });
      src.avec = undefined;
    } else {
      src.avec = src.avec.filter(function (k) { return cles.indexOf(k) >= 0; });
      src.sans = [];
    }
    var cochees = FUSION.donneesCochees(src.brut, src);
    if (!cochees.cours.length) return;
    if (!cochees.groupes.length) { choix.data = cochees; choix.groupes = []; aller("groupes"); return; }
    choix.formation = src.formation;
    choix.ical = src.ical || null;
    choix.data = cochees;
    choix.groupes = src.groupes.slice();
    aller("groupes");
  });

  /* ---------- 4. Horaire (multi-profils) ---------- */
  function appliquerTheme() {
    var t = profil && typeof profil.theme === "number" ? normaliserTheme(profil.theme) : 2;
    document.body.setAttribute("data-theme", String(t));
  }
  function choisirProfil(id) {
    var trouve = null;
    for (var i = 0; i < profils.length; i++) if (profils[i].id === id) trouve = profils[i];
    if (!trouve || (profil && trouve.id === profil.id)) return;
    profil = trouve;
    sauverProfils();
    fermerPdf();
    DATA = null;
    var memo = memoProfil(profil);
    if (memo) installer(memo);
    if (semaineAuto) sem = semaineCourante();
    resetDepliage(); deplierAujourdhui();
    afficherHoraire();
    actualiser().catch(function () { /* hors ligne : garde le cache */ });
    tracerVisite();
  }
  function rendreSeg() {
    var seg = document.getElementById("seg");
    // Un seul horaire : rien au-dessus de la semaine — on sait à quoi on
    // est inscrit ; la barre ne sert qu'à choisir entre plusieurs.
    // L'ajout d'un horaire se fait uniquement depuis le menu du compte
    // (bouton « + Ajouter un horaire » dans la feuille) : jamais ici.
    if (!profil || profils.length < 2) { seg.hidden = true; seg.innerHTML = '<span class="pill" aria-hidden="true"></span>'; return; }
    seg.hidden = false;
    var idx = 0;
    for (var i = 0; i < profils.length; i++) if (profils[i].id === profil.id) idx = i;
    var n = Math.max(1, profils.length);
    // Même liste qu'avant (mêmes horaires, même ordre) : on ne reconstruit
    // rien, on déplace juste la pastille — c'est ce qui la fait glisser
    // d'un onglet à l'autre (façon Horairelm). Reconstruire le innerHTML
    // recréerait la pastille à sa position finale : aucun glissement.
    var boutons = seg.querySelectorAll("button[data-profil]");
    var memeStructure = boutons.length === profils.length;
    if (memeStructure) {
      for (var k = 0; k < profils.length; k++) {
        if (boutons[k].getAttribute("data-profil") !== profils[k].id) { memeStructure = false; break; }
      }
    }
    seg.style.setProperty("--n", n);
    if (memeStructure) {
      seg.style.setProperty("--idx", idx);
      Array.prototype.forEach.call(boutons, function (b, j) {
        var p = profils[j];
        b.setAttribute("aria-pressed", p.id === profil.id ? "true" : "false");
        var neuf = semainesARevoir(p.id).length > 0;
        if (neuf) b.classList.add("neuf"); else b.classList.remove("neuf");
        var titre = libelleProfil(p);
        if (b.getAttribute("title") !== titre) b.setAttribute("title", titre);
        if (b.textContent !== p.surnom) b.textContent = p.surnom;
      });
      ajusterSeg();
      return;
    }
    seg.style.setProperty("--idx", idx);
    seg.classList.remove("defile");
    var html = '<span class="pill" aria-hidden="true"></span>';
    profils.forEach(function (p) {
      var neuf = semainesARevoir(p.id).length > 0;
      html += '<button type="button"' + (neuf ? ' class="neuf"' : "") + ' data-profil="' + txt(p.id) + '" aria-pressed="' +
              (p.id === profil.id) + '" title="' + txt(libelleProfil(p)) + '">' + txt(p.surnom) + "</button>";
    });
    seg.innerHTML = html;
    ajusterSeg();
  }
  // Noms longs (formations UMONS) ou beaucoup d'horaires : si un onglet
  // coupe son nom, la barre passe en mode défilant, où chaque onglet
  // prend la largeur de son nom. Sinon elle reste en grille, avec la
  // pastille qui glisse — les deux extrémités du rail sont alors
  // parfaitement symétriques.
  function ajusterSeg() {
    var seg = document.getElementById("seg");
    if (seg.hidden || !profils) return;
    // Toutes les mesures d'abord, les écritures ensuite : une seule
    // remise en page au lieu d'une par lecture après changement de classe
    // (le profil du démarrage relisait offsetLeft/offsetWidth juste après
    // avoir basculé « defile »).
    var defile = seg.classList.contains("defile");
    var deborde = seg.scrollWidth > seg.clientWidth + 5;
    var coupe = Array.prototype.some.call(seg.querySelectorAll("button"), function (b) {
      return b.scrollWidth > b.clientWidth + 1;
    });
    // Déjà en mode défilant : n'y rester que si le contenu déborde
    // vraiment. Le ::after (4 px) crée un mini-dépassement artificiel,
    // d'où la tolérance de 5 px.
    var doitDefiler = defile ? deborde : coupe;
    seg.classList.toggle("defile", doitDefiler);
    montrerOngletActif(seg);
  }
  // Mode défilant : l'onglet actif est ramené dans la zone visible (centré
  // si possible), puis les fondus de bord sont mis à jour.
  function montrerOngletActif(seg) {
    if (!seg.classList.contains("defile")) { majFonduSeg(seg); return; }
    var b = seg.querySelector('button[aria-pressed="true"]');
    if (b) {
      var cible = b.offsetLeft - (seg.clientWidth - b.offsetWidth) / 2;
      var voulu = Math.max(0, Math.min(cible, seg.scrollWidth - seg.clientWidth));
      // Écrire seulement si ça change : sinon le navigateur relance une
      // mise en page pour rien (défilement déjà au bon endroit).
      if (Math.abs(seg.scrollLeft - voulu) > 0.5) seg.scrollLeft = voulu;
    }
    majFonduSeg(seg);
  }
  function majFonduSeg(seg) {
    var defile = seg.classList.contains("defile");
    var max = seg.scrollWidth - seg.clientWidth;
    seg.classList.toggle("suite-g", defile && seg.scrollLeft > 2);
    seg.classList.toggle("suite-d", defile && max > 5 && seg.scrollLeft < max - 2);
  }
  // Le redimensionnement (rotation du téléphone) peut déclencher une
  // rafale d'événements : une seule mesure par image suffit.
  var resizeSegEnAttente = false;
  window.addEventListener("resize", function () {
    if (resizeSegEnAttente) return;
    resizeSegEnAttente = true;
    requestAnimationFrame(function () { resizeSegEnAttente = false; ajusterSeg(); });
  });
  document.getElementById("seg").addEventListener("scroll", function () {
    majFonduSeg(this);
  }, { passive: true });
  document.getElementById("seg").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-profil]");
    if (b) choisirProfil(b.getAttribute("data-profil"));
  });
  function installer(data) {
    DATA = data;
    SANS_PROFS = !!(data && data.cours && data.cours.length &&
      !data.cours.some(function (c) { return c.profs; }));
    preparerCouleurs(data && data.cours);
    LUNDI0 = parseDate(DATA.meta.premier_lundi);
    SEMAINES = parseEns(DATA.meta.periode).sort(function (a, b) { return a - b; });
    // Nouvelles semaines depuis la dernière visite de CET horaire (voir
    // `ezh_semaines`) : c'est la période fusionnée qui fait foi, donc le
    // bandeau reste juste pour un horaire sur mesure aussi. L'alerte est
    // consommée dès qu'elle est montrée (`marquerSemainesVues`) : seule la
    // première ouverture qui suit la publication la voit, un rechargement
    // ne la remontre pas. `ALERTES_SEMAINES` garde le bandeau pour la
    // visite en cours : un second passage (cache puis école) peut l'allonger
    // si l'école publie plus, sans jamais le consommer deux fois.
    NOUVELLES_SEMAINES = [];
    if (profil) {
      retenirSemaines(profil.id, DATA.meta.periode);
      var nouvelles = semainesARevoir(profil.id);
      if (nouvelles.length) {
        var deja = ALERTES_SEMAINES[profil.id] || [];
        ALERTES_SEMAINES[profil.id] = deja.concat(nouvelles.filter(function (w) {
          return deja.indexOf(w) < 0;
        })).sort(function (a, b) { return a - b; });
        marquerSemainesVues(profil.id); // vue une fois = consommée
      }
      NOUVELLES_SEMAINES = ALERTES_SEMAINES[profil.id] || [];
    }
    FERIES = {};
    parseEns(DATA.meta.feries || "[]").forEach(function (n) { FERIES[n] = true; });
    FERIES_NOMS = (DATA.meta.feries_noms && typeof DATA.meta.feries_noms === "object")
      ? DATA.meta.feries_noms : {};
    CHOCS = [];
    if (DATA.perso) {
      // Déjà filtré source par source (cours, groupes) par fusion.js.
      COURS = DATA.cours;
      CHOCS = FUSION.chevauchements(COURS, profil.sources);
      indexerCours();
      if (semaineAuto || SEMAINES.indexOf(sem) < 0) sem = semaineCourante();
      return;
    }
    // Groupe enregistré sous une autre forme (préfixé ou non) que celle de
    // l'école : on reprend la forme de l'école s'il n'y a qu'un candidat.
    var repris = false;
    profil.groupes = profil.groupes.map(function (g) {
      if (DATA.groupes.indexOf(g) >= 0) return g;
      var memes = DATA.groupes.filter(function (d) { return memeGroupe(g, d); });
      if (memes.length !== 1) return g;
      repris = true;
      return propre(memes[0]);
    });
    if (repris) { profil.maj = Date.now(); sauverProfils(); }
    var sel = profil.groupes;
    COURS = DATA.cours.filter(function (c) {
      if (!sel.length || !c.groupes.length) return true; // séance de toute la formation
      return c.groupes.some(function (g) { return groupeDans(sel, g); });
    });
    // Sélection par codes de cours (« PAR:… ») : les cours choisis viennent
    // d'années différentes, souvent sans groupes à cocher. Un chevauchement
    // entre deux d'entre eux est un vrai conflit, même dans la même source
    // (voir chevauchements de fusion.js).
    if (FUSION.estParcours(profil)) CHOCS = FUSION.chevauchements(COURS, [profil]);
    indexerCours();
    if (semaineAuto || SEMAINES.indexOf(sem) < 0) sem = semaineCourante();
  }
  /* PDF du groupe s'il n'y en a qu'un. Plusieurs groupes : celui choisi
     dans la liste de la visionneuse. Tant que rien n'est choisi, la
     liste attend sur « Choisis… » (`CHOIX_PDF_VIDE`) au lieu de charger
     le premier PDF tout seul. */
  var pdfGroupe = { id: null, g: "" };
  var CHOIX_PDF_VIDE = "__choix";
  /* Choix déjà fait pour le profil affiché ? Sans lui, un profil à
     plusieurs groupes n'a encore rien demandé : on propose, on ne devine pas. */
  function pdfChoixFait() {
    if (!profil) return false;
    if (pdfGroupe.id !== profil.id) return false;
    if (estPerso(profil)) {
      var opts = optionsPdfPerso();
      for (var k = 0; k < opts.length; k++) if (opts[k].v === pdfGroupe.g) return true;
      return false;
    }
    return profil.groupes.indexOf(pdfGroupe.g) >= 0 || pdfGroupe.g === "";
  }
  /* Horaire sur mesure : un PDF officiel par source (l'école n'en publie
     qu'un par formation). Une entrée par source et par groupe choisi ;
     pas de PDF pour un lien iCal ni pour une école qui n'en publie pas. */
  function optionsPdfPerso() {
    var out = [];
    if (!profil || !estPerso(profil)) return out;
    profil.sources.forEach(function (src, i) {
      var ec = ecoleDe(src.ecole);
      if (src.ical || !ec || ec.pdf === false) return;
      // Année d'ajout : l'école ne sait faire que l'année entière. Un
      // parcours « PAR:… » est déjà limité aux cours choisis.
      var tout = src.role === "principale" || FUSION.estParcours(src) ? "" : " (année entière)";
      if (src.groupes.length <= 1) {
        out.push({ v: i + "|" + (src.groupes[0] || ""), i: i, g: src.groupes[0] || "", nom: nomSource(src) + tout });
      } else {
        src.groupes.forEach(function (g) {
          out.push({ v: i + "|" + g, i: i, g: g, nom: nomSource(src) + " · " + nomGroupe(g) + tout });
        });
      }
    });
    return out;
  }
  function choixPdfPerso() {
    var opts = optionsPdfPerso();
    for (var k = 0; k < opts.length; k++) {
      if (pdfGroupe.id === profil.id && opts[k].v === pdfGroupe.g) return opts[k];
    }
    return opts[0] || null;
  }
  // Ce que demande api/pdf : la formation de la source, et sa semaine à
  // elle (décalée si la source a été alignée sur un autre lundi).
  function ciblePdf() {
    if (!estPerso(profil)) {
      return { ecole: profil.ecole, formation: profil.formation, groupe: groupePdf(), semaine: sem };
    }
    var o = choixPdfPerso(), src = o ? profil.sources[o.i] : null;
    if (!src) return null;
    var delta = (DATA && DATA.infos && DATA.infos.deltas && DATA.infos.deltas[o.i]) || 0;
    return { ecole: src.ecole, formation: src.formation, groupe: o.g, semaine: sem - delta };
  }
  function groupePdf() {
    if (profil.groupes.length === 1) return profil.groupes[0];
    if (pdfGroupe.id === profil.id && profil.groupes.indexOf(pdfGroupe.g) >= 0) return pdfGroupe.g;
    return "";
  }
  function majChoixPdf() {
    var bloc = document.getElementById("pdf-choix");
    var avisChoix = document.getElementById("pdf-choix-avis");
    if (profil && estPerso(profil)) {
      var opts = optionsPdfPerso(), actuel = choixPdfPerso();
      bloc.hidden = opts.length < 2;
      var selP = document.getElementById("pdf-groupe");
      var faitP = pdfChoixFait();
      selP.innerHTML = ((!faitP && opts.length > 1)
        ? '<option value="' + CHOIX_PDF_VIDE + '" selected>Choisis…</option>' : "") +
        opts.map(function (o) {
          return '<option value="' + txt(o.v) + '">' + txt(o.nom) + "</option>";
        }).join("");
      selP.value = faitP && actuel ? actuel.v : CHOIX_PDF_VIDE;
      if (avisChoix) {
        var srcPdf = actuel && profil.sources[actuel.i];
        var ajout = !!faitP && !!srcPdf && srcPdf.role !== "principale" && !FUSION.estParcours(srcPdf);
        avisChoix.hidden = !ajout;
        if (ajout) avisChoix.textContent = "L'école publie le PDF de l'année entière : tes cours y sont mêlés aux autres.";
      }
      return faitP;
    }
    var multi = !!(profil && profil.groupes.length > 1);
    bloc.hidden = !multi;
    if (!multi) { if (avisChoix) avisChoix.hidden = true; return true; }
    var fait = pdfChoixFait();
    var choisi = fait ? groupePdf() : CHOIX_PDF_VIDE;
    var sel = document.getElementById("pdf-groupe");
    sel.innerHTML = (fait ? "" : '<option value="' + CHOIX_PDF_VIDE + '" selected>Choisis…</option>') +
      '<option value="">Toute la formation</option>' + profil.groupes.map(function (g) {
        return '<option value="' + txt(g) + '">' + txt(nomGroupe(g)) + "</option>";
      }).join("");
    sel.value = choisi;
    // « Toute la formation » superpose tous les groupes dans le PDF
    // officiel : on prévient, pour inviter à choisir son groupe.
    if (avisChoix) {
      avisChoix.hidden = !fait || !!choisi;
      if (fait && !choisi) {
        avisChoix.textContent = "Toute la formation superpose les " + profil.groupes.length +
          " groupes : choisis ton groupe ci-dessus pour un PDF lisible.";
      }
    }
    return fait;
  }
  document.getElementById("pdf-groupe").addEventListener("change", function () {
    if (this.value === CHOIX_PDF_VIDE) return; // encore rien choisi : on attend
    pdfGroupe = { id: profil.id, g: this.value };
    fermerPdf();
    document.getElementById("btn-pdf").click();
  });
  function afficherHoraire() {
    montrer("horaire");
    if (!profil) { aller("ecole"); return; }
    appliquerTheme();
    rendreSeg();
    rendreAvatar();
    var multi = profils.length > 1;
    // En haut à droite : toujours juste la bulle avec les initiales,
    // jamais le nom du cours. Le menu se déroule au clic comme avant.
    document.getElementById("moi-txt").textContent = "";
    document.getElementById("btn-moi").setAttribute("aria-label", "Réglages");
    var status = document.getElementById("horaire-status");
    var contenu = document.getElementById("horaire-contenu");
    if (!DATA) {
      contenu.hidden = true;
      attente(status, multi ? "Chargement de l'horaire « " + profil.surnom + " »…" : "Chargement de ton horaire…");
      return;
    }
    status.hidden = true;
    contenu.hidden = false;
    rendre();
  }

  function coursDe(s, jour) {
    return COURS_PAR_JOUR[s + "|" + jour] || [];
  }
  /* Index reconstruit à chaque installation : cours par (semaine, jour)
     déjà triés, et chevauchements par semaine. Sans lui, chaque rendu
     refiltrait et retriait tout l'horaire des dizaines de fois. */
  function indexerCours() {
    COURS_PAR_JOUR = {};
    var i, w, k;
    for (i = 0; i < COURS.length; i++) {
      var c = COURS[i], semaines = c.semaines || [];
      for (w = 0; w < semaines.length; w++) {
        k = semaines[w] + "|" + c.jour;
        (COURS_PAR_JOUR[k] || (COURS_PAR_JOUR[k] = [])).push(c);
      }
    }
    for (k in COURS_PAR_JOUR) {
      COURS_PAR_JOUR[k].sort(function (a, b) {
        return a.debut < b.debut ? -1 : a.debut > b.debut ? 1 : 0;
      });
    }
    CHOCS_SEM = {};
    COURS_EN_CHOC = {};
    for (i = 0; i < CHOCS.length; i++) {
      var x = CHOCS[i], semainesX = x.semaines || [];
      for (w = 0; w < semainesX.length; w++) {
        var s = semainesX[w];
        (CHOCS_SEM[s] || (CHOCS_SEM[s] = [])).push(x);
        (COURS_EN_CHOC[s] || (COURS_EN_CHOC[s] = new Set())).add(x.a).add(x.b);
      }
    }
  }
  function mins(h) { return (+h.slice(0, 2)) * 60 + (+h.slice(3, 5)); }

  // Toujours les vraies heures : chaque école a ses propres créneaux.
  function pauseEntre(finPrec, debutSuiv) {
    var a = mins(finPrec), b = mins(debutSuiv);
    if (b <= a) return null;
    var midi = a <= 13 * 60 && b >= 12 * 60 + 30 && b - a <= 180;
    return (midi ? "Pause midi · " : "Pause · ") + fmtH(finPrec) + " – " + fmtH(debutSuiv);
  }

  /* Groupes choisis dont dépend une séance : ceux de sa source pour un
     horaire sur mesure. Un seul groupe choisi = inutile de le répéter. */
  function groupesChoisisDe(c) {
    if (estPerso(profil) && profil.sources[c.src]) return profil.sources[c.src].groupes;
    return profil.groupes;
  }
  var COULEURS_SOURCES = ["#1d4fd7", "#0e8655", "#d14d8a", "#b26a00", "#7a4fd1", "#0e7c86"];
  function nomSource(src) {
    if (!src) return "";
    if (src.surnom) return src.surnom;
    if (src.ical) return "Mon horaire (lien)";
    return joliFormation(src.formation);
  }
  function detailSource(src) {
    if (FUSION.estParcours(src)) return "cours choisis";
    if (src.role === "principale") {
      return src.sans && src.sans.length
        ? "année principale, " + src.sans.length + " cours retiré" + (src.sans.length > 1 ? "s" : "")
        : "année entière";
    }
    var n = (src.avec || []).length;
    return n + " cours ajouté" + (n > 1 ? "s" : "");
  }
  // Séances en conflit la semaine `s` (sur mesure ou codes de cours).
  function chocsSemaine(s) {
    return CHOCS_SEM[s] || [];
  }
  function enConflit(c, s) {
    var set = COURS_EN_CHOC[s];
    return !!set && set.has(c);
  }
  /* Direction du gant d'un cours en conflit : vers le haut quand le cours
     juste au-dessus est l'autre cours du conflit, vers le bas sinon — de
     haut en bas, les deux gants se pointent l'un vers l'autre. */
  function dirChoc(cours, i) {
    var prec = i > 0 ? cours[i - 1] : null;
    if (!prec) return " vers-bas";
    var chocs = chocsSemaine(sem), c = cours[i], q;
    for (q = 0; q < chocs.length; q++) {
      if ((chocs[q].a === c && chocs[q].b === prec) ||
          (chocs[q].a === prec && chocs[q].b === c)) return " vers-haut";
    }
    return " vers-bas";
  }
  /* Couleurs des deux premiers cours en conflit du jour `liste`, pour les
     gants de l'en-tête quand le jour est refermé : la même teinte que leur
     point (voir .cpoint). "" s'il y en a moins de deux. */
  function couleursChoc(liste) {
    var premiers = [], i;
    for (i = 0; i < liste.length && premiers.length < 2; i++) {
      if (enConflit(liste[i], sem)) premiers.push(liste[i]);
    }
    if (premiers.length < 2) return "";
    function teinte(nom) {
      var t = couleurCours(nom);
      return "hsl(" + t.h + "," + (52 - t.v * 10) + "%," + (52 + t.v * 7) + "%)";
    }
    return ' style="--c1:' + teinte(premiers[0].matiere) +
      ';--c2:' + teinte(premiers[1].matiere) + '"';
  }
  /* ---------- Devoirs et examens, rattachés à un cours ou à un jour ----------
     Chaque horaire a ses propres échéances, rangées sous une clé : un cours
     (jour, heure de début, matière) ou un jour sans cours (férié, libre) —
     dans ce cas la clé est « jour|| ». Elles ne s'affichent que le jour
     où elles sont dues et ne passent jamais d'un horaire à l'autre.
     Connecté, elles voyagent dans la table `echeances` (voir
     supabase/schema.sql) : ajoutées sur le téléphone, elles apparaissent
     sur les autres appareils. Hors ligne ou sans cloud, le localStorage
     seul fait foi. */
  var CLE_ECHEANCES = "ezh_echeances";
  var JOURS_COURTS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
  var _echTout = null; // cache d'un rendu, invalidé à chaque écriture
  var echNeuf = "";    // échéance qui vient d'être ajoutée (surbrillance)

  function lireEcheancesTout() {
    if (_echTout === null) {
      var m = lire(CLE_ECHEANCES);
      _echTout = m && typeof m === "object" && !Array.isArray(m) ? m : {};
    }
    return _echTout;
  }
  function cleCoursEch(c) { return c.jour + "|" + c.debut + "|" + (c.matiere || ""); }
  function cleJourEch(jour) { return jour + "||"; }
  /* Clé de rendez-vous d'un cours dans la semaine affichée (« jour:index ») :
     c'est elle que portent les boutons et les lignes d'échéances, pour
     retrouver le cours au moment du clic. */
  function cleRenduCours(c) {
    var i = coursDe(sem, c.jour).indexOf(c);
    return i >= 0 ? c.jour + ":" + i : cleCoursEch(c);
  }
  /* Un jour sans cours se comporte comme un cours sans heure ni matière :
     même rangement, même affichage, mêmes fonctions. */
  function pseudoJour(jour) { return { jour: jour, debut: "", fin: "", matiere: "", groupes: [] }; }
  function echeancesSous(cle) {
    if (!profil || !cle) return [];
    var parProfil = lireEcheancesTout()[profil.id];
    if (!parProfil) return [];
    var liste = parProfil[cle];
    if (!liste && cle.indexOf("|") >= 0) {
      var p = cle.split("|");
      if (p.length >= 3 && p[1]) {
        var altH = p[1].charAt(0) === "0" ? p[1].slice(1) : (p[1].charAt(1) === "h" ? "0" + p[1] : "");
        if (altH) liste = parProfil[p[0] + "|" + altH + "|" + p[2]];
      }
    }
    return Array.isArray(liste) ? liste : [];
  }
  function ecrireEcheancesSous(cle, liste) {
    if (!profil || !cle) return;
    var tous = lireEcheancesTout();
    if (!tous[profil.id]) tous[profil.id] = {};
    if (liste && liste.length) tous[profil.id][cle] = liste;
    else {
      delete tous[profil.id][cle];
      if (cle.indexOf("|") >= 0) {
        var p = cle.split("|");
        if (p.length >= 3 && p[1]) {
          var altH = p[1].charAt(0) === "0" ? p[1].slice(1) : (p[1].charAt(1) === "h" ? "0" + p[1] : "");
          if (altH) delete tous[profil.id][p[0] + "|" + altH + "|" + p[2]];
        }
      }
      if (!Object.keys(tous[profil.id]).length) delete tous[profil.id];
    }
    ecrire(CLE_ECHEANCES, tous);
    planifierPush(); // cloud (Supabase) si connecté, sinon rien
  }
  function echeancesDe(c) { return echeancesSous(cleCoursEch(c)); }
  function ecrireEcheances(c, liste) { ecrireEcheancesSous(cleCoursEch(c), liste); }
  function echeancesJour(jour) { return echeancesSous(cleJourEch(jour)); }
  /* Horaire supprimé : ses échéances s'en vont avec, ici et dans le cloud. */
  function oublierEcheances(id) {
    var tous = lireEcheancesTout();
    if (tous[id]) {
      var ids = [], parCle = tous[id];
      for (var cle in parCle) {
        if (!parCle.hasOwnProperty(cle) || !Array.isArray(parCle[cle])) continue;
        for (var k = 0; k < parCle[cle].length; k++) if (parCle[cle][k] && parCle[cle][k].id) ids.push(parCle[cle][k].id);
      }
      oublierSyncEch(ids);
      delete tous[id]; ecrire(CLE_ECHEANCES, tous);
    }
    if (!id) return;
    fileSupprEch({ profil: id, tout: true });
    supprimerEcheancesDistantes(id);
    planifierPush(); // rejoue la suppression si l'appareil était hors ligne
  }
  /* ---------- Devoirs et examens dans le cloud (table `echeances`) ----------
     Fusion par id : chaque échéance a son identifiant stable, deux
     appareils qui ajoutent chacun un devoir ne s'écrasent pas (le pull
     unit les deux listes). Seule la coche (`fait`) se modifie après
     coup : elle voyage avec son instant (`fait_at`), le dernier geste
     gagne. Une suppression n'est jamais rejouée par erreur : la
     suppression d'un autre appareil ne
     s'applique ici que si la ligne n'y est plus (appareil neuf) — un
     appareil qui l'avait déjà garde sa copie locale, comme les horaires
     (voir pullProfils : pas de tombeau distant, une suppression peut
     ressusciter si un appareil hors ligne la repousse ; il suffit alors
     de la supprimer à nouveau).
     Les suppressions locales partent tout de suite, et sont gardées dans
     `ezh_echeances_suppr` jusqu'à leur envoi : un appareil hors ligne au
     moment de la suppression la rejoue à la prochaine poussée.
     Pour qu'une suppression ne ressuscite jamais (un appareil hors ligne
     garderait sa copie et la repousserait à sa reconnexion), chaque
     appareil retient dans `ezh_echeances_sync` les identifiants déjà vus
     sur le cloud : au tirage, une ligne locale absente du cloud mais
     déjà synchronisée vient d'être supprimée ailleurs — elle est effacée
     ici aussi. Une ligne jamais synchronisée est un ajout hors ligne :
     elle est gardée, puis poussée. */
  // Table absente du cloud (schema.sql pas rejoué) : on reste en local,
  // comme les horaires sur mesure sans colonne `sources` (voir pushProfils).
  var baseSansEcheances = false;
  var CLE_ECH_SUPPR = "ezh_echeances_suppr";
  var ECH_MAX_DISTANTES = 500; // même plafond que limiter_echeances()
  /* Une échéance venue du cloud (ou en partance) : nettoyée, jamais
     crue sur parole — une ligne illisible est ignorée, pas stockée. */
  function echeancePropre(e) {
    if (!e || typeof e !== "object") return null;
    var id = String(e.id || "");
    if (!id || id.length > 120) return null;
    var titre = String(e.titre || "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (!titre) return null;
    var date = String(e.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    var heure = String(e.heure || "");
    if (heure && !/^([01]\d|2[0-3]):[0-5]\d$/.test(heure)) heure = "";
    var cree = +e.cree;
    if (!(cree >= 0)) cree = 0;
    // Coche « c'est fait » : synchronisée entre les appareils, le
    // dernier geste gagne (voir pullEcheancesMaintenant).
    var fait = e.fait === true;
    var faitAt = +e.fait_at;
    if (!(faitAt >= 0)) faitAt = 0;
    return { id: id, type: e.type === "examen" ? "examen" : "devoir",
             titre: titre, date: date, heure: heure,
             cree: Math.min(Math.floor(cree), 9999999999999),
             fait: fait, fait_at: Math.min(Math.floor(faitAt), 9999999999999) };
  }
  function lireFileSupprEch() {
    var f = lire(CLE_ECH_SUPPR);
    return Array.isArray(f) ? f : [];
  }
  function ecrireFileSupprEch(file) { ecrire(CLE_ECH_SUPPR, file); }
  /* Une suppression à rejouer : unitaire ({profil, cle, id}) ou tout un
     horaire ({profil, tout}). Un tout-horaire rend ses suppressions
     unitaires inutiles. Bornée : au-delà de 200, les plus anciennes sont
     oubliées (le pire cas est une suppression à refaire à la main). */
  function fileSupprEch(cible) {
    if (!cible || !cible.profil) return;
    var pid = String(cible.profil).slice(0, 120);
    var file = lireFileSupprEch().filter(function (x) {
      if (!x || x.profil !== pid) return true;
      return cible.tout ? false : x.id !== cible.id;
    });
    file.push(cible.tout ? { profil: pid, tout: true }
                         : { profil: pid, cle: String(cible.cle || "").slice(0, 300),
                             id: String(cible.id || "").slice(0, 120) });
    if (file.length > 200) file = file.slice(file.length - 200);
    ecrireFileSupprEch(file);
  }
  function supprCouvre(file, profilId, id) {
    for (var i = 0; i < file.length; i++) {
      var x = file[i];
      if (!x || x.profil !== profilId) continue;
      if (x.tout || x.id === id) return true;
    }
    return false;
  }
  /* Identifiants déjà vus sur le cloud (poussés ou tirés) : c'est ce qui
     distingue « ajout hors ligne à garder » de « suppression d'ailleurs
     à appliquer ». Borné : au-delà de 2000, les plus anciens sont oubliés
     (le pire cas est une suppression à refaire une fois à la main). */
  var CLE_ECH_SYNC = "ezh_echeances_sync";
  function lireSyncEch() {
    var m = lire(CLE_ECH_SYNC);
    return m && typeof m === "object" && !Array.isArray(m) ? m : {};
  }
  function ecrireSyncEch(m) { ecrire(CLE_ECH_SYNC, m); }
  function marquerSyncEch(ids) {
    if (!ids || !ids.length) return;
    var m = lireSyncEch(), change = false, i;
    for (i = 0; i < ids.length; i++) if (ids[i] && !m[ids[i]]) { m[ids[i]] = 1; change = true; }
    if (!change) return;
    var cles = Object.keys(m);
    if (cles.length > 2000) for (i = 0; i < cles.length - 2000; i++) delete m[cles[i]];
    ecrireSyncEch(m);
  }
  function oublierSyncEch(ids) {
    if (!ids || !ids.length) return;
    var m = lireSyncEch(), change = false;
    for (var i = 0; i < ids.length; i++) if (ids[i] && m[ids[i]]) { delete m[ids[i]]; change = true; }
    if (change) ecrireSyncEch(m);
  }
  /* Lignes à pousser : échéances valides des horaires connus. Un horaire
     inconnu (autre compte, avant le tri du changement de compte) reste
     local : il ne part jamais sous un autre user_id. */
  function lignesEcheancesLocales(uid) {
    var lignes = [], connus = {};
    for (var i = 0; i < profils.length; i++) if (profils[i] && profils[i].id) connus[profils[i].id] = true;
    var tous = lireEcheancesTout();
    for (var pid in tous) {
      if (!tous.hasOwnProperty(pid) || !connus[pid]) continue;
      var parCle = tous[pid];
      if (!parCle || typeof parCle !== "object") continue;
      for (var cle in parCle) {
        if (!parCle.hasOwnProperty(cle)) continue;
        var liste = parCle[cle];
        if (!Array.isArray(liste)) continue;
        var c = String(cle).slice(0, 300);
        if (!c) continue;
        for (var k = 0; k < liste.length; k++) {
          var e = echeancePropre(liste[k]);
          if (!e) continue;
          lignes.push({ user_id: uid, profil_id: pid, cle: c, id: e.id, type: e.type,
                        titre: e.titre, date: e.date, heure: e.heure, cree: e.cree,
                        fait: e.fait, fait_at: e.fait_at });
          if (lignes.length >= ECH_MAX_DISTANTES) return lignes;
        }
      }
    }
    return lignes;
  }
  /* Suppression immédiate (horaire effacé) : la file rejouera en
     différé si l'appareil est hors ligne. */
  function supprimerEcheancesDistantes(profilId, cle, id) {
    if (baseSansEcheances || !SUPABASE_OK || !sb || !sessionSupabase || !sessionSupabase.user) return;
    var q = sb.from("echeances").delete().eq("user_id", sessionSupabase.user.id).eq("profil_id", profilId);
    if (id) q = q.eq("cle", cle || "").eq("id", id);
    q.then(function (res) {
      var msg = res.error ? String(res.error.message || "") : "";
      if (msg && /echeances/i.test(msg)) baseSansEcheances = true;
    }, function () { /* la file rejouera */ });
  }
  /* Suppressions en attente : une à une, les ratées restent en file. */
  function rejouerSupprEch(uid) {
    var file = lireFileSupprEch();
    if (!file.length) return Promise.resolve(true);
    var ratees = [], suiv = 0;
    function une() {
      if (suiv >= file.length) { ecrireFileSupprEch(ratees); return true; }
      var x = file[suiv++];
      if (!x || !x.profil || (!x.tout && !x.id)) return une();
      var q = sb.from("echeances").delete().eq("user_id", uid).eq("profil_id", x.profil);
      if (!x.tout) q = q.eq("cle", x.cle || "").eq("id", x.id);
      return q.then(function (res) {
        if (res.error) {
          var msg = String(res.error.message || "");
          if (/echeances/i.test(msg)) baseSansEcheances = true;
          ratees.push(x);
        }
        return une();
      }, function () { ratees.push(x); return une(); });
    }
    return une().then(function () { return true; });
  }
  function pushEcheances() {
    if (!SUPABASE_OK || !sb || !sessionSupabase || !sessionSupabase.user || !compte || compte.supabase_id !== sessionSupabase.user.id) return Promise.resolve(false);
    if (baseSansEcheances) return Promise.resolve(false);
    var uid = sessionSupabase.user.id;
    var lignes = lignesEcheancesLocales(uid);
    function pousse() {
      if (!lignes.length) return Promise.resolve({});
      return sb.from("echeances").upsert(lignes, { onConflict: "user_id,profil_id,cle,id" }).then(function (res) {
        var msg = res.error ? String(res.error.message || "") : "";
        if (msg && /echeances/i.test(msg)) { baseSansEcheances = true; return {}; }
        return res;
      });
    }
    return pousse().then(function (res) {
      if (res.error) throw res.error;
      // L'envoi a réussi : ces identifiants existent sur le cloud. Leur
      // absence à un prochain tirage signifiera « supprimé ailleurs ».
      var ids = [];
      for (var i = 0; i < lignes.length; i++) if (lignes[i] && lignes[i].id) ids.push(lignes[i].id);
      marquerSyncEch(ids);
      return rejouerSupprEch(uid);
    });
  }
  var pullEchEnVol = null; // comme pullEnVol : deux appels ne font qu'une requête
  function pullEcheances() {
    if (!SUPABASE_OK || !sb || !sessionSupabase || !sessionSupabase.user || !compte || compte.supabase_id !== sessionSupabase.user.id) return Promise.resolve(false);
    if (baseSansEcheances) return Promise.resolve(false);
    if (pullEchEnVol) return pullEchEnVol;
    pullEchEnVol = pullEcheancesMaintenant();
    var fin = function () { pullEchEnVol = null; };
    pullEchEnVol.then(fin, fin);
    return pullEchEnVol;
  }
  function pullEcheancesMaintenant() {
    var uid = sessionSupabase.user.id;
    var generation = generationCompte;
    return sb.from("echeances").select("profil_id,cle,id,type,titre,date,heure,cree,fait,fait_at").eq("user_id", uid).then(function (res) {
      if (generation !== generationCompte || !sessionSupabase || !sessionSupabase.user || sessionSupabase.user.id !== uid || !compte || compte.supabase_id !== uid) return false;
      var msg = res.error ? String(res.error.message || "") : "";
      if (msg && /echeances/i.test(msg)) { baseSansEcheances = true; return false; }
      if (res.error) throw res.error;
      var connus = {};
      for (var i = 0; i < profils.length; i++) if (profils[i] && profils[i].id) connus[profils[i].id] = true;
      var file = lireFileSupprEch();
      var tous = lireEcheancesTout(), change = false, vus = {}, distIds = [];
      (res.data || []).forEach(function (l) {
        if (!l || !connus[l.profil_id]) return;
        var e = echeancePropre(l);
        if (!e) return;
        var cle = String(l.cle || "").slice(0, 300);
        if (!cle || supprCouvre(file, l.profil_id, e.id)) return;
        vus[l.profil_id + "\n" + cle + "\n" + e.id] = true;
        distIds.push(e.id);
        if (!tous[l.profil_id]) tous[l.profil_id] = {};
        var liste = tous[l.profil_id][cle];
        if (!Array.isArray(liste)) { liste = tous[l.profil_id][cle] = []; change = true; }
        var ancien = null;
        for (var k = 0; k < liste.length; k++) if (liste[k] && liste[k].id === e.id) { ancien = liste[k]; break; }
        if (!ancien) { liste.push(e); change = true; }
        else {
          // Coche venue d'un autre appareil : le dernier geste gagne.
          // (Dé)cochée ici après l'envoi distant, la copie locale reste
          // la bonne : on ne l'écrase que si le cloud est plus récent.
          var fD = e.fait_at || 0, fL = +(ancien.fait_at || 0);
          if (!(fL >= 0)) fL = 0;
          if (fD > fL) { ancien.fait = e.fait; ancien.fait_at = fD; change = true; }
        }
      });
      // Tirées du cloud : ces identifiants y existent, on les retient.
      marquerSyncEch(distIds);
      // Absente du cloud mais déjà synchronisée, et pas en file de
      // suppression locale : c'est une suppression d'un autre appareil —
      // elle s'applique ici au lieu de ressusciter à la prochaine poussée.
      var sync = lireSyncEch(), syncChange = false;
      for (var dPid in tous) {
        if (!tous.hasOwnProperty(dPid) || !connus[dPid]) continue;
        var dCle = tous[dPid];
        for (var dC in dCle) {
          if (!dCle.hasOwnProperty(dC)) continue;
          var dListe = dCle[dC];
          if (!Array.isArray(dListe)) continue;
          var garde = [];
          for (var dK = 0; dK < dListe.length; dK++) {
            var dE = dListe[dK];
            if (dE && dE.id && !vus[dPid + "\n" + dC + "\n" + dE.id] && sync[dE.id] && !supprCouvre(file, dPid, dE.id)) {
              delete sync[dE.id]; syncChange = true; change = true;
            } else garde.push(dE);
          }
          if (garde.length !== dListe.length) {
            if (garde.length) dCle[dC] = garde;
            else delete dCle[dC];
          }
        }
        if (!Object.keys(dCle).length) delete tous[dPid];
      }
      if (syncChange) ecrireSyncEch(sync);
      if (change) {
        ecrire(CLE_ECHEANCES, tous);
        // L'horaire affiché suit : le devoir d'un autre appareil apparaît
        // sans recharger (sauf bulle ou fenêtre ouverte : elles gardent
        // leur contenu, le prochain rendu affichera tout).
        if (demarrageFini && vue === "horaire" && profil && !pop.classList.contains("visible") && !echeanceOuverte()) {
          try { rafraichirHoraireLocal(); } catch (e) { /* jetable */ }
        }
      }
      // Des lignes locales manquent au cloud (ajoutées hors ligne) : elles
      // partent maintenant, sinon les autres appareils les attendraient
      // jusqu'à la prochaine modification.
      var manque = false;
      for (var pid in tous) {
        if (!tous.hasOwnProperty(pid) || !connus[pid] || manque) continue;
        var parCle = tous[pid];
        for (var c2 in parCle) {
          if (!parCle.hasOwnProperty(c2) || manque) continue;
          var l2 = parCle[c2];
          if (!Array.isArray(l2)) continue;
          for (var k2 = 0; k2 < l2.length; k2++) {
            var e2 = l2[k2];
            if (e2 && e2.id && !vus[pid + "\n" + c2 + "\n" + e2.id] && !supprCouvre(file, pid, e2.id)) { manque = true; break; }
          }
        }
      }
      if (manque) pushEcheances().then(function () { /* jetable */ }, function () { /* réessaiera au prochain changement */ });
      return change;
    });
  }
  function jourEch(iso) {
    var p = String(iso || "").split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function isoEch(d) {
    var m = d.getMonth() + 1, j = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (j < 10 ? "0" : "") + j;
  }
  function heureEch(h) { return h ? fmtH(String(h).replace(":", "h")) : ""; }
  /* Toujours la date, jamais « demain » : le jour de la carte est déjà
     daté juste au-dessus, et une date reste vraie quelle que soit la
     semaine affichée. */
  function fmtDateEch(iso) {
    var d = jourEch(iso);
    if (isNaN(d.getTime())) return "";
    return JOURS_COURTS[d.getDay()] + " " + fmtDate(d);
  }
  function quandEch(e) {
    return fmtDateEch(e.date) + (e.heure ? " · " + heureEch(e.heure) : "");
  }
  function echPassee(e) {
    var auj = new Date();
    return jourEch(e.date).getTime() < new Date(auj.getFullYear(), auj.getMonth(), auj.getDate()).getTime();
  }
  /* Une échéance n'existe que le jour où elle est due : un devoir pour
     le 13/12 ne s'affiche que le 13/12, jamais sur les séances
     précédentes du même cours. Sans jour affiché, on ne filtre pas. */
  function echDuJour(e, dateJour) {
    if (!dateJour) return true;
    return !!e && memeJour(jourEch(e.date), dateJour);
  }
  function trierEcheances(liste) {
    return liste.slice().sort(function (a, b) {
      var ka = a.date + (a.heure || ""), kb = b.date + (b.heure || "");
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
  }
  var ICONE_CROIX = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var ICONE_CASE = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 13 4.5 4.5L19 7"/></svg>';
  var ICONE_CRAYON_ECH = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>';
  var ICONE_CORBEILLE_ECH = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 4h4M7 7l1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13"/></svg>';
  function itemEcheanceHTML(e, cleCours, dateJour, styleExtra, clsExtra) {
    var examen = e.type === "examen";
    var quand = (dateJour && memeJour(jourEch(e.date), dateJour)) ? heureEch(e.heure) : quandEch(e);
    var quoi = examen ? "l'examen" : "le devoir";
    var cls = "ech-item" + (echPassee(e) ? " passe" : "") + (clsExtra ? " " + clsExtra : "");
    var st = styleExtra ? ' style="' + styleExtra + '"' : "";
    return '<li class="' + cls + '" data-ech-id="' + txt(e.id) + '" data-ech-cle="' + txt(cleCours) + '"' + st + '>' +
      '<div class="ech-fond-modifier">' +
        '<button type="button" class="ech-action-btn btn-action-edit" data-ech-edit="' + txt(e.id) + '" aria-label="Modifier ' + quoi + ' : ' + txt(e.titre) + '" title="Modifier">' +
          ICONE_CRAYON_ECH +
          '<span class="btn-libelle-normal">Modifier</span>' +
          '<span class="btn-libelle-auto">Relâcher</span>' +
        '</button>' +
      '</div>' +
      '<div class="ech-fond-suppr">' +
        '<button type="button" class="ech-action-btn btn-action-del" data-ech-suppr="' + txt(e.id) + '" aria-label="Supprimer ' + quoi + ' : ' + txt(e.titre) + '" title="Supprimer">' +
          ICONE_CORBEILLE_ECH +
          '<span class="btn-libelle-normal">Suppr</span>' +
          '<span class="btn-libelle-auto">Relâcher</span>' +
        '</button>' +
      '</div>' +
      '<div class="ech' + (echNeuf === e.id ? " neuf" : "") + '" data-ech-cle="' + txt(cleCours) + '" data-ech-id="' + txt(e.id) + '">' +
        '<button type="button" class="ech-ouvrir" aria-expanded="false" aria-label="Options : ' + quoi + ' — ' + txt(e.titre) + '" title="Afficher les options">' +
          '<span class="ech-type ' + (examen ? "examen" : "devoir") + '">' + (examen ? "Examen" : "Devoir") + "</span>" +
          '<span class="ech-corps"><span class="ech-titre' + (e.fait ? " fait" : "") + '"><span class="ech-titre-txt">' + txt(e.titre) + "</span></span>" +
          (quand ? '<span class="ech-quand">' + txt(quand) + "</span>" : "") + "</span>" +
        "</button>" +
        '<button type="button" class="ech-valide' + (e.fait ? " fait" : "") + '" data-ech-valide="' + txt(e.id) +
        '" role="checkbox" aria-checked="' + (e.fait ? "true" : "false") + '" aria-label="' +
        (e.fait ? "Ne plus valider " : "Valider ") + quoi + " : " + txt(e.titre) + '" title="' +
        (e.fait ? "Annuler" : "C’est fait") + '">' + ICONE_CASE + "</button>" +
      "</div></li>";
  }
  function listeEcheancesHTML(liste, cleCours, dateJour) {
    var items = trierEcheances(liste).filter(function (e) { return echDuJour(e, dateJour); });
    if (!items.length) return "";
    var html = '<ul class="ech-liste">';
    for (var i = 0; i < items.length; i++) {
      html += itemEcheanceHTML(items[i], cleCours, dateJour);
    }
    return html + "</ul>";
  }
  /* Résumé des échéances à venir d'un cours : le type de la prochaine
     (+ le nombre d'autres). Sert d'étiquette sur téléphone et de pastille
     dans la grille du grand écran. */
  function resumeEcheances(c) {
    var dateJour = dateSemJour(sem, c.jour);
    var liste = trierEcheances(echeancesDe(c).filter(function (e) {
      return !echPassee(e) && echDuJour(e, dateJour);
    }));
    if (!liste.length) return null;
    var examen = liste[0].type === "examen";
    var texte = examen ? "Examen" : "Devoir";
    if (liste.length > 1) texte += " +" + (liste.length - 1);
    return { texte: texte, examen: examen, nombre: liste.length };
  }
  function tagEcheances(c) {
    var r = resumeEcheances(c);
    if (!r) return "";
    return '<span class="ech-tag" style="--c:' + (r.examen ? "var(--examen)" : "var(--accent)") + '">' +
      txt(r.texte) + "</span>";
  }
  /* Grille du grand écran : une échéance qui tombe pendant un cours vit à
     l'intérieur de ce cours — pastille dans la case, détail dans la bulle —
     au lieu d'une fiche flottante qui recouvrirait la case. Trois cas :
     1. avec heure pendant un cours : ce cours (la même règle qu'à la
        création, voir coursDeLHeure) ;
     2. avec heure dans une pause : le cours le plus proche (le plus tôt
        en cas d'égalité), dans la limite ci-dessous — une fiche étant bien
        plus haute qu'une pause, elle recouvrirait sinon un cours voisin ;
     3. sans heure mais rattachée à un cours affiché ce jour-là : son
        propre cours (elle n'a pas d'autre moment où exister).
     Le reste (jour sans cours, heure en dehors des cours et loin d'eux)
     garde ses fiches, qui ne recouvrent alors rien. */
  var ECART_MAX_PAUSE = 30; // minutes : au-delà, la fiche flotte dans le vide
  function hoteHeure(e, coursJour, date) {
    if (!e || !e.id || !e.heure || !memeJour(jourEch(e.date), date)) return null;
    var h = mins(e.heure);
    if (isNaN(h) || !Array.isArray(coursJour) || !coursJour.length) return null;
    var pendant = coursDeLHeure(coursJour, h);
    if (pendant) return pendant;
    var meilleur = null, ecartMin = ECART_MAX_PAUSE + 1;
    for (var i = 0; i < coursJour.length; i++) {
      var c = coursJour[i];
      if (!c || !c.debut || !c.fin) continue;
      var ecart = Math.min(Math.abs(h - mins(c.debut)), Math.abs(h - mins(c.fin)));
      if (ecart < ecartMin) { ecartMin = ecart; meilleur = c; }
    }
    return ecartMin <= ECART_MAX_PAUSE ? meilleur : null;
  }
  /* Tout ce que la grille montre pour un cours : ses propres échéances,
     plus celles qu'il héberge (voir ci-dessus). Chacune garde sa clé
     d'origine : modifier / supprimer / valider doit retrouver le bon
     rangement (voir cibleDeCle). */
  function echeancesAfficheesCours(c, date) {
    var jour = c.jour, coursJour = coursDe(sem, jour);
    var dateJ = date || dateSemJour(sem, jour);
    var toutes = [], vus = {};
    function ajouter(e, cle) {
      if (!e || !e.id || vus[e.id]) return;
      vus[e.id] = true;
      toutes.push({ e: e, cle: cle });
    }
    var cleC = cleRenduCours(c);
    echeancesDe(c).forEach(function (e) { ajouter(e, cleC); });
    echeancesJour(jour).forEach(function (e) {
      if (hoteHeure(e, coursJour, dateJ) === c) ajouter(e, cleJourEch(jour));
    });
    coursJour.forEach(function (o) {
      if (o === c) return;
      var cleO = cleRenduCours(o);
      echeancesDe(o).forEach(function (e) {
        if (hoteHeure(e, coursJour, dateJ) === c) ajouter(e, cleO);
      });
    });
    return toutes;
  }
  /* Pastille d'un cours dans la grille : ses échéances plus celles qu'il
     héberge (même présentation que resumeEcheances). */
  function etiquetteEcheances(liste) {
    if (!liste.length) return null;
    var examen = liste[0].type === "examen";
    var texte = examen ? "Examen" : "Devoir";
    if (liste.length > 1) texte += " +" + (liste.length - 1);
    return { texte: texte, examen: examen, nombre: liste.length };
  }
  function resumeEcheancesDedans(c, date) {
    var dateJ = date || dateSemJour(sem, c.jour);
    var liste = trierEcheances(echeancesAfficheesCours(c, dateJ).map(function (x) { return x.e; }).filter(function (e) {
      return !echPassee(e) && echDuJour(e, dateJ);
    }));
    return etiquetteEcheances(liste);
  }
  /* Même liste que listeEcheancesHTML, mais chaque échéance garde sa
     propre clé (indispensable quand la bulle d'un cours montre aussi des
     échéances posées sur la journée ou sur un autre cours). */
  function listeEcheancesCles(lignes, dateJour) {
    var items = lignes.filter(function (x) { return x && x.e && echDuJour(x.e, dateJour); });
    items.sort(function (a, b) {
      var ka = a.e.date + (a.e.heure || ""), kb = b.e.date + (b.e.heure || "");
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    if (!items.length) return "";
    var html = '<ul class="ech-liste">';
    for (var i = 0; i < items.length; i++) {
      html += itemEcheanceHTML(items[i].e, items[i].cle, dateJour);
    }
    return html + "</ul>";
  }
  /* Maquettes ?maquette=1..5 (temporaire) : les échéances « flottantes »
     du jour — jour ET cours affichés, à la date du jour, moins celles
     qu'un cours héberge. Avec, pour les cours, le cours d'origine. */
  function flottantesJour(d, date) {
    var flottantes = [], vus = {};
    echeancesJour(d.j).forEach(function (e) {
      if (e && e.id && !vus[e.id] && memeJour(jourEch(e.date), date)) {
        vus[e.id] = true;
        flottantes.push({ e: e, cle: cleJourEch(d.j), chez: null });
      }
    });
    d.cours.forEach(function (c) {
      var cleC = cleRenduCours(c);
      echeancesDe(c).forEach(function (e) {
        if (e && e.id && !vus[e.id] && memeJour(jourEch(e.date), date)) {
          vus[e.id] = true;
          flottantes.push({ e: e, cle: cleC, chez: c });
        }
      });
    });
    return flottantes.filter(function (x) {
      if (x.e.heure) return !hoteHeure(x.e, d.cours, date);
      return !x.chez;
    });
  }
  /* Tri d'affichage des flottantes : à heure d'abord (par heure), puis
     sans heure. */
  function trierFlottantes(liste) {
    return liste.slice().sort(function (a, b) {
      var ha = a.e.heure || "", hb = b.e.heure || "";
      if (!ha && hb) return 1;
      if (ha && !hb) return -1;
      if (ha !== hb) return ha < hb ? -1 : 1;
      return 0;
    });
  }
  /* Résumé des échéances d'un jour replié : celles posées sur la journée
     (« à une autre heure », clé « jour|| ») ET celles de chaque cours du
     jour. Avant, seul pseudoJour(j) était regardé : un devoir posé sur un
     cours n'apparaissait qu'une fois le jour déroulé. `dateJour` permet de
     viser une occurrence précise hors de la semaine affichée (recherche). */
  function resumeEcheancesJour(jour, listeCours, dateJour) {
    dateJour = dateJour || dateSemJour(sem, jour);
    var toutes = echeancesJour(jour).slice();
    (listeCours || []).forEach(function (c) {
      var l = echeancesDe(c);
      for (var i = 0; i < l.length; i++) toutes.push(l[i]);
    });
    var liste = trierEcheances(toutes.filter(function (e) {
      return !echPassee(e) && echDuJour(e, dateJour);
    }));
    var devoir = false, examen = false;
    liste.forEach(function (e) {
      if (e.type === "examen") examen = true;
      else devoir = true;
    });
    return { devoir: devoir, examen: examen, total: liste.length };
  }
  function slotsEcheancesJour(jour, listeCours, dateJour) {
    var r = resumeEcheancesJour(jour, listeCours, dateJour);
    var g = (r && r.examen)
      ? '<span class="day-ech-slot"><span class="day-ech examen">Examen</span></span>'
      : '<span class="day-ech-slot" aria-hidden="true"></span>';
    var d = (r && r.devoir)
      ? '<span class="day-ech-slot"><span class="day-ech devoir">Devoir</span></span>'
      : '<span class="day-ech-slot" aria-hidden="true"></span>';
    return { gauche: g, droite: d };
  }

  /* Pastilles D / E d'un cours : une par type d'échéance en attente
     (devoir couleur du thème, examen complémentaire du thème), empilées. Elles remplacent la flèche :
     un cours ne s'ouvre que s'il a quelque chose à montrer. */
  function marquesHTML(liste, dateJour) {
    var actives = (liste || []).filter(function (e) {
      return !echPassee(e) && echDuJour(e, dateJour);
    });
    var devoir = false, examen = false;
    actives.forEach(function (e) { if (e.type === "examen") examen = true; else devoir = true; });
    if (!devoir && !examen) return "";
    var dit = devoir && examen ? "Un devoir et un examen en attente"
            : examen ? "Un examen en attente" : "Un devoir en attente";
    return '<span class="marques" role="img" aria-label="' + txt(dit) + '">' +
      (devoir ? '<span class="ebadge"><span>D</span></span>' : "") +
      (examen ? '<span class="ebadge" style="--c:var(--examen)"><span>E</span></span>' : "") +
      "</span>";
  }
  function marquesEcheances(c) {
    return marquesHTML(echeancesDe(c), dateSemJour(sem, c.jour));
  }
  function marquesEcheancesJour(jour) {
    return marquesHTML(echeancesJour(jour), dateSemJour(sem, jour));
  }
  /* Ligne de la salle : présente dès l'état replié (nom court de la salle)
     et reste stable à l'ouverture pendant que « Salle : » glisse à sa gauche. */
  function salleCoursHTML(c) {
    if (!c.salles) return "";
    return '<span class="cinfo-salle"><span class="k">Salle :</span><span class="s">' +
      txt(c.salles.replace(/, ([^,]*)$/, " et $1")) + "</span></span>";
  }

  /* Infos détaillées du cours (prof, groupe, source) : s'ouvrent en
     accordéon sous le titre et la salle. */
  function infosCoursHTML(c) {
    var sub = "";
    if (c.profs) sub += '<span class="cinfo-row"><span class="k">Prof : </span>' + txt(c.profs) + "</span>";
    if (c.groupes.length && groupesChoisisDe(c).length !== 1) {
      sub += '<span class="cinfo-row"><span class="k">Groupe : </span>' + txt(c.groupes.map(nomGroupe).join(", ")) + "</span>";
    }
    if (DATA.perso) {
      var noms = (c.srcs || [c.src]).map(function (i) { return nomSource(profil.sources[i]); }).filter(Boolean);
      if (noms.length) sub += '<span class="cinfo-row src"><span class="k">Source : </span>' + txt(noms.join(" et ")) + "</span>";
    }
    return sub ? '<span class="cinfos"><span>' + sub + "</span></span>" : "";
  }

  function detailJour(cours, jour) {
    var html = '<div><div class="box"><ol>';
    var dateJour = dateSemJour(sem, jour);
    for (var i = 0; i < cours.length; i++) {
      var c = cours[i];
      var cle = jour + ":" + i;
      var salle = salleCoursHTML(c);
      var infos = infosCoursHTML(c);
      var ech = listeEcheancesHTML(echeancesDe(c), cle, dateJour);
      var marques = marquesEcheances(c);
      // Cours en conflit : le point devient un gant de boxe (couleur du
      // cours), pointé vers l'autre cours en conflit.
      var choc = enConflit(c, sem);
      // Déroulable dès qu'il y a des infos détaillées (salle, prof...) ou des échéances
      var deroulable = !!salle || !!infos || !!ech;
      // Un seul cours dans le jour : déroulé d'office et non refermable
      // (le clic ne rebascule pas — voir le gestionnaire des jours). Pas de
      // `disabled` : il couperait aussi les clics sur la pastille-loupe.
      var seul = cours.length === 1 && deroulable;
      var estOuvert = seul || !!coursOuverts[cle];
      html += '<li class="c' + (estOuvert ? " open" : "") + (seul ? " seul" : "") + '">';
      html += '<button class="cbtn' + (deroulable ? "" : " inactif") + '" data-cle="' + cle + '"' +
              (deroulable ? ' aria-expanded="' + estOuvert + '"' : ' aria-disabled="true"') +
              ">" +
              '<span class="hcol"><span class="h">' + txt(fmtH(c.debut)) + '</span><span class="h">' + txt(fmtH(c.fin)) + "</span></span>" +
              /* `data-rech` : la pastille-bouton — le point, ou le gant en
                 cas de conflit — ouvre l'horaire du cours (toutes ses
                 séances, voir le clic des jours) ; le reste de la ligne
                 ouvre le détail. */
              '<span class="cpoint' + (choc ? " choc-cours" + dirChoc(cours, i) : "") + '"' +
              ' data-rech="' + txt(c.matiere) + '"' +
              ' style="' + styleCours(c.matiere) + '" aria-hidden="true">' + (choc ? ICONE_GANT : "") + "</span>" +
              '<span class="ctxt"><span class="m">' + txt(nettoyerMatiere(c.matiere || "Cours")) + "</span>" +
              salle +
              infos +
              "</span>" +
              marques +
              "</button>";
      if (ech) {
        html += '<div class="csub"><div><div class="fiches">' + ech + '</div></div></div>';
      }
      html += "</li>";
      if (i < cours.length - 1) {
        var p = pauseEntre(c.fin, cours[i + 1].debut);
        if (p) html += '<li class="p">' + p + "</li>";
      }
    }
    html += "</ol></div>"; // fin de la boîte des cours

    // Devoirs et examens en dehors des heures de cours : section « Soir »
    // déroulante à part.
    var echJour = listeEcheancesHTML(echeancesJour(jour), cleJourEch(jour), dateJour);
    if (echJour) {
      var suppEstOuvert = !!suppOuverts[jour];
      var marquesSupp = marquesEcheancesJour(jour);
      html += '<div class="box box-supp' + (suppEstOuvert ? " open" : "") + '" data-supp-jour="' + jour + '">' +
        '<button type="button" class="supp-btn" data-supp-jour="' + jour + '" aria-expanded="' + suppEstOuvert + '" ' +
        'aria-label="Afficher les devoirs et examens hors cours">' +
        '<span class="supp-titre">Soir</span>' +
        marquesSupp +
        '<span class="chev" aria-hidden="true"></span>' +
        '</button>' +
        '<div class="supp-sub"><div><div class="fiches">' + echJour + '</div></div></div>' +
        '</div>';
    }
    // Bouton « Échéance » sous la boîte, à droite : il ouvre le choix du
    // cours (ou « à une autre heure ») pour poser un devoir ou un examen.
    html += '<div class="jour-ech">' +
      '<button type="button" class="jour-ech-btn" data-ech-jour="' + jour + '" ' +
      'aria-label="Ajouter un devoir ou un examen à un cours de ce jour" title="Ajouter un devoir ou un examen">' +
      "<span>Échéance</span></button></div>";
    return html + "</div>";
  }

  /* Jour sans cours (férié, libre) : la même zone d'échéances, sans cours
     au-dessus — le bouton « Échéance » sous le bloc est le seul point
     d'entrée de ce jour-là. */
  function detailJourVide(jour) {
    var cle = cleJourEch(jour);
    var ech = listeEcheancesHTML(echeancesJour(jour), cle, dateSemJour(sem, jour));
    var quoi = estFerie(sem, jour)
      ? "Jour férié" + (FERIES_NOMS[numJour(sem, jour)] ? " — " + txt(FERIES_NOMS[numJour(sem, jour)]) : "") + "."
      : "Aucun cours ce jour-là.";
    return '<div><div class="box box-jour"><div class="csub-in sans-ajout">' +
      '<div class="infos jour-creux"><div>' + quoi + "</div></div>" +
      ech +
      "</div></div>" +
      '<div class="jour-ech">' +
      '<button type="button" class="ech-add" data-ech-cible="' + txt(cle) + '" ' +
      'aria-label="Ajouter un devoir ou un examen à ce jour" title="Ajouter un devoir ou un examen">' +
      "<span>Échéance</span></button></div>" +
      "</div>";
  }

  function rendre(garderPop) {
    if (!SEMAINES.length) {
      document.getElementById("horaire-contenu").hidden = true;
      rendreSemaines();
      erreur(document.getElementById("horaire-status"), "L'école n'a encore publié aucune semaine pour cette formation.");
      rendreInfos();
      return;
    }
    // Groupes choisis qui n'existent plus chez l'école : on prévient.
    var perdus = DATA.perso ? [] : profil.groupes.filter(function (g) { return !groupeDans(DATA.groupes, g); });
    var avis = document.getElementById("avis");
    avis.hidden = !perdus.length;
    if (DATA.perso) rendreAvisPerso(avis);
    rendreSemaines();
    if (perdus.length) {
      avis.innerHTML = (perdus.length === profil.groupes.length
        ? "Tes groupes n'apparaissent plus dans l'horaire de l'école."
        : "Certains de tes groupes n'apparaissent plus dans l'horaire de l'école (" +
          txt(perdus.map(nomGroupe).join(", ")) + ").") +
        ' <button type="button" id="btn-avis">Rechoisir</button>';
      document.getElementById("btn-avis").addEventListener("click", function () { changerGroupe(profil.id); });
    }

    var i = SEMAINES.indexOf(sem);
    document.getElementById("sem-titre").textContent = "Semaine " + sem;
    document.getElementById("sem-dates").textContent = datesSemaine(sem);
    // La visionneuse PDF sous le bouton est conservée telle quelle
    // (un dépliage de jour ne doit pas la refermer).
    majBoutonPdf();
    document.getElementById("sem-prec").disabled = i <= 0;
    document.getElementById("sem-suiv").disabled = i >= SEMAINES.length - 1;
    document.getElementById("btn-auj").classList.toggle("cache", sem === semaineCourante());

    var auj = new Date();
    var html = "", vide = true, conge = true, surPC = bureau();
    for (var j = 0; j < 7; j++) {
      var liste = coursDe(sem, j);
      if (liste.length) vide = false;
      if (j < 5 && !estFerie(sem, j)) conge = false;
      if (j >= 5 && !liste.length && !echeancesJour(j).some(function (e) { return memeJour(jourEch(e.date), dateSemJour(sem, j)); })) continue; // samedi/dimanche : seulement s'il y a cours ou échéance
      if (surPC) continue; // liste masquée sur ordinateur : rien à construire
      var date = dateSemJour(sem, j);
      var estAuj = memeJour(date, auj);
      var resume = liste.length
        ? '<span class="dsum busy">' + fmtH(liste[0].debut) + " → " +
          fmtH(liste.reduce(function (m, c) { return c.fin > m ? c.fin : m; }, liste[0].fin)) + "</span>"
        : (estFerie(sem, j)
            ? '<span class="dsum free ferie" title="' + txt(nomFerie(sem, j)) + '">' + txt(nomFerie(sem, j)) + "</span>"
            : '<span class="dsum free">Libre</span>');
      var chocJour = liste.some(function (c) { return enConflit(c, sem); });
      var ech = slotsEcheancesJour(j, liste);
      html += '<li class="day' + (estAuj ? " today" : "") + (joursOuverts[j] ? " open" : "") + '">' +
        '<button data-jour="' + j + '" aria-expanded="' + (!!joursOuverts[j]) + '">' +
        ech.gauche +
        '<span class="dname"><strong>' + JOURS[j] + "</strong>" +
        '<span class="ddate">' + fmtDate(date) + "</span></span>" +
        (chocJour ? '<span class="choc-icone" role="img" aria-label="Conflit"' + couleursChoc(liste) + ">" + ICONE_CONFLIT + "</span>" : "") +
        resume + ech.droite + '</button>' +
        '<div class="detail">' +
        (liste.length ? detailJour(liste, j) : detailJourVide(j)) +
        "</div></li>";
    }
    if (!surPC) {
      var nomsConge = [];
      if (conge) {
        for (var n2 = 0; n2 < 5; n2++) {
          var nomF = estFerie(sem, n2) && FERIES_NOMS[numJour(sem, n2)];
          if (nomF && nomsConge.indexOf(nomF) < 0) nomsConge.push(nomF);
        }
      }
      var msgVide = vide
        ? '<li class="empty semaine-vide">' + (SEMAINES.indexOf(sem) < 0
            ? "Semaine non publiée par l'école (congés ?)."
            : (conge ? "Semaine de congé" + (nomsConge.length ? " — " + txt(nomsConge.join(", ")) : "") + "."
                     : "Aucun cours cette semaine.")) + "</li>"
        : "";
      document.getElementById("jours").innerHTML = msgVide + html;
    }
    // Chaque vue ne construit que ce qu'elle affiche : la grille sur
    // ordinateur, la liste de jours sur téléphone (voir le CSS).
    if (surPC) rendreCal(garderPop);
    rendreInfos();
  }

  /* Horaire sur mesure : ce qui ne va pas, source par source (école en
     panne, groupes ou cours disparus, horaire d'une autre année). */
  function rendreAvisPerso(avis) {
    var inf = DATA.infos || {}, lignes = [];
    function nom(i) { return "« " + txt(nomSource(profil.sources[i])) + " »"; }
    (inf.manquantes || []).forEach(function (i) {
      lignes.push("L'horaire de " + nom(i) + " n'a pas pu être chargé : ses cours manquent. " +
        '<button type="button" data-avis="reessayer">Réessayer</button>');
    });
    (inf.ecartees || []).forEach(function (i) {
      lignes.push(nom(i) + " n'est pas l'horaire de cette année : il n'est pas affiché. " +
        '<button type="button" data-avis="modifier">Modifier</button>');
    });
    (inf.perdus || []).forEach(function (x) {
      lignes.push("Certains groupes de " + nom(x.i) + " n'apparaissent plus (" +
        txt(x.groupes.map(nomGroupe).join(", ")) + "). " +
        '<button type="button" data-avis="source" data-src="' + x.i + '">Rechoisir</button>');
    });
    (inf.disparus || []).forEach(function (x) {
      var noms = x.cles.map(function (k) { return "« " + txt(nettoyerMatiere(k)) + " »"; });
      lignes.push((noms.length > 1 ? "Les cours " + noms.join(", ") + " n'apparaissent" : "Le cours " + noms[0] + " n'apparaît") +
        " plus dans " + nom(x.i) + ". " +
        '<button type="button" data-avis="source" data-src="' + x.i + '">Rechoisir les cours</button>');
    });
    if (inf.horsLigneKo) lignes.push("Mémoire de l'appareil pleine : cet horaire ne sera pas disponible hors ligne.");
    avis.hidden = !lignes.length;
    avis.innerHTML = lignes.map(function (l) { return "<p>" + l + "</p>"; }).join("");
  }
  document.getElementById("avis").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-avis]");
    if (!b || !profil || !estPerso(profil)) return;
    var act = b.getAttribute("data-avis");
    if (act === "reessayer") {
      b.disabled = true;
      actualiser().catch(function () { b.disabled = false; });
    } else if (act === "modifier") {
      modifierPerso(profil.id);
    } else if (act === "source") {
      modifierPerso(profil.id, +b.getAttribute("data-src"));
    }
  });
  /* Bandeau « nouvelles semaines » : l'école a allongé sa période depuis
     la dernière visite. Un horaire normal les affiche déjà ; un horaire
     sur mesure aussi, mais ses années d'ajout ne se complètent pas toutes
     seules (la sélection `avec` est figée au moment du choix) : on invite
     donc à rouvrir le composeur. */
  function semainesEnClair(nombres) {
    var t = nombres.slice().sort(function (a, b) { return a - b; });
    var morceaux = [], i = 0;
    while (i < t.length) {
      var j = i;
      while (j + 1 < t.length && t[j + 1] === t[j] + 1) j++;
      morceaux.push(j > i ? t[i] + " à " + t[j] : String(t[i]));
      i = j + 1;
    }
    if (morceaux.length < 2) return morceaux[0] || "";
    return morceaux.slice(0, -1).join(", ") + " et " + morceaux[morceaux.length - 1];
  }
  function rendreSemaines() {
    var zone = document.getElementById("semaines-avis");
    if (!zone) return;
    var nouv = NOUVELLES_SEMAINES;
    if (!nouv.length || !DATA || !profil || vue !== "horaire") {
      zone.hidden = true;
      zone.innerHTML = "";
      return;
    }
    var singulier = nouv.length === 1;
    var quand = (singulier ? "la semaine " : "les semaines ") + semainesEnClair(nouv);
    var texte;
    if (estPerso(profil)) {
      var ajouts = profil.sources.filter(function (s) {
        return s.role !== "principale" && !FUSION.estParcours(s);
      });
      texte = "L'école a publié " + quand + ". Ton horaire sur mesure les affiche déjà.";
      if (ajouts.length) {
        var noms = ajouts.slice(0, 2).map(function (s) { return "« " + txt(nomSource(s)) + " »"; });
        texte += " Les cours que tu as cochés dans " + noms.join(" et ") +
          (ajouts.length > 2 ? " (entre autres)" : "") +
          " ne se complètent pas tout seuls : vérifie s'il y a de nouvelles matières à ajouter.";
      }
    } else {
      texte = "L'école a publié " + quand + ". Ton horaire les affiche déjà. " +
        "Un cours d'une autre année à ajouter ? C'est le moment de composer un horaire sur mesure.";
    }
    zone.innerHTML = ICONE_CALENDRIER + "<div><strong>" +
      txt(singulier ? "Nouvelle semaine disponible" : "Nouvelles semaines disponibles") + "</strong>" +
      "<p>" + texte + ' <button type="button" data-sem="voir">Voir la semaine ' + nouv[0] + "</button> · " +
      (estPerso(profil)
        ? '<button type="button" data-sem="modifier">Modifier mon horaire</button>'
        : '<button type="button" data-sem="composer">Composer un horaire sur mesure</button>') +
      ' · <button type="button" data-sem="ok">OK</button></p></div>';
    zone.hidden = false;
  }
  document.getElementById("semaines-avis").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-sem]");
    if (!b || !profil || !NOUVELLES_SEMAINES.length) return;
    var act = b.getAttribute("data-sem");
    var premiere = NOUVELLES_SEMAINES[0];
    NOUVELLES_SEMAINES = []; // l'alerte est déjà consommée (voir installer)
    delete ALERTES_SEMAINES[profil.id]; // ne revient pas dans cette visite
    rendreSeg(); // la pastille de l'onglet part avec le bandeau
    if (act === "voir") {
      if (SEMAINES.indexOf(premiere) >= 0) { sem = premiere; semaineAuto = false; }
      rendre();
      var w = document.querySelector(".week");
      if (w && w.scrollIntoView) w.scrollIntoView({ block: "start", behavior: sansAnim ? "auto" : "smooth" });
    } else if (act === "modifier") {
      modifierPerso(profil.id);
    } else if (act === "composer") {
      demarrerPerso();
    } else {
      rendre();
    }
  });
  var ICONE_ATTENTION = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5 2.8 19.5a1.5 1.5 0 0 0 1.3 2.2h15.8a1.5 1.5 0 0 0 1.3-2.2z"/>' +
    '<path d="M12 9.5v5M12 18h.01"/></svg>';
  var ICONE_OK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16 10"/></svg>';
  document.getElementById("chocs").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-voir-jour]");
    if (!b) return;
    basculerJour(+b.getAttribute("data-voir-jour"), true);
  });

  /* ---------- Grille de la semaine (ordinateur) ----------
     Chaque cours est placé selon ses heures ; la journée tient dans la
     hauteur de l'écran. Couleur stable par matière. Les cours qui se
     chevauchent (plusieurs groupes) se partagent la largeur. */
  /* Couleurs des cours : un intitulé = une couleur, et deux intitulés
     différents n'ont jamais la même. Les matières de la formation sont
     triées par ordre alphabétique (donc stable d'une semaine à l'autre)
     puis réparties sur la palette ; au-delà de la palette, chaque teinte
     se décline en variantes plus ou moins sourdes (--v), et enfin en
     teintes légèrement décalées. Le rendu reste sobre : fond mat teinté,
     texte neutre. */
  var TEINTES = [221, 152, 332, 40, 262, 190, 18, 292, 204, 96, 350, 172];
  var COULEURS = {};
  function preparerCouleurs(cours) {
    var noms = [], vu = {};
    (cours || []).forEach(function (c) {
      var n = String(c.matiere || "Cours");
      if (!vu[n]) { vu[n] = true; noms.push(n); }
    });
    noms.sort(function (a, b) { return a.localeCompare(b, "fr"); });
    COULEURS = {};
    noms.forEach(function (n, i) {
      var tour = Math.floor(i / TEINTES.length);
      COULEURS[n] = {
        h: (TEINTES[i % TEINTES.length] + Math.floor(tour / 3) * 7) % 360,
        v: tour % 3
      };
    });
  }
  function couleurCours(nom) {
    return COULEURS[String(nom || "Cours")] || { h: 221, v: 0 };
  }
  function styleCours(nom) {
    var t = couleurCours(nom);
    return "--h:" + t.h + ";--v:" + t.v;
  }
  function couloirs(liste) {
    var res = [], bloc = [], finBloc = -1, fins = [];
    function clore() { bloc.forEach(function (x) { x.n = fins.length; }); bloc = []; fins = []; finBloc = -1; }
    liste.forEach(function (c) {
      var a = mins(c.debut), b = mins(c.fin);
      if (bloc.length && a >= finBloc) clore();
      var k = 0;
      while (k < fins.length && fins[k] > a) k++;
      fins[k] = b;
      var x = { c: c, k: k };
      bloc.push(x); res.push(x);
      finBloc = Math.max(finBloc, b);
    });
    clore();
    return res;
  }
  var evCal = [];
  function rendreCal(garderPop) {
    if (!garderPop) fermerPop();
    var jours = [], debut = 8 * 60, fin = 18 * 60;
    // Une longue séance du soir (UMONS : « événement » jusqu'à 22h15)
    // étirerait la grille et écraserait toutes les cases de la semaine :
    // au-delà de 20h, seule l'heure qui suit son début compte ; la case est
    // alors coupée en bas (heures réelles écrites dedans).
    var PLAFOND = 20 * 60;
    for (var j = 0; j < 7; j++) {
      var l = coursDe(sem, j);
      if (j >= 5 && !l.length && !echeancesJour(j).some(function (e) { return memeJour(jourEch(e.date), dateSemJour(sem, j)); })) continue; // samedi/dimanche : seulement s'il y a cours ou échéance
      jours.push({ j: j, cours: l });
      l.forEach(function (c) {
        debut = Math.min(debut, mins(c.debut));
        fin = Math.max(fin, Math.min(mins(c.fin), Math.max(mins(c.debut) + 60, PLAFOND)));
      });
    }
    debut = Math.floor(debut / 60) * 60;
    fin = Math.ceil(fin / 60) * 60;
    var duree = fin - debut;
    function pc(m) { return (m - debut) / duree * 100; }
    var auj = new Date();
    evCal = [];
    var soir = []; // bande du soir : flottantes par jour, dans l'ordre des colonnes
    var tete = "<div></div>", corps = '<div class="cal-heures" aria-hidden="true">';
    for (var h = debut / 60; h <= fin / 60; h++) corps += '<span style="top:' + pc(h * 60) + '%">' + h + "h</span>";
    corps += "</div>";
    jours.forEach(function (d) {
      var date = dateSemJour(sem, d.j), estAuj = memeJour(date, auj);
      var echsUniques = flottantesJour(d, date);
      // Bande SOIR (voir plus bas) : les flottantes qui dépassent la fin
      // des cours — à heure après le dernier cours du jour (ou après la
      // fin de grille sans cours), ou sans heure un jour de cours. Le
      // reste garde ses fiches classiques.
      var finJour = d.cours.length ? 0 : fin;
      d.cours.forEach(function (c) { finJour = Math.max(finJour, mins(c.fin)); });
      var auSoir = [], enColonne = [];
      echsUniques.forEach(function (x) {
        var h = x.e.heure ? mins(x.e.heure) : NaN;
        if ((!x.e.heure && d.cours.length) || (x.e.heure && !(h <= finJour))) auSoir.push(x);
        else enColonne.push(x);
      });
      echsUniques = enColonne;
      soir.push({ jour: d.j, lignes: trierFlottantes(auSoir) });
      var resume = d.cours.length
        ? "<small>" + fmtH(d.cours[0].debut) + " – " +
          fmtH(d.cours.reduce(function (m, c) { return c.fin > m ? c.fin : m; }, d.cours[0].fin)) + "</small>"
        : (estFerie(sem, d.j)
            ? '<small class="libre ferie" title="' + txt(nomFerie(sem, d.j)) + '">' + txt(nomFerie(sem, d.j)) + "</small>"
            : '<small class="libre">Libre</small>');
      tete += '<div class="cal-jour' + (estAuj ? " today" : "") + '" title="' + JOURS[d.j] + " " + fmtDate(date) + '">' +
              "<span>" + JOURS[d.j].slice(0, 3) + "</span><strong>" + date.getDate() + "</strong>" + resume + "</div>";
      corps += '<div class="cal-col' + (estAuj ? " today" : "") + '">' +
        '<button type="button" class="cal-col-depot' + (estAuj ? " today" : "") + '" data-ech-col="' + d.j + '" ' +
        'aria-label="Ajouter une échéance pour ' + JOURS[d.j] + ' ' + fmtDate(date) + '">' +
        '<span class="cal-col-depot-cadre"></span>' +
        '</button>';
      if (!d.cours.length) {
        var aDesEchs = echsUniques.length > 0;
        corps += '<div class="cal-libre' + (estFerie(sem, d.j) ? " ferie" : "") + '"' +
          (estFerie(sem, d.j) ? ' title="' + txt(nomFerie(sem, d.j)) + '"' : "") + ">" +
          '<div class="libre-boite">' +
          (aDesEchs ? "" : "<p><strong>" + (estFerie(sem, d.j) ? txt(nomFerie(sem, d.j)) : "Pas de cours") + "</strong></p>") +
          "</div></div>";
      }
      var echsHeure = [], echsBas = [];
      echsUniques.forEach(function (x) {
        if (!x.e.heure) {
          echsBas.push(x);
        } else {
          var hm = mins(x.e.heure);
          if (hm >= fin || pc(hm) > 91) {
            echsBas.push(x);
          } else {
            echsHeure.push(x);
          }
        }
      });
      echsHeure.sort(function (a, b) { return mins(a.e.heure) - mins(b.e.heure); });
      echsHeure.forEach(function (x) {
        var hm = mins(x.e.heure);
        var topPct = Math.max(0, Math.min(91, pc(hm)));
        var st = "position:absolute;top:calc(" + topPct + "% + 1px);left:1px;width:calc(100% - 3px);z-index:3;";
        corps += itemEcheanceHTML(x.e, x.cle, date, st, "cal-ech-item");
      });
      echsBas.forEach(function (x, ib) {
        var bottomPx = ib * 56 + 4;
        var st = "position:absolute;bottom:" + bottomPx + "px;left:1px;width:calc(100% - 3px);z-index:3;";
        corps += itemEcheanceHTML(x.e, x.cle, date, st, "cal-ech-item en-bas");
      });
      couloirs(d.cours).forEach(function (x) {
        var c = x.c, a = mins(c.debut), b = Math.min(mins(c.fin), fin);
        var i = evCal.push(c) - 1;
        var rEch = resumeEcheancesDedans(c, date);
        corps += '<button type="button" class="ev' + (b - a < 75 ? " court" : "") +
          (mins(c.fin) > fin ? " coupe" : "") + '" data-ev="' + i + '"' +
          ' style="' + styleCours(c.matiere) + ";--t:" + pc(a) + ";--d:" + (pc(b) - pc(a)) +
          ";--l:" + (x.k / x.n) + ";--w:" + (1 / x.n) + '">' +
          '<span class="et">' + txt(nettoyerMatiere(c.matiere || "Cours")) + "</span>" +
          (c.salles ? '<span class="es"><span>' + txt(c.salles) + "</span></span>" : "") +
          '<span class="eb">' +
          '<span class="eh">' + fmtH(c.debut) + " – " + fmtH(c.fin) + "</span>" +
          (rEch ? '<span class="ev-ech" title="' + txt(rEch.texte + " — voir le détail") + '">' +
            txt(rEch.texte) + "</span>" : "") + "</span></button>";
      });
      corps += "</div>";
    });
    var cal = document.getElementById("cal");
    cal.style.setProperty("--n", jours.length);
    var colsVal = jours.map(function (d) {
      return memeJour(dateSemJour(sem, d.j), auj) ? "minmax(0, 1.12fr)" : "minmax(0, 1fr)";
    }).join(" ");
    cal.style.setProperty("--cols", colsVal);
    cal.style.setProperty("--pause", pc(13 * 60) + "%");
    cal.innerHTML = '<div class="cal-tete">' + tete + '</div><div class="cal-corps">' + corps + "</div>";
    if (modeEchActif) cal.classList.add("mode-ech-actif");
    // Bande SOIR : carte détachée SOUS la grille (pas dedans) — mêmes
    // colonnes, « Soir » dans la gouttière. Absente quand rien ne dépasse
    // des cours.
    var bandeau = "";
    if (soir.some(function (cell) { return cell.lignes.length; })) {
      bandeau = '<div class="soir-grille"><div class="soir-nom">Soir</div>';
      soir.forEach(function (cell) {
        bandeau += '<div class="soir-jour' + (estFerie(sem, cell.jour) ? " ferie" : "") + '"><ul class="ech-liste soir-liste">';
        cell.lignes.forEach(function (x) {
          // Comme les fiches des jours fériés : heure seule (le jour va
          // de soi dans la colonne), badge vertical, case à cocher.
          bandeau += itemEcheanceHTML(x.e, x.cle, jourEch(x.e.date), "", "");
        });
        bandeau += "</ul></div>";
      });
      bandeau += "</div>";
    }
    var soirEl = document.getElementById("soir");
    if (bandeau) {
      if (!soirEl) {
        soirEl = document.createElement("div");
        soirEl.id = "soir";
        cal.parentNode.insertBefore(soirEl, cal.nextSibling);
      }
      soirEl.style.setProperty("--n", jours.length);
      soirEl.style.setProperty("--cols", colsVal);
      soirEl.innerHTML = bandeau;
    } else if (soirEl) {
      soirEl.remove();
    }
    ajusterFichesCal();
  }

  /* Grille : une fiche à heure placée près du bas (ex. 17h00 quand la
     grille finit à 18h) dépasserait sous le calendrier — la fiche étant
     plus haute que la place restante. On la remonte juste assez pour
     qu'elle tienne dans la colonne (l'heure écrite dessus reste la bonne).
     Les fiches « en bas » sont déjà ancrées au bas : rien à y faire. La
     mesure se fait après le rendu, dans la même tâche : pas de
     scintillement. */
  function ajusterFichesCal() {
    var cal = document.getElementById("cal");
    if (!cal || !cal.isConnected) return;
    var cols = cal.querySelectorAll(".cal-col");
    for (var i = 0; i < cols.length; i++) {
      var col = cols[i], colH = col.clientHeight;
      if (!colH) continue;
      var fiches = col.querySelectorAll(".cal-ech-item");
      for (var k = 0; k < fiches.length; k++) {
        var f = fiches[k];
        if (!f.style.top && f.dataset.topOrig === undefined) continue; // « en bas » : déjà calée
        var topOrig = f.dataset.topOrig !== undefined ? f.dataset.topOrig : f.style.top;
        f.style.top = topOrig; // repose à son heure, puis mesure
        if (f.offsetTop + f.offsetHeight > colH + 1) {
          if (f.dataset.topOrig === undefined) f.dataset.topOrig = topOrig;
          f.style.top = Math.max(0, colH - f.offsetHeight - 2) + "px";
        } else if (f.dataset.topOrig !== undefined) {
          delete f.dataset.topOrig; // tient à nouveau : retour à son heure
        }
      }
    }
  }

  /* Bulle de détail d'un cours : à côté du bloc cliqué. */
  var pop = document.getElementById("pop"), popSource = null, popCours = null;
  function fermerPop() {
    if (!popSource) return;
    popSource.classList.remove("actif");
    popSource = null;
    popCours = null;
    pop.classList.remove("visible");
    histFermer("pop");
  }
  /* Contenu de la bulle pour un cours (titre, détails, échéances, ajout). */
  function contenuPop(c) {
    var date = dateSemJour(sem, c.jour);
    var d = "";
    d += "<dt>Salle</dt><dd>" + (c.salles ? txt(c.salles.replace(/, ([^,]*)$/, " et $1")) : '<span class="nc">non communiquée</span>') + "</dd>";
    if (c.profs) d += "<dt>Prof</dt><dd>" + txt(c.profs) + "</dd>";
    if (c.groupes.length && groupesChoisisDe(c).length !== 1) d += "<dt>Groupe</dt><dd>" + txt(c.groupes.map(nomGroupe).join(", ")) + "</dd>";
    if (DATA && DATA.perso) {
      var nomsSrc = (c.srcs || [c.src]).map(function (i) { return nomSource(profil.sources[i]); }).filter(Boolean);
      if (nomsSrc.length) d += "<dt>Source</dt><dd>" + txt(nomsSrc.join(" et ")) + "</dd>";
    }
    // Échéances du cours : les siennes plus celles qu'il héberge (une
    // heure qui tombe pendant ce cours), comme dans la case — même liste
    // que sur téléphone, en lecture seule. Sans échéance, pas de section
    // du tout. L'ajout direct passe par le bouton « Échéance » en dessous
    // (le bouton en haut du jour reste pour les échéances hors cours).
    var listeEch = listeEcheancesCles(echeancesAfficheesCours(c, date), date);
    var blocEch = listeEch ? '<div class="pop-ech">' +
      '<p class="pop-ech-titre">Échéances</p>' + listeEch + "</div>" : "";
    var btnAjout = '<div class="pop-ech-ajout">' +
      '<button type="button" class="jour-ech-btn" data-pop-ech-ajout ' +
      'aria-label="Ajouter un devoir ou un examen à ce cours" title="Ajouter un devoir ou un examen">' +
      "<span>Échéance</span></button></div>";
    // Titre cliquable (ordinateur) : ouvre la recherche sur ce cours
    // (toutes ses séances), comme la pastille sur téléphone.
    return '<button type="button" class="pt" data-pop-rech="' + txt(c.matiere || "") + '"' +
      ' title="Voir toutes ses séances" aria-label="Chercher ' + txt(nettoyerMatiere(c.matiere || "Cours")) + ' — voir toutes ses séances">' +
      txt(nettoyerMatiere(c.matiere || "Cours")) + "</button>" +
      '<p class="ph">' + JOURS[c.jour] + " " + fmtDate(date) + " · " + fmtH(c.debut) + " – " + fmtH(c.fin) + "</p>" +
      "<dl>" + d + "</dl>" + blocEch + btnAjout;
  }
  /* Place la bulle à côté du bloc cliqué et l'allume. */
  function placerPop(btn) {
    if (popSource && popSource !== btn) popSource.classList.remove("actif");
    popSource = btn;
    btn.classList.add("actif");
    var r = btn.getBoundingClientRect(), w = pop.offsetWidth;
    var x = r.right + 12;
    if (x + w > window.innerWidth - 16) x = r.left - w - 12;
    if (x < 16) x = Math.max(16, Math.min(window.innerWidth - w - 16, r.left));
    var limiteBas = window.innerHeight - 16;
    var y = Math.max(88, r.top);
    // Mesure à hauteur naturelle (bride large) : la bride finale dépend de y.
    pop.style.maxHeight = Math.max(140, limiteBas - 88) + "px";
    pop.style.left = x + "px";
    pop.style.top = y + "px";
    pop.classList.add("visible");
    var h = pop.offsetHeight;
    if (y + h > limiteBas) {
      // Pas la place vers le bas : aligne les bords extérieurs du bas
      // (la bulle remonte, son bas au niveau du bas du cours).
      y = r.bottom - h;
      y = Math.min(y, limiteBas - h);
      if (y < 88) y = 88;
      pop.style.top = y + "px";
    }
    pop.style.maxHeight = Math.max(140, limiteBas - y) + "px";
    // La bride peut avoir réduit la hauteur : recale une dernière fois
    // pour ne jamais dépasser sous l'écran.
    var h2 = pop.offsetHeight;
    if (y + h2 > limiteBas) {
      y = Math.max(16, limiteBas - h2);
      pop.style.top = y + "px";
      pop.style.maxHeight = Math.max(140, limiteBas - y) + "px";
    }
  }
  function ouvrirPop(btn) {
    var c = evCal[+btn.getAttribute("data-ev")];
    if (!c) return;
    if (popSource) {
      popSource.classList.remove("actif");
      popSource = null;
      popCours = null;
      pop.classList.remove("visible");
    }
    histOuvrir("pop");
    popCours = c;
    var tc = couleurCours(c.matiere);
    pop.style.setProperty("--h", tc.h);
    pop.style.setProperty("--v", tc.v);
    pop.innerHTML = contenuPop(c);
    placerPop(btn);
  }
  /* Le bloc de la grille qui porte un cours (après un rendu). */
  function blocCours(c) {
    var boutons = document.querySelectorAll("#cal .ev");
    for (var i = 0; i < boutons.length; i++) {
      if (evCal[+boutons[i].getAttribute("data-ev")] === c) return boutons[i];
    }
    return null;
  }
  /* Met à jour la bulle déjà ouverte après un rendu, sans toucher à
     l'historique : l'entrée « pop » empilée reste valable. Refermer la
     bulle puis la rouvrir dans la foulée (ce que faisait l'ajout) lançait
     deux history.back() asynchrones suivis d'un pushState : sur Chrome, la
     pile de l'app et l'historique du navigateur se désynchronisaient, et
     le clic suivant quittait l'application. */
  function rafraichirPop(c) {
    if (!c || !pop.classList.contains("visible")) return;
    popCours = c;
    var btn = blocCours(c);
    if (!btn) { fermerPop(); return; }
    var tc = couleurCours(c.matiere);
    pop.style.setProperty("--h", tc.h);
    pop.style.setProperty("--v", tc.v);
    pop.innerHTML = contenuPop(c);
    placerPop(btn);
  }
  document.getElementById("cal").addEventListener("click", function (e) {
    if (clicEcheance(e)) return;
    // Même bouton « Échéance » que sur téléphone : le choix du cours du jour.
    var je = e.target.closest(".jour-ech-btn");
    if (je) { ouvrirChoixCours(+je.getAttribute("data-ech-jour")); return; }
    var b = e.target.closest(".ev");
    if (!b) return;
    if (popSource === b) fermerPop(); else ouvrirPop(b);
  });
  // Dans la bulle : ajouter directement une échéance à ce cours, ou
  // modifier / supprimer une échéance sans refermer la bulle.
  pop.addEventListener("click", function (e) {
    var ajout = e.target.closest("[data-pop-ech-ajout]");
    if (ajout) {
      e.stopPropagation();
      if (popCours) { echRetourJour = null; ouvrirEcheance(popCours); }
      return;
    }
    // Titre du cours : ouvre la recherche sur ses séances (comme la
    // pastille sur téléphone). Intercepté avant le reste de la bulle.
    var rech = e.target.closest("[data-pop-rech]");
    if (rech) {
      e.stopPropagation();
      var mat = rech.getAttribute("data-pop-rech");
      if (mat) rcOuvrir(mat);
      return;
    }
    e.stopPropagation();
    clicEcheance(e);
  });
  // Bande SOIR : mêmes gestes sur les échéances que dans la grille
  // (l'écouteur de #cal ne les voit plus, la bande est en dehors).
  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("#soir")) clicEcheance(e);
  });
  document.addEventListener("click", function (e) {
    if (confirmationOuverte() || editionOuverte() || bugOuvert() || exportOuvert() ||
        echeanceOuverte() || notifsOuvertes()) return;
    if (rechCoursOuverte()) return; // la recherche est au-dessus : rien derrière ne se ferme
    if (popSource && !pop.contains(e.target) && !e.target.closest(".ev")) fermerPop();
    if (feuille.classList.contains("visible") && !feuille.contains(e.target) && !e.target.closest("#btn-moi")) fermerFeuille();
    if (modeEchActif && !e.target.closest("#cal") && !e.target.closest("#soir") && !e.target.closest("#btn-ech-global") && !e.target.closest(".week")) fermerModeEch();
  });
  window.addEventListener("resize", fermerPop);
  /* … et les fiches à heure près du bas sont recalées dans leur colonne
     (leur hauteur dépend de la largeur : le rétrécissement peut les faire
     grandir et déborder à nouveau). */
  window.addEventListener("resize", ajusterFichesCal);
  /* Fenêtre redimensionnée pendant qu'un cours est déroulé : la borne de
     hauteur de sa salle est recalculée (sinon un texte élargi ou rétréci
     serait rogné ou entouré de vide). */
  window.addEventListener("resize", function () {
    var ouverts = document.querySelectorAll("#jours li.c.open");
    for (var i = 0; i < ouverts.length; i++) bornerSalle(ouverts[i]);
    var rcOuv = document.querySelectorAll("#rc-dates .day.open li.c.open");
    for (var j = 0; j < rcOuv.length; j++) bornerSalle(rcOuv[j]);
  });

  /* ---------- Rechercher un cours ----------
     Panneau plein écran : on tape le début de n'importe quel mot de
     l'intitulé, la liste se réduit ; un cours ouvert montre ses séances,
     classées par semaine, au format des jours de la semaine (heures
     empilées, pastille, salle / prof / groupe au dépliage). Les cours sont
     ceux de l'horaire affiché, déjà filtrés selon les groupes choisis :
     la recherche ne montre que ce que l'étudiant suit vraiment. */
  var rc = document.getElementById("rc");
  var rcVueListe = document.getElementById("rc-vue-liste");
  var rcVueDates = document.getElementById("rc-vue-dates");
  var rcChamp = document.getElementById("rc-champ");
  var rcEffacer = document.getElementById("rc-effacer");
  var rcListe = document.getElementById("rc-liste");
  var rcResume = document.getElementById("rc-resume");
  var rcDates = document.getElementById("rc-dates");
  var rcTitre = document.getElementById("rc-titre");
  var rcNb = document.getElementById("rc-nb");
  var rcGroupes = [];     // les cours, groupés par intitulé (voir EZH_RECHERCHE)
  var rcGroupe = null;    // le cours dont on montre les dates, sinon null
  var rcDirect = false;   // ouverte directement sur un cours (pastille) : le
                          // retour ferme la recherche, sans passer par la liste
  var rcOuvertes = {};    // séances dépliées, par clé (« 2|0|08h15|Analyse »)
  function rechCoursOuverte() { return !!rc && !rc.hidden; }
  function rcNombre(n) { return n + (n > 1 ? " séances" : " séance"); }
  function rcVue(v) {
    rcVueListe.hidden = v !== "liste";
    rcVueDates.hidden = v !== "dates";
  }
  function rcMajEffacer() { rcEffacer.hidden = !rcChamp.value.length; }
  function rcRendreListe() {
    var trouve = RECHERCHE_COURS.filtrer(rcGroupes, rcChamp.value);
    var html = "";
    trouve.forEach(function (g) {
      html += '<li><button type="button" data-rc-cours="' + txt(g.matiere) + '">' +
        '<span class="cpoint" style="' + styleCours(g.matiere) + '" aria-hidden="true"></span>' +
        '<span class="nom">' + RECHERCHE_COURS.surligner(g.nom, rcChamp.value) +
        "<small>" + rcNombre(g.seances.length) + "</small></span>" +
        "</button></li>";
    });
    if (!html) {
      html = '<li class="empty"><p>Aucun cours ne correspond</p>' +
        "<p>Essaie le début d'un autre mot du titre du cours.</p></li>";
    }
    rcListe.innerHTML = html;
    rcResume.textContent = trouve.length + " cours";
    rcResume.hidden = !trouve.length;
    rcMajEffacer();
    rc.scrollTop = 0;
  }
  /* Une séance au format d'un jour de la semaine (téléphone) : le jour et
     sa date à gauche, les heures à droite. Au clic, le cours se déroule
     comme s'il était le seul de la journée — heures empilées, pastille,
     puis Salle / Prof / Groupe, le gabarit de la semaine. */
  function rcCleSeance(semaine, seance) {
    var c = seance.cours;
    return semaine + "|" + c.jour + "|" + c.debut + "|" + (c.matiere || "");
  }
  /* Séance déjà terminée : jour passé, ou aujourd'hui quand l'heure de
     fin est dépassée. Sert à griser les séances et à caler la vue sur le
     cours en cours ou le prochain. */
  function heureSeanceMins(h) {
    var m = /(\d+)\s*h\s*(\d{0,2})/i.exec(String(h == null ? "" : h));
    if (m) return (+m[1]) * 60 + (+(m[2] || "0"));
    var p = String(h == null ? "" : h).split(":");
    if (p.length >= 2) return (+p[0]) * 60 + (+p[1]);
    return NaN;
  }
  function rcSeancePassee(semaine, c, auj) {
    auj = auj || new Date();
    var date = dateSemJour(semaine, c.jour);
    var j0 = new Date(auj.getFullYear(), auj.getMonth(), auj.getDate());
    var j1 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (j1.getTime() < j0.getTime()) return true;
    if (j1.getTime() > j0.getTime()) return false;
    var fin = heureSeanceMins(c.fin);
    if (isNaN(fin)) return false;
    return fin <= auj.getHours() * 60 + auj.getMinutes();
  }
  function rcLigneSeance(semaine, seance) {
    var c = seance.cours;
    var cle = rcCleSeance(semaine, seance);
    var ouvert = !!rcOuvertes[cle];
    var date = dateSemJour(semaine, c.jour);
    var passee = rcSeancePassee(semaine, c, new Date());
    /* Pastilles Examen (gauche) / Devoir (droite) de cette occurrence :
       même espace réservé et mêmes échéances que la liste des jours. */
    var ech = slotsEcheancesJour(c.jour, [c], date);
    return '<li class="day rc-jour' + (ouvert ? " open" : "") +
      (memeJour(date, new Date()) ? " today" : "") + (passee ? " passe" : "") + '">' +
      '<button type="button" data-rc-seance="' + txt(cle) + '" aria-expanded="' + ouvert + '">' +
      ech.gauche +
      '<span class="dname"><strong>' + txt(fmtDate(date)) + '</strong>' +
      '<span class="ddate">' + txt(JOURS[c.jour]) + "</span></span>" +
      '<span class="dsum busy">' + txt(fmtH(c.debut)) + " → " + txt(fmtH(c.fin)) + "</span>" +
      ech.droite +
      "</button>" +
      '<div class="detail"><div><div class="box"><ol>' +
      '<li class="c seul open">' +
      '<button class="cbtn" type="button" disabled>' +
      '<span class="hcol"><span class="h">' + txt(fmtH(c.debut)) + '</span>' +
      '<span class="h">' + txt(fmtH(c.fin)) + "</span></span>" +
      '<span class="cpoint" style="' + styleCours(c.matiere) + '" aria-hidden="true"></span>' +
      '<span class="ctxt"><span class="m">' + txt(nettoyerMatiere(c.matiere || "Cours")) + "</span>" +
      salleCoursHTML(c) + infosCoursHTML(c) +
      "</span></button></li>" +
      "</ol></div>" +
      /* Ajouter une échéance à ce cours : le formulaire s'ouvre
         directement sur lui (date de la séance ouverte), sans l'écran de
         choix du cours ni de l'heure. À gauche, un raccourci vers la
         semaine de cette séance, avec son jour ouvert. */
      '<div class="jour-ech">' +
      '<button type="button" class="jour-ech-btn" data-rc-sem="' + txt(cle) + '" ' +
      'aria-label="Voir la semaine ' + semaine + ' avec ce jour ouvert" title="Voir la semaine ' + semaine + '">' +
      "<span>Semaine " + semaine + "</span></button>" +
      '<button type="button" class="jour-ech-btn" data-rc-ech="' + txt(cle) + '" ' +
      'aria-label="Ajouter un devoir ou un examen à ce cours" title="Ajouter un devoir ou un examen">' +
      "<span>Échéance</span></button></div>" +
      "</div></div></li>";
  }
  /* Liste plate : une carte par séance, sans découpage par semaine. Les
     séances terminées sont grisées, et la vue se cale sur le cours en
     cours ou le prochain (la dernière séance quand tout est passé). */
  function rcRendreDates() {
    var g = rcGroupe;
    rcTitre.textContent = g.nom;
    rcNb.textContent = rcNombre(g.seances.length);
    var html = '<ul class="rc-dates">';
    g.seances.forEach(function (seance) { html += rcLigneSeance(seance.semaine, seance); });
    rcDates.innerHTML = html + "</ul>";
    var items = rcDates.querySelectorAll("li.rc-jour");
    var cible = null, repli = null;
    for (var i = 0; i < items.length; i++) {
      repli = items[i];
      if (!cible && !items[i].classList.contains("passe")) cible = items[i];
    }
    if (!cible) cible = repli;
    rc.scrollTop = 0;
    if (cible) {
      /* Après la peinture. Affectation directe (jamais scrollIntoView :
         lui fait aussi défiler le document derrière le panneau, et iOS
         ne repeint alors plus le calque fixe — la page principale reste
         visible en bas de l'écran). */
      requestAnimationFrame(function () {
        try {
          var hr = rc.getBoundingClientRect(), cr = cible.getBoundingClientRect();
          rc.scrollTop = Math.max(0, rc.scrollTop + (cr.top - hr.top) - rc.clientHeight / 2 + cr.height / 2);
        } catch (e) { /* jetable */ }
      });
    }
  }
  function rcOuvrirCours(matiere) {
    var g = null;
    for (var i = 0; i < rcGroupes.length; i++) {
      if (rcGroupes[i].matiere === matiere) { g = rcGroupes[i]; break; }
    }
    if (!g) return;
    rcGroupe = g;
    rcOuvertes = {};
    rcRendreDates();
    rcVue("dates");
  }
  function rcRetourListe() {
    if (!rcGroupe) { rcFermer(); return; }
    rcGroupe = null;
    rcDirect = false;
    rcOuvertes = {};
    rcVue("liste");
    rcRendreListe();
    try { rcChamp.focus(); } catch (e) { /* jetable */ }
  }
  /* `matiere` (facultatif) : ouvre directement les dates de ce cours —
     l'accès par la pastille d'un cours, sans passer par la liste. Dans ce
     cas le retour (bouton, geste, Échap) ferme la recherche d'un coup. */
  function rcOuvrir(matiere) {
    if (!RECHERCHE_COURS || !profil || !COURS.length || rechCoursOuverte()) return;
    rcGroupes = RECHERCHE_COURS.grouper(COURS, nettoyerMatiere);
    rcGroupe = null;
    rcDirect = !!matiere;
    rcOuvertes = {};
    rcChamp.value = "";
    rcVue("liste");
    rcRendreListe();
    if (matiere) rcOuvrirCours(matiere);
    document.getElementById("rc-dates-retour").setAttribute("aria-label",
      rcDirect ? "Fermer la recherche" : "Retour à la liste des cours");
    rc.hidden = false;
    try { void rc.offsetWidth; } catch (e) { /* jetable */ } // rejoue l'entrée
    rc.classList.add("visible");
    document.body.classList.add("rech-ouverte");
    histOuvrir("rc");
    // Course ouverte : le champ est hors écran, pas de clavier qui monte.
    if (!matiere) { try { rcChamp.focus(); } catch (e) { /* jetable */ } }
  }
  function rcFermer() {
    if (!rechCoursOuverte()) return;
    rc.classList.remove("visible");
    rc.hidden = true;
    document.body.classList.remove("rech-ouverte");
    rcGroupe = null;
    rcDirect = false;
    try { rcChamp.blur(); } catch (e) { /* jetable */ }
    histFermer("rc");
  }
  rcChamp.addEventListener("input", rcRendreListe);
  rcChamp.addEventListener("search", rcRendreListe);
  rcEffacer.addEventListener("click", function () {
    rcChamp.value = "";
    rcRendreListe();
    try { rcChamp.focus(); } catch (e) { /* jetable */ }
  });
  rcListe.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-rc-cours]");
    if (b) rcOuvrirCours(b.getAttribute("data-rc-cours"));
  });
  /* Depuis une séance, bascule sur sa semaine avec son jour ouvert
     (téléphone : la journée se déroule ; ordinateur : la grille montre
     déjà toute la semaine). */
  function rcVoirSemaine(semaine, jour) {
    if (SEMAINES.indexOf(semaine) === -1) return;
    sem = semaine;
    semaineAuto = false;
    resetDepliage();
    joursOuverts[jour] = true;
    fermerPdf();
    rcFermer();
    rendre();
    var btn = document.querySelector('#jours .day > button[data-jour="' + jour + '"]');
    if (btn && btn.closest(".day")) calerDansEcran(btn.closest(".day"), true);
  }
  rcDates.addEventListener("click", function (e) {
    var bs = e.target.closest("button[data-rc-sem]");
    if (bs && rcGroupe) {
      var cleS = bs.getAttribute("data-rc-sem");
      for (var k = 0; k < rcGroupe.seances.length; k++) {
        var ss = rcGroupe.seances[k];
        if (rcCleSeance(ss.semaine, ss) === cleS) {
          rcVoirSemaine(ss.semaine, ss.cours.jour);
          return;
        }
      }
      return;
    }
    /* Échéance directement sur ce cours, à la date de la séance ouverte. */
    var be = e.target.closest("button[data-rc-ech]");
    if (be && rcGroupe) {
      var cleE = be.getAttribute("data-rc-ech");
      for (var i = 0; i < rcGroupe.seances.length; i++) {
        var s = rcGroupe.seances[i];
        if (rcCleSeance(s.semaine, s) === cleE) {
          echRetourJour = null; // pas d'écran de choix : ce cours, et lui seul
          ouvrirEcheance(s.cours, null, dateSemJour(s.semaine, s.cours.jour));
          return;
        }
      }
      return;
    }
    var b = e.target.closest("button[data-rc-seance]");
    if (!b) return;
    var li = b.closest("li.rc-jour");
    if (!li) return;
    var cle = b.getAttribute("data-rc-seance");
    var ouvert = !li.classList.contains("open");
    if (ouvert) rcOuvertes[cle] = true; else delete rcOuvertes[cle];
    li.classList.toggle("open", ouvert);
    b.setAttribute("aria-expanded", ouvert);
    if (ouvert) bornerSalle(li.querySelector("li.c"));
  });
  document.getElementById("rc-retour").addEventListener("click", rcFermer);
  document.getElementById("rc-dates-retour").addEventListener("click", function () {
    // Ouverte depuis la pastille d'un cours : le retour ramène d'un coup à
    // la page principale ; sinon, il ramène à la liste des cours.
    if (rcDirect) rcFermer(); else rcRetourListe();
  });
  /* Accès global à la recherche : loupe en bas de la semaine (téléphone),
     loupe de la barre de la semaine (ordinateur). L'app expose aussi
     l'ouverture programmée (voir README). */
  document.getElementById("btn-recherche").addEventListener("click", function () { rcOuvrir(); });
  document.getElementById("btn-recherche-semaine").addEventListener("click", function () { rcOuvrir(); });
  window.EZH_RECHERCHER_COURS = rcOuvrir;

  /* Raccourcis clavier (ordinateur) : ← → semaines, + − zoom du PDF. */
  document.addEventListener("keydown", function (e) {
    if (confirmationOuverte() || editionOuverte() || bugOuvert() || exportOuvert()) return;
    if (rechCoursOuverte()) return;
    if (vue !== "horaire" || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest && e.target.closest("input, textarea, select")) return;
    if (feuille.classList.contains("visible")) return;
    if (e.key === "ArrowLeft") document.getElementById("sem-prec").click();
    else if (e.key === "ArrowRight") document.getElementById("sem-suiv").click();
    else if ((e.key === "+" || e.key === "=") && pdfZoomable) zoomPasPdf(1);
    else if ((e.key === "-" || e.key === "_") && pdfZoomable) zoomPasPdf(-1);
    else return;
    e.preventDefault();
  });
  /* Version visible en pied de page : permet de vérifier que le
     téléphone affiche bien la dernière version (raccourci iOS). */
  var VERSION_APP = "39";
  function rendreInfos() {
    if (!DATA || !profil) return;
    document.getElementById("maj").textContent = "Mis à jour le " + DATA.meta.fetched_at + " · v" + VERSION_APP +
      (SANS_PROFS ? " · Noms des profs non publiés par l'école" : "");
    // Les cartes ne servent que dans la feuille des réglages (fermée la
    // plupart du temps) : ouvrirFeuille les rafraîchit, inutile de les
    // reconstruire à chaque rendu.
    if (document.getElementById("feuille").classList.contains("visible")) rendreListeProfils();
  }
  /* Renommé = le nom affiché diffère du nom officiel de la formation.
     Les Détails (nom officiel + groupe) n'existent que dans ce cas :
     sinon la ligne affiche déjà le nom officiel.
     On compare au nom par défaut (espaces nettoyés, 24 car. max) :
     sinon un nom officiel long (> 24 car.) passerait pour « renommé »
     alors qu'on n'a encore rien personnalisé. */
  function estRenomme(p) {
    if (!p) return false;
    if (estPerso(p)) return true; // pas de nom officiel : le nom choisi fait foi
    return propre(p.surnom || "").slice(0, 24) !== surnomDefaut(p.formation);
  }
  function libelleProfil(p) {
    if (!estPerso(p)) return joliFormation(p.formation);
    return "Sur mesure · " + p.sources.length + " source" + (p.sources.length > 1 ? "s" : "");
  }
  function texteGroupe(p) {
    if (estPerso(p)) {
      var noms = p.sources.map(nomSource);
      return "Sur mesure · " + (noms.length > 2 ? noms.length + " sources" : noms.join(" + "));
    }
    if (!p.groupes.length) return "Tous les cours";
    if (p.groupes.length === 1) return nomGroupe(p.groupes[0]);
    return p.groupes.length + " groupes";
  }
  var carteOuverte = null; // id de l'horaire dont la carte est retournée
  var ICONE_CRAYON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>';
  var ICONE_CORBEILLE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 4h4M7 7l1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13"/></svg>';
  var ICONE_CALENDRIER = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/>' +
    '<path d="M8 3v4M16 3v4M3 10h18M12 13v5M9.5 15.5 12 18l2.5-2.5"/></svg>';
  var ICONE_ANNULER = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  /* Cartes des horaires. Un clic retourne la carte de haut en bas
     (animation 3D) et révèle au dos les actions Modifier / Exporter /
     Supprimer / Annuler ; un second clic (ou Échap, ou un clic ailleurs)
     la remet en place.
     La modification elle-même se fait dans une fenêtre (ouvrirEdition).
     Avec plusieurs horaires, on attrape la carte pour la faire glisser :
     l'ordre est celui du tableau `profils`, donc aussi celui du
     sélecteur de la semaine. */
  function rendreListeProfils() {
    var zone = document.getElementById("liste-profils");
    if (!zone) return;
    // Sortie de la simulation : proposée dès qu'un horaire de l'école de
    // test est là (voir lab/simulation.html pour l'entrée).
    var quitter = document.getElementById("btn-quitter-sim");
    if (quitter) {
      quitter.hidden = !profils.some(function (p) { return p.ecole === "sim"; });
    }
    var note = document.getElementById("note-perso-local");
    var local = baseSansSources && profils.some(estPerso);
    if (local && !note) {
      note = document.createElement("p");
      note.id = "note-perso-local";
      note.className = "aide";
      note.textContent = "Tes horaires sur mesure restent sur cet appareil : la base du compte n'est pas encore à jour.";
      zone.parentNode.insertBefore(note, zone.nextSibling);
    }
    if (note) note.hidden = !local;
    var plusieurs = profils.length > 1;
    zone.classList.toggle("plusieurs", plusieurs);
    zone.innerHTML = profils.map(function (p) {
      var nom = estRenomme(p) ? p.surnom : joliFormation(p.formation);
      var grp = texteGroupe(p);
      if (grp === nom) grp = ecoleDe(p.ecole).nom; // jamais deux fois la même ligne
      var ouvert = carteOuverte === p.id;
      return '<div class="pcard halo' + (profil && p.id === profil.id ? " actif" : "") + (ouvert ? " retournee" : "") +
        '" data-carte="' + txt(p.id) + '">' +
        '<div class="pcard-flip">' +
        '<div class="pcard-face pcard-devant"' + (ouvert ? " inert" : "") + '><div class="pcard-ligne">' +
        '<button type="button" class="pcard-main" data-flip="' + txt(p.id) + '" aria-expanded="' + ouvert + '"' +
        ' aria-label="' + txt(nom) + ' : afficher les options">' +
        '<span class="pt-point" style="background:' + couleurTheme(p.theme) + '"></span>' +
        '<span class="pt-textes"><span class="pt-nom">' + txt(nom) + "</span>" +
        '<span class="pt-detail">' + txt(grp) + "</span></span></button>" +
        "</div></div>" +
        '<div class="pcard-face pcard-dos"' + (ouvert ? "" : " inert") + '><div class="pcard-actions" role="group" aria-label="Options de ' + txt(nom) + '">' +
        '<button type="button" class="dos-act" data-act="modifier" data-id="' + txt(p.id) + '">' +
        ICONE_CRAYON + "<span>Modifier</span></button>" +
        '<button type="button" class="dos-act" data-act="exporter" data-id="' + txt(p.id) + '">' +
        ICONE_CALENDRIER + "<span>Exporter</span></button>" +
        '<button type="button" class="dos-act danger-txt" data-act="supprimer" data-id="' + txt(p.id) + '">' +
        ICONE_CORBEILLE + "<span>Supprimer</span></button>" +
        '<button type="button" class="dos-act" data-act="annuler" data-id="' + txt(p.id) + '">' +
        ICONE_ANNULER + "<span>Annuler</span></button>" +
        "</div></div>" +
        "</div></div>";
    }).join("");
  }
  /* Place un horaire à une position précise (fin d'un glisser) : la carte
     sort de sa place et se réinsère à l'index visé. */
  function placerProfil(id, cible) {
    var i = -1;
    for (var k = 0; k < profils.length; k++) if (profils[k].id === id) i = k;
    if (i < 0 || cible < 0 || cible >= profils.length || cible === i) return false;
    var p = profils.splice(i, 1)[0];
    profils.splice(cible, 0, p);
    carteOuverte = null;
    sauverProfils();
    return true;
  }
  function profilParId(id) {
    for (var i = 0; i < profils.length; i++) if (profils[i].id === id) return profils[i];
    return null;
  }
  /* Retourne une carte vers son dos (sans reconstruire la liste : la
     reconstruction casserait l'animation). Une seule carte retournée
     à la fois. */
  function carteParId(id) {
    return document.querySelector('#liste-profils .pcard[data-carte="' + id + '"]');
  }
  function retournerCarte(id) {
    if (carteOuverte && carteOuverte !== id) remettreCarte(carteOuverte);
    var card = carteParId(id);
    if (!card) return;
    carteOuverte = id;
    card.classList.add("retournee");
    var btn = card.querySelector("[data-flip]");
    if (btn) btn.setAttribute("aria-expanded", "true");
    // La face cachée sort du clavier et des lecteurs d'écran.
    var devant = card.querySelector(".pcard-devant"), dos = card.querySelector(".pcard-dos");
    if (devant) devant.setAttribute("inert", "");
    if (dos) dos.removeAttribute("inert");
  }
  function remettreCarte(id) {
    var card = carteParId(id || carteOuverte);
    if (id || carteOuverte) carteOuverte = null;
    if (!card) return;
    card.classList.remove("retournee");
    var btn = card.querySelector("[data-flip]");
    if (btn) btn.setAttribute("aria-expanded", "false");
    var devant = card.querySelector(".pcard-devant"), dos = card.querySelector(".pcard-dos");
    if (devant) devant.removeAttribute("inert");
    if (dos) dos.setAttribute("inert", "");
  }
  /* Carte du compte retournée (dos visible). Mêmes mécanique et
     animation que les cartes d'horaires, mais un seul état à la fois. */
  var compteRetourne = false;
  function retournerCompte() {
    var el = document.getElementById("reg-compte");
    if (!el) return;
    fermerMenus(); // les cartes d'horaires se remettent avant
    compteRetourne = true;
    el.classList.add("retournee");
    var b = document.getElementById("btn-reg-flip");
    if (b) b.setAttribute("aria-expanded", "true");
    var devant = el.querySelector(".pcard-devant"), dos = el.querySelector(".pcard-dos");
    if (devant) devant.setAttribute("inert", "");
    if (dos) dos.removeAttribute("inert");
  }
  function remettreCompte() {
    var el = document.getElementById("reg-compte");
    if (!el || !compteRetourne) return;
    compteRetourne = false;
    el.classList.remove("retournee");
    var b = document.getElementById("btn-reg-flip");
    if (b) b.setAttribute("aria-expanded", "false");
    var devant = el.querySelector(".pcard-devant"), dos = el.querySelector(".pcard-dos");
    if (devant) devant.removeAttribute("inert");
    if (dos) dos.setAttribute("inert", "");
  }
  /* Ferme les menus ouverts (carte du compte, carte d'horaire, mode
     échéance) — sous-couche de la feuille (pas d'entrée history propre). */
  function fermerMenus() {
    remettreCompte();
    fermerModeEch();
    if (carteOuverte !== null) remettreCarte(carteOuverte);
  }
  function menusOuverts() {
    return compteRetourne || carteOuverte !== null || modeEchActif;
  }

  /* ---------- Fenêtre de modification ----------
     ouvrirEdition({ titre, corps (HTML), theme?, enregistrer(corps) }) :
     enregistrer renvoie false pour garder la fenêtre ouverte (champ vide). */
  var edition = null, editionJeton = 0, editionDernierFocus = null;
  function editionOuverte() { return !!edition; }
  function htmlChoixThemes(t) {
    return choixThemesBlocHTML(t, "edition-themes", "Thème de l'horaire");
  }
  function ouvrirEdition(opts) {
    fermerMenus();
    edition = opts;
    editionJeton++;
    editionDernierFocus = document.activeElement;
    document.getElementById("edition-titre").textContent = opts.titre;
    var corps = document.getElementById("edition-corps");
    corps.innerHTML = opts.corps;
    var voile = document.getElementById("voile-edition");
    voile.classList.remove("sortie");
    voile.hidden = false;
    document.body.classList.add("confirm-ouverte");
    histOuvrir("edition");
    // Prévisualisation du thème modifié : la fenêtre et le fond suivent
    // la couleur touchée ; fermerEdition restaure le thème en cours.
    if (opts && typeof opts.theme !== "undefined") {
      document.body.setAttribute("data-theme", String(normaliserTheme(opts.theme)));
    }
    var premier = corps.querySelector("input");
    if (premier) setTimeout(function () { try { premier.focus(); premier.select(); } catch (e) { /* jetable */ } }, 60);
  }
  function fermerEdition() {
    if (!edition) return;
    histFermer("edition");
    // Annulation : on avait prévisualisé un autre thème, on revient à
    // celui de l'horaire affiché. Après un enregistrement c'est le même.
    var restaurer = edition && typeof edition.theme !== "undefined";
    edition = null;
    var jeton = ++editionJeton;
    var voile = document.getElementById("voile-edition");
    var fin = function () {
      if (jeton !== editionJeton) return; // rouverte entre-temps
      voile.hidden = true;
      voile.classList.remove("sortie");
    };
    document.body.classList.remove("confirm-ouverte");
    if (restaurer) appliquerTheme();
    if (sansAnim) fin(); else { voile.classList.add("sortie"); setTimeout(fin, 180); }
    if (editionDernierFocus && editionDernierFocus.focus && document.contains(editionDernierFocus)) {
      try { editionDernierFocus.focus({ preventScroll: true }); } catch (e) { /* jetable */ }
    }
  }
  document.getElementById("boite-edition").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!edition) return;
    if (edition.enregistrer(document.getElementById("edition-corps")) === false) return;
    fermerEdition();
  });
  document.getElementById("edition-annuler").addEventListener("click", fermerEdition);
  // Les clics restent dans la fenêtre : sinon, une fois fermée, le clic
  // atteindrait le détecteur de clic extérieur et fermerait les réglages.
  document.getElementById("voile-edition").addEventListener("click", function (e) {
    e.stopPropagation();
    if (e.target === this) fermerEdition();
  });
  document.getElementById("edition-corps").addEventListener("click", function (e) {
    var g = e.target.closest("[data-edit-groupes]");
    if (g && edition) {
      // Le nom et la couleur en cours de saisie suivent : l'écran de choix
      // des groupes les reprend, et « Voir mon horaire » enregistre tout.
      var champ = document.getElementById("edit-surnom");
      changerGroupe(g.getAttribute("data-edit-groupes"),
        champ ? champ.value.replace(/\s+/g, " ").trim().slice(0, 24) : "",
        edition.theme);
      return;
    }
    var b = e.target.closest("[data-theme-opt]");
    if (!b || !edition) return;
    edition.theme = +b.getAttribute("data-theme-opt");
    majThemeSelection("edition-themes", edition.theme);
    // Prévisualisation immédiate : toute l'interface suit la couleur touchée.
    document.body.setAttribute("data-theme", String(normaliserTheme(edition.theme)));
  });
  document.getElementById("edition-corps").addEventListener("input", function (e) {
    var bloc = e.target.closest(".champs");
    if (bloc) bloc.classList.remove("erreur");
  });
  document.addEventListener("keydown", function (e) {
    if (edition && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fermerEdition(); }
  }, true);

  /* Fenêtre « devoir ou examen » : étape 1 (dans quel cours, depuis le
     bouton « Échéance » du jour), puis étape 2 (le formulaire). Ouverte
     directement sur l'étape 2 depuis un jour sans cours ou le grand écran.
     Date et heure sont celles du créneau visé (le début du cours) : elles
     se rappellent, mais ne se règlent pas. */
  var echCours = null; // cours visé (objet de COURS)
  var echIdModif = null; // id de l'échéance en cours d'édition (si modification)
  var echType = "devoir";
  var echDate = "";    // date du créneau (celle du cours)
  var echHeure = "";   // heure de début du cours
  var echRetourJour = null; // jour d'où vient le choix du cours (retour possible vers l'étape 1)
  var echDernierFocus = null;
  var echTitreBloc = document.getElementById("ech-titre-bloc");
  function montrerEtapeEch(n) {
    document.getElementById("ech-etape-choix").hidden = n !== 1;
    document.getElementById("ech-etape-form").hidden = n !== 2;
  }
  /* Étape 1 : la fenêtre s'ouvre sur les cours du jour `j`, des lignes
     bien hautes pour viser juste du pouce. Jour sans cours : pas de
     lignes, on choisit l'heure (obligatoire : un devoir se crée
     toujours avec une heure). */
  function remplirChoixCours(j) {
    var cours = coursDe(sem, j);
    var date = dateSemJour(sem, j);
    document.getElementById("ech-choix-titre").textContent = JOURS[j] + " " + fmtDate(date);
    document.getElementById("ech-etape-choix").classList.toggle("sans-cours", !cours.length);
    var mAutre = document.querySelector("#ech-choix-autre .m");
    var sAutre = document.querySelector("#ech-choix-autre .s");
    if (!cours.length) {
      if (mAutre) mAutre.textContent = "À quelle heure ?";
      if (sAutre) sAutre.textContent = "Obligatoire";
    } else {
      if (mAutre) mAutre.textContent = "À une autre heure";
      if (sAutre) sAutre.textContent = "Dans la journée";
    }
    var h = "";
    for (var k = 0; k < cours.length; k++) {
      var cc = cours[k];
      h += '<button type="button" class="ech-choix-cours" data-ech-cible="' + txt(j + ":" + k) + '" ' +
        'aria-label="Ajouter un devoir ou un examen à ' + txt(nettoyerMatiere(cc.matiere || "ce cours")) + '">' +
        '<span class="h">' + txt(fmtH(cc.debut)) + '</span>' +
        '<span class="cpoint" style="' + styleCours(cc.matiere) + '" aria-hidden="true"></span>' +
        '<span class="ctxt"><span class="m">' + txt(nettoyerMatiere(cc.matiere || "Cours")) + "</span>" +
        (cc.salles ? '<span class="s">' + txt(cc.salles) + "</span>" : "") + "</span>";
    }
    document.getElementById("ech-choix-liste").innerHTML = h;
    return cours.length;
  }
  /* Mode choix du jour sur la grille (ordinateur) : filtre transparent dessinant
     chaque jour de la semaine, inspiré des zones de glisser-déposer. */
  var modeEchActif = false;
  function fermerModeEch() {
    if (!modeEchActif) return;
    modeEchActif = false;
    var cal = document.getElementById("cal");
    if (cal) cal.classList.remove("mode-ech-actif");
    var b = document.getElementById("btn-ech-global");
    if (b) b.setAttribute("aria-expanded", "false");
  }
  function ouvrirModeEch() {
    fermerMenus();
    fermerPop();
    modeEchActif = true;
    var cal = document.getElementById("cal");
    if (cal) {
      cal.classList.add("mode-ech-actif");
      var premier = cal.querySelector(".cal-col-depot.today") || cal.querySelector(".cal-col-depot");
      if (premier) premier.focus();
    }
    var b = document.getElementById("btn-ech-global");
    if (b) b.setAttribute("aria-expanded", "true");
  }
  function toggleModeEch() {
    if (modeEchActif) fermerModeEch();
    else ouvrirModeEch();
  }
  function ouvrirChoixCours(j) {
    remplirChoixCours(j);
    fermerMenus();
    cacheTexteEch = "";
    cacheTypeEch = "devoir";
    echRetourJour = j;
    echDernierFocus = document.activeElement;
    rendreHeureVierge(); // heure neuve à chaque ouverture
    ajusterValiderHeure();
    if (echChoixZoneValider) echChoixZoneValider.classList.remove("ouvert");
    var cAutre = document.getElementById("ech-choix-autre");
    if (cAutre) cAutre.classList.remove("ouvert");
    // La fenêtre prend d'emblée la hauteur de l'étape 2 (le formulaire) :
    // elle ne saute pas quand on choisit un cours.
    document.getElementById("boite-echeance").style.minHeight = hauteurEtapeForm(j) + "px";
    montrerEtapeEch(1);
    var voile = document.getElementById("voile-echeance");
    voile.classList.remove("sortie");
    voile.hidden = false;
    document.body.classList.add("confirm-ouverte");
    histOuvrir("echeance");
  }
  /* Ligne de contexte du formulaire : le cours visé sous forme de bouton. */
  function contexteEch(c, heure, dExact) {
    if (c.debut) {
      return '<span class="cpoint" style="' + styleCours(c.matiere) + '" aria-hidden="true"></span>' +
        '<span class="ech-cours-nom">' + txt(nettoyerMatiere(c.matiere || "ce cours")) + '</span>';
    }
    var jour = dExact || dateSemJour(sem, c.jour);
    var libelle = estFerie(sem, c.jour) ? nomFerie(sem, c.jour) : (JOURS[c.jour] + " " + fmtDate(jour));
    return '<span class="ech-cours-nom">' +
      txt(heure ? libelle + " · " + fmtH(String(heure).replace(":", "h"))
                : libelle) + '</span>';
  }
  /* Hauteur du formulaire (étape 2), mesurée hors écran : le temps d'un
     calcul, rien n'est peint (tout est remis en place dans le même bloc).
     Le contexte du cours le plus long du jour et le lien de retour sont
     posés le temps de la mesure : la hauteur vaut pour n'importe quel
     cours choisi ensuite. */
  function hauteurEtapeForm(jour) {
    var voile = document.getElementById("voile-echeance");
    var boite = document.getElementById("boite-echeance");
    var choix = document.getElementById("ech-etape-choix");
    var form = document.getElementById("ech-etape-form");
    var ctx = document.getElementById("echeance-cours");
    var cours = coursDe(sem, jour), plusLong = "", k;
    for (k = 0; k < cours.length; k++) {
      var t = contexteEch(cours[k]);
      if (t.length > plusLong.length) plusLong = t;
    }
    var voileCache = voile.hidden, choixCache = choix.hidden, formCache = form.hidden;
    var ctxCache = ctx.innerHTML;
    voile.style.visibility = "hidden";
    voile.hidden = false;
    choix.hidden = true;
    form.hidden = false;
    if (plusLong) ctx.innerHTML = plusLong;
    var h = boite.offsetHeight;
    voile.hidden = voileCache;
    choix.hidden = choixCache;
    form.hidden = formCache;
    ctx.innerHTML = ctxCache;
    voile.style.visibility = "";
    return h;
  }
  document.getElementById("ech-choix-liste").addEventListener("click", function (e) {
    var b = e.target.closest("[data-ech-cible]");
    if (!b) return;
    var cible = cibleDeCle(b.getAttribute("data-ech-cible"));
    if (cible) ouvrirEcheance(cible.c);
  });
  // « À une autre heure » : le bouton « Valider » se déroule sous la case
  // de l'heure dès qu'on commence à la régler ou la taper. Ça évite de
  // basculer brutalement à l'étape suivante dès qu'un chiffre des minutes
  // est saisi, et permet de valider posément son choix.
  var echChoixZoneValider = document.getElementById("ech-choix-valider-zone");
  var echChoixBtnValider = document.getElementById("ech-choix-valider");
  var echChoixInpHeure = document.getElementById("ech-choix-heure");
  /* Saisie intelligente de l'heure : on tape juste les chiffres (clavier
     numérique), la mise en forme suit toute seule.
       « 3 »    → « 03: » (3-9 : heure à un chiffre, pas d'ambiguïté)
       « 1 »    → attend (1 et 2 peuvent commencer 10-23 : 13, 20…)
       « 13 »   → « 13: » (Entrée/Valider : 13:00)
       « 340 »  → « 03:40 » (« 34 » > 23 : 3 = l'heure, 40 = les minutes)
       « 130 »  → « 13:0 » (13 ≤ 23 : 13:00 ; pour 01:20, taper « 0120 »)
       « 131 »  → « 13:1 » (0-5 : dizaine des minutes → 13:10)
       « 137 »  → « 13:7 » (6-9 : pas une dizaine → 13:07, « 7 » → « 07 »,
      comme les heures : même sécurité, adaptée aux minutes)
       « 1340 » → « 13:40 », « 2030 » → « 20:30 »
       « 1367 » → « 13:07 », « 367 » → « 03:07 » (minutes impossibles :
      on garde le dernier chiffre tapé)
     Les minutes invalides sont donc corrigées dès la frappe : on ne peut
     plus afficher « 13:67 ». Reste invalide : une heure > 23 à 4 chiffres
     (« 27:30 ») ou un champ incomplet — Valider le signale (secousse).
     Au repos, le champ contient un vrai « 00:00 » (gris, comme un texte
     d'exemple) plutôt qu'un placeholder : le curseur peut se poser tout à
     gauche, et la première frappe remplace tout au lieu de s'insérer dans
     les zéros. `echHeureVierge` dit si l'heure affichée est ce repos (à ne
     jamais valider tel quel : pas de devoir à minuit par accident) ou une
     heure vraiment tapée. */
  var echHeureVierge = true;
  function analyserHeure(d) {
    d = String(d || "").replace(/\D/g, "").slice(0, 4);
    var vide = { texte: "", valeur: "" };
    if (!d) return vide;
    if (d.length === 1) {
      if (+d >= 3) return { texte: "0" + d + ":", valeur: "" };
      return { texte: d, valeur: "" }; // 0, 1, 2 : 00-09 ou début de 10-23
    }
    if (d.length === 2) {
      if (+d <= 23) return { texte: d + ":", valeur: d + ":00" };
      return { texte: "0" + d.charAt(0) + ":" + d.charAt(1),
               valeur: "0" + d.charAt(0) + ":0" + d.charAt(1) };
    }
    if (d.length === 3) {
      if (+(d.slice(0, 2)) <= 23) {
        // Un seul chiffre de minutes : 0-5 = dizaine (« 131 » → 13:10),
        // 6-9 = unité (« 137 » → 13:07), comme les heures (« 7 » → « 07: »).
        var m3 = d.charAt(2);
        if (+m3 <= 5)
          return { texte: d.slice(0, 2) + ":" + m3,
                   valeur: d.slice(0, 2) + ":" + m3 + "0" };
        return { texte: d.slice(0, 2) + ":" + m3,
                 valeur: d.slice(0, 2) + ":0" + m3 };
      }
      // Heure à deux chiffres trop grande (« 34 » > 23) : le premier est
      // l'heure, les deux suivants les minutes (« 340 » → 03:40). Si la
      // dizaine des minutes dépasse 5 (« 367 »), on garde le dernier
      // chiffre tapé (« 7 » → « 07 »).
      if (+(d.charAt(1)) > 5) {
        var u3 = d.charAt(2);
        return { texte: "0" + d.charAt(0) + ":0" + u3,
                 valeur: "0" + d.charAt(0) + ":0" + u3 };
      }
      return { texte: "0" + d.charAt(0) + ":" + d.slice(1),
               valeur: "0" + d.charAt(0) + ":" + d.slice(1) };
    }
    var t4 = d.slice(0, 2) + ":" + d.slice(2);
    if (+(d.slice(0, 2)) <= 23) {
      if (+(d.slice(2)) <= 59) return { texte: t4, valeur: t4 };
      // Minutes impossibles (« 13:67 ») : on garde le dernier chiffre tapé
      // (« 7 » → « 07 »), comme les heures (« 34 » → « 03:04 »).
      var u4 = d.charAt(3);
      var corr = d.slice(0, 2) + ":0" + u4;
      return { texte: corr, valeur: corr };
    }
    return { texte: t4, valeur: "" };
  }
  function chiffresHeure() {
    return echChoixInpHeure.value.replace(/\D/g, "").slice(0, 4);
  }
  /* État de repos : « 00:00 » gris, curseur tout à gauche du premier zéro
     quand le champ a le focus. */
  var echCarteHeure = document.getElementById("ech-choix-autre");
  function rendreHeureVierge() {
    echHeureVierge = true;
    echChoixInpHeure.value = "00:00";
    if (echCarteHeure) echCarteHeure.classList.add("heure-vierge");
    placerCurseurHeure();
  }
  function placerCurseurHeure() {
    if (echHeureVierge && document.activeElement === echChoixInpHeure) {
      try { echChoixInpHeure.setSelectionRange(0, 0); } catch (e) {}
    }
  }
  /* Applique une suite de chiffres tapés (0 à 4) : met en forme, sort du
     repos, place le curseur (fin de frappe ; position du navigateur en
     effacement). */
  function appliquerChiffres(d, suppression, pos) {
    var r = analyserHeure(d);
    if (!r.texte) { rendreHeureVierge(); return; }
    echHeureVierge = false;
    if (echCarteHeure) echCarteHeure.classList.remove("heure-vierge", "erreur");
    echChoixInpHeure.value = r.texte;
    var cible = suppression
      ? (pos == null ? r.texte.length : Math.min(pos, r.texte.length))
      : r.texte.length;
    try { echChoixInpHeure.setSelectionRange(cible, cible); } catch (err) {}
  }
  // Frappe : reformate au fil des chiffres (« 340 » → « 03:40 »).
  // Au repos, la première frappe remplace le « 00:00 » affiché (le chiffre
  // tapé repart de zéro). En effacement, chaque appui recule d'un chiffre,
  // le « : » auto-réinséré se laisse traverser, jusqu'au retour au repos.
  // En frappe, le curseur suit à la fin.
  var heureToucheSuppr = false;
  function formaterHeureTapee(e) {
    var suppression = heureToucheSuppr || (e && /^delete/i.test(e.inputType || ""));
    heureToucheSuppr = false;
    if (echHeureVierge) {
      if (suppression || !e || e.data == null) { rendreHeureVierge(); return; }
      appliquerChiffres(String(e.data).replace(/\D/g, ""), false);
      return;
    }
    var pos = null;
    try { pos = echChoixInpHeure.selectionStart; } catch (err) {}
    appliquerChiffres(chiffresHeure(), suppression, pos);
  }
  // Sortie du champ (blur, Entrée, Valider) : complète (« 13: » → « 13:00 »,
  // « 07: » → « 07:00 »). Rend « HH:MM » si l'heure est valable, « » sinon
  // (heure incomplète ou > 23 : montrée telle quelle, refusée avec une
  // secousse). À 3-4 chiffres la valeur est déjà complète (pas de « 0 »
  // à ajouter : « 13:7 » vaut 13:07, « 13:1 » vaut 13:10).
  function finaliserHeure() {
    if (echHeureVierge) return "";
    var r = analyserHeure(chiffresHeure());
    if (!r.texte) { rendreHeureVierge(); return ""; }
    var valeur = r.valeur;
    if (!valeur && /^\d{2}:$/.test(r.texte)) valeur = r.texte + "00";
    echChoixInpHeure.value = valeur || r.texte;
    return valeur;
  }
  function ajusterValiderHeure() {
    if (!echChoixZoneValider || !echChoixInpHeure) return;
    var estFocus = document.activeElement === echChoixInpHeure ||
                   (echChoixBtnValider && document.activeElement === echChoixBtnValider);
    var ouvert = estFocus || !echHeureVierge;
    echChoixZoneValider.classList.toggle("ouvert", ouvert);
    var card = document.getElementById("ech-choix-autre");
    if (card) card.classList.toggle("ouvert", ouvert);
    if (echChoixBtnValider) echChoixBtnValider.tabIndex = ouvert ? 0 : -1;
  }
  /* Trouve le cours du jour pendant lequel tombe une heure donnée (en minutes).
     1. Cours dont le créneau englobe cette heure (du début inclus à la fin exclue).
     2. À défaut, cours qui se termine pile à cette heure. */
  function coursDeLHeure(listeCours, hMin) {
    if (!Array.isArray(listeCours) || isNaN(hMin)) return null;
    for (var i = 0; i < listeCours.length; i++) {
      var c = listeCours[i];
      if (!c || !c.debut || !c.fin) continue;
      var d = mins(c.debut), f = mins(c.fin);
      if (d <= hMin && hMin < f) return c;
    }
    for (var j = 0; j < listeCours.length; j++) {
      var c2 = listeCours[j];
      if (!c2 || !c2.debut || !c2.fin) continue;
      if (mins(c2.fin) === hMin) return c2;
    }
    return null;
  }
  function validerHeureChoisie() {
    if (echRetourJour == null || !echChoixInpHeure) return;
    var heure = finaliserHeure();
    if (heure) {
      var hMin = mins(heure);
      var cours = coursDe(sem, echRetourJour);
      var cTrouve = coursDeLHeure(cours, hMin);
      ouvrirEcheance(cTrouve || pseudoJour(echRetourJour), heure);
    } else {
      // Heure invalide (incomplète ou > 23) : on ne part pas en silence,
      // on secoue la case en rouge puis on y repose le curseur.
      if (echCarteHeure) {
        echCarteHeure.classList.remove("erreur");
        try { void echCarteHeure.offsetWidth; } catch (e) {}
        echCarteHeure.classList.add("erreur");
        setTimeout(function () {
          if (echCarteHeure) echCarteHeure.classList.remove("erreur");
        }, 700);
      }
      try { echChoixInpHeure.focus(); } catch (e) {}
    }
  }
  // Au repos, le curseur se pose tout à gauche du premier zéro :
  // à la prise de focus, au clic, et juste après (le navigateur replace
  // le curseur au point tapé après le focus).
  echChoixInpHeure.addEventListener("focus", function () {
    ajusterValiderHeure();
    placerCurseurHeure();
    setTimeout(placerCurseurHeure, 0);
  });
  echChoixInpHeure.addEventListener("click", function () {
    placerCurseurHeure();
  });
  echChoixInpHeure.addEventListener("input", function (e) {
    formaterHeureTapee(e);
    ajusterValiderHeure();
  });
  echChoixInpHeure.addEventListener("change", function () {
    finaliserHeure();
    ajusterValiderHeure();
  });
  echChoixInpHeure.addEventListener("keydown", function (e) {
    heureToucheSuppr = e.key === "Backspace" || e.key === "Delete";
    if (e.key === "Enter") {
      e.preventDefault();
      validerHeureChoisie();
      return;
    }
    if (echChoixZoneValider) echChoixZoneValider.classList.add("ouvert");
  });
  echChoixInpHeure.addEventListener("blur", function () {
    setTimeout(function () { finaliserHeure(); ajusterValiderHeure(); }, 150);
  });
  if (echChoixBtnValider) {
    echChoixBtnValider.addEventListener("pointerdown", function (e) {
      e.preventDefault();
    });
    echChoixBtnValider.addEventListener("click", function (e) {
      e.stopPropagation();
      validerHeureChoisie();
    });
  }
  // Un appui sur la rangée donne le focus au champ pour taper au clavier.
  document.getElementById("ech-choix-autre").addEventListener("click", function (e) {
    var inp = document.getElementById("ech-choix-heure");
    if (inp) { try { inp.focus(); } catch (err) {} }
  });
  document.getElementById("ech-choix-annuler").addEventListener("click", function () { fermerEcheance(); });

  var cacheTexteEch = "";
  var cacheTypeEch = "devoir";

  function memoriserEtRetourChoix() {
    if (echRetourJour == null) return;
    var inp = document.getElementById("ech-titre");
    if (inp) cacheTexteEch = inp.value;
    cacheTypeEch = echType || "devoir";
    rendreHeureVierge();
    ajusterValiderHeure();
    if (echChoixZoneValider) echChoixZoneValider.classList.remove("ouvert");
    var cAutre = document.getElementById("ech-choix-autre");
    if (cAutre) cAutre.classList.remove("ouvert");
    remplirChoixCours(echRetourJour);
    montrerEtapeEch(1);
  }

  document.getElementById("echeance-cours").addEventListener("click", function () {
    if (echRetourJour != null) {
      memoriserEtRetourChoix();
    }
  });

  function echeanceOuverte() {
    var v = document.getElementById("voile-echeance");
    return !!v && !v.hidden;
  }
  function definirEchType(type) {
    echType = type === "examen" ? "examen" : "devoir";
    var rail = document.getElementById("echeance-rail"), examen = echType === "examen";
    rail.style.setProperty("--idx", examen ? 1 : 0);
    var boutons = rail.querySelectorAll("[data-ech-type]");
    for (var i = 0; i < boutons.length; i++) {
      boutons[i].setAttribute("aria-pressed", boutons[i].getAttribute("data-ech-type") === echType ? "true" : "false");
    }
    document.getElementById("echeance-titre").textContent = echIdModif
      ? (examen ? "Modifier l'examen" : "Modifier le devoir")
      : (examen ? "Ajouter un examen" : "Ajouter un devoir");
    document.getElementById("ech-date-label").textContent = examen ? "Rappel pour le" : "À rendre pour le";
    document.getElementById("ech-titre").placeholder = examen
      ? "ex. Théorie des chapitres 1 à 4"
      : "ex. Exercices 1 à 8 du chapitre 3";
  }
  /* `heure` (facultatif) : heure choisie dans la journée pour un devoir
     sans cours (« à une autre heure ») ; sinon c'est le début du cours.
     `dateExacte` (facultatif) : date de l'occurrence visée (recherche),
     sinon celle de la semaine affichée. */
  function ouvrirEcheance(c, heure, dateExacte) {
    fermerTousItemsEch(null);
    fermerMenus();
    echCours = c;
    echIdModif = null;
    echDernierFocus = document.activeElement;
    // Ouverture directe du formulaire (jour sans cours, grand écran) :
    // aucune hauteur d'étape 1 à tenir, on repart de la hauteur naturelle.
    if (echRetourJour == null) document.getElementById("boite-echeance").style.minHeight = "";
    montrerEtapeEch(2);
    var ctxBtn = document.getElementById("echeance-cours");
    if (echRetourJour != null) {
      ctxBtn.classList.add("cliquable");
      ctxBtn.setAttribute("title", "Changer de cours");
      ctxBtn.setAttribute("aria-label", "Changer de cours");
    } else {
      ctxBtn.classList.remove("cliquable");
      ctxBtn.removeAttribute("title");
      ctxBtn.removeAttribute("aria-label");
    }
    document.getElementById("ech-titre").value = cacheTexteEch || "";
    document.getElementById("echeance-ok").textContent = "Ajouter";
    echTitreBloc.classList.remove("erreur");
    // Date et heure fixées au créneau du cours : le début, la prochaine
    // fois qu'il tombe (le jour affiché, ou la semaine suivante s'il est
    // déjà passé). Un jour sans cours reste sur sa date.
    var jour = dateExacte || dateSemJour(sem, c.jour);
    var d = new Date(jour.getTime()), auj = new Date();
    if (c.debut && d.getTime() < new Date(auj.getFullYear(), auj.getMonth(), auj.getDate()).getTime()) {
      d.setDate(d.getDate() + 7);
    }
    echDate = isoEch(d);
    echHeure = heure || (c.debut ? String(c.debut).replace("h", ":") : "");
    ctxBtn.innerHTML = contexteEch(c, heure, d);
    document.getElementById("ech-quand").textContent =
      fmtDate(d) +
      (echHeure ? " · " + fmtH(String(echHeure).replace(":", "h")) : "");
    definirEchType(cacheTypeEch || "devoir");
    var voile = document.getElementById("voile-echeance");
    voile.classList.remove("sortie");
    voile.hidden = false;
    document.body.classList.add("confirm-ouverte");
    histOuvrir("echeance");
    setTimeout(function () {
      try { document.getElementById("ech-titre").focus({ preventScroll: true }); } catch (e) { /* jetable */ }
    }, 60);
  }
  function fermerEcheance(direct) {
    var voile = document.getElementById("voile-echeance");
    if (!voile || voile.hidden) return;
    histFermer("echeance");
    echCours = null;
    echIdModif = null;
    echRetourJour = null;
    cacheTexteEch = "";
    cacheTypeEch = "devoir";
    fermerTousItemsEch(null);
    document.getElementById("echeance-ok").textContent = "Ajouter";
    rendreHeureVierge();
    if (echChoixZoneValider) echChoixZoneValider.classList.remove("ouvert");
    var cAutre = document.getElementById("ech-choix-autre");
    if (cAutre) cAutre.classList.remove("ouvert");
    function fin() {
      voile.hidden = true;
      voile.classList.remove("sortie");
      document.body.classList.remove("confirm-ouverte");
      if (echDernierFocus && echDernierFocus.focus && document.contains(echDernierFocus)) {
        try { echDernierFocus.focus({ preventScroll: true }); } catch (e) { /* jetable */ }
      }
    }
    if (direct || sansAnim) fin();
    else { voile.classList.add("sortie"); setTimeout(fin, 180); }
  }
  document.getElementById("boite-echeance").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!echCours) return;
    var titre = document.getElementById("ech-titre").value.replace(/\s+/g, " ").trim();
    echTitreBloc.classList.toggle("erreur", !titre);
    if (!titre) { try { document.getElementById("ech-titre").focus(); } catch (err) { /* jetable */ } return; }
    // Un devoir se crée toujours avec une heure : tous les chemins la
    // fournissent déjà (début du cours, ou heure choisie), mais si jamais
    // on arrive ici sans (chemin oublié ?), on retourne au choix de
    // l'heure plutôt que d'enregistrer sans. La modification d'une
    // échéance ancienne sans heure reste possible (on garde l'existant).
    if (!echIdModif && !/^([01]\d|2[0-3]):[0-5]\d$/.test(echHeure || "")) {
      memoriserEtRetourChoix();
      return;
    }
    var liste = echeancesDe(echCours);
    var id;
    if (echIdModif) {
      id = echIdModif;
      for (var k = 0; k < liste.length; k++) {
        if (liste[k].id === echIdModif) {
          liste[k].titre = titre;
          liste[k].type = echType;
          break;
        }
      }
    } else {
      id = nouveauId();
      liste.push({
        id: id, type: echType, titre: titre, date: echDate,
        heure: echHeure, cree: Date.now()
      });
    }
    ecrireEcheances(echCours, liste);
    var coursMaj = echCours, depuisPop = pop.classList.contains("visible");
    fermerEcheance(true);
    echNeuf = id; // surbrillance à l'apparition dans le cours
    if (coursMaj) {
      if (coursMaj.debut) {
        coursOuverts[cleRenduCours(coursMaj)] = true;
      } else if (coursMaj.jour != null) {
        joursOuverts[coursMaj.jour] = true;
        suppOuverts[coursMaj.jour] = true;
      }
    }
    rendre(depuisPop);
    echNeuf = "";
    if (depuisPop) rafraichirPop(coursMaj);
    // Recherche ouverte : les pastilles Examen/Devoir de la séance suivent.
    if (rechCoursOuverte() && rcGroupe) rcRendreDates();
  });

  function ouvrirModifierEcheance(c, id) {
    var liste = echeancesDe(c), cible = null;
    for (var i = 0; i < liste.length; i++) if (liste[i].id === id) cible = liste[i];
    if (!cible) return;
    fermerTousItemsEch(null);
    fermerMenus();
    echCours = c;
    echIdModif = id;
    echDernierFocus = document.activeElement;
    document.getElementById("boite-echeance").style.minHeight = "";
    montrerEtapeEch(2);
    echRetourJour = null;
    var ctxModif = document.getElementById("echeance-cours");
    ctxModif.classList.remove("cliquable");
    ctxModif.removeAttribute("title");
    ctxModif.removeAttribute("aria-label");
    var dj = jourEch(cible.date);
    ctxModif.innerHTML = contexteEch(c, cible.heure, dj && !isNaN(dj.getTime()) ? dj : null);
    document.getElementById("ech-titre").value = cible.titre || "";
    document.getElementById("echeance-titre").textContent = cible.type === "examen" ? "Modifier l'examen" : "Modifier le devoir";
    document.getElementById("echeance-ok").textContent = "Enregistrer";
    echTitreBloc.classList.remove("erreur");
    echDate = cible.date;
    echHeure = cible.heure || "";
    document.getElementById("ech-quand").textContent =
      (dj && !isNaN(dj.getTime()) ? fmtDate(dj) : cible.date) +
      (echHeure ? " · " + fmtH(String(echHeure).replace(":", "h")) : "");
    definirEchType(cible.type || "devoir");
    var voile = document.getElementById("voile-echeance");
    voile.classList.remove("sortie");
    voile.hidden = false;
    document.body.classList.add("confirm-ouverte");
    histOuvrir("echeance");
    setTimeout(function () {
      try {
        var inp = document.getElementById("ech-titre");
        inp.focus({ preventScroll: true });
        inp.select();
      } catch (e) { /* jetable */ }
    }, 60);
  }
  document.getElementById("echeance-rail").addEventListener("click", function (e) {
    var b = e.target.closest("[data-ech-type]");
    if (b) definirEchType(b.getAttribute("data-ech-type"));
  });
  document.getElementById("echeance-annuler").addEventListener("click", function () { fermerEcheance(); });
  // Les clics restent dans la fenêtre : sinon, une fois fermée, le clic
  // atteindrait le détecteur de clic extérieur et fermerait les réglages.
  document.getElementById("voile-echeance").addEventListener("click", function (e) {
    e.stopPropagation();
    if (e.target === this) fermerEcheance();
  });
  echTitreBloc.addEventListener("input", function () { echTitreBloc.classList.remove("erreur"); });

  function supprimerEcheance(c, id) {
    var liste = echeancesDe(c), cible = null;
    for (var i = 0; i < liste.length; i++) if (liste[i].id === id) cible = liste[i];
    if (!cible) return;
    demanderConfirmation({
      titre: cible.type === "examen" ? "Supprimer cet examen ?" : "Supprimer ce devoir ?",
      message: "<strong>" + txt(cible.titre) + "</strong><br>" + txt(quandEch(cible)),
      confirmer: "Supprimer"
    }).then(function (ok) {
      if (!ok) {
        fermerTousItemsEch(null);
        return;
      }
      if (profil) fileSupprEch({ profil: profil.id, cle: cleCoursEch(c), id: id });
      oublierSyncEch([id]);
      ecrireEcheances(c, echeancesDe(c).filter(function (x) { return x.id !== id; }));
      var depuisPop = pop.classList.contains("visible");
      rendre(depuisPop);
      if (depuisPop) rafraichirPop(c);
    });
  }
  /* Valider une échéance : le titre se barre. La mise à jour se fait sur
     place (pas de re-rendu) pour que la barre grandisse vraiment ; la
     coche part dans le cloud avec son instant (`fait_at`), le dernier
     geste gagne entre les appareils. */
  function validerEcheance(c, id) {
    var liste = echeancesDe(c), cible = null;
    for (var i = 0; i < liste.length; i++) if (liste[i].id === id) cible = liste[i];
    if (!cible) return;
    cible.fait = !cible.fait;
    cible.fait_at = Date.now();
    ecrireEcheances(c, liste);
    var cases = document.querySelectorAll('[data-ech-valide="' + id + '"]');
    for (var k = 0; k < cases.length; k++) {
      var fiche = cases[k].closest(".ech");
      var titre = fiche && fiche.querySelector(".ech-titre");
      if (titre) titre.classList.toggle("fait", !!cible.fait);
      cases[k].classList.toggle("fait", !!cible.fait);
      cases[k].setAttribute("aria-checked", cible.fait ? "true" : "false");
      cases[k].setAttribute("aria-label", (cible.fait ? "Ne plus valider " : "Valider ") +
        (cible.type === "examen" ? "l’examen : " : "le devoir : ") + cible.titre);
      cases[k].setAttribute("title", cible.fait ? "Annuler" : "C’est fait");
    }
  }
  /* Retrouve la cible d'une échéance à partir de sa clé de rendez-vous :
     « jour:index » pour un cours, « jour|| » pour un jour sans cours. */
  function cibleDeCle(cle) {
    var s = String(cle || "");
    if (/^\d+\|\|$/.test(s)) {
      var jd = +s.split("|")[0];
      if (jd < 0 || jd > 6) return null;
      return { c: pseudoJour(jd), cle: s };
    }
    var p = s.split(":");
    var j = +p[0], i = +p[1];
    if (isNaN(j) || isNaN(i)) return null;
    var liste = coursDe(sem, j);
    if (i < 0 || i >= liste.length) return null;
    return { c: liste[i], cle: j + ":" + i };
  }
  /* Ajout / validation / suppression d'une échéance : même geste sur
     téléphone (liste des jours), dans la grille du grand écran (jours sans
     cours) et dans la bulle de détail d'un cours. Renvoie true si le clic
     est consommé. */
  var LARGEUR_ACTION_ECH = 76;
  var SEUIL_OUVERTURE_ECH = 34;
  var SEUIL_AUTO_DECLENCHEMENT_ECH = 138;
  var echItemEnCours = null;
  var echStartX = 0, echStartY = 0, echCurrentX = 0;
  var enGlissementEch = false, enDefilementEch = false, glissementEchEffectue = false;

  /* L'état ouvert/fermé des options se dit aussi aux lecteurs d'écran. */
  function majAriaEch(item) {
    if (!item) return;
    var b = item.querySelector(".ech-ouvrir");
    if (b) b.setAttribute("aria-expanded", (item.getAttribute("data-ouvert") || "0") === "0" ? "false" : "true");
  }
  /* Carte d'échéance activée au clavier : Entrée/Espace est traité ici (le
     clic natif du bouton est neutralisé), pour pouvoir déplacer le focus
     sur les actions — les boutons précèdent la carte dans le DOM, donc Tab
     les manquerait à l'ouverture. */
  var echToucheClavier = 0;
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var b = e.target.closest ? e.target.closest(".ech-ouvrir") : null;
    if (!b) return;
    e.preventDefault();
    echToucheClavier = Date.now();
    var item = b.closest(".ech-item");
    if (!item) return;
    var etat = item.getAttribute("data-ouvert");
    var estOuvert = etat && etat !== "0" && !item._enFermeture;
    fermerTousItemsEch(item);
    if (estOuvert) { fermerItemEch(item, true); return; }
    ouvrirSplitEch(item);
    // Les fonds d'action passent de visibility:hidden à visible avec une
    // transition : au tick même, le bouton n'est pas encore focalisable.
    // Le focus part donc à la frame suivante, sur Modifier.
    var bEdit = item.querySelector("[data-ech-edit]");
    if (bEdit) {
      var focusEdit = function () {
        if ((item.getAttribute("data-ouvert") || "0") !== "0") {
          try { bEdit.focus(); } catch (err) { /* jetable */ }
        }
      };
      // 30 ms : la transition de visibility (180 ms) est passée de « hidden »
      // à « visible » dès les premières millisecondes ; à la frame suivante
      // ce n'est pas encore garanti.
      setTimeout(focusEdit, 30);
    }
  });

  function fermerTousItemsEch(garder) {
    var tous = document.querySelectorAll(".ech-item");
    for (var i = 0; i < tous.length; i++) {
      if (tous[i] !== garder) fermerItemEch(tous[i], true);
    }
  }

  function fermerItemEch(item, anime) {
    if (!item) return;
    var etat = item.getAttribute("data-ouvert") || "0";
    var carte = item.querySelector(".ech");
    var fondSuppr = item.querySelector(".ech-fond-suppr");
    var fondEdit = item.querySelector(".ech-fond-modifier");
    if (!carte) return;

    var aTransform = !!(carte.style.transform && carte.style.transform !== "translateX(0px)" && carte.style.transform !== "none");
    var aFond = !!((fondSuppr && fondSuppr.style.opacity && fondSuppr.style.opacity !== "0") ||
                   (fondEdit && fondEdit.style.opacity && fondEdit.style.opacity !== "0"));
    if (etat === "0" && !item._timerFermeture && !aTransform && !aFond) return;
    if (item._enFermeture && anime) return;

    if (item._timerFermeture) {
      clearTimeout(item._timerFermeture);
      item._timerFermeture = null;
    }
    item._enFermeture = false;

    item.classList.remove("arme-declenchement");
    item.classList.remove("glissant");
    item.removeAttribute("data-depart");

    if (!anime) {
      carte.style.transition = "none";
      carte.style.transform = "";
      carte.style.margin = "";
      carte.style.boxShadow = "";
      item.setAttribute("data-ouvert", "0");
      majAriaEch(item);
      if (fondSuppr) {
        fondSuppr.style.opacity = "";
        fondSuppr.style.visibility = "";
        fondSuppr.style.pointerEvents = "";
      }
      if (fondEdit) {
        fondEdit.style.opacity = "";
        fondEdit.style.visibility = "";
        fondEdit.style.pointerEvents = "";
      }
      return;
    }

    item._enFermeture = true;
    carte.style.transition = "transform .22s cubic-bezier(.16,1,.3,1), margin .22s cubic-bezier(.16,1,.3,1), box-shadow .22s cubic-bezier(.16,1,.3,1)";
    carte.style.transform = "translateX(0px)";
    carte.style.margin = "0";
    carte.style.boxShadow = "inset 0 0 0 1px var(--line)";

    if (fondSuppr) {
      fondSuppr.style.opacity = "0";
      fondSuppr.style.pointerEvents = "none";
    }
    if (fondEdit) {
      fondEdit.style.opacity = "0";
      fondEdit.style.pointerEvents = "none";
    }

    item._timerFermeture = setTimeout(function () {
      item._timerFermeture = null;
      item._enFermeture = false;
      item.setAttribute("data-ouvert", "0");
      majAriaEch(item);
      carte.style.transform = "";
      carte.style.transition = "";
      carte.style.margin = "";
      carte.style.boxShadow = "";
      if (fondSuppr) {
        fondSuppr.style.opacity = "";
        fondSuppr.style.visibility = "";
        fondSuppr.style.pointerEvents = "";
      }
      if (fondEdit) {
        fondEdit.style.opacity = "";
        fondEdit.style.visibility = "";
        fondEdit.style.pointerEvents = "";
      }
    }, 220);
  }

  function ouvrirGaucheEch(item) {
    if (item._timerFermeture) {
      clearTimeout(item._timerFermeture);
      item._timerFermeture = null;
    }
    item._enFermeture = false;
    var carte = item.querySelector(".ech");
    var fondSuppr = item.querySelector(".ech-fond-suppr");
    var fondEdit = item.querySelector(".ech-fond-modifier");
    if (!carte) return;

    item.classList.remove("arme-declenchement");
    carte.style.transition = "transform .26s cubic-bezier(.16,1,.3,1), margin .26s cubic-bezier(.16,1,.3,1), box-shadow .26s cubic-bezier(.16,1,.3,1)";
    carte.style.transform = "translateX(-" + LARGEUR_ACTION_ECH + "px)";
    carte.style.margin = "";
    carte.style.boxShadow = "inset 0 0 0 1px var(--line), 3px 0 14px rgba(0, 0, 0, .14)";
    item.setAttribute("data-ouvert", "suppr");
    majAriaEch(item);

    if (fondSuppr) {
      fondSuppr.style.opacity = "1";
      fondSuppr.style.visibility = "visible";
      fondSuppr.style.pointerEvents = "auto";
    }
    if (fondEdit) {
      fondEdit.style.opacity = "0";
      fondEdit.style.visibility = "hidden";
      fondEdit.style.pointerEvents = "none";
    }
  }

  function ouvrirDroiteEch(item) {
    if (item._timerFermeture) {
      clearTimeout(item._timerFermeture);
      item._timerFermeture = null;
    }
    item._enFermeture = false;
    var carte = item.querySelector(".ech");
    var fondSuppr = item.querySelector(".ech-fond-suppr");
    var fondEdit = item.querySelector(".ech-fond-modifier");
    if (!carte) return;

    item.classList.remove("arme-declenchement");
    carte.style.transition = "transform .26s cubic-bezier(.16,1,.3,1), margin .26s cubic-bezier(.16,1,.3,1), box-shadow .26s cubic-bezier(.16,1,.3,1)";
    carte.style.transform = "translateX(" + LARGEUR_ACTION_ECH + "px)";
    carte.style.margin = "";
    carte.style.boxShadow = "inset 0 0 0 1px var(--line), -3px 0 14px rgba(0, 0, 0, .14)";
    item.setAttribute("data-ouvert", "edit");
    majAriaEch(item);

    if (fondEdit) {
      fondEdit.style.opacity = "1";
      fondEdit.style.visibility = "visible";
      fondEdit.style.pointerEvents = "auto";
    }
    if (fondSuppr) {
      fondSuppr.style.opacity = "0";
      fondSuppr.style.visibility = "hidden";
      fondSuppr.style.pointerEvents = "none";
    }
  }

  function ouvrirSplitEch(item) {
    if (item._timerFermeture) {
      clearTimeout(item._timerFermeture);
      item._timerFermeture = null;
    }
    item._enFermeture = false;
    var carte = item.querySelector(".ech");
    var fondSuppr = item.querySelector(".ech-fond-suppr");
    var fondEdit = item.querySelector(".ech-fond-modifier");
    if (!carte) return;

    item.classList.remove("arme-declenchement");
    carte.style.transition = "transform .26s cubic-bezier(.16,1,.3,1), margin .26s cubic-bezier(.16,1,.3,1), box-shadow .26s cubic-bezier(.16,1,.3,1)";
    carte.style.transform = "translateX(0px)";
    carte.style.margin = "";
    carte.style.boxShadow = "";
    item.setAttribute("data-ouvert", "split");
    majAriaEch(item);

    if (fondEdit) {
      fondEdit.style.opacity = "1";
      fondEdit.style.visibility = "visible";
      fondEdit.style.pointerEvents = "auto";
    }
    if (fondSuppr) {
      fondSuppr.style.opacity = "1";
      fondSuppr.style.visibility = "visible";
      fondSuppr.style.pointerEvents = "auto";
    }
  }

  function getCoordEch(e) {
    return e.touches ? e.touches[0] : e;
  }

  function echTouchDebut(e) {
    if (e.button === 2) return;
    if (e.target.closest("[data-ech-valide]")) return;
    var item = e.target.closest(".ech-item");
    if (!item) return;

    var etat = item.getAttribute("data-ouvert") || "0";
    // Si un tiroir d'action complet (76px) est déjà ouvert, un clic sur son bouton est réservé à l'action
    if ((etat === "suppr" || etat === "edit") && e.target.closest(".ech-action-btn")) return;

    echItemEnCours = item;
    brancherGesteEch();
    var c = getCoordEch(e);
    echStartX = c.clientX;
    echStartY = c.clientY;
    echCurrentX = echStartX;
    enGlissementEch = false;
    enDefilementEch = false;

    var base = 0;
    if (etat === "suppr") base = -LARGEUR_ACTION_ECH;
    else if (etat === "edit") base = LARGEUR_ACTION_ECH;
    item.setAttribute("data-depart", base);
  }

  function echTouchBouge(e) {
    if (!echItemEnCours) return;
    var c = getCoordEch(e);
    var dx = c.clientX - echStartX;
    var dy = c.clientY - echStartY;

    if (!enGlissementEch && !enDefilementEch) {
      if (Math.abs(dy) > 7) {
        enDefilementEch = true;
        return;
      }
      if (Math.abs(dx) > 7) {
        enGlissementEch = true;
        if (echItemEnCours._timerFermeture) {
          clearTimeout(echItemEnCours._timerFermeture);
          echItemEnCours._timerFermeture = null;
        }
        echItemEnCours._enFermeture = false;
        fermerTousItemsEch(echItemEnCours);
        echItemEnCours.classList.add("glissant");
        if (echItemEnCours.getAttribute("data-ouvert") === "split") {
          echItemEnCours.setAttribute("data-ouvert", "0");
          var cCarte = echItemEnCours.querySelector(".ech");
          if (cCarte) cCarte.style.margin = "0";
        }
      }
    }

    if (!enGlissementEch) return;
    if (e.cancelable) e.preventDefault();

    var base = parseFloat(echItemEnCours.getAttribute("data-depart") || "0");
    var nx = base + dx;

    var absNx = Math.abs(nx);
    if (absNx > SEUIL_AUTO_DECLENCHEMENT_ECH) {
      var surplus = absNx - SEUIL_AUTO_DECLENCHEMENT_ECH;
      var damped = SEUIL_AUTO_DECLENCHEMENT_ECH + (surplus * 0.35);
      nx = nx > 0 ? damped : -damped;
    }

    var depasseSeuil = Math.abs(nx) >= SEUIL_AUTO_DECLENCHEMENT_ECH;
    var etaitArme = echItemEnCours.classList.contains("arme-declenchement");

    if (depasseSeuil && !etaitArme) {
      echItemEnCours.classList.add("arme-declenchement");
      if (window.navigator && window.navigator.vibrate) {
        try { window.navigator.vibrate(18); } catch(err) {}
      }
    } else if (!depasseSeuil && etaitArme) {
      echItemEnCours.classList.remove("arme-declenchement");
    }

    var carte = echItemEnCours.querySelector(".ech");
    var fondSuppr = echItemEnCours.querySelector(".ech-fond-suppr");
    var fondEdit = echItemEnCours.querySelector(".ech-fond-modifier");

    if (carte) carte.style.transform = "translateX(" + nx + "px)";

    if (nx < 0) {
      if (fondSuppr) {
        fondSuppr.style.opacity = "1";
        fondSuppr.style.visibility = "visible";
      }
      if (fondEdit) {
        fondEdit.style.opacity = "0";
        fondEdit.style.visibility = "hidden";
      }
      if (carte) carte.style.boxShadow = "inset 0 0 0 1px var(--line), 3px 0 14px rgba(0, 0, 0, .14)";
    } else if (nx > 0) {
      if (fondEdit) {
        fondEdit.style.opacity = "1";
        fondEdit.style.visibility = "visible";
      }
      if (fondSuppr) {
        fondSuppr.style.opacity = "0";
        fondSuppr.style.visibility = "hidden";
      }
      if (carte) carte.style.boxShadow = "inset 0 0 0 1px var(--line), -3px 0 14px rgba(0, 0, 0, .14)";
    } else {
      if (fondSuppr) { fondSuppr.style.opacity = "0"; fondSuppr.style.visibility = "hidden"; }
      if (fondEdit) { fondEdit.style.opacity = "0"; fondEdit.style.visibility = "hidden"; }
      if (carte) carte.style.boxShadow = "";
    }

    echCurrentX = nx;
  }

  function echTouchFin(e) {
    if (!echItemEnCours) return;
    debrancherGesteEch();
    echItemEnCours.classList.remove("glissant");
    var item = echItemEnCours;
    var etaitArme = item.classList.contains("arme-declenchement");
    item.classList.remove("arme-declenchement");
    echItemEnCours = null;

    if (!enGlissementEch) return;

    glissementEchEffectue = true;
    setTimeout(function () { glissementEchEffectue = false; }, 120);

    var base = parseFloat(item.getAttribute("data-depart") || "0");
    // Récap sur mesure : loin à gauche = supprimer, loin à droite = modifier.
    var idxSrc = item.getAttribute("data-src-index");
    if (idxSrc != null && idxSrc !== "") {
      if (etaitArme) {
        fermerItemEch(item, true);
        if (echCurrentX < 0) srcRetirer(+idxSrc);
        else srcModifier(+idxSrc);
        return;
      }
    }
    var id = item.getAttribute("data-ech-id");
    var cle = item.getAttribute("data-ech-cle");
    var cible = cibleDeCle(cle);

    if (etaitArme) {
      fermerItemEch(item, true);
      if (echCurrentX < 0) {
        if (cible) supprimerEcheance(cible.c, id);
      } else {
        if (cible) ouvrirModifierEcheance(cible.c, id);
      }
      return;
    }

    if (base === 0) {
      if (echCurrentX < -SEUIL_OUVERTURE_ECH) {
        ouvrirGaucheEch(item);
      } else if (echCurrentX > SEUIL_OUVERTURE_ECH) {
        ouvrirDroiteEch(item);
      } else {
        fermerItemEch(item, true);
      }
    } else if (base < 0) {
      if (echCurrentX > -LARGEUR_ACTION_ECH + 20) {
        fermerItemEch(item, true);
      } else {
        ouvrirGaucheEch(item);
      }
    } else {
      if (echCurrentX < LARGEUR_ACTION_ECH - 20) {
        fermerItemEch(item, true);
      } else {
        ouvrirDroiteEch(item);
      }
    }
  }

  /* Le suivi du doigt n'est branché qu'au début d'un geste sur une
     échéance : une écoute « touchmove » non passive posée sur window en
     permanence empêcherait le navigateur de confier le défilement au
     compositeur (le scroll attendrait JavaScript à chaque image). */
  var gesteEchActif = false;
  function brancherGesteEch() {
    if (gesteEchActif) return;
    gesteEchActif = true;
    window.addEventListener("touchmove", echTouchBouge, { passive: false });
    window.addEventListener("mousemove", echTouchBouge);
  }
  function debrancherGesteEch() {
    if (!gesteEchActif) return;
    gesteEchActif = false;
    window.removeEventListener("touchmove", echTouchBouge);
    window.removeEventListener("mousemove", echTouchBouge);
  }
  document.addEventListener("touchstart", echTouchDebut, { passive: true });
  window.addEventListener("touchend", echTouchFin);
  window.addEventListener("touchcancel", echTouchFin);

  document.addEventListener("mousedown", echTouchDebut);
  window.addEventListener("mouseup", echTouchFin);

  document.addEventListener("contextmenu", function (e) {
    if (e.target.closest("[data-ech-valide]") || e.target.closest(".ech-action-btn")) return;
    var item = e.target.closest(".ech-item");
    if (!item) return;
    e.preventDefault();
    var dejaOuvert = item.getAttribute("data-ouvert") === "split" && !item._enFermeture;
    fermerTousItemsEch(null);
    if (!dejaOuvert) ouvrirSplitEch(item);
  });

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".ech-item") && !e.target.closest(".voile")) {
      fermerTousItemsEch(null);
    }
  });

  window.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    // Au clavier, Échap referme les options : le focus revient sur la carte
    // qui les a ouvertes, au lieu de se perdre dans la page.
    var actif = document.activeElement;
    var itemActif = actif && actif.closest ? actif.closest(".ech-item") : null;
    fermerTousItemsEch(null);
    if (itemActif) {
      var retour = itemActif.querySelector(".ech-ouvrir");
      if (retour) { try { retour.focus(); } catch (err) { /* jetable */ } }
    }
  });

  /* Ajout / validation / suppression / modification d'une échéance.
     Renvoie true si le clic est consommé. */
  function clicEcheance(e) {
    // Entrée/Espace déjà traité : le clic natif du bouton qui suit (quand
    // le navigateur l'émet quand même) ne doit pas refermer l'ouverture.
    if (echToucheClavier && Date.now() - echToucheClavier < 400 &&
        e.target.closest && e.target.closest(".ech-ouvrir")) {
      echToucheClavier = 0;
      return true;
    }
    var ajout = e.target.closest(".ech-add");
    if (ajout) {
      e.stopPropagation();
      var cible = cibleDeCle(ajout.getAttribute("data-ech-cible"));
      if (cible) {
        // Jour sans cours : on passe par le choix de l'heure (obligatoire),
        // jamais directement au formulaire sans heure.
        if (cible.c.debut) { echRetourJour = null; ouvrirEcheance(cible.c); }
        else ouvrirChoixCours(cible.c.jour);
      }
      return true;
    }
    var valide = e.target.closest("[data-ech-valide]");
    if (valide) {
      e.stopPropagation();
      var itemValide = valide.closest(".ech-item") || valide.closest(".ech");
      var cibleValide = itemValide && cibleDeCle(itemValide.getAttribute("data-ech-cle"));
      if (cibleValide) validerEcheance(cibleValide.c, valide.getAttribute("data-ech-valide"));
      return true;
    }
    var suppr = e.target.closest("[data-ech-suppr]");
    if (suppr) {
      e.stopPropagation();
      var ligneSuppr = suppr.closest(".ech-item") || suppr.closest(".ech") || suppr.closest(".pop-ech-detail");
      var cibleSuppr = ligneSuppr && cibleDeCle(ligneSuppr.getAttribute("data-ech-cle"));
      if (cibleSuppr) {
        fermerPop();
        if (ligneSuppr && ligneSuppr.classList.contains("ech-item")) fermerItemEch(ligneSuppr, true);
        supprimerEcheance(cibleSuppr.c, suppr.getAttribute("data-ech-suppr"));
      }
      return true;
    }
    var edit = e.target.closest("[data-ech-edit]");
    if (edit) {
      e.stopPropagation();
      var ligneEdit = edit.closest(".ech-item") || edit.closest(".ech") || edit.closest(".pop-ech-detail");
      var cibleEdit = ligneEdit && cibleDeCle(ligneEdit.getAttribute("data-ech-cle"));
      if (cibleEdit) {
        fermerPop();
        if (ligneEdit && ligneEdit.classList.contains("ech-item")) fermerItemEch(ligneEdit, true);
        ouvrirModifierEcheance(cibleEdit.c, edit.getAttribute("data-ech-edit"));
      }
      return true;
    }
    var carte = e.target.closest(".ech");
    if (carte) {
      if (glissementEchEffectue) return true;
      var item = carte.closest(".ech-item");
      if (item) {
        e.stopPropagation();
        var etat = item.getAttribute("data-ouvert");
        var estOuvert = etat && etat !== "0" && !item._enFermeture;
        if (estOuvert) {
          fermerItemEch(item, true);
        } else {
          fermerTousItemsEch(item);
          ouvrirSplitEch(item);
        }
        return true;
      }
    }
    return false;
  }

  function modifierProfil(id) {
    var p = profilParId(id);
    if (!p) return;
    if (estPerso(p)) { modifierPerso(p.id); return; }
    var noms = p.groupes.map(nomGroupe).join(" · ");
    var titreGroupes = p.groupes.length === 1 ? "1 groupe" : texteGroupe(p);
    var detailGroupes = p.groupes.length ? noms : "Toutes les séances s'affichent.";
    ouvrirEdition({
      titre: "Modifier l'horaire",
      theme: normaliserTheme(p.theme),
      corps:
        '<label class="champ-titre" for="edit-surnom">Nom</label>' +
        '<div class="champs halo"><div class="champ-ligne">' +
        '<input class="champ" id="edit-surnom" type="text" maxlength="24" autocomplete="off" spellcheck="false" ' +
        'placeholder="ex. Info, Droit" value="' + txt(p.surnom) + '"></div></div>' +
        '<p class="champ-titre">Thème de l\'horaire</p>' + htmlChoixThemes(p.theme) +
        '<p class="surnom-aide">Il colore toute l\'application pour cet horaire — touche une couleur pour voir le résultat.</p>' +
        '<p class="champ-titre">Tes groupes</p>' +
        '<button type="button" class="edition-groupes halo" data-edit-groupes="' + txt(p.id) + '">' +
        '<span class="eg-textes"><strong>' + txt(titreGroupes) + "</strong>" +
        "<small>" + txt(detailGroupes) + "</small></span>" +
        '<span class="eg-act">' + ICONE_CRAYON + "Modifier</span></button>" +
        '<dl class="edition-details">' +
        "<div><dt>Formation</dt><dd>" + txt(joliFormation(p.formation)) + "</dd></div>" +
        "<div><dt>École</dt><dd>" + txt(ecoleDe(p.ecole).nom) + "</dd></div></dl>",
      enregistrer: function (corps) {
        var nv = corps.querySelector("#edit-surnom").value.replace(/\s+/g, " ").trim().slice(0, 24);
        if (nv) p.surnom = nv;
        p.theme = normaliserTheme(edition.theme);
        sauverProfils();
        if (profil) { appliquerTheme(); afficherHoraire(); }
        rendreListeProfils();
      }
    });
  }
  function modifierIdentite() {
    var champ = function (id, auto, lib, val) {
      return '<div class="champ-ligne"><input class="champ" id="' + id + '" type="text" maxlength="30" autocomplete="' + auto +
        '" autocorrect="off" spellcheck="false" placeholder="' + lib + '" aria-label="' + lib + '" value="' + txt(val) + '"></div>';
    };
    ouvrirEdition({
      titre: "Ton nom",
      corps: '<div class="champs halo">' +
        champ("edit-prenom", "given-name", "Prénom", compte && compte.prenom) +
        champ("edit-nom", "family-name", "Nom", compte && compte.nom) + "</div>",
      enregistrer: function (corps) {
        var ip = corps.querySelector("#edit-prenom"), inn = corps.querySelector("#edit-nom");
        var p = ip.value.replace(/\s+/g, " ").trim().slice(0, 30);
        var n = inn.value.replace(/\s+/g, " ").trim().slice(0, 30);
        if (!p || !n) {
          corps.querySelector(".champs").classList.add("erreur");
          try { (p ? inn : ip).focus(); } catch (e) { /* jetable */ }
          return false;
        }
        if (!compte) compte = { fournisseur: "local", nom: "", prenom: "" };
        compte.prenom = p; compte.nom = n;
        sauverCompte();
        pousserIdentite();
        rendreAvatar();
        document.getElementById("reg-nom").textContent = p + " " + n;
      }
    });
  }
  /* ---------- Ajouter l'horaire à l'agenda ----------
     Le ⋮ d'une carte propose « Exporter ». Deux abonnements possibles,
     servis par /api/abonnement : le téléphone rappelle le flux tout seul,
     donc l'horaire reste à jour sans réexporter.
       • Tout l'horaire : un calendrier, une seule couleur ;
       • Cours par cours : un calendrier par cours, avec la couleur du
         cours dans l'app (le flux la porte : ICSx5 la lit, Apple la
         propose à l'abonnement).
     Rien n'est stocké côté serveur : le jeton signé décrit l'horaire à
     servir. Un horaire sur mesure (fusion de plusieurs sources) n'a pas
     d'équivalent côté serveur : il garde le fichier local.
     L'ouverture est une vraie balise (webcal:// sur iPhone et Android),
     pas un clic fabriqué : le geste du doigt doit porter l'adresse jusqu'à
     l'agenda, sinon il s'ouvre sans l'abonnement. Le flux est préchauffé
     pendant que la fenêtre est ouverte — au premier appel, la fonction
     d'abonnement relit l'école. */
  var exportCarte = null;   // { p, data, liens } de l'export ouvert
  var exportJeton = 0;      // invalide un chargement si la fenêtre est fermée
  function exportOuvert() { return !document.getElementById("voile-export").hidden; }
  /* Cours du profil : pour un horaire sur mesure, la fusion les a déjà
     filtrés ; sinon on garde ceux des groupes choisis (mêmes règles que
     l'affichage). */
  function coursDuProfil(p, data) {
    if (data.perso) return data.cours;
    var sel = p.groupes || [];
    return data.cours.filter(function (c) {
      if (!sel.length || !c.groupes.length) return true;
      return c.groupes.some(function (g) { return groupeDans(sel, g); });
    });
  }
  function donneesExport(p) {
    if (profil && profil.id === p.id && DATA) return Promise.resolve(DATA);
    var memo = memoProfil(p);
    if (memo) return Promise.resolve(memo);
    return chargerProfil(p);
  }
  function nomExport(p) {
    return propre(estRenomme(p) ? p.surnom : libelleProfil(p)) || "Mon horaire";
  }
  function resumeExport(p, data) {
    var vues = {}, seances = 0;
    coursDuProfil(p, data).forEach(function (c) {
      seances += (c.semaines || []).length;
      (c.semaines || []).forEach(function (s) { vues[s] = true; });
    });
    var n = Object.keys(vues).length;
    return n + " semaine" + (n > 1 ? "s" : "") + " · " + seances + " séance" + (seances > 1 ? "s" : "");
  }
  /* Couleur d'un cours en hexadécimal : même teinte que la palette de
     l'app, en ton moyen (une couleur d'agenda doit rester lisible). */
  function hslHex(h, s, l) {
    function f(n) {
      var k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
      var v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(255 * v).toString(16).padStart(2, "0");
    }
    return "#" + f(0) + f(8) + f(4);
  }
  function couleurCoursHex(matiere) {
    var t = couleurCours(matiere);
    return hslHex(t.h, Math.max(0.45, 0.62 - t.v * 0.08), (46 + t.v * 3) / 100);
  }
  /* Adresse d'abonnement (fabriquée et signée par le serveur) : le cours
     vide = tout l'horaire. */
  function lienAbonnement(p, cours, couleur, nom) {
    var q = [
      "action=lien",
      "ecole=" + encodeURIComponent(p.ical ? "" : (p.ecole || "")),
      "formation=" + encodeURIComponent(p.ical ? "" : (p.formation || "")),
      "groupes=" + encodeURIComponent(p.ical ? "" : (p.groupes || []).join("|")),
      "ical=" + encodeURIComponent(p.ical || ""),
      "cours=" + encodeURIComponent(cours || ""),
      "couleur=" + encodeURIComponent(couleur || ""),
      "nom=" + encodeURIComponent(nom || nomExport(p)),
      "uid=" + encodeURIComponent(p.id || "")
    ];
    return "/api/abonnement?" + q.join("&");
  }
  function demanderLien(p, cours, couleur, nom) {
    // Session ouverte : le serveur vérifie ce jeton Supabase et rattache
    // les devoirs du compte au lien signé (jeton v2). Sans session, le
    // lien reste v1 : les cours seuls.
    var entetes = {};
    if (sessionSupabase && sessionSupabase.access_token) {
      entetes.Authorization = "Bearer " + sessionSupabase.access_token;
    }
    return fetch(lienAbonnement(p, cours, couleur, nom), { cache: "no-store", headers: entetes })
      .then(function (r) {
        return r.json().then(function (rep) {
          if (!r.ok || !rep || !rep.url) throw new Error((rep && rep.erreur) || ("erreur " + r.status));
          return rep.url;
        });
      });
  }
  /* Adresse de l'abonnement telle qu'elle doit être ouverte : webcal://
     ouvre directement la boîte « S'abonner » de Calendrier sur iPhone
     (nom + couleur), et part vers l'application d'agenda sur Android
     (ICSx5 ou autre qui réclame le schéma webcal) — sans lui, Chrome
     téléchargerait le .ics au lieu d'ouvrir un agenda. Ailleurs
     (ordinateur), l'adresse https suffit. */
  function urlOuvrable(url) {
    return (estIOS() || estAndroid()) ? url.replace(/^https?:\/\//, "webcal://") : url;
  }
  /* Préchauffe le flux : c'est l'agenda du téléphone qui le lit, pas la
     page. Au premier appel, la fonction d'abonnement relit l'école
     (plusieurs secondes — son cache est par fonction, pas partagé avec
     /api/horaires) : c'est au premier essai que l'abonnement échoue. On la
     préchauffe donc pendant que la fenêtre est ouverte. Le corps est
     annulé dès les en-têtes : le travail serveur (école relue, flux
     construit) est fait, rien n'est téléchargé pour rien. */
  function prechaufferFlux(url) {
    if (!url || !window.fetch) return;
    fetch(url, { cache: "no-store" }).then(function (r) {
      try { if (r.body && r.body.cancel) r.body.cancel(); } catch (e) { /* jetable */ }
    }, function () { /* le tap réessaiera : rien à montrer */ });
  }
  /* Pastille + titre d'un cours, comme dans l'horaire. */
  function listeCoursExport(p, data) {
    var vus = {}, out = [];
    coursDuProfil(p, data).forEach(function (c) {
      var m = propre(c.matiere) || "Cours";
      if (vus[m]) return;
      vus[m] = true;
      out.push({
        matiere: m,
        titre: EXPORT_ICS.titreEvenement({ matiere: m, type: c.type || "" }),
        couleur: couleurCoursHex(m)
      });
    });
    out.sort(function (a, b) { return a.titre.localeCompare(b.titre, "fr"); });
    return out;
  }
  /* Horaire sur mesure : le .ics est fabriqué sur l'appareil (le serveur
     ne sait pas fusionner plusieurs sources). */
  function construireExport(p, data) {
    var cours = coursDuProfil(p, data).map(function (c) {
      return {
        jour: c.jour, debut: c.debut, fin: c.fin,
        matiere: c.matiere || "Cours",
        type: c.type || "",
        profs: c.profs || "",
        salles: c.salles || "",
        groupes: estPerso(p) || (p.groupes || []).length !== 1 ? (c.groupes || []) : [],
        semaines: c.semaines || []
      };
    });
    return EXPORT_ICS.construire({
      nom: nomExport(p),
      premierLundi: data.meta.premier_lundi,
      cours: cours
    }, { uid: p.id });
  }
  function telechargerExport(contenu, nom) {
    var blob = new Blob([contenu], { type: "text/calendar" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = nom;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // La révocation attend : sur mobile, le téléchargement démarre après
    // le clic, un retrait immédiat l'annulerait sans erreur.
    setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) { /* jetable */ } }, 30000);
  }
  /* Palette de l'agenda : les mêmes teintes que les cours, en ton moyen.
     La couleur du thème de l'horaire est présélectionnée. */
  var PALETTE_AGENDA = TEINTES.map(function (h) { return hslHex(h, 0.62, 0.46); });
  /* Met l'adresse sur la balise « Ajouter » : le tap est alors la
     navigation du doigt, comme un lien webcal d'une page ordinaire. Un
     clic fabriqué après une requête ferait perdre le geste — Calendrier
     s'ouvrirait sans l'abonnement, et il faudrait recommencer. */
  function majLienAjouter() {
    var a = document.getElementById("export-ajouter");
    var url = exportCarte && exportCarte.liens.tout;
    if (url) {
      a.href = urlOuvrable(url);
      a.classList.remove("attente");
    } else {
      a.removeAttribute("href");
      a.classList.add("attente");
    }
  }
  /* Prépare le lien « tout l'horaire ». Tant qu'il est prêt pour la
     couleur choisie, on le garde : le refabriquer ferait retomber le tap
     dans le chemin asynchrone (celui qui échoue sur iPhone). Refaite
     quand la couleur change. */
  function preparerLienTout(p) {
    if (!exportCarte) return;
    var couleur = exportCarte.couleur;
    if (exportCarte.liens.tout && exportCarte.liens.toutCouleur === couleur) return;
    exportCarte.liens.tout = null;
    majLienAjouter();
    demanderLien(p, "", couleur, nomExport(p)).then(function (url) {
      if (!exportCarte || exportCarte.couleur !== couleur) return;
      exportCarte.liens.tout = url;
      exportCarte.liens.toutCouleur = couleur;
      majLienAjouter();
      prechaufferFlux(url);
    }, function () { /* le clic réessaiera */ });
  }
  function rendreSwatches() {
    var zone = document.getElementById("export-swatches");
    var choisi = exportCarte && exportCarte.couleur;
    zone.innerHTML = PALETTE_AGENDA.map(function (c) {
      return '<button type="button" class="ec-swatch" data-couleur="' + txt(c) + '" role="radio" aria-checked="' +
        (c === choisi ? "true" : "false") + '" aria-label="Couleur ' + txt(c) + '" style="background:' + txt(c) + '"></button>';
    }).join("");
  }
  document.getElementById("export-swatches").addEventListener("click", function (e) {
    var b = e.target.closest("[data-couleur]");
    if (!b || !exportCarte) return;
    exportCarte.couleur = b.getAttribute("data-couleur");
    preparerLienTout(exportCarte.p);
    var opts = this.querySelectorAll("[data-couleur]");
    for (var i = 0; i < opts.length; i++) {
      opts[i].setAttribute("aria-checked", opts[i] === b ? "true" : "false");
    }
  });
  var ICONE_CHECK = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 13 4 4L19 7"/></svg>';
  /* Conflit d'un jour (horaire sur mesure) : paire de gants de boxe qui
     se font face, penchés l'un vers l'autre comme avant un combat.
     Pictogramme « boxing-glove » (graisse bold) de Phosphor Icons,
     licence MIT (https://phosphoricons.com), doublé en miroir. La teinte
     du conflit vient de currentColor (voir .choc-icone) ; les classes
     g1 (gauche) et g2 (droite) permettent de teinter chaque gant
     séparément (voir couleursChoc). */
  var ICONE_CONFLIT_D = "M168,12H120A60.08,60.08,0,0,0,60.13,68H56a36,36,0,0,0-36,36v29.19a20.13,20.13,0,0,0,4.38,12.5,11.46,11.46,0,0,0,.94,1L60,181v35a20,20,0,0,0,20,20H192a20,20,0,0,0,20-20V177.68l15.23-53.3a20.07,20.07,0,0,0,.77-5.5V72A60.07,60.07,0,0,0,168,12Zm36,106.32L188.46,172.7A12.28,12.28,0,0,0,188,176v36H84V176a12,12,0,0,0-3.56-8.53L44,131.45V104A12,12,0,0,1,56,92h4v12a12,12,0,0,0,24,0V72a36,36,0,0,1,36-36h48a36,36,0,0,1,36,36ZM166.66,162l-9,6,9,6a12,12,0,1,1-13.32,20L136,182.42,118.66,194a12,12,0,0,1-13.32-20l9-6-9-6a12,12,0,0,1,13.32-20L136,153.58,153.34,142a12,12,0,1,1,13.32,20Z";
  var ICONE_CONFLIT = '<svg width="48" height="28" viewBox="0 0 80 46" fill="currentColor" aria-hidden="true">' +
    '<g class="g1" transform="translate(22 23) rotate(65) translate(-22 -23) translate(6.64 7.64) scale(0.12)"><path d="' + ICONE_CONFLIT_D + '"/></g>' +
    '<g class="g2" transform="translate(58 23) rotate(-65) translate(-58 -23) translate(73.36 7.64) scale(-0.12 0.12)"><path d="' + ICONE_CONFLIT_D + '"/></g></svg>';
  /* Gant seul des cours en conflit : même pictogramme que la paire de
     l'en-tête. Non pivoté, il pointe vers le haut (cours du bas) ; la
     classe « vers-bas » le retourne vers le bas (cours du haut). La
     teinte vient de currentColor (voir .cpoint.choc-cours). */
  var ICONE_GANT = '<svg width="18" height="18" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="' + ICONE_CONFLIT_D + '"/></svg>';
  function statutExport(texte, genre) {
    var el = document.getElementById("export-status");
    el.className = "export-status" + (genre ? " " + genre : "");
    el.textContent = texte || "";
  }
  function montrerExport(vue) {
    document.getElementById("export-choix").hidden = vue !== "choix";
    document.getElementById("export-couleur-vue").hidden = vue !== "couleur";
    document.getElementById("export-liste").hidden = vue !== "liste";
    var retour = document.getElementById("export-retour");
    var ajouter = document.getElementById("export-ajouter");
    retour.hidden = vue === "choix";
    ajouter.hidden = vue !== "couleur";
    // Vue couleur : Retour + Ajouter suffisent (sinon trois boutons se chevauchent).
    document.getElementById("export-annuler").hidden = vue === "couleur";
    document.getElementById("export-actions").classList.toggle("seule", vue === "choix");
    majLienAjouter();
    statutExport("");
  }
  /* Une ligne de cours : pastille + titre + bouton. `fait` = déjà ajouté
     (le bouton passe au vert, et la ligne descend dans « Déjà ajoutés » —
     on ne peut pas savoir avec certitude que l'abonnement a été confirmé
     dans Calendrier, donc on peut toujours recommencer).
     Lien prêt : une vraie balise, dont le tap part seul vers l'agenda (le
     geste du doigt est intact). Sinon, un bouton qui le prépare et invite
     à retoucher. */
  function ligneCours(c, fait) {
    var interieur = '<span class="ec-point" style="background:' + txt(c.couleur) + '"></span>' +
      '<span class="ec-nom">' + txt(c.titre) + "</span>" +
      '<span class="ec-act' + (fait ? " fait" : "") + '">' +
      (fait ? ICONE_CHECK + "Ajouté" : "Ajouter") + "</span>";
    var url = !fait && exportCarte && exportCarte.liens[c.matiere];
    if (url) {
      return '<a class="export-cours-ligne" href="' + txt(urlOuvrable(url)) +
        '" data-matiere="' + txt(c.matiere) + '">' + interieur + "</a>";
    }
    return '<button type="button" class="export-cours-ligne' + (fait ? "" : " attente") +
      '" data-matiere="' + txt(c.matiere) + '">' + interieur + "</button>";
  }
  function rendreListeCours() {
    if (!exportCarte || !exportCarte.data) return;
    var liste = listeCoursExport(exportCarte.p, exportCarte.data);
    var aFaire = liste.filter(function (c) { return !exportCarte.ajoutes[c.matiere]; });
    var faits = liste.filter(function (c) { return exportCarte.ajoutes[c.matiere]; });
    document.getElementById("export-cours").innerHTML = aFaire.map(function (c) {
      return ligneCours(c, false);
    }).join("") || '<p class="export-vide">Tous les cours sont ajoutés.</p>';
    document.getElementById("export-ajoutes").hidden = !faits.length;
    document.getElementById("export-cours-ajoutes").innerHTML = faits.map(function (c) {
      return ligneCours(c, true);
    }).join("");
    document.getElementById("export-liste-aide").textContent = faits.length
      ? "Il reste " + aFaire.length + " cours à ajouter — " + faits.length + " déjà ajouté" + (faits.length > 1 ? "s" : "") + "."
      : "Chaque cours crée son calendrier, à sa couleur — " + liste.length + " au total.";
  }
  function exporterProfil(id) {
    var p = profilParId(id);
    if (!p) return;
    fermerMenus();
    var jeton = ++exportJeton;
    exportCarte = { p: p, data: null, liens: {}, ajoutes: {}, couleur: PALETTE_AGENDA[Math.max(0, THEMES.map(function (t) {
      return t.id;
    }).indexOf(normaliserTheme(p.theme)))] || PALETTE_AGENDA[0] };
    document.getElementById("export-titre").textContent = "Ajouter à mon agenda";
    document.getElementById("export-nom").textContent = nomExport(p);
    // Les devoirs et examens voyagent avec l'abonnement quand une session
    // est ouverte ; un lien déjà installé (v1) n'en a pas : le recopier.
    document.getElementById("export-echeances").hidden =
      !(SUPABASE_OK && sb && sessionSupabase && sessionSupabase.user);
    document.getElementById("export-annuler").hidden = false;
    document.getElementById("export-repli").hidden = true;
    montrerExport("choix");
    var tout = document.getElementById("export-tout");
    var parCours = document.getElementById("export-par-cours");
    tout.disabled = true;
    parCours.disabled = true;
    statutExport("Préparation de l'horaire…");
    document.getElementById("voile-export").hidden = false;
    document.body.classList.add("confirm-ouverte");
    histOuvrir("export");
    setTimeout(function () {
      try { document.getElementById("export-annuler").focus(); } catch (e) { /* jetable */ }
    }, 30);
    donneesExport(p).then(function (data) {
      if (jeton !== exportJeton || !exportCarte) return;
      if (!coursDuProfil(p, data).length) {
        statutExport("Aucun cours à exporter pour cet horaire.");
        return;
      }
      exportCarte.data = data;
      var perso = estPerso(p);
      document.getElementById("export-nom").textContent =
        nomExport(p) + " · " + resumeExport(p, data);
      if (perso) {
        // Sur mesure : la fusion n'existe pas côté serveur.
        tout.disabled = true;
        parCours.disabled = true;
        document.getElementById("export-repli").hidden = false;
        statutExport("Les horaires sur mesure ne sont pas encore disponibles en abonnement : télécharge le fichier.", "");
        return;
      }
      tout.disabled = false;
      parCours.disabled = false;
      // Repli toujours visible : si l'abonnement n'ouvre aucun agenda
      // (Android sans app d'abonnement, etc.), le fichier reste une sortie.
      document.getElementById("export-repli").hidden = false;
      statutExport("");
      // Prépare le lien « tout l'horaire » et préchauffe le flux : le tap
      // doit être une navigation native, et Calendrier doit recevoir un
      // flux déjà prêt.
      preparerLienTout(p);
    }, function (e) {
      if (jeton !== exportJeton || !exportCarte) return;
      statutExport("Impossible de préparer l'horaire" +
        (e && e.message ? " (" + String(e.message).slice(0, 120) + ")" : "") +
        ". Réessaie dans un instant.", "erreur");
    });
  }
  // « Tout l'horaire d'un coup » : on demande la couleur, puis Ajouter.
  document.getElementById("export-tout").addEventListener("click", function () {
    if (!exportCarte || !exportCarte.data) return;
    rendreSwatches();
    preparerLienTout(exportCarte.p);
    montrerExport("couleur");
  });
  document.getElementById("export-ajouter").addEventListener("click", function (e) {
    if (!exportCarte || !exportCarte.data) { e.preventDefault(); return; }
    if (!exportCarte.liens.tout) {
      // Lien pas encore prêt (rare : il est préparé à l'ouverture) : on le
      // prépare et on invite à retoucher. L'envoyer après une requête
      // ferait perdre le geste du doigt — Calendrier s'ouvrirait sans
      // l'abonnement.
      e.preventDefault();
      var p = exportCarte.p, couleur = exportCarte.couleur;
      statutExport("Préparation de l'abonnement…");
      demanderLien(p, "", couleur, nomExport(p)).then(function (url) {
        if (!exportCarte || exportCarte.couleur !== couleur) return;
        exportCarte.liens.tout = url;
        exportCarte.liens.toutCouleur = couleur;
        majLienAjouter();
        prechaufferFlux(url);
        statutExport(estIOS()
          ? "C'est prêt : touche « Ajouter » pour ouvrir Calendrier."
          : "C'est prêt : touche « Ajouter » pour ouvrir ton agenda.", "ok");
      }, function (err) {
        if (!exportCarte) return;
        statutExport("Impossible de créer l'abonnement" +
          (err && err.message ? " (" + String(err.message).slice(0, 120) + ")" : "") + ".", "erreur");
      });
      return;
    }
    // La balise porte l'adresse : la navigation qui suit est celle du
    // doigt (webcal sur iPhone et Android), donc l'agenda reçoit
    // l'abonnement du premier coup.
    statutExport(estIOS()
      ? "Calendrier s'ouvre : confirme l'abonnement."
      : "Ton agenda s'ouvre : confirme l'abonnement.", "ok");
  });
  document.getElementById("export-par-cours").addEventListener("click", function () {
    if (!exportCarte || !exportCarte.data) return;
    var p = exportCarte.p;
    var jeton = exportJeton;
    montrerExport("liste");
    statutExport("Préparation des liens…");
    // Tous les liens sont préparés avant l'affichage : chaque ligne est
    // alors une vraie balise, dont le tap part seul vers l'agenda.
    Promise.all(listeCoursExport(p, exportCarte.data).map(function (c) {
      return demanderLien(p, c.matiere, c.couleur, c.titre).then(function (url) {
        if (jeton === exportJeton && exportCarte) exportCarte.liens[c.matiere] = url;
      }, function () { /* la ligne se préparera au tap */ });
    })).then(function () {
      if (jeton !== exportJeton) return;
      rendreListeCours();
      statutExport("");
    });
  });
  document.getElementById("export-cours").addEventListener("click", function (e) {
    var b = e.target.closest("[data-matiere]");
    if (!b || !exportCarte || !exportCarte.data) return;
    var p = exportCarte.p, m = b.getAttribute("data-matiere");
    var c = null;
    listeCoursExport(p, exportCarte.data).forEach(function (x) { if (x.matiere === m) c = x; });
    if (!c) return;
    if (!exportCarte.liens[m]) {
      // Lien pas encore prêt : on le prépare et on invite à retoucher.
      e.preventDefault();
      var jeton = exportJeton;
      statutExport("Préparation de « " + c.titre + " »…");
      demanderLien(p, c.matiere, c.couleur, c.titre).then(function (url) {
        if (jeton !== exportJeton || !exportCarte) return;
        exportCarte.liens[m] = url;
        prechaufferFlux(url);
        rendreListeCours();
        statutExport("C'est prêt : touche à nouveau « " + c.titre + " ».", "ok");
      }, function (err) {
        if (!exportCarte) return;
        statutExport("Impossible de créer l'abonnement" +
          (err && err.message ? " (" + String(err.message).slice(0, 120) + ")" : "") + ".", "erreur");
      });
      return;
    }
    // La balise porte l'adresse : on laisse la navigation native partir,
    // et on marque la ligne sans la retirer du DOM tout de suite — la
    // retirer pendant le clic risquerait d'annuler la navigation.
    exportCarte.ajoutes[m] = true;
    var act = b.querySelector(".ec-act");
    if (act) { act.className = "ec-act fait"; act.innerHTML = ICONE_CHECK + "Ajouté"; }
    statutExport(estIOS()
      ? "Calendrier s'ouvre : confirme — sa couleur est déjà proposée."
      : "Ton agenda s'ouvre : confirme — sa couleur est déjà proposée.", "ok");
    setTimeout(function () {
      if (exportCarte && exportCarte.ajoutes[m]) rendreListeCours();
    }, 1500);
  });
  document.getElementById("export-retour").addEventListener("click", function () {
    montrerExport("choix");
  });
  function fermerExport() {
    exportJeton++;
    exportCarte = null;
    var voile = document.getElementById("voile-export");
    if (voile.hidden) return;
    histFermer("export");
    voile.hidden = true;
    document.body.classList.remove("confirm-ouverte");
  }
  document.getElementById("export-annuler").addEventListener("click", fermerExport);
  // Repli universel (sur mesure, ou abonnement sans app d'agenda) :
  // le fichier .ics est fabriqué sur l'appareil, rien à servir.
  document.getElementById("export-fichier").addEventListener("click", function () {
    if (!exportCarte || !exportCarte.data) return;
    try {
      var p = exportCarte.p;
      telechargerExport(construireExport(p, exportCarte.data), EXPORT_ICS.nomFichier(nomExport(p)));
      statutExport("Fichier téléchargé. Ouvre-le pour l'ajouter à ton agenda.", "ok");
    } catch (e) {
      statutExport("L'export a échoué. Réessaie dans un instant.", "erreur");
    }
  });
  document.getElementById("voile-export").addEventListener("click", function (e) {
    e.stopPropagation(); // un clic dans la fenêtre ne ferme pas les réglages derrière
    if (e.target === this) fermerExport();
  });
  function supprimerProfil(id) {
    var p = profilParId(id);
    if (!p) return;
    var nom = estRenomme(p) ? p.surnom : libelleProfil(p);
    demanderConfirmation({
      titre: "Supprimer cet horaire ?",
      message: "Supprimer l'horaire <strong>« " + txt(nom) + " »</strong> de cet appareil" +
               (sessionSupabase ? " et de ton compte" : "") + " ?<br>Cette action est définitive.",
      confirmer: "Supprimer",
      annuler: "Annuler",
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      var idx = profils.indexOf(p);
      if (idx >= 0) profils.splice(idx, 1);
      supprimerProfilDistant(id); // efface aussi la ligne cloud, si connecté
      oublierSemaines(id);        // et la mémoire des semaines vues
      oublierEcheances(id);       // et les devoirs / examens du cours
      if (profil && profil.id === id) profil = profils[Math.min(idx, profils.length - 1)] || null;
      carteOuverte = null;
      sauverProfils();
      fermerFeuille();
      fermerPdf();
      DATA = null;
      if (profil) {
        var memo = memoProfil(profil);
        if (memo) installer(memo);
        if (semaineAuto) sem = semaineCourante();
        resetDepliage(); deplierAujourdhui();
        afficherHoraire();
        actualiser().catch(function () { /* hors ligne */ });
      } else {
        pile = [];
        ouvrirEcoles();
      }
    });
  }
  /* ---------- Glisser-déposer des cartes d'horaires ----------
     Souris : la carte s'attrape dès qu'on la déplace (6 px). Tactile :
     appui long (~320 ms) avant que la carte ne se soulève — un doigt qui
     défile ne bouge donc jamais les horaires. On lâche : la carte se pose
     à l'endroit montré, et l'ordre part dans `profils`. */
  var dragCarte = null;   // geste en cours (null sinon)
  var dragClic = false;   // vrai après un drag : le clic de fin ne sélectionne pas
  var dragTimer = null;
  var APPUI_LONG = 200;   // ms (tactile) avant de soulever la carte
  var SEUIL_SOURIS = 6;   // px avant de démarrer un drag à la souris
  var SEUIL_SCROLL = 10;  // px : au-delà, le doigt part se promener, on laisse filer

  function cartesProfils() {
    return Array.prototype.slice.call(document.querySelectorAll("#liste-profils .pcard"));
  }
  function dragNettoyer() {
    if (dragTimer) { clearTimeout(dragTimer); dragTimer = null; }
    window.removeEventListener("pointermove", dragBouge);
    window.removeEventListener("pointerup", dragLache);
    window.removeEventListener("pointercancel", dragAnnule);
  }
  function dragSoulever() {
    dragTimer = null;
    if (!dragCarte || dragCarte.actif) return;
    dragCarte.actif = true;
    // Capture seulement maintenant : prise dès le pointerdown, elle
    // détournerait le clic du bouton vers la carte (un simple tap ne
    // sélectionnerait plus l'horaire).
    try { dragCarte.carte.setPointerCapture(dragCarte.pointerId); } catch (e) { /* Safari ancien */ }
    dragCarte.carte.classList.add("drag");
    document.getElementById("liste-profils").classList.add("geste");
    document.body.classList.add("drag-carte");
    // Petit retour haptique quand le téléphone le permet.
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) { /* jetable */ }
  }
  function dragBouge(e) {
    if (!dragCarte || e.pointerId !== dragCarte.pointerId) return;
    var dy = e.clientY - dragCarte.y0, dx = e.clientX - dragCarte.x0;
    if (!dragCarte.actif) {
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dragCarte.tactile) {
        // Le doigt part avant la fin de l'appui long : c'est un défilement.
        if (dist > SEUIL_SCROLL) dragTermine(false);
        return;
      }
      if (dist < SEUIL_SOURIS) return;
      dragSoulever();
    }
    e.preventDefault();
    dragCarte.bouge = true;
    dragCarte.carte.style.transform = "translateY(" + dy + "px)";
    // Position visée : on compte les cartes dont le milieu tombe au-dessus
    // du doigt (repères pris au soulèvement : ils ne bougent pas).
    var centre = dragCarte.rects[dragCarte.i0].top + dy + dragCarte.hauteur / 2;
    var cible = 0;
    for (var k = 0; k < dragCarte.rects.length; k++) {
      if (k === dragCarte.i0) continue;
      var r = dragCarte.rects[k];
      if (centre > r.top + r.height / 2) cible++;
    }
    if (cible === dragCarte.cible) return;
    dragCarte.cible = cible;
    // Les autres cartes s'écartent d'une place, dans le bon sens.
    for (var j = 0; j < dragCarte.cartes.length; j++) {
      var c = dragCarte.cartes[j];
      if (c === dragCarte.carte) continue;
      var t = "";
      if (dragCarte.i0 < cible && j > dragCarte.i0 && j <= cible) t = "translateY(" + (-dragCarte.pas) + "px)";
      else if (dragCarte.i0 > cible && j >= cible && j < dragCarte.i0) t = "translateY(" + dragCarte.pas + "px)";
      c.style.transform = t;
    }
  }
  function dragTermine(applique) {
    if (!dragCarte) return;
    var geste = dragCarte;
    dragNettoyer();
    dragCarte = null;
    geste.carte.classList.remove("drag");
    document.getElementById("liste-profils").classList.remove("geste");
    document.body.classList.remove("drag-carte");
    // Un vrai déplacement : le clic relâché juste après ne doit pas ouvrir
    // l'horaire. Un appui long sans mouvement, lui, reste un clic.
    if (geste.actif && geste.bouge) {
      dragClic = true;
      setTimeout(function () { dragClic = false; }, 400);
    }
    if (!geste.actif) return;
    if (applique && geste.cible !== geste.i0 && placerProfil(geste.id, geste.cible)) {
      rendreListeProfils();
      rendreSeg();
    } else {
      rendreListeProfils(); // pose la carte (ou la remet en place)
    }
  }
  function dragAnnule(e) {
    if (dragCarte && e && e.pointerId !== dragCarte.pointerId) return;
    dragTermine(false);
  }
  function dragLache(e) {
    if (dragCarte && e.pointerId !== dragCarte.pointerId) return;
    dragTermine(true);
  }
  document.getElementById("liste-profils").addEventListener("pointerdown", function (e) {
    if (dragCarte || profils.length < 2) return;
    if (e.button && e.button !== 0) return; // bouton droit : menu natif
    var carte = e.target.closest(".pcard");
    if (!carte || e.target.closest("[data-act]")) return;
    // Sans ce stop, la feuille prendrait ce doigt pour un glissé de fermeture.
    e.stopPropagation();
    var i0 = -1, cartes = cartesProfils();
    for (var k = 0; k < cartes.length; k++) if (cartes[k] === carte) i0 = k;
    if (i0 < 0) return;
    var r = carte.getBoundingClientRect();
    dragCarte = {
      id: carte.getAttribute("data-carte"), carte: carte, cartes: cartes, i0: i0,
      cible: i0, pas: r.height + 8, hauteur: r.height,
      rects: cartes.map(function (c) { return c.getBoundingClientRect(); }),
      x0: e.clientX, y0: e.clientY, pointerId: e.pointerId,
      tactile: e.pointerType !== "mouse", actif: false, bouge: false
    };
    if (dragCarte.tactile) dragTimer = setTimeout(dragSoulever, APPUI_LONG);
    window.addEventListener("pointermove", dragBouge, { passive: false });
    window.addEventListener("pointerup", dragLache);
    window.addEventListener("pointercancel", dragAnnule);
  });
  document.getElementById("liste-profils").addEventListener("click", function (e) {
    // Stoppe ici : chaque tap re-rend la liste (la cible est détachée),
    // et le détecteur de clic-extérieur fermerait la feuille par erreur.
    e.stopPropagation();
    if (dragClic) { dragClic = false; e.preventDefault(); return; }
    var a = e.target.closest("[data-act]");
    if (a) {
      var id = a.getAttribute("data-id"), act = a.getAttribute("data-act");
      if (act === "modifier") modifierProfil(id);
      else if (act === "exporter") exporterProfil(id);
      else if (act === "supprimer") { fermerMenus(); supprimerProfil(id); }
      else if (act === "annuler") fermerMenus();
      return;
    }
    var d = e.target.closest("button[data-flip]");
    if (d) {
      var did = d.getAttribute("data-flip");
      if (carteOuverte === did) remettreCarte(did);
      else { fermerMenus(); retournerCarte(did); }
      return;
    }
    // Clic sur le fond du dos : on remet la carte en place.
    fermerMenus();
  });
  // Dépliages : un seul écouteur, qui survit aux nouveaux rendus.
  // À l'ouverture, la carte (jour) ou le cours est recalé dans la zone
  // visible : sans ça, un vendredi déplié s'ouvre hors écran, vers le bas.
  function calerDansEcran(elt, haut) {
    if (!elt || bureau()) return;
    requestAnimationFrame(function () {
      try {
        var r = elt.getBoundingClientRect();
        var margeHaute = 12;
        var margeBasse = 12;
        if (haut) {
          // Jour : le contenu déborde en bas (ou la carte sort en haut) :
          // on remonte la carte un peu sous le haut de l'écran.
          if (r.bottom > window.innerHeight - margeBasse || r.top < margeHaute) {
            window.scrollTo({ top: r.top + window.scrollY - margeHaute, behavior: sansAnim ? "auto" : "smooth" });
          }
        } else if (r.bottom > window.innerHeight - margeBasse) {
          // Cours : on descend juste de quoi lire prof + salle.
          window.scrollBy({ top: r.bottom - window.innerHeight + margeBasse, behavior: sansAnim ? "auto" : "smooth" });
        } else if (r.top < margeHaute) {
          window.scrollBy({ top: r.top - margeHaute, behavior: sansAnim ? "auto" : "smooth" });
        }
      } catch (e) { /* jetable */ }
    });
  }
  // Hauteur du PDF mesurée au repos (zoom 1), par horaire : elle calibre
  // la réserve de place affichée pendant le chargement suivant, pour que
  // le cadrage tombe juste (ni vide béant, ni PDF coupé).
  function cleHauteurPdf() {
    var c = ciblePdf();
    return "ezh_pdf_h:" + profil.ecole + ":" + (c ? c.formation : profil.formation);
  }
  function memoriserHauteurPdf() {
    try {
      if (!profil || !pdfPagesEl || !pdfPagesEl.isConnected) return;
      if (Math.abs(pdfEchelle - 1) > 0.02) return; // zoomé : fausserait la mesure
      var h = Math.round(pdfPagesEl.offsetHeight + 70); // pages + astuce/marges
      if (h >= 200 && h <= window.innerHeight * 1.5) ecrire(cleHauteurPdf(), h);
    } catch (e) { /* jetable */ }
  }
  function hauteurPdfMemorisee() {
    try {
      if (!profil) return 0;
      var h = +lire(cleHauteurPdf());
      if (!(h >= 200)) return 0;
      return Math.min(h, Math.round(window.innerHeight * 0.85)); // jamais de vide béant
    } catch (e) { return 0; }
  }
  // PDF (téléphone) : UN SEUL cadrage, instantané, au moment du toucher.
  // Le bouton se cale sous le haut de l'écran pendant que la zone (qui
  // réserve déjà la place du futur PDF) charge. Ensuite, plus aucun
  // défilement : le contenu grandit vers le bas depuis une ancre stable.
  // (Un scroll animé + un second scroll à l'arrivée se battaient avec
  // l'agrandissement de la zone : saut en bas, flash, retour arrière.)
  // Sur ordinateur, la zone est un panneau latéral : rien à recaler.
  function calerPdf() {
    if (bureau()) return;
    var btn = document.getElementById("btn-pdf");
    if (!btn) return;
    try {
      var r = btn.getBoundingClientRect();
      if (Math.abs(r.top - 12) > 2) {
        window.scrollTo(0, r.top + window.scrollY - 12);
      }
    } catch (e) { /* jetable */ }
  }
  // L'utilisateur a-t-il défilé de lui-même pendant le chargement ? Si
  // oui, on ne touche plus à l'écran quand le PDF arrive.
  var pdfMainUtilisateur = false;
  function pdfPriseEnMain() { pdfMainUtilisateur = true; }
  function pdfSurveillerMain() {
    pdfMainUtilisateur = false;
    window.addEventListener("wheel", pdfPriseEnMain, { passive: true });
    window.addEventListener("touchmove", pdfPriseEnMain, { passive: true });
  }
  function pdfOublierMain() {
    window.removeEventListener("wheel", pdfPriseEnMain);
    window.removeEventListener("touchmove", pdfPriseEnMain);
  }
  // Correction finale unique, instantanée (aucune animation à combattre),
  // une fois le contenu en place : bouton sorti en haut → on le recale ;
  // sinon zone coupée en bas mais tenant à l'écran → on descend juste de
  // quoi tout voir. Si l'utilisateur a repris la main, on ne fait rien.
  function recadrerPdfFinal() {
    pdfOublierMain();
    if (bureau() || pdfMainUtilisateur) return;
    var btn = document.getElementById("btn-pdf"), zone = document.getElementById("pdf-zone");
    if (!btn || !zone || zone.hidden) return;
    try {
      var rb = btn.getBoundingClientRect(), rz = zone.getBoundingClientRect();
      if (rb.top < 12) {
        window.scrollTo(0, rb.top + window.scrollY - 12);
      } else if (rz.bottom > window.innerHeight &&
                 (rz.bottom - Math.max(rb.top, 12)) <= window.innerHeight - 24) {
        window.scrollBy(0, rz.bottom - window.innerHeight + 12);
      }
    } catch (e) { /* jetable */ }
  }
  document.getElementById("jours").addEventListener("click", function (e) {
    /* Pastille d'un cours — loupe, ou gant en cas de conflit : la recherche
       s'ouvre sur ses dates. Interceptée avant le reste de la ligne (le
       reste ouvre le détail). */
    var pr = e.target.closest(".cpoint[data-rech]");
    if (pr) {
      var mat = pr.getAttribute("data-rech");
      if (mat) { rcOuvrir(mat); return; }
    }
    if (clicEcheance(e)) return;
    var je = e.target.closest(".jour-ech-btn");
    if (je) { ouvrirChoixCours(+je.getAttribute("data-ech-jour")); return; }
    var c = e.target.closest(".cbtn");
    if (c) {
      // Cours sans échéance : rien à ouvrir. Jour à un seul cours : déjà
      // déroulé et non refermable.
      if (c.disabled || c.classList.contains("inactif") ||
          (c.closest && c.closest("li.c.seul"))) return;
      basculerCours(c.getAttribute("data-cle"));
      return;
    }
    var sb = e.target.closest(".supp-btn");
    if (sb) {
      basculerSupp(+sb.getAttribute("data-supp-jour"));
      return;
    }
    var b = e.target.closest(".day > button");
    if (!b) return;
    basculerJour(+b.getAttribute("data-jour"));
  });
  /* Déplier/replier un jour ou un cours : une classe sur l'élément, pas un
     nouveau rendu — le détail est déjà dans le DOM (la hauteur est animée
     en CSS). Un rendu complet ne servait qu'à ça. */
  function basculerJour(j, ouvrir) {
    var btn = document.querySelector('#jours .day > button[data-jour="' + j + '"]');
    var li = btn && btn.closest(".day");
    if (!li) return;
    if (ouvrir == null) ouvrir = !joursOuverts[j];
    if (ouvrir) joursOuverts[j] = true; else delete joursOuverts[j];
    li.classList.toggle("open", ouvrir);
    btn.setAttribute("aria-expanded", !!ouvrir);
    if (ouvrir) { calerDansEcran(li, true); return; }
    // Refermer le jour referme aussi ses cours (et l'état mémorisé, pour
    // qu'un rendu pendant que le jour est fermé les redessine repliés) et
    // les tiroirs d'échéance. Le cours « seul » garde son dépliage d'office.
    var prefixe = j + ":";
    Object.keys(coursOuverts).forEach(function (cle) {
      if (cle.indexOf(prefixe) === 0) delete coursOuverts[cle];
    });
    delete suppOuverts[j];
    var cours = li.querySelectorAll("li.c.open:not(.seul)");
    for (var i = 0; i < cours.length; i++) {
      cours[i].classList.remove("open");
      var b = cours[i].querySelector(".cbtn");
      if (b) b.setAttribute("aria-expanded", "false");
    }
    var boxSupp = li.querySelector(".box-supp.open");
    if (boxSupp) {
      boxSupp.classList.remove("open");
      var sb = boxSupp.querySelector(".supp-btn");
      if (sb) sb.setAttribute("aria-expanded", "false");
    }
    var echs = li.querySelectorAll(".ech-item");
    for (var k = 0; k < echs.length; k++) fermerItemEch(echs[k], false);
  }
  /* Borne de hauteur de la salle pour l'animation d'ouverture : la
     hauteur exacte du texte (mesurée à la largeur dépliée — le libellé
     « Salle : » prend 56 px une fois glissé), pour que l'heure de fin
     descende en douceur sur toute la durée, même sur trois lignes.
     Tout se fait dans la même image : pas de clignotement. */
  function bornerSalle(li) {
    var s = li && li.querySelector(".cinfo-salle .s");
    if (!s) return;
    var larg = s.clientWidth - 56;
    if (larg > 40) s.style.width = larg + "px";
    li.style.setProperty("--s-ouvert", s.scrollHeight + "px");
    s.style.width = "";
  }
  function basculerCours(cle, ouvrir) {
    var btn = document.querySelector('#jours .cbtn[data-cle="' + cle + '"]');
    var li = btn && btn.closest("li.c");
    if (!li) return;
    if (ouvrir == null) ouvrir = !coursOuverts[cle];
    if (ouvrir) coursOuverts[cle] = true; else delete coursOuverts[cle];
    if (ouvrir) bornerSalle(li);
    li.classList.toggle("open", ouvrir);
    btn.setAttribute("aria-expanded", !!ouvrir);
    if (ouvrir) calerDansEcran(li, false);
  }
  function basculerSupp(j, ouvrir) {
    var box = document.querySelector('#jours .box-supp[data-supp-jour="' + j + '"]');
    var btn = box && box.querySelector(".supp-btn");
    if (!box || !btn) return;
    if (ouvrir == null) ouvrir = !suppOuverts[j];
    if (ouvrir) suppOuverts[j] = true; else delete suppOuverts[j];
    box.classList.toggle("open", ouvrir);
    btn.setAttribute("aria-expanded", !!ouvrir);
    if (ouvrir) calerDansEcran(box, false);
  }

  document.getElementById("sem-prec").addEventListener("click", function () {
    var i = SEMAINES.indexOf(sem);
    if (i > 0) { sem = SEMAINES[i - 1]; semaineAuto = false; resetDepliage(); fermerPdf(); rendre(); }
  });
  document.getElementById("sem-suiv").addEventListener("click", function () {
    var i = SEMAINES.indexOf(sem);
    if (i < SEMAINES.length - 1) { sem = SEMAINES[i + 1]; semaineAuto = false; resetDepliage(); fermerPdf(); rendre(); }
  });
  document.getElementById("btn-auj").addEventListener("click", function () {
    sem = semaineCourante(); semaineAuto = true; resetDepliage(); fermerPdf(); rendre();
  });
  // Auto-déplier aujourd'hui s'il est affiché, qu'il y a cours et que le
  // dernier n'est pas fini. Passée la fin, rien ne s'ouvre — et le lendemain
  // ne s'ouvre qu'à minuit, quand il devient « aujourd'hui ».
  function deplierAujourdhui() {
    var auj = new Date();
    var maintenant = auj.getHours() * 60 + auj.getMinutes();
    for (var j = 0; j < 7; j++) {
      if (!memeJour(dateSemJour(sem, j), auj)) continue;
      var liste = coursDe(sem, j);
      if (!liste.length) break;
      var fin = 0, k;
      for (k = 0; k < liste.length; k++) {
        var f = liste[k] && liste[k].fin ? mins(liste[k].fin) : NaN;
        if (isFinite(f) && f > fin) fin = f;
      }
      if (!isFinite(fin) || fin <= 0 || maintenant < fin) joursOuverts[j] = true;
      break;
    }
  }

  /* Clic sur le bouton PDF : ouvre la visionneuse sous le bouton, à la
     largeur de l'écran. Plusieurs PDF possibles et rien choisi : on
     propose la liste d'abord, sans rien télécharger. Pendant le
     téléchargement, le texte d'attente balaie un reflet en boucle ; il
     disparaît dès que le PDF s'affiche. Un clic sur le PDF n'ouvre
     rien : le pincement zoome uniquement le PDF, jamais le reste du
     site. Un second clic sur le bouton masque. */
  document.getElementById("btn-pdf").addEventListener("click", function () {
    var btn = document.getElementById("btn-pdf");
    var zone = document.getElementById("pdf-zone");
    var status = document.getElementById("pdf-status");
    if (pdfCharge) return; // téléchargement en cours : on attend la boucle
    if (pdfOuvert) { fermerPdf(); return; }
    var maDemande = ++pdfDemande;
    chargerPdfJs().catch(function () { /* repli iframe au rendu */ }); // en parallèle du PDF
    pdfCharge = true; pdfOuvert = true;
    btn.disabled = true;
    majBoutonPdf();
    zone.hidden = false;
    var choixFait = majChoixPdf();
    if (choixFait === false) {
      // Plusieurs PDF, aucun choisi : la liste attend, rien à charger.
      pdfCharge = false;
      btn.disabled = false;
      majBoutonPdf();
      zone.classList.remove("attente");
      zone.style.minHeight = "";
      status.classList.remove("erreur");
      status.style.display = "";
      status.textContent = "Choisis le groupe ci-dessus : chaque groupe a son PDF officiel.";
      calerPdf();
      return;
    }
    zone.classList.add("attente"); // réserve la place du futur PDF
    var reservePdf = hauteurPdfMemorisee(); // vraie hauteur du PDF précédent, si connue
    if (reservePdf) zone.style.minHeight = reservePdf + "px";
    statutPdfAttente(status);
    calerPdf(); // un seul cadrage, immédiat : rien ne bouge après
    pdfSurveillerMain(); // un geste annule la correction finale
    var cible = ciblePdf();
    (cible && cible.semaine >= 1
      ? fetch("/api/pdf?ecole=" + encodeURIComponent(cible.ecole) +
          "&formation=" + encodeURIComponent(cible.formation) +
          "&groupe=" + encodeURIComponent(cible.groupe) +
          "&semaine=" + encodeURIComponent(cible.semaine), { cache: "no-store" })
      : Promise.reject(new Error("pas de PDF de cette année pour cette semaine.")))
      .then(function (r) {
        if (!r.ok) {
          return r.text().then(function (msg) {
            throw new Error((msg || ("erreur " + r.status)) + ".");
          }, function () {
            throw new Error("erreur " + r.status + ".");
          });
        }
        return r.blob();
      })
      .then(function (blob) {
        if (maDemande !== pdfDemande) return; // semaine changée entre-temps
        if (!blob || (blob.size === 0)) throw new Error("PDF vide.");
        tracerPdf(cible); // PDF bien reçu : compté pour le dashboard
        if (pdfURL) { try { URL.revokeObjectURL(pdfURL); } catch (e) { /* jetable */ } }
        pdfURL = URL.createObjectURL(blob);
        status.style.display = "none"; // le texte disparaît, le PDF est là
        var apercu = document.createElement("div");
        apercu.className = "pdf-apercu";
        var pince = document.createElement("div");
        pince.className = "pdf-pince";
        var pages = document.createElement("div");
        pages.className = "pdf-pages";
        pince.appendChild(pages);
        apercu.appendChild(pince);
        var dezoom = document.createElement("button");
        dezoom.type = "button";
        dezoom.className = "pdf-dezoom";
        dezoom.textContent = "Taille normale";
        dezoom.addEventListener("click", dezoomerPdf);
        apercu.appendChild(dezoom);
        pdfPagesEl = pages; pdfPinceEl = pince; pdfDezoomEl = dezoom; pdfEchelle = 1;
        pdfZoomable = true;
        surveillerPincePdf(pince);
        zone.appendChild(apercu);
        var astuce = document.createElement("p");
        astuce.className = "pdf-astuce";
        astuce.textContent = bureau()
          ? "Ctrl + molette ou double-clic pour zoomer à un endroit."
          : "Pincez ou touchez deux fois pour zoomer à un endroit.";
        zone.appendChild(astuce);
        pdfCharge = false;
        btn.disabled = false;
        majBoutonPdf();
        // Le contenu est arrivé mais les pages se dessinent une par une :
        // la réserve de hauteur RESTE jusqu'au rendu complet (voir plus
        // bas) pour éviter que la zone s'écrase puis regonfle en flash.
        // Aucun défilement ici : l'écran ne bouge plus.
        // Rendu en images : si indisponible, repli sur le visualiseur natif.
        function repliIframe() {
          if (maDemande !== pdfDemande || !pages.isConnected) return;
          pdfZoomable = false; // le visualiseur natif gère son propre zoom
          pdfEchelle = 1; zoomPdfAppliquer();
          pages.innerHTML = "";
          var frame = document.createElement("iframe");
          frame.className = "pdf-frame";
          frame.title = "PDF officiel de la semaine " + sem;
          frame.src = pdfURL;
          pages.appendChild(frame);
          var zi = document.getElementById("pdf-zone");
          if (zi) { zi.classList.remove("attente"); zi.style.minHeight = ""; }
          memoriserHauteurPdf(); recadrerPdfFinal(); // hauteur fixe immédiate : on corrige tout de suite
        }
        chargerPdfJs().then(function (pdfjsLib) {
          try {
            pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + "pdf.worker.min.js";
          } catch (e) { /* ouvrier déjà réglé */ }
          return blob.arrayBuffer().then(function (buf) {
            if (maDemande !== pdfDemande) return;
            pdfjsLib.getDocument({ data: buf, isEvalSupported: false }).promise.then(function (doc) {
              if (maDemande !== pdfDemande) { try { doc.destroy(); } catch (e) { /* jetable */ } return; }
              oublierPdfDoc();
              pdfDoc = doc;
              rendrePagesPdf(pages);
            }, repliIframe);
          });
        }).catch(repliIframe);
      }, function (e) {
        if (maDemande !== pdfDemande) return;
        pdfCharge = false; pdfOuvert = true; // zone reste ouverte sur l'erreur
        status.classList.add("erreur");
        status.style.display = "";
        status.textContent = "Échec : " + (e && e.message || "erreur inconnue.") + " Touchez le bouton pour réessayer.";
        btn.disabled = false;
        majBoutonPdf();
        zone.classList.remove("attente");
        zone.style.minHeight = "";
        recadrerPdfFinal();
      });
  });

  /* Bouton « Échéance » global (ordinateur) : active le filtre transparent sur les jours. */
  var btnEchGlobal = document.getElementById("btn-ech-global");
  if (btnEchGlobal) {
    btnEchGlobal.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleModeEch();
    });
  }
  var calEl = document.getElementById("cal");
  if (calEl) {
    calEl.addEventListener("click", function (e) {
      if (!modeEchActif) return;
      var b = e.target.closest(".cal-col-depot");
      if (!b) {
        fermerModeEch();
        return;
      }
      e.stopPropagation();
      var j = +b.getAttribute("data-ech-col");
      fermerModeEch();
      echDernierFocus = btnEchGlobal;
      // Avec ou sans cours : le choix passe par l'étape 1, qui impose
      // l'heure quand il n'y a pas de cours (voir ouvrirChoixCours).
      ouvrirChoixCours(j);
    });
  }

  /* ---------- Apparence : un seul bouton, chaque clic passe au mode
     suivant (Système -> Claire -> Sombre -> Système, mémorisé localement) ---------- */
  var CLE_APPARENCE = "ezh_apparence";
  var APP_SUIVANTE = { systeme: "clair", clair: "sombre", sombre: "systeme" };
  var ICONE_SOLEIL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var ICONE_LUNE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 13.5A8 8 0 0 1 10.5 4 8 8 0 1 0 20 13.5z"/></svg>';
  var ICONE_SYSTEME = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6M12 16v4"/></svg>';
  function lireApparence() {
    try {
      var v = localStorage.getItem(CLE_APPARENCE);
      return (v === "clair" || v === "sombre" || v === "systeme") ? v : "systeme";
    } catch (e) { return "systeme"; }
  }
  function rgbVersHex(rgb) {
    var m = String(rgb || "").match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) return null;
    function h(n) { n = Math.max(0, Math.min(255, +n || 0)); var s = n.toString(16); return s.length < 2 ? "0" + s : s; }
    return "#" + h(m[1]) + h(m[2]) + h(m[3]);
  }
  /* Barre du navigateur / PWA : suit le fond réel (teinte de l'horaire incluse).
     En « Système » on laisse les deux metas media faire leur travail. */
  function majMetaTheme() {
    var clair = document.querySelector('meta[name="theme-color"][media*="light"]');
    var sombre = document.querySelector('meta[name="theme-color"][media*="dark"]');
    var v = lireApparence();
    if (v === "systeme") {
      if (clair) clair.setAttribute("media", "(prefers-color-scheme: light)");
      if (sombre) sombre.setAttribute("media", "(prefers-color-scheme: dark)");
      return;
    }
    var fond = null;
    try { fond = rgbVersHex(getComputedStyle(document.body).backgroundColor); } catch (e) { fond = null; }
    if (!fond) fond = (v === "sombre") ? "#101216" : "#f4f5f7";
    if (clair) { clair.setAttribute("content", fond); clair.setAttribute("media", "all"); }
    if (sombre) sombre.setAttribute("media", "not all");
  }
  function appliquerApparence() {
    var v = lireApparence();
    document.documentElement.setAttribute("data-apparence", v);
    var libelle = v === "clair" ? "Claire" : v === "sombre" ? "Sombre" : "Système";
    var lib = document.getElementById("apparence-lib");
    if (lib) lib.textContent = libelle;
    var ic = document.getElementById("apparence-icone");
    if (ic) ic.innerHTML = v === "clair" ? ICONE_SOLEIL : v === "sombre" ? ICONE_LUNE : ICONE_SYSTEME;
    var btn = document.getElementById("btn-apparence");
    if (btn) btn.setAttribute("aria-label", "Apparence : " + libelle + ", activer pour changer");
    majMetaTheme();
  }
  function choisirApparence(v) {
    if (v !== "clair" && v !== "sombre" && v !== "systeme") return;
    try { localStorage.setItem(CLE_APPARENCE, v); } catch (e) { /* navigation privée */ }
    appliquerApparence();
  }
  document.getElementById("btn-apparence").addEventListener("click", function () {
    remettreCompte();
    if (carteOuverte !== null) { carteOuverte = null; rendreListeProfils(); }
    choisirApparence(APP_SUIVANTE[lireApparence()] || "systeme");
  });
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").addEventListener) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
      if (lireApparence() === "systeme") majMetaTheme();
    });
  }
  /* Le fond change aussi avec la couleur de l'horaire : on resynchronise
     la barre du navigateur quand le thème coloré change. */
  if (window.MutationObserver) {
    new MutationObserver(function () { majMetaTheme(); })
      .observe(document.body, { attributes: true, attributeFilter: ["data-theme"] });
  }
  appliquerApparence();

  /* ---------- Feuille : avatar + nom/prénom, puis mes horaires ---------- */
  var feuille = document.getElementById("feuille");
  var NOMS_FOURNISSEURS = { google: "Compte Google", apple: "Compte Apple", github: "Compte GitHub", email: "Compte email", local: "Compte local" };
  /* Mêmes logos que les boutons de connexion (taille réduite pour la feuille). */
  var LOGO_GOOGLE = '<svg width="14" height="14" viewBox="0 0 48 48" aria-hidden="true">' +
    '<path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>' +
    '<path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>' +
    '<path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>' +
    '<path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
  var LOGO_GITHUB = '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
    '<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';
  /* Sous le nom : l'adresse ou le pseudo selon le fournisseur.
     Google -> logo + email, GitHub -> logo + @pseudo (email en repli),
     email/Apple -> email seul, sinon l'ancien libellé (« Compte… »). */
  function rendreLigneFournisseur() {
    var el = document.getElementById("reg-fournisseur");
    if (!el || !compte) return;
    var direct = (sessionSupabase && sessionSupabase.user) || AUTH.user || null;
    var email = String((compte && compte.email) || (direct && direct.email) || "").trim();
    var pseudo = String((compte && compte.pseudo) || pseudoDepuisUser(direct) || "").trim().replace(/^@+/, "");
    var f = compte.fournisseur;
    el.textContent = "";
    el.removeAttribute("title");
    function logo(svg) {
      var w = document.createElement("span");
      w.className = "reg-f-logo";
      w.setAttribute("aria-hidden", "true");
      w.innerHTML = svg;
      el.appendChild(w);
    }
    function contact(t) {
      var s = document.createElement("span");
      s.className = "reg-f-contact";
      s.textContent = t;
      el.appendChild(s);
      el.setAttribute("title", t);
    }
    function repli() { el.textContent = NOMS_FOURNISSEURS[f] || "Compte"; }
    if (f === "google") {
      if (!email) { repli(); return; }
      logo(LOGO_GOOGLE);
      contact(email);
    } else if (f === "github") {
      if (pseudo) { logo(LOGO_GITHUB); contact("@" + pseudo); }
      else if (email) { logo(LOGO_GITHUB); contact(email); }
      else repli();
    } else if (f === "email" || f === "apple") {
      if (!email) { repli(); return; }
      contact(email);
    } else {
      repli();
    }
  }
  function ouvrirFeuille() {
    rendreAvatar();
    if (compte) {
      document.getElementById("reg-nom").textContent =
        ((compte.prenom || "") + " " + (compte.nom || "")).replace(/\s+/g, " ").trim() || "Mon compte";
      rendreLigneFournisseur();
    }
    carteOuverte = null;
    remettreCompte();
    appliquerApparence();
    majCaseNotifs();
    tirerNotifs();
    rendreListeProfils();
    feuille.style.transform = "";
    feuille.classList.add("visible");
    document.body.classList.add("sheet-ouverte");
    histOuvrir("feuille");
    verifierAdmin(); // révèle « Tableau admin » si le compte est admin
  }
  function fermerFeuille() {
    if (!feuille.classList.contains("visible")) return;
    fermerMenus(); // la carte retournée est sous la feuille : la remettre d'abord
    feuille.classList.remove("dragging");
    feuille.style.transform = "";
    feuille.classList.remove("visible");
    document.body.classList.remove("sheet-ouverte");
    histFermer("feuille");
  }
  document.getElementById("btn-moi").addEventListener("click", function () {
    if (feuille.classList.contains("visible")) fermerFeuille(); else ouvrirFeuille();
  });
  // Copies du bouton profil sur la page de recherche : la feuille s'ouvre
  // par-dessus (voir z-index), la recherche reste telle quelle dessous.
  Array.prototype.forEach.call(document.querySelectorAll(".rc-moi"), function (b) {
    b.addEventListener("click", function () {
      if (feuille.classList.contains("visible")) fermerFeuille(); else ouvrirFeuille();
    });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (echeanceOuverte()) { fermerEcheance(); return; } // au-dessus de la recherche
    if (rechCoursOuverte()) {
      // Pastille d'un cours : Échap ferme directement (pas de liste).
      if (rcDirect) rcFermer(); else rcRetourListe();
      return;
    }
    if (exportOuvert()) { fermerExport(); return; }
    if (bugOuvert()) { fermerBug(); return; }
    if (notifsOuvertes()) { fermerNotifs(); return; }
    if (confirmationOuverte() || editionOuverte()) return;
    if (dragCarte) { dragTermine(false); return; } // Échap repose la carte
    if (menusOuverts()) { fermerMenus(); return; } // Échap ferme d'abord le menu, puis les réglages
    fermerFeuille(); fermerPop();
  });
  /* Glissé vers le bas : suit le doigt, puis ferme ou revient en place.
     Ne démarre pas sur les boutons pour ne pas bloquer le clic. */
  (function () {
    var debutY = 0, dy = 0, enCours = false, debutT = 0;
    feuille.addEventListener("pointerdown", function (e) {
      if (!feuille.classList.contains("visible") || bureau()) return; // menu fixe sur ordinateur
      if (e.target.closest("button")) return;
      enCours = true; debutY = e.clientY; dy = 0; debutT = Date.now();
      feuille.classList.add("dragging");
      try { feuille.setPointerCapture(e.pointerId); } catch (err) { /* Safari */ }
    });
    feuille.addEventListener("pointermove", function (e) {
      if (!enCours) return;
      dy = e.clientY - debutY;
      if (dy < 0) dy = 0;
      if (dy > 0) feuille.style.transform = "translateY(" + dy + "px)";
    });
    function fin() {
      if (!enCours) return;
      enCours = false;
      feuille.classList.remove("dragging");
      var duree = Math.max(1, Date.now() - debutT);
      var vitesse = dy / duree; // px/ms
      if (dy > 90 || (dy > 30 && vitesse > 0.5)) fermerFeuille();
      else feuille.style.transform = "";
    }
    feuille.addEventListener("pointerup", fin);
    feuille.addEventListener("pointercancel", fin);
  })();
  /* Rechoix des groupes : depuis la fenêtre Modifier d'un horaire, ou
     depuis l'avis quand ceux de l'école ont disparu. L'écran de l'étape 3
     reprend la sélection existante (editionId) ; « Voir mon horaire »
     enregistre les groupes et réaffiche la semaine. Le nom et la couleur
     en cours de saisie dans la fenêtre suivent, pour ne rien perdre. */
  function changerGroupe(id, surnom, theme) {
    var p = id ? profilParId(id) : profil;
    if (!p) return;
    if (estPerso(p)) { modifierPerso(p.id); return; }
    var actif = profil && profil.id === p.id;
    var data = null;
    if (actif && DATA) data = DATA;
    else {
      // Horaire non affiché : le cache local suffit pour ouvrir l'écran
      // tout de suite ; sinon ouvrirGroupes le télécharge.
      var memo = lire(cleHoraire(p.ecole, p.formation, p.ical));
      if (valide(memo)) data = memo;
    }
    fermerEdition();
    fermerFeuille();
    document.getElementById("surnom").value = surnom || p.surnom;
    choix = {
      ecole: p.ecole, formation: p.formation, data: data,
      groupes: p.groupes.slice(), ical: p.ical || null, editionId: p.id,
      theme: normaliserTheme(theme == null ? p.theme : theme),
      surnomEdit: surnom || p.surnom
    };
    aller("groupes");
  }
  document.getElementById("btn-ajouter").addEventListener("click", function () {
    fermerFeuille();
    demarrerAjout();
  });
  /* Quitter la simulation (école de test) : retire les horaires simulés et
     leur cache, remet ceux mis de côté à l'entrée (ezh_sim_sauve, voir
     lab/simulation.html) et rend le menu du labo, d'où l'on choisit 1 ou 4
     horaires. Sans horaire simulé, le bouton est caché. */
  document.getElementById("btn-quitter-sim").addEventListener("click", function () {
    var sauve = lire(CLE_SIM_SAUVE);
    profils = profils.filter(function (p) {
      if (p.ecole !== "sim") return true;
      try { localStorage.removeItem(cleHoraire(p.ecole, p.formation, p.ical)); } catch (e) { /* jetable */ }
      return false;
    });
    if (Array.isArray(sauve) && sauve.length) {
      sauve.forEach(function (p) { if (profilValide(p)) profils.push(p); });
      try { localStorage.removeItem(CLE_SIM_SAUVE); } catch (e) { /* jetable */ }
    }
    // Échéances de la simulation : elles partent avec elle (celles des
    // vrais horaires restent intactes).
    var tousEch = lireEcheancesTout(), vu = false;
    Object.keys(tousEch).forEach(function (pid) {
      if (pid.indexOf("sim-") === 0) { delete tousEch[pid]; vu = true; }
    });
    if (vu) ecrire(CLE_ECHEANCES, tousEch);
    if (!profils.length) {
      profil = null;
      // Compte de circonstance du mode essai : on repart propre.
      if (compte && compte.fournisseur === "essai") {
        compte = null;
        try { localStorage.removeItem(CLE_COMPTE); } catch (e) { /* jetable */ }
      }
    } else if (!profils.some(function (p) { return profil && p.id === profil.id; })) {
      profil = profils[0];
    }
    sauverProfils();
    location.href = "lab/simulation.html";
  });
  /* Carte du compte : elle se retourne au clic (comme les cartes
     d'horaires) et son dos porte Modifier / Notifications /
     Se déconnecter (+ Tableau admin pour un compte admin). Un clic
     ailleurs dans les réglages la remet en place. */
  function deconnecterCompte() {
    demanderConfirmation({
      titre: "Se déconnecter ?",
      message: "Tes horaires restent enregistrés sur ton compte.<br>Tu pourras les retrouver en te reconnectant.",
      confirmer: "Se déconnecter",
      annuler: "Rester connecté",
      danger: false
    }).then(function (ok) {
      if (!ok) return;
      fermerFeuille();
      fermerPdf();
      rcFermer(); // la feuille est aussi ouvrable depuis la recherche
      AUTH.logout().then(function () {
        pile = [];
        ouvrirCompte();
      });
    });
  }
  document.getElementById("reg-compte").addEventListener("click", function (e) {
    // Stoppe ici : le clic-extérieur de la feuille remettrait la carte
    // aussitôt (même raison que la liste des horaires).
    e.stopPropagation();
    var a = e.target.closest("[data-act]");
    if (a) {
      var act = a.getAttribute("data-act");
      remettreCompte();
      if (act === "compte-modifier") modifierIdentite();
      else if (act === "compte-notifs") ouvrirNotifs();
      else if (act === "compte-deconnecter") deconnecterCompte();
      else if (act === "compte-admin") { fermerFeuille(); location.href = "dashboard.html"; }
      return;
    }
    if (e.target.closest("#btn-bug-compte")) return; // la coccinelle a sa propre action
    if (!e.target.closest("#btn-reg-flip")) return;
    if (compteRetourne) remettreCompte(); else retournerCompte();
  });
  feuille.addEventListener("click", function (e) {
    if (!e.target.closest(".dots")) fermerMenus();
  });
  /* ---------- Signaler un bug / faire une demande ----------
     Boutons : coccinelle de la feuille (#btn-bug-compte), pied de page
     (#lien-bug-footer) et petits liens de chaque étape ([data-bug], pour
     les comptes pas encore créés). Un rail Bug / Demande en haut de la
     fenêtre choisit le type (data-bug-type="demande" sur un lien l'ouvre
     directement en demande). La fenêtre montre l'email du compte
     quand il existe, sinon rien n'est demandé. Les captures sont
     compressées (max 1280 px, JPEG) puis téléversées vers le bucket privé
     `bug-images` ; /api/bugs ne reçoit que leurs chemins. */
  var BUG_MAX_IMAGES = 3, BUG_TAILLE_MAX = 1280;
  var bugImages = []; // {blob, url} après compression
  var bugEtape = "";
  var bugType = "bug"; // "bug" | "demande"
  var BUG_TEXTE = {
    bug: { titre: "Signaler un bug", label: "Que se passe-t-il ?",
      sujet: "ex. Horaire de l'an dernier affiché",
      placeholder: "ex. Mon horaire de bac 2 info affiche les cours de l'an dernier depuis lundi…",
      vide: "Décris le bug en quelques mots.", merci: "Merci, c'est envoyé. On s'en occupe." },
    demande: { titre: "Faire une demande", label: "Qu'aimerais-tu ?",
      sujet: "ex. Comparer deux horaires",
      placeholder: "ex. Pouvoir comparer deux horaires côte à côte, ou ajouter mon école…",
      vide: "Décris ta demande en quelques mots.", merci: "Merci, c'est noté. On y jettera un œil." }
  };
  function definirBugType(t) {
    if (t !== "demande") t = "bug";
    bugType = t;
    var rail = document.getElementById("bug-rail");
    if (rail) {
      rail.style.setProperty("--idx", t === "demande" ? "1" : "0");
      Array.prototype.forEach.call(rail.querySelectorAll("[data-bug-type]"), function (b) {
        b.setAttribute("aria-pressed", b.getAttribute("data-bug-type") === t ? "true" : "false");
      });
    }
    var txt = BUG_TEXTE[t];
    document.getElementById("bug-titre").textContent = txt.titre;
    document.getElementById("bug-message-label").textContent = txt.label;
    document.getElementById("bug-message").placeholder = txt.placeholder;
    document.getElementById("bug-sujet").placeholder = txt.sujet;
  }
  function bugEmail() {
    var direct = (sessionSupabase && sessionSupabase.user) || AUTH.user || null;
    return String((compte && compte.email) || (direct && direct.email) || "").trim();
  }
  function bugEtapeCourante() {
    // L'écran affiché fait foi (vue = compte/identite/ecole/…/horaire).
    if (typeof vue === "string" && vue) return "v-" + vue;
    return "";
  }
  function bugContexte(prefill) {
    var ctx = {};
    try {
      ctx.ua = String(navigator.userAgent || "").slice(0, 200);
      ctx.largeur = window.innerWidth || 0;
      if (choix && choix.ecole) ctx.ecole = choix.ecole;
      if (choix && choix.formation) ctx.formation = String(choix.formation).slice(0, 160);
      if (prefill) ctx.donnee = String(prefill).slice(0, 300);
    } catch (e) { /* jetable */ }
    return ctx;
  }
  function bugOuvert() {
    var v = document.getElementById("voile-bug");
    return !!v && !v.hidden;
  }
  function ouvrirBug(premiere, typeVoulu) {
    bugEtape = bugEtapeCourante();
    definirBugType(typeVoulu === "demande" || typeVoulu === "bug" ? typeVoulu : bugType);
    var ligne = document.getElementById("bug-email-ligne");
    var email = bugEmail();
    if (email) {
      ligne.hidden = false;
      ligne.innerHTML = "";
      ligne.appendChild(document.createTextNode("Envoyé en tant que "));
      var fort = document.createElement("strong");
      fort.textContent = email;
      ligne.appendChild(fort);
    } else {
      ligne.hidden = true;
      ligne.innerHTML = "";
    }
    if (premiere) {
      var zone = document.getElementById("bug-message");
      var pre = String(premiere).slice(0, 300);
      if (pre && !zone.value) zone.value = pre;
    }
    statutBug("", false);
    document.getElementById("bug-depot").hidden = true;
    var voile = document.getElementById("voile-bug");
    voile.classList.remove("sortie");
    voile.hidden = false;
    document.body.classList.add("confirm-ouverte");
    histOuvrir("bug");
    setTimeout(function () {
      // Le titre d'abord, sauf s'il est déjà rempli (réouverture après un échec).
      var champ = document.getElementById(document.getElementById("bug-sujet").value ? "bug-message" : "bug-sujet");
      try { champ.focus({ preventScroll: true }); } catch (e) { champ.focus(); }
    }, 60);
  }
  function fermerBug(sansAnim) {
    var voile = document.getElementById("voile-bug");
    if (voile.hidden) return;
    histFermer("bug");
    function fin() {
      voile.hidden = true;
      voile.classList.remove("sortie");
      document.body.classList.remove("confirm-ouverte");
      if (document.activeElement && voile.contains(document.activeElement)) {
        try { document.activeElement.blur(); } catch (e) {}
      }
    }
    if (sansAnim) fin();
    else { voile.classList.add("sortie"); setTimeout(fin, 180); }
  }
  function statutBug(msg, erreur) {
    var el = document.getElementById("bug-status");
    el.textContent = msg || "";
    el.className = !msg ? "" : (erreur ? "erreur" : "ok");
  }
  function rendreBugApercus() {
    var zone = document.getElementById("bug-apercus");
    zone.innerHTML = "";
    bugImages.forEach(function (img, i) {
      var fig = document.createElement("div");
      fig.className = "bug-apercu";
      var im = document.createElement("img");
      im.src = img.url;
      im.alt = "Capture " + (i + 1);
      fig.appendChild(im);
      var suppr = document.createElement("button");
      suppr.type = "button";
      suppr.setAttribute("aria-label", "Retirer l'image " + (i + 1));
      suppr.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      suppr.addEventListener("click", function () {
        try { URL.revokeObjectURL(bugImages[i].url); } catch (e) {}
        bugImages.splice(i, 1);
        rendreBugApercus();
      });
      fig.appendChild(suppr);
      zone.appendChild(fig);
    });
    document.getElementById("bug-compte").textContent = bugImages.length + " / " + BUG_MAX_IMAGES;
  }
  function compresserImage(fichier) {
    return new Promise(function (ok, ko) {
      var url = URL.createObjectURL(fichier);
      var img = new Image();
      img.onload = function () {
        try { URL.revokeObjectURL(url); } catch (e) {}
        var l = img.naturalWidth || 0, h = img.naturalHeight || 0;
        if (!l || !h) return ko(new Error("image illisible"));
        var k = Math.min(1, BUG_TAILLE_MAX / Math.max(l, h));
        var c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(l * k));
        c.height = Math.max(1, Math.round(h * k));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        if (c.toBlob) c.toBlob(function (b) {
          if (b) ok(b); else ko(new Error("image illisible"));
        }, "image/jpeg", 0.82);
        else ko(new Error("image illisible"));
      };
      img.onerror = function () { try { URL.revokeObjectURL(url); } catch (e) {} ko(new Error("image illisible")); };
      img.src = url;
    });
  }
  function ajouterBugImages(fichiers) {
    if (!fichiers || !fichiers.length) return;
    var reste = BUG_MAX_IMAGES - bugImages.length;
    if (fichiers.length > reste) {
      statutBug(reste > 0 ? "3 images maximum." : "3 images maximum : retire-en une d'abord.", true);
      fichiers = fichiers.slice(0, Math.max(0, reste));
    } else {
      statutBug("", false);
    }
    (function suivante(i) {
      if (i >= fichiers.length) { rendreBugApercus(); return; }
      compresserImage(fichiers[i]).then(function (blob) {
        bugImages.push({ blob: blob, url: URL.createObjectURL(blob) });
        suivante(i + 1);
      }, function () {
        statutBug("Une image est illisible, elle a été ignorée.", true);
        suivante(i + 1);
      });
    })(0);
  }
  document.getElementById("bug-fichiers").addEventListener("change", function (e) {
    var fichiers = Array.prototype.slice.call(e.target.files || []);
    e.target.value = "";
    ajouterBugImages(fichiers);
  });
  /* Glisser-déposer (PC) : dès qu'un fichier survole la fenêtre, le
     voile en pointillés s'affiche ; le dépôt n'importe où dans la
     fenêtre ajoute les images, comme le trombone. Le compteur de
     survols évite que le voile clignote en passant d'un enfant à
     l'autre (les navigateurs n'ordonnent pas enter/leave pareil). */
  (function () {
    var voileBug = document.getElementById("voile-bug");
    var depot = document.getElementById("bug-depot");
    var survols = 0;
    function avecFichiers(e) {
      var dt = e.dataTransfer;
      if (!dt || !dt.types) return false;
      return Array.prototype.indexOf.call(dt.types, "Files") !== -1;
    }
    function montrer(v) {
      survols = v ? survols : 0;
      depot.hidden = !v;
    }
    voileBug.addEventListener("dragenter", function (e) {
      if (!avecFichiers(e)) return;
      e.preventDefault();
      survols += 1;
      montrer(true);
    });
    voileBug.addEventListener("dragover", function (e) {
      if (!avecFichiers(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    });
    voileBug.addEventListener("dragleave", function (e) {
      if (!survols) return;
      survols -= 1;
      if (!survols) montrer(false);
    });
    voileBug.addEventListener("drop", function (e) {
      var dt = e.dataTransfer;
      var fichiers = Array.prototype.slice.call((dt && dt.files) || []);
      if (!fichiers.length) return;
      e.preventDefault();
      montrer(false);
      var images = fichiers.filter(function (f) {
        return f && (f.type ? /^image\//.test(f.type)
          : /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif)$/i.test(f.name || ""));
      });
      if (!images.length) {
        statutBug("Seules les images sont acceptées (png, jpg, webp…).", true);
        return;
      }
      ajouterBugImages(images);
    });
  })();
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
  document.getElementById("boite-bug").addEventListener("submit", function (e) {
    e.preventDefault();
    var zone = document.getElementById("bug-message");
    var sujet = document.getElementById("bug-sujet");
    var titre = sujet.value.replace(/\s+/g, " ").trim();
    var message = zone.value.replace(/\s+/g, " ").trim();
    if (titre.length < 3) {
      statutBug("Donne un titre en quelques mots.", true);
      sujet.focus();
      return;
    }
    if (message.length < 3) {
      statutBug(BUG_TEXTE[bugType].vide, true);
      zone.focus();
      return;
    }
    var btn = document.getElementById("bug-envoyer");
    btn.disabled = true;
    statutBug("Envoi en cours…", false);
    function envoyer(chemins) {
      var prefill = "";
      try {
        if (bugEtape === "v-formation") {
          var q = document.getElementById("recherche");
          if (q && q.value.trim()) prefill = "Recherche : " + q.value.trim();
        }
      } catch (err) { /* jetable */ }
      var corps = {
        titre: titre, message: message, etape: bugEtape, email: bugEmail(), type: bugType,
        contexte: bugContexte(prefill), image_urls: chemins,
        site_web: document.getElementById("bug-site-web").value || ""
      };
      var entetes = { "Content-Type": "application/json" };
      if (sessionSupabase && sessionSupabase.access_token) {
        entetes.Authorization = "Bearer " + sessionSupabase.access_token;
      }
      return fetch("/api/bugs", {
        method: "POST", cache: "no-store",
        headers: entetes, body: JSON.stringify(corps)
      }).then(function (r) {
        return r.json().catch(function () { throw new Error("réponse illisible (" + r.status + ")."); });
      }).then(function (rep) {
        if (!rep.ok) throw new Error(rep.erreur || "réponse incomplète.");
      });
    }
    // 1) téléverser les captures (noms imprévisibles), 2) déposer le report.
    (function televerser(i, chemins) {
      if (i >= bugImages.length) return envoyer(chemins);
      if (!SUPABASE_OK || !sb) return Promise.reject(new Error("connexion au serveur impossible."));
      var chemin = uuid() + ".jpg";
      return sb.storage.from("bug-images").upload(chemin, bugImages[i].blob, {
        contentType: "image/jpeg", upsert: false
      }).then(function (res) {
        if (res.error) throw new Error("images refusées par le serveur.");
        chemins.push(chemin);
        return televerser(i + 1, chemins);
      });
    })(0, []).then(function () {
      statutBug(BUG_TEXTE[bugType].merci, false);
      zone.value = "";
      sujet.value = "";
      bugImages.forEach(function (img) { try { URL.revokeObjectURL(img.url); } catch (e2) {} });
      bugImages = [];
      rendreBugApercus();
      setTimeout(function () { fermerBug(); }, 900);
    }, function (err) {
      statutBug("Échec de l'envoi : " + (err && err.message ? err.message : "réessaie.") + " Tes mots et images sont gardés.", true);
    }).then(function () { btn.disabled = false; });
  });
  // Entrée dans le titre passe au message au lieu d'envoyer.
  document.getElementById("bug-sujet").addEventListener("keydown", function (e) {
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault();
    document.getElementById("bug-message").focus();
  });
  document.getElementById("bug-annuler").addEventListener("click", function () { fermerBug(); });
  document.getElementById("voile-bug").addEventListener("click", function (e) {
    if (e.target === this) fermerBug();
  });
  /* La feuille du compte reste ouverte derrière la fenêtre : on la
     retrouve telle quelle après « Annuler ». */
  Array.prototype.forEach.call(document.querySelectorAll("#bug-rail [data-bug-type]"), function (b) {
    b.addEventListener("click", function () { definirBugType(b.getAttribute("data-bug-type")); });
  });
  document.getElementById("btn-bug-compte").addEventListener("click", function () {
    ouvrirBug("", "");
  });
  document.getElementById("lien-bug-footer").addEventListener("click", function () {
    ouvrirBug("", "");
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-bug]"), function (b) {
    b.addEventListener("click", function () { ouvrirBug("", b.getAttribute("data-bug-type") || ""); });
  });
  /* Mise à jour depuis l'école : automatique à l'ouverture et au retour
     sur l'app après 10 min (recharger la page suffit toujours).
     Une réponse plus ancienne que ce qui est affiché est ignorée : deux
     requêtes qui se croisent ne peuvent pas faire revenir en arrière. */
  function empreinte(d) {
    return JSON.stringify([d.cours, d.groupes, d.meta.periode, d.meta.premier_lundi, d.meta.feries, d.infos || null]);
  }
  var derniereMaj = 0;
  var actualisation = null; // requête en vol : deux appels ne font qu'un
  function actualiser() {
    if (!profil) return Promise.resolve(false);
    if (actualisation) return actualisation;
    derniereMaj = Date.now();
    var p = profil;
    actualisation = chargerProfil(p).then(function (data) {
      if (profil !== p) return false; // profil changé entre-temps
      // Un horaire sur mesure a une formation vide : on compare le profil.
      var meme = DATA && (DATA.perso || data.perso
        ? DATA.profilId === data.profilId
        : DATA.formation === data.formation);
      if (meme && data.meta.ts < DATA.meta.ts) return false;
      var premier = !DATA;
      var change = premier || empreinte(data) !== empreinte(DATA);
      if (!change) { DATA = data; rendreInfos(); return false; }
      if (!premier) { coursOuverts = {}; suppOuverts = {}; fermerPdf(); } // le PDF affiché serait périmé
      installer(data);
      if (premier) { if (semaineAuto) sem = semaineCourante(); deplierAujourdhui(); }
      if (vue === "horaire") afficherHoraire();
      return true;
    });
    var fin = function () { actualisation = null; };
    actualisation.then(fin, fin);
    return actualisation;
  }
  document.addEventListener("visibilitychange", function () {
    if (demarrageFini && vue === "horaire" && profil &&
        document.visibilityState === "visible" && Date.now() - derniereMaj > 600000) {
      actualiser().catch(function () { /* on garde ce qui est affiché */ });
    }
  });
  // Page quittée ou onglet mis de côté : le brouillon d'ajout part avec.
  window.addEventListener("pagehide", function () { sauverBrouillon(); });

  /* Rechargement manuel : un appui sur le logo du haut relance l'app.
     Animation de départ (~0,26 s) puis rechargement ; la nouvelle page
     joue l'arrivée grâce au drapeau de session, dans la couleur de
     l'horaire affiché (data-theme, sinon l'accent par défaut). */
  var CLE_RECHARGE = "recharge";
  /* Triple appui rapproché sur le logo : rechargement forcé (dur). Les
     raccourcis d'écran d'accueil (iOS) reprennent la page en mémoire sans
     recharger, et un appui simple rejoue parfois l'ancien HTML en cache :
     trois appuis vident les caches et rechargent avec un paramètre unique
     (retiré au démarrage). Les horaires et réglages sont conservés. */
  var tapsLogo = 0, minuteurLogo = 0, rechargeLogo = 0;
  function rechargeDure() {
    document.body.classList.add("depart");
    try {
      if ("caches" in window && caches.keys) caches.keys().then(function (cles) {
        cles.forEach(function (c) { try { caches.delete(c); } catch (e) {} });
      }).catch(function () {});
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          regs.forEach(function (r) { try { r.unregister(); } catch (e) {} });
        }).catch(function () {});
      }
    } catch (e) {}
    try { sessionStorage.setItem(CLE_RECHARGE, document.body.getAttribute("data-theme") || ""); }
    catch (e) { /* navigation privée */ }
    location.href = location.pathname + "?dur=" + Date.now();
  }
  document.getElementById("btn-reload").addEventListener("click", function () {
    clearTimeout(rechargeLogo);
    tapsLogo++;
    clearTimeout(minuteurLogo);
    minuteurLogo = setTimeout(function () { tapsLogo = 0; }, 900);
    if (tapsLogo >= 3) {
      tapsLogo = 0; clearTimeout(minuteurLogo);
      rechargeDure(); return;
    }
    if (document.body.classList.contains("depart")) {
      // Appui pendant l'animation : on relance juste le rechargement prévu.
      rechargeLogo = setTimeout(function () { location.reload(); }, sansAnim ? 0 : 260);
      return;
    }
    document.body.classList.add("depart");
    try { sessionStorage.setItem(CLE_RECHARGE, document.body.getAttribute("data-theme") || ""); }
    catch (e) { /* navigation privée */ }
    rechargeLogo = setTimeout(function () { location.reload(); }, sansAnim ? 0 : 260);
  });
  try {
    var drapeauRecharge = sessionStorage.getItem(CLE_RECHARGE);
    if (drapeauRecharge !== null) {
      sessionStorage.removeItem(CLE_RECHARGE);
      // La barre d'arrivée prend la couleur de l'horaire tout de suite.
      if (drapeauRecharge) document.body.setAttribute("data-theme", drapeauRecharge);
      document.body.classList.add("arrivee");
      // retirée ensuite : sinon chaque nouveau rendu rejouerait la cascade
      setTimeout(function () { document.body.classList.remove("arrivee"); }, 650);
    }
  } catch (e) { /* navigation privée */ }
  /* Retour d'un rechargement forcé (?dur=…) : on nettoie l'adresse pour
     retrouver l'URL normale, sans recharger. */
  try {
    if (/(^|[?&])dur=\d+/.test(location.search)) history.replaceState(null, "", location.pathname);
  } catch (e) {}

  /* ---------- Démarrage ----------
     Ouvre le dernier horaire revu (connecté par défaut) : le cache local
     s'affiche tout de suite, puis actualiser() va chercher l'école. */
  function rafraichirHoraireLocal() {
    var memo = memoProfil(profil);
    if (memo) {
      installer(memo);
      // Retour sur l'onglet (SIGNED_IN réémis) : on garde la semaine
      // choisie par l'utilisateur ; seul un rechargement (semaineAuto
      // encore vrai) ou une semaine devenue inconnue repart du courant.
      if (semaineAuto) sem = semaineCourante();
      deplierAujourdhui();
    }
    afficherHoraire();
  }
  function demarrerHoraire() {
    rafraichirHoraireLocal();
    actualiser().catch(function (e) {
      if (!DATA && vue === "horaire") {
        erreur(document.getElementById("horaire-status"),
               "Impossible de charger ton horaire : " + e.message + " Recharge la page pour réessayer.");
      }
    });
    tracerVisite();
  }
  /* Route sur ce que l'appareil sait déjà : compte et horaires en cache,
     création en cours. Aucun aller-retour réseau avant l'affichage. */
  function router() {
    if (MODE_ESSAI) {
      // Pas de connexion : un compte local de circonstance, pas de synchro.
      if (!compte || compte.fournisseur !== "essai") {
        compte = { fournisseur: "essai", nom: "Essai", prenom: "Local" };
        sauverCompte();
      }
      sessionSupabase = null;
      document.body.setAttribute("data-essai", "1");
      var badge = document.createElement("p");
      badge.id = "essai-badge";
      badge.textContent = "Mode essai — aucun compte, tout reste ici";
      document.body.appendChild(badge);
      rendreAvatar();
      if (reprendreBrouillon()) { /* l'ajout en cours reprend */ }
      else if (profil) demarrerHoraire();
      else ouvrirEcoles();
      return;
    }
    // Retour du lien « mot de passe oublié » : nouveau mot de passe d'abord.
    if (recuperationEnCours) {
      ouvrirResetMdp();
    } else if (!connecte()) {
      if (compte) ouvrirIdentite();
      else ouvrirCompte();
    } else if (reprendreBrouillon()) {
      // On reprend la création d'horaire là où elle en était.
    } else if (profil) {
      demarrerHoraire();
    } else {
      ouvrirEcoles();
    }
  }
  /* ---------- Démarrage ----------
     L'écran se décide d'abord sur l'appareil (aucune attente réseau) ;
     le cloud (/api/config puis session Supabase) se branche derrière. Un
     retour OAuth ou « mot de passe oublié » fait exception : la session
     est dans l'adresse, il faut Supabase pour la lire, on attend. */
  var retourCloud = /[?&#](code|access_token)=/.test(location.search + location.hash) ||
                    /(^|[&#?])type=recovery/.test(location.search + location.hash);
  // Partagée avec suivi.js (window.EZH_CONFIG_PROMESSE) : un seul
  // /api/config par visite, et la forme {url, cle} attendue par le suivi.
  window.EZH_CONFIG_PROMESSE = chargerConfigSupabase().then(function (ok) {
    return ok ? { url: SUPABASE_CONFIG.URL, cle: SUPABASE_CONFIG.CLE_ANON } : null;
  });
  if (!retourCloud) {
    demarrageFini = true;
    router();
  }
  window.EZH_CONFIG_PROMESSE.then(function () {
    // Visiteur neuf : ni session en local, ni retour OAuth -> le SDK
    // Supabase (218 Ko) reste hors du chargement. Les boutons de
    // connexion le demandent eux-mêmes (voir AUTH.login / pretCloud).
    return MODE_ESSAI || !(retourCloud || sessionCloudEnLocal()) ? null : initSupabase();
  }).then(function () {
    if (!MODE_ESSAI && sessionSupabase && sessionSupabase.user) {
      return pullProfils().then(function () { return pullEcheances(); }, function () { return pullEcheances(); })
        .then(function () { return null; }, function () { return null; });
    }
    return null;
  }).then(function () {
    demarrageFini = true;
    // Visiteur sans compte : c'est une arrivée dans l'app (le retour d'un
    // OAuth a une session, donc n'est pas recompté).
    if (!MODE_ESSAI && !sessionSupabase && window.EZH_SUIVI) EZH_SUIVI.arrivee("app");
    // Retour OAuth / mot de passe oublié : la session est arrivée, on route.
    if (retourCloud) router();
    // Un autre appareil a peut-être tout : on pousse le local en douceur.
    if (sessionSupabase) {
      pushProfils().then(function () { /* jetable */ }, function () { /* jetable */ });
      pushEcheances().then(function () { /* jetable */ }, function () { /* jetable */ });
    }
    // 1re connexion du compte sur mobile : pop-up écran d'accueil, une seule fois.
    // Session cloud (dont retour OAuth traité avant le routeur), mode essai,
    // ou compte local avec identité : jamais pour un visiteur non connecté.
    if (sessionSupabase && sessionSupabase.user) planifierPropositionPwa();
    else if (MODE_ESSAI) planifierPropositionPwa();
    else if (connecte() && !(compte && compte.supabase_id)) planifierPropositionPwa();
  });
})();
