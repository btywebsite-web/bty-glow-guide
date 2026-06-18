const book      = document.getElementById('book');
const bookFrame = document.getElementById('book-frame');
const pages = [
  document.getElementById('page-1'),
  document.getElementById('page-2'),
  document.getElementById('page-3'),
];

const TOTAL    = pages.length;
const NATIVE_W = 560;
const NATIVE_H = 580;

let flipped   = 0;
let animating = false;

// Detect mobile once — used by both sizing and orientation logic
const isMobileDevice = /Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
                    || window.matchMedia('(max-width: 1024px) and (pointer: coarse)').matches;

// ── Z-index management ───────────────────────────────────────────────────────
function restack() {
  pages.forEach((page, i) => {
    page.style.zIndex = page.classList.contains('flipped')
      ? i + 1
      : (TOTAL * 2) - i;
  });
}

// ── Book state classes ───────────────────────────────────────────────────────
function updateBookClass() {
  const isCover = flipped === 0;
  const isBack  = flipped === TOTAL;
  book.classList.toggle('is-cover', isCover);
  book.classList.toggle('is-open',  !isCover && !isBack);
  book.classList.toggle('is-back',  isBack);
  bookFrame.classList.toggle('is-cover', isCover);
  bookFrame.classList.toggle('is-back',  isBack);
}

function updateUI() { updateBookClass(); }

// ── Flip forward ─────────────────────────────────────────────────────────────
function goForward() {
  if (animating || flipped >= TOTAL) return;
  animating = true;
  const leaf = pages[flipped];
  leaf.style.zIndex = 999;
  leaf.classList.add('flipped');
  flipped++;
  setTimeout(() => { restack(); updateUI(); animating = false; }, 870);
  updateUI();
}

// ── Flip backward ────────────────────────────────────────────────────────────
function goBack() {
  if (animating || flipped <= 0) return;
  animating = true;
  flipped--;
  const leaf = pages[flipped];
  leaf.style.zIndex = 999;
  leaf.classList.remove('flipped');
  setTimeout(() => { restack(); updateUI(); animating = false; }, 870);
  updateUI();
}

// ── Responsive sizing ────────────────────────────────────────────────────────
function updateSize() {
  const isPortrait        = window.matchMedia('(orientation: portrait)').matches;
  const isMobileLandscape = isMobileDevice && !isPortrait;
  const isMobilePortrait  = isMobileDevice && isPortrait;

  // visualViewport.height = real visible area (accounts for Chrome/Brave address bar)
  const vvH = window.visualViewport?.height || window.innerHeight;
  const vvW = window.visualViewport?.width  || window.innerWidth;

  // Pin body to the real visible area — override min-height:100vh from CSS
  if (isMobileDevice) {
    document.body.style.minHeight = '0';
    document.body.style.height    = vvH + 'px';
  } else {
    document.body.style.minHeight = '';
    document.body.style.height    = '';
  }

  let sidePad, maxW, maxH, scaleCap;

  if (isMobileLandscape) {
    sidePad  = 6;
    maxW     = vvW - sidePad * 2;
    maxH     = vvH * 0.92;
    scaleCap = 1.10;
  } else if (isMobilePortrait) {
    sidePad  = Math.max(24, vvW * 0.08);
    maxW     = vvW - sidePad * 2;
    maxH     = vvH * 0.82;   // title hidden so full height is usable
    scaleCap = 0.68;
  } else {
    // Desktop
    sidePad  = Math.max(40, window.innerWidth * 0.04);
    maxW     = window.innerWidth  - sidePad * 2;
    maxH     = window.innerHeight - 100;
    scaleCap = 0.95;
  }

  const scale = Math.min(scaleCap, maxW / (NATIVE_W * 2), maxH / NATIVE_H);
  const pageW = Math.round(NATIVE_W * scale);
  const pageH = Math.round(NATIVE_H * scale);

  const r = document.documentElement;
  r.style.setProperty('--page-w', pageW + 'px');
  r.style.setProperty('--page-h', pageH + 'px');
  r.style.setProperty('--shift',  (pageW / 2) + 'px');
  r.style.setProperty('--persp',  Math.round(2500 * scale) + 'px');
}

// ── Event listeners ──────────────────────────────────────────────────────────
document.getElementById('btn-next').addEventListener('click', goForward);
document.getElementById('btn-prev').addEventListener('click', goBack);

document.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); goForward(); }
  if (e.key === 'ArrowLeft')                   { e.preventDefault(); goBack(); }
});

// ── Rotate prompt ────────────────────────────────────────────────────────────
const rotatePrompt  = document.getElementById('rotate-prompt');
const rotateDismiss = document.getElementById('rotate-dismiss');
let   dismissed     = false;

