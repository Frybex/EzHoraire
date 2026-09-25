// Tests de l'export agenda (export_ics.js) : node --test tests/test_export_ics.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const E = createRequire(import.meta.url)("../assets/js/export_ics.js");

function cours(extra = {}) {
  return {
    jour: 0, debut: "08h30", fin: "10h30", matiere: "D-SCJU-136 - Droit romain",
    type: "Cours", profs: "M. Dupont", salles: "BARB 12", groupes: ["Groupe A"],
    semaines: [1, 2, 3],
    ...extra,
  };
}
function horaire(coursList, extra = {}) {
  return { nom: "Info", premierLundi: "2026-09-14", cours: coursList, ...extra };
}
// Lignes logiques : le pliage RFC (retour + espace) est défait.
function lignes(ics) {
  return ics.replace(/\r\n[ \t]/g, "").split("\r\n");
}
function evenements(ics) {
  const l = lignes(ics);
  const out = [];
  let cur = null;
  for (const ligne of l) {
    if (ligne === "BEGIN:VEVENT") cur = [];
    else if (ligne === "END:VEVENT") { out.push(cur); cur = null; }
    else if (cur) cur.push(ligne);
  }
  return out;
}
function champ(ev, nom) {
  const l = ev.find((x) => x.startsWith(nom + ":") || x.startsWith(nom + ";"));
  return l ? l.split(":").pop() : null;
}

test("titre pro : [CODE · ]Intitulé[ · Type], sans emoji", () => {
  const cas = [
    ["Archit. des ordinateurs-Th.", "Cours", "Archit. des ordinateurs · Théorie"],
    ["Techniques numeriques-TP", "Laboratoires", "Techniques numeriques · TP"],
    ["Télécom. et réseaux -théo1", "Cours", "Télécom. et réseaux · Théorie 1"],
    ["Télécom. et réseaux - TP1", "Cours", "Télécom. et réseaux · TP 1"],
    ["Electricité - théorie", "Cours", "Electricité · Théorie"],
    ["D-SCJU-136 - Droit romain - partie 2", "Cours", "D-SCJU-136 · Droit romain - partie 2"],
    ["Intelligence artificielle", "Cours", "Intelligence artificielle"],
    ["Etude de projet", "Laboratoires", "Etude de projet · Labo"],
    ["CM: Analyse", "CM", "CM: Analyse"],
    ["", "Cours", "Cours"],
  ];
  for (const [matiere, type, attendu] of cas) {
    assert.equal(E.titreEvenement({ matiere, type }), attendu, matiere);
  }
});

test("une séance = un événement daté (aucune récurrence)", () => {
  const ics = E.construire(horaire([cours()]), { maintenant: new Date(Date.UTC(2026, 8, 19, 12, 0, 0)) });
  const evs = evenements(ics);
  assert.equal(evs.length, 3); // semaines 1, 2 et 3
  assert.ok(lignes(ics).includes("X-WR-CALNAME:Info"));
  assert.ok(lignes(ics).includes("DTSTAMP:20260919T120000Z"));
  assert.equal(champ(evs[0], "DTSTART"), "20260914T083000");
  assert.equal(champ(evs[1], "DTSTART"), "20260921T083000");
  assert.equal(champ(evs[2], "DTSTART"), "20260928T083000");
  assert.equal(champ(evs[0], "DTEND"), "20260914T103000");
  assert.equal(champ(evs[0], "SUMMARY"), "D-SCJU-136 · Droit romain");
  assert.equal(champ(evs[0], "LOCATION"), "BARB 12");
  assert.ok(evs[0].includes("DESCRIPTION:Type : Cours\\nCode : D-SCJU-136\\nProf : M. Dupont\\nSalle : BARB 12\\nGroupe : Groupe A\\nExporté depuis EzHoraire (ezhoraire.be)"));
  assert.equal(evs.some((e) => e.some((x) => x.startsWith("RRULE"))), false);
});

test("semaines trouées (congés) : aucun événement ces semaines-là", () => {
  const evs = evenements(E.construire(horaire([cours({ semaines: [1, 2, 3, 5, 6] })])));
  assert.deepEqual(evs.map((e) => champ(e, "DTSTART")), [
    "20260914T083000", "20260921T083000", "20260928T083000",
    "20261012T083000", "20261019T083000",
  ]);
});

test("depuis : seules les semaines restantes partent", () => {
  const evs = evenements(E.construire(horaire([cours({ semaines: [1, 2, 4, 5] })]), { depuis: 4 }));
  assert.deepEqual(evs.map((e) => champ(e, "DTSTART")), ["20261005T083000", "20261012T083000"]);
  const vide = E.construire(horaire([cours({ semaines: [1, 2] })]), { depuis: 4 });
  assert.equal(vide.includes("BEGIN:VEVENT"), false);
});

