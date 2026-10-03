import { test, expect, type Page } from '@playwright/test';

type Api = {
  ready: boolean;
  mode: string;
  sim(s: number): void;
  use(id: string): boolean;
  look(dx: number, dy: number): void;
  teleport(x: number, y: number, z: number, yaw?: number): void;
  goto(id: string, cp?: string): Promise<void>;
  info(): {
    reality: string;
    checkpoint: string;
    pos: number[];
    flags: Record<string, number>;
    entities: Array<{ id: string; state: string; pos: number[] }>;
  };
};
type W = { __mf42: Api };

const api = (page: Page) => ({
  sim: (s: number) => page.evaluate((s) => (window as unknown as W).__mf42.sim(s), s),
  use: (id: string) => page.evaluate((id) => (window as unknown as W).__mf42.use(id), id),
  look: (dx: number, dy: number) =>
    page.evaluate(([dx, dy]) => (window as unknown as W).__mf42.look(dx!, dy!), [dx, dy]),
  teleport: (x: number, y: number, z: number, yaw = 0) =>
    page.evaluate(
      ([x, y, z, yaw]) => (window as unknown as W).__mf42.teleport(x!, y!, z!, yaw),
      [x, y, z, yaw],
    ),
  goto: (id: string, cp: string) =>
    page.evaluate(([id, cp]) => (window as unknown as W).__mf42.goto(id!, cp), [id, cp]),
  info: () => page.evaluate(() => (window as unknown as W).__mf42.info()),
  mode: () => page.evaluate(() => (window as unknown as W).__mf42.mode),
});

async function until(page: Page, cond: () => Promise<boolean>, maxSeconds = 60, chunk = 1): Promise<boolean> {
  const a = api(page);
  for (let t = 0; t < maxSeconds; t += chunk) {
    if (await cond()) return true;
    await a.sim(chunk);
  }
  return cond();
}

/** Why each blackout happened (the game logs „okno: <reason>"). */
const oknos: string[] = [];

async function open(page: Page, extra = ''): Promise<string[]> {
  const errors: string[] = [];
  oknos.length = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    const hit = /^okno: (.*)$/.exec(m.text());
    if (hit) oknos.push(hit[1]!);
  });
  await page.goto(`./#r9${extra}&test&q=low&seed=9`);
  await page.waitForFunction(() => (window as unknown as W).__mf42?.ready === true, null, {
    timeout: 180_000,
  });
  return errors;
}

const inspector = async (page: Page) => (await api(page).info()).entities.find((e) => e.id === 'revizor')!;
/** Looks at the floor: no face in view when the lights come back (a rendered frame applies the look). */
const lookDown = async (page: Page) => {
  await api(page).look(0, 900);
  await api(page).sim(0.05);
};

test('the night bus: Ežo’s cap, the ticket, the inspector and the last stop', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(600_000);
  // the flicker rule and the inspector's catch are tested on their own below
  const errors = await open(page, '&god');
  const a = api(page);
  expect((await a.info()).reality).toBe('r9');

  // the note in the cap, the ticket by the wheel, the validator by the middle door
  expect(await a.use('validator:1')).toBe(true);
  expect((await a.info()).flags['bus.valid']).toBeUndefined();
  expect(await a.use('cap')).toBe(true);
  expect(await a.use('ticket')).toBe(true);
  expect(await a.use('validator:1')).toBe(true);
  expect((await a.info()).flags['bus.valid']).toBe(1);

  // from the stop where the inspector gets on: he checks, thanks you and gets off again
  await a.goto('r9', 'revizor');
  expect((await a.info()).checkpoint).toBe('revizor');
  expect(await until(page, async () => (await inspector(page)).state !== 'wait', 60)).toBe(true);
  expect(await until(page, async () => !!(await a.info()).flags['bus.passed'], 90)).toBe(true);
  expect(await until(page, async () => (await inspector(page)).state === 'gone', 60)).toBe(true);

  // the last stop is on request: press STOP, the doors open onto the sea, step out
  await a.goto('r9', 'konecna');
  expect(await a.use('stop:0')).toBe(true);
  await a.sim(8);
  await a.teleport(1.0, 0, 0, -Math.PI / 2);
  await a.sim(0.5);
  await a.teleport(2.2, 0, 0, -Math.PI / 2);
  // out onto the pier of reality 10
  expect(
    await until(page, async () => (await a.mode()) === 'play' && (await a.info()).reality === 'r10', 60, 0.5),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('when the lights come back, do not look them in the face', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(600_000);
  const errors = await open(page);
  const a = api(page);
  // at the front, turned to face them all, eyes on the floor: the first two flickers pass
  // (the first one only teaches the rule)
  await a.teleport(0, 0, -3.6, Math.PI);
  await lookDown(page);
  await a.sim(72);
  expect(await a.mode()).toBe('play');
  // eyes up: the next time the lights come back, they have you
  await a.teleport(0, 0, -3.6, Math.PI);
  await a.sim(0.05);
  expect(await until(page, async () => (await a.mode()) === 'okno', 60, 0.5)).toBe(true);
  expect(oknos).toEqual(['fluktuacia']);
  expect(errors).toEqual([]);
});

test('the inspector takes a passenger without a ticket', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(600_000);
  const errors = await open(page, ':revizor');
  const a = api(page);
  await lookDown(page);
  expect(await until(page, async () => (await inspector(page)).state !== 'wait', 60)).toBe(true);
  expect(await until(page, async () => (await a.mode()) === 'okno', 60, 0.5)).toBe(true);
  expect(oknos).toEqual(['revizor']);
  expect(errors).toEqual([]);
});
