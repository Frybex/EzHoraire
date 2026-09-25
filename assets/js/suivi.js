/* EzHoraire — suivi anonyme du parcours (arrivée → clic → compte → horaire).
 *
 * Compte une visite, pas une personne : l'identifiant de session vit dans
 * l'onglet (sessionStorage), n'est jamais relié à un compte et disparaît
 * à sa fermeture. Aucun contenu sensible : arrivée, écrans atteints,
 * clics de connexion, erreurs, frictions, compte et horaire créés,
 * sortie (durée active + écran quitté).
 *
 * Rien n'est envoyé tant qu'une arrivée n'a pas été comptée (les visites
 * d'un compte déjà connecté ne polluent pas le parcours) ; la sortie part
 * seule à la fermeture de l'onglet.
 *
 * Écriture seule vers la table `evenements` (clé anon, RLS insert-only,
 * plafond par session). Lecture interdite : seul le dashboard admin
 * (via /api/stats) agrège, et la page confidentialité le décrit.
 *
 * Usage depuis une page :
 *   EZH_SUIVI.arrivee("app")                        // visiteur non connecté
 *   EZH_SUIVI.ecran("compte")                       // à chaque écran
 *   EZH_SUIVI.envoyer("clic_connexion", { fournisseur: "google" })
 *   EZH_SUIVI.friction("recherche_0", { genre: "cours" })
 *   EZH_SUIVI.marquer("clic") / .deja("compte") / .aClique()
 * Toutes les fonctions sont sans effet si la configuration manque :
 * jamais bloquant.
 */
