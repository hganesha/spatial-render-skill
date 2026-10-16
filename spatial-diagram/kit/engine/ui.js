// ui.js — in-page chrome: title plate, toolbar, inspect card, export menu.

export function createUISystem() {

  const CSS = `
  .sd-root { font-family: 'Inter','SF Pro Text',system-ui,sans-serif; color: #e8eef6; }
  .sd-title { position:absolute; top:18px; left:22px; z-index:5; pointer-events:none; }
  .sd-title h1 { margin:0; font-size:17px; font-weight:650; letter-spacing:0.2px; }
  .sd-title .sd-sub { margin-top:4px; font-size:11px; color:#9db2c8; letter-spacing:0.4px; text-transform:uppercase; }
  .sd-fidelity { display:inline-block; margin-top:8px; padding:3px 8px; border-radius:99px; font-size:10px;
    background:rgba(60,224,255,0.12); color:#8fe9ff; border:1px solid rgba(60,224,255,0.3); letter-spacing:0.5px; }
  .sd-toolbar { position:absolute; bottom:18px; left:50%; transform:translateX(-50%); z-index:6;
    display:flex; align-items:center; gap:8px; padding:9px 12px; border-radius:14px;
    background:rgba(10,16,26,0.78); border:1px solid rgba(120,160,210,0.22);
    backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
    box-shadow:0 12px 40px rgba(0,0,0,0.45); flex-wrap:wrap; max-width:calc(100% - 32px); }
  .sd-btn { appearance:none; border:1px solid rgba(130,170,220,0.24); background:rgba(255,255,255,0.04);
    color:#dfe9f5; font-size:11.5px; font-weight:550; padding:7px 11px; border-radius:9px; cursor:pointer;
    transition:all .16s ease; white-space:nowrap; letter-spacing:0.2px; }
  .sd-btn:hover { background:rgba(120,180,255,0.14); border-color:rgba(130,190,255,0.4); }
  .sd-btn.sd-active { background:rgba(60,224,255,0.18); border-color:rgba(60,224,255,0.55); color:#b8f1ff; }
  .sd-sep { width:1px; height:22px; background:rgba(140,175,215,0.2); margin:0 3px; }
  .sd-slider-wrap { display:flex; align-items:center; gap:8px; padding:0 6px; }
  .sd-slider-wrap label { font-size:10px; color:#9db2c8; letter-spacing:0.6px; text-transform:uppercase; }
  .sd-slider { -webkit-appearance:none; appearance:none; width:120px; height:4px; border-radius:99px;
    background:rgba(140,180,230,0.25); outline:none; }
  .sd-slider::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:15px; height:15px; border-radius:50%;
    background:#3ce0ff; cursor:pointer; border:2px solid #0b1622; box-shadow:0 2px 8px rgba(60,224,255,0.5); }
  .sd-inspect { position:absolute; top:18px; right:18px; z-index:6; width:252px; padding:14px 15px;
    border-radius:14px; background:rgba(10,16,26,0.82); border:1px solid rgba(120,160,210,0.22);
    backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); box-shadow:0 12px 40px rgba(0,0,0,0.45);
    display:none; pointer-events:auto; }
  .sd-inspect h2 { margin:0 0 2px; font-size:13.5px; font-weight:650; }
  .sd-inspect .sd-id { font-size:10px; color:#7fa4c8; font-family:ui-monospace,monospace; margin-bottom:9px; }
  .sd-inspect dl { margin:0; display:grid; grid-template-columns:auto 1fr; gap:4px 10px; }
  .sd-inspect dt { font-size:10px; color:#8fa8c0; text-transform:uppercase; letter-spacing:0.5px; }
  .sd-inspect dd { margin:0; font-size:11px; color:#e0eaf5; font-family:ui-monospace,monospace; word-break:break-word; }
  .sd-inspect .sd-close { position:absolute; top:10px; right:12px; cursor:pointer; color:#7fa4c8; font-size:14px; }
  .sd-legend { position:absolute; bottom:86px; right:18px; z-index:5; padding:11px 13px; border-radius:12px;
    background:rgba(10,16,26,0.7); border:1px solid rgba(120,160,210,0.18); font-size:10.5px; color:#b8cbe0;
    backdrop-filter:blur(10px); max-width:220px; }
  .sd-legend h3 { margin:0 0 6px; font-size:10px; text-transform:uppercase; letter-spacing:0.8px; color:#8fb4d8; }
  .sd-legend .row { display:flex; align-items:center; gap:8px; padding:2px 0; }
  .sd-legend .sw { width:10px; height:10px; border-radius:3px; flex:0 0 auto; }
  .sd-toast { position:absolute; top:18px; left:50%; transform:translateX(-50%); z-index:10;
    padding:9px 16px; border-radius:10px; background:rgba(20,120,160,0.92); font-size:12px;
    opacity:0; transition:opacity .3s; pointer-events:none; }
  .sd-toast.sd-show { opacity:1; }
  .sd-blueprint .sd-title, .sd-blueprint .sd-btn, .sd-blueprint .sd-sub {font-family:ui-monospace,SFMono-Regular,Consolas,monospace;}
  .sd-blueprint .sd-toolbar, .sd-blueprint .sd-inspect, .sd-blueprint .sd-legend {border-radius:3px;background:rgba(8,33,57,.94);border-color:#4b7999;box-shadow:none;}
  .sd-blueprint .sd-btn {border-radius:2px;}
  .sd-blueprint .sd-fidelity {border-radius:2px;color:#b7dfef;}
  @media (max-width: 720px) {
    .sd-inspect { width: 200px; }
    .sd-title h1 { font-size:14px; }
    .sd-slider { width:80px; }
  }`;

  function mountStyles() {
    if (document.getElementById('sd-styles')) return;
    const style = document.createElement('style');
    style.id = 'sd-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function buildChrome(container, api) {
    mountStyles();
    const root = document.createElement('div');
    root.className = 'sd-root';
    root.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    container.appendChild(root);

    // title
    const title = document.createElement('div');
    title.className = 'sd-title';
    const fid = api.spec.scene.fidelity || 'representative';
    title.innerHTML = `
      <h1>${escapeHtml(api.spec.scene.title || api.spec.scene.id)}</h1>
      <div class="sd-sub">${escapeHtml(api.spec.scene.type || 'technical-assembly')} · ${escapeHtml(api.spec.scene.units || 'mm')}</div>
      <div class="sd-fidelity">${escapeHtml(fid)} fidelity</div>`;
    root.appendChild(title);

    // inspect card
    const inspect = document.createElement('div');
    inspect.className = 'sd-inspect';
    inspect.innerHTML = `<div class="sd-close">✕</div><h2></h2><div class="sd-id"></div><dl></dl>`;
    inspect.querySelector('.sd-close').addEventListener('click', () => api.select(null));
    root.appendChild(inspect);

    // toolbar
    const bar = document.createElement('div');
    bar.className = 'sd-toolbar';
    bar.style.pointerEvents = 'auto';
    const inter = api.spec.interactions || {};
    const buttons = [];
    function btn(label, id, onClick, active) {
      const b = document.createElement('button');
      b.className = 'sd-btn' + (active ? ' sd-active' : '');
      b.textContent = label;
      b.dataset.id = id;
      b.addEventListener('click', () => {
        try { Promise.resolve(onClick(b)).catch(e => api._toast?.(e.message)); } catch(e) {api._toast?.(e.message);}
      });
      bar.appendChild(b);
      buttons.push(b);
      return b;
    }

    btn('3D', 'render-webgl', () => api.setRenderMode('webgl'));
    btn('Blueprint', 'render-blueprint', () => api.setRenderMode('blueprint'));
    const enabled = value => !!value && (typeof value !== 'object' || value.enabled !== false);
    if (enabled(inter.explode) && (typeof inter.explode !== 'object' || inter.explode.slider !== false)) {
      const wrap = document.createElement('div');
      wrap.className = 'sd-slider-wrap';
      wrap.innerHTML = `<label>Explode</label><input class="sd-slider" type="range" min="0" max="100" value="0">`;
      bar.appendChild(wrap);
      const slider = wrap.querySelector('input');
      slider.addEventListener('input', () => api.explode(Number(slider.value) / 100, { immediate: true }));
      api._explodeSlider = slider;
    }
    if (enabled(inter.explode)) btn('Auto', 'auto-explode', (b) => api.autoExplode(b));
    const sep1 = document.createElement('div'); sep1.className = 'sd-sep'; bar.appendChild(sep1);
    if (inter.xray) btn('X-Ray', 'xray', (b) => api.toggleMode('xray', b));
    if (enabled(inter.section)) btn('Section', 'section', (b) => api.toggleMode('section', b));
    if (inter.isolate) btn('Isolate', 'isolate', (b) => api.toggleMode('isolate', b));
    if (inter.ghost) btn('Ghost', 'ghost', (b) => api.toggleMode('ghost', b));
    if (inter.flow) btn('Flow', 'flow', (b) => api.toggleMode('flow', b), api.spec.connectors && api.spec.connectors.length > 0);
    const sep2 = document.createElement('div'); sep2.className = 'sd-sep'; bar.appendChild(sep2);
    btn('Reset View', 'reset', () => api.resetView());
    btn('PNG', 'png', () => api.exportPNG());
    btn('SVG', 'svg', () => api.exportSVG());
    btn('GLB', 'glb', () => api.exportGLB());
    btn('JSON', 'json', () => api.exportJSON());
    root.appendChild(bar);

    // legend (annotation groups)
    const groups = [...new Set((api.spec.annotations || []).map((a) => a.group).filter(Boolean))];
    if (groups.length > 1) {
      const legend = document.createElement('div');
      legend.className = 'sd-legend';
      legend.style.pointerEvents = 'auto';
      const colors = ['#3ce0ff', '#ffb35c', '#8ef0c8', '#d8a8ff', '#ff8e7a'];
      legend.innerHTML = `<h3>Annotations</h3>` + groups.map((g, i) =>
        `<div class="row"><span class="sw" style="background:${colors[i % colors.length]}"></span><label style="cursor:pointer"><input type="checkbox" checked data-group="${escapeHtml(g)}"> ${escapeHtml(g)}</label></div>`
      ).join('');
      legend.addEventListener('change', (e) => {
        const t = e.target;
        if (t && t.dataset && t.dataset.group) api.setAnnotationGroup(t.dataset.group, t.checked);
      });
      root.appendChild(legend);
    }

    const toast = document.createElement('div');
    toast.className = 'sd-toast';
    root.appendChild(toast);
    let toastTimer = null;
    api._toast = (msg) => {
      toast.textContent = msg;
      toast.classList.add('sd-show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('sd-show'), 2600);
    };

    api._showInspect = (info) => {
      if (!info) { inspect.style.display = 'none'; return; }
      inspect.style.display = 'block';
      inspect.querySelector('h2').textContent = info.label || info.id;
      inspect.querySelector('.sd-id').textContent = info.id + (info.fidelity ? ` · ${info.fidelity}` : '');
      const dl = inspect.querySelector('dl');
      dl.innerHTML = Object.entries(info.properties || {}).map(([k, v]) =>
        `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd>`).join('');
    };

    return { root, title, inspect, bar, toast, dispose() {clearTimeout(toastTimer);root.remove();} };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  return { buildChrome, mountStyles };
}
