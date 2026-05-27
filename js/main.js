console.log('MAIN JS CARREGADO - WATCH SPLIT V1');

const MODEL_FILE_PATH = './assets/models/relogio.glb';
const USE_LOCAL_HDR = true;
const LOCAL_HDR_PATH = './assets/hdr/glasshouse_interior_4k_blur_exp_sat.hdr';

const AR_EXPERIENCE_URL = new URL('./ar-view.html', window.location.href).href;
const WATCH_TRYON_URL = new URL('./watch-tryon.html', window.location.href).href;

const INITIAL_CAMERA_ORBIT = '0deg 75deg auto';
const INITIAL_FIELD_OF_VIEW = '28deg';
const INITIAL_EXPOSURE = '2';

const LEGACY_EFFECTS = {
  enabled: true,
  preset: 'subtle',
};

const PRESETS = {
  subtle: {
    ssao: { intensity: '0.55', radius: '0.16', luminance: '0.5', bias: '0.03' },
    bloom: { strength: '0.16', threshold: '0.82', radius: '0.42' },
    color: { contrast: '0.04', saturation: '0.05' }
  },
  strong: {
    ssao: { intensity: '0.95', radius: '0.24', luminance: '0.62', bias: '0.02' },
    bloom: { strength: '0.35', threshold: '0.55', radius: '0.65' },
    color: { contrast: '0.12', saturation: '0.14' }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const heroSlot = document.getElementById('hero-image-slot');
  const thumbs = document.querySelectorAll('.thumb[data-view]');
  const viewerToolbar = document.getElementById('viewer-toolbar');
  const viewerQualityNote = document.getElementById('viewer-quality-note');
  const resetCameraBtn = document.getElementById('reset-camera-btn');
  const toggleRotateBtn = document.getElementById('toggle-rotate-btn');
  const toggleEffectsBtn = document.getElementById('toggle-effects-btn');
  const presetSubtleBtn = document.getElementById('preset-subtle-btn');
  const presetStrongBtn = document.getElementById('preset-strong-btn');
  const openArBtn = document.getElementById('open-ar-btn');
  const openWatchTryonBtn = document.getElementById('open-watch-tryon-btn');
  const arModal = document.getElementById('ar-modal');
  const closeArModalBtn = document.getElementById('close-ar-modal-btn');
  const openArLink = document.getElementById('open-ar-link');
  const arUrlText = document.getElementById('ar-url-text');
  const qrCodeEl = document.getElementById('qr-code');
  const arModalEyebrow = document.getElementById('ar-modal-eyebrow');
  const arModalTitle = document.getElementById('ar-modal-title');
  const arModalCopy = document.getElementById('ar-modal-copy');

  if (!heroSlot || !thumbs.length) return;

  let currentViewer = null;
  let isAutoRotateEnabled = false;
  let fxEls = null;
  let currentMobileFlow = 'ar';

  function getEnvironmentConfig() {
    if (USE_LOCAL_HDR) {
      return { environmentImage: LOCAL_HDR_PATH, skyboxImage: null };
    }
    return { environmentImage: 'neutral', skyboxImage: null };
  }

  function buildEffectsMarkup() {
    return `
      <effect-composer id="composer" render-mode="quality">
        <smaa-effect id="fx-smaa"></smaa-effect>
        <ssao-effect id="fx-ssao"></ssao-effect>
        <bloom-effect id="fx-bloom"></bloom-effect>
        <color-grade-effect id="fx-color" tonemapping="aces_filmic"></color-grade-effect>
      </effect-composer>
    `;
  }

  function setActiveThumb(activeThumb) {
    thumbs.forEach((thumb) => thumb.classList.remove('is-active'));
    if (activeThumb) activeThumb.classList.add('is-active');
  }

  function hideToolbar() {
    if (viewerToolbar) viewerToolbar.hidden = true;
    if (viewerQualityNote) viewerQualityNote.hidden = true;
  }

  function showToolbar() {
    if (viewerToolbar) viewerToolbar.hidden = false;
    if (viewerQualityNote) viewerQualityNote.hidden = false;
  }

  function updateRotateButtonState() {
    if (!toggleRotateBtn) return;
    toggleRotateBtn.textContent = isAutoRotateEnabled ? 'Pause Rotation' : 'Enable Rotation';
  }

  function updateEffectsButtonState() {
    if (!toggleEffectsBtn) return;
    toggleEffectsBtn.textContent = LEGACY_EFFECTS.enabled ? 'Disable Effects' : 'Enable Effects';
  }

  function renderPlaceholder(labelText = 'MAIN IMAGE BLOCK') {
    currentViewer = null;
    fxEls = null;
    isAutoRotateEnabled = false;
    updateRotateButtonState();
    updateEffectsButtonState();
    hideToolbar();
    heroSlot.classList.remove('is-model');
    heroSlot.innerHTML = `
      <div class="hero-placeholder">
        ${labelText}<br />
        You can replace this with any product photo
      </div>
    `;
  }

  function removeLoadingPill() {
    const loading = document.getElementById('model-loading');
    if (loading) loading.remove();
  }

  function applyPreset(name) {
    const p = PRESETS[name];
    if (!p || !fxEls) return;

    if (fxEls.ssao) {
      fxEls.ssao.setAttribute('intensity', p.ssao.intensity);
      fxEls.ssao.setAttribute('radius', p.ssao.radius);
      fxEls.ssao.setAttribute('luminance-influence', p.ssao.luminance);
      fxEls.ssao.setAttribute('bias', p.ssao.bias);
    }

    if (fxEls.bloom) {
      fxEls.bloom.setAttribute('strength', p.bloom.strength);
      fxEls.bloom.setAttribute('threshold', p.bloom.threshold);
      fxEls.bloom.setAttribute('radius', p.bloom.radius);
    }

    if (fxEls.color) {
      fxEls.color.setAttribute('contrast', p.color.contrast);
      fxEls.color.setAttribute('saturation', p.color.saturation);
    }

    LEGACY_EFFECTS.preset = name;
  }

  function setEffectsEnabled(enabled) {
    LEGACY_EFFECTS.enabled = enabled;
    if (fxEls) {
      Object.values(fxEls).forEach((el) => {
        if (!el) return;
        el.setAttribute('blend-mode', enabled ? 'default' : 'skip');
      });
    }
    updateEffectsButtonState();
  }

  function renderModelViewer() {
    heroSlot.classList.add('is-model');
    showToolbar();
    isAutoRotateEnabled = false;
    updateRotateButtonState();

    heroSlot.innerHTML = `
      <div class="hero-viewer-shell">
        <div class="model-loading" id="model-loading">Loading 3D model...</div>
        <model-viewer
          id="product-model-viewer"
          class="hero-model-viewer"
          src="${MODEL_FILE_PATH}"
          alt="3D product preview"
          camera-controls
          touch-action="pan-y"
          shadow-intensity="1"
          shadow-softness="0.85"
          exposure="${INITIAL_EXPOSURE}"
          environment-image="${getEnvironmentConfig().environmentImage}"
          interaction-prompt="none"
          camera-orbit="${INITIAL_CAMERA_ORBIT}"
          field-of-view="${INITIAL_FIELD_OF_VIEW}"
          reveal="auto"
          loading="eager"
        >
          ${buildEffectsMarkup()}
        </model-viewer>
        <div class="viewer-vignette"></div>
      </div>
    `;

    const viewer = document.getElementById('product-model-viewer');
    if (!viewer) {
      heroSlot.classList.remove('is-model');
      heroSlot.innerHTML = `
        <div class="hero-error">
          The model-viewer component was not found.<br />
          Check the scripts loaded in index.html.
        </div>
      `;
      hideToolbar();
      return;
    }

    currentViewer = viewer;
    fxEls = {
      smaa: document.getElementById('fx-smaa'),
      ssao: document.getElementById('fx-ssao'),
      bloom: document.getElementById('fx-bloom'),
      color: document.getElementById('fx-color'),
    };

    applyPreset(LEGACY_EFFECTS.preset);
    setEffectsEnabled(LEGACY_EFFECTS.enabled);

    let loadingRemoved = false;
    const safeRemoveLoading = () => {
      if (loadingRemoved) return;
      loadingRemoved = true;
      removeLoadingPill();
    };

    viewer.addEventListener('load', () => {
      console.log('Model loaded successfully:', MODEL_FILE_PATH);
      safeRemoveLoading();
    });

    viewer.addEventListener('error', (event) => {
      console.error('Error loading GLB:', MODEL_FILE_PATH, event);
      currentViewer = null;
      fxEls = null;
      hideToolbar();
      heroSlot.classList.remove('is-model');
      heroSlot.innerHTML = `
        <div class="hero-error">
          ERROR LOADING THE 3D MODEL<br />
          Check the file path or the GLB export
        </div>
      `;
    }, { once: true });

    const visibilityCheck = setInterval(() => {
      if (!document.body.contains(viewer)) {
        clearInterval(visibilityCheck);
        return;
      }
      if (viewer.loaded) {
        safeRemoveLoading();
        clearInterval(visibilityCheck);
      }
    }, 150);

    setTimeout(() => {
      safeRemoveLoading();
      clearInterval(visibilityCheck);
    }, 2200);
  }

  function resetCamera() {
    if (!currentViewer) return;
    currentViewer.cameraOrbit = INITIAL_CAMERA_ORBIT;
    currentViewer.fieldOfView = INITIAL_FIELD_OF_VIEW;
  }

  function toggleAutoRotate() {
    if (!currentViewer) return;
    isAutoRotateEnabled = !isAutoRotateEnabled;
    if (isAutoRotateEnabled) currentViewer.setAttribute('auto-rotate', '');
    else currentViewer.removeAttribute('auto-rotate');
    updateRotateButtonState();
  }

  function getFlowConfig(flow) {
    if (flow === 'watch') {
      return {
        eyebrow: 'Try-On Watch',
        title: 'Scan to test the watch try-on flow',
        copy: 'Use this QR code to open the dedicated Watch Try-On page on your phone. This page is intentionally separate from the standard AR flow so we can test watch-specific experiences independently.',
        url: WATCH_TRYON_URL,
        linkText: 'Open Watch Try-On Link'
      };
    }

    return {
      eyebrow: 'AR',
      title: 'Scan to open on your phone',
      copy: 'Use this QR code to open the standard AR experience on your phone.',
      url: AR_EXPERIENCE_URL,
      linkText: 'Open AR Link'
    };
  }

  function openMobileModal(flow) {
    if (!arModal) return;
    currentMobileFlow = flow;

    const config = getFlowConfig(flow);

    arModal.hidden = false;
    document.body.classList.add('modal-open');

    if (arModalEyebrow) arModalEyebrow.textContent = config.eyebrow;
    if (arModalTitle) arModalTitle.textContent = config.title;
    if (arModalCopy) arModalCopy.textContent = config.copy;

    if (openArLink) {
      openArLink.href = config.url;
      openArLink.textContent = config.linkText;
    }

    if (arUrlText) {
      arUrlText.textContent = config.url;
    }

    if (qrCodeEl && typeof QRCode !== 'undefined') {
      qrCodeEl.innerHTML = '';
      new QRCode(qrCodeEl, { text: config.url, width: 180, height: 180 });
    }
  }

  function closeArModal() {
    if (!arModal) return;
    arModal.hidden = true;
    document.body.classList.remove('modal-open');
  }

  thumbs.forEach((thumb) => {
    thumb.addEventListener('click', () => {
      const view = thumb.dataset.view || '';
      const label = thumb.dataset.label || 'MAIN IMAGE BLOCK';
      setActiveThumb(thumb);
      if (view === 'model') renderModelViewer();
      else renderPlaceholder(label);
    });
  });

  if (resetCameraBtn) resetCameraBtn.addEventListener('click', resetCamera);
  if (toggleRotateBtn) toggleRotateBtn.addEventListener('click', toggleAutoRotate);
  if (toggleEffectsBtn) {
    toggleEffectsBtn.addEventListener('click', () => setEffectsEnabled(!LEGACY_EFFECTS.enabled));
  }
  if (presetSubtleBtn) {
    presetSubtleBtn.addEventListener('click', () => {
      applyPreset('subtle');
      setEffectsEnabled(true);
    });
  }
  if (presetStrongBtn) {
    presetStrongBtn.addEventListener('click', () => {
      applyPreset('strong');
      setEffectsEnabled(true);
    });
  }
  if (openArBtn) openArBtn.addEventListener('click', () => openMobileModal('ar'));
  if (openWatchTryonBtn) openWatchTryonBtn.addEventListener('click', () => openMobileModal('watch'));
  if (closeArModalBtn) closeArModalBtn.addEventListener('click', closeArModal);

  document.querySelectorAll('[data-close-modal]').forEach((el) => {
    el.addEventListener('click', closeArModal);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && arModal && !arModal.hidden) closeArModal();
  });

  updateRotateButtonState();
  updateEffectsButtonState();

  const initialThumb = document.querySelector('.thumb.is-active') || thumbs[0];
  if (initialThumb) {
    const initialView = initialThumb.dataset.view || '';
    const initialLabel = initialThumb.dataset.label || 'MAIN IMAGE BLOCK';
    setActiveThumb(initialThumb);
    if (initialView === 'model') renderModelViewer();
    else renderPlaceholder(initialLabel);
  }
});

window.addEventListener('error', (event) => {
  console.error('Global error:', event.message, event.filename, event.lineno);
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});
