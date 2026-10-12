import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/cua/lib/node_modules/playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(process.env.MIZAN_URL || 'http://127.0.0.1:8766', { waitUntil: 'domcontentloaded' });
  const plans = await page.evaluate(async () => {
    const [{ defaultRooms, validatePlot }, { runMultiEngineDesign }, { buildPlanSVG }] = await Promise.all([
      import('./planner.mjs'), import('./multi-engine.mjs'), import('./plan-view.mjs')
    ]);
    const plot = validatePlot({ width: 35, length: 45, floors: 1, entry: 's', streets: { s: true }, streetSetback: 3, neighborSetback: 1.5, coverage: .75 });
    const { selectedModel } = await runMultiEngineDesign({ plot, rooms: defaultRooms(), idea: 'صالة عائلية مفتوحة على المطبخ', selectedShape: 'rect', seed: 1 });
    const before = structuredClone(selectedModel);
    before.openings = before.openings.filter(opening => !opening.openPlan);
    const after = structuredClone(selectedModel);
    return {
      before: buildPlanSVG(before, { mode: 'cad' }),
      after: buildPlanSVG(after, { mode: 'cad' }),
      opening: after.openings.find(opening => opening.openPlan),
      sharedLength: (() => {
        const living = after.rooms.find(room => room.type === 'living'), kitchen = after.rooms.find(room => room.type === 'kitchen');
        const horizontal = Math.abs(living.x + living.w - kitchen.x) <= .3 || Math.abs(kitchen.x + kitchen.w - living.x) <= .3;
        return horizontal
          ? Math.min(living.y + living.h, kitchen.y + kitchen.h) - Math.max(living.y, kitchen.y)
          : Math.min(living.x + living.w, kitchen.x + kitchen.w) - Math.max(living.x, kitchen.x);
      })(),
      ratio: (() => {
        const living = after.rooms.find(room => room.type === 'living'), kitchen = after.rooms.find(room => room.type === 'kitchen');
        const horizontal = Math.abs(living.x + living.w - kitchen.x) <= .3 || Math.abs(kitchen.x + kitchen.w - living.x) <= .3;
        const shared = horizontal
          ? Math.min(living.y + living.h, kitchen.y + kitchen.h) - Math.max(living.y, kitchen.y)
          : Math.min(living.x + living.w, kitchen.x + kitchen.w) - Math.max(living.x, kitchen.x);
        return after.openings.find(opening => opening.openPlan).w / shared;
      })()
    };
  });
  await mkdir('/workspace/program-first-acceptance-evidence', { recursive: true });
  for (const [label, svg] of [['before', plans.before], ['after', plans.after]]) {
    await page.evaluate(({ label, svg, opening, sharedLength }) => {
      const caption = label === 'before' ? 'الحد المشترك ' + sharedLength.toFixed(2) + ' م؛ الجدار كامل بلا فتحة.'
        : 'فتحة صافية ' + opening.w.toFixed(2) + ' م من حد ' + sharedLength.toFixed(2) + ' م (' + (opening.w / sharedLength * 100).toFixed(0) + '٪)، بلا ضلفة أو قوس باب.';
      document.body.innerHTML = '<main dir="rtl"><h1>' + (label === 'before' ? 'قبل: جدار مغلق' : 'بعد: فتحة صالة ومطبخ مفتوحة') + '</h1><div class="plan">' + svg + '</div><p>' + caption + ' · المقارنة على الهندسة نفسها.</p></main><style>body{margin:0;background:#f4f3ed;color:#1d2b25;font:18px sans-serif}main{padding:22px;max-width:1050px;margin:auto}h1{text-align:center;font-size:24px}.plan{height:770px;background:#fff;border:1px solid #bbb}.plan svg{width:100%;height:100%;display:block}p{text-align:center}</style>';
    }, { label, svg, opening: plans.opening, sharedLength: plans.sharedLength });
    await page.screenshot({ path: `/workspace/program-first-acceptance-evidence/open-plan-${label}.png`, fullPage: true });
  }
  console.log(JSON.stringify({ browser: 'Chromium', before: '/workspace/program-first-acceptance-evidence/open-plan-before.png', after: '/workspace/program-first-acceptance-evidence/open-plan-after.png', opening: plans.opening, clearRatio: plans.ratio }, null, 2));
} finally { await browser.close(); }
