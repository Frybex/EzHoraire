(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var sb = null;              // client Supabase
  var session = null;         // session ouverte par le lien de récupération
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
    ["v-charge", "v-form", "v-lien", "v-ok"].forEach(function (v) {
      var el = $(v);
      if (el) el.hidden = (v !== id);
    });
  }
  function statut(el, msg, genre) {
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || "";
    el.className = "statut" + (genre ? " " + genre : "");
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
      case "weak_password": return "Mot de passe trop faible : choisis-en un plus long.";
      case "same_password": return "C'est déjà ton mot de passe actuel : choisis-en un autre.";
      case "indisponible": return "Service indisponible : réessaie dans quelques minutes.";
      default: return "Échec : " + ((err && err.message) || "erreur inconnue") + ".";
    }
  }

  function lienMort(raison) {
    var p = $("lien-raison");
    if (raison && p) p.textContent = raison;
    montrer("v-lien");
    try { $("mail-renvoi").focus(); } catch (e) { /* jetable */ }
  }

  /* ---------- Robustesse du mot de passe ---------- */
  var LIBELLES = ["6 caractères minimum", "Faible", "Correct", "Solide", "Excellent"];
  function force(v) {
    if (v.length < MIN) return 0;
    var variete = (/[a-z]/.test(v) ? 1 : 0) + (/[A-Z]/.test(v) ? 1 : 0)
                + (/[0-9]/.test(v) ? 1 : 0) + (/[^A-Za-z0-9]/.test(v) ? 1 : 0);
    var n = 1;
    if (v.length >= 9 || variete >= 3) n = 2;
    if ((v.length >= 12 && variete >= 2) || (v.length >= 10 && variete >= 4)) n = 3;
    if (v.length >= 14 && variete >= 3) n = 4;
    return n;
  }

  /* ---------- Formulaire ---------- */
  function majForm() {
    var v1 = $("mdp1").value, v2 = $("mdp2").value;
    var n = force(v1);
    var f = $("force");
    f.setAttribute("data-n", String(n));
    $("force-txt").textContent = v1 ? LIBELLES[n] : LIBELLES[0];
    var barres = f.querySelectorAll(".jauge i");
    for (var i = 0; i < barres.length; i++) barres[i].classList.toggle("on", i < n);
    var pareils = v2.length > 0 && v1 === v2;
    $("match").classList.toggle("vu", pareils);
    $("btn-enr").classList.toggle("pret", v1.length >= MIN && pareils);
  }

  function enregistrer() {
    var btn = $("btn-enr");
    if (btn.classList.contains("charge")) return;
    var v1 = $("mdp1").value, v2 = $("mdp2").value;
    if (v1.length < MIN) {
      statut($("statut"), "Mot de passe : " + MIN + " caractères minimum.", "err");
      try { $("mdp1").focus(); } catch (e) { /* jetable */ }
      return;
    }
    if (v1 !== v2) {
      statut($("statut"), "Les deux mots de passe ne sont pas identiques.", "err");
      try { $("mdp2").focus(); } catch (e) { /* jetable */ }
      return;
    }
    if (!sb || !session) { lienMort("La session de réinitialisation a expiré. Redemande un lien : il arrive en quelques secondes."); return; }
    statut($("statut"), "", "");
    btn.classList.add("charge");
    btn.setAttribute("aria-busy", "true");
    var fin = function () { btn.classList.remove("charge"); btn.removeAttribute("aria-busy"); };
    sb.auth.updateUser({ password: v1 }).then(function (res) {
      if (res.error) { fin(); statut($("statut"), messageAuth(res.error), "err"); return; }
      fin();
      $("mdp1").value = ""; $("mdp2").value = "";
      montrer("v-ok");
      // La session reste ouverte : l'app s'ouvre directement sur l'horaire.
      setTimeout(function () { location.replace("/"); }, 1950);
    }, function (err) { fin(); statut($("statut"), messageAuth(err), "err"); });
  }

  $("v-form").addEventListener("submit", function (e) { e.preventDefault(); enregistrer(); });
  $("mdp1").addEventListener("input", majForm);
  $("mdp2").addEventListener("input", majForm);
  $("voir").addEventListener("click", function () {
    var vu = this.getAttribute("aria-pressed") === "true";
    this.setAttribute("aria-pressed", vu ? "false" : "true");
    this.setAttribute("aria-label", vu ? "Afficher les mots de passe" : "Masquer les mots de passe");
    $("mdp1").type = $("mdp2").type = vu ? "password" : "text";
  });

  /* ---------- Renvoi d'un lien ---------- */
  function emailValide(v) { return /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(v); }
  $("v-renvoi").addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = $("btn-renvoi");
    if (btn.classList.contains("charge")) return;
    var em = String($("mail-renvoi").value || "").trim();
    if (!emailValide(em)) {
      statut($("statut-renvoi"), "Indique une adresse email valable.", "err");
      try { $("mail-renvoi").focus(); } catch (e2) { /* jetable */ }
      return;
    }
    if (!sb) { statut($("statut-renvoi"), "Service indisponible : réessaie dans quelques minutes.", "err"); return; }
    btn.classList.add("charge");
    btn.setAttribute("aria-busy", "true");
    var fin = function () { btn.classList.remove("charge"); btn.removeAttribute("aria-busy"); };
    sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + "/mot-de-passe.html" }).then(function (res) {
      fin();
      if (res.error) { statut($("statut-renvoi"), messageAuth(res.error), "err"); return; }
      statut($("statut-renvoi"), "Email envoyé : ouvre le lien depuis ta boîte mail.", "info");
    }, function (err) { fin(); statut($("statut-renvoi"), messageAuth(err), "err"); });
  });
  $("mail-renvoi").addEventListener("input", function () { statut($("statut-renvoi"), "", ""); });

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
      var type = p("type") || "recovery";
      return sb.auth.verifyOtp({ token_hash: th, type: type });
    }
    // b) Flux PKCE : Supabase nous renvoie un code à échanger.
    var code = p("code");
    if (code) return sb.auth.exchangeCodeForSession(code);
    // c) Flux implicite : les jetons sont directement dans le fragment.
    var at = p("access_token"), rt = p("refresh_token");
    if (at && rt) return sb.auth.setSession({ access_token: at, refresh_token: rt });
    // d) Rien dans l'URL : une session déjà ouverte (lien rouvert, page
    //    rechargée, ou utilisateur déjà connecté) permet quand même le
    //    changement de mot de passe.
    return sb.auth.getSession();
  }

  function demarrer() {
    fetch("/api/config", { cache: "no-store" }).then(function (r) { return r.json(); }, function () { return null; })
      .then(function (rep) {
        var c = (rep && rep.supabase) || {};
        if (!c.url || !c.anonKey || !window.supabase || !window.supabase.createClient) {
          lienMort("Le service de connexion est injoignable pour le moment. Réessaie dans quelques minutes.");
          $("v-renvoi").hidden = true;
          return;
        }
        sb = window.supabase.createClient(c.url, c.anonKey, {
          auth: { detectSessionInUrl: false, persistSession: true, autoRefreshToken: true }
        });
        return ouvrirSession().then(function (res) {
          nettoyerURL();
          if (res && res.error) { lienMort(messageAuth(res.error) + " Indique ton adresse : on t'en renvoie un tout de suite."); return; }
          session = (res && res.data && res.data.session) || null;
          var u = (res && res.data && res.data.user) || (session && session.user) || null;
          if (!session || !u) { lienMort(); return; }
          var mail = u.email || "";
          $("mail-compte").textContent = mail || "ton compte";
          $("mail-cache").value = mail;
          montrer("v-form");
          majForm();
          try { $("mdp1").focus({ preventScroll: true }); } catch (e) { /* jetable */ }
        });
      })
      .catch(function () { lienMort("Quelque chose s'est mal passé. Redemande un lien : il arrive en quelques secondes."); });
  }

  demarrer();
})();
