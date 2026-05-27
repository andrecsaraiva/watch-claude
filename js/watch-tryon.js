const WATCH_MODEL_PATH = './assets/models/relogio-tryon.glb';
const HAND_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const HDR_ENV_PATH = './assets/hdr/glasshouse_interior_4k_blur_exp_sat.hdr';

const videoEl = document.getElementById('camera-video');
const threeCanvas = document.getElementById('three-canvas');
const debugCanvas = document.getElementById('debug-canvas');
const stageEl = document.getElementById('stage');

const startCameraBtn = document.getElementById('start-camera-btn');
const switchCameraBtn = document.getElementById('switch-camera-btn');
const toggleDebugBtn = document.getElementById('toggle-debug-btn');
const copyLogBtn = document.getElementById('copy-log-btn');
const clearLogBtn = document.getElementById('clear-log-btn');

const watchScaleSlider = document.getElementById('watch-scale-slider');
const rotationOffsetSlider = document.getElementById('rotation-offset-slider');
const wristOffsetSlider = document.getElementById('wrist-offset-slider');

const watchScaleOutput = document.getElementById('watch-scale-output');
const rotationOffsetOutput = document.getElementById('rotation-offset-output');
const wristOffsetOutput = document.getElementById('wrist-offset-output');

const statusPill = document.getElementById('status-pill');
const hintText = document.getElementById('hint-text');
const centerCta = document.getElementById('center-cta');
const debugLog = document.getElementById('debug-log');

const metricDelegate = document.getElementById('metric-delegate');
const metricCamera = document.getElementById('metric-camera');
const metricVideo = document.getElementById('metric-video');
const metricDetections = document.getElementById('metric-detections');
const metricLastHand = document.getElementById('metric-last-hand');

const CONFIG = {
  facingMode: 'environment',
  modelScaleTrim: 1.25,
  rollTrimDeg: 20,
  wristOffsetTrim: 0.5,
  autoScaleFactor: 1.02,
  keepVisibleMisses: 12,
  hideAfterMisses: 24,
  minScalePx: 0,
  maxScalePx: 300,
  rotSlerpStable: 0.20,
  rotSlerpFast: 0.34,
  posAlphaStable: 0.22,
  posAlphaFast: 0.34,
  scaleAlpha: 0.10,
  sideCompMin: 0.40, // stronger compensation so the watch shrinks less at 90°
  envMapIntensity: 1.0,
};

const state = {
  stream: null,
  animationHandle: 0,
  debug: false,
  libs: null,
  handLandmarker: null,
  delegate: '—',
  modelLoaded: false,
  modelRoot: null,
  modelSize: null,
  modelRefSize: 0.05,
  renderer: null,
  scene: null,
  camera: null,
  pmremGenerator: null,
  lastVideoTime: -1,
  lastDetectionTime: 0,
  detections: 0,
  lastHandText: '—',
  misses: 0,
  pose: null,
  targetQuat: null,
  correctionQuat: null,
  tmpQuat: null,
  tmpMat4: null,
  started: false,
  mirrorPreview: false,
  logLines: [],
  widthHistory: [],
  scaleWidthHistory: [],
};

watchScaleOutput.textContent = Number(watchScaleSlider.value).toFixed(2);
rotationOffsetOutput.textContent = `${rotationOffsetSlider.value}°`;
wristOffsetOutput.textContent = Number(wristOffsetSlider.value).toFixed(2);
metricDetections.textContent = '0';

watchScaleSlider.addEventListener('input', () => {
  CONFIG.modelScaleTrim = Number(watchScaleSlider.value);
  watchScaleOutput.textContent = CONFIG.modelScaleTrim.toFixed(2);
});
rotationOffsetSlider.addEventListener('input', () => {
  CONFIG.rollTrimDeg = Number(rotationOffsetSlider.value);
  rotationOffsetOutput.textContent = `${CONFIG.rollTrimDeg}°`;
});
wristOffsetSlider.addEventListener('input', () => {
  CONFIG.wristOffsetTrim = Number(wristOffsetSlider.value);
  wristOffsetOutput.textContent = CONFIG.wristOffsetTrim.toFixed(2);
});

