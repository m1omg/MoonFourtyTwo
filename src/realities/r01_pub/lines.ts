import type { Lines } from '../../narrative/voice.ts';

const E = 'Ežo';
const V = 'Vierka';
const F = 'Fero';
const J = 'Jano';

/** Dialogue for the pub (realities 1–2). Keys double as voice file ids. */
export const L: Lines = {
  // ── opening ──
  e_intro1: {
    who: E,
    text: '…a tak som mu povedal: Jožko, kotol nie je pes. Keď naň kričíš, nepočúva. Ten chce uhlie a trpezlivosť.',
  },
  e_intro2: { who: E, text: 'Zajtra začíname kúriť. Vraj má prísť prvý mráz.', laugh: true },
  e_intro3: { who: E, text: 'No. Na zdravie, starý!' },
  e_intro4: { who: E, text: 'Dopi, nech si môžeme dať ešte jedno.' },
  e_order1: { who: E, text: 'Zájdi za Vierkou, nech nám naleje dve borovičky. Ja tu postrážim stôl.' },
  e_order2: { who: E, text: 'Aby nám ho niekto neukradol. Dnes je tu nejako mŕtvo.' },
  e_wait: { who: E, text: 'No čo, smädný som ja, nie stôl.' },
  e_stand: { who: E, text: 'Vierka ťa nezje. Len sa tak tvári.' },

  // ── bar ──
  v_hello: { who: V, text: 'Čo to bude?' },
  v_hello2: { who: V, text: 'Zase vy dvaja?' },
  v_hello3: { who: V, text: 'Kolesár ťa dnes ešte potrápi, uvidíš.' },
  v_pour: { who: V, text: 'Hneď to bude. Zapíšem vám to.' },
  v_malinovka: { who: V, text: 'Malinovku? Čo ti je, chlapče, nie si chorý?' },
  v_chlieb: { who: V, text: 'Chlieb s masťou a cibuľou. Aby ťa nepoložilo.' },
  v_nothing: { who: V, text: 'Tak mi tu nestoj, keď nič nechceš.' },
  v_cellar: { who: V, text: 'Do pivnice nemáš čo chodiť.' },
  v_closing: { who: V, text: 'O polnoci zatváram. Aspoň tak to tu vždy vravím.' },
  v_round: { who: V, text: 'Kolesár objednal ďalšie. Máte to na pulte.' },

  // ── toasts ──
  e_bor1: { who: E, text: 'Borovička. Jalovec.' },
  e_bor2: { who: E, text: 'Stará mama vravela, že jalovec odháňa zlé.' },
  e_bor3: { who: E, text: 'Tak nech nás to zlé obchádza. Na zdravie!' },
  e_sliv1: { who: E, text: 'Slivovica. Na všetko dobrá. Na smútok, na zimu, aj na zuby.' },
  e_sliv2: { who: E, text: 'Na zdravie!' },
  e_pivo1: { who: E, text: 'Pivo je pivo. Na zdravie!' },
  e_mal1: { who: E, text: 'Malinovka? No dobre. Ty malinovku, ja tvoju borovičku.', laugh: true },
  e_cheers: { who: E, text: 'Na zdravie!' },
  e_another: { who: E, text: 'Vierka! Ešte dve!' },
  e_skip: { who: E, text: 'Čo je s tebou dnes? Veď sme len začali.' },

  // ── talk menu ──
  e_talk: { who: E, text: 'Hm?' },
  e_work1: { who: E, text: 'V kotolni je človek sám so sebou. Ty, uhlie a oheň.' },
  e_work2: { who: E, text: 'Deti si myslia, že v pivnici býva drak. Nechávam ich. Aspoň tam nelezú.' },
  e_work3: { who: E, text: 'Aby nevyhaslo. To je celá moja robota.' },
  e_name1: { who: E, text: 'Ezechiel. Mama bola veľmi nábožná.' },
  e_name2: { who: E, text: 'A ja som zas veľmi smädný.', laugh: true },
  e_tv1: { who: E, text: 'Ten istý gól dávajú už tretíkrát.' },
  e_tv2: { who: E, text: 'Asi nemajú čo vysielať. Alebo sa im to tak páči.' },
  e_home1: { who: E, text: 'Domov? Starý, veď je ešte skoro.' },
  e_home2: { who: E, text: 'Ešte jedno. Potom uvidíme.' },
  e_nothing: { who: E, text: 'Len tak je najlepšie.' },
  e_stars: { who: E, text: 'Hviezdy? Je zamračené, starý.' },
  e_photo: { who: E, text: 'To bol môj prapradedo. A ten druhý… asi tvoj.', laugh: true },
  e_stove: { who: E, text: 'Od zajtra. Zajtra sa kúri.' },

  // ── hints / thoughts (no speaker) ──
  t_window: { who: null, text: 'Je jasno. Ani mráčik. A predsa ani jedna hviezda.' },
  t_calendar: { who: null, text: 'Október. Niekto poctivo prečiarkol všetky dni. Aj tridsiaty druhý.' },
  t_photo: {
    who: null,
    text: 'Stará fotka: „U Kolesa, 1906". Dvaja chlapi pri tomto istom stole. Ten veľký vyzerá ako Ežo.',
  },
  t_clock: { who: null, text: 'Sekundová ručička skočila dozadu. Alebo sa mi to len zdalo.' },
  t_tv: { who: null, text: 'Zase ten istý gól.' },
  t_tv_glitch: { who: null, text: 'Skóre na sekundu ukázalo nejaký nezmysel.' },
  t_mats: { who: null, text: 'Na tácke sú tisíce čiarok. Niekto tu pil veľmi, veľmi dlho.' },
  t_stove: { who: null, text: 'Studená pec. Ešte sa nekúri.' },
  t_bull: { who: null, text: 'Býčia hlava. Kto už len zavesí býka do krčmy.' },
  t_slot_glyph: { who: null, text: 'Tri rovnaké symboly. Dva body v kruhoch. Automat ani necinkol.' },
  t_slot_win: { who: null, text: 'Automat vypľul žetón. Na Horský čaj?' },
  t_slot_lose: { who: null, text: 'Nič.' },
  t_hatch: { who: null, text: 'Poklop do pivnice. Zamknutý.' },
  t_glyph: { who: null, text: 'Nad dverami na záchod… dva body v kruhoch. To tam predtým nebolo.' },
  t_figure_gone: { who: null, text: 'Pod lampou nikto nestojí.' },
  t_stall: { who: null, text: 'Prázdne.' },
  t_knock: { who: null, text: 'Niekto klope. Zvnútra.' },
  t_cold: { who: null, text: 'Je to tu nejako tiché.' },

  // ── regulars ──
  f_card: { who: F, text: 'Guľové eso.' },
  j_again: { who: J, text: 'Zase?' },
  f_again: { who: F, text: 'Zase.' },
  j_long: { who: J, text: 'Hráme už dlho, chlapče. Veľmi dlho.' },

  // ── glyph / WC ──
  e_see: { who: E, text: 'Aj ty to vidíš, hm?' },
  e_see2: { who: E, text: 'Nič. Choď sa vymočiť, starý. Ja ti postrážim miesto.' },

  // ── the street ──
  e_leave: { who: E, text: 'Kam ideš? Ešte sme nedopili!' },
  t_loop: { who: null, text: 'Ulica sa stáča späť k pivárni. Asi som sa zle otočil.' },

  // ── frozen pub (reality 2) ──
  e_loop: { who: E, text: '…a tak som mu povedal…' },
  e_r2_1: { who: E, text: 'Neboj sa. Toto sa stáva. Sadni si.' },
  e_r2_2: { who: E, text: 'Niekedy sa to tu zasekne. Ako platňa.' },
  e_r2_3: { who: E, text: 'Na tých dvoch sa pozeraj. Keď sa na nich nepozeráš, nesedia na mieste.' },
  e_r2_4: { who: E, text: 'Vierka má kľúče od dverí. V zástere. Vezmi ich a choď von. Ja dopijem a prídem.' },
  e_r2_5: { who: E, text: 'A vezmi si z police borovičku. Jalovec, pamätáš?' },
  e_r2_6: { who: E, text: 'Choď prvý. Ja prídem.' },
  t_frozen: { who: null, text: 'Pivo z pípy visí vo vzduchu.' },
  t_clock2: { who: null, text: 'Hodiny nemajú ručičky.' },
  t_tv2: { who: null, text: 'Televízor ukazuje túto krčmu. Zhora. Stojím tam… a za mnou…' },
  t_keys: { who: null, text: 'Kľúče. Studené ako ľad.' },
  t_door_closed: { who: null, text: '„Zatvárame." Zamknuté.' },
  t_door_open: { who: null, text: 'Za dverami nie je ulica.' },
};
