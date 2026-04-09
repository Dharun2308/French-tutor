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
];