toggleDebugBtn.addEventListener('click', () => {
  state.debug = !state.debug;
  debugCanvas.hidden = !state.debug;
  toggleDebugBtn.textContent = state.debug ? 'Hide Landmarks' : 'Show Landmarks';
  logLine(`Debug landmarks: ${state.debug ? 'ON' : 'OFF'}`);
});

copyLogBtn?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(state.logLines.join('\n'));
    logLine('Log copied to clipboard.');
  } catch (error) {
    logLine(`Copy failed: ${error?.message || error}`);
  }
});

clearLogBtn?.addEventListener('click', () => {
  state.logLines = [];
  renderLog();
  logLine('Log cleared.');
});

switchCameraBtn.addEventListener('click', async () => {
  CONFIG.facingMode = CONFIG.facingMode === 'user' ? 'environment' : 'user';
  try {
    await startCamera();
  } catch (error) {
    logLine(`Switch camera failed: ${error?.message || error}`);
    setStatus('Could not switch camera');
    setHint(error?.message || 'Camera switch failed.');
  }
});

startCameraBtn.addEventListener('click', async () => {
  try {
    await startCamera();
  } catch (error) {
    logLine(`Start camera failed: ${error?.message || error}`);
    setStatus('Could not start camera');
    setHint(error?.message || 'Camera start failed.');
  }
});

window.addEventListener('resize', resizeStage);
window.addEventListener('error', (event) => {
  logLine(`window.error: ${event.message} @ ${event.filename}:${event.lineno}`);
});
window.addEventListener('unhandledrejection', (event) => {
  logLine(`unhandledrejection: ${event.reason?.message || event.reason || 'unknown reason'}`);
});

setStatus('Preparing try-on…');
setHint('Loading camera and tracking.');
logLine(`Secure context: ${window.isSecureContext}`);
logLine(`User agent: ${navigator.userAgent}`);

boot().catch((error) => {
  logLine(`Boot failed: ${error?.message || error}`);
  setStatus('Try-on failed to load');
  setHint(error?.message || 'Boot failed.');
});

async function boot() {
  logLine('Boot start.');
  const [
    THREE,
    { GLTFLoader },
    { RGBELoader },
    visionBundle,
  ] = await Promise.all([
    import('https://esm.sh/three@0.174.0'),
    import('https://esm.sh/three@0.174.0/examples/jsm/loaders/GLTFLoader'),
    import('https://esm.sh/three@0.174.0/examples/jsm/loaders/RGBELoader'),
    import('https://unpkg.com/@mediapipe/tasks-vision@0.10.34/vision_bundle.mjs'),
  ]);

  state.libs = {
    THREE,
    GLTFLoader,
    RGBELoader,
    FilesetResolver: visionBundle.FilesetResolver,
    HandLandmarker: visionBundle.HandLandmarker,
  };

  state.targetQuat = new THREE.Quaternion();
  state.tmpQuat = new THREE.Quaternion();
  state.tmpMat4 = new THREE.Matrix4();
  state.correctionQuat = new THREE.Quaternion();

  setupThree();
  await loadEnvironment();
  await loadWatchModel();
  await initHandLandmarker();

  setStatus('Ready');
  setHint('Tap Start Try-On or wait for camera to start.');
  logLine('Boot finished.');

  try {
    await startCamera();
  } catch (error) {
    logLine(`Auto camera start failed: ${error?.message || error}`);
    setStatus('Ready');
    setHint('Tap Start Try-On to continue.');
  }
}

