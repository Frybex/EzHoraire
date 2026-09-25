/* Pages légales : sommaire ouvert sur grand écran, entrée en cours
   surlignée pendant la lecture. Sans JavaScript, tout reste lisible. */
(function () {
  "use strict";
  var details = document.querySelector(".sommaire details");
  var large = window.matchMedia("(min-width: 980px)");
  function ajuster() { if (details) details.open = large.matches; }
  ajuster();
  if (large.addEventListener) large.addEventListener("change", ajuster);

  // Sur téléphone, choisir une entrée referme le sommaire.
  if (details) details.addEventListener("click", function (e) {
    if (e.target.closest("a") && !large.matches) details.open = false;
  });

  var liens = Array.prototype.slice.call(document.querySelectorAll(".sommaire a[href^='#']"));
  var sections = liens.map(function (a) { return document.getElementById(a.getAttribute("href").slice(1)); });
  if (!liens.length) return;
  // Section en cours : la dernière dont le titre a passé le premier tiers de l'écran.
  var courant = -1, prevu = false;
  function marquer() {
    prevu = false;
    var seuil = window.innerHeight * 0.33, idx = 0;
    sections.forEach(function (s, i) { if (s && s.getBoundingClientRect().top <= seuil) idx = i; });
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) idx = sections.length - 1;
    if (idx === courant) return;
    courant = idx;
    liens.forEach(function (a, i) {
      a.classList.toggle("actif", i === idx);
      if (i === idx) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current");
    });
  }
  window.addEventListener("scroll", function () {
    if (!prevu) { prevu = true; window.requestAnimationFrame(marquer); }
  }, { passive: true });
  marquer();
})();
