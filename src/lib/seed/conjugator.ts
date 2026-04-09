// French verb conjugation engine used by the seed script.
//
// Strategy: for regular group 1 (-er), group 2 (-ir with -iss-), and most
// irregulars, we derive as much as possible from a small set of stems:
//   - present (6 forms) — overridable, defaulted for regulars
//   - imparfait stem = present nous-form minus "-ons" (works for all but être)
//   - futur/conditionnel = infinitive (or infinitive - "e" for -re) + endings,
//     overridable for irregular stems (aur-, pourr-, voudr-, viendr-, etc.)
//   - past participle — overridable
//   - passé composé = auxiliary (present) + participle, with masculine plural
//     agreement for nous/vous/ils when auxiliary is être (documented choice)
//   - futur proche = aller (present) + infinitive
//
// Every special case that matters is a named variant or an explicit override.
// Forms that the tutor should not accept as correct should NOT be emitted at
// all — it's better to have a narrower but trustworthy seed.

import type { Person, Tense, Level } from "@/types";

export type VerbPattern =
  | "er" // parler
  | "er_ger" // manger (keep 'e' before a/o)
  | "er_ier" // étudier (double 'i' in imparfait nous/vous)
  | "ir_iss" // finir, choisir
  | "irregular"; // full control via overrides

export interface VerbDef {
  infinitive: string;
  english: string;
  pattern: VerbPattern;
  level: Level;
  auxiliary: "avoir" | "etre";
  frequencyRank: number;
  // Overrides for irregulars
  present?: SixForms;
  imparfait?: SixForms;
  futurStem?: string;
  pastParticiple?: string;
}

type SixForms = readonly [string, string, string, string, string, string];

export interface ConjugationRow {
  tense: Tense;
  person: Person;
  form: string;
  isIrregular: boolean;
}

export const PERSONS: readonly Person[] = [
  "1s",
  "2s",
  "3s",
  "1p",
  "2p",
  "3p",
] as const;

// ---- Ending tables ----

const ER_PRESENT_ENDINGS = ["e", "es", "e", "ons", "ez", "ent"] as const;
const IR_ISS_PRESENT_ENDINGS = [
  "is",
  "is",
  "it",
  "issons",
  "issez",
  "issent",
] as const;
const FUTUR_ENDINGS = ["ai", "as", "a", "ons", "ez", "ont"] as const;
const IMPARFAIT_AND_COND_ENDINGS = [
  "ais",
  "ais",
  "ait",
  "ions",
  "iez",
  "aient",
] as const;

function six(values: readonly string[]): SixForms {
  if (values.length !== 6) {
    throw new Error(`Expected 6 forms, got ${values.length}: ${values.join(", ")}`);
  }
  return [values[0], values[1], values[2], values[3], values[4], values[5]];
}

// ---- Regular group builders ----

function presentGroup1(infinitive: string): SixForms {
  const stem = infinitive.slice(0, -2); // drop "er"
  return six(ER_PRESENT_ENDINGS.map((e) => stem + e));
}

function presentGroup1Ger(infinitive: string): SixForms {
  // manger: nous form keeps 'e' before 'o' → "mangeons"
  const stem = infinitive.slice(0, -2); // "mang"
  return [
    stem + "e",
    stem + "es",
    stem + "e",
    stem + "eons",
    stem + "ez",
    stem + "ent",
  ];
}

function presentGroup1Ier(infinitive: string): SixForms {
  // étudier: present is identical to normal -er (double 'i' only shows in imparfait)
  return presentGroup1(infinitive);
}

function presentGroup2(infinitive: string): SixForms {
  const stem = infinitive.slice(0, -2); // drop "ir"
  return six(IR_ISS_PRESENT_ENDINGS.map((e) => stem + e));
}

function imparfaitFromNous(nousForm: string): SixForms {
  // imparfait stem = present nous form minus "ons"
  const stem = nousForm.slice(0, -3);
  return six(IMPARFAIT_AND_COND_ENDINGS.map((e) => stem + e));
}

function imparfaitGer(infinitive: string): SixForms {
  // manger: keep 'e' before endings starting with 'a' (ais, ait, aient)
  // but NOT before endings starting with 'i' (ions, iez)
  const stem = infinitive.slice(0, -2); // "mang"
  return [
    stem + "eais",
    stem + "eais",
    stem + "eait",
    stem + "ions",
    stem + "iez",
    stem + "eaient",
  ];
}

function futurFromStem(stem: string): SixForms {
  return six(FUTUR_ENDINGS.map((e) => stem + e));
}

function conditionnelFromStem(stem: string): SixForms {
  return six(IMPARFAIT_AND_COND_ENDINGS.map((e) => stem + e));
}

function defaultFuturStem(infinitive: string): string {
  // -re → drop the "e" (prendre → prendr-)
  if (infinitive.endsWith("re")) return infinitive.slice(0, -1);
  // -er and -ir → keep the infinitive (parler → parler-, finir → finir-)
  return infinitive;
}

