import type { Lines } from '../../narrative/voice.ts';

const H = 'Hlásenie';
const R = 'Revízorka';
const E = 'Ežo';

/** Thoughts, announcements and the inspector on the night bus (reality 9). Keys double as voice file ids. */
export const L9: Lines = {
  // ── on board ──
  t_board: { who: null, text: 'Som v autobuse. Nepamätám si, že by som nastupoval.' },
  t_driver: { who: null, text: 'Za volantom nikto nesedí. Volant sa točí sám.' },
  t_windows: {
    who: null,
    text: 'Okná sú zvnútra zamrznuté. Vonku svietia hviezdy. Toľko som ich nevidel nikdy.',
  },
  t_passengers: { who: null, text: 'Cestujúci. Tváre majú rozmazané, ako na pokazenej fotke.' },
  t_vierka: { who: null, text: 'Pani Vierka? Nie. Niečo, čo si ju pamätá. Zle.' },
  t_repeat: { who: null, text: 'Robia stále to isté. Dookola, ako zaseknutá platňa.' },
  t_door: { who: null, text: 'Toto nie je moja zastávka.' },
  // ── the lights ──
  t_buzz: { who: null, text: 'Žiarivky bzučia. Ako pred výpadkom.' },
  t_first_dark: {
    who: null,
    text: 'Keď sa rozsvietilo, všetci sa pozerali na mňa. Všetci. Keď zase zabzučí, pozriem sa radšej dole.',
    min: 5,
  },
  // ── the stops ──
  a_1: { who: H, text: 'Nasledujúca zastávka: Hviezdna éra.' },
  a_2: { who: H, text: 'Nasledujúca zastávka: Degenerovaná éra.' },
  a_3: { who: H, text: 'Nasledujúca zastávka: Éra čiernych dier.' },
  a_4: { who: H, text: 'Nasledujúca zastávka: Temná éra.' },
  t_era1: { who: null, text: 'Hviezdy sčerveneli. Je ich čoraz menej.' },
  t_era2: { who: null, text: 'Žiadne hviezdy. Len čierne kruhy so svetlým okrajom.' },
  t_era3: { who: null, text: 'Vonku už nie je nič. Ani tma. Je tam menej ako tma.' },
  t_doors: { who: null, text: 'Dvere sa otvorili. Nikto nenastúpil. Nikto nevystúpil.' },
  // ── the ticket ──
  r_board: { who: R, text: 'Kontrola cestovných lístkov, prosím!' },
  t_no_ticket: { who: null, text: 'Lístok. Nemám lístok. Ežo mal vždy všetko za mňa...' },
  t_ticket_unvalidated: { who: null, text: 'Lístok mám. Ale neoznačený.' },
  t_cap: {
    who: null,
    text: 'Ežova baranica, ešte teplá. Vo vnútri papierik: „Lístok máš vpredu, u šoféra. Neboj sa, nehryzie. – E."',
    min: 6,
  },
  t_cap_hint: { who: null, text: 'Vzadu na sedadle niečo leží. Ežova baranica?' },
  t_ticket: { who: null, text: 'Lístok. Linka ∞. Platí pre dvoch.' },
  t_validate: { who: null, text: 'Cvak. Označené: 10¹⁰⁰.' },
  t_validator_empty: { who: null, text: 'Označovač. Nemám čo označiť.' },
  t_validated: { who: null, text: 'Už je označený.' },
  r_check: { who: R, text: 'Lístok.' },
  r_ask: { who: R, text: 'Váš lístok, prosím.' },
  r_thanks: { who: R, text: 'Ďakujem. Pozdravujte pána Kolesára.' },
  // ── the end of the line ──
  e9_1: { who: E, text: 'Konečná, starý. Ďalej to už nejde. Stlač to tlačidlo.' },
  t_ezo_voice: { who: null, text: 'To bol Ežov hlas. Z reproduktora.' },
  t_stop_early: { who: null, text: 'Cink. Nič. Ešte nie je moja zastávka.' },
  t_stop: { who: null, text: 'Cink. Autobus brzdí.' },
  t_sea: { who: null, text: 'Dvere sa otvorili. Vonku je more. Čierne a tiché, ako sklo.' },
};