async function initHandLandmarker() {
  logLine('Loading MediaPipe hand tracker.');
  const vision = await state.libs.FilesetResolver.forVisionTasks(
    'https://unpkg.com/@mediapipe/tasks-vision@0.10.34/wasm'
  );

  try {
    state.handLandmarker = await state.libs.HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: HAND_MODEL_URL,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: 0.45,
      minHandPresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
    });
    state.delegate = 'GPU';
    metricDelegate.textContent = 'GPU';
    logLine('Hand tracker initialized with GPU.');
  } catch (gpuError) {
    logLine(`GPU delegate failed: ${gpuError?.message || gpuError}`);
    state.handLandmarker = await state.libs.HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: HAND_MODEL_URL,
        delegate: 'CPU',
      },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: 0.45,
      minHandPresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
    });
    state.delegate = 'CPU';
    metricDelegate.textContent = 'CPU';
    logLine('Hand tracker initialized with CPU fallback.');
  }
}

function setupThree() {
  const THREE = state.libs.THREE;
  state.renderer = new THREE.WebGLRenderer({
    canvas: threeCanvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  state.scene = new THREE.Scene();
  state.pmremGenerator = new THREE.PMREMGenerator(state.renderer);
  state.camera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 2000);
  state.camera.position.z = 1000;

  const ambient = new THREE.AmbientLight(0xffffff, 0.95);
  state.scene.add(ambient);

  const key = new THREE.DirectionalLight(0xffffff, 0.90);
  key.position.set(0, 0, 420);
  state.scene.add(key);

  const fill = new THREE.DirectionalLight(0xffffff, 0.40);
  fill.position.set(-250, 120, 240);
  state.scene.add(fill);

  resizeStage();
}


async function loadEnvironment() {
  if (!state.libs?.THREE || !state.libs?.RGBELoader || !state.pmremGenerator || !state.scene) return;

  try {
    logLine(`Loading HDR environment from ${HDR_ENV_PATH}`);
    const hdrLoader = new state.libs.RGBELoader();
    const hdrTexture = await hdrLoader.loadAsync(HDR_ENV_PATH);
    const envRT = state.pmremGenerator.fromEquirectangular(hdrTexture);
    state.scene.environment = envRT.texture;
    hdrTexture.dispose();
    logLine('HDR environment loaded for reflections.');
  } catch (error) {
    logLine(`HDR environment failed: ${error?.message || error}`);
  }
}

async function loadWatchModel() {
  const THREE = state.libs.THREE;
  const loader = new state.libs.GLTFLoader();
  logLine(`Loading watch model from ${WATCH_MODEL_PATH}`);

  await new Promise((resolve, reject) => {
    loader.load(
      WATCH_MODEL_PATH,
      (gltf) => {
        const root = new THREE.Group();
        const content = gltf.scene;

        const box = new THREE.Box3().setFromObject(content);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        content.position.sub(center);
        root.add(content);
        root.visible = false;

        state.modelRoot = root;
        state.modelSize = size;

        // ---- ESCALA DE REFERENCIA (corrigido) ----
        // BUG ANTIGO: usava dims[1] (dimensao do MEIO). Neste GLB o modelo
        // inclui a pulseira esticada — o bbox total e ~7.8 x 12.1 x 8.6 cm.
        // dims[1] pegava ~8.6 cm (a pulseira), nao a CAIXA do relogio.
        // Resultado: modelRefSize grande demais -> escala dividida -> relogio
        // aparecia pequeno.
        // CORRIGIDO: a largura da CAIXA do relogio e a MENOR das 3 dimensoes
        // (a pulseira infla as outras duas). Usamos dims[0].
        // CASE_WIDTH_OVERRIDE: se a deteccao automatica nao acertar, defina
        // aqui a largura real da caixa do relogio em METROS (ex.: 0.040 =
        // 40 mm) e ela sera usada no lugar.
        const CASE_WIDTH_OVERRIDE = null;   // ex.: 0.040 para 40 mm

        const dims = [size.x, size.y, size.z].sort((a, b) => a - b);
        const autoCaseWidth = dims[0] || size.x || 0.04;
        state.modelRefSize = CASE_WIDTH_OVERRIDE || autoCaseWidth;

        content.traverse((obj) => {
          if (!obj.isMesh) return;

          const isOccluder = (obj.name || '').toLowerCase().includes('occluder');

          if (isOccluder) {
            const depthOnlyMat = new THREE.MeshBasicMaterial({
              color: 0x000000,
              side: THREE.DoubleSide,
            });
            depthOnlyMat.colorWrite = false;
            depthOnlyMat.depthWrite = true;
            depthOnlyMat.depthTest = true;

            obj.material = depthOnlyMat;
            obj.renderOrder = 0;
            obj.frustumCulled = false;
            state.occluderRoot = obj;
            return;
          }

          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const mat of mats) {
            if ('envMapIntensity' in mat) {
              mat.envMapIntensity = CONFIG.envMapIntensity;
              mat.needsUpdate = true;
            }
          }

          obj.renderOrder = 1;
        });

        state.scene.add(root);
        state.modelLoaded = true;

        logLine(`Watch model loaded. bbox=${size.x.toFixed(4)} x ${size.y.toFixed(4)} x ${size.z.toFixed(4)} m | case width (modelRefSize)=${state.modelRefSize.toFixed(4)} m (${(state.modelRefSize*1000).toFixed(0)}mm) | occluder=${state.occluderRoot ? 'YES' : 'NO'}`);
        resolve();
      },
      undefined,
      (error) => reject(error)
    );
  });
}

