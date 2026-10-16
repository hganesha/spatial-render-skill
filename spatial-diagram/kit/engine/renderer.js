// renderer.js — WebGL renderer, cameras, lighting, ground, and the frame loop.

export function createRendererSystem(THREE) {

  const STYLE_BACKGROUNDS = {
    'precision-editorial': { top: '#0a0f18', bottom: '#121c2c', ground: '#0c1420', grid: '#22344c', accent: '#3ce0ff' },
    'blueprint': { top: '#0b1c3a', bottom: '#122b55', ground: '#0c2044', grid: '#3a5c8f', accent: '#7fd4ff' },
    'studio-light': { top: '#f2f4f8', bottom: '#dfe4ec', ground: '#e8ecf2', grid: '#c3ccd8', accent: '#2a72c8' },
    'schematic': { top: '#101418', bottom: '#182028', ground: '#141b22', grid: '#2c3a48', accent: '#8ef0c8' },
    'holographic': { top: '#05060d', bottom: '#0a1428', ground: '#081020', grid: '#1c3355', accent: '#54e0ff' }
  };

  function createBackgroundTexture(THREE, style, override) {
    const st = STYLE_BACKGROUNDS[style] || STYLE_BACKGROUNDS['precision-editorial'];
    const top = override && override.top ? override.top : st.top;
    const bottom = override && override.bottom ? override.bottom : (typeof override === 'string' ? override : st.bottom);
    const c = document.createElement('canvas');
    c.width = 8; c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, 8, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function createStage(container, spec) {
    const sceneCfg = spec.scene || {};
    const style = sceneCfg.style || 'precision-editorial';
    const st = STYLE_BACKGROUNDS[style] || STYLE_BACKGROUNDS['precision-editorial'];

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const initW = container.clientWidth || 960, initH = container.clientHeight || 600;
    renderer.setSize(initW, initH);
    renderer.shadowMap.enabled = sceneCfg.ground?.shadows !== false;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    const env = sceneCfg.environment || {};
    renderer.toneMapping = env.toneMapping === 'linear' ? THREE.LinearToneMapping
      : env.toneMapping === 'reinhard' ? THREE.ReinhardToneMapping
        : env.toneMapping === 'cineon' ? THREE.CineonToneMapping
          : THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = env.exposure != null ? env.exposure : 0.92;
    renderer.localClippingEnabled = true;
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:0;display:block;touch-action:none;';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = createBackgroundTexture(THREE, style, sceneCfg.background);

    // ---- lighting
    const lighting = sceneCfg.lighting || 'studio';
    const key = new THREE.DirectionalLight(0xffffff, lighting === 'flat' ? 0.85 : 1.05);
    key.position.set(120, 180, 140);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 10;
    key.shadow.camera.far = 900;
    key.shadow.bias = -0.0008;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xbcd4ff, lighting === 'dramatic' ? 0.22 : 0.5);
    fill.position.set(-140, 80, -90);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffd9a8, lighting === 'dramatic' ? 0.75 : 0.34);
    rim.position.set(-60, 40, -180);
    scene.add(rim);

    const hemi = new THREE.HemisphereLight(0x8fb4e8, 0x14202e, lighting === 'flat' ? 0.85 : 0.55);
    scene.add(hemi);

    if (lighting === 'technical') {
      const gridLight = new THREE.DirectionalLight(0x9fd8ff, 0.4);
      gridLight.position.set(0, 220, 0);
      scene.add(gridLight);
    }

    // ---- ground
    const groundCfg = sceneCfg.ground || {};
    const groundGroup = new THREE.Group();
    scene.add(groundGroup);
    let grid = null, shadowPlane = null;
    if (groundCfg.enabled !== false) {
      const gColor = groundCfg.color || st.ground;
      shadowPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(4000, 4000),
        new THREE.ShadowMaterial({ opacity: 0.34 })
      );
      shadowPlane.rotation.x = -Math.PI / 2;
      shadowPlane.receiveShadow = true;
      groundGroup.add(shadowPlane);

      if (groundCfg.grid !== false) {
        grid = new THREE.GridHelper(2000, 80, new THREE.Color(st.grid), new THREE.Color(st.grid));
        grid.material.transparent = true;
        grid.material.opacity = 0.22;
        groundGroup.add(grid);
      }
    }

    // ---- cameras
    let camera;
    const camCfg = spec.scene.camera || {};
    const aspect = initW / Math.max(1, initH);
    if (camCfg.projection === 'orthographic') {
      const h = 120;
      camera = new THREE.OrthographicCamera(-h * aspect / 2, h * aspect / 2, h / 2, -h / 2, -5000, 10000);
    } else {
      camera = new THREE.PerspectiveCamera(camCfg.fov || 38, aspect, 1, 12000);
    }

    let lastWidth=initW,lastHeight=initH,lastDpr=Math.min(window.devicePixelRatio || 1,2);
    function resize(width, height) {
      const w = width || container.clientWidth, h = height || container.clientHeight;
      if (!w || !h) return false;
      const dpr=Math.min(window.devicePixelRatio || 1,2);
      if (w===lastWidth && h===lastHeight && dpr===lastDpr) return false;
      if (dpr!==lastDpr) renderer.setPixelRatio(dpr);
      lastWidth=w;lastHeight=h;lastDpr=dpr;
      renderer.setSize(w,h);
      camera.aspect = w / h;
      if (camera.isPerspectiveCamera) camera.updateProjectionMatrix();
      else {
        const hh = camera.top - camera.bottom;
        camera.left = -hh * (w / h) / 2;
        camera.right = hh * (w / h) / 2;
        camera.updateProjectionMatrix();
      }
      return true;
    }

    function frameBounds(box, padding) {
      if (!box) return;
      const center = box.getCenter(new THREE.Vector3());
      const radius = box.getSize(new THREE.Vector3()).length() / 2 || 50;
      if (camera.isPerspectiveCamera) {
        const fov = (camera.fov || 38) * Math.PI / 180;
        const halfAngle = Math.min(fov/2,Math.atan(Math.tan(fov/2)*camera.aspect));
        const dist = radius / Math.sin(halfAngle) * (padding || 1.22);
        return { target: center.toArray(), distance: dist };
      }
      const inverse=camera.quaternion.clone().invert(),projected=new THREE.Box3();
      for(const x of [box.min.x,box.max.x]) for(const y of [box.min.y,box.max.y]) for(const z of [box.min.z,box.max.z])
        projected.expandByPoint(new THREE.Vector3(x,y,z).sub(center).applyQuaternion(inverse));
      const size=projected.getSize(new THREE.Vector3());
      camera.zoom=Math.min((camera.right-camera.left)/Math.max(size.x,.001),(camera.top-camera.bottom)/Math.max(size.y,.001))/(padding || 1.22);
      camera.updateProjectionMatrix();
      return { target: center.toArray(), distance: radius * 3 };
    }

    function fitShadowCamera(box) {
      if (!box) return;
      const radius = box.getSize(new THREE.Vector3()).length() / 2 || 100;
      const cam = key.shadow.camera;
      cam.left = -radius * 1.4; cam.right = radius * 1.4;
      cam.top = radius * 1.4; cam.bottom = -radius * 1.4;
      cam.near = 1; cam.far = radius * 6 + 400;
      cam.updateProjectionMatrix();
      key.position.set(radius * 1.1, radius * 1.8, radius * 1.3);
    }

    function setGroundY(y) {
      if (shadowPlane) shadowPlane.position.y = y;
      if (grid) grid.position.y = y + 0.02;
    }

    return {
      renderer, scene, get camera() {return camera;}, key, groundGroup, grid,
      setProjection(projection) {
        if ((projection==='orthographic')===!!camera.isOrthographicCamera) return;
        const previous=camera,aspect=lastWidth/lastHeight;
        camera=projection==='orthographic'
          ? new THREE.OrthographicCamera(-60*aspect,60*aspect,60,-60,-5000,10000)
          : new THREE.PerspectiveCamera(camCfg.fov || 38,aspect,1,12000);
        camera.position.copy(previous.position);camera.quaternion.copy(previous.quaternion);
        camera.updateMatrixWorld();
      },
      resize, frameBounds, fitShadowCamera, setGroundY,
      styleColors: st,
      render() { renderer.render(scene, camera); },
      dispose() {
        scene.background?.dispose();
        groundGroup.traverse(o=>{o.geometry?.dispose();if(o.material) [].concat(o.material).forEach(m=>m.dispose());});
        key.shadow.map?.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      }
    };
  }

  return { createStage, createBackgroundTexture, STYLE_BACKGROUNDS };
}
