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

    backgroundEl = bg;

    console.log('[Living BG] Background element created');
  }

  // Inject styles
  function injectStyles() {
    if (document.getElementById('living-bg-styles')) return;

    const style = document.createElement('style');
    style.id = 'living-bg-styles';
    style.textContent = `
      #living-bg {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: -1;
        overflow: hidden;
        pointer-events: none;
        background: radial-gradient(ellipse at center, 
          rgba(var(--bg-r), var(--bg-g), var(--bg-b), 0.4) 0%, 
          rgba(0, 0, 0, 0.95) 70%);
        transition: background 0.5s ease;
      }
      
      #living-bg-pulse {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 150%;
        height: 150%;
        transform: translate(-50%, -50%);
        background: radial-gradient(ellipse at center,
          rgba(var(--bg-r), var(--bg-g), var(--bg-b), var(--pulse-intensity, 0)) 0%,
          transparent 60%);
        opacity: var(--pulse-opacity, 0);
        transition: opacity 0.1s ease;
      }
      
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
        opacity: 0;
        transition: opacity 0.2s ease;
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
      
      /* Keep sidebar and player bar slightly opaque for readability */
      ytmusic-nav-bar,
      ytmusic-guide-section-renderer,
      #guide-inner-content {
        background: rgba(0, 0, 0, 0.5) !important;
      }
      
      ytmusic-player-bar {
        background: rgba(0, 0, 0, 0.8) !important;
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

  // Update visual effects based on audio
  function updateVisuals(frequencies) {
    if (!backgroundEl) return;

    const { bass, mids, treble, energy } = frequencies;

    // Smooth the values
    const smoothBass = lastBassLevel * 0.7 + bass * 0.3;
    const smoothTreble = lastTrebleLevel * 0.7 + treble * 0.3;
    const smoothEnergy = avgEnergy * 0.9 + energy * 0.1;

    lastBassLevel = smoothBass;
    lastTrebleLevel = smoothTreble;
    avgEnergy = smoothEnergy;

    // Calculate intensities (0-1 range)
    const pulseIntensity = Math.min(smoothBass / 255, 1);
    const shimmerIntensity = Math.min(smoothTreble / 200, 0.3);

    // Update CSS variables
    document.documentElement.style.setProperty('--pulse-intensity', pulseIntensity * 0.5);
    document.documentElement.style.setProperty('--pulse-opacity', pulseIntensity);
    document.documentElement.style.setProperty('--shimmer-intensity', shimmerIntensity);

    // Detect calm/drop modes
    const isNowCalm = smoothEnergy < 80;
    const isDrop = smoothBass > DROP_THRESHOLD && smoothEnergy > 150;

    backgroundEl.classList.toggle('calm', isNowCalm);
    backgroundEl.classList.toggle('drop', isDrop);
    backgroundEl.classList.toggle('active', smoothEnergy > 50);

    // Bass pulse effect - darken on beat
    if (smoothBass > BASS_THRESHOLD) {
      const darkness = Math.min((smoothBass - BASS_THRESHOLD) / 100, 0.3);
      backgroundEl.style.filter = `brightness(${1 - darkness})`;
    } else {
      backgroundEl.style.filter = 'brightness(1)';
    }
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

  // Extract dominant color from album art
  function extractDominantColor() {
    const albumArt = document.querySelector('.image.ytmusic-player-bar img');
    if (!albumArt || !albumArt.complete) return;

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 50;
      canvas.height = 50;

      ctx.drawImage(albumArt, 0, 0, 50, 50);
      const imageData = ctx.getImageData(0, 0, 50, 50).data;

      let r = 0, g = 0, b = 0, count = 0;

      for (let i = 0; i < imageData.length; i += 4) {
        // Skip very dark or very light pixels
        const brightness = (imageData[i] + imageData[i + 1] + imageData[i + 2]) / 3;
        if (brightness > 30 && brightness < 220) {
          r += imageData[i];
          g += imageData[i + 1];
          b += imageData[i + 2];
          count++;
        }
      }

      if (count > 0) {
        dominantColor = {
          r: Math.round(r / count),
          g: Math.round(g / count),
          b: Math.round(b / count)
        };

        // Update CSS variables
        document.documentElement.style.setProperty('--bg-r', dominantColor.r);
        document.documentElement.style.setProperty('--bg-g', dominantColor.g);
        document.documentElement.style.setProperty('--bg-b', dominantColor.b);

        console.log('[Living BG] Extracted color:', dominantColor);
      }
    } catch (e) {
      // Cross-origin error - use fallback color
      console.log('[Living BG] Could not extract color, using fallback');
    }
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
