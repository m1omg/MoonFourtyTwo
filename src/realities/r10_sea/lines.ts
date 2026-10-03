import type { Lines } from '../../narrative/voice.ts';

const E = 'Ežo';

/** Thoughts and Ežo on the silent sea (reality 10). Keys double as voice file ids. */
export const L10: Lines = {
  // ── the pier ──
  t_arrive: {
    who: null,
    text: 'Kroky počujem až chvíľu potom, čo stúpim. Akoby zvuk musel prejsť veľký kus cesty.',
  },
  t_bus_gone: { who: null, text: 'Autobus odišiel. Bez svetiel, bez zvuku.' },
  t_lights: { who: null, text: 'Ďaleko na mori dve svetlá. Krúžia okolo seba, pomaly, ako dvaja tanečníci.' },
  t_lifebuoy: { who: null, text: 'Záchranný kruh. Vyblednuté písmená: U KOLESA.' },
  t_gap: { who: null, text: 'Chýbajú dosky. Pod nimi čierna voda. Radšej ju neskúšať.' },
  t_still: { who: null, text: 'Keď stojím, niečo sa pod mólom pohne.' },
  t_crawler: { who: null, text: 'Z vody lezie... niečo. Dlhé a bledé. Nesmiem stáť.' },
  t_wheels: { who: null, text: 'Pod hladinou sa niečo otáča. Kolesá v kolesách. Plné očí.' },
  t_eyes: { who: null, text: 'Pozerajú sa na mňa. Všetky naraz.' },
  t_bench: {
    who: null,
    text: 'Na lavičke poldeci Čierneho a lístok: „Napi sa a čakaj. Keď budú svetlá jedno za druhým, príď. – E."',
    min: 6,
  },
  t_cierne: { who: null, text: 'Ďalšie poldeci Čierneho.' },
  t_scope: { who: null, text: 'Ďalekohľad na mince. V ňom dve svetlá a medzi nimi... okno?' },
  t_need_more: { who: null, text: 'Svetlá ešte nie sú v rade. Treba čakať. Veľmi dlho.' },
  // ── the eons ──
  t_skip1: { who: null, text: 'Svetlá sa pohli. Ako ručičky na hodinách.' },
  t_skip_cold: { who: null, text: 'Je chladnejšie. Mráz mi lezie do prstov.' },
  e10_1: { who: E, text: 'Starý... už sme blízko. Už sme veľmi blízko.', min: 4 },
  t_aligned: {
    who: null,
    text: 'Svetlá sú jedno za druhým. Po vode vedie cesta zo zamrznutého svetla.',
  },
  e10_2: { who: E, text: 'Poď, kamoško. Počkám ťa pri okne.' },
  t_path: { who: null, text: 'Nesie ma to. Studené a pevné ako ľad.' },
  t_window: { who: null, text: 'To nie sú svetlá. Je to okno. Naše okno, U Kolesa.' },
};
