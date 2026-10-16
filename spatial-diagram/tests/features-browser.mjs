// Run with `npm run test:features -- --out /absolute/separate/output/directory`.
// Covers the assembled view, publication vector output, figure exports, UI, tours and agent tooling.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {buildHtml} from '../scripts/export-scene.mjs';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const flag = (name, fallback) => {const i = process.argv.indexOf(name);return i < 0 ? fallback : process.argv[i + 1];};
const out = path.resolve(flag('--out', fs.mkdtempSync(path.join(tmpdir(), 'spatial-features-'))));
fs.mkdirSync(out, {recursive: true});
const puppeteer = (await import(process.env.PUPPETEER_MODULE || 'puppeteer')).default;
const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined);
const browser = await puppeteer.launch({headless: true, executablePath, args: ['--no-sandbox', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-angle=swiftshader']});
const page = await browser.newPage();
await (await browser.target().createCDPSession()).send('Browser.setDownloadBehavior', {behavior: 'deny'});
await page.setViewport({width: 1440, height: 900, deviceScaleFactor: 1});await page.setOfflineMode(true);
const results = {browser: await browser.version(), checks: [], errors: [], requests: []};
page.on('pageerror', e => results.errors.push(String(e)));
page.on('request', r => {if (/^https?:/.test(r.url())) results.requests.push(r.url());});
const save = () => fs.writeFileSync(path.join(out, 'features-results.json'), JSON.stringify(results, null, 2));
function check(name, pass, details = {}) {results.checks.push({name, pass: !!pass, details});console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);save();}
const frames = (n = 2) => page.evaluate(n => new Promise(resolve => {let count = 0;const tick = () => ++count >= n ? resolve() : requestAnimationFrame(tick);requestAnimationFrame(tick);}), n);
const wait = ms => new Promise(r => setTimeout(r, ms));
const key = k => page.evaluate(k => document.querySelector('#stage').dispatchEvent(new KeyboardEvent('keydown', {key: k, bubbles: true})), k);
async function open(name, mutate, hash = '') {
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples', name, 'scene.json')));
  mutate?.(spec);
  const json = path.join(out, `${name}.scene.json`), html = path.join(out, `${name}.html`);
  fs.writeFileSync(json, JSON.stringify(spec));fs.writeFileSync(html, buildHtml(json));
  await page.goto(pathToFileURL(html).href + hash, {waitUntil: 'load'});
  await page.waitForFunction(() => window.sceneEngine);
  await page.evaluate(() => {
    const spec = sceneEngine.getSpec();sceneEngine.dispose();
    class Renderer extends THREE.WebGLRenderer {constructor(...a) {super(...a);const draw = this.render.bind(this);this.render = (scene, camera) => {if (!this.getScissorTest()) window.probe = {scene, camera};draw(scene, camera);};}}
    window.sceneEngine = SpatialDiagram.createEngine({THREE: {...THREE, WebGLRenderer: Renderer}, container: document.querySelector('#stage'), spec});
  });
  await frames(3);
}
const center = id => page.evaluate(id => {const box = new THREE.Box3().setFromObject(probe.scene.getObjectByName(id)), p = box.getCenter(new THREE.Vector3()).project(probe.camera);return [(p.x * .5 + .5) * innerWidth, (-p.y * .5 + .5) * innerHeight];}, id);
const position = id => page.evaluate(id => probe.scene.getObjectByName(id).position.toArray(), id);

try {
  // ---------------------------------------------------------------- 1. assembled view
  await open('gpu-exploded');
  await page.evaluate(() => sceneEngine.explode(0, {immediate: true}));await frames(40);
  const assembled = await page.evaluate(() => ({distance: sceneEngine.getState().camera.distance, audit: sceneEngine.auditVisual({explode: 0}).results[0].metrics,
    chip: document.querySelector('.sd-summary')?.getAttribute('display') !== 'none' ? document.querySelector('.sd-summary text').textContent : null,
    active: document.querySelector('[data-id="explode-assembled"]').getAttribute('aria-pressed')}));
  check('assembled pose is framed tightly (frame fill ≥ 0.5)', assembled.audit.frameFill >= .5, assembled.audit);
  check('hidden internal labels collapse into one summary chip', /\+\d+ internal part/.test(assembled.chip || ''), assembled);
  check('Assembled button announces the assembled state', assembled.active === 'true');
  await page.evaluate(() => sceneEngine.explode(1, {immediate: true}));await frames(40);
  const exploded = await page.evaluate(() => ({distance: sceneEngine.getState().camera.distance, chip: document.querySelector('.sd-summary').getAttribute('display')}));
  check('camera follows explode (wider when exploded)', exploded.distance > assembled.distance * 1.15, {assembled: assembled.distance, exploded: exploded.distance});
  check('summary chip disappears once parts are exploded', exploded.chip === 'none');
  check('explode stops snap nearby slider values', await page.evaluate(() => {sceneEngine.explode(.47, {immediate: true});return sceneEngine.getState().modes.explode === .45;}));
  check('trace lines connect moved parts to their assembled positions', await page.evaluate(async () => {sceneEngine.explode(1, {immediate: true});await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));const on = document.querySelectorAll('.sd-annotations .sd-traces line').length;sceneEngine.toggleMode('traces');await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));const off = document.querySelectorAll('.sd-annotations .sd-traces line').length;sceneEngine.toggleMode('traces');return on > 3 && off === 0;}));
  // peek
  await page.evaluate(() => sceneEngine.explode(0, {immediate: true}));await frames(20);
  const fanAssembled = await position('fan-left'), fanPoint = await center('fan-left');
  await page.mouse.move(fanPoint[0] - 3, fanPoint[1]);await page.mouse.move(...fanPoint);await frames(25);
  const fanPeek = await position('fan-left');
  await page.mouse.move(5, 450);await frames(40);
  const fanBack = await position('fan-left');
  check('hovering an assembled part peeks it out, then retracts', fanPeek[1] - fanAssembled[1] > 2 && Math.abs(fanBack[1] - fanAssembled[1]) < .05, {fanAssembled, fanPeek, fanBack});
  // local explode
  await page.evaluate(() => sceneEngine.explodeSubtree('vapor-chamber', 1));await wait(1100);await frames();
  const local = await page.evaluate(() => ({fin: probe.scene.getObjectByName('fin-stack-left').position.y, pcb: probe.scene.getObjectByName('pcb').position.y, gpu: probe.scene.getObjectByName('gpu').position.y}));
  check('double-click style local explode separates only one sub-assembly', local.fin > 60 && local.pcb === 0 && Math.abs(local.gpu - 4) < 1e-6, local);
  await page.screenshot({path: path.join(out, 'gpu-local-explode.png')});

  // ---------------------------------------------------------------- 2. publication vector output
  await page.evaluate(() => {sceneEngine.explode(1, {immediate: true});sceneEngine.setRenderMode('illustration');});await frames(4);
  const illustration = await page.evaluate(() => {
    const svg = document.querySelector('.sd-blueprint-drawing');
    return {theme: svg.dataset.theme, paper: svg.querySelector('.sd-paper')?.getAttribute('fill'), silhouettes: svg.querySelectorAll('.sd-blueprint-silhouette').length, creases: svg.querySelectorAll('.sd-blueprint-edge:not(.sd-blueprint-silhouette)').length,
      weights: [...new Set([...svg.querySelectorAll('.sd-blueprint-edge')].map(p => p.getAttribute('stroke-width')))], light: document.querySelector('#stage').classList.contains('sd-light')};
  });
  check('Illustration mode draws white-paper line art with a light UI', illustration.theme === 'illustration' && illustration.paper === '#ffffff' && illustration.light, illustration);
  check('silhouettes and creases use distinct line weights', illustration.silhouettes > 20 && illustration.creases > 20 && illustration.weights.length >= 2, illustration);
  check('Illustration mode keeps orbit rotation (unlike Blueprint)', await page.evaluate(() => {sceneEngine.setCamera({azimuth: 120, elevation: 20}, true);return Math.round(sceneEngine.getState().camera.azimuth) === 120;}));
  await page.evaluate(() => sceneEngine.setCamera({azimuth: 42, elevation: 22}, true));await frames(3);
  const hidden = await page.evaluate(async () => {sceneEngine.updateSpec({scene: {drawing: {hiddenLines: true}}});await new Promise(r => requestAnimationFrame(r));const n = document.querySelectorAll('.sd-vector-hidden path').length;sceneEngine.updateSpec({scene: {drawing: {hiddenLines: false}}});return n;});
  check('optional hidden lines render as a dashed layer', hidden > 10, {hidden});
  const section = await page.evaluate(async () => {sceneEngine.toggleMode('section');sceneEngine.setSectionAxis('y', .3);await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const vector = document.querySelectorAll('.sd-blueprint-drawing .sd-vector-cap').length, fill = document.querySelector('.sd-vector-cap')?.getAttribute('fill');
    sceneEngine.setRenderMode('webgl');await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const caps = probe.scene.getObjectByName('sd-section-caps')?.children.length || 0;sceneEngine.toggleMode('section');sceneEngine.setRenderMode('illustration');return {vector, fill, caps};});
  check('section cuts get hatched caps in vector and WebGL', section.vector > 0 && /url\(#.*hatch\)/.test(section.fill) && section.caps > 0, section);
  await page.evaluate(() => sceneEngine.updateSpec({scene: {annotationStyle: 'balloon', labelLayout: 'margins'}}));await frames(4);
  const balloons = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.sd-annotations .sd-annotation-style--balloon')].filter(g => g.style.display !== 'none');
    const rows = document.querySelectorAll('.sd-annotations .sd-parts-list text').length;
    const subject = document.querySelector('.sd-blueprint-drawing .sd-blueprint-geometry').getBoundingClientRect();
    const sides = items.map(g => {const b = g.querySelector('circle.sd-balloon').getBoundingClientRect();return b.right < subject.left + subject.width * .5 ? 'L' : 'R';});
    return {count: items.length, rows, left: sides.filter(s => s === 'L').length, right: sides.filter(s => s === 'R').length, numbers: items.map(g => g.querySelector('text').textContent)};
  });
  check('balloons number parts and feed an auto parts list', balloons.count >= 10 && balloons.rows > balloons.count * 2 && balloons.numbers.includes('1'), balloons);
  check('margin layout stacks balloons in left and right columns', balloons.left > 2 && balloons.right > 2, balloons);
  check('detail view draws frame and vector inset', await page.evaluate(() => document.querySelectorAll('.sd-annotations .sd-detail-frame').length >= 2 && document.querySelectorAll('.sd-blueprint-drawing .sd-vector-detail path').length > 0));
  const journal = await page.evaluate(() => {
    const svg = sceneEngine.exportSVG({download: false, figure: 'double-column'}), doc = new DOMParser().parseFromString(svg, 'image/svg+xml'), root = doc.documentElement;
    const table = doc.querySelector('.sd-parts-list rect'), vb = root.getAttribute('viewBox').split(' ').map(Number);
    return {errors: doc.querySelectorAll('parsererror').length, width: root.getAttribute('width'), vb, tableX: +table?.getAttribute('x'), chips: doc.querySelectorAll('.sd-summary:not([display="none"])').length};
  });
  check('journal preset sizes the SVG in millimetres (183 mm)', journal.errors === 0 && journal.width === '183mm' && journal.vb[2] > 700 && journal.vb[2] < 900, journal);
  check('figure exports never include the on-screen summary chip', journal.chips === 0, journal);
  fs.writeFileSync(path.join(out, 'gpu-journal.svg'), await page.evaluate(() => sceneEngine.exportSVG({download: false, figure: 'double-column'})));
  await page.evaluate(() => sceneEngine.updateSpec({scene: {annotationStyle: 'card', labelLayout: 'free'}}));

  // ---------------------------------------------------------------- figure exports
  const figures = await page.evaluate(async () => {
    const parse = s => new DOMParser().parseFromString(s, 'image/svg+xml');
    const comparison = parse(await sceneEngine.exportComparison({download: false, format: 'svg'}));
    const sheet = await sceneEngine.exportSheet({download: false});
    const instructions = parse(await sceneEngine.exportInstructions({download: false, format: 'svg'}));
    const steps = sceneEngine.instructionSteps();
    const decode = async url => {const i = new Image();i.src = url;await i.decode();return [i.width, i.height];};
    const contact = await decode(await sceneEngine.exportContactSheet({download: false}));
    const png = await decode(await sceneEngine.exportPNG({download: false, figure: 'single-column', dpi: 300}));
    return {comparisonPanels: comparison.documentElement.querySelectorAll(':scope > svg').length, sheetHasBlock: sheet.includes('THIRD ANGLE') && sheet.includes('DRAWING NO.'),
      sheetPanels: parse(sheet).documentElement.querySelectorAll(':scope > svg').length, instructionPanels: instructions.documentElement.querySelectorAll(':scope > svg').length, steps: steps.length,
      firstStep: steps[0]?.title, contact, png};
  });
  check('comparison figure has assembled and exploded panels', figures.comparisonPanels === 2, figures);
  check('drawing sheet has four views and a title block', figures.sheetPanels === 4 && figures.sheetHasBlock, figures);
  check('assembly instructions have one panel per derived step, base first', figures.instructionPanels === figures.steps && figures.steps > 5 && /Main PCB/.test(figures.firstStep), figures);
  check('contact sheet composes every state into one PNG', figures.contact[0] > 1400 && figures.contact[1] > 900, figures);
  check('single-column PNG at 300 dpi is ~1051 px wide', Math.abs(figures.png[0] - Math.round(89 / 25.4 * 300)) <= 2, figures);

  // ---------------------------------------------------------------- 3. UI
  await page.evaluate(() => {sceneEngine.setRenderMode('webgl');sceneEngine.explode(1, {immediate: true});});await frames(30);
  check('toolbar stays one row at 1440 px and groups controls', await page.evaluate(() => {const bar = document.querySelector('.sd-toolbar');return bar.getBoundingClientRect().height < 60 && bar.querySelectorAll('.sd-group').length >= 4;}));
  check('export menu opens with vector-only items hidden in 3D', await page.evaluate(() => {document.querySelector('[data-id="export"]').click();const menu = document.querySelector('.sd-menu');const ok = menu.classList.contains('sd-open') && menu.querySelector('[data-id="svg"]').hidden && !menu.querySelector('[data-id="sheet"]').hidden;document.querySelector('[data-id="export"]').click();return ok;}));
  const fan = await center('fan-left');
  await page.mouse.move(fan[0] - 4, fan[1]);await page.mouse.move(...fan);await frames(3);
  check('hovering a part shows a tooltip and highlights its label', await page.evaluate(() => getComputedStyle(document.querySelector('.sd-tooltip')).display === 'block' && document.querySelector('.sd-annotation[data-id="ann-fan"]').dataset.linked === 'true'));
  const label = await page.evaluate(() => {const r = document.querySelector('.sd-annotation[data-id="ann-gpu"] rect.sd-card').getBoundingClientRect();return [r.x + r.width / 2, r.y + r.height / 2];});
  await page.mouse.move(...label);await frames(2);
  const labelHover = await page.evaluate(() => sceneEngine.getState().modes.hovered);
  await page.mouse.click(...label);await frames(2);
  check('hovering and clicking a label targets its part', labelHover === 'gpu' && await page.evaluate(() => sceneEngine.getState().modes.selected === 'gpu'), {labelHover});
  check('inspect card lists parent, children and actions', await page.evaluate(() => {const t = document.querySelector('.sd-inspect').innerText;return t.includes('Attached to'.toUpperCase()) || t.includes('Attached to') ? t.includes('Focus') && t.includes('Hide') : false;}));
  await key('p');await frames(2);
  const tree = await page.evaluate(() => ({open: document.querySelector('.sd-tree').classList.contains('sd-open'), rows: document.querySelectorAll('.sd-tree li[data-component-id]').length, nested: [...document.querySelectorAll('.sd-tree li[data-component-id]')].some(li => parseInt(li.style.paddingLeft) > 20), selected: document.querySelector('.sd-tree li.sd-selected')?.dataset.componentId}));
  check('parts tree opens with the nested hierarchy and tracks selection', tree.open && tree.rows === 38 && tree.nested && tree.selected === 'gpu', tree);
  await page.evaluate(() => document.querySelector('.sd-tree li[data-component-id="fan-right"] .sd-eye').click());await frames();
  check('tree eye toggle hides a part', await page.evaluate(() => sceneEngine.getState().hidden.includes('fan-right') && !probe.scene.getObjectByName('fan-right').visible));
  await page.evaluate(() => {sceneEngine.setComponentVisible('fan-right', true);sceneEngine._toggleTree(false);sceneEngine.select(null);});
  await page.evaluate(() => sceneEngine.toggleMode('measure'));
  const anchors = await page.evaluate(() => ['ann-fan', 'ann-back'].map(id => {const d = document.querySelector(`.sd-annotation[data-id="${id}"] circle.sd-dot`);return [+d.getAttribute('cx'), +d.getAttribute('cy')];}));
  for (const point of anchors) {await page.mouse.click(...point);await wait(80);}
  const measured = await page.evaluate(() => sceneEngine.getMeasurements());
  check('measure tool snaps to anchors and labels distance in scene units', measured.length === 1 && /mm$/.test(measured[0].text) && measured[0].from === 'fan-left.top', measured);
  await page.evaluate(() => {sceneEngine.toggleMode('measure');sceneEngine.clearMeasurements();});
  await key('e');await wait(1300);
  const afterE = await page.evaluate(() => sceneEngine.getState().modes.explode);
  await key('3');await frames(2);
  const afterThree = await page.evaluate(() => sceneEngine.getState().renderMode);
  await key('1');await key('?');
  check('keyboard shortcuts drive explode, render mode and help', afterE === 0 && afterThree === 'illustration' && await page.evaluate(() => document.querySelector('.sd-help').classList.contains('sd-open')), {afterE, afterThree});
  await key('?');
  check('controls carry accessible names and a live region', await page.evaluate(() => document.querySelector('#stage').getAttribute('aria-label')?.includes('Press ?') && document.querySelector('.sd-toolbar').getAttribute('role') === 'toolbar' && !!document.querySelector('.sd-live')));
  const share = await page.evaluate(() => {sceneEngine.setRenderMode('blueprint');sceneEngine.explode(.45, {immediate: true});sceneEngine.select('gpu');sceneEngine.setAnnotationGroup('thermal', false);return sceneEngine.shareURL().split('#')[1];});
  // The exported page itself boots with urlState, so load it directly (no probe engine).
  await page.goto(pathToFileURL(path.join(out, 'gpu-exploded.html')).href + '#' + share, {waitUntil: 'load'});await page.waitForFunction(() => window.sceneEngine);await frames(5);
  const restored = await page.evaluate(() => {const s = sceneEngine.getState();return {mode: s.renderMode, explode: s.modes.explode, selected: s.modes.selected, thermal: s.annotationGroups.thermal};});
  check('share links restore mode, explode, selection and label groups', restored.mode === 'blueprint' && restored.explode === .45 && restored.selected === 'gpu' && restored.thermal === false, restored);

  // ---------------------------------------------------------------- 4. storytelling
  await open('gpu-exploded');
  await page.evaluate(() => sceneEngine.tour.start());await wait(400);
  await page.evaluate(() => sceneEngine.tour.next());await wait(1300);await frames();
  const tour = await page.evaluate(() => ({state: sceneEngine.getState().tour, panel: document.querySelector('.sd-tour').innerText, highlight: sceneEngine.getState().modes.highlight, explode: sceneEngine.getState().modes.explode}));
  check('tour steps apply caption, highlight and explode', tour.state.index === 1 && tour.panel.includes('Cooling stack') && tour.highlight.includes('fan-left') && Math.abs(tour.explode - .45) < 1e-6, tour);
  await page.screenshot({path: path.join(out, 'gpu-tour.png')});
  await page.evaluate(() => sceneEngine.tour.goTo(4));await wait(400);
  check('a tour step can switch render mode', await page.evaluate(() => sceneEngine.getState().renderMode === 'illustration'));
  await page.evaluate(() => sceneEngine.tour.stop());await frames();
  check('stopping the tour clears highlights', await page.evaluate(() => sceneEngine.getState().modes.highlight.length === 0 && !document.querySelector('.sd-tour').classList.contains('sd-open')));
  await page.evaluate(() => {sceneEngine.setRenderMode('webgl');sceneEngine.tour.start('instructions');sceneEngine.tour.goTo(2);});await wait(1300);await frames();
  const steps = await page.evaluate(() => ({fan: probe.scene.getObjectByName('fan-left').visible, pcb: probe.scene.getObjectByName('pcb').visible, interposer: probe.scene.getObjectByName('interposer').visible, labelForHidden: document.querySelector('.sd-annotation[data-id="ann-fan"]').style.display}));
  check('interactive assembly steps show only installed parts and their labels', !steps.fan && steps.pcb && steps.interposer && steps.labelForHidden === 'none', steps);
  await page.evaluate(() => sceneEngine.tour.stop());await frames();
  check('leaving assembly steps restores every part', await page.evaluate(() => probe.scene.getObjectByName('fan-left').visible));
  const progress = await page.evaluate(() => {sceneEngine.tour.setProgress(1.5);return sceneEngine.getState().modes.explode;});
  check('scroll progress interpolates explode between steps', progress > .45 && progress < 1, {progress});
  await page.evaluate(() => sceneEngine.tour.stop());
  const video = await page.evaluate(async () => {const blob = await sceneEngine.exportVideo({download: false, kind: 'explode', duration: 1200});return {size: blob.size, type: blob.type};});
  check('video export records a WebM', video.size > 1000 && video.type === 'video/webm', video);

  // ---------------------------------------------------------------- 5. agent tooling
  await page.evaluate(() => sceneEngine.resetView());await frames(60);
  const audit = await page.evaluate(() => sceneEngine.auditVisual());
  check('visual audit runs at assembled and exploded poses', audit.results.length === 2 && audit.results.every(r => r.metrics.frameFill > 0), audit.summary);
  check('shipped GPU example passes the visual audit', audit.summary.warnings === 0, audit.results.map(r => r.issues));
  const stray = await page.evaluate(() => {
    sceneEngine.updateSpec({assemblies: sceneEngine.getSpec().assemblies.map(a => ({...a, components: [...a.components, {id: 'stray-led', label: 'LED', geometry: {kind: 'box', size: [2, 1, 2]}, material: 'emissive-cyan', transform: {position: [0, 200, 0]}}]}))});
    return sceneEngine.auditVisual({explode: 1}).results[0].issues.map(i => i.code);
  });
  check('visual audit flags an unlabeled emissive fragment', stray.includes('part:unlabeled-emissive'), stray);
  const diff = await page.evaluate(async () => {
    const before = sceneEngine.getSpec();
    const result = sceneEngine.compare(before.assemblies ? {...before, assemblies: before.assemblies.map(a => ({...a, components: a.components.filter(c => c.id !== 'stray-led').map(c => c.id === 'gpu' ? {...c, transform: {...c.transform, position: [0, 4, 0]}} : c)}))} : before);
    await new Promise(r => requestAnimationFrame(r));
    return {summary: result.summary, legend: document.querySelector('.sd-diff-legend').classList.contains('sd-open'), state: sceneEngine.getState().modes.diff};
  });
  check('revision diff marks added and moved parts', diff.summary.added === 1 && diff.summary.moved === 1 && diff.legend && diff.state['stray-led'] === 'added' && diff.state.gpu === 'changed', diff);
  await page.evaluate(() => sceneEngine.clearDiff());
  await page.setViewport({width: 390, height: 844, deviceScaleFactor: 1});await frames(4);
  check('phones switch labels to balloons and hide insets', await page.evaluate(() => document.querySelectorAll('.sd-annotations .sd-annotation-style--balloon').length > 5 && document.querySelectorAll('.sd-annotations .sd-detail-frame').length === 0));
  await page.screenshot({path: path.join(out, 'gpu-phone.png')});
  await page.setViewport({width: 1440, height: 900, deviceScaleFactor: 1});
  // ---------------------------------------------------------------- vehicle example (poster layout)
  await open('track-car-exploded');
  await page.evaluate(() => sceneEngine.explode(1, {immediate: true}));await frames(60);
  const poster = await page.evaluate(() => {
    const overlay = document.querySelector('.sd-annotations'), rows = [...overlay.querySelectorAll('.sd-parts-list .sd-legend-row')];
    const badge = rows[0]?.querySelector('.sd-badge-text'), boxes = rows.map(r => r.getBoundingClientRect());
    const badgeFill = badge && getComputedStyle(badge).fill, numbers = rows.map(r => r.querySelector('.sd-badge-text').textContent);
    const audit = sceneEngine.auditVisual({explode: 1}).results[0];
    const leftEdge = Math.max(...boxes.filter(b => b.x < innerWidth / 2).map(b => b.right)), rightEdge = Math.min(...boxes.filter(b => b.x > innerWidth / 2).map(b => b.left));
    const [sx, , sw] = audit.metrics.subjectRect;
    return {paper: overlay.classList.contains('sd-annotations-illustration'), rows: rows.length, numbers,
      badgeFill, keyRows: overlay.querySelectorAll('.sd-parts-list rect[width="18"]').length,
      subjectClear: sx > leftEdge - 40 && sx + sw < rightEdge + 40, fill: audit.metrics.frameFill, issues: audit.issues.map(i => i.code),
      far: probe.camera.far, distance: sceneEngine.getState().camera.distance};
  });
  check('studio-light stage uses the paper label theme', poster.paper, poster);
  check('poster legend lists every numbered system with legible badges', poster.rows === 31 && poster.numbers[0] === '01' && poster.numbers[30] === '31' && /255, 255, 255/.test(poster.badgeFill || ''), poster);
  check('material key lists the materials in use', poster.keyRows >= 6, poster);
  check('the drawing is framed between the legend columns', poster.subjectClear && poster.fill > .5, poster);
  check('camera far plane follows large exploded scenes (nothing clipped)', poster.far > poster.distance * 1.2 && !poster.issues.includes('frame:clipped'), poster);
  check('shipped vehicle example passes the visual audit', !poster.issues.some(code => code !== 'label:collapsed'), poster.issues);
  const strip = await page.evaluate(async () => {
    const doc = new DOMParser().parseFromString(await sceneEngine.exportSheet({download: false, views: ['front', 'left', 'back', 'top']}), 'image/svg+xml');
    const panels = [...doc.documentElement.querySelectorAll(':scope > svg')];
    return {panels: panels.length, widths: panels.map(p => +p.getAttribute('width')), dims: doc.querySelectorAll('.sd-sheet-dimension').length, labels: [...doc.querySelectorAll('.sd-sheet-dimension text')].map(t => t.textContent)};
  });
  check('view strip: four orthographic panels sized to their views, with overall dimensions', strip.panels === 4 && strip.dims === 4 && strip.widths[1] > strip.widths[0] * 1.8 && strip.labels.some(t => /mm/.test(t)), strip);
  await page.screenshot({path: path.join(out, 'track-car.png')});

  check('all feature scenes run offline', results.requests.length === 0, {requests: results.requests});
  check('no uncaught browser exceptions', results.errors.length === 0, {errors: results.errors});
} catch (error) {results.fatal = error.stack;console.error(error);process.exitCode = 1;}
finally {save();await browser.close();}
if (results.checks.some(c => !c.pass)) process.exitCode = 1;
