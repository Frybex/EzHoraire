/* Export de l'horaire vers une application d'agenda : un fichier
   iCalendar (.ics) fabriqué sur l'appareil — rien ne part sur le serveur.
   L'agenda du téléphone (Calendrier sur iPhone, Google Agenda ou une
   autre application sur Android) importe ce fichier.

   Une séance = un événement, à sa date exacte : aucune règle de
   récurrence. C'est plus verbeux, mais chaque date est explicite —
   l'aperçu d'import et l'agenda affichent donc toutes les séances, sans
   dépendre de la façon dont l'application d'agenda expanse les séries.

   Titre « pro » : [CODE · ]Intitulé[ · Type], sans emoji. Les agendas
   colorent par calendrier, jamais par événement (la propriété COLOR de la
   RFC 7986 est ignorée à l'import) : le titre est donc le seul repère
   lisible partout. La salle vit dans LOCATION, pas dans le titre (la vue
   Mois d'iOS n'en montre que ~10 caractères).

   Fonctions pures, sans DOM ni stockage : index.html les utilise via
   window.EZH_EXPORT_ICS, et test_export_ics.mjs les vérifie avec
   `node --test`.

   Entrée : { nom, premierLundi: "2026-09-14", cours: [...] } où chaque
   cours porte jour (0 = lundi), debut/fin ("08h30"), matiere, et
   éventuellement type, profs, salles, groupes, semaines.
   Sortie : texte iCalendar, lignes pliées à 75 octets (RFC 5545). */