async function startCamera() {
  if (!window.isSecureContext) throw new Error('This page needs HTTPS to open the camera.');
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is not available in this browser.');

  stopCamera();
  setStatus('Starting camera…');
  setHint('Allow camera permission if asked.');

  const tries = [
    {
      audio: false,
      video: {
        facingMode: { ideal: CONFIG.facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    },
    { audio: false, video: { facingMode: CONFIG.facingMode } },
    { audio: false, video: true },
  ];

  let stream = null;
  let lastError = null;
  for (const constraints of tries) {
    try {
      logLine(`Trying getUserMedia: ${JSON.stringify(constraints)}`);
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      break;
    } catch (error) {
      lastError = error;
      logLine(`getUserMedia failed: ${error?.name || 'Error'} - ${error?.message || error}`);
    }
  }
  if (!stream) throw lastError || new Error('Could not start camera.');

  state.stream = stream;
  state.started = true;
  centerCta.classList.add('is-hidden');

  videoEl.srcObject = stream;
  await videoEl.play();

  const settings = stream.getVideoTracks()[0]?.getSettings?.() || {};
  metricCamera.textContent = settings.facingMode || CONFIG.facingMode;
  metricVideo.textContent = `${settings.width || videoEl.videoWidth || '?'} x ${settings.height || videoEl.videoHeight || '?'}`;
  logLine(`Camera started. settings=${JSON.stringify(settings)}`);

  state.mirrorPreview = CONFIG.facingMode === 'user';
  videoEl.style.transform = state.mirrorPreview ? 'scaleX(-1)' : 'none';

  resizeStage();
  setStatus('Point at the back of your hand');
  setHint('Keep one full hand and wrist visible. Move slowly when the watch appears.');

  cancelAnimationFrame(state.animationHandle);
  state.lastVideoTime = -1;
  loop();
}

function stopCamera() {
  cancelAnimationFrame(state.animationHandle);
  state.animationHandle = 0;
  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
    logLine('Previous camera stream stopped.');
  }
  videoEl.srcObject = null;
}

function resizeStage() {
  if (!state.renderer || !state.camera) return;
  const rect = stageEl.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));

  state.renderer.setSize(width, height, false);
  state.camera.left = -width / 2;
  state.camera.right = width / 2;
  state.camera.top = height / 2;
  state.camera.bottom = -height / 2;
  state.camera.updateProjectionMatrix();

  debugCanvas.width = width;
  debugCanvas.height = height;
}

