// ui.js — in-page chrome: title plate, grouped toolbar, export menu, inspect card,
// parts tree, tooltip, tour captions, diff legend, help and a screen-reader live region.
import { ANNOTATION_PALETTES } from './annotations.js';

export function createUISystem() {

  const CSS = `
  .sd-root { --sd-panel:rgba(10,16,26,0.82); --sd-panel-solid:#0d1521; --sd-border:rgba(120,160,210,0.22); --sd-text:#e8eef6; --sd-muted:#9db2c8;
    --sd-btn:rgba(255,255,255,0.04); --sd-btn-border:rgba(130,170,220,0.24); --sd-btn-hover:rgba(120,180,255,0.14); --sd-accent:#3ce0ff;
    --sd-active-bg:rgba(60,224,255,0.18); --sd-active-border:rgba(60,224,255,0.55); --sd-active-text:#b8f1ff; --sd-shadow:0 12px 40px rgba(0,0,0,0.45);
    --sd-radius:14px; --sd-btn-radius:9px; --sd-font:'Inter','SF Pro Text',system-ui,sans-serif;
    font-family:var(--sd-font); color:var(--sd-text); }
  .sd-light .sd-root { --sd-panel:rgba(255,255,255,0.92); --sd-panel-solid:#ffffff; --sd-border:rgba(30,40,55,0.16); --sd-text:#1d232b; --sd-muted:#5b6470;
    --sd-btn:rgba(20,30,45,0.03); --sd-btn-border:rgba(30,40,55,0.18); --sd-btn-hover:rgba(0,114,178,0.09); --sd-accent:#0072B2;
    --sd-active-bg:rgba(0,114,178,0.12); --sd-active-border:rgba(0,114,178,0.55); --sd-active-text:#004f7c; --sd-shadow:0 8px 28px rgba(20,30,45,0.14); }
  .sd-blueprint .sd-root { --sd-panel:rgba(8,33,57,.94); --sd-panel-solid:#082139; --sd-border:#4b7999; --sd-text:#e0f4ff; --sd-muted:#9cc3d8;
    --sd-btn:rgba(255,255,255,0.03); --sd-btn-border:#4b7999; --sd-active-bg:rgba(101,231,255,0.16); --sd-active-border:#65e7ff; --sd-active-text:#c9f6ff;
    --sd-shadow:none; --sd-radius:3px; --sd-btn-radius:2px; --sd-font:ui-monospace,SFMono-Regular,Consolas,monospace; }
  .sd-illustration .sd-root { --sd-radius:4px; --sd-btn-radius:3px; --sd-font:Helvetica,Arial,'Inter',sans-serif; }
  .sd-root button { font-family:inherit; }
  .sd-title { position:absolute; top:18px; left:22px; z-index:5; pointer-events:none; max-width:calc(100% - 320px); }
  .sd-title h1 { margin:0; font-size:17px; font-weight:650; letter-spacing:0.2px; }
  .sd-title .sd-sub { margin-top:4px; font-size:11px; color:var(--sd-muted); letter-spacing:0.4px; text-transform:uppercase; }
  .sd-fidelity { display:inline-block; margin-top:8px; padding:3px 8px; border-radius:99px; font-size:10px;
    background:var(--sd-active-bg); color:var(--sd-active-text); border:1px solid var(--sd-active-border); letter-spacing:0.5px; }
  .sd-title-actions { display:flex; gap:6px; margin-top:8px; pointer-events:auto; }
  .sd-toolbar { position:absolute; bottom:18px; left:50%; transform:translateX(-50%); z-index:6;
    display:flex; align-items:center; gap:6px; padding:8px 10px; border-radius:var(--sd-radius);
    background:var(--sd-panel); border:1px solid var(--sd-border); backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px);
    box-shadow:var(--sd-shadow); flex-wrap:nowrap; max-width:calc(100% - 32px); overflow-x:auto; overflow-y:hidden; scrollbar-width:thin; box-sizing:border-box; }
  .sd-group { display:flex; align-items:center; gap:4px; flex:0 0 auto; }
  .sd-segmented { display:flex; border:1px solid var(--sd-btn-border); border-radius:var(--sd-btn-radius); overflow:hidden; }
  .sd-segmented .sd-btn { border:0; border-radius:0; }
  .sd-segmented .sd-btn + .sd-btn { border-left:1px solid var(--sd-btn-border); }
  .sd-btn { appearance:none; border:1px solid var(--sd-btn-border); background:var(--sd-btn); color:var(--sd-text); font-size:11.5px; font-weight:550;
    padding:7px 10px; border-radius:var(--sd-btn-radius); cursor:pointer; transition:background .16s ease,border-color .16s ease; white-space:nowrap; letter-spacing:0.2px; line-height:1.15; }
  .sd-btn:hover { background:var(--sd-btn-hover); }
  .sd-btn:focus-visible, .sd-slider:focus-visible, .sd-tree input:focus-visible { outline:2px solid var(--sd-accent); outline-offset:1px; }
  .sd-btn.sd-active { background:var(--sd-active-bg); border-color:var(--sd-active-border); color:var(--sd-active-text); }
  .sd-btn.sd-small { padding:4px 8px; font-size:10.5px; }
  .sd-btn[hidden] { display:none; }
  .sd-sep { width:1px; height:22px; background:var(--sd-border); margin:0 4px; flex:0 0 auto; }
  .sd-slider-wrap { display:flex; align-items:center; gap:7px; padding:0 4px; }
  .sd-slider-wrap label { font-size:10px; color:var(--sd-muted); letter-spacing:0.6px; text-transform:uppercase; }
  .sd-slider { -webkit-appearance:none; appearance:none; width:110px; height:4px; border-radius:99px; background:var(--sd-btn-border); outline:none; }
  .sd-slider::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:15px; height:15px; border-radius:50%;
    background:var(--sd-accent); cursor:pointer; border:2px solid var(--sd-panel-solid); }
  .sd-menu { position:absolute; z-index:9; min-width:210px; padding:6px; border-radius:var(--sd-radius); background:var(--sd-panel-solid);
    border:1px solid var(--sd-border); box-shadow:var(--sd-shadow); display:none; pointer-events:auto; }
  .sd-menu.sd-open { display:block; }
  .sd-menu button { display:flex; width:100%; justify-content:space-between; gap:16px; text-align:left; background:none; border:0; color:var(--sd-text);
    font-size:12px; padding:7px 9px; border-radius:var(--sd-btn-radius); cursor:pointer; }
  .sd-menu button:hover, .sd-menu button:focus-visible { background:var(--sd-btn-hover); outline:none; }
  .sd-menu button span { color:var(--sd-muted); font-size:10.5px; }
  .sd-menu hr { border:0; border-top:1px solid var(--sd-border); margin:5px 2px; }
  .sd-panel { position:absolute; z-index:6; padding:14px 15px; border-radius:var(--sd-radius); background:var(--sd-panel); border:1px solid var(--sd-border);
    backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); box-shadow:var(--sd-shadow); pointer-events:auto; box-sizing:border-box; }
  .sd-inspect { top:18px; right:18px; width:262px; display:none; max-height:calc(100% - 140px); overflow:auto; }
  .sd-inspect h2 { margin:0 0 2px; font-size:13.5px; font-weight:650; padding-right:18px; }
  .sd-inspect .sd-id { font-size:10px; color:var(--sd-muted); font-family:ui-monospace,monospace; margin-bottom:9px; }
  .sd-inspect dl { margin:0; display:grid; grid-template-columns:auto 1fr; gap:4px 10px; }
  .sd-inspect dt { font-size:10px; color:var(--sd-muted); text-transform:uppercase; letter-spacing:0.5px; }
  .sd-inspect dd { margin:0; font-size:11px; font-family:ui-monospace,monospace; word-break:break-word; }
  .sd-inspect .sd-close { position:absolute; top:9px; right:10px; cursor:pointer; color:var(--sd-muted); font-size:14px; background:none; border:0; padding:2px 4px; }
  .sd-inspect .sd-chips { display:flex; flex-wrap:wrap; gap:4px; margin-top:8px; }
  .sd-inspect .sd-chips-label { font-size:10px; color:var(--sd-muted); text-transform:uppercase; letter-spacing:.5px; margin-top:10px; }
  .sd-inspect .sd-actions { display:flex; flex-wrap:wrap; gap:5px; margin-top:12px; }
  .sd-item-badge { display:inline-flex; align-items:center; justify-content:center; min-width:18px; height:18px; border-radius:9px; font-size:10.5px; font-weight:700;
    border:1px solid var(--sd-active-border); color:var(--sd-active-text); margin-right:6px; vertical-align:1px; }
  .sd-legend { bottom:86px; right:18px; padding:11px 13px; font-size:10.5px; max-width:220px; }
  .sd-legend h3, .sd-tree h3 { margin:0 0 6px; font-size:10px; text-transform:uppercase; letter-spacing:0.8px; color:var(--sd-muted); }
  .sd-legend .row { display:flex; align-items:center; gap:8px; padding:2px 0; }
  .sd-legend .sw { width:10px; height:10px; border-radius:3px; flex:0 0 auto; }
  .sd-tree { top:150px; left:18px; width:250px; max-height:calc(100% - 260px); display:none; flex-direction:column; padding:12px; }
  .sd-tree.sd-open { display:flex; }
  .sd-tree input { width:100%; box-sizing:border-box; padding:6px 8px; border-radius:var(--sd-btn-radius); border:1px solid var(--sd-btn-border); background:var(--sd-btn);
    color:var(--sd-text); font-size:11.5px; margin-bottom:8px; font-family:inherit; }
  .sd-tree ul { list-style:none; margin:0; padding:0; overflow:auto; flex:1 1 auto; }
  .sd-tree li { display:flex; align-items:center; gap:4px; font-size:11.5px; padding:3px 4px; border-radius:6px; cursor:pointer; }
  .sd-tree li:hover, .sd-tree li.sd-hover { background:var(--sd-btn-hover); }
  .sd-tree li.sd-selected { background:var(--sd-active-bg); color:var(--sd-active-text); }
  .sd-tree li.sd-hidden-part .sd-tree-label { opacity:.45; text-decoration:line-through; }
  .sd-tree li.sd-assembly { color:var(--sd-muted); font-size:10px; text-transform:uppercase; letter-spacing:.6px; cursor:default; margin-top:4px; }
  .sd-tree .sd-tree-label { flex:1 1 auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .sd-tree .sd-eye { background:none; border:0; color:var(--sd-muted); cursor:pointer; font-size:11px; padding:1px 4px; }
  .sd-tooltip { position:absolute; z-index:8; pointer-events:none; padding:6px 9px; border-radius:8px; background:var(--sd-panel-solid); border:1px solid var(--sd-border);
    font-size:11px; box-shadow:var(--sd-shadow); display:none; max-width:240px; }
  .sd-tooltip b { display:block; font-weight:650; }
  .sd-tooltip span { color:var(--sd-muted); font-size:10.5px; }
  .sd-tour { bottom:86px; left:50%; transform:translateX(-50%); width:min(560px,calc(100% - 300px)); min-width:260px; display:none; }
  .sd-tour.sd-open { display:block; }
  .sd-tour .sd-step { font-size:10px; color:var(--sd-muted); text-transform:uppercase; letter-spacing:.8px; }
  .sd-tour h2 { margin:3px 0 4px; font-size:14px; }
  .sd-tour p { margin:0; font-size:12px; line-height:1.45; color:var(--sd-text); opacity:.9; }
  .sd-tour .sd-tour-nav { display:flex; align-items:center; gap:6px; margin-top:10px; }
  .sd-tour .sd-dots { display:flex; gap:4px; flex:1 1 auto; }
  .sd-tour .sd-dot { width:7px; height:7px; border-radius:50%; background:var(--sd-btn-border); border:0; padding:0; cursor:pointer; }
  .sd-tour .sd-dot.sd-active { background:var(--sd-accent); }
  .sd-diff-legend { top:18px; left:50%; transform:translateX(-50%); display:none; align-items:center; gap:8px; padding:7px 10px; font-size:11px; }
  .sd-diff-legend.sd-open { display:flex; }
  .sd-diff-legend .sd-chip { padding:2px 7px; border-radius:99px; font-weight:600; }
  .sd-help { inset:0; margin:auto; width:min(440px,calc(100% - 40px)); height:fit-content; display:none; z-index:10; }
  .sd-help.sd-open { display:block; }
  .sd-help h2 { margin:0 0 10px; font-size:14px; }
  .sd-help dl { display:grid; grid-template-columns:auto 1fr; gap:5px 14px; margin:0; font-size:12px; }
  .sd-help dt { font-family:ui-monospace,monospace; color:var(--sd-active-text); }
  .sd-help dd { margin:0; }
  .sd-toast { position:absolute; top:62px; left:50%; transform:translateX(-50%); z-index:10; padding:9px 16px; border-radius:10px;
    background:rgba(20,120,160,0.94); color:#fff; font-size:12px; opacity:0; transition:opacity .3s; pointer-events:none; }
  .sd-toast.sd-show { opacity:1; }
  .sd-live { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
  @media (max-width: 900px) {
    .sd-title { max-width:calc(100% - 44px); }
    .sd-title h1 { font-size:14px; }
    .sd-slider-wrap label { display:none; }
    .sd-slider { width:80px; }
    .sd-inspect { width:220px; top:auto; bottom:86px; }
    .sd-legend { display:none; }
    .sd-tour { width:calc(100% - 32px); }
  }
  @media (prefers-reduced-motion: reduce) { .sd-btn, .sd-toast { transition:none; } }`;

  function mountStyles() {
    const existing = document.getElementById('sd-styles');
    if (existing) {existing.textContent = CSS;return;}
    const style = document.createElement('style');
    style.id = 'sd-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'className') node.className = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else node.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of children.flat()) if (child !== null && child !== undefined) node.append(child);
    return node;
  }

  function buildChrome(container, api) {
    mountStyles();
    const spec = api.spec, inter = spec.interactions || {};
    const enabled = value => !!value && (typeof value !== 'object' || value.enabled !== false);
    const explodeConfig = typeof inter.explode === 'object' ? inter.explode : {};
    const root = el('div', {className: 'sd-root', style: 'position:absolute;inset:0;pointer-events:none;'});
    container.appendChild(root);
    container.setAttribute('role', 'region');
    container.setAttribute('aria-label', `${spec.scene.title || spec.scene.id}: interactive ${spec.scene.type || 'technical'} diagram with ${(spec.assemblies || []).reduce((n, a) => n + (a.components || []).length, 0)} parts. Press ? for keyboard shortcuts.`);
    const safe = fn => (...args) => {try {Promise.resolve(fn(...args)).catch(e => api._toast?.(e.message));} catch (e) {api._toast?.(e.message);}};

    // ---- title
    const fid = spec.scene.fidelity || 'representative';
    const treeButton = enabled(inter.tree ?? true) ? el('button', {className: 'sd-btn sd-small', 'data-id': 'tree', title: 'Parts tree (P)', 'aria-expanded': 'false', onclick: () => api._toggleTree()}, 'Parts') : null;
    const helpButton = el('button', {className: 'sd-btn sd-small', 'data-id': 'help', title: 'Keyboard shortcuts (?)', 'aria-label': 'Keyboard shortcuts', onclick: () => api._toggleHelp()}, '?');
    const title = el('div', {className: 'sd-title'},
      el('h1', {}, spec.scene.title || spec.scene.id),
      el('div', {className: 'sd-sub'}, `${spec.scene.type || 'technical-assembly'} · ${spec.scene.units || 'mm'}`),
      el('div', {className: 'sd-fidelity'}, `${fid} fidelity`),
      el('div', {className: 'sd-title-actions'}, treeButton, helpButton));
    root.appendChild(title);

    // ---- toolbar
    const bar = el('div', {className: 'sd-toolbar', role: 'toolbar', 'aria-label': 'Diagram controls', style: 'pointer-events:auto'});
    const button = (label, id, onClick, extra = {}) => el('button', {className: 'sd-btn', type: 'button', 'data-id': id, onclick: safe(onClick), ...extra}, label);
    const sep = () => el('div', {className: 'sd-sep', 'aria-hidden': 'true'});

    bar.appendChild(el('div', {className: 'sd-group sd-segmented', role: 'group', 'aria-label': 'Render mode'},
      button('3D', 'render-webgl', () => api.setRenderMode('webgl'), {title: 'Shaded 3D (1)'}),
      button('Blueprint', 'render-blueprint', () => api.setRenderMode('blueprint'), {title: 'Isometric blueprint (2)'}),
      button('Illustration', 'render-illustration', () => api.setRenderMode('illustration'), {title: 'Publication line art (3)'})));

    if (enabled(inter.explode)) {
      bar.appendChild(sep());
      const group = el('div', {className: 'sd-group', role: 'group', 'aria-label': 'Explode'});
      group.appendChild(el('div', {className: 'sd-segmented'},
        button('Assembled', 'explode-assembled', () => api.explode(0, {duration: 1000}), {title: 'Assemble (E toggles)'}),
        button('Exploded', 'explode-exploded', () => api.explode(1, {duration: 1100}), {title: 'Explode (E toggles)'})));
      if (explodeConfig.slider !== false) {
        const listId = `sd-stops-${Math.random().toString(36).slice(2, 8)}`;
        const wrap = el('div', {className: 'sd-slider-wrap'}, el('label', {for: listId + '-input'}, 'Explode'),
          el('input', {className: 'sd-slider', id: listId + '-input', type: 'range', min: 0, max: 100, value: 0, 'aria-label': 'Explode amount', list: Array.isArray(explodeConfig.stops) ? listId : null}));
        if (Array.isArray(explodeConfig.stops)) wrap.appendChild(el('datalist', {id: listId}, explodeConfig.stops.map(stop => el('option', {value: Math.round(stop * 100)}))));
        const slider = wrap.querySelector('input');
        slider.addEventListener('input', () => api.explode(Number(slider.value) / 100, {immediate: true}));
        api._explodeSlider = slider;
        group.appendChild(wrap);
      }
      group.appendChild(button('Traces', 'traces', () => api.toggleMode('traces'), {title: 'Explode trace lines (T)'}));
      bar.appendChild(group);
    }

    const inspectButtons = [];
    if (inter.xray) inspectButtons.push(button('X-Ray', 'xray', () => api.toggleMode('xray'), {title: 'X-Ray (X)'}));
    if (enabled(inter.section)) inspectButtons.push(button('Section', 'section', () => api.toggleMode('section'), {title: 'Section with hatched caps (S)'}));
    if (inter.isolate) inspectButtons.push(button('Isolate', 'isolate', () => api.toggleMode('isolate'), {title: 'Isolate selection (I)'}));
    if (inter.ghost) inspectButtons.push(button('Ghost', 'ghost', () => api.toggleMode('ghost'), {title: 'Ghost context (G)'}));
    if (inter.flow) inspectButtons.push(button('Flow', 'flow', () => api.toggleMode('flow'), {title: 'Connector flow (O)', className: 'sd-btn' + (spec.connectors?.length ? ' sd-active' : '')}));
    if (inter.measure !== false) inspectButtons.push(button('Measure', 'measure', () => api.toggleMode('measure'), {title: 'Measure between two points (M)'}));
    if (inspectButtons.length) {bar.appendChild(sep());bar.appendChild(el('div', {className: 'sd-group', role: 'group', 'aria-label': 'Inspect'}, inspectButtons));}

    const storyButtons = [];
    if (spec.tour?.steps?.length) storyButtons.push(button('Tour', 'tour', () => api.tour.active && api.tour.kind === 'tour' ? api.tour.stop() : api.tour.start(), {title: 'Guided tour (← → to step)'}));
    if (enabled(inter.explode)) storyButtons.push(button('Steps', 'instructions', () => api.tour.active && api.tour.kind === 'instructions' ? api.tour.stop() : api.tour.start('instructions'), {title: 'Step-by-step assembly'}));
    bar.appendChild(sep());
    bar.appendChild(el('div', {className: 'sd-group'}, storyButtons, button('Reset View', 'reset', () => api.resetView(), {title: 'Reset view (R)'}),
      button('Export ▾', 'export', () => toggleMenu(), {'aria-haspopup': 'menu', 'aria-expanded': 'false'})));
    root.appendChild(bar);

    // ---- export menu
    const menu = el('div', {className: 'sd-menu', role: 'menu', 'aria-label': 'Export'});
    const item = (label, hint, id, onClick, extra = {}) => el('button', {type: 'button', role: 'menuitem', 'data-id': id, onclick: safe(async () => {closeMenus();await onClick();}), ...extra}, label, el('span', {}, hint));
    menu.append(
      item('PNG image', 'current view', 'png', () => api.exportPNG()),
      item('SVG vector', 'current view', 'svg', () => api.exportSVG(), {'data-vector-only': true}),
      item('Journal SVG', 'double column · 183 mm', 'svg-journal', () => api.exportSVG({figure: 'double-column'}), {'data-vector-only': true}),
      el('hr'),
      item('Assembled | exploded', 'figure', 'figure', () => api.exportComparison()),
      item('Drawing sheet', 'front · top · right · iso', 'sheet', () => api.exportSheet()),
      enabled(inter.explode) ? item('Assembly instructions', 'step panels', 'instructions-export', () => api.exportInstructions()) : null,
      item('Contact sheet', 'all states, one PNG', 'contact', () => api.exportContactSheet()),
      item('Turntable video', 'WebM', 'video', () => api.exportVideo({kind: 'turntable'})),
      el('hr'),
      item('Copy share link', 'view state', 'link', () => copyLink()),
      item('GLB model', 'glTF', 'glb', () => api.exportGLB()),
      item('Scene JSON', 'editable source', 'json', () => api.exportJSON()));
    root.appendChild(menu);
    const exportButton = bar.querySelector('[data-id="export"]');
    function toggleMenu(force) {
      const open = force ?? !menu.classList.contains('sd-open');
      menu.classList.toggle('sd-open', open);exportButton.setAttribute('aria-expanded', String(open));
      if (!open) return;
      const host = container.getBoundingClientRect(), b = exportButton.getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(host.width - 230, b.right - host.left - 220)) + 'px';
      menu.style.bottom = (host.bottom - b.top + 8) + 'px';
      menu.querySelector('button:not([hidden])')?.focus();
    }
    function closeMenus() {toggleMenu(false);}
    api._closeMenus = closeMenus;
    menu.addEventListener('keydown', event => {
      const items = [...menu.querySelectorAll('button:not([hidden])')], index = items.indexOf(document.activeElement);
      if (event.key === 'ArrowDown') {items[(index + 1) % items.length]?.focus();event.preventDefault();}
      else if (event.key === 'ArrowUp') {items[(index - 1 + items.length) % items.length]?.focus();event.preventDefault();}
      else if (event.key === 'Escape') {closeMenus();exportButton.focus();event.stopPropagation();}
    });
    const outside = event => {if (!menu.contains(event.target) && event.target !== exportButton) closeMenus();};
    document.addEventListener('pointerdown', outside, true);
    async function copyLink() {
      const url = api.shareURL();
      try {await navigator.clipboard.writeText(url);api._toast('Share link copied');}
      catch {window.prompt('Copy this link', url);}
    }

    // ---- inspect card
    const inspect = el('div', {className: 'sd-panel sd-inspect', role: 'dialog', 'aria-label': 'Part details'});
    root.appendChild(inspect);
    api._showInspect = info => {
      if (!info) {inspect.style.display = 'none';return;}
      inspect.style.display = 'block';
      const chips = (list, label) => list.length ? [el('div', {className: 'sd-chips-label'}, label), el('div', {className: 'sd-chips'}, list.map(c => el('button', {className: 'sd-btn sd-small', onclick: () => api.select(c.id)}, c.label)))] : [];
      inspect.replaceChildren(
        el('button', {className: 'sd-close', 'aria-label': 'Close', onclick: () => api.select(null)}, '✕'),
        el('h2', {}, info.item != null ? el('span', {className: 'sd-item-badge'}, String(info.item)) : null, info.label),
        el('div', {className: 'sd-id'}, `${info.id} · ${info.fidelity}${info.explodeOrder != null ? ' · explode order ' + info.explodeOrder : ''}`),
        el('dl', {}, Object.entries(info.properties || {}).flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, String(v))])),
        ...chips(info.parentLabel ? [{id: info.parent, label: info.parentLabel}] : [], 'Attached to'),
        ...chips(info.children || [], `Contains ${info.children?.length || 0}`),
        el('div', {className: 'sd-actions'},
          el('button', {className: 'sd-btn sd-small', onclick: () => api.focus(info.id)}, 'Focus'),
          inter.isolate ? el('button', {className: 'sd-btn sd-small', onclick: () => api.toggleMode('isolate')}, 'Isolate') : null,
          info.children?.length && enabled(inter.explode) ? el('button', {className: 'sd-btn sd-small', onclick: safe(() => api.explodeSubtree(info.id))}, 'Explode here') : null,
          el('button', {className: 'sd-btn sd-small', onclick: () => api.setComponentVisible(info.id, false)}, 'Hide')));
    };

    // ---- legend (annotation groups)
    const groups = [...new Set((spec.annotations || []).map(a => a.group).filter(Boolean))];
    if (groups.length > 1) {
      const paletteName = spec.scene.renderMode === 'illustration' ? (spec.scene.illustration?.palette || 'okabe-ito') : 'default';
      const colors = ANNOTATION_PALETTES[paletteName] || ANNOTATION_PALETTES.default;
      // A poster legend already lists every part, so the group toggles start folded away.
      const folded = spec.partsList?.style === 'legend';
      const header = el('h3', {style: 'cursor:pointer;margin-bottom:' + (folded ? '0' : '6px'), role: 'button', tabindex: 0, 'aria-expanded': String(!folded)}, (folded ? '▸ ' : '▾ ') + 'Label groups');
      const rows = el('div', {style: folded ? 'display:none' : ''}, groups.map((g, i) => el('div', {className: 'row'}, el('span', {className: 'sw', style: `background:${colors[i % colors.length]}`}),
        el('label', {style: 'cursor:pointer'}, el('input', {type: 'checkbox', checked: true, dataset: {group: g}}), ' ' + g))));
      const legend = el('div', {className: 'sd-panel sd-legend'}, header, rows);
      const toggle = () => {const open = rows.style.display === 'none';rows.style.display = open ? '' : 'none';header.textContent = (open ? '▾ ' : '▸ ') + 'Label groups';header.style.marginBottom = open ? '6px' : '0';header.setAttribute('aria-expanded', String(open));};
      header.addEventListener('click', toggle);header.addEventListener('keydown', e => {if (e.key === 'Enter' || e.key === ' ') {e.preventDefault();toggle();}});
      legend.addEventListener('change', e => {const t = e.target;if (t?.dataset?.group) api.setAnnotationGroup(t.dataset.group, t.checked);});
      root.appendChild(legend);
    }

    // ---- parts tree
    const tree = el('div', {className: 'sd-panel sd-tree', role: 'tree', 'aria-label': 'Parts'});
    const search = el('input', {type: 'search', placeholder: 'Filter parts…', 'aria-label': 'Filter parts'});
    const list = el('ul');
    tree.append(el('h3', {}, 'Parts'), search, list);
    root.appendChild(tree);
    const rows = new Map();
    function renderTree() {
      rows.clear();list.replaceChildren();
      const filter = search.value.trim().toLowerCase();
      const matches = node => !filter || node.label.toLowerCase().includes(filter) || node.id.toLowerCase().includes(filter) || node.children.some(matches);
      const walk = (nodes, depth) => {for (const node of nodes) {
        if (!matches(node)) continue;
        if (node.kind === 'assembly') {list.appendChild(el('li', {className: 'sd-assembly'}, node.label));walk(node.children, 0);continue;}
        const eye = el('button', {className: 'sd-eye', 'aria-label': `Toggle visibility of ${node.label}`, onclick: event => {event.stopPropagation();api.setComponentVisible(node.id, !api.getState().hidden.includes(node.id) ? false : true);}}, '◉');
        const row = el('li', {role: 'treeitem', tabindex: -1, style: `padding-left:${6 + depth * 12}px`, dataset: {componentId: node.id},
          onclick: () => api.select(node.id), ondblclick: () => api.focus(node.id),
          onpointerenter: () => api._hoverFromUI?.(node.id), onpointerleave: () => api._hoverFromUI?.(null)},
        el('span', {className: 'sd-tree-label', title: node.id}, node.label), eye);
        rows.set(node.id, row);list.appendChild(row);
        walk(node.children, depth + 1);
      }};
      walk(api.getTree(), 0);syncTree();
    }
    function syncTree() {
      if (!tree.classList.contains('sd-open')) return;
      const state = api.getState();
      for (const [id, row] of rows) {
        row.classList.toggle('sd-selected', state.modes.selected === id);
        row.classList.toggle('sd-hover', state.modes.hovered === id);
        row.classList.toggle('sd-hidden-part', state.hidden.includes(id));
        row.setAttribute('aria-selected', String(state.modes.selected === id));
        row.querySelector('.sd-eye').textContent = state.hidden.includes(id) ? '○' : '◉';
      }
      if (state.modes.selected && tree.classList.contains('sd-open')) rows.get(state.modes.selected)?.scrollIntoView({block: 'nearest'});
    }
    search.addEventListener('input', renderTree);
    api._syncTree = syncTree;
    api._toggleTree = force => {
      const open = force ?? !tree.classList.contains('sd-open');
      tree.classList.toggle('sd-open', open);treeButton?.classList.toggle('sd-active', open);treeButton?.setAttribute('aria-expanded', String(open));
      if (open) {const r = title.getBoundingClientRect(), host = container.getBoundingClientRect();tree.style.top = Math.round(r.bottom - host.top + 10) + 'px';renderTree();}
    };
    api._hoverFromUI = id => {api._setHover?.(id);};

    // ---- tooltip
    const tooltip = el('div', {className: 'sd-tooltip', role: 'tooltip'});
    root.appendChild(tooltip);
    api._tooltip = (info, x, y) => {
      if (!info) {tooltip.style.display = 'none';return;}
      const host = container.getBoundingClientRect(), props = info.properties || {};
      const detail = [props.partNumber, props.role !== '—' ? props.role : null, info.item != null ? `item ${info.item}` : null].filter(Boolean).join(' · ');
      tooltip.replaceChildren(el('b', {}, info.label), detail ? el('span', {}, detail) : null);
      tooltip.style.display = 'block';
      const left = Math.min(host.width - tooltip.offsetWidth - 8, x - host.left + 14), top = Math.max(8, y - host.top - tooltip.offsetHeight - 10);
      tooltip.style.left = left + 'px';tooltip.style.top = top + 'px';
    };

    // ---- tour captions
    const tourPanel = el('div', {className: 'sd-panel sd-tour', role: 'region', 'aria-live': 'polite', 'aria-label': 'Tour'});
    root.appendChild(tourPanel);
    api._showTour = state => {
      tourPanel.classList.toggle('sd-open', !!state.active);
      for (const id of ['tour', 'instructions']) bar.querySelector(`[data-id="${id}"]`)?.classList.toggle('sd-active', state.active && state.kind === id);
      if (!state.active) return;
      const step = state.steps[state.index];
      tourPanel.replaceChildren(
        el('div', {className: 'sd-step'}, `${state.kind === 'instructions' ? 'Assembly step' : 'Step'} ${state.index + 1} / ${state.steps.length}`),
        el('h2', {}, step.title), step.caption ? el('p', {}, step.caption) : null,
        el('div', {className: 'sd-tour-nav'},
          el('button', {className: 'sd-btn sd-small', 'aria-label': 'Previous step', disabled: state.index === 0, onclick: () => api.tour.prev()}, '‹ Prev'),
          el('div', {className: 'sd-dots'}, state.steps.map((s, i) => el('button', {className: 'sd-dot' + (i === state.index ? ' sd-active' : ''), 'aria-label': `Go to step ${i + 1}: ${s.title}`, onclick: () => api.tour.goTo(i)}))),
          el('button', {className: 'sd-btn sd-small', 'aria-label': 'Next step', disabled: state.index === state.steps.length - 1 && !spec.tour?.loop, onclick: () => api.tour.next()}, 'Next ›'),
          el('button', {className: 'sd-btn sd-small', 'aria-label': 'Exit tour', onclick: () => api.tour.stop()}, 'Exit')));
    };

    // ---- diff legend
    const diffLegend = el('div', {className: 'sd-panel sd-diff-legend', role: 'status'});
    root.appendChild(diffLegend);
    api._showDiff = diff => {
      diffLegend.classList.toggle('sd-open', !!diff);
      if (!diff) return;
      const s = diff.summary, chip = (text, color) => el('span', {className: 'sd-chip', style: `background:${color}22;color:${color};border:1px solid ${color}88`}, text);
      diffLegend.replaceChildren(el('b', {}, `Diff vs ${diff.from || 'previous'}`), chip(`+${s.added} added`, '#22c55e'), chip(`−${s.removed} removed`, '#ef4444'),
        chip(`${s.moved} moved`, '#f59e0b'), chip(`${s.changed} changed`, '#f59e0b'), el('button', {className: 'sd-btn sd-small', onclick: () => api.clearDiff()}, 'Clear'));
    };

    // ---- help
    const shortcuts = [['1 / 2 / 3', '3D · Blueprint · Illustration'], ['E', 'Toggle assembled / exploded'], ['double-click', 'Explode that sub-assembly'], ['T', 'Explode trace lines'],
      ['X S I G O', 'X-Ray · Section · Isolate · Ghost · Flow'], ['M', 'Measure (two clicks)'], ['F', 'Focus selection'], ['[ ]', 'Previous / next part'], ['P', 'Parts tree'],
      ['← →', 'Tour steps'], ['R', 'Reset view'], ['Esc', 'Clear selection · exit tour']];
    const help = el('div', {className: 'sd-panel sd-help', role: 'dialog', 'aria-label': 'Keyboard shortcuts'},
      el('h2', {}, 'Keyboard shortcuts'), el('dl', {}, shortcuts.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])),
      el('div', {style: 'margin-top:12px'}, el('button', {className: 'sd-btn sd-small', onclick: () => api._toggleHelp(false)}, 'Close')));
    root.appendChild(help);
    api._toggleHelp = force => {help.classList.toggle('sd-open', force ?? !help.classList.contains('sd-open'));};

    // ---- toast + live region
    const toast = el('div', {className: 'sd-toast', role: 'status'});
    const live = el('div', {className: 'sd-live', 'aria-live': 'polite'});
    root.append(toast, live);
    let toastTimer = null;
    api._toast = msg => {
      toast.textContent = msg;toast.classList.add('sd-show');live.textContent = msg;
      clearTimeout(toastTimer);toastTimer = setTimeout(() => toast.classList.remove('sd-show'), 2600);
    };
    api._announce = msg => {live.textContent = msg;};

    return {root, title, inspect, bar, toast, menu, sync: syncTree,
      dispose() {clearTimeout(toastTimer);document.removeEventListener('pointerdown', outside, true);root.remove();}};
  }

  return {buildChrome, mountStyles};
}