(function (racine) {
  "use strict";

  var TZID = "Europe/Brussels";
  var MAX_OCTETS = 73; // marge sous les 75 octets de la RFC (l'espace de continuation compte)
  // Règles de l'heure d'été européenne, telles que les émettent Apple et
  // Google : dernier dimanche de mars et d'octobre.
  var VTIMEZONE = [
    "BEGIN:VTIMEZONE",
    "TZID:" + TZID,
    "X-LIC-LOCATION:" + TZID,
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE"
  ];

  /* ---- Titre d'un événement ---- */
  // Code d'unité en tête d'intitulé : « D-SCJU-136 - Droit romain ».
  var RX_CODE_MATIERE = /^([A-Z]{1,4}(?:-[A-Z0-9]{2,8}){1,3})\s*-\s+/;
  // Type écrit en fin d'intitulé : « -Th. », « -théo1 », « -TP », « -Labo ».
  var RX_TYPE_FIN = /\s*[-–]\s*(th[ée]o\s*(\d)?|th\.?|théorie|theorie|tp\s*(\d)?|labo\s*(\d)?|prat\.?)\s*$/i;
  // Type donné par l'école, abrégé pour le titre. « Cours » est le défaut :
  // il ne s'affiche pas. Un type inconnu est gardé tel quel.
  var TYPES_ECOLES = {
    "cours": "", "théorie": "Théorie", "theorie": "Théorie",
    "laboratoires": "Labo", "laboratoire": "Labo", "tp": "TP",
    "travaux pratiques": "TP", "séminaire": "Séminaire",
    "seminaire": "Séminaire", "examen": "Examen"
  };

  function deux(n) { return (n < 10 ? "0" : "") + n; }

  /* Échappement des valeurs texte (RFC 5545 §3.3.11). */
  function echapper(s) {
    return String(s == null ? "" : s)
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r\n|\r|\n/g, "\\n");
  }

  /* Pliage : au-delà de 75 OCTETS, la ligne est coupée et la suite
     commence par une espace (RFC 5545 §3.1). On compte en octets UTF-8,
     sans couper un caractère ni une paire de substitution. */
  function plier(ligne) {
    var out = [], i = 0;
    while (i < ligne.length) {
      var n = 0, j = i;
      while (j < ligne.length) {
        var code = ligne.charCodeAt(j);
        var paire = code >= 0xd800 && code <= 0xdbff && j + 1 < ligne.length;
        var taille = code < 0x80 ? 1 : code < 0x800 ? 2 : paire ? 4 : 3;
        if (n + taille > MAX_OCTETS) break;
        n += taille;
        j += paire ? 2 : 1;
      }
      out.push((out.length ? " " : "") + ligne.slice(i, j));
      i = j;
    }
    return out.join("\r\n");
  }

  function parseIso(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    if (!m) return null;
    return { a: +m[1], m: +m[2] - 1, j: +m[3] };
  }

  /* Date de la semaine `sem` (1 = premier lundi) et du jour `jour`
     (0 = lundi). Arithmétique en UTC : aucun fuseau en jeu, la date est
     « flottante » (elle sera écrite avec TZID). */
  function dateCours(lundi, sem, jour) {
    var d = new Date(Date.UTC(lundi.a, lundi.m, lundi.j + (sem - 1) * 7 + jour));
    return { a: d.getUTCFullYear(), m: d.getUTCMonth(), j: d.getUTCDate() };
  }

  function minutes(heure) {
    var m = /^(\d{1,2})h(\d{2})$/.exec(String(heure == null ? "" : heure).trim());
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  }

  /* « 20260928T083000 », en décalant la date si l'heure passe minuit. */
  function heureIcs(date, min) {
    var jours = Math.floor(min / 1440);
    var reste = min - jours * 1440;
    var d = new Date(Date.UTC(date.a, date.m, date.j + jours));
    return d.getUTCFullYear() + deux(d.getUTCMonth() + 1) + deux(d.getUTCDate()) +
      "T" + deux(Math.floor(reste / 60)) + deux(reste % 60) + "00";
  }

  function horodatage(maintenant) {
    return (maintenant || new Date()).toISOString()
      .replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  }

  function nettoyerMatiere(m) {
    var brut = String(m == null ? "" : m);
    return brut.replace(RX_CODE_MATIERE, "").replace(/\s*-?\s*AAEP\s*$/, "")
               .replace(/\s+/g, " ").trim() || brut;
  }
  function codeMatiere(m) {
    var r = RX_CODE_MATIERE.exec(String(m == null ? "" : m));
    return r ? r[1] : "";
  }
  /* Type écrit dans l'intitulé : rend le type normalisé et l'intitulé
     débarrassé de ce suffixe. */
  function typeMatiere(base) {
    var s = String(base == null ? "" : base);
    var r = RX_TYPE_FIN.exec(s);
    if (!r) return { nom: "", base: s };
    var t = r[1].toLowerCase(), nom;
    if (t.indexOf("th") === 0) nom = "Théorie" + (r[2] ? " " + r[2] : "");
    else if (t.indexOf("tp") === 0) nom = "TP" + (r[3] ? " " + r[3] : "");
    else if (t.indexOf("labo") === 0) nom = "Labo" + (r[4] ? " " + r[4] : "");
    else nom = "Pratique";
    return { nom: nom, base: s.slice(0, r.index).trim() };
  }
  function typeEcole(t) {
    var s = String(t == null ? "" : t).trim();
    if (!s) return "";
    var k = s.toLowerCase();
    return Object.prototype.hasOwnProperty.call(TYPES_ECOLES, k) ? TYPES_ECOLES[k] : s;
  }
  /* Titre affiché dans l'agenda : [CODE · ]Intitulé[ · Type]. */
  function titreEvenement(c) {
    var brut = String((c && c.matiere) || "Cours");
    var code = codeMatiere(brut);
    var t = typeMatiere(nettoyerMatiere(brut));
    var base = t.base || nettoyerMatiere(brut);
    var typ = t.nom || typeEcole(c && c.type);
    // Type déjà dans l'intitulé (« CM: Analyse », type « CM ») : pas de doublon.
    if (typ && base.toLowerCase().indexOf(typ.toLowerCase()) >= 0) typ = "";
    return [code, base, typ].filter(function (x) { return x; }).join(" · ") || "Cours";
  }

  /* Identifiant stable d'une séance : réimporter le même horaire met à
     jour les événements au lieu de les dupliquer. L'identité ne dépend ni
     des semaines (l'école peut les republier) ni du titre affiché (il a
     changé avec l'habillage pro) : elle garde l'intitulé nettoyé. */
  function empreinte(c) {
    var texte = [c.jour, c.debut, c.fin, nettoyerMatiere(c.matiere), c.salles,
                 c.profs, c.type, (c.groupes || []).join("+")].join("|");
    var h = 5381;
    for (var i = 0; i < texte.length; i++) h = ((h * 33) ^ texte.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  function description(c, code) {
    var lignes = [];
    if (c.type) lignes.push("Type : " + c.type);
    if (code) lignes.push("Code : " + code);
    if (c.profs) lignes.push("Prof : " + c.profs);
    if (c.salles) lignes.push("Salle : " + c.salles);
    if (c.groupes && c.groupes.length) lignes.push("Groupe : " + c.groupes.join(", "));
    lignes.push("Exporté depuis EzHoraire (ezhoraire.be)");
    return lignes.join("\n");
  }

  function construire(horaire, options) {
    options = options || {};
    var lundi = parseIso(horaire.premierLundi);
    if (!lundi) throw new Error("premier lundi manquant");
    var depuis = options.depuis || 0;
    var stamp = horodatage(options.maintenant);
    var lignes = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//EzHoraire//Horaire//FR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:" + echapper(horaire.nom || "Horaire"),
      "X-WR-TIMEZONE:" + TZID
    ].concat(VTIMEZONE);
    (horaire.cours || []).forEach(function (c) {
      var debut = minutes(c.debut);
      var fin = minutes(c.fin);
      if (debut == null || c.jour == null || c.jour < 0 || c.jour > 6) return;
      if (fin == null || fin <= debut) fin = debut + 60; // fin absente ou incohérente
      var vues = {}, semaines = [];
      (c.semaines || []).forEach(function (s) {
        if (s >= depuis && !vues[s]) { vues[s] = true; semaines.push(s); }
      });
      semaines.sort(function (a, b) { return a - b; });
      if (!semaines.length) return;
      var h = empreinte(c);
      var titre = titreEvenement(c);
      var code = codeMatiere(c.matiere);
      semaines.forEach(function (s) {
        var date = dateCours(lundi, s, c.jour);
        lignes.push("BEGIN:VEVENT");
        // UID stable : la séance du jour précis. Réimporter met à jour au
        // lieu de dupliquer, et une semaine ajoutée par l'école arrive
        // comme un nouvel événement.
        lignes.push("UID:ezh-" + (options.uid ? options.uid + "-" : "") + h + "-" +
          date.a + deux(date.m + 1) + deux(date.j) + "@ezhoraire.be");
        lignes.push("DTSTAMP:" + stamp);
        lignes.push("DTSTART;TZID=" + TZID + ":" + heureIcs(date, debut));
        lignes.push("DTEND;TZID=" + TZID + ":" + heureIcs(date, fin));
        lignes.push("SUMMARY:" + echapper(titre));
        if (c.salles) lignes.push("LOCATION:" + echapper(c.salles));
        lignes.push("DESCRIPTION:" + echapper(description(c, code)));
        lignes.push("TRANSP:OPAQUE");
        lignes.push("END:VEVENT");
      });
    });
    lignes.push("END:VCALENDAR");
    return lignes.map(plier).join("\r\n") + "\r\n";
  }

  /* Nom du fichier téléchargé, débarrassé des caractères interdits par
     les systèmes de fichiers. */
  function nomFichier(nom) {
    var base = String(nom || "Horaire")
      .replace(/[\\/:*?"<>|\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
    if (!base) base = "Horaire";
    return "EzHoraire - " + base.slice(0, 60) + ".ics";
  }

  var api = {
    construire: construire, nomFichier: nomFichier, titreEvenement: titreEvenement, TZID: TZID
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else racine.EZH_EXPORT_ICS = api;
})(typeof window !== "undefined" ? window : this);