function loop() {
  state.animationHandle = requestAnimationFrame(loop);

  if (!state.handLandmarker || !state.modelLoaded || !videoEl.srcObject || videoEl.readyState < 2) {
    renderScene();
    return;
  }

  const now = performance.now();
  if (videoEl.currentTime !== state.lastVideoTime && now - state.lastDetectionTime > 20) {
    const results = state.handLandmarker.detectForVideo(videoEl, now);
    processResults(results);
    state.lastVideoTime = videoEl.currentTime;
    state.lastDetectionTime = now;
  }

  updateVisibilityOnMiss();
  renderScene();
}

function renderScene() {
  if (state.renderer && state.scene && state.camera) {
    state.renderer.render(state.scene, state.camera);
  }
}

function processResults(results) {
  const debugCtx = debugCanvas.getContext('2d');
  if (debugCtx) debugCtx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);

  const landmarks = results?.landmarks?.[0];
  if (!landmarks) {
    state.misses += 1;
    if ([1, 10, 30].includes(state.misses)) {
      logLine(`No hand detected. misses=${state.misses}`);
    }
    if (state.misses > 10) {
      setStatus('Searching for a wrist…');
      setHint('Show the full hand and wrist. Fingers slightly apart works best.');
    }
    return;
  }

  state.misses = 0;
  state.detections += 1;
  metricDetections.textContent = String(state.detections);

  const handedness = results.handedness?.[0]?.[0]?.categoryName || 'Hand';
  state.lastHandText = handedness;
  metricLastHand.textContent = handedness;

  // 2D anchor/scale
  const wrist2 = mapLandmark(landmarks[0]);
  const index2 = mapLandmark(landmarks[5]);
  const pinky2 = mapLandmark(landmarks[17]);
  const knuckleMid2 = avgVec2(index2, pinky2);
  const along2 = normVec2(subVec2(knuckleMid2, wrist2));

  const handWidthPxRaw = dist2(index2, pinky2);
  state.widthHistory.push(handWidthPxRaw);
  if (state.widthHistory.length > 6) state.widthHistory.shift();
  const stableHandWidth = median(state.widthHistory);

  const wristOffsetPx = stableHandWidth * CONFIG.wristOffsetTrim;
  const anchor2 = {
    x: wrist2.x - along2.x * wristOffsetPx,
    y: wrist2.y - along2.y * wristOffsetPx,
  };

  // 3D basis
  const wrist3 = toSceneVec3(landmarks[0]);
  const index3 = toSceneVec3(landmarks[5]);
  const pinky3 = toSceneVec3(landmarks[17]);
  const knuckleMid3 = avgVec3(index3, pinky3);

  const along3 = subVec3(knuckleMid3, wrist3).normalize();  // bracelet axis
  let across3 = subVec3(pinky3, index3).normalize();
  let normal3 = new state.libs.THREE.Vector3().crossVectors(across3, along3).normalize();

  // Palm/back detection using 2D winding and handedness.
  // Rear camera, not mirrored.
  const cross2 = cross2D(subVec2(index2, wrist2), subVec2(pinky2, wrist2));
  const isLeft = handedness.toLowerCase().includes('left');

  // Heuristic:
  // left hand: back tends to produce positive winding, palm negative
  // right hand: opposite
  const palmFacing = isLeft ? (cross2 > 0) : (cross2 < 0);

  // Side-on compensation so the watch does not shrink at ~90°
  const sideFactor = 1 / clamp(Math.abs(normal3.z), CONFIG.sideCompMin, 1.0);

  // Important:
  // use a corrected width history for scale only, so side views do not slowly "breathe down"
  // while keeping the wrist anchor based on the raw wrist width history.
  const correctedWidthPx = handWidthPxRaw * sideFactor;
  state.scaleWidthHistory.push(correctedWidthPx);
  if (state.scaleWidthHistory.length > 6) state.scaleWidthHistory.shift();
  const stableCorrectedWidth = median(state.scaleWidthHistory);

  // Approximate wrist width from hand width so the watch fits the wrist better.
  // We do not have direct wrist-side landmarks, so this is an inferred value.
  const estimatedWristWidth = stableCorrectedWidth * 0.86;

  // Build orthonormal basis
  const xAxis = along3.clone();
  // use absolute face normal for smooth side rotation, then add palm flip below
  if (normal3.z < 0) {
    normal3.multiplyScalar(-1);
    across3.multiplyScalar(-1);
  }
  const zAxis = normal3.clone();
  const yAxis = new state.libs.THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
  zAxis.copy(new state.libs.THREE.Vector3().crossVectors(xAxis, yAxis).normalize());

  state.tmpMat4.makeBasis(xAxis, yAxis, zAxis);
  state.targetQuat.setFromRotationMatrix(state.tmpMat4);

  // Apply user trim around local X
  state.tmpQuat.setFromAxisAngle(new state.libs.THREE.Vector3(1, 0, 0), degToRad(CONFIG.rollTrimDeg));
  state.targetQuat.multiply(state.tmpQuat);

  // IMPORTANT:
  // If the palm is facing the camera, flip 180° around bracelet axis
  // so the underside of the watch is shown instead of snapping back to the face-up state.
  if (palmFacing) {
    state.tmpQuat.setFromAxisAngle(new state.libs.THREE.Vector3(1, 0, 0), Math.PI);
    state.targetQuat.multiply(state.tmpQuat);
  }

  const desiredWidthPx = clamp(
    estimatedWristWidth * CONFIG.autoScaleFactor * CONFIG.modelScaleTrim,
    CONFIG.minScalePx,
    CONFIG.maxScalePx
  );
  const targetScale = desiredWidthPx / Math.max(state.modelRefSize, 0.001);

  const target = {
    x: anchor2.x,
    y: anchor2.y,
    scale: targetScale,
  };

  if (!state.pose) {
    state.pose = { ...target };
    state.modelRoot.quaternion.copy(state.targetQuat);
    logLine(
      `First hand detected. width=${handWidthPxRaw.toFixed(2)} stable=${stableHandWidth.toFixed(2)} ` +
      `corrected=${stableCorrectedWidth.toFixed(2)} wristEst=${estimatedWristWidth.toFixed(2)} side=${sideFactor.toFixed(2)} palm=${palmFacing} scale=${targetScale.toFixed(2)}`
    );
  } else {
    const movement = Math.hypot(target.x - state.pose.x, target.y - state.pose.y);
    const fast = movement > 22;

    const posAlpha = fast ? CONFIG.posAlphaFast : CONFIG.posAlphaStable;
    const rotAlpha = fast ? CONFIG.rotSlerpFast : CONFIG.rotSlerpStable;

    state.pose.x = lerp(state.pose.x, target.x, posAlpha);
    state.pose.y = lerp(state.pose.y, target.y, posAlpha);
    state.pose.scale = lerp(state.pose.scale, target.scale, CONFIG.scaleAlpha);

    state.modelRoot.quaternion.slerp(state.targetQuat, rotAlpha);
  }

  placeWatch(state.pose);
  setStatus(`${handedness} wrist detected`);
  setHint('Move slowly. Palm/back flips and side scale should be more correct now.');

  if (state.debug && debugCtx) {
    drawDebug(debugCtx, landmarks, [0, 5, 17]);
    debugCtx.save();
    debugCtx.fillStyle = 'rgba(0, 220, 255, 0.95)';
    debugCtx.beginPath();
    debugCtx.arc(anchor2.x, anchor2.y, 6, 0, Math.PI * 2);
    debugCtx.fill();
    debugCtx.restore();
  }
}

