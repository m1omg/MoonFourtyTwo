import type { Lines } from '../../narrative/voice.ts';

const E = 'Ežo';

/** The last round (reality 11). Keys double as voice file ids. */
export const L11: Lines = {
  // ── arriving ──
  t_arrive: {
    who: null,
    text: 'Som v krčme. Ale polovica krčmy tu nie je. Za barom je len tma a v nej plávajú stoličky.',
  },
  t_stove: { who: null, text: 'Horí už len kachľová pec. Nič iné.' },
  t_mat: { who: null, text: 'Podtácka je celá počmáraná čiarkami. Ďalšia sa tam už nezmestí.' },
  e11_hello: { who: E, text: 'No konečne. Sadni si, starý. Posledná runda.' },
  // ── the truth ──
  e11_1: { who: E, text: 'Vieš, kde sme? Nikde. Už veľmi dlho nikde.' },
  e11_2: {
    who: E,
    text: 'Hviezdy zhasli dávno. Najprv tie veľké, potom tie malé. Potom sa vyparili aj čierne diery.',
    min: 5,
  },
  e11_3: {
    who: E,
    text: 'Zostali sme len my dvaja. Krúžime okolo seba cez priestor väčší, ako bolo kedysi celé nebo. Jedno kolo za večnosť. A každé kolo bližšie.',
    min: 7,
  },
  e11_4: {
    who: E,
    text: 'A aby to nebolo také smutné, rozprávali sme si pritom ten istý večer. Zakaždým odznova. Každé kolo jedna runda.',
    min: 6,
  },
  e11_who: {
    who: E,
    text: 'Ty si elektrón a ja pozitrón, starý. Alebo naopak, nikdy som si to nepamätal.',
    laugh: true,
    min: 5,
  },
  e11_why: {
    who: E,
    text: 'Lebo toto je to najkrajšie, čo sme si zapamätali. Posledný príbeh vo vesmíre, a je o krčme.',
    laugh: true,
    min: 5,
  },
  e11_how: { who: E, text: 'Už len jedno kolo. Toto.' },
  e11_5: {
    who: E,
    text: 'Keď si štrngneme naposledy, nezostane nič ťažké. Len svetlo. A svetlo si nepamätá, aký je vesmír veľký... a tak sa to celé začne odznova.',
    min: 8,
  },
  e11_6: { who: E, text: 'Môžu tieto kosti ožiť? Môžu, starý. Ale len keď ich pustíme.', min: 5 },
  // ── the siege ──
  e11_come: { who: E, text: 'Počuješ? Idú. Všetci naraz.' },
  e11_stoke: { who: E, text: 'Kúr, starý! Nesmie vyhasnúť!' },
  e11_more: { who: E, text: 'Prilož! Čokoľvek!' },
  e11_light: { who: E, text: 'Zapaľovač! Svetla sa boja!' },
  t_full: { who: null, text: 'Už jedno nesiem.' },
  t_burn_photo: { who: null, text: 'Fotka z roku 1906. My dvaja, pri tomto stole. Zhorela za sekundu.' },
  t_burn_dart: { who: null, text: 'Ežo nikdy netrafil do stredu. Ani raz za celú večnosť.' },
  t_burn_frame: { who: null, text: 'Obraz s jeleňom. Nikto si ho nepamätal, kým nezačal horieť.' },
  t_burn_bull: { who: null, text: 'Býčia hlava. Ujo Jano jej hovoril Ferdinand.' },
  t_burn_cigs: { who: null, text: 'Ežove cigarety. Vraj prestal v osemdesiatom šiestom.' },
  t_burn_chair0: { who: null, text: 'Stolička, na ktorej sedával Fero. Vždy ten istý guľový eso.' },
  t_burn_chair1: { who: null, text: 'Stolička spod okna. Tu sme sedeli prvý raz.' },
  t_burn_chair2: { who: null, text: 'Ešte jedna stolička. Koľko večerov sa na nej presedelo.' },
  e11_enough: { who: E, text: 'Dosť. Už dosť. Odišli. Sadni si, starý.' },
  // ── the last two ──
  e11_pour: { who: E, text: 'Starej mamy slivovica. Posledné dve.' },
  e11_cheers: { who: E, text: 'Na zdravie.', min: 3 },
  e11_stay: { who: E, text: 'Dobre. Ešte chvíľu.', min: 4 },
};

/** What you can ask him (the choice menu). */
export const ASK = {
  who: 'Kto sme?',
  why: 'Prečo práve krčma?',
  how: 'Koľko ešte?',
  on: 'Hovor ďalej.',
} as const;

export const LAST = ['Štrngnúť si', 'Ešte chvíľu'] as const;
