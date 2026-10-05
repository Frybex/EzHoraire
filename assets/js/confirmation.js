(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var sb = null;              // client Supabase
  var MIN = 6;                // même minimum que l'app et que Supabase

  /* ---------- Halo qui suit le pointeur (comme l'écran de connexion) ---------- */
  document.addEventListener("pointermove", function (e) {
    var el = e.target && e.target.closest ? e.target.closest(".halo") : null;
    if (!el) return;
    var r = el.getBoundingClientRect();
    el.style.setProperty("--mx", (e.clientX - r.left) + "px");
    el.style.setProperty("--my", (e.clientY - r.top) + "px");
  }, { passive: true });

  /* ---------- Écrans ---------- */
  function montrer(id) {
    ["v-charge", "v-ok", "v-lien"].forEach(function (v) {
      var el = $(v);
      if (el) el.hidden = (v !== id);
    });
  }

  /* Erreurs Supabase → phrase claire (le code est stable, le texte non). */
  function codeAuth(err) {
    if (!err) return "";
    if (err.name === "AuthRetryableFetchError" || err.status === 0 || err.status >= 500) return "indisponible";
    if (err.code) return err.code;
    var m = String(err.message || "");
    if (/rate limit/i.test(m)) return "over_email_send_rate_limit";
    if (/expired|invalid/i.test(m)) return "otp_expired";
    return "";
  }
  function messageAuth(err) {
    switch (codeAuth(err)) {
      case "otp_expired":
      case "invalid_token": return "Lien expiré ou déjà utilisé.";
      case "over_email_send_rate_limit":
      case "over_request_rate_limit": return "Trop de tentatives : réessaie dans quelques minutes.";
      case "indisponible": return "Service indisponible : réessaie dans quelques minutes.";
      default: return "Échec : " + ((err && err.message) || "erreur inconnue") + ".";
    }
  }

  function lienMort(raison) {
    var p = $("lien-raison");
    if (raison && p) p.textContent = raison;
    montrer("v-lien");
    try { $("lien-app").focus(); } catch (e) { /* jetable */ }
  }

  function activer(mail) {
    if (mail) $("mail-compte").textContent = mail;
    montrer("v-ok");
    // La session est ouverte au passage : l'app s'ouvre sur l'horaire.
    setTimeout(function () { location.replace("/"); }, 1750);
  }

  /* ---------- Démarrage : config, jeton, session ---------- */
  function lireParams() {
    var q = new URLSearchParams(location.search);
    var h = new URLSearchParams(String(location.hash || "").replace(/^#/, ""));
    return function (cle) { return q.get(cle) || h.get(cle) || ""; };
  }

  function nettoyerURL() {
    try { history.replaceState(null, "", location.pathname); } catch (e) { /* jetable */ }
  }

  function ouvrirSession() {
    var p = lireParams();
    // Supabase a refusé le lien avant même de nous l'envoyer (expiré, déjà servi).
    if (p("error") || p("error_code")) {
      var d = p("error_description");
      nettoyerURL();
      return Promise.resolve({ error: { message: d ? decodeURIComponent(d.replace(/\+/g, " ")) : "", code: "otp_expired" } });
    }
    // a) Modèle d'email : jeton haché vérifié ici même (les aperçus de lien
    //    des messageries ne consomment donc pas le lien).
    var th = p("token_hash") || p("token");
    if (th) {
      var type = p("type") || "signup";
      return sb.auth.verifyOtp({ token_hash: th, type: type });
    }
    // b) Flux PKCE : Supabase nous renvoie un code à échanger.
    var code = p("code");
    if (code) return sb.auth.exchangeCodeForSession(code);
    // c) Flux implicite : les jetons sont directement dans le fragment.
    var at = p("access_token"), rt = p("refresh_token");
    if (at && rt) return sb.auth.setSession({ access_token: at, refresh_token: rt });
    // d) Rien dans l'URL : une session déjà ouverte (lien rouvert, page
    //    rechargée) suffit — le compte est bien activé.
    return sb.auth.getSession();
  }

  function demarrer() {
    fetch("/api/config", { cache: "no-store" }).then(function (r) { return r.json(); }, function () { return null; })
      .then(function (rep) {
        var c = (rep && rep.supabase) || {};
        if (!c.url || !c.anonKey || !window.supabase || !window.supabase.createClient) {
          lienMort("Le service de connexion est injoignable pour le moment. Réessaie dans quelques minutes.");
          return;
        }
        sb = window.supabase.createClient(c.url, c.anonKey, {
          auth: { detectSessionInUrl: false, persistSession: true, autoRefreshToken: true }
        });
        return ouvrirSession().then(function (res) {
          nettoyerURL();
          if (res && res.error) {
            // Lien peut-être déjà servi, mais une session ouverte prouve
            // que le compte est activé : on ne bloque pas l'étudiant.
            return sb.auth.getSession().then(function (s) {
              var deja = s && s.data && s.data.session;
              if (deja) { activer((deja.user && deja.user.email) || ""); return; }
              lienMort(messageAuth(res.error) + " Retourne sur EzHoraire et reconnecte-toi ; si le problème persiste, écris-nous à contact@ezhoraire.be.");
            });
          }
          var session = (res && res.data && res.data.session) || null;
          var u = (res && res.data && res.data.user) || (session && session.user) || null;
          if (!session && !u) { lienMort(); return; }
          activer((u && u.email) || (session && session.user && session.user.email) || "");
        });
      })
      .catch(function () { lienMort("Quelque chose s'est mal passé. Retourne sur EzHoraire et reconnecte-toi."); });
  }

  demarrer();
})();
