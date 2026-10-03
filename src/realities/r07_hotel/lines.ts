import type { Lines } from '../../narrative/voice.ts';

const E = 'Ežo';
const C = 'Chyžná';

/** Dialogue and thoughts for the mountain hotel (reality 7). Keys double as voice file ids. */
export const L7: Lines = {
  // ── the lobby ──
  t_arrive: {
    who: null,
    text: 'Výťah zastal v hoteli. Koberce so vzorom, hnedé obloženie, oranžové lampy. Ako na škole v prírode.',
  },
  t_snow: { who: null, text: 'Za oknami je sneh až po strechu. Hotel je zasypaný.' },
  t_reception: { who: null, text: 'Recepcia. Nikto. Zvonček, kniha hostí a tabuľa s kľúčmi.' },
  t_bell: { who: null, text: 'Cink. Ticho. Niekde vzadu zavŕzgal vozík.' },
  t_keyboard: { who: null, text: 'Tabuľa s kľúčmi. Pri salóniku visia tri prázdne háčiky.' },
  t_guestbook: {
    who: null,
    text: 'Kniha hostí. Dve mená, stále tie isté, striedavo moje a Ežovo písmo. Dátumy rastú: 1906, 1986, 2026… a ďalej čísla, čo už nie sú roky.',
  },
  t_sign: { who: null, text: 'Podpísal som sa. Písmom, ktoré vyzerá ako jeho.' },
  t_clock: { who: null, text: 'Kyvadlo sa hýbe. Ručičky nie.' },
  t_restaurant: { who: null, text: 'Reštaurácia. Prestreté pre dvoch. Pri každom stole.' },
  t_dancehall: { who: null, text: 'Tanečná sála. Zrkadlová guľa sa točí a nikto netancuje.' },
  t_corridor: { who: null, text: 'Na dverách izieb nie sú čísla izieb. Sú tam roky.' },

  // ── the chambermaid ──
  t_cart: { who: null, text: 'Vŕzganie kolies. Niekto tlačí vozík.' },
  t_chyzna: { who: null, text: 'Chyžná. Upratuje. Čo poutiera, to zmizne.' },
  t_erased: { who: null, text: 'Kde bola chyžná, nič nie je. Len biele miesto.' },
  t_hide: { who: null, text: 'Do skrine. Nedýchať.' },
  t_seen: { who: null, text: 'Videla ma.' },
  c_knock: { who: C, text: 'Upratovanie!' },
  c_found: { who: C, text: 'Neporiadok.' },

  // ── the rooms ──
  t_1906: {
    who: null,
    text: 'Tisícdeväťstošesť. Petrolejka, drevený stôl, dva poháre. My dvaja, len hnedí ako stará fotka.',
  },
  t_1986: { who: null, text: 'Osemdesiatšesť. Dym, že by sa dal krájať. V telke hokej. Ten istý gól.' },
  t_2026: { who: null, text: 'Dvetisícdvadsaťšesť. U Kolesa. Ako dnes večer. Ako vždy.' },
  t_1e14: {
    who: null,
    text: 'Desať na štrnástu. Mach a huby po stoloch. Svetlo je červené a slabé, ako z dohasínajúcej hviezdy.',
  },
  t_1e40: { who: null, text: 'Desať na štyridsiatu. Ruina a mráz. Cez strechu sa pozerá čierna diera.' },
  t_1e100: { who: null, text: 'Desať na stú. Nič. Len stôl a dva poháre.' },
  t_tallies: {
    who: null,
    text: 'Čiarky. Na stenách, na strope, na dlážke. Miliardy kôl. Každá čiarka jedno ešte jedno.',
  },
  t_watching: { who: null, text: 'Sedíme tam. Ežo a ja. Ten ja je ku mne chrbtom.' },
  t_watching2: { who: null, text: 'Ežo zdvihol hlavu. Nepozerá na toho mňa pri stole. Pozerá na mňa.' },
  t_key: { who: null, text: 'Kľúč. Na prívesku je vyrezané koleso.' },
  t_keys3: { who: null, text: 'Tri kľúče. Salónik.' },
  t_salonik_locked: { who: null, text: 'Salónik. Tri zámky.' },
  t_salonik_open: { who: null, text: 'Tri kľúče, tri zámky. Za dverami praská oheň.' },
  t_window: { who: null, text: 'Okno. Za ním len sneh a tma. A hlboko.' },
  t_jump: { who: null, text: 'Skáčem.' },

  // ── Ežo by the dying fire ──
  e7_1: { who: E, text: 'Tu si. Poď si sadnúť k ohňu, kým ešte horí.' },
  e7_2: { who: E, text: 'Bol som tu veľakrát. S tebou. Vždy s tebou.' },
  e7_3: { who: E, text: 'Každá izba je ten istý večer. Len zakaždým o kúsok chladnejší.' },
  e7_4: { who: E, text: 'Môžu tieto kosti ožiť?', min: 3 },
  e7_5: { who: E, text: 'Ále, nič. To len tak, z Biblie. Stará mama to čítavala nahlas.', laugh: true },
  e7_6: { who: E, text: 'Choď von. Oknom, starý. Ja prídem.' },
  e7_7: { who: E, text: 'Neboj sa, sneh je mäkký. A ja prídem, ako vždy.' },
};