function checkOrientation() {
  const isPortrait = window.matchMedia('(orientation: portrait)').matches;

  // Toggle body classes — CSS uses these to lock scroll and hide title
  document.body.classList.toggle('mobile-landscape', isMobileDevice && !isPortrait);
  document.body.classList.toggle('mobile-portrait',  isMobileDevice && isPortrait);

  // Recalculate size whenever orientation changes
  updateSize();

  if (isMobileDevice && isPortrait && !dismissed) {
    rotatePrompt.classList.add('visible');
  } else {
    rotatePrompt.classList.remove('visible');
  }
}

rotateDismiss.addEventListener('click', () => {
  dismissed = true;
  rotatePrompt.classList.remove('visible');
});

window.matchMedia('(orientation: portrait)').addEventListener('change', checkOrientation);
window.addEventListener('orientationchange', checkOrientation);
window.addEventListener('resize', () => { updateSize(); checkOrientation(); });
// visualViewport resize intentionally NOT listened — it fires on every zoom frame
// and would call updateSize() 60×/sec causing layout thrash and laggy zoom

// ── Init ─────────────────────────────────────────────────────────────────────
restack();
updateUI();
setTimeout(() => { checkOrientation(); updateSize(); }, 300);

// ── Custom pinch-to-zoom ──────────────────────────────────────────────────────
(function () {
  const wrapper = document.getElementById('zoom-wrapper');
  const MAX_SCALE = 5;
  let scale = 1, panX = 0, panY = 0;
  let t0 = null, t1 = null;          // two active touches
  let initDist, initScale, initMidX, initMidY, initPanX, initPanY;
  let singleStartX, singleStartY, singleInitPanX, singleInitPanY;
  let gestureActive = false;          // true while pinching or panning

  function apply() {
    if (scale <= 1) {
      scale = 1; panX = 0; panY = 0;
      wrapper.style.transform = '';
      return;
    }
    const maxX = (window.innerWidth  * (scale - 1)) / 2;
    const maxY = (window.innerHeight * (scale - 1)) / 2;
    panX = Math.max(-maxX, Math.min(maxX, panX));
    panY = Math.max(-maxY, Math.min(maxY, panY));
    wrapper.style.transform = `translate(${panX}px,${panY}px) scale(${scale})`;
  }

  wrapper.addEventListener('touchstart', e => {
    const ts = e.touches;
    if (ts.length === 2) {
      e.preventDefault();
      t0 = { x: ts[0].clientX, y: ts[0].clientY };
      t1 = { x: ts[1].clientX, y: ts[1].clientY };
      initDist  = Math.hypot(t1.x - t0.x, t1.y - t0.y);
      initScale = scale;
      initMidX  = (t0.x + t1.x) / 2;
      initMidY  = (t0.y + t1.y) / 2;
      initPanX  = panX;
      initPanY  = panY;
      gestureActive = true;
    } else if (ts.length === 1) {
      singleStartX    = ts[0].clientX;
      singleStartY    = ts[0].clientY;
      singleInitPanX  = panX;
      singleInitPanY  = panY;
      gestureActive   = false;
    }
  }, { passive: false });

  wrapper.addEventListener('touchmove', e => {
    const ts = e.touches;
    if (ts.length === 2) {
      e.preventDefault();
      const cx0 = ts[0].clientX, cy0 = ts[0].clientY;
      const cx1 = ts[1].clientX, cy1 = ts[1].clientY;
      const newDist = Math.hypot(cx1 - cx0, cy1 - cy0);
      const midX    = (cx0 + cx1) / 2;
      const midY    = (cy0 + cy1) / 2;
      scale = Math.max(1, Math.min(MAX_SCALE, initScale * newDist / initDist));
      panX  = initPanX + (midX - initMidX);
      panY  = initPanY + (midY - initMidY);
      apply();
      gestureActive = true;
    } else if (ts.length === 1 && scale > 1) {
      const dx = ts[0].clientX - singleStartX;
      const dy = ts[0].clientY - singleStartY;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        e.preventDefault();
        panX = singleInitPanX + dx;
        panY = singleInitPanY + dy;
        apply();
        gestureActive = true;
      }
    }
  }, { passive: false });

  wrapper.addEventListener('touchend', e => {
    if (e.touches.length < 2) { t0 = null; t1 = null; }
    if (e.touches.length === 0) {
      apply();
      // Always suppress the delayed synthetic click — we fire flips ourselves below
      wrapper.addEventListener('click', stopClick, { capture: true, once: true });

      if (!gestureActive && e.changedTouches.length === 1) {
        // Clean tap — fire the flip immediately (no 300ms wait)
        const touch = e.changedTouches[0];
        const el    = document.elementFromPoint(touch.clientX, touch.clientY);
        if (el) {
          if (el.closest('#btn-next')) goForward();
          else if (el.closest('#btn-prev')) goBack();
        }
      }
      gestureActive = false;
    }
  }, { passive: true });

  function stopClick(e) { e.stopPropagation(); }
})();