function defaultPastParticiple(
  pattern: VerbPattern,
  infinitive: string
): string {
  if (pattern === "er" || pattern === "er_ger" || pattern === "er_ier") {
    return infinitive.slice(0, -2) + "é"; // parler → parlé
  }
  if (pattern === "ir_iss") {
    return infinitive.slice(0, -2) + "i"; // finir → fini
  }
  throw new Error(
    `No default past participle for pattern ${pattern} (${infinitive})`
  );
}

// ---- Compound tenses ----

const AVOIR_PRESENT: SixForms = ["ai", "as", "a", "avons", "avez", "ont"];
const ETRE_PRESENT: SixForms = ["suis", "es", "est", "sommes", "êtes", "sont"];
const ALLER_PRESENT: SixForms = ["vais", "vas", "va", "allons", "allez", "vont"];

function passeCompose(
  auxiliary: "avoir" | "etre",
  participle: string
): SixForms {
  if (auxiliary === "avoir") {
    return six(AVOIR_PRESENT.map((a) => `${a} ${participle}`));
  }
  // être: masculine default. Plural agreement for nous/vous/ils.
  const pluralParticiple = participle + "s";
  return [
    `${ETRE_PRESENT[0]} ${participle}`,
    `${ETRE_PRESENT[1]} ${participle}`,
    `${ETRE_PRESENT[2]} ${participle}`,
    `${ETRE_PRESENT[3]} ${pluralParticiple}`,
    `${ETRE_PRESENT[4]} ${pluralParticiple}`,
    `${ETRE_PRESENT[5]} ${pluralParticiple}`,
  ];
}

function futurProche(infinitive: string): SixForms {
  return six(ALLER_PRESENT.map((a) => `${a} ${infinitive}`));
}

// ---- Main entry point ----

export function conjugate(verb: VerbDef): ConjugationRow[] {
  let present: SixForms;
  let imparfait: SixForms;
  let futurStem: string;
  let pastParticiple: string;

  switch (verb.pattern) {
    case "er":
      present = verb.present ?? presentGroup1(verb.infinitive);
      imparfait = verb.imparfait ?? imparfaitFromNous(present[3]);
      break;
    case "er_ger":
      present = verb.present ?? presentGroup1Ger(verb.infinitive);
      imparfait = verb.imparfait ?? imparfaitGer(verb.infinitive);
      break;
    case "er_ier":
      present = verb.present ?? presentGroup1Ier(verb.infinitive);
      imparfait = verb.imparfait ?? imparfaitFromNous(present[3]);
      break;
    case "ir_iss":
      present = verb.present ?? presentGroup2(verb.infinitive);
      imparfait = verb.imparfait ?? imparfaitFromNous(present[3]);
      break;
    case "irregular":
      if (!verb.present) {
        throw new Error(
          `Irregular verb "${verb.infinitive}" must provide explicit present tense.`
        );
      }
      present = verb.present;
      imparfait = verb.imparfait ?? imparfaitFromNous(present[3]);
      break;
  }

  futurStem = verb.futurStem ?? defaultFuturStem(verb.infinitive);

  if (verb.pastParticiple) {
    pastParticiple = verb.pastParticiple;
  } else if (verb.pattern === "irregular") {
    throw new Error(
      `Irregular verb "${verb.infinitive}" must provide pastParticiple.`
    );
  } else {
    pastParticiple = defaultPastParticiple(verb.pattern, verb.infinitive);
  }

  const futur = futurFromStem(futurStem);
  const conditionnel = conditionnelFromStem(futurStem);
  const passe = passeCompose(verb.auxiliary, pastParticiple);
  const futurP = futurProche(verb.infinitive);

  const isIrr = verb.pattern === "irregular";
  const rows: ConjugationRow[] = [];
  for (let i = 0; i < 6; i++) {
    const person = PERSONS[i];
    rows.push({ tense: "present", person, form: present[i], isIrregular: isIrr });
    rows.push({ tense: "imparfait", person, form: imparfait[i], isIrregular: isIrr });
    rows.push({
      tense: "passe_compose",
      person,
      form: passe[i],
      isIrregular: isIrr,
    });
    rows.push({
      tense: "futur_proche",
      person,
      form: futurP[i],
      isIrregular: false,
    });
    rows.push({
      tense: "futur_simple",
      person,
      form: futur[i],
      isIrregular: isIrr,
    });
    rows.push({
      tense: "conditionnel",
      person,
      form: conditionnel[i],
      isIrregular: isIrr,
    });
  }
  return rows;
}

export function groupFromPattern(p: VerbPattern): "1" | "2" | "irregular" {
  if (p === "er" || p === "er_ger" || p === "er_ier") return "1";
  if (p === "ir_iss") return "2";
  return "irregular";
}
