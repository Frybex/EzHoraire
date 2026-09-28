// Tests du moteur de l'horaire sur mesure (fusion.js) : node --test tests/test_fusion.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const F = createRequire(import.meta.url)("../assets/js/fusion.js");

function horaire(lundi, cours, extra = {}) {
  return {
    meta: { premier_lundi: lundi, periode: "[1..14]", feries: "[]", ts: 1, fetched_at: "x", ...extra },
    formation: "f", groupes: [...new Set(cours.flatMap((c) => c.groupes))], cours,
  };
}
function c(matiere, jour, debut, fin, semaines = [1, 2], groupes = [], autres = {}) {
  return { matiere, jour, debut, fin, semaines, groupes, profs: "", salles: "", type: "", ...autres };
}

test("clés de cours : intitulé exact, codes UE à l'ULB", () => {
  assert.deepEqual(F.clesCours("D-SCJU-200 - Obligations - partie 2"), ["D-SCJU-200 - Obligations - partie 2"]);
  assert.deepEqual(F.clesCours("COMMB115, COMMB230"), ["COMMB115", "COMMB230"]);
  assert.deepEqual(F.clesCours("Analyse, TP"), ["Analyse, TP"]);
});

test("année principale : on retire, une séance mutualisée reste tant qu'un code est suivi", () => {
  const d = horaire("2026-09-14", [c("COMMB115, COMMB230", 0, "08h00", "10h00"), c("COMMB120", 1, "08h00", "10h00")]);
  const src = { role: "principale", sans: ["COMMB115", "COMMB120"], groupes: [] };
  assert.equal(F.filtrerSource(d, src).length, 1);
  src.sans.push("COMMB230");
  assert.equal(F.filtrerSource(d, src).length, 0);
});

test("année d'ajout : seuls les cours cochés, séances sans groupe comprises", () => {
  const d = horaire("2026-09-14", [
    c("Analyse", 0, "08h00", "10h00", [1], ["Groupe A"]),
    c("Analyse", 0, "08h00", "10h00", [1], ["Groupe B"]),
    c("Projet", 1, "08h00", "10h00", [1], []),
  ]);
  const src = { role: "ajout", avec: ["Analyse"], groupes: ["Groupe A"] };
  const gardes = F.filtrerSource(d, src);
  assert.equal(gardes.length, 1);
  assert.deepEqual(gardes[0].groupes, ["Groupe A"]);
  // Parcours PAR: sans « avec » : tout est gardé.
  assert.equal(F.filtrerSource(d, { role: "ajout", formation: "PAR:X1234", groupes: [] }).length, 3);
});

test("groupes homonymes : chaque source filtre chez elle", () => {
  const ba1 = horaire("2026-09-14", [c("Math", 0, "08h00", "10h00", [1], ["Groupe 1"]), c("Math", 0, "10h00", "12h00", [1], ["Groupe 2"])]);
  const ba2 = horaire("2026-09-14", [c("Droit", 1, "08h00", "10h00", [1], ["Groupe 1"]), c("Droit", 1, "10h00", "12h00", [1], ["Groupe 2"])]);
  const r = F.fusionner([
    { source: { role: "principale", sans: [], groupes: ["Groupe 2"] }, data: ba2 },
    { source: { role: "ajout", avec: ["Math"], groupes: ["Groupe 1"] }, data: ba1 },
  ]);
  assert.deepEqual(r.cours.map((x) => x.matiere + x.debut).sort(), ["Droit10h00", "Math08h00"]);
});

test("dédoublonnage entre sources, pas à l'intérieur d'une source", () => {
  const commun = () => c("Conférence", 2, "12h00", "14h00", [3]);
  const a = horaire("2026-09-07", [commun(), commun()]);
  const b = horaire("2026-09-07", [{ ...commun(), semaines: [3, 4] }]);
  const r = F.fusionner([
    { source: { role: "principale", sans: [], groupes: [] }, data: a },
    { source: { role: "ajout", avec: ["Conférence"], groupes: [] }, data: b },
  ]);
  assert.equal(r.cours.length, 2); // les deux lignes de A restent, celle de B fusionne
  assert.deepEqual(r.cours[0].semaines, [3, 4]);
  assert.deepEqual(r.cours[0].srcs, [0, 1]);
  assert.equal(F.chevauchements(r.cours).length, 0);
});

