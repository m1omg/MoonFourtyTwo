import type { Lines } from '../../narrative/voice.ts';

const E = 'Ežo';

/** Dialogue and thoughts for the housing estate (reality 6). Keys double as voice file ids. */
export const L6: Lines = {
  // ── the flat ──
  t_wake: { who: null, text: 'Vaňa. Studená voda až po bradu. Kúpeľňa z umakartu, ako u starej mamy.' },
  t_mirror: { who: null, text: 'V zrkadle sú dvere za mnou otvorené. Keď sa otočím, sú zatvorené.' },
  t_wallunit: { who: null, text: 'Obývacia stena. Krištáľové poháre, z ktorých nikto nikdy nepil.' },
  t_bottle: { who: null, text: 'Za sklom stojí fľaša slivovice. Na sviatky. Toto je asi sviatok.' },
  t_tv: {
    who: null,
    text: 'Televízor s háčkovanou dečkou. Ide v ňom len zrnenie. V zrnení krúžia dve bodky.',
  },
  t_window: { who: null, text: 'Vonku sneh a paneláky, kam až dovidím. Svieti len jedno okno.' },
  t_window_drunk: { who: null, text: 'To jediné svietiace okno je toto. Stojí v ňom niekto. Ja.' },
  t_kitchen: { who: null, text: 'Kuchyňa. Na sporáku hrniec, ešte teplý. Nikto tu nie je.' },
  t_fridge: { who: null, text: 'V chladničke dve pivá a lístok: „Na neskôr."' },
  t_door_out: { who: null, text: 'Na chodbe svieti. Niekde tiká relé.' },
  t_buzz: { who: null, text: 'Dole zvoní zvonček. Dlho, vytrvalo. Ako keď niekto vie, že si doma.' },

  // ── the stairwell ──
  t_switch: { who: null, text: 'Minútka. Svetlo na minútu.' },
  t_dark: { who: null, text: 'Zhaslo.' },
  t_chain: { who: null, text: 'Niekde zarinčala reťaz na dverách.' },
  t_neighbor: { who: null, text: 'Sused. Stojí vo dverách a nemá tvár.' },
  t_locked: { who: null, text: 'Zamknuté. Za dverami niekto dýcha.' },
  t_peephole: { who: null, text: 'Kukátko svieti. Niekto sa pozerá von. Na mňa.' },
  t_floor40: { who: null, text: 'Štyridsiate poschodie. Dom mal osem.' },
  t_floor100: { who: null, text: 'Sté. Ďalej to už nepočíta.' },
  t_names: { who: null, text: 'Na všetkých dverách je to isté meno. Kolesár.' },
  t_window_stairs: { who: null, text: 'Za oknom v snehu čakajú ďalšie paneláky. A ďalšie. Bez konca.' },

  // ── the ground floor ──
  t_mailboxes: { who: null, text: 'Schránky. Na každej je napísané: Kolesár.' },
  t_entrance: { who: null, text: 'Vchodové dvere. Za sklom je sneh až po kľučku. Von sa nedá.' },
  t_intercom: { who: null, text: 'Zvonček. Pri jednom mene svieti svetielko: Kolesár.' },
  t_caretaker: { who: null, text: '„E. Kolesár – domovník." Odomknuté.' },
  t_photos: {
    who: null,
    text: 'Fotky. My dvaja: 1906. 1986. 2026. A jedna, na ktorej je nebo čierne, bez hviezd. Aj tam sa smejeme.',
  },
  t_note: {
    who: null,
    text: 'Lístok: „Starý, ak toto čítaš, si hlbšie, než by si mal byť. Choď dole, prídem za tebou. – E."',
  },
  t_key: { who: null, text: 'Služobný kľúč od výťahu. Na prívesku je koleso.' },
  t_cellar_door: { who: null, text: 'Dvere do pivnice. Zamknuté. A dobre tak.' },
  t_coat: { who: null, text: 'Kabát veľký ako stan. Ežov. Ešte je teplý.' },
  t_demijohn: { who: null, text: 'Demižón slivovice, domácej. Odlejem si.' },
  t_demijohn_full: { who: null, text: 'Jednu nalievanú ešte mám.' },
  t_caj: { who: null, text: 'Horský čaj, sedemdesiatdva stupňov. Na horách sa po ňom vidí ďalej.' },

  // ── the elevator ──
  t_lift_locked: { who: null, text: 'Výťah. Bez služobného kľúča nepôjde.' },
  t_lift_open: { who: null, text: 'Služobný kľúč pasuje. Dvere sa so škripotom roztvorili.' },
  t_panel: { who: null, text: 'Gombíky: P, 1 až 8. Žiadny z nich ma nikam nezavezie.' },
  t_panel_sober: { who: null, text: 'Možno som na tento výťah príliš triezvy.' },
  t_panel_drunk: { who: null, text: 'Na paneli pribudli gombíky: 14, 40, 100. A posledný, ležatá osmička.' },
  t_lift_nothing: { who: null, text: 'Výťah sa ani nepohol.' },
  t_lift_calling: { who: null, text: 'Niekde v šachte sa pohla kabína. Ide ku mne.' },
  t_lift_up: { who: null, text: 'Stúpame. Dlho. Dlhšie, ako je dom vysoký.' },
  t_lift_go: { who: null, text: 'Dvere sa zavreli. Ideme. Dole? Hore? Neviem.' },

  // ── Ežo, through the intercom ──
  e6_1: { who: E, text: 'Starý? Si dole? Konečne.' },
  e6_2: { who: E, text: 'Kľúč od výťahu je u mňa v byte. Nechal som ti odomknuté.' },
  e6_3: { who: E, text: 'A v tme sa nezdržuj. Susedia nemajú radi, keď sa niekto túla po chodbe.' },
  e6_4: { who: E, text: 'Svetlo, starý. Drž sa svetla.' },
};
