// Tests du choix de la semaine affichée d'office (semaine.js) :
// node --test test_semaine.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const S = createRequire(import.meta.url)("./semaine.js");

// Lundi 14 septembre 2026 : ancre des semaines 1..6.
const LUNDI0 = new Date(2026, 8, 14);
const SEMAINES = [1, 2, 3, 4, 5, 6];

// `jour` : 0 = lundi … 6 = dimanche.
function date(semaine, jour) {
  const d = new Date(LUNDI0);
  d.setDate(d.getDate() + (semaine - 1) * 7 + jour);
  return d;
}
function seances(jours, semaines = SEMAINES) {
  return jours.map((jour) => ({ jour, semaines: semaines.slice() }));
}
function choix(auj, cours, semaines = SEMAINES) {
  return S.semaineAffichee(LUNDI0, semaines, cours, auj);
}

test("dernierJourDeCours : le plus grand jour de la semaine, -1 sans cours", () => {
  assert.equal(S.dernierJourDeCours(seances([0, 5, 2]), 1), 5);
  assert.equal(S.dernierJourDeCours(seances([0, 1], [1]), 2), -1);
  assert.equal(S.dernierJourDeCours(null, 1), -1);
});

test("semaine du lundi au vendredi : vendredi reste, samedi bascule", () => {
  const cours = seances([0, 1, 2, 3, 4]);
  assert.equal(choix(date(1, 4), cours), 1);
  assert.equal(choix(date(1, 5), cours), 2);
  assert.equal(choix(date(1, 6), cours), 2);
});

test("cours le samedi : samedi reste, dimanche bascule", () => {
  const cours = seances([0, 1, 2, 3, 4, 5]);
  assert.equal(choix(date(1, 5), cours), 1);
  assert.equal(choix(date(1, 6), cours), 2);
});

test("cours le dimanche : dimanche reste, lundi bascule (semaine calendaire)", () => {
  const cours = seances([0, 1, 2, 3, 4, 5, 6]);
  assert.equal(choix(date(1, 6), cours), 1);
  assert.equal(choix(date(2, 0), cours), 2);
});

test("en semaine, pas de bascule anticipée (dernier cours le mardi)", () => {
  const cours = seances([0, 1]);
  assert.equal(choix(date(1, 2), cours), 1);
  assert.equal(choix(date(1, 4), cours), 1);
  assert.equal(choix(date(1, 5), cours), 2);
});

test("semaine sans cours : affichée jusqu'au samedi, puis bascule", () => {
  assert.equal(choix(date(1, 4), []), 1);
  assert.equal(choix(date(1, 5), []), 2);
});

test("semaine non publiée par l'école (congés) : la publiée suivante", () => {
  assert.equal(choix(date(3, 2), seances([0]), [1, 2, 4, 5, 6]), 4);
});

test("avant la rentrée et après la dernière semaine : ramené aux bornes", () => {
  assert.equal(choix(new Date(2026, 7, 20), seances([0])), 1);
  assert.equal(choix(new Date(2026, 11, 20), seances([0])), 6);
});

test("seuls les cours de la semaine comptent (samedi d'une autre semaine)", () => {
  const samediEnSemaine3 = [{ jour: 5, semaines: [3] }];
  assert.equal(choix(date(1, 5), samediEnSemaine3), 2); // pas de cours ce samedi
  assert.equal(choix(date(3, 5), samediEnSemaine3), 3); // cours le samedi 3
  assert.equal(choix(date(3, 6), samediEnSemaine3), 4);
});

test("changement d'heure : le lundi 2 novembre 2026 reste en semaine 8", () => {
  assert.equal(choix(date(8, 0), seances([0]), [7, 8]), 8);
});

test("lundi en chaîne ISO : même résultat qu'avec une Date", () => {
  assert.equal(S.semaineAffichee("2026-09-14", SEMAINES, seances([0, 1, 2, 3, 4]), date(1, 5)), 2);
});