test("alignement : référence = le lundi le plus tôt, fériés et noms décalés", () => {
  const principale = horaire("2026-09-21", [c("A", 0, "08h00", "10h00", [1])], { feries: "[3]", feries_noms: { "3": "Fête" } });
  const ajout = horaire("2026-09-14", [c("B", 0, "08h00", "10h00", [1])]);
  const r = F.fusionner([
    { source: { role: "principale", sans: [], groupes: [] }, data: principale },
    { source: { role: "ajout", avec: ["B"], groupes: [] }, data: ajout },
  ]);
  assert.equal(r.meta.premier_lundi, "2026-09-14");
  assert.deepEqual(r.cours.find((x) => x.matiere === "A").semaines, [2]);
  assert.deepEqual(r.cours.find((x) => x.matiere === "B").semaines, [1]);
  assert.equal(r.meta.feries, "[10]");
  assert.equal(r.meta.feries_noms[10], "Fête");
  assert.equal(r.meta.periode, "[1..15]");
});

test("une source d'une autre année (repli UCLouvain) est écartée", () => {
  const cette = horaire("2026-09-14", [c("A", 0, "08h00", "10h00")]);
  const ancienne = horaire("2025-09-15", [c("B", 0, "08h00", "10h00")]);
  const r = F.fusionner([
    { source: { role: "principale", sans: [], groupes: [] }, data: cette },
    { source: { role: "ajout", avec: ["B"], groupes: [] }, data: ancienne },
  ]);
  assert.deepEqual(r.infos.ecartees, [1]);
  assert.equal(r.meta.premier_lundi, "2026-09-14");
  assert.deepEqual(r.cours.map((x) => x.matiere), ["A"]);
});

test("source manquante, groupes perdus, cours disparus", () => {
  const d = horaire("2026-09-14", [c("Analyse II", 0, "08h00", "10h00", [1], ["Groupe A"])]);
  const r = F.fusionner([
    { source: { role: "principale", sans: [], groupes: [] }, data: null },
    { source: { role: "ajout", avec: ["Analyse"], groupes: ["Groupe Z"] }, data: d },
  ]);
  assert.deepEqual(r.infos.manquantes, [0]);
  assert.deepEqual(r.infos.perdus, [{ i: 1, groupes: ["Groupe Z"] }]);
  assert.deepEqual(r.infos.disparus, [{ i: 1, cles: ["Analyse"] }]);
});

test("chevauchements : seulement entre sources, semaines communes", () => {
  const a = horaire("2026-09-14", [c("Anglais", 1, "10h45", "12h45", [1, 2]), c("Événement", 1, "08h00", "22h00", [1])]);
  const b = horaire("2026-09-14", [c("Analyse TP", 1, "11h00", "13h00", [2, 3]), c("Suite", 1, "12h45", "14h00", [2])]);
  const r = F.fusionner([
    { source: { role: "principale", sans: [], groupes: [] }, data: a },
    { source: { role: "ajout", avec: ["Analyse TP"], groupes: [] }, data: b },
  ]);
  const chocs = F.chevauchements(r.cours);
  const lisibles = chocs.map((x) => [x.a.matiere, x.b.matiere].sort().join("/") + ":" + x.semaines.join(","));
  assert.deepEqual(lisibles.sort(), ["Analyse TP/Anglais:2"]);
});

test("parcours PAR: deux cours distincts qui se chevauchent = conflit, même source", () => {
  const d = horaire("2026-09-14", [
    c("COMMB115", 0, "08h00", "10h00", [1], ["Groupe A"]),
    c("COMMB115", 0, "08h00", "10h00", [1], ["Groupe B"]), // même cours : alternatives
    c("DROIC2001", 0, "09h00", "11h00", [1]),
  ]);
  const par = { role: "principale", formation: "PAR:COMMB115,DROIC2001", groupes: [], sans: [] };
  // Hors parcours, les superpositions d'une même source ne sont pas signalées.
  assert.equal(F.chevauchements(d.cours).length, 0);
  // En parcours : chaque séance du cours choisi fait face à l'autre cours.
  const chocs = F.chevauchements(d.cours, [par]);
  assert.equal(chocs.length, 2);
  assert.ok(chocs.every((x) =>
    [x.a.matiere, x.b.matiere].sort().join("/") === "COMMB115/DROIC2001"));
  assert.deepEqual(chocs[0].semaines, [1]);
  // Pas de conflit entre les semaines de l'un et de l'autre.
  const ailleurs = d.cours.map((x) => ({ ...x, semaines: [2] }));
  assert.equal(F.chevauchements(ailleurs, [par]).length, 2);
  ailleurs[2].semaines = [3];
  assert.equal(F.chevauchements(ailleurs, [par]).length, 0);
});