(function () {
  "use strict";
  if (window.EZH_SUIVI) return;

  var CLE_SESSION = "ezh_sess";
  var CLE_DEBUT = "ezh_sess_debut";
  var CLE_ACTIVE = "ezh_tr_actif";
  var PREFIXE = "ezh_tr_";
  // Écrans du parcours qui comptent comme une étape atteinte (une fois
  // par visite). Les autres écrans restent visibles via la sortie.
  var ECRANS_ETAPE = { ecole: 1, formation: 1, groupes: 1, horaire: 1 };
  var pageActive = "";
  var ecranCourant = "";
  var interactions = 0;
  var debut = Date.now();
  var visibleDepuis = document.visibilityState === "visible" ? Date.now() : 0;
  var actif = 0;
  var sortieEnvoyee = false;
  var configPromise = null;

  function lire(cle) {
    try { return sessionStorage.getItem(cle); } catch (e) { return null; }
  }
  function ecrire(cle, valeur) {
    try { sessionStorage.setItem(cle, valeur); } catch (e) { /* navigation privée */ }
  }
  function alea() {
    try {
      var octets = new Uint8Array(16);
      (window.crypto || window.msCrypto).getRandomValues(octets);
      var s = "";
      for (var i = 0; i < octets.length; i++) s += (octets[i] + 256).toString(16).slice(1);
      return s;
    } catch (e) {
      return "s" + Math.random().toString(16).slice(2) + Date.now().toString(16);
    }
  }

  var session = lire(CLE_SESSION);
  if (!session || session.length < 8) {
    session = alea();
    ecrire(CLE_SESSION, session);
  }
  if (!lire(CLE_DEBUT)) ecrire(CLE_DEBUT, String(Date.now()));

  function debutSession() {
    return +(lire(CLE_DEBUT) || debut) || debut;
  }
  function active() { return !!lire(CLE_ACTIVE); }
  function actifMs() {
    if (visibleDepuis) { actif += Date.now() - visibleDepuis; visibleDepuis = 0; }
    if (document.visibilityState === "visible") visibleDepuis = Date.now();
    return actif;
  }
  function aClique() { return !!lire(PREFIXE + "clic"); }
  function deja(nom) { return !!lire(PREFIXE + nom); }
  function marquer(nom) { ecrire(PREFIXE + nom, "1"); }

  /* Config publique (même /api/config que l'app), demandée une seule fois.
     Quand l'app est ouverte, on réutilise sa requête (window.EZH_CONFIG_PROMESSE)
     au lieu d'en refaire une : un seul /api/config par visite. */
  function chargerConfig() {
    if (configPromise) return configPromise;
    var partagee = window.EZH_CONFIG_PROMESSE;
    configPromise = (partagee ? Promise.resolve(partagee) : fetch("api/config", { cache: "default" }).then(function (r) {
      return r.json();
    }).then(function (rep) {
      var s = (rep && rep.supabase) || {};
      if (!s.url || !s.anonKey) throw new Error("sans clés");
      return { url: String(s.url).replace(/\/+$/, ""), cle: s.anonKey };
    })).then(function (c) {
      if (!c || !c.url || !c.cle) throw new Error("sans clés");
      return { url: String(c.url).replace(/\/+$/, ""), cle: c.cle };
    });
    return configPromise;
  }

  /* Envoi « feu et oubli » : keepalive pour survivre à un changement de
     page (fermeture d'onglet, retour OAuth), échec toujours silencieux. */
  function envoyer(evenement, options) {
    options = options || {};
    if (evenement !== "arrivee" && !active()) return Promise.resolve();
    var corps = {
      session_id: session,
      page: options.page || pageActive || "app",
      ecran: options.ecran != null ? String(options.ecran).slice(0, 24) : ecranCourant,
      evenement: evenement,
      fournisseur: options.fournisseur || "",
      erreur: options.erreur || "",
      duree_ms: Math.max(0, Math.round(options.duree_ms || 0)),
      interactions: interactions,
      version: String(window.EZH_VERSION || "").slice(0, 16),
      details: options.details || {}
    };
    return chargerConfig().then(function (c) {
      return fetch(c.url + "/rest/v1/evenements", {
        method: "POST",
        keepalive: true,
        cache: "no-store",
        headers: {
          "apikey": c.cle,
          "Authorization": "Bearer " + c.cle,
          "Content-Type": "application/json",
          "Prefer": "return=minimal"
        },
        body: JSON.stringify(corps)
      });
    }).catch(function () { /* jamais visible, jamais bloquant */ });
  }

  /* Une arrivée par visite et par page (un rechargement ne recompte pas ;
     le retour de Google/GitHub, non plus). */
  function arrivee(p) {
    p = p || "app";
    if (deja("arr_" + p)) return;
    marquer("arr_" + p);
    marquer("actif");
    pageActive = p;
    if (!ecranCourant) ecranCourant = p === "app" ? "compte" : "accueil";
    envoyer("arrivee", { page: p, ecran: ecranCourant });
  }

  /* Écran courant, et étape atteinte comptée une fois par visite.
     Sans arrivée comptée (visiteur déjà connecté), on n'enregistre rien. */
  function ecran(nom) {
    if (!active()) return;
    ecranCourant = String(nom == null ? "" : nom).slice(0, 24);
    if (ECRANS_ETAPE[ecranCourant] && !deja("et_" + ecranCourant)) {
      marquer("et_" + ecranCourant);
      envoyer("etape", { ecran: ecranCourant });
    }
  }

  /* Friction (recherche vide, capture illisible…), comptée une fois par
     code et par visite : le dashboard compte les visites touchées. */
  function friction(code, details) {
    code = String(code || "").slice(0, 40);
    if (!code || !active() || deja("fr_" + code)) return;
    marquer("fr_" + code);
    envoyer("friction", { erreur: code, details: details || {} });
  }

  function sortie() {
    if (sortieEnvoyee || !active()) return;
    sortieEnvoyee = true;
    envoyer("sortie", { duree_ms: actifMs() });
  }

  document.addEventListener("pointerdown", function () { interactions++; },
                            { passive: true, capture: true });
  document.addEventListener("keydown", function () { interactions++; },
                            { passive: true, capture: true });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") actifMs();
    else if (!visibleDepuis) visibleDepuis = Date.now();
  });
  window.addEventListener("pagehide", sortie);

  window.EZH_SUIVI = {
    session: session,
    envoyer: envoyer,
    arrivee: arrivee,
    ecran: ecran,
    friction: friction,
    debut: debutSession,
    aClique: aClique,
    deja: deja,
    marquer: marquer
  };
})();