function updateVisibilityOnMiss() {
  if (!state.modelRoot) return;
  if (state.misses > CONFIG.keepVisibleMisses && state.misses < CONFIG.hideAfterMisses) {
    state.modelRoot.visible = true;
  } else if (state.misses >= CONFIG.hideAfterMisses) {
    state.modelRoot.visible = false;
    state.pose = null;
    state.widthHistory = [];
    state.scaleWidthHistory = [];
  }
}

function placeWatch(pose) {
  if (!state.modelRoot) return;
  const rect = stageEl.getBoundingClientRect();
  state.modelRoot.visible = true;
  state.modelRoot.position.set(
    pose.x - rect.width / 2,
    -(pose.y - rect.height / 2),
    0
  );
  state.modelRoot.scale.setScalar(pose.scale);
}

function mapLandmark(lm) {
  const rect = stageEl.getBoundingClientRect();
  const videoW = videoEl.videoWidth || rect.width;
  const videoH = videoEl.videoHeight || rect.height;
  const stageW = rect.width;
  const stageH = rect.height;

  let nx = lm.x;
  if (state.mirrorPreview) nx = 1 - nx;

  const videoAspect = videoW / videoH;
  const stageAspect = stageW / stageH;

  if (videoAspect > stageAspect) {
    const scale = stageH / videoH;
    const displayW = videoW * scale;
    const offsetX = (stageW - displayW) / 2;
    return { x: nx * displayW + offsetX, y: lm.y * stageH };
  } else {
    const scale = stageW / videoW;
    const displayH = videoH * scale;
    const offsetY = (stageH - displayH) / 2;
    return { x: nx * stageW, y: lm.y * displayH + offsetY };
  }
}