test("parcours PAR: séances d'un même cours reconnues sous des intitulés différents", () => {
  const d = horaire("2026-09-14", [
    c("LINFO1101 - Programmation", 0, "08h00", "10h00", [1], ["TP A"]),
    c("LINFO1101 - Programmation (TP)", 0, "08h00", "10h00", [1], ["TP B"]),
    c("LEPL1101 - Physique", 0, "09h00", "11h00", [1]),
  ]);
  const par = { role: "principale", formation: "PAR:LINFO1101,LEPL1101", groupes: [], sans: [] };
  assert.equal(F.memesCours(d.cours[0], d.cours[1]), true);
  assert.equal(F.memesCours(d.cours[0], d.cours[2]), false);
  const chocs = F.chevauchements(d.cours, [par]);
  assert.equal(chocs.length, 2); // les deux séances LINFO face à LEPL
  assert.ok(chocs.every((x) => x.a.matiere.startsWith("LINFO") || x.b.matiere.startsWith("LINFO")));
});

test("profil par codes de cours : conflits détectés sans champ src", () => {
  const d = horaire("2026-09-14", [
    c("SIMU1101", 0, "08h15", "10h15"),
    c("SIMU2101", 0, "09h00", "12h00"),
  ]);
  const profil = { ecole: "sim", formation: "PAR:SIMU1101,SIMU2101", groupes: [] };
  assert.equal(F.chevauchements(d.cours, [profil]).length, 1);
  // Intitulé ordinaire, même sans code : le cours reste lui-même.
  assert.equal(F.memesCours({ matiere: "Droit civil" }, { matiere: "Droit civil - partie 2" }), false);
});

test("données cochées : l'écran des groupes ne voit que les groupes des cours gardés", () => {
  const d = horaire("2026-09-14", [
    c("Analyse", 0, "08h00", "10h00", [1], ["An - Gr 1"]),
    c("Droit", 0, "08h00", "10h00", [1], ["Dr - Gr 1"]),
  ]);
  const copie = F.donneesCochees(d, { role: "ajout", avec: ["Analyse"] });
  assert.deepEqual(copie.groupes, ["An - Gr 1"]);
  assert.equal(copie.cours.length, 1);
  assert.equal(d.cours.length, 2);
});

test("validation des sources", () => {
  const ok = (id) => ["heh", "ulb"].includes(id);
  const p = {
    ecole: "heh",
    sources: [
      { ecole: "heh", formation: "BA2", role: "principale", groupes: [], sans: ["Projet"] },
      { ecole: "heh", formation: "BA1", role: "ajout", groupes: ["G"], avec: ["Analyse"] },
    ],
  };
  assert.equal(F.sourcesValides(p, ok).length, 2);
  assert.equal(F.sourcesValides({ ...p, ecole: "ulb" }, ok), null); // même école exigée
  assert.equal(F.sourcesValides({ ecole: "heh", sources: [{ ecole: "heh", formation: "BA1", role: "ajout", avec: [] }] }, ok), null);
  assert.equal(F.sourcesValides({ ecole: "ulb", sources: [{ ecole: "ulb", formation: "PAR:COMMB120", role: "ajout" }] }, ok).length, 1);
  assert.equal(F.sourcesValides({ ecole: "heh", sources: [] }, ok), null);
});

test("ensembles", () => {
  assert.equal(F.formatEns([3, 1, 2, 5, 5, 7, 8]), "[1..3,5,7..8]");
  assert.deepEqual(F.parseEns("[1..3,5]"), [1, 2, 3, 5]);
  assert.equal(F.formatEns([]), "[]");
});

test("nouvelles semaines : l'école allonge sa période par tranches", () => {
  // La HEH commence par [1..14] puis publie la suite.
  assert.deepEqual(F.nouvellesSemaines("[1..14]", "[1..20]"), [15, 16, 17, 18, 19, 20]);
  assert.deepEqual(F.nouvellesSemaines("[1..14]", "[1..14]"), []);
  // Trou de congés : la semaine 15 n'est pas publiée, on ne l'annonce pas.
  assert.deepEqual(F.nouvellesSemaines("[1..14]", "[1..14,16..18]"), [16, 17, 18]);
  // Semaine isolée comblée après coup.
  assert.deepEqual(F.nouvellesSemaines("[1..14,16]", "[1..16]"), [15]);
  // Période vue absente (premier passage) ou vide : rien à annoncer.
  assert.deepEqual(F.nouvellesSemaines(null, "[1..14]"), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  assert.deepEqual(F.nouvellesSemaines("[1..14]", "[]"), []);
});
