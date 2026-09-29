// Tests de la recherche d'un cours (recherche.js) :
// node --test tests/test_recherche.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const R = createRequire(import.meta.url)("../assets/js/recherche.js");

test("correspond : le début de n'importe quel mot suffit", () => {
  assert.equal(R.correspond("Programmation orientée objet", "obj"), true);
  assert.equal(R.correspond("Programmation orientée objet", "prog"), true);
  assert.equal(R.correspond("Programmation orientée objet", "orie"), true);
  assert.equal(R.correspond("Programmation orientée objet", "ram"), false);
  assert.equal(R.correspond("Analyse", "ana"), true);
  assert.equal(R.correspond("Analyse", "nalyse"), false);
});

test("correspond : casse et accents ignorés", () => {
  assert.equal(R.correspond("Programmation orientée objet", "PROG"), true);
  assert.equal(R.correspond("Introduction au droit", "int"), true);
  assert.equal(R.correspond("Économie politique", "eco"), true);
  assert.equal(R.correspond("Économie politique", "économ"), true);
});

test("correspond : chaque mot tapé doit commencer un mot", () => {
  assert.equal(R.correspond("Programmation orientée objet", "prog obj"), true);
  assert.equal(R.correspond("Programmation orientée objet", "obj prog"), true);
  assert.equal(R.correspond("Programmation orientée objet", "prog ana"), false);
  assert.equal(R.correspond("Programmation orientée objet", "  "), true);
});

test("correspond : ponctuation et codes", () => {
  assert.equal(R.correspond("DROI-D-1001 - Droit romain", "droit"), true);
  assert.equal(R.correspond("DROI-D-1001 - Droit romain", "droi"), true);
  assert.equal(R.correspond("1/36A", "36a"), true);
  assert.equal(R.correspond("1/36A", "36b"), false);
});

test("surligner : marque le début du mot trouvé", () => {
  assert.equal(R.surligner("Analyse", "an"), "<mark>An</mark>alyse");
  assert.equal(R.surligner("Programmation orientée objet", "obj"),
    "Programmation orientée <mark>obj</mark>et");
  assert.equal(R.surligner("Programmation orientée objet", "prog or"),
    "<mark>Prog</mark>rammation <mark>or</mark>ientée objet");
  assert.equal(R.surligner("Analyse", ""), "Analyse");
  assert.equal(R.surligner("Analyse", "xyz"), "Analyse");
});

test("surligner : échappe le HTML de l'intitulé", () => {
  assert.equal(R.surligner("<img src=x> Analyse", "ana"),
    "&lt;img src=x&gt; <mark>Ana</mark>lyse");
});

test("grouper : un groupe par intitulé, nom nettoyé, séances triées", () => {
  const cours = [
    { matiere: "Analyse", jour: 4, debut: "10h30", semaines: [1, 2] },
    { matiere: "Analyse", jour: 0, debut: "08h15", semaines: [2] },
    { matiere: "Anglais", jour: 1, debut: "13h30", semaines: [1] },
  ];
  const g = R.grouper(cours, (m) => m);
  assert.deepEqual(g.map((x) => x.nom), ["Analyse", "Anglais"]);
  assert.equal(g[0].seances.length, 3);
  assert.deepEqual(g[0].seances.map((s) => [s.semaine, s.cours.jour]), [[1, 4], [2, 0], [2, 4]]);
  assert.equal(g[0].seances[0].cours, cours[0]); // la séance garde son cours d'origine
});

test("grouper : une séance par semaine publiée, semaine vide ignorée", () => {
  const g = R.grouper([{ matiere: "Analyse", jour: 0, debut: "08h15", semaines: [1, 3] }]);
  assert.deepEqual(g[0].seances.map((s) => s.semaine), [1, 3]);
  assert.deepEqual(R.grouper([{ matiere: "Analyse", semaines: [] }])[0].seances, []);
  assert.deepEqual(R.grouper([]), []);
});

test("filtrer : garde les intitulés qui correspondent", () => {
  const groupes = R.grouper([
    { matiere: "Analyse", semaines: [1] },
    { matiere: "Anglais", semaines: [1] },
    { matiere: "Bases de données", semaines: [1] },
  ]);
  assert.deepEqual(R.filtrer(groupes, "an").map((g) => g.matiere), ["Analyse", "Anglais"]);
  assert.deepEqual(R.filtrer(groupes, "bases").map((g) => g.matiere), ["Bases de données"]);
  assert.deepEqual(R.filtrer(groupes, "   ").length, 3);
  assert.deepEqual(R.filtrer(groupes, "xyz"), []);
});

test("grouper : tri alphabétique français, codes compris", () => {
  const groupes = R.grouper([
    { matiere: "Économie", semaines: [1] },
    { matiere: "Droit", semaines: [1] },
    { matiere: "Analyse", semaines: [1] },
  ], (m) => m);
  assert.deepEqual(groupes.map((g) => g.nom), ["Analyse", "Droit", "Économie"]);
});
