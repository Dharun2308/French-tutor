// Takes the verb defs and runs them through the conjugator to produce flat
// seed data. Also includes a sanity checker that verifies ~40 hand-picked
// forms before any DB write — so if the conjugator regresses, the seed
// script will refuse to run rather than pollute the DB.

import type { Level, Tense, Person } from "@/types";
import { VERBS } from "./verbs";
import {
  conjugate,
  groupFromPattern,
  type ConjugationRow,
  type VerbDef,
} from "./conjugator";

export interface BuiltVerb {
  infinitive: string;
  english: string;
  group: "1" | "2" | "irregular";
  level: Level;
  auxiliary: "avoir" | "etre";
  frequencyRank: number;
  conjugations: ConjugationRow[];
}

export function build(): BuiltVerb[] {
  return VERBS.map((v: VerbDef) => ({
    infinitive: v.infinitive,
    english: v.english,
    group: groupFromPattern(v.pattern),
    level: v.level,
    auxiliary: v.auxiliary,
    frequencyRank: v.frequencyRank,
    conjugations: conjugate(v),
  }));
}

// ---- Sanity checks ----

interface Expect {
  infinitive: string;
  tense: Tense;
  person: Person;
  form: string;
}

const EXPECTATIONS: Expect[] = [
  // être — present
  { infinitive: "être", tense: "present", person: "1s", form: "suis" },
  { infinitive: "être", tense: "present", person: "2s", form: "es" },
  { infinitive: "être", tense: "present", person: "3s", form: "est" },
  { infinitive: "être", tense: "present", person: "1p", form: "sommes" },
  { infinitive: "être", tense: "present", person: "2p", form: "êtes" },
  { infinitive: "être", tense: "present", person: "3p", form: "sont" },
  // être — imparfait (the override path)
  { infinitive: "être", tense: "imparfait", person: "1s", form: "étais" },
  { infinitive: "être", tense: "imparfait", person: "1p", form: "étions" },
  // être — futur (stem override)
  { infinitive: "être", tense: "futur_simple", person: "1s", form: "serai" },
  { infinitive: "être", tense: "futur_simple", person: "3p", form: "seront" },
  // être — passé composé with avoir
  { infinitive: "être", tense: "passe_compose", person: "1s", form: "ai été" },

  // avoir
  { infinitive: "avoir", tense: "present", person: "1s", form: "ai" },
  { infinitive: "avoir", tense: "futur_simple", person: "1s", form: "aurai" },
  { infinitive: "avoir", tense: "passe_compose", person: "1s", form: "ai eu" },
  { infinitive: "avoir", tense: "imparfait", person: "1p", form: "avions" },

  // aller (être aux)
  { infinitive: "aller", tense: "present", person: "1s", form: "vais" },
  { infinitive: "aller", tense: "present", person: "1p", form: "allons" },
  { infinitive: "aller", tense: "futur_simple", person: "1s", form: "irai" },
  { infinitive: "aller", tense: "passe_compose", person: "1s", form: "suis allé" },
  { infinitive: "aller", tense: "passe_compose", person: "1p", form: "sommes allés" },

  // faire
  { infinitive: "faire", tense: "present", person: "2p", form: "faites" },
  { infinitive: "faire", tense: "imparfait", person: "1s", form: "faisais" },
  { infinitive: "faire", tense: "futur_simple", person: "1s", form: "ferai" },

  // pouvoir
  { infinitive: "pouvoir", tense: "present", person: "1s", form: "peux" },
  { infinitive: "pouvoir", tense: "futur_simple", person: "1s", form: "pourrai" },

  // vouloir
  { infinitive: "vouloir", tense: "present", person: "3p", form: "veulent" },
  { infinitive: "vouloir", tense: "futur_simple", person: "1s", form: "voudrai" },

  // prendre
  { infinitive: "prendre", tense: "present", person: "1p", form: "prenons" },
  { infinitive: "prendre", tense: "present", person: "3p", form: "prennent" },
  { infinitive: "prendre", tense: "passe_compose", person: "1s", form: "ai pris" },
  { infinitive: "prendre", tense: "futur_simple", person: "1s", form: "prendrai" },

  // boire — stem change in present
  { infinitive: "boire", tense: "present", person: "1p", form: "buvons" },
  { infinitive: "boire", tense: "imparfait", person: "1s", form: "buvais" },

  // parler — group 1 regular
  { infinitive: "parler", tense: "present", person: "1s", form: "parle" },
  { infinitive: "parler", tense: "present", person: "1p", form: "parlons" },
  { infinitive: "parler", tense: "imparfait", person: "1p", form: "parlions" },
  { infinitive: "parler", tense: "futur_simple", person: "1s", form: "parlerai" },
  { infinitive: "parler", tense: "passe_compose", person: "1s", form: "ai parlé" },
  { infinitive: "parler", tense: "futur_proche", person: "1s", form: "vais parler" },

  // finir — group 2
  { infinitive: "finir", tense: "present", person: "1s", form: "finis" },
  { infinitive: "finir", tense: "present", person: "1p", form: "finissons" },
  { infinitive: "finir", tense: "imparfait", person: "1s", form: "finissais" },
  { infinitive: "finir", tense: "futur_simple", person: "1s", form: "finirai" },
  { infinitive: "finir", tense: "passe_compose", person: "1s", form: "ai fini" },

  // manger — -ger quirks
  { infinitive: "manger", tense: "present", person: "1p", form: "mangeons" },
  { infinitive: "manger", tense: "imparfait", person: "1s", form: "mangeais" },
  { infinitive: "manger", tense: "imparfait", person: "1p", form: "mangions" },

  // étudier — double i in imparfait nous/vous
  { infinitive: "étudier", tense: "imparfait", person: "1p", form: "étudiions" },
  { infinitive: "étudier", tense: "imparfait", person: "2p", form: "étudiiez" },

  // arriver — être aux, regular -er
  { infinitive: "arriver", tense: "passe_compose", person: "1s", form: "suis arrivé" },
  { infinitive: "arriver", tense: "passe_compose", person: "1p", form: "sommes arrivés" },
];

export function runSanityChecks(built: BuiltVerb[]): void {
  const byKey = new Map<string, string>();
  for (const v of built) {
    for (const c of v.conjugations) {
      byKey.set(`${v.infinitive}|${c.tense}|${c.person}`, c.form);
    }
  }
  const failures: string[] = [];
  for (const exp of EXPECTATIONS) {
    const got = byKey.get(`${exp.infinitive}|${exp.tense}|${exp.person}`);
    if (got !== exp.form) {
      failures.push(
        `  ${exp.infinitive} ${exp.tense} ${exp.person}: expected "${exp.form}", got "${got ?? "(missing)"}"`
      );
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `Conjugator sanity check failed (${failures.length} mismatches):\n${failures.join("\n")}`
    );
  }
}
