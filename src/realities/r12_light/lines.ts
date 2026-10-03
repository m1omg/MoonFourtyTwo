import type { Lines } from '../../narrative/voice.ts';

/** The epilogue (reality 12). Keys double as voice file ids. */
export const L12: Lines = {
  t_town: { who: null, text: 'Mestečko. Skorá jeseň. Na dlažbe gaštany, z okien krčmy svetlo.' },
  t_sign: { who: null, text: 'Nad dverami drevené koleso. U Kolesa.' },
  v12_1: { who: 'Vierka', text: 'Čo si dáte?' },
  e12_1: { who: 'Ežo', text: 'No konečne. Ešte jedno?', laugh: true, min: 3 },
};
