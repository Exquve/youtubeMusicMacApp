// Living Background - Audio Reactive Visualizer
// Creates a dynamic background that responds to music
// Uses Web Audio API for frequency analysis

(function () {
  'use strict';

  // Prevent re-initialization
  if (window.__livingBgInitialized) {
    console.log('[Living BG] Already initialized, skipping...');
    return;
  }
  window.__livingBgInitialized = true;

  console.log('[Living BG] Initializing audio visualizer...');

  let audioContext = null;
  let analyser = null;
  let dataArray = null;
  let isConnected = false;
  let animationId = null;
  let backgroundEl = null;
  let audioSource = null;

  // Audio analysis settings
  const FFT_SIZE = 256;
  const SMOOTHING = 0.8;

  // Thresholds for effect triggering
  const BASS_THRESHOLD = 200;
  const TREBLE_THRESHOLD = 150;
  const DROP_THRESHOLD = 180;

  // Current state
  let lastBassLevel = 0;
  let lastTrebleLevel = 0;
  let avgEnergy = 0;
  let isCalm = true;

  // Dominant color from album art
  let dominantColor = { r: 50, g: 50, b: 80 };

  // Create background overlay element
  function createBackgroundElement() {
    if (document.getElementById('living-bg')) return;

    const bg = document.createElement('div');
    bg.id = 'living-bg';
    document.body.appendChild(bg);

    // Create gradient layers
    const pulse = document.createElement('div');
    pulse.id = 'living-bg-pulse';
    bg.appendChild(pulse);

    const shimmer = document.createElement('div');
    shimmer.id = 'living-bg-shimmer';
    bg.appendChild(shimmer);

    // Create multiple random positioned light orbs
    for (let i = 0; i < 6; i++) {
      const orb = document.createElement('div');
      orb.className = 'living-bg-orb';
      orb.id = `living-bg-orb-${i}`;
      orb.dataset.index = i;
      bg.appendChild(orb);
    }

    backgroundEl = bg;

    console.log('[Living BG] Background element created');
  }

  // Inject styles
  function injectStyles() {
    if (document.getElementById('living-bg-styles')) return;

    const style = document.createElement('style');
    style.id = 'living-bg-styles';
    style.textContent = `
      /* Base - mostly black, only lit when music plays */
      #living-bg {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: -1;
        overflow: hidden;
        pointer-events: none;
        background: #000;
        transition: background 0.1s ease;
      }
      
      /* Center pulse - main color glow */
      #living-bg-pulse {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 200%;
        height: 200%;
        transform: translate(-50%, -50%);
        background: radial-gradient(ellipse at center,
          rgba(var(--bg-r), var(--bg-g), var(--bg-b), var(--pulse-opacity, 0)) 0%,
          transparent 50%);
        opacity: 1;
        transition: all 0.05s ease;
      }
      
      /* Dynamic light orbs - random positions */
      .living-bg-orb {
        position: absolute;
        width: 300px;
        height: 300px;
        border-radius: 50%;
        background: radial-gradient(circle,
          rgba(var(--bg-r), var(--bg-g), var(--bg-b), var(--orb-opacity, 0)) 0%,
          transparent 70%);
        filter: blur(40px);
        transition: all 0.08s ease;
        pointer-events: none;
      }
      
      /* Each orb has different starting position */
      #living-bg-orb-0 { top: 10%; left: 5%; }
      #living-bg-orb-1 { top: 20%; right: 10%; }
      #living-bg-orb-2 { bottom: 30%; left: 15%; }
      #living-bg-orb-3 { bottom: 20%; right: 5%; }
      #living-bg-orb-4 { top: 50%; left: 50%; transform: translate(-50%, -50%); }
      #living-bg-orb-5 { top: 40%; right: 25%; }
      
      /* Shimmer overlay */
      #living-bg-shimmer {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(
          45deg,
          transparent 40%,
          rgba(255, 255, 255, var(--shimmer-intensity, 0)) 50%,
          transparent 60%
        );
        background-size: 200% 200%;
        animation: shimmer-move 3s ease infinite;
        opacity: 1;
      }
      
      @keyframes shimmer-move {
        0% { background-position: 200% 200%; }
        100% { background-position: -200% -200%; }
      }
      
      /* Apply when active */
      #living-bg.active #living-bg-shimmer {
        opacity: 1;
      }
      
      /* Calm mode - slow flowing gradients */
      #living-bg.calm {
        background: radial-gradient(ellipse at 30% 30%, 
          rgba(var(--bg-r), var(--bg-g), var(--bg-b), 0.3) 0%, 
          transparent 50%),
          radial-gradient(ellipse at 70% 70%, 
          rgba(var(--bg-r), var(--bg-g), var(--bg-b), 0.2) 0%, 
          transparent 50%),
          rgba(0, 0, 0, 0.95);
        transition: background 2s ease;
      }
      
      /* Drop mode - intense pulsing */
      #living-bg.drop #living-bg-pulse {
        animation: drop-pulse 0.2s ease infinite;
      }
      
      @keyframes drop-pulse {
        0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.6; }
        50% { transform: translate(-50%, -50%) scale(1.1); opacity: 0.8; }
      }
      
      /* Make YouTube Music background transparent so living bg shows */
      html, body {
        background: transparent !important;
      }
      
      ytmusic-app {
        background: transparent !important;
      }
      
      #layout {
        background: transparent !important;
      }
      
      ytmusic-browse-response {
        background: transparent !important;
      }
      
      ytmusic-tabbed-search-results-renderer {
        background: transparent !important;
      }
      
      #content.ytmusic-app {
        background: transparent !important;
      }
      
      ytmusic-player-page {
        background: transparent !important;
      }
      
      /* UP NEXT / Queue panel - make transparent */
      #side-panel,
      ytmusic-tab-renderer,
      #tab-renderer,
      ytmusic-player-queue,
      #contents.ytmusic-player-queue,
      ytmusic-queue-header-renderer,
      #automix-contents,
      ytmusic-player-queue-item {
        background: transparent !important;
      }
      
      /* Tab content */
      #tabs-content,
      ytmusic-section-list-renderer {
        background: transparent !important;
      }
      
      /* Keep sidebar slightly opaque for readability */
      ytmusic-nav-bar,
      ytmusic-guide-section-renderer,
      #guide-inner-content {
        background: rgba(0, 0, 0, 0.5) !important;
      }
      
      /* Player bar - keep it visible with icons */
      ytmusic-player-bar {
        background: rgba(0, 0, 0, 0.85) !important;
      }
      
      /* Ensure icons are visible - don't make button backgrounds transparent */
      ytmusic-player-bar tp-yt-paper-icon-button,
      ytmusic-player-bar .middle-controls,
      ytmusic-player-bar .left-controls,
      ytmusic-player-bar .right-controls,
      ytmusic-player-bar yt-icon,
      tp-yt-paper-icon-button {
        background: transparent !important;
        opacity: 1 !important;
        visibility: visible !important;
      }
      
      /* Make sure icons themselves are visible */
      ytmusic-player-bar svg,
      tp-yt-paper-icon-button svg,
      yt-icon svg {
        fill: currentColor !important;
        opacity: 1 !important;
      }
    `;
    document.head.appendChild(style);

    // Set initial CSS variables
    document.documentElement.style.setProperty('--bg-r', dominantColor.r);
    document.documentElement.style.setProperty('--bg-g', dominantColor.g);
    document.documentElement.style.setProperty('--bg-b', dominantColor.b);
  }

  // Connect to audio element
  async function connectAudio() {
    if (isConnected) return;

    const video = document.querySelector('video');
    if (!video) {
      console.log('[Living BG] No video element found, retrying...');
      return;
    }

    // Check if this video is already connected
    if (video.__livingBgConnected) {
      console.log('[Living BG] Video already connected, reusing...');
      isConnected = true;
      return;
    }

    try {
      // Create audio context if not exists
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      // Create analyser
      analyser = audioContext.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = SMOOTHING;

      // Create media source from video
      audioSource = audioContext.createMediaElementSource(video);
      audioSource.connect(analyser);
      analyser.connect(audioContext.destination);

      // Mark video as connected
      video.__livingBgConnected = true;

      // Create data array for frequency data
      dataArray = new Uint8Array(analyser.frequencyBinCount);

      isConnected = true;
      console.log('[Living BG] ✓ Audio connected!');

      // Start visualization loop
      startVisualization();

    } catch (error) {
      // If already connected error, mark as connected anyway
      if (error.message && error.message.includes('already connected')) {
        console.log('[Living BG] Video was already connected, marking as connected');
        video.__livingBgConnected = true;
        isConnected = true;
      } else {
        console.error('[Living BG] Audio connection error:', error);
      }
    }
  }

  // Extract bass (low frequencies), mids, and treble (high frequencies)
  function analyzeFrequencies() {
    if (!analyser || !dataArray) return { bass: 0, mids: 0, treble: 0, energy: 0 };

    analyser.getByteFrequencyData(dataArray);

    const bufferLength = dataArray.length;
    const bassEnd = Math.floor(bufferLength * 0.1);  // 0-10% = bass
    const midsEnd = Math.floor(bufferLength * 0.5);  // 10-50% = mids
    // 50-100% = treble

    let bassSum = 0;
    let midsSum = 0;
    let trebleSum = 0;

    for (let i = 0; i < bufferLength; i++) {
      if (i < bassEnd) {
        bassSum += dataArray[i];
      } else if (i < midsEnd) {
        midsSum += dataArray[i];
      } else {
        trebleSum += dataArray[i];
      }
    }

    const bass = bassSum / bassEnd;
    const mids = midsSum / (midsEnd - bassEnd);
    const treble = trebleSum / (bufferLength - midsEnd);
    const energy = (bass + mids + treble) / 3;

    return { bass, mids, treble, energy };
  }

  // Update visual effects based on audio - DISCO MODE
  function updateVisuals(frequencies) {
    if (!backgroundEl) return;

    const { bass, mids, treble, energy } = frequencies;

    // Fast response for punchy disco feel
    const smoothBass = lastBassLevel * 0.3 + bass * 0.7;
    const smoothTreble = lastTrebleLevel * 0.5 + treble * 0.5;
    const smoothEnergy = avgEnergy * 0.6 + energy * 0.4;

    lastBassLevel = smoothBass;
    lastTrebleLevel = smoothTreble;
    avgEnergy = smoothEnergy;

    // Calculate base intensity - should be 0 when silent
    const baseIntensity = Math.max(0, (smoothEnergy - 30) / 200);

    // Music speed/tempo detection based on energy
    const musicSpeed = Math.min(smoothEnergy / 150, 1); // 0 = slow, 1 = fast

    // Bass hit detection - sharp pulse on beat
    const isBassHit = smoothBass > 100;
    const bassIntensity = isBassHit ? Math.min((smoothBass - 60) / 150, 1) : 0;

    // Treble for shimmer
    const shimmerIntensity = Math.min(smoothTreble / 180, 0.4);

    // Center pulse - main color, follows bass
    document.documentElement.style.setProperty('--pulse-opacity', bassIntensity * 0.6);

    // Update all orbs - flash on/off effect
    const orbs = document.querySelectorAll('.living-bg-orb');
    orbs.forEach((orb, i) => {
      // Fade speed based on music tempo
      // Fast music = quick fade (0.1s), slow music = slower fade (0.4s)
      const fadeSpeed = 0.4 - musicSpeed * 0.3;
      orb.style.transition = `opacity ${fadeSpeed}s ease-out, width 0.1s, height 0.1s`;

      // Flash on bass hit - each orb has random chance to flash
      if (isBassHit && bassIntensity > 0.3) {
        // Random orbs flash (not all at once)
        const shouldFlash = Math.random() > 0.4;

        if (shouldFlash) {
          // Sudden ON
          orb.style.opacity = 0.7 + Math.random() * 0.3;

          // Size pulse
          const size = 250 + bassIntensity * 150;
          orb.style.width = `${size}px`;
          orb.style.height = `${size}px`;
        }
      } else {
        // Quick fade out when no bass
        orb.style.opacity = baseIntensity * 0.15;
        orb.style.width = '200px';
        orb.style.height = '200px';
      }
    });

    // Set orb color via CSS variable  
    document.documentElement.style.setProperty('--orb-opacity', bassIntensity * 0.9);

    // Shimmer on high frequencies
    document.documentElement.style.setProperty('--shimmer-intensity', shimmerIntensity);
  }

  // Shift color hue
  function shiftColor(color, degrees) {
    // Convert RGB to HSL
    let r = color.r / 255;
    let g = color.g / 255;
    let b = color.b / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }

    // Shift hue
    h = (h + degrees / 360 + 1) % 1;

    // Boost saturation for disco effect
    s = Math.min(s * 1.5, 1);

    // Convert back to RGB
    const rgb = hslToRgb(h, s, l);
    return { r: rgb[0], g: rgb[1], b: rgb[2] };
  }

  // Animation loop
  function startVisualization() {
    function animate() {
      const frequencies = analyzeFrequencies();
      updateVisuals(frequencies);
      animationId = requestAnimationFrame(animate);
    }
    animate();
  }

  // Extract dominant color from album art or YouTube's computed styles
  async function extractDominantColor() {
    console.log('[Living BG] Attempting to extract color...');

    // Method 1: Try to get color from YouTube Music's own color extraction
    // YT Music often applies a background color based on album art
    const playerPage = document.querySelector('ytmusic-player-page');
    if (playerPage) {
      const computedBg = getComputedStyle(playerPage).backgroundColor;
      const rgbMatch = computedBg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (rgbMatch && (parseInt(rgbMatch[1]) > 10 || parseInt(rgbMatch[2]) > 10 || parseInt(rgbMatch[3]) > 10)) {
        dominantColor = {
          r: parseInt(rgbMatch[1]),
          g: parseInt(rgbMatch[2]),
          b: parseInt(rgbMatch[3])
        };
        updateColorVariables();
        console.log('[Living BG] ✓ Color from YT computed style:', dominantColor);
        return;
      }
    }

    // Method 2: Try to find any gradient or color hint in the player
    const thumbnail = document.querySelector('.thumbnail-image-wrapper');
    if (thumbnail) {
      const style = getComputedStyle(thumbnail);
      if (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        const rgbMatch = style.backgroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (rgbMatch) {
          dominantColor = {
            r: parseInt(rgbMatch[1]),
            g: parseInt(rgbMatch[2]),
            b: parseInt(rgbMatch[3])
          };
          updateColorVariables();
          console.log('[Living BG] ✓ Color from thumbnail:', dominantColor);
          return;
        }
      }
    }

    // Method 3: Fetch the image as blob to bypass CORS
    const albumArt = document.querySelector('.image.ytmusic-player-bar img, .thumbnail img, .ytmusic-player-bar .thumbnail img');
    if (albumArt && albumArt.src) {
      try {
        const response = await fetch(albumArt.src);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 50;
            canvas.height = 50;

            ctx.drawImage(img, 0, 0, 50, 50);
            const imageData = ctx.getImageData(0, 0, 50, 50).data;

            // Simple approach: find the most common non-gray color
            const colorBins = {};

            for (let i = 0; i < imageData.length; i += 4) {
              const r = imageData[i];
              const g = imageData[i + 1];
              const b = imageData[i + 2];

              // Check if it's NOT grayscale (has some color)
              const max = Math.max(r, g, b);
              const min = Math.min(r, g, b);
              const diff = max - min;

              // Skip pure black/white/gray (low color difference)
              if (diff < 20) continue;

              // Skip very dark pixels
              const brightness = (r + g + b) / 3;
              if (brightness < 30) continue;

              // Quantize colors into bins (reduce to 32 levels per channel)
              const binR = Math.floor(r / 32) * 32;
              const binG = Math.floor(g / 32) * 32;
              const binB = Math.floor(b / 32) * 32;
              const key = `${binR},${binG},${binB}`;

              if (!colorBins[key]) {
                colorBins[key] = { r: 0, g: 0, b: 0, count: 0 };
              }
              colorBins[key].r += r;
              colorBins[key].g += g;
              colorBins[key].b += b;
              colorBins[key].count++;
            }

            // Find the most common color
            let bestColor = { r: 200, g: 100, b: 150 }; // Default to pink-ish
            let bestCount = 0;

            for (const key in colorBins) {
              const bin = colorBins[key];
              if (bin.count > bestCount) {
                bestCount = bin.count;
                bestColor = {
                  r: Math.round(bin.r / bin.count),
                  g: Math.round(bin.g / bin.count),
                  b: Math.round(bin.b / bin.count)
                };
              }
            }

            dominantColor = bestColor;
            updateColorVariables();
            console.log('[Living BG] ✓ Color from fetched image:', dominantColor);

            URL.revokeObjectURL(blobUrl);
          } catch (e) {
            console.log('[Living BG] Canvas error:', e.message);
          }
        };

        img.src = blobUrl;
        return; // Don't use fallback, wait for image load
      } catch (e) {
        console.log('[Living BG] Fetch failed:', e.message);
      }
    }

    // Method 4: Use fixed accent color if nothing works
    dominantColor = { r: 180, g: 60, b: 100 }; // Nice pink accent
    updateColorVariables();
    console.log('[Living BG] Using default accent color');
  }

  function updateColorVariables() {
    document.documentElement.style.setProperty('--bg-r', dominantColor.r);
    document.documentElement.style.setProperty('--bg-g', dominantColor.g);
    document.documentElement.style.setProperty('--bg-b', dominantColor.b);
  }

  // HSL to RGB helper
  function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  // Watch for song changes to update color
  function watchSongChanges() {
    const observer = new MutationObserver(() => {
      setTimeout(extractDominantColor, 500);
    });

    const playerBar = document.querySelector('ytmusic-player-bar');
    if (playerBar) {
      observer.observe(playerBar, { subtree: true, childList: true });
    }
  }

  // Resume audio context on user interaction
  function setupInteractionHandler() {
    const resumeAudio = () => {
      if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
      }
      connectAudio();
      document.removeEventListener('click', resumeAudio);
    };
    document.addEventListener('click', resumeAudio);
  }

  // Initialize
  function init() {
    console.log('[Living BG] Starting...');
    injectStyles();
    createBackgroundElement();

    // Try to connect to audio
    setTimeout(connectAudio, 2000);

    // Watch for song changes
    setTimeout(() => {
      extractDominantColor();
      watchSongChanges();
    }, 3000);

    // Setup interaction handler for audio context
    setupInteractionHandler();

    console.log('[Living BG] Ready! Click anywhere to activate audio visualization.');
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 1000);
  }
})();
