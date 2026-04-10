// Foundational French content beyond verb conjugations.
// Every row becomes a card that goes through the same SM-2 SRS cycle as
// verb cards, just through the /api/phrases/* endpoints.

import type { PhraseCategory, Level } from "@/types";

export interface PhraseDef {
  category: PhraseCategory;
  french: string;
  english: string;
  notes?: string;
  level: Level;
  frequencyRank: number;
}

export const PHRASES: PhraseDef[] = [
  // ========================================================
  // Articles
  // ========================================================
  { category: "article", french: "le", english: "the (masc. sg.)", notes: "masculine singular definite article", level: "A1", frequencyRank: 1 },
  { category: "article", french: "la", english: "the (fem. sg.)", notes: "feminine singular definite article", level: "A1", frequencyRank: 2 },
  { category: "article", french: "l'", english: "the (before vowel)", notes: "elided definite — l'arbre, l'homme", level: "A1", frequencyRank: 3 },
  { category: "article", french: "les", english: "the (plural)", notes: "plural definite article", level: "A1", frequencyRank: 4 },
  { category: "article", french: "un", english: "a/an (masc.)", notes: "masculine singular indefinite", level: "A1", frequencyRank: 5 },
  { category: "article", french: "une", english: "a/an (fem.)", notes: "feminine singular indefinite", level: "A1", frequencyRank: 6 },
  { category: "article", french: "des", english: "some (plural)", notes: "plural indefinite", level: "A1", frequencyRank: 7 },
  { category: "article", french: "du", english: "some (masc.)", notes: "partitive — de + le", level: "A1", frequencyRank: 8 },
  { category: "article", french: "de la", english: "some (fem.)", notes: "partitive — feminine", level: "A1", frequencyRank: 9 },
  { category: "article", french: "de l'", english: "some (before vowel)", notes: "partitive — elided before vowel", level: "A1", frequencyRank: 10 },
  { category: "article", french: "au", english: "at/to the (masc.)", notes: "à + le", level: "A1", frequencyRank: 11 },
  { category: "article", french: "à la", english: "at/to the (fem.)", notes: "à stays separate before feminine", level: "A1", frequencyRank: 12 },
  { category: "article", french: "aux", english: "at/to the (plural)", notes: "à + les", level: "A1", frequencyRank: 13 },

  // ========================================================
  // Numbers 0–20
  // ========================================================
  { category: "number", french: "zéro", english: "0", level: "A1", frequencyRank: 1 },
  { category: "number", french: "un", english: "1", notes: "also 'a' (indefinite article)", level: "A1", frequencyRank: 2 },
  { category: "number", french: "deux", english: "2", level: "A1", frequencyRank: 3 },
  { category: "number", french: "trois", english: "3", level: "A1", frequencyRank: 4 },
  { category: "number", french: "quatre", english: "4", level: "A1", frequencyRank: 5 },
  { category: "number", french: "cinq", english: "5", level: "A1", frequencyRank: 6 },
  { category: "number", french: "six", english: "6", level: "A1", frequencyRank: 7 },
  { category: "number", french: "sept", english: "7", level: "A1", frequencyRank: 8 },
  { category: "number", french: "huit", english: "8", level: "A1", frequencyRank: 9 },
  { category: "number", french: "neuf", english: "9", level: "A1", frequencyRank: 10 },
  { category: "number", french: "dix", english: "10", level: "A1", frequencyRank: 11 },
  { category: "number", french: "onze", english: "11", level: "A1", frequencyRank: 12 },
  { category: "number", french: "douze", english: "12", level: "A1", frequencyRank: 13 },
  { category: "number", french: "treize", english: "13", level: "A1", frequencyRank: 14 },
  { category: "number", french: "quatorze", english: "14", level: "A1", frequencyRank: 15 },
  { category: "number", french: "quinze", english: "15", level: "A1", frequencyRank: 16 },
  { category: "number", french: "seize", english: "16", level: "A1", frequencyRank: 17 },
  { category: "number", french: "dix-sept", english: "17", notes: "10 + 7", level: "A1", frequencyRank: 18 },
  { category: "number", french: "dix-huit", english: "18", notes: "10 + 8", level: "A1", frequencyRank: 19 },
  { category: "number", french: "dix-neuf", english: "19", notes: "10 + 9", level: "A1", frequencyRank: 20 },
  { category: "number", french: "vingt", english: "20", level: "A1", frequencyRank: 21 },
  // Tens
  { category: "number", french: "trente", english: "30", level: "A1", frequencyRank: 22 },
  { category: "number", french: "quarante", english: "40", level: "A1", frequencyRank: 23 },
  { category: "number", french: "cinquante", english: "50", level: "A1", frequencyRank: 24 },
  { category: "number", french: "soixante", english: "60", level: "A1", frequencyRank: 25 },
  { category: "number", french: "soixante-dix", english: "70", notes: "literally 60 + 10", level: "A1", frequencyRank: 26 },
  { category: "number", french: "quatre-vingts", english: "80", notes: "literally 4 × 20", level: "A1", frequencyRank: 27 },
  { category: "number", french: "quatre-vingt-dix", english: "90", notes: "literally 4 × 20 + 10", level: "A1", frequencyRank: 28 },
  { category: "number", french: "cent", english: "100", level: "A1", frequencyRank: 29 },
  { category: "number", french: "mille", english: "1 000", level: "A1", frequencyRank: 30 },

  // ========================================================
  // Alphabet (letter names in French)
  // ========================================================
  { category: "alphabet", french: "a", english: "A — 'ah'", level: "A1", frequencyRank: 1 },
  { category: "alphabet", french: "b", english: "B — 'bay'", level: "A1", frequencyRank: 2 },
  { category: "alphabet", french: "c", english: "C — 'say'", level: "A1", frequencyRank: 3 },
  { category: "alphabet", french: "d", english: "D — 'day'", level: "A1", frequencyRank: 4 },
  { category: "alphabet", french: "e", english: "E — 'uh'", level: "A1", frequencyRank: 5 },
  { category: "alphabet", french: "f", english: "F — 'eff'", level: "A1", frequencyRank: 6 },
  { category: "alphabet", french: "g", english: "G — 'zhay'", level: "A1", frequencyRank: 7 },
  { category: "alphabet", french: "h", english: "H — 'ash'", level: "A1", frequencyRank: 8 },
  { category: "alphabet", french: "i", english: "I — 'ee'", level: "A1", frequencyRank: 9 },
  { category: "alphabet", french: "j", english: "J — 'zhee'", level: "A1", frequencyRank: 10 },
  { category: "alphabet", french: "k", english: "K — 'kah'", level: "A1", frequencyRank: 11 },
  { category: "alphabet", french: "l", english: "L — 'ell'", level: "A1", frequencyRank: 12 },
  { category: "alphabet", french: "m", english: "M — 'em'", level: "A1", frequencyRank: 13 },
  { category: "alphabet", french: "n", english: "N — 'en'", level: "A1", frequencyRank: 14 },
  { category: "alphabet", french: "o", english: "O — 'oh'", level: "A1", frequencyRank: 15 },
  { category: "alphabet", french: "p", english: "P — 'pay'", level: "A1", frequencyRank: 16 },
  { category: "alphabet", french: "q", english: "Q — 'kü'", level: "A1", frequencyRank: 17 },
  { category: "alphabet", french: "r", english: "R — 'air'", level: "A1", frequencyRank: 18 },
  { category: "alphabet", french: "s", english: "S — 'ess'", level: "A1", frequencyRank: 19 },
  { category: "alphabet", french: "t", english: "T — 'tay'", level: "A1", frequencyRank: 20 },
  { category: "alphabet", french: "u", english: "U — 'ü'", level: "A1", frequencyRank: 21 },
  { category: "alphabet", french: "v", english: "V — 'vay'", level: "A1", frequencyRank: 22 },
  { category: "alphabet", french: "w", english: "W — 'double-vay'", level: "A1", frequencyRank: 23 },
  { category: "alphabet", french: "x", english: "X — 'eeks'", level: "A1", frequencyRank: 24 },
  { category: "alphabet", french: "y", english: "Y — 'ee-grek'", level: "A1", frequencyRank: 25 },
  { category: "alphabet", french: "z", english: "Z — 'zed'", level: "A1", frequencyRank: 26 },

  // ========================================================
  // Question words
  // ========================================================
  { category: "question", french: "qui", english: "who", level: "A1", frequencyRank: 1 },
  { category: "question", french: "que", english: "what", notes: "direct object: que fais-tu ?", level: "A1", frequencyRank: 2 },
  { category: "question", french: "quoi", english: "what", notes: "stand-alone or after preposition: de quoi ?", level: "A1", frequencyRank: 3 },
  { category: "question", french: "où", english: "where", level: "A1", frequencyRank: 4 },
  { category: "question", french: "quand", english: "when", level: "A1", frequencyRank: 5 },
  { category: "question", french: "pourquoi", english: "why", level: "A1", frequencyRank: 6 },
  { category: "question", french: "comment", english: "how", level: "A1", frequencyRank: 7 },
  { category: "question", french: "combien", english: "how much / how many", level: "A1", frequencyRank: 8 },
  { category: "question", french: "quel", english: "which (masc. sg.)", level: "A1", frequencyRank: 9 },
  { category: "question", french: "quelle", english: "which (fem. sg.)", level: "A1", frequencyRank: 10 },
  { category: "question", french: "quels", english: "which (masc. pl.)", level: "A1", frequencyRank: 11 },
  { category: "question", french: "quelles", english: "which (fem. pl.)", level: "A1", frequencyRank: 12 },
  { category: "question", french: "est-ce que", english: "(yes/no question marker)", notes: "Est-ce que tu parles français ? = Do you speak French?", level: "A1", frequencyRank: 13 },

  // ========================================================
  // Greetings
  // ========================================================
  { category: "greeting", french: "Bonjour", english: "Hello / Good morning", level: "A1", frequencyRank: 1 },
  { category: "greeting", french: "Bonsoir", english: "Good evening", level: "A1", frequencyRank: 2 },
  { category: "greeting", french: "Salut", english: "Hi / Bye (informal)", level: "A1", frequencyRank: 3 },
  { category: "greeting", french: "Au revoir", english: "Goodbye", level: "A1", frequencyRank: 4 },
  { category: "greeting", french: "À bientôt", english: "See you soon", level: "A1", frequencyRank: 5 },
  { category: "greeting", french: "À demain", english: "See you tomorrow", level: "A1", frequencyRank: 6 },
  { category: "greeting", french: "À tout à l'heure", english: "See you later today", level: "A1", frequencyRank: 7 },
  { category: "greeting", french: "À plus tard", english: "See you later", level: "A1", frequencyRank: 8 },
  { category: "greeting", french: "Bonne nuit", english: "Good night (going to bed)", level: "A1", frequencyRank: 9 },
  { category: "greeting", french: "Bonne journée", english: "Have a good day", level: "A1", frequencyRank: 10 },
  { category: "greeting", french: "Bonne soirée", english: "Have a good evening", level: "A1", frequencyRank: 11 },
  { category: "greeting", french: "Bienvenue", english: "Welcome", level: "A1", frequencyRank: 12 },

  // ========================================================
  // Common phrases
  // ========================================================
  { category: "phrase", french: "Merci", english: "Thank you", level: "A1", frequencyRank: 1 },
  { category: "phrase", french: "Merci beaucoup", english: "Thank you very much", level: "A1", frequencyRank: 2 },
  { category: "phrase", french: "De rien", english: "You're welcome", level: "A1", frequencyRank: 3 },
  { category: "phrase", french: "Je vous en prie", english: "You're welcome (formal)", level: "A1", frequencyRank: 4 },
  { category: "phrase", french: "S'il vous plaît", english: "Please (formal/plural)", level: "A1", frequencyRank: 5 },
  { category: "phrase", french: "S'il te plaît", english: "Please (informal)", level: "A1", frequencyRank: 6 },
  { category: "phrase", french: "Pardon", english: "Sorry / Excuse me", level: "A1", frequencyRank: 7 },
  { category: "phrase", french: "Excusez-moi", english: "Excuse me (formal)", level: "A1", frequencyRank: 8 },
  { category: "phrase", french: "Désolé", english: "Sorry (masc.)", level: "A1", frequencyRank: 9 },
  { category: "phrase", french: "Désolée", english: "Sorry (fem.)", level: "A1", frequencyRank: 10 },
  { category: "phrase", french: "Oui", english: "Yes", level: "A1", frequencyRank: 11 },
  { category: "phrase", french: "Non", english: "No", level: "A1", frequencyRank: 12 },
  { category: "phrase", french: "Peut-être", english: "Maybe", level: "A1", frequencyRank: 13 },
  { category: "phrase", french: "D'accord", english: "OK / Agreed", level: "A1", frequencyRank: 14 },
  { category: "phrase", french: "Comment allez-vous ?", english: "How are you? (formal)", level: "A1", frequencyRank: 15 },
  { category: "phrase", french: "Comment ça va ?", english: "How's it going? (informal)", level: "A1", frequencyRank: 16 },
  { category: "phrase", french: "Ça va bien, merci", english: "I'm fine, thanks", level: "A1", frequencyRank: 17 },
  { category: "phrase", french: "Et toi ?", english: "And you? (informal)", level: "A1", frequencyRank: 18 },
  { category: "phrase", french: "Et vous ?", english: "And you? (formal)", level: "A1", frequencyRank: 19 },
  { category: "phrase", french: "Je m'appelle…", english: "My name is…", level: "A1", frequencyRank: 20 },
  { category: "phrase", french: "Comment tu t'appelles ?", english: "What's your name? (informal)", level: "A1", frequencyRank: 21 },
  { category: "phrase", french: "Comment vous appelez-vous ?", english: "What's your name? (formal)", level: "A1", frequencyRank: 22 },
  { category: "phrase", french: "Enchanté", english: "Nice to meet you (masc.)", level: "A1", frequencyRank: 23 },
  { category: "phrase", french: "Enchantée", english: "Nice to meet you (fem.)", level: "A1", frequencyRank: 24 },
  { category: "phrase", french: "Je suis…", english: "I am…", level: "A1", frequencyRank: 25 },
  { category: "phrase", french: "Je viens de…", english: "I come from…", level: "A1", frequencyRank: 26 },
  { category: "phrase", french: "J'habite à…", english: "I live in…", level: "A1", frequencyRank: 27 },
  { category: "phrase", french: "Je ne sais pas", english: "I don't know", level: "A1", frequencyRank: 28 },
  { category: "phrase", french: "Je ne comprends pas", english: "I don't understand", level: "A1", frequencyRank: 29 },
  { category: "phrase", french: "Parlez-vous anglais ?", english: "Do you speak English?", level: "A1", frequencyRank: 30 },
  { category: "phrase", french: "Je parle un peu français", english: "I speak a little French", level: "A1", frequencyRank: 31 },
  { category: "phrase", french: "Pouvez-vous répéter ?", english: "Can you repeat? (formal)", level: "A1", frequencyRank: 32 },
  { category: "phrase", french: "Parlez plus lentement, s'il vous plaît", english: "Please speak more slowly", level: "A1", frequencyRank: 33 },
  { category: "phrase", french: "Où est… ?", english: "Where is…?", level: "A1", frequencyRank: 34 },
  { category: "phrase", french: "Où sont les toilettes ?", english: "Where are the toilets?", level: "A1", frequencyRank: 35 },
  { category: "phrase", french: "Combien ça coûte ?", english: "How much does it cost?", level: "A1", frequencyRank: 36 },
  { category: "phrase", french: "C'est combien ?", english: "How much is it?", level: "A1", frequencyRank: 37 },
  { category: "phrase", french: "Quelle heure est-il ?", english: "What time is it?", level: "A1", frequencyRank: 38 },
  { category: "phrase", french: "Il est…", english: "It is… (time, weather)", level: "A1", frequencyRank: 39 },
  { category: "phrase", french: "J'ai faim", english: "I'm hungry", level: "A1", frequencyRank: 40 },
  { category: "phrase", french: "J'ai soif", english: "I'm thirsty", level: "A1", frequencyRank: 41 },
  { category: "phrase", french: "J'ai besoin de…", english: "I need…", level: "A1", frequencyRank: 42 },
  { category: "phrase", french: "Je voudrais…", english: "I would like… (polite)", level: "A1", frequencyRank: 43 },
  { category: "phrase", french: "L'addition, s'il vous plaît", english: "The bill, please", level: "A1", frequencyRank: 44 },
  { category: "phrase", french: "Aidez-moi, s'il vous plaît", english: "Help me, please", level: "A1", frequencyRank: 45 },
  { category: "phrase", french: "C'est ça", english: "That's right", level: "A1", frequencyRank: 46 },
  { category: "phrase", french: "Ce n'est pas grave", english: "It's not a big deal", level: "A1", frequencyRank: 47 },
  { category: "phrase", french: "À votre santé", english: "To your health (cheers)", level: "A1", frequencyRank: 48 },

  // ========================================================
  // Extended numbers — edge cases (21-99, hundreds, large)
  // ========================================================
  // "et un" only at 21, 31, 41, 51, 61. After that: trait d'union only.
  { category: "number", french: "vingt et un", english: "21", notes: "'et un' — only in 21, 31, 41, 51, 61", level: "A1", frequencyRank: 31 },
  { category: "number", french: "vingt-deux", english: "22", level: "A1", frequencyRank: 32 },
  { category: "number", french: "vingt-cinq", english: "25", level: "A1", frequencyRank: 33 },
  { category: "number", french: "trente et un", english: "31", notes: "'et un' pattern", level: "A1", frequencyRank: 34 },
  { category: "number", french: "trente-trois", english: "33", level: "A1", frequencyRank: 35 },
  { category: "number", french: "quarante et un", english: "41", level: "A1", frequencyRank: 36 },
  { category: "number", french: "cinquante-cinq", english: "55", level: "A1", frequencyRank: 37 },
  { category: "number", french: "soixante et un", english: "61", level: "A1", frequencyRank: 38 },
  // 70s: soixante-dix + teen pattern
  { category: "number", french: "soixante et onze", english: "71", notes: "60 + 11 — note 'et'", level: "A1", frequencyRank: 39 },
  { category: "number", french: "soixante-douze", english: "72", notes: "60 + 12", level: "A1", frequencyRank: 40 },
  { category: "number", french: "soixante-quinze", english: "75", notes: "60 + 15", level: "A1", frequencyRank: 41 },
  { category: "number", french: "soixante-dix-neuf", english: "79", notes: "60 + 19", level: "A1", frequencyRank: 42 },
  // 80s: quatre-vingts + units (drop the 's' when followed by a number)
  { category: "number", french: "quatre-vingt-un", english: "81", notes: "no 'et' — no 's' on vingt before a number", level: "A1", frequencyRank: 43 },
  { category: "number", french: "quatre-vingt-cinq", english: "85", level: "A1", frequencyRank: 44 },
  // 90s: quatre-vingt-dix + teen pattern
  { category: "number", french: "quatre-vingt-onze", english: "91", notes: "80 + 11", level: "A1", frequencyRank: 45 },
  { category: "number", french: "quatre-vingt-quinze", english: "95", notes: "80 + 15", level: "A1", frequencyRank: 46 },
  { category: "number", french: "quatre-vingt-dix-neuf", english: "99", notes: "80 + 19", level: "A1", frequencyRank: 47 },
  // Hundreds
  { category: "number", french: "deux cents", english: "200", notes: "'cents' takes 's' when round", level: "A1", frequencyRank: 48 },
  { category: "number", french: "deux cent un", english: "201", notes: "'cent' drops 's' before a number", level: "A1", frequencyRank: 49 },
  { category: "number", french: "trois cents", english: "300", level: "A1", frequencyRank: 50 },
  { category: "number", french: "cinq cents", english: "500", level: "A1", frequencyRank: 51 },
  { category: "number", french: "cinq cent cinquante", english: "550", level: "A1", frequencyRank: 52 },
  // Large numbers
  { category: "number", french: "mille un", english: "1 001", notes: "'mille' never takes 's'", level: "A1", frequencyRank: 53 },
  { category: "number", french: "deux mille", english: "2 000", notes: "'mille' is invariable", level: "A1", frequencyRank: 54 },
  { category: "number", french: "dix mille", english: "10 000", level: "A1", frequencyRank: 55 },
  { category: "number", french: "cent mille", english: "100 000", level: "A1", frequencyRank: 56 },
  { category: "number", french: "un million", english: "1 000 000", notes: "'million' is a noun — un million de personnes", level: "A2", frequencyRank: 57 },
  { category: "number", french: "un milliard", english: "1 000 000 000", notes: "'milliard' = billion (US)", level: "A2", frequencyRank: 58 },
  { category: "number", french: "premier / première", english: "first (m./f.)", notes: "ordinal — le premier étage", level: "A1", frequencyRank: 59 },
  { category: "number", french: "deuxième", english: "second", level: "A1", frequencyRank: 60 },
  { category: "number", french: "troisième", english: "third", level: "A1", frequencyRank: 61 },

  // ========================================================
  // Countries — gender + correct preposition (en/au/aux)
  // ========================================================
  // Feminine countries → "en" (most countries ending in -e)
  { category: "country", french: "la France — en France", english: "France — in/to France", notes: "feminine → en", level: "A1", frequencyRank: 1 },
  { category: "country", french: "l'Italie — en Italie", english: "Italy — in/to Italy", notes: "feminine → en", level: "A1", frequencyRank: 2 },
  { category: "country", french: "l'Espagne — en Espagne", english: "Spain — in/to Spain", notes: "feminine → en", level: "A1", frequencyRank: 3 },
  { category: "country", french: "l'Allemagne — en Allemagne", english: "Germany — in/to Germany", notes: "feminine → en", level: "A1", frequencyRank: 4 },
  { category: "country", french: "l'Angleterre — en Angleterre", english: "England — in/to England", notes: "feminine → en", level: "A1", frequencyRank: 5 },
  { category: "country", french: "la Chine — en Chine", english: "China — in/to China", notes: "feminine → en", level: "A1", frequencyRank: 6 },
  { category: "country", french: "l'Inde — en Inde", english: "India — in/to India", notes: "feminine → en", level: "A1", frequencyRank: 7 },
  { category: "country", french: "la Russie — en Russie", english: "Russia — in/to Russia", notes: "feminine → en", level: "A1", frequencyRank: 8 },
  { category: "country", french: "la Belgique — en Belgique", english: "Belgium — in/to Belgium", notes: "feminine → en", level: "A1", frequencyRank: 9 },
  { category: "country", french: "la Suisse — en Suisse", english: "Switzerland — in/to Switzerland", notes: "feminine → en", level: "A1", frequencyRank: 10 },
  // Masculine countries → "au"
  { category: "country", french: "le Canada — au Canada", english: "Canada — in/to Canada", notes: "masculine → au", level: "A1", frequencyRank: 11 },
  { category: "country", french: "le Japon — au Japon", english: "Japan — in/to Japan", notes: "masculine → au", level: "A1", frequencyRank: 12 },
  { category: "country", french: "le Brésil — au Brésil", english: "Brazil — in/to Brazil", notes: "masculine → au", level: "A1", frequencyRank: 13 },
  { category: "country", french: "le Portugal — au Portugal", english: "Portugal — in/to Portugal", notes: "masculine → au", level: "A1", frequencyRank: 14 },
  { category: "country", french: "le Maroc — au Maroc", english: "Morocco — in/to Morocco", notes: "masculine → au", level: "A1", frequencyRank: 15 },
  { category: "country", french: "le Mexique — au Mexique", english: "Mexico — in/to Mexico", notes: "masculine ending in -e but still masc → au", level: "A1", frequencyRank: 16 },
  { category: "country", french: "le Sénégal — au Sénégal", english: "Senegal — in/to Senegal", notes: "masculine → au", level: "A1", frequencyRank: 17 },
  // Masculine vowel-start → "en" (exception!)
  { category: "country", french: "l'Iran — en Iran", english: "Iran — in/to Iran", notes: "masculine BUT starts with vowel → en (not au)", level: "A2", frequencyRank: 18 },
  { category: "country", french: "l'Irak — en Irak", english: "Iraq — in/to Iraq", notes: "masculine + vowel → en", level: "A2", frequencyRank: 19 },
  // Plural countries → "aux"
  { category: "country", french: "les États-Unis — aux États-Unis", english: "USA — in/to the USA", notes: "plural → aux", level: "A1", frequencyRank: 20 },
  { category: "country", french: "les Pays-Bas — aux Pays-Bas", english: "Netherlands — in/to the Netherlands", notes: "plural → aux", level: "A1", frequencyRank: 21 },
  { category: "country", french: "les Philippines — aux Philippines", english: "Philippines — in/to the Philippines", notes: "plural → aux", level: "A2", frequencyRank: 22 },
  // Islands and special cases
  { category: "country", french: "l'Australie — en Australie", english: "Australia — in/to Australia", notes: "feminine → en", level: "A1", frequencyRank: 23 },
  // More feminine → en
  { category: "country", french: "la Tunisie — en Tunisie", english: "Tunisia — in/to Tunisia", notes: "feminine → en", level: "A1", frequencyRank: 24 },
  { category: "country", french: "l'Algérie — en Algérie", english: "Algeria — in/to Algeria", notes: "feminine → en", level: "A1", frequencyRank: 25 },
  { category: "country", french: "la Turquie — en Turquie", english: "Turkey — in/to Turkey", notes: "feminine → en", level: "A1", frequencyRank: 26 },
  { category: "country", french: "la Grèce — en Grèce", english: "Greece — in/to Greece", notes: "feminine → en", level: "A1", frequencyRank: 27 },
  { category: "country", french: "la Pologne — en Pologne", english: "Poland — in/to Poland", notes: "feminine → en", level: "A1", frequencyRank: 28 },
  { category: "country", french: "la Suède — en Suède", english: "Sweden — in/to Sweden", notes: "feminine → en", level: "A1", frequencyRank: 29 },
  { category: "country", french: "la Norvège — en Norvège", english: "Norway — in/to Norway", notes: "feminine → en", level: "A1", frequencyRank: 30 },
  { category: "country", french: "la Thaïlande — en Thaïlande", english: "Thailand — in/to Thailand", notes: "feminine → en", level: "A1", frequencyRank: 31 },
  { category: "country", french: "la Colombie — en Colombie", english: "Colombia — in/to Colombia", notes: "feminine → en", level: "A1", frequencyRank: 32 },
  { category: "country", french: "l'Argentine — en Argentine", english: "Argentina — in/to Argentina", notes: "feminine → en", level: "A1", frequencyRank: 33 },
  { category: "country", french: "la Corée du Sud — en Corée du Sud", english: "South Korea — in/to South Korea", notes: "feminine → en", level: "A1", frequencyRank: 34 },
  { category: "country", french: "l'Égypte — en Égypte", english: "Egypt — in/to Egypt", notes: "feminine → en", level: "A1", frequencyRank: 35 },
  { category: "country", french: "la Côte d'Ivoire — en Côte d'Ivoire", english: "Ivory Coast — in/to Ivory Coast", notes: "feminine → en", level: "A2", frequencyRank: 36 },
  { category: "country", french: "la Nouvelle-Zélande — en Nouvelle-Zélande", english: "New Zealand — in/to New Zealand", notes: "feminine → en", level: "A1", frequencyRank: 37 },
  // More masculine → au
  { category: "country", french: "le Pakistan — au Pakistan", english: "Pakistan — in/to Pakistan", notes: "masculine → au", level: "A1", frequencyRank: 38 },
  { category: "country", french: "le Liban — au Liban", english: "Lebanon — in/to Lebanon", notes: "masculine → au", level: "A1", frequencyRank: 39 },
  { category: "country", french: "le Pérou — au Pérou", english: "Peru — in/to Peru", notes: "masculine → au", level: "A1", frequencyRank: 40 },
  { category: "country", french: "le Danemark — au Danemark", english: "Denmark — in/to Denmark", notes: "masculine → au", level: "A1", frequencyRank: 41 },
  { category: "country", french: "le Viêt Nam — au Viêt Nam", english: "Vietnam — in/to Vietnam", notes: "masculine → au", level: "A1", frequencyRank: 42 },
  { category: "country", french: "le Cameroun — au Cameroun", english: "Cameroon — in/to Cameroon", notes: "masculine → au", level: "A2", frequencyRank: 43 },
  { category: "country", french: "le Kenya — au Kenya", english: "Kenya — in/to Kenya", notes: "masculine → au", level: "A2", frequencyRank: 44 },
  { category: "country", french: "le Nigéria — au Nigéria", english: "Nigeria — in/to Nigeria", notes: "masculine → au", level: "A2", frequencyRank: 45 },
  { category: "country", french: "le Chili — au Chili", english: "Chile — in/to Chile", notes: "masculine → au", level: "A1", frequencyRank: 46 },
  // More masculine + vowel → en (exception)
  { category: "country", french: "l'Israël — en Israël", english: "Israel — in/to Israel", notes: "masculine + vowel → en", level: "A2", frequencyRank: 47 },
  { category: "country", french: "l'Équateur — en Équateur", english: "Ecuador — in/to Ecuador", notes: "masculine + vowel → en", level: "A2", frequencyRank: 48 },
  { category: "country", french: "l'Ouganda — en Ouganda", english: "Uganda — in/to Uganda", notes: "masculine + vowel → en", level: "A2", frequencyRank: 49 },
  // More plural → aux
  { category: "country", french: "les Émirats arabes unis — aux Émirats arabes unis", english: "UAE — in/to the UAE", notes: "plural → aux", level: "A2", frequencyRank: 50 },
  // Islands — special prepositions
  { category: "country", french: "Cuba — à Cuba", english: "Cuba — in/to Cuba", notes: "no article for small islands → à", level: "A2", frequencyRank: 51 },
  { category: "country", french: "Madagascar — à Madagascar", english: "Madagascar — in/to Madagascar", notes: "no article → à", level: "A2", frequencyRank: 52 },
  { category: "country", french: "Haïti — en Haïti", english: "Haiti — in/to Haiti", notes: "en — treated like feminine", level: "A2", frequencyRank: 53 },

  // ========================================================
  // Cities — always use "à" (no gender)
  // ========================================================
  { category: "city", french: "à Paris", english: "in/to Paris", notes: "cities always use 'à' — no article", level: "A1", frequencyRank: 1 },
  { category: "city", french: "à Lyon", english: "in/to Lyon", notes: "second largest French city", level: "A1", frequencyRank: 2 },
  { category: "city", french: "à Marseille", english: "in/to Marseille", level: "A1", frequencyRank: 3 },
  { category: "city", french: "à Toulouse", english: "in/to Toulouse", level: "A1", frequencyRank: 4 },
  { category: "city", french: "à Nice", english: "in/to Nice", level: "A1", frequencyRank: 5 },
  { category: "city", french: "à Bordeaux", english: "in/to Bordeaux", level: "A1", frequencyRank: 6 },
  { category: "city", french: "à Bruxelles", english: "in/to Brussels", notes: "Belgium — still 'à'", level: "A1", frequencyRank: 7 },
  { category: "city", french: "à Genève", english: "in/to Geneva", level: "A1", frequencyRank: 8 },
  { category: "city", french: "à Montréal", english: "in/to Montreal", level: "A1", frequencyRank: 9 },
  { category: "city", french: "à Londres", english: "in/to London", level: "A1", frequencyRank: 10 },
  { category: "city", french: "à New York", english: "in/to New York", level: "A1", frequencyRank: 11 },
  { category: "city", french: "à Tokyo", english: "in/to Tokyo", level: "A1", frequencyRank: 12 },
  // Special: cities with article
  { category: "city", french: "au Caire", english: "in/to Cairo", notes: "rare — le Caire takes 'au'", level: "A2", frequencyRank: 13 },
  { category: "city", french: "au Havre", english: "in/to Le Havre", notes: "le Havre → au Havre", level: "A2", frequencyRank: 14 },
  { category: "city", french: "à La Nouvelle-Orléans", english: "in/to New Orleans", notes: "article stays: 'à La'", level: "A2", frequencyRank: 15 },
  // "de" for origin
  { category: "city", french: "de Paris", english: "from Paris", notes: "'de' for origin — je viens de Paris", level: "A1", frequencyRank: 16 },
  { category: "city", french: "du Caire", english: "from Cairo", notes: "de + le = du", level: "A2", frequencyRank: 17 },
  // More major French cities
  { category: "city", french: "à Strasbourg", english: "in/to Strasbourg", notes: "near the German border — Alsace", level: "A1", frequencyRank: 18 },
  { category: "city", french: "à Lille", english: "in/to Lille", notes: "northern France, near Belgium", level: "A1", frequencyRank: 19 },
  { category: "city", french: "à Nantes", english: "in/to Nantes", level: "A1", frequencyRank: 20 },
  { category: "city", french: "à Montpellier", english: "in/to Montpellier", level: "A1", frequencyRank: 21 },
  // Major world cities
  { category: "city", french: "à Berlin", english: "in/to Berlin", level: "A1", frequencyRank: 22 },
  { category: "city", french: "à Madrid", english: "in/to Madrid", level: "A1", frequencyRank: 23 },
  { category: "city", french: "à Rome", english: "in/to Rome", level: "A1", frequencyRank: 24 },
  { category: "city", french: "à Lisbonne", english: "in/to Lisbon", notes: "French name: Lisbonne", level: "A1", frequencyRank: 25 },
  { category: "city", french: "à Amsterdam", english: "in/to Amsterdam", level: "A1", frequencyRank: 26 },
  { category: "city", french: "à Moscou", english: "in/to Moscow", notes: "French name: Moscou", level: "A1", frequencyRank: 27 },
  { category: "city", french: "à Pékin", english: "in/to Beijing", notes: "French name: Pékin", level: "A1", frequencyRank: 28 },
  { category: "city", french: "à Séoul", english: "in/to Seoul", level: "A1", frequencyRank: 29 },
  { category: "city", french: "à Sydney", english: "in/to Sydney", level: "A1", frequencyRank: 30 },
  { category: "city", french: "à Dubaï", english: "in/to Dubai", level: "A1", frequencyRank: 31 },
  { category: "city", french: "à Mumbai", english: "in/to Mumbai", level: "A1", frequencyRank: 32 },
  { category: "city", french: "à Bangkok", english: "in/to Bangkok", level: "A1", frequencyRank: 33 },
  { category: "city", french: "à Buenos Aires", english: "in/to Buenos Aires", level: "A1", frequencyRank: 34 },
  { category: "city", french: "à São Paulo", english: "in/to São Paulo", level: "A1", frequencyRank: 35 },
  { category: "city", french: "à Toronto", english: "in/to Toronto", level: "A1", frequencyRank: 36 },
  { category: "city", french: "à Los Angeles", english: "in/to Los Angeles", level: "A1", frequencyRank: 37 },
  { category: "city", french: "à San Francisco", english: "in/to San Francisco", level: "A1", frequencyRank: 38 },
  { category: "city", french: "à Washington", english: "in/to Washington", level: "A1", frequencyRank: 39 },
  // Francophone cities
  { category: "city", french: "à Dakar", english: "in/to Dakar", notes: "Senegal — francophone Africa", level: "A2", frequencyRank: 40 },
  { category: "city", french: "à Alger", english: "in/to Algiers", notes: "French name: Alger", level: "A2", frequencyRank: 41 },
  { category: "city", french: "à Tunis", english: "in/to Tunis", level: "A2", frequencyRank: 42 },
  { category: "city", french: "à Casablanca", english: "in/to Casablanca", notes: "Morocco — francophone", level: "A2", frequencyRank: 43 },
  { category: "city", french: "à Québec", english: "in/to Quebec City", notes: "not 'au' — city, not province", level: "A2", frequencyRank: 44 },
  // Special forms — origin (de)
  { category: "city", french: "de Londres", english: "from London", notes: "je viens de Londres", level: "A1", frequencyRank: 45 },
  { category: "city", french: "de New York", english: "from New York", level: "A1", frequencyRank: 46 },
  { category: "city", french: "de Tokyo", english: "from Tokyo", level: "A1", frequencyRank: 47 },

  // ========================================================
  // Time expressions
  // ========================================================
  // Parts of the day
  { category: "time", french: "le matin", english: "the morning / in the morning", level: "A1", frequencyRank: 1 },
  { category: "time", french: "l'après-midi", english: "the afternoon", notes: "masculine or feminine — both accepted", level: "A1", frequencyRank: 2 },
  { category: "time", french: "le soir", english: "the evening", level: "A1", frequencyRank: 3 },
  { category: "time", french: "la nuit", english: "the night", level: "A1", frequencyRank: 4 },
  // "ce" / "cette" for today's time
  { category: "time", french: "ce matin", english: "this morning", notes: "'ce' = this (masc)", level: "A1", frequencyRank: 5 },
  { category: "time", french: "cet après-midi", english: "this afternoon", notes: "'cet' before vowel/h", level: "A1", frequencyRank: 6 },
  { category: "time", french: "ce soir", english: "this evening / tonight", level: "A1", frequencyRank: 7 },
  { category: "time", french: "cette nuit", english: "tonight / last night", notes: "'cette' = this (fem)", level: "A1", frequencyRank: 8 },
  // Relative days
  { category: "time", french: "aujourd'hui", english: "today", level: "A1", frequencyRank: 9 },
  { category: "time", french: "demain", english: "tomorrow", level: "A1", frequencyRank: 10 },
  { category: "time", french: "demain matin", english: "tomorrow morning", level: "A1", frequencyRank: 11 },
  { category: "time", french: "demain soir", english: "tomorrow evening", level: "A1", frequencyRank: 12 },
  { category: "time", french: "hier", english: "yesterday", level: "A1", frequencyRank: 13 },
  { category: "time", french: "hier soir", english: "last night / yesterday evening", level: "A1", frequencyRank: 14 },
  { category: "time", french: "avant-hier", english: "the day before yesterday", level: "A2", frequencyRank: 15 },
  { category: "time", french: "après-demain", english: "the day after tomorrow", level: "A2", frequencyRank: 16 },
  // Clock time — telling the time
  { category: "time", french: "Il est une heure", english: "It is 1 o'clock", notes: "'une' — only hour that's feminine", level: "A1", frequencyRank: 17 },
  { category: "time", french: "Il est deux heures", english: "It is 2 o'clock", level: "A1", frequencyRank: 18 },
  { category: "time", french: "Il est midi", english: "It is noon", notes: "no 'heures' — midi/minuit stand alone", level: "A1", frequencyRank: 19 },
  { category: "time", french: "Il est minuit", english: "It is midnight", level: "A1", frequencyRank: 20 },
  // The critical half/quarter/minus patterns
  { category: "time", french: "et quart", english: "quarter past", notes: "Il est trois heures et quart = 3:15", level: "A1", frequencyRank: 21 },
  { category: "time", french: "et demie", english: "half past", notes: "Il est trois heures et demie = 3:30. 'demie' takes -e after 'heure'", level: "A1", frequencyRank: 22 },
  { category: "time", french: "moins le quart", english: "quarter to", notes: "Il est quatre heures moins le quart = 3:45", level: "A1", frequencyRank: 23 },
  { category: "time", french: "moins cinq", english: "five to", notes: "Il est quatre heures moins cinq = 3:55", level: "A1", frequencyRank: 24 },
  { category: "time", french: "moins dix", english: "ten to", notes: "Il est quatre heures moins dix = 3:50", level: "A1", frequencyRank: 25 },
  { category: "time", french: "moins vingt", english: "twenty to", notes: "Il est quatre heures moins vingt = 3:40", level: "A1", frequencyRank: 26 },
  { category: "time", french: "et cinq", english: "five past", notes: "Il est trois heures cinq = 3:05", level: "A1", frequencyRank: 27 },
  { category: "time", french: "et dix", english: "ten past", notes: "Il est trois heures dix = 3:10", level: "A1", frequencyRank: 28 },
  { category: "time", french: "midi et demi", english: "12:30 PM", notes: "'demi' — no -e after midi/minuit (masc)", level: "A1", frequencyRank: 29 },
  { category: "time", french: "minuit et demi", english: "12:30 AM", level: "A1", frequencyRank: 30 },
  // Frequency / duration
  { category: "time", french: "maintenant", english: "now", level: "A1", frequencyRank: 31 },
  { category: "time", french: "tout de suite", english: "right away / immediately", level: "A1", frequencyRank: 32 },
  { category: "time", french: "bientôt", english: "soon", level: "A1", frequencyRank: 33 },
  { category: "time", french: "toujours", english: "always / still", level: "A1", frequencyRank: 34 },
  { category: "time", french: "souvent", english: "often", level: "A1", frequencyRank: 35 },
  { category: "time", french: "parfois", english: "sometimes", level: "A1", frequencyRank: 36 },
  { category: "time", french: "rarement", english: "rarely", level: "A1", frequencyRank: 37 },
  { category: "time", french: "jamais", english: "never", notes: "ne… jamais — je ne mange jamais", level: "A1", frequencyRank: 38 },
  { category: "time", french: "déjà", english: "already", level: "A1", frequencyRank: 39 },
  { category: "time", french: "pas encore", english: "not yet", level: "A1", frequencyRank: 40 },
  { category: "time", french: "en retard", english: "late", level: "A1", frequencyRank: 41 },
  { category: "time", french: "en avance", english: "early", level: "A1", frequencyRank: 42 },
  { category: "time", french: "à l'heure", english: "on time", level: "A1", frequencyRank: 43 },
  // Days of the week
  { category: "time", french: "lundi", english: "Monday", notes: "no capital letter in French", level: "A1", frequencyRank: 44 },
  { category: "time", french: "mardi", english: "Tuesday", level: "A1", frequencyRank: 45 },
  { category: "time", french: "mercredi", english: "Wednesday", level: "A1", frequencyRank: 46 },
  { category: "time", french: "jeudi", english: "Thursday", level: "A1", frequencyRank: 47 },
  { category: "time", french: "vendredi", english: "Friday", level: "A1", frequencyRank: 48 },
  { category: "time", french: "samedi", english: "Saturday", level: "A1", frequencyRank: 49 },
  { category: "time", french: "dimanche", english: "Sunday", level: "A1", frequencyRank: 50 },
  // Months
  { category: "time", french: "janvier", english: "January", notes: "no capital letter in French", level: "A1", frequencyRank: 51 },
  { category: "time", french: "février", english: "February", level: "A1", frequencyRank: 52 },
  { category: "time", french: "mars", english: "March", level: "A1", frequencyRank: 53 },
  { category: "time", french: "avril", english: "April", level: "A1", frequencyRank: 54 },
  { category: "time", french: "mai", english: "May", level: "A1", frequencyRank: 55 },
  { category: "time", french: "juin", english: "June", level: "A1", frequencyRank: 56 },
  { category: "time", french: "juillet", english: "July", level: "A1", frequencyRank: 57 },
  { category: "time", french: "août", english: "August", level: "A1", frequencyRank: 58 },
  { category: "time", french: "septembre", english: "September", level: "A1", frequencyRank: 59 },
  { category: "time", french: "octobre", english: "October", level: "A1", frequencyRank: 60 },
  { category: "time", french: "novembre", english: "November", level: "A1", frequencyRank: 61 },
  { category: "time", french: "décembre", english: "December", level: "A1", frequencyRank: 62 },
  // Useful time phrases
  { category: "time", french: "le week-end", english: "the weekend", level: "A1", frequencyRank: 63 },
  { category: "time", french: "la semaine prochaine", english: "next week", level: "A1", frequencyRank: 64 },
  { category: "time", french: "la semaine dernière", english: "last week", level: "A1", frequencyRank: 65 },
  { category: "time", french: "le mois prochain", english: "next month", level: "A1", frequencyRank: 66 },
  { category: "time", french: "l'année prochaine", english: "next year", level: "A1", frequencyRank: 67 },
  { category: "time", french: "l'année dernière", english: "last year", level: "A1", frequencyRank: 68 },
  { category: "time", french: "tous les jours", english: "every day", level: "A1", frequencyRank: 69 },
  { category: "time", french: "chaque semaine", english: "every week", level: "A1", frequencyRank: 70 },
  { category: "time", french: "pendant", english: "during / for (duration)", notes: "pendant deux heures = for two hours", level: "A1", frequencyRank: 71 },
  { category: "time", french: "depuis", english: "since / for (ongoing)", notes: "depuis trois ans = for three years (and still)", level: "A2", frequencyRank: 72 },
  { category: "time", french: "il y a", english: "ago", notes: "il y a deux jours = two days ago", level: "A2", frequencyRank: 73 },
  { category: "time", french: "dans", english: "in (future)", notes: "dans une heure = in one hour", level: "A2", frequencyRank: 74 },
];
