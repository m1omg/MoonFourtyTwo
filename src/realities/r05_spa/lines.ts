import type { Lines } from '../../narrative/voice.ts';

const E = 'Ežo';

/** Dialogue and thoughts for the spa (reality 5). Keys double as voice file ids. */
export const L5: Lines = {
  // ── arrival and the entrance hall ──
  t_arrive: { who: null, text: 'Rúra ma vypľula do brodítka. Kúpele. Teplá voda, chlór a ticho.' },
  t_snow: { who: null, text: 'Na sklenenej streche leží sneh. Prvý sneh. Veď ešte včera bol október.' },
  t_clock: { who: null, text: 'Hodiny stoja na dvanástej. Alebo na nule.' },
  t_desk: { who: null, text: 'Pokladňa. Nikto. Na pulte leží zvonček.' },
  t_bell_answer: { who: null, text: 'Odniekiaľ z haly odpovedala píšťalka.' },
  t_vending: { who: null, text: 'Automat na utopencov. Zarachotil a jedného mi dal. Zadarmo.' },
  t_vending_empty: { who: null, text: 'Prázdny. Len moje odrazy v skle. Dva.' },
  t_ducks: { who: null, text: 'Kôš s gumenými kačičkami. Detský kútik bez detí.' },
  t_lockers: { who: null, text: 'Skrinky. Všetky zamknuté, len jedna nie. V nej sú moje topánky.' },
  t_cabin: { who: null, text: 'Kabínka. Na háčiku visí mokrý uterák. Ešte teplý.' },

  // ── the great hall ──
  t_hall: { who: null, text: 'Plaváreň. Na stoličke pri bazéne sedí plavčík a pozerá na vodu.' },
  t_lifeguard: { who: null, text: 'Plavčík. Nehýbe sa. Ani nedýcha.' },
  t_chair_empty: { who: null, text: 'Stolička je prázdna.' },
  t_whistle: { who: null, text: '(Píšťalka. Pod vodou.)' },
  t_rope: { who: null, text: 'Za lanom je hĺbka. Tam sa nechodí.' },
  t_flooded: { who: null, text: 'Západný ochodzok je pod vodou. Po členky. Každý krok čľapne.' },
  t_key: { who: null, text: 'Na stoličke visí kľúč s visačkou „SKOK".' },
  t_key_blocked: { who: null, text: 'Kľúč visí priamo pod ním. Kým tam sedí, nevezmem ho.' },
  t_key_got: { who: null, text: 'Kľúč od skokanskej haly. Mokrý.' },
  t_reach: { who: null, text: 'Z vody sa vynorila ruka. Biela, ako z mydla.' },

  // ── the thermal dome ──
  t_mosaic: {
    who: null,
    text: 'Mozaika ide dookola: hviezdy, slnko, trpaslíky, čierne diery, tma. A na konci dve bodky, čo krúžia okolo seba.',
  },

  // ── the pump room ──
  t_pump: { who: null, text: 'Strojovňa. Čerpadlá ešte bežia.' },
  t_prepad: { who: null, text: 'Prepad. Hladina v bazéne klesá.' },
  t_prepad_done: { who: null, text: 'Ventil prepadu je otvorený.' },
  t_vypust: { who: null, text: 'Výpust skokanského bazéna. Niekde hlboko pod nohami to zahučalo.' },
  t_vypust_done: { who: null, text: 'Výpust je otvorený.' },

  // ── the diving hall ──
  t_dive_locked: { who: null, text: 'Zamknuté. „Skokanský bazén — vstup len s plavčíkom."' },
  t_unlock: { who: null, text: 'Odomknuté.' },
  t_still: { who: null, text: 'Skokanský bazén. Voda je hladká ako sklo. Štyri metre hĺbky.' },
  t_vortex: { who: null, text: 'Voda sa krúti do víru. Dole, do tmy.' },
  t_board: { who: null, text: 'Mostík. Pod ním vír.' },

  // ── Ežo in the thermal pool ──
  e5_1: { who: E, text: 'Starý! Poď sem, do teplého.' },
  e5_2: { who: E, text: 'Toto je jediné teplé miesto, čo zostalo.' },
  e5_3: { who: E, text: 'Mama ma pomenovala po prorokovi. Ezechiel videl kolesá v kolesách, plné očí.' },
  e5_4: { who: E, text: 'Ja vidím len pivo v pive.', laugh: true },
  e5_5: { who: E, text: 'Plavčík. Keď sedí, nepozeraj sa preč. A keď nesedí, nečľapkaj.' },
  e5_6: {
    who: E,
    text: 'Ďalej je skokanský bazén. Keď sa otvorí výpust, voda ťa zoberie ďalej. Kľúč má plavčík na stoličke.',
  },
  e5_7: { who: E, text: 'Výpust sa púšťa v strojovni. Na západe, za plytčinou.' },
  e5_8: { who: E, text: 'Na, absint. Po ňom uvidíš chodník, čo tu inak nie je. Ale len chvíľu.' },
  e5_9: { who: E, text: 'A kým po ňom ideš, nepi fernet. Zmizne ti spod nôh.' },
  e5_10: { who: E, text: 'Ja tu ešte chvíľu posedím. Voda je dobrá.' },
  e5_11: { who: E, text: 'Choď. Prídem za tebou. Ako vždy.' },
};