test("fin après minuit (24h00) : DTEND au lendemain", () => {
  const evs = evenements(E.construire(horaire([cours({ debut: "20h00", fin: "24h00" })])));
  assert.equal(champ(evs[0], "DTSTART"), "20260914T200000");
  assert.equal(champ(evs[0], "DTEND"), "20260915T000000");
});

test("fin absente ou incohérente : une heure par défaut, jamais de fin avant début", () => {
  const sansFin = evenements(E.construire(horaire([cours({ fin: "" })])));
  assert.equal(champ(sansFin[0], "DTEND"), "20260914T093000");
  const inverse = evenements(E.construire(horaire([cours({ debut: "10h00", fin: "09h00" })])));
  assert.equal(champ(inverse[0], "DTEND"), "20260914T110000");
});

test("jour de semaine : chaque date tombe le bon jour", () => {
  const evs = evenements(E.construire(horaire([cours({ jour: 4, semaines: [1, 2] })])));
  assert.equal(champ(evs[0], "DTSTART"), "20260918T083000"); // vendredi
  assert.equal(champ(evs[1], "DTSTART"), "20260925T083000");
});

test("caractères spéciaux échappés (virgules, points-virgules, retours)", () => {
  const evs = evenements(E.construire(horaire([cours({
    matiere: "Droit, pénal; partie 2",
    salles: "BARB 12, BARB 13",
    profs: "Dupont\nDurand",
  })])));
  assert.equal(champ(evs[0], "SUMMARY"), "Droit\\, pénal\\; partie 2");
  assert.equal(champ(evs[0], "LOCATION"), "BARB 12\\, BARB 13");
  assert.ok(evs[0].some((x) => x.includes("Prof : Dupont\\nDurand")));
});

test("identifiants stables : même séance au même jour, même UID ; dates et cours différents, UID différents", () => {
  const a = evenements(E.construire(horaire([cours({ semaines: [1, 2] })]), { uid: "p1" }));
  const b = evenements(E.construire(horaire([cours({ semaines: [2, 3] })]), { uid: "p1" }));
  const c = evenements(E.construire(horaire([cours({ debut: "10h30", semaines: [1, 2] })]), { uid: "p1" }));
  const uid = (ev) => champ(ev, "UID");
  // La semaine 2 est commune : même UID (une réimportation met à jour).
  assert.equal(uid(a[1]), uid(b[0]));
  assert.notEqual(uid(a[0]), uid(a[1]));
  assert.notEqual(uid(a[0]), uid(c[0]));
  assert.ok(uid(a[0]).startsWith("ezh-p1-"));
  assert.ok(uid(a[0]).endsWith("@ezhoraire.be"));
});

test("toutes les lignes physiques tiennent en 75 octets (pliage RFC 5545)", () => {
  const long = cours({
    matiere: "D-SCJU-136 - Introduction historique au droit romain et aux institutions juridiques de l'Antiquité tardive",
    profs: "Professeur Jean-Baptiste de la Fontaine, Professeure Anne-Charlotte Van den Berghe",
    salles: "Bâtiment Marc de Hemptinne — Auditoire A, Bâtiment Lavoisier — Local 12",
    groupes: ["Groupe A", "Groupe B", "Groupe C"],
    semaines: [1, 2, 3, 5, 6, 7, 9, 10, 11, 12],
  });
  const ics = E.construire(horaire([long]));
  for (const ligne of ics.split("\r\n")) {
    assert.ok(Buffer.byteLength(ligne, "utf8") <= 75, `ligne trop longue : ${ligne}`);
  }
  // Le contenu reste intact une fois le pliage défait.
  assert.ok(lignes(ics).some((x) => x.startsWith("SUMMARY:D-SCJU-136 · Introduction historique")));
  assert.equal(evenements(ics).length, 10);
});

test("nom de fichier : caractères interdits retirés, extension .ics", () => {
  assert.equal(E.nomFichier("Info"), "EzHoraire - Info.ics");
  assert.equal(E.nomFichier("Bac 2 / Droit : spécial"), "EzHoraire - Bac 2 Droit spécial.ics");
  assert.equal(E.nomFichier(""), "EzHoraire - Horaire.ics");
});

test("premier lundi manquant : erreur explicite plutôt que calendrier invalide", () => {
  assert.throws(() => E.construire({ nom: "x", cours: [cours()] }), /premier lundi/);
});