function toSceneVec3(lm) {
  const x = state.mirrorPreview ? -(lm.x - 0.5) : (lm.x - 0.5);
  const y = -(lm.y - 0.5);
  const z = -lm.z;
  return new state.libs.THREE.Vector3(x, y, z);
}

function drawDebug(ctx, landmarks, highlightIndices = []) {
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(207, 220, 122, 0.95)';

  const connections = [
    [0,1],[1,2],[2,3],[3,4],
    [0,5],[5,6],[6,7],[7,8],
    [5,9],[9,10],[10,11],[11,12],
    [9,13],[13,14],[14,15],[15,16],
    [13,17],[17,18],[18,19],[19,20],[0,17]
  ];

  for (const [a, b] of connections) {
    const pa = mapLandmark(landmarks[a]);
    const pb = mapLandmark(landmarks[b]);
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }

  landmarks.forEach((lm, i) => {
    const p = mapLandmark(lm);
    ctx.beginPath();
    ctx.arc(p.x, p.y, highlightIndices.includes(i) ? 7 : 4, 0, Math.PI * 2);
    ctx.fillStyle = highlightIndices.includes(i) ? 'rgba(255, 221, 0, 0.98)' : 'rgba(255,255,255,0.95)';
    ctx.fill();
  });

  ctx.restore();
}

function setStatus(text) { statusPill.textContent = text; }
function setHint(text) { hintText.textContent = text; }

function logLine(text) {
  const timestamp = new Date().toLocaleTimeString();
  const line = `[${timestamp}] ${text}`;
  console.log(line);
  state.logLines.push(line);
  if (state.logLines.length > 120) state.logLines = state.logLines.slice(-120);
  renderLog();
}

function renderLog() {
  debugLog.textContent = state.logLines.join('\n');
  debugLog.scrollTop = debugLog.scrollHeight;
}

function lerp(a, b, t) { return a + (b - a) * t; }
function degToRad(v) { return (v * Math.PI) / 180; }
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function median(values) {
  const arr = [...values].sort((a,b)=>a-b);
  if (!arr.length) return 0;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}
function subVec2(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
function avgVec2(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
function normVec2(v) {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}
function dist2(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function avgVec3(a, b) {
  return new state.libs.THREE.Vector3((a.x+b.x)/2, (a.y+b.y)/2, (a.z+b.z)/2);
}
function subVec3(a, b) {
  return new state.libs.THREE.Vector3(a.x-b.x, a.y-b.y, a.z-b.z);
}
function cross2D(a, b) {
  return a.x * b.y - a.y * b.x;
}
