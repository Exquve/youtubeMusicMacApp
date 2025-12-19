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

  // === TOGGLE STATE - Default OFF ===
  let isEnabled = false;

  let audioContext = null;
  let analyser = null;
  let dataArray = null;
  let isConnected = false;
  let animationId = null;
  let backgroundEl = null;
  let audioSource = null;
  let linesCanvas = null;
  let linesContext = null;
  let particles = [];
  let orbPositions = [];
  let beamAngles = [];
  let beamPositions = [];
  let beamActiveUntil = []; // Track when each beam should turn off
  let lastBeatTime = 0;
  let beatInterval = 500; // ms between beats
  let avgBeatInterval = 500;
  let beatHistory = [];

  // Initialize beam angles and positions deterministically based on index
  for (let i = 0; i < 12; i++) {
    // Evenly distributed angles (0, 30, 60, 90... 330 degrees)
    beamAngles.push((i * 30) % 360);
    // Distribute beams in a grid-like pattern across screen
    beamPositions.push({
      x: 20 + (i % 4) * 20, // 20, 40, 60, 80%
      y: 20 + Math.floor(i / 4) * 30 // 20, 50, 80%
    });
    beamActiveUntil.push(0);
  }

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
  let lastMidsLevel = 0;
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
    for (let i = 0; i < 15; i++) {
      const orb = document.createElement('div');
      orb.className = 'living-bg-orb';
      orb.id = `living-bg-orb-${i}`;
      orb.dataset.index = i;
      bg.appendChild(orb);
    }

    // Create disco ball light beams
    const discoBeams = document.createElement('div');
    discoBeams.id = 'disco-beams';
    bg.appendChild(discoBeams);

    for (let i = 0; i < 12; i++) {
      const beam = document.createElement('div');
      beam.className = 'disco-beam';
      beam.dataset.index = i;
      discoBeams.appendChild(beam);
    }

    // Create spotlight effects
    const spotlights = document.createElement('div');
    spotlights.id = 'disco-spotlights';
    bg.appendChild(spotlights);

    for (let i = 0; i < 6; i++) {
      const spot = document.createElement('div');
      spot.className = 'disco-spotlight';
      spot.dataset.index = i;
      spotlights.appendChild(spot);
    }

    // Create particle system
    const particlesContainer = document.createElement('div');
    particlesContainer.id = 'living-bg-particles';
    bg.appendChild(particlesContainer);

    // Create connecting lines canvas
    const linesCanvas = document.createElement('canvas');
    linesCanvas.id = 'living-bg-lines';
    linesCanvas.width = window.innerWidth;
    linesCanvas.height = window.innerHeight;
    bg.appendChild(linesCanvas);

    // Create wave overlay
    const waveOverlay = document.createElement('div');
    waveOverlay.id = 'living-bg-waves';
    bg.appendChild(waveOverlay);

    backgroundEl = bg;

    console.log('[Living BG] Background element created');
  }

  // Inject styles
  function injectStyles() {
    if (document.getElementById('living-bg-styles')) return;

    const style = document.createElement('style');
    style.id = 'living-bg-styles';
    style.textContent = `
      /* === TOGGLE SWITCH STYLES === */
      #living-bg-toggle-container {
        position: fixed;
        top: 12px;
        right: 12px;
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
        -webkit-app-region: no-drag;
        pointer-events: auto;
      }
      
      #living-bg-toggle-label {
        font-size: 11px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.7);
        letter-spacing: 0.02em;
        user-select: none;
      }
      
      #living-bg-toggle {
        position: relative;
        width: 36px;
        height: 20px;
        background: rgba(255, 255, 255, 0.15);
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.3s ease;
        border: none;
        outline: none;
        padding: 0;
      }
      
      #living-bg-toggle:hover {
        background: rgba(255, 255, 255, 0.25);
      }
      
      #living-bg-toggle::after {
        content: '';
        position: absolute;
        top: 2px;
        left: 2px;
        width: 16px;
        height: 16px;
        background: rgba(255, 255, 255, 0.8);
        border-radius: 50%;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
      }
      
      #living-bg-toggle.active {
        background: linear-gradient(135deg, #ff6b6b, #ff8e8e);
      }
      
      #living-bg-toggle.active::after {
        left: 18px;
        background: #ffffff;
      }


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
        top: 40%;
        left: 25%;
        width: 120%;
        height: 120%;
        transform: translate(-50%, -50%);
        background: radial-gradient(ellipse at center,
          rgba(var(--bg-r), var(--bg-g), var(--bg-b), var(--pulse-opacity, 0)) 0%,
          transparent 60%);
        opacity: 1;
        filter: blur(50px);
        transition: all 0.1s ease;
      }
      
      /* Ambient glow orbs - positioned behind album art area */
      .living-bg-orb {
        position: absolute;
        border-radius: 50%;
        background: radial-gradient(circle,
          rgba(var(--bg-r), var(--bg-g), var(--bg-b), 0.6) 0%,
          rgba(var(--bg-r), var(--bg-g), var(--bg-b), 0.2) 40%,
          transparent 70%);
        filter: blur(60px);
        transition: opacity 0.15s ease-out;
        pointer-events: none;
        will-change: opacity, transform;
        transform: translateZ(0); /* Force GPU acceleration */
      }
      
      /* Orbs positioned around album art area (left-center of screen) */
      #living-bg-orb-0 { top: 20%; left: 10%; width: 500px; height: 500px; }
      #living-bg-orb-1 { top: 30%; left: 20%; width: 600px; height: 600px; }
      #living-bg-orb-2 { bottom: 20%; left: 5%; width: 450px; height: 450px; }
      #living-bg-orb-3 { top: 50%; left: 30%; width: 550px; height: 550px; transform: translateY(-50%); }
      #living-bg-orb-4 { top: 60%; left: 15%; width: 400px; height: 400px; }
      #living-bg-orb-5 { top: 10%; left: 25%; width: 350px; height: 350px; }
      #living-bg-orb-6 { top: 40%; right: 10%; width: 480px; height: 480px; }
      #living-bg-orb-7 { bottom: 30%; right: 20%; width: 520px; height: 520px; }
      #living-bg-orb-8 { top: 15%; right: 30%; width: 400px; height: 400px; }
      #living-bg-orb-9 { top: 70%; left: 40%; width: 380px; height: 380px; }
      #living-bg-orb-10 { bottom: 10%; right: 15%; width: 450px; height: 450px; }
      #living-bg-orb-11 { top: 5%; left: 50%; width: 350px; height: 350px; }
      #living-bg-orb-12 { bottom: 40%; left: 25%; width: 420px; height: 420px; }
      #living-bg-orb-13 { top: 80%; right: 25%; width: 390px; height: 390px; }
      #living-bg-orb-14 { top: 35%; left: 5%; width: 460px; height: 460px; }
      
      /* Particles system */
      #living-bg-particles {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        overflow: hidden;
      }
      
      .particle {
        position: absolute;
        width: 4px;
        height: 4px;
        border-radius: 50%;
        animation: float-particle 4s infinite ease-in-out;
        will-change: transform, opacity;
      }
      
      @keyframes float-particle {
        0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); opacity: 0; }
        10% { opacity: 1; }
        50% { 
          opacity: 1; 
          transform: translate(calc(var(--tx) * 0.5), calc(var(--ty) * 0.5)) scale(1.4) rotate(180deg); 
        }
        90% { opacity: 0.8; }
        100% { 
          transform: translate(var(--tx), var(--ty)) scale(0) rotate(360deg); 
          opacity: 0; 
        }
      }
      
      /* Lines canvas */
      #living-bg-lines {
        position: absolute;
        top: 0;
        left: 0;
        pointer-events: none;
        opacity: 0.6;
        mix-blend-mode: screen;
      }
      
      /* Wave overlay */
      #living-bg-waves {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: 
          linear-gradient(0deg, transparent 30%, rgba(var(--bg-r), var(--bg-g), var(--bg-b), 0.1) 50%, transparent 70%),
          linear-gradient(90deg, transparent 30%, rgba(var(--bg-r), var(--bg-g), var(--bg-b), 0.1) 50%, transparent 70%);
        background-size: 100% 200%, 200% 100%;
        animation: wave-pulse 3s ease-in-out infinite;
        opacity: var(--wave-opacity, 0);
        pointer-events: none;
      }
      
      @keyframes wave-pulse {
        0%, 100% { background-position: 0% 0%, 0% 0%; }
        50% { background-position: 0% 100%, 100% 0%; }
      }
      
      /* DISCO BALL LIGHT BEAMS */
      #disco-beams {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.1s ease;
      }
      
      .disco-beam {
        position: absolute;
        width: 0;
        height: 3px;
        transform-origin: 0 0;
        background: linear-gradient(90deg,
          transparent 0%,
          rgba(255, 255, 255, 0.9) 10%,
          rgba(255, 255, 255, 0.6) 50%,
          transparent 100%);
        box-shadow: 0 0 20px rgba(255, 255, 255, 0.8);
        transition: width 0.05s ease-out, opacity 0.05s ease-out;
        will-change: transform, width, opacity, left, top;
      }
      
      /* DISCO SPOTLIGHTS */
      #disco-spotlights {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.1s ease;
      }
      
      .disco-spotlight {
        position: absolute;
        width: 250px;
        height: 250px;
        border-radius: 50%;
        background: radial-gradient(circle,
          rgba(255, 255, 255, 0.4) 0%,
          rgba(255, 255, 255, 0.2) 40%,
          transparent 70%);
        filter: blur(40px);
        opacity: 0;
        transition: all 0.1s ease-out;
        will-change: transform, opacity;
      }

      
      /* Shimmer overlay - white/warm tones only */
      #living-bg-shimmer {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: radial-gradient(
          ellipse at center,
          rgba(255, 255, 255, 0.8) 0%,
          rgba(255, 230, 180, 0.5) 25%,
          rgba(255, 200, 120, 0.3) 45%,
          transparent 70%
        );
        background-size: 200% 200%;
        background-position: center;
        opacity: 0;
        filter: blur(35px);
        transition: opacity 0.1s ease;
        will-change: opacity;
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

  // Create toggle switch UI
  function createToggleSwitch() {
    if (document.getElementById('living-bg-toggle-container')) return;

    const container = document.createElement('div');
    container.id = 'living-bg-toggle-container';

    // Mini Player Button (added to the left of Living BG toggle)
    const miniPlayerBtn = document.createElement('button');
    miniPlayerBtn.id = 'mini-player-btn';
    miniPlayerBtn.title = 'Open Mini Player';

    // Create SVG programmatically to avoid TrustedHTML issues
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('fill', 'currentColor');

    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', 'M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z');
    svg.appendChild(path);

    const span = document.createElement('span');
    span.textContent = 'Mini';

    miniPlayerBtn.appendChild(svg);
    miniPlayerBtn.appendChild(span);

    miniPlayerBtn.addEventListener('click', () => {
      if (window.ytMusicApp && window.ytMusicApp.send) {
        window.ytMusicApp.send('toggle-mini-player');
      }
    });

    // Add mini player button styles
    const miniPlayerStyles = document.createElement('style');
    miniPlayerStyles.id = 'mini-player-btn-styles';
    miniPlayerStyles.textContent = `
      #mini-player-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        background: rgba(255, 255, 255, 0.1);
        border: none;
        border-radius: 12px;
        color: rgba(255, 255, 255, 0.8);
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        margin-right: 8px;
      }
      
      #mini-player-btn:hover {
        background: rgba(255, 255, 255, 0.2);
        color: #ffffff;
      }
      
      #mini-player-btn:active {
        transform: scale(0.95);
      }
      
      #mini-player-btn svg {
        opacity: 0.9;
      }
    `;
    document.head.appendChild(miniPlayerStyles);

    const label = document.createElement('span');
    label.id = 'living-bg-toggle-label';
    label.textContent = 'Living BG';

    const toggle = document.createElement('button');
    toggle.id = 'living-bg-toggle';
    toggle.title = 'Toggle Living Background';
    toggle.setAttribute('aria-label', 'Toggle Living Background');

    toggle.addEventListener('click', () => {
      isEnabled = !isEnabled;
      toggle.classList.toggle('active', isEnabled);

      if (isEnabled) {
        enableLivingBackground();
      } else {
        disableLivingBackground();
      }
    });

    container.appendChild(miniPlayerBtn);
    container.appendChild(label);
    container.appendChild(toggle);
    document.body.appendChild(container);

    console.log('[Living BG] Toggle switch created');
  }

  // Enable the living background
  function enableLivingBackground() {
    console.log('[Living BG] Enabling...');

    const bg = document.getElementById('living-bg');
    if (bg) {
      bg.style.display = 'block';
    }

    // Extract colors from current album art
    extractDominantColor();

    // Try to connect audio if not already connected
    if (!isConnected) {
      connectAudio();
    }

    // Start visualization if connected
    if (isConnected && !animationId) {
      startVisualization();
    }
  }

  // Disable the living background
  function disableLivingBackground() {
    console.log('[Living BG] Disabling...');

    const bg = document.getElementById('living-bg');
    if (bg) {
      bg.style.display = 'none';
    }

    // Stop animation loop
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
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

  // Update visual effects based on audio - Sync with music rhythm
  function updateVisuals(frequencies) {
    if (!backgroundEl || !isEnabled) return;

    const { bass, mids, treble, energy } = frequencies;

    // Fast response for punchy disco feel
    const smoothBass = lastBassLevel * 0.3 + bass * 0.7;
    const smoothTreble = lastTrebleLevel * 0.5 + treble * 0.5;
    const smoothMids = lastMidsLevel * 0.4 + mids * 0.6;
    const smoothEnergy = avgEnergy * 0.6 + energy * 0.4;

    lastBassLevel = smoothBass;
    lastTrebleLevel = smoothTreble;
    lastMidsLevel = smoothMids;
    avgEnergy = smoothEnergy;

    // Calculate base intensity - very dark when silent, only bright when loud
    // Range: 0 (silent) to 1 (max energy)
    const baseIntensity = Math.pow(Math.max(0, smoothEnergy / 255), 1.5); // Exponential for darker lows

    // Music speed/tempo detection based on energy
    const musicSpeed = Math.min(smoothEnergy / 150, 1);

    // Beat detection - more sensitive for better bass response
    const isBeat = smoothBass > 100; // Lower threshold for better bass detection
    const bassIntensity = Math.min(smoothBass / 180, 1); // Continuous intensity, not just on beats

    // Detect beat timing for rhythm sync - improved beat tracking
    const now = Date.now();
    const timeSinceLastBeat = now - lastBeatTime;

    // Only register beat if enough time passed based on music tempo
    const minBeatInterval = avgBeatInterval * 0.7; // At least 70% of average beat interval

    if (isBeat && bassIntensity > 0.6 && timeSinceLastBeat > minBeatInterval) {
      const currentInterval = timeSinceLastBeat;

      // Track beat history for more accurate tempo
      beatHistory.push(currentInterval);
      if (beatHistory.length > 8) {
        beatHistory.shift();
      }

      // Calculate average beat interval from recent beats
      if (beatHistory.length >= 3) {
        avgBeatInterval = beatHistory.reduce((a, b) => a + b, 0) / beatHistory.length;
      }

      beatInterval = currentInterval;
      lastBeatTime = now;
    }

    // Treble for shimmer - exponential: very subtle at low, visible at high
    const shimmerIntensity = Math.pow(Math.min(smoothTreble / 180, 1), 1.5) * 0.6;

    // Center pulse - exponential curve for darker lows, brighter highs
    const pulseOpacity = Math.pow(Math.min(smoothBass / 220, 1), 1.3);
    document.documentElement.style.setProperty('--pulse-opacity', pulseOpacity * 0.8);

    // Wave overlay - very subtle at low energy
    const waveOpacity = Math.pow(Math.min(smoothEnergy / 200, 1), 1.5) * 0.5;
    document.documentElement.style.setProperty('--wave-opacity', waveOpacity);

    // Background brightness - exponential: dark at low bass, bright at high
    const bassBrightness = Math.pow(smoothBass / 255, 1.5); // 0-1 exponential
    const brightnessBoost = bassBrightness * 0.4; // Max 40% boost
    if (backgroundEl) {
      // Start darker (0.85) and go up with bass
      backgroundEl.style.filter = `brightness(${0.85 + brightnessBoost})`;
    }

    // Update orbs - only album color, no random colors
    const orbs = document.querySelectorAll('.living-bg-orb');
    const fadeSpeed = 0.15;

    orbs.forEach((orb, i) => {
      orb.style.transition = `opacity ${fadeSpeed}s ease-out, transform ${fadeSpeed}s ease-out`;

      // Exponential curve: very dim at low bass, bright at high
      const bassExpo = Math.pow(bassIntensity, 1.4); // Exponential for darker lows

      // NO RANDOM FLASH - continuous brightness following bass level
      // Each orb has slight variation based on index for natural look
      const orbVariation = 0.85 + (Math.sin(i * 0.7) * 0.15); // 0.7 to 1.0 variation
      const orbOpacity = bassExpo * 0.85 * orbVariation;

      // Always set opacity based on current bass (no conditions)
      orb.style.opacity = orbOpacity;
      orb.style.filter = 'none';

      // Smooth organic movement using sine waves (not random)
      const time = Date.now() * 0.001;
      const speed = 0.5 + bassExpo * 0.5; // Movement speed scales with bass
      const moveScale = bassExpo * 35;

      // Each orb moves in its own pattern based on index
      const moveX = Math.sin(i * 1.2 + time * speed) * moveScale;
      const moveY = Math.cos(i * 0.8 + time * speed) * moveScale;

      // Scale: 1.0 at low, 1.35 at max
      const scale = 1 + bassExpo * 0.35;
      orb.style.transform = `translate(${moveX}px, ${moveY}px) scale(${scale})`;
    });

    // Update light beams - synchronized with beats
    updateLightBeams(isBeat, bassIntensity, smoothEnergy, now);

    // Update spotlights - synchronized with rhythm
    updateSpotlights(isBeat, bassIntensity, smoothTreble);

    // Spawn particles - directly proportional to bass (no random)
    const bassExpoParticle = Math.pow(bassIntensity, 1.6);
    // Spawn on every beat, count proportional to bass level
    if (isBeat && bassExpoParticle > 0.1) {
      const particleCount = Math.floor(1 + bassExpoParticle * 10); // 1-11 particles
      spawnParticles(particleCount, avgBeatInterval, bassIntensity);
    }

    // Treble sparkles - directly proportional to treble (no random)
    const trebleExpo = Math.pow(Math.min(smoothTreble / 220, 1), 1.8);
    // Spawn treble particles when treble is above threshold
    if (trebleExpo > 0.15) {
      const particleCount = Math.floor(1 + trebleExpo * 4); // 1-5 particles
      spawnParticles(particleCount, avgBeatInterval, trebleExpo);
    }

    // Draw connecting lines between orbs - rhythmic
    drawConnectingLines(bassIntensity, musicSpeed, smoothBass);

    // Shimmer - exponential opacity for subtle lows
    const shimmer = document.getElementById('living-bg-shimmer');
    if (shimmer) {
      shimmer.style.opacity = shimmerIntensity;
      const shimmerScale = 1 + shimmerIntensity * 0.25;
      shimmer.style.transform = `scale(${shimmerScale})`;
    }
  }

  // Update light beams synchronized with music
  function updateLightBeams(isBeat, intensity, energy, currentTime) {
    const beamsContainer = document.getElementById('disco-beams');
    if (!beamsContainer) return;

    const beams = beamsContainer.querySelectorAll('.disco-beam');

    // Container opacity - exponential: invisible at low energy
    const energyExpo = Math.pow(energy / 200, 1.5);
    beamsContainer.style.opacity = Math.min(energyExpo, 0.7);

    // Determine music tempo: fast < 400ms, slow > 600ms
    const isFastTempo = avgBeatInterval < 450;
    const isSlowTempo = avgBeatInterval > 600;

    beams.forEach((beam, i) => {
      // Check if this beam should be active based on beat timing
      const isBeamActive = currentTime < beamActiveUntil[i];

      if (isBeat && intensity > 0.6) {
        // Adjust beam count based on tempo
        let maxBeamsPerBeat, triggerChance;

        if (isFastTempo) {
          // Fast music: many beams, very high trigger chance
          maxBeamsPerBeat = Math.ceil(3 + intensity * 5); // 3-8 beams
          triggerChance = 0.85; // 85% chance
        } else if (isSlowTempo) {
          // Slow music: very few beams, low trigger chance
          maxBeamsPerBeat = 1; // Only 1 beam
          triggerChance = 0.35; // 35% chance - sometimes no beam at all
        } else {
          // Medium tempo
          maxBeamsPerBeat = Math.ceil(1 + intensity * 3); // 1-4 beams
          triggerChance = 0.65; // 65% chance
        }

        // Beams activate sequentially based on current time (rotational pattern)
        const rotationOffset = Math.floor(currentTime / 200) % beams.length;
        const beamIndex = (rotationOffset + Math.floor(i * intensity * 2)) % beams.length;

        // Activate beams in sequence, amount based on intensity
        const shouldTrigger = i < maxBeamsPerBeat;

        if (shouldTrigger && triggerChance > 0.3) {
          // Calculate beam duration based on music tempo
          let beamDuration;
          if (isFastTempo) {
            // Fast music: shorter beams (50-60% of interval)
            beamDuration = avgBeatInterval * 0.55;
          } else {
            // Slow music: longer beams (70-90% of interval)
            beamDuration = Math.min(avgBeatInterval * 0.85, 700);
          }

          beamActiveUntil[i] = currentTime + beamDuration;

          // Set beam properties
          const length = 350 + intensity * 450;
          beam.style.width = length + 'px';
          beam.style.opacity = 0.6 + intensity * 0.4;

          // Set position
          beam.style.left = beamPositions[i].x + '%';
          beam.style.top = beamPositions[i].y + '%';

          // Angle follows intensity - smooth rotation based on time and frequency
          const angleSpeed = 0.05 + intensity * 0.15; // Faster at higher intensity
          const baseAngle = (i * 30) + (currentTime * angleSpeed) % 360;
          const intensityWobble = Math.sin(currentTime * 0.003 + i) * intensity * 30;
          beamAngles[i] = (baseAngle + intensityWobble + 360) % 360;
          beam.style.transform = `rotate(${beamAngles[i]}deg)`;

          // Position follows a smooth pattern based on time and index (no random)
          const posX = 20 + (i % 4) * 20 + Math.sin(currentTime * 0.001 + i * 0.5) * intensity * 15;
          const posY = 20 + Math.floor(i / 4) * 30 + Math.cos(currentTime * 0.001 + i * 0.7) * intensity * 15;
          beamPositions[i] = { x: posX, y: posY };
        }
      }

      // Turn off beam if duration expired
      if (!isBeamActive) {
        beam.style.width = '0px';
        beam.style.opacity = 0;
      }
    });
  }

  // Update spotlights synchronized with music
  function updateSpotlights(isBeat, bassIntensity, treble) {
    const spotlightsContainer = document.getElementById('disco-spotlights');
    if (!spotlightsContainer) return;

    const spots = spotlightsContainer.querySelectorAll('.disco-spotlight');

    // Exponential bass for spotlights
    const bassExpo = Math.pow(bassIntensity, 1.5);

    spots.forEach((spot, i) => {
      // Spotlights continuously follow bass level (no random, no beat-only)
      // Opacity exponential: very dim at low bass
      spot.style.opacity = bassExpo * 0.8;
      spot.style.transition = 'opacity 0.15s ease-out, transform 0.15s ease-out, left 0.3s ease-out, top 0.3s ease-out';

      // Position follows smooth sine pattern based on index and time (no random)
      const time = Date.now() * 0.001;
      const speed = 0.3 + bassExpo * 0.3;
      // Each spotlight has unique movement pattern based on index
      const x = 25 + (i % 3) * 25 + Math.sin(time * speed + i * 1.5) * bassExpo * 20;
      const y = 25 + Math.floor(i / 3) * 25 + Math.cos(time * speed + i * 1.2) * bassExpo * 20;
      spot.style.left = x + '%';
      spot.style.top = y + '%';
      spot.style.transform = `scale(${1 + bassExpo * 0.5})`;

      // Color based on treble level (deterministic, not random)
      const useWarm = treble > 140;
      if (useWarm) {
        // Warm amber/sun color
        spot.style.background = `radial-gradient(circle,
            rgba(255, 200, 100, 0.5) 0%,
            rgba(255, 180, 80, 0.3) 40%,
            transparent 70%)`;
      } else {
        // Pure white
        spot.style.background = `radial-gradient(circle,
            rgba(255, 255, 255, 0.4) 0%,
            rgba(255, 255, 255, 0.2) 40%,
            transparent 70%)`;
      }
    });
  }

  // Spawn particle effects - white and warm tones only, tempo-aware
  // particleIndex is used for deterministic positioning
  let particleSpawnIndex = 0;

  function spawnParticles(count, beatInterval, intensity) {
    const container = document.getElementById('living-bg-particles');
    if (!container) return;

    const currentParticles = container.children.length;
    const maxParticles = 60;
    if (currentParticles >= maxParticles) return;

    count = Math.min(count, maxParticles - currentParticles);

    // Calculate animation speed based on music tempo
    const isFastMusic = beatInterval < 450;
    const isSlowMusic = beatInterval > 600;
    const intVal = intensity || 0.5;

    for (let i = 0; i < count; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';

      // Deterministic position based on spawn index (golden ratio distribution)
      particleSpawnIndex++;
      const goldenRatio = 0.618033988749895;
      const normalizedPos = (particleSpawnIndex * goldenRatio) % 1;
      const angle = particleSpawnIndex * goldenRatio * Math.PI * 2;

      // Distribute across screen using golden ratio spiral
      const startX = (0.1 + normalizedPos * 0.8) * window.innerWidth;
      const startY = (0.1 + ((particleSpawnIndex * goldenRatio * 0.7) % 0.8)) * window.innerHeight;

      particle.style.left = startX + 'px';
      particle.style.top = startY + 'px';

      // Movement direction based on angle from spawn index (no random)
      const moveScale = (isFastMusic ? 300 : isSlowMusic ? 180 : 250) * intVal;
      const tx = Math.cos(angle) * moveScale;
      const ty = Math.sin(angle) * moveScale;

      particle.style.setProperty('--tx', tx + 'px');
      particle.style.setProperty('--ty', ty + 'px');

      // Alternate colors based on index (no random) - warm for even, white for odd
      const isWarm = (particleSpawnIndex % 2) === 0;
      if (isWarm) {
        particle.style.background = `radial-gradient(circle, 
          rgba(255, 220, 150, 1) 0%, 
          rgba(255, 180, 80, 0.9) 50%,
          transparent 100%)`;
        particle.style.boxShadow = `
          0 0 10px rgba(255, 220, 150, 1),
          0 0 18px rgba(255, 180, 80, 0.8)`;
      } else {
        particle.style.background = `radial-gradient(circle, 
          rgba(255, 255, 255, 1) 0%, 
          rgba(255, 255, 255, 0.9) 50%,
          transparent 100%)`;
        particle.style.boxShadow = `
          0 0 10px rgba(255, 255, 255, 1),
          0 0 18px rgba(255, 255, 255, 0.8)`;
      }
      particle.style.filter = 'none';

      // Size based on index pattern (no random)
      const size = 3 + (particleSpawnIndex % 4);
      particle.style.width = size + 'px';
      particle.style.height = size + 'px';

      // Animation duration based on music tempo and index (no random)
      let baseDuration;
      if (isFastMusic) {
        baseDuration = 0.8 + (particleSpawnIndex % 5) * 0.24; // 0.8-2s for fast music
      } else if (isSlowMusic) {
        baseDuration = 2 + (particleSpawnIndex % 5) * 0.5; // 2-4.5s for slow music
      } else {
        baseDuration = 1.5 + (particleSpawnIndex % 5) * 0.4; // 1.5-3.5s for medium
      }
      const duration = baseDuration * (0.8 + intVal * 0.4);

      particle.style.animationDuration = duration + 's';
      particle.style.animationDelay = ((particleSpawnIndex % 5) * 0.04) + 's';

      container.appendChild(particle);

      setTimeout(() => {
        particle.remove();
      }, (duration + 0.2) * 1000);
    }
  }

  // Draw connecting lines between active orbs - completely proportional to bass
  function drawConnectingLines(intensity, speed, currentBass) {
    if (!linesCanvas || !linesContext) return;

    const ctx = linesContext;
    const width = linesCanvas.width;
    const height = linesCanvas.height;

    ctx.clearRect(0, 0, width, height);

    // Lines only visible at meaningful bass levels - exponential visibility
    const lineIntensity = Math.pow(intensity, 1.4);
    if (lineIntensity < 0.1) return; // Skip if very low

    const orbs = document.querySelectorAll('.living-bg-orb');
    const activeOrbs = [];

    orbs.forEach(orb => {
      const opacity = parseFloat(orb.style.opacity || 0);
      if (opacity > 0.15) { // Only connect visible orbs
        const rect = orb.getBoundingClientRect();
        activeOrbs.push({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          opacity: opacity
        });
      }
    });

    if (activeOrbs.length < 2) return;

    // Distance exponential: short at low bass, long at high
    const maxDistance = 200 + lineIntensity * 400;

    // Color blend exponential
    const lineColor = dominantColor;
    const whiteBlend = Math.min(lineIntensity * 1.3, 0.55);
    const r = lineColor.r * (1 - whiteBlend) + 255 * whiteBlend;
    const g = lineColor.g * (1 - whiteBlend) + 255 * whiteBlend;
    const b = lineColor.b * (1 - whiteBlend) + 255 * whiteBlend;

    for (let i = 0; i < activeOrbs.length; i++) {
      for (let j = i + 1; j < activeOrbs.length; j++) {
        const orb1 = activeOrbs[i];
        const orb2 = activeOrbs[j];

        const dx = orb2.x - orb1.x;
        const dy = orb2.y - orb1.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < maxDistance) {
          // Opacity exponential
          const distanceFactor = (1 - distance / maxDistance);
          const opacityPulse = distanceFactor * Math.min(orb1.opacity, orb2.opacity) * lineIntensity;

          ctx.globalAlpha = opacityPulse;
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 1)`;

          // Line width exponential: thin at low, thick at high
          ctx.lineWidth = 0.3 + lineIntensity * 3;
          ctx.shadowBlur = 3 + lineIntensity * 18;
          ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${lineIntensity * 0.7})`;

          ctx.beginPath();
          ctx.moveTo(orb1.x, orb1.y);
          ctx.lineTo(orb2.x, orb2.y);
          ctx.stroke();
        }
      }
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
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

  // Animation loop - capped at 30 FPS for better performance
  function startVisualization() {
    const targetFPS = 30;
    const frameDelay = 1000 / targetFPS;
    let lastFrameTime = 0;

    function animate(currentTime) {
      animationId = requestAnimationFrame(animate);

      // Throttle to 30 FPS
      const deltaTime = currentTime - lastFrameTime;
      if (deltaTime < frameDelay) return;

      lastFrameTime = currentTime - (deltaTime % frameDelay);

      const frequencies = analyzeFrequencies();
      updateVisuals(frequencies);
    }
    animate(0);
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

            // Use larger canvas for better accuracy
            const size = 100;
            canvas.width = size;
            canvas.height = size;

            ctx.drawImage(img, 0, 0, size, size);

            // Sample from CENTER region (skip edges which often have borders/text)
            const margin = 20;
            const sampleWidth = size - margin * 2;
            const sampleHeight = size - margin * 2;
            const imageData = ctx.getImageData(margin, margin, sampleWidth, sampleHeight).data;

            // Group colors by hue (more intuitive for dominant color)
            const hueGroups = {};

            for (let i = 0; i < imageData.length; i += 4) {
              const r = imageData[i];
              const g = imageData[i + 1];
              const b = imageData[i + 2];

              // Skip very dark or very light
              const brightness = (r + g + b) / 3;
              if (brightness < 25 || brightness > 240) continue;

              // Skip grayscale
              const max = Math.max(r, g, b);
              const min = Math.min(r, g, b);
              if (max - min < 15) continue;

              // Calculate hue (simplified)
              let hue = 0;
              const d = max - min;
              if (max === r) hue = ((g - b) / d) % 6;
              else if (max === g) hue = (b - r) / d + 2;
              else hue = (r - g) / d + 4;
              hue = Math.round((hue * 60 + 360) % 360);

              // Group by hue ranges (30 degree buckets)
              const hueBucket = Math.floor(hue / 30) * 30;

              if (!hueGroups[hueBucket]) {
                hueGroups[hueBucket] = { r: 0, g: 0, b: 0, count: 0 };
              }
              hueGroups[hueBucket].r += r;
              hueGroups[hueBucket].g += g;
              hueGroups[hueBucket].b += b;
              hueGroups[hueBucket].count++;
            }

            // Find the most common hue group
            let bestColor = { r: 150, g: 100, b: 200 }; // Purple default
            let bestCount = 0;

            for (const hue in hueGroups) {
              const group = hueGroups[hue];
              if (group.count > bestCount) {
                bestCount = group.count;
                bestColor = {
                  r: Math.round(group.r / group.count),
                  g: Math.round(group.g / group.count),
                  b: Math.round(group.b / group.count)
                };
              }
            }

            dominantColor = bestColor;
            updateColorVariables();
            console.log('[Living BG] ✓ Color extracted:', `rgb(${bestColor.r}, ${bestColor.g}, ${bestColor.b})`);

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
    // Function to extract and send track info to mini player
    const updateTrackInfo = () => {
      setTimeout(() => {
        extractDominantColor();

        // Send track info to mini player
        if (window.ytMusicApp && window.ytMusicApp.send) {
          const titleEl = document.querySelector('.title.ytmusic-player-bar');
          const artistEl = document.querySelector('.byline.ytmusic-player-bar');
          const playBtn = document.querySelector('.play-pause-button');

          // Try multiple selectors for thumbnail
          let thumbnail = '';
          const thumbnailSelectors = [
            'ytmusic-player-bar .image img',
            'ytmusic-player-bar img.image',
            '.middle-controls .image img',
            'ytmusic-player-bar .thumbnail img',
            '#song-image img',
            '.player-bar img'
          ];

          for (const selector of thumbnailSelectors) {
            const el = document.querySelector(selector);
            if (el && el.src) {
              thumbnail = el.src;
              break;
            }
          }

          // If still no thumbnail, try to get from style background-image
          if (!thumbnail) {
            const bgEl = document.querySelector('ytmusic-player-bar .image');
            if (bgEl) {
              const bgImage = window.getComputedStyle(bgEl).backgroundImage;
              if (bgImage && bgImage !== 'none') {
                thumbnail = bgImage.replace(/^url\(['"]?/, '').replace(/['"]?\)$/, '');
              }
            }
          }

          const isPlaying = playBtn?.getAttribute('title')?.toLowerCase().includes('pause') ||
            playBtn?.getAttribute('aria-label')?.toLowerCase().includes('pause');

          const trackInfo = {
            title: titleEl?.textContent?.trim() || 'Not Playing',
            artist: artistEl?.textContent?.trim() || '-',
            thumbnail: thumbnail,
            isPlaying: isPlaying
          };

          window.ytMusicApp.send('track-info-update', trackInfo);
        }
      }, 500);
    };

    // Initial update
    setTimeout(updateTrackInfo, 2000);

    // Watch for changes
    const observer = new MutationObserver(updateTrackInfo);

    const playerBar = document.querySelector('ytmusic-player-bar');
    if (playerBar) {
      observer.observe(playerBar, { subtree: true, childList: true, attributes: true });
    }

    // Also watch for play/pause state changes and progress
    setInterval(() => {
      if (window.ytMusicApp && window.ytMusicApp.send) {
        const playBtn = document.querySelector('.play-pause-button');
        const isPlaying = playBtn?.getAttribute('title')?.toLowerCase().includes('pause') ||
          playBtn?.getAttribute('aria-label')?.toLowerCase().includes('pause');

        // Get time info from player bar
        const timeInfo = document.querySelector('.time-info.ytmusic-player-bar');
        const progressBar = document.querySelector('#progress-bar');

        let currentTime = '0:00';
        let totalTime = '0:00';
        let progress = 0;

        if (timeInfo) {
          const timeText = timeInfo.textContent?.trim() || '';
          const timeParts = timeText.split('/').map(t => t.trim());
          if (timeParts.length === 2) {
            currentTime = timeParts[0];
            totalTime = timeParts[1];
          }
        }

        // Try to get progress from slider
        if (progressBar) {
          const value = progressBar.getAttribute('value');
          if (value) {
            progress = parseFloat(value);
          }
        }

        // Alternative: try tp-yt-paper-slider
        if (progress === 0) {
          const slider = document.querySelector('#progress-bar tp-yt-paper-slider, tp-yt-paper-slider#progress-bar, #sliderBar');
          if (slider) {
            const value = slider.getAttribute('value');
            const max = slider.getAttribute('max') || slider.getAttribute('aria-valuemax');
            if (value && max) {
              progress = (parseFloat(value) / parseFloat(max)) * 100;
            }
          }
        }

        // Check like/dislike status
        let isLiked = false;
        let isDisliked = false;

        // Find the like button renderer in the player bar
        const playerBar = document.querySelector('ytmusic-player-bar');
        if (playerBar) {
          const likeButtonRenderer = playerBar.querySelector('ytmusic-like-button-renderer');
          if (likeButtonRenderer) {
            // Check the like-status attribute
            const likeStatus = likeButtonRenderer.getAttribute('like-status');
            console.log('[Mini Player] Like status:', likeStatus);

            if (likeStatus === 'LIKE') {
              isLiked = true;
            } else if (likeStatus === 'DISLIKE') {
              isDisliked = true;
            }
            // INDIFFERENT means neither liked nor disliked
          }
        }

        window.ytMusicApp.send('track-info-update', {
          isPlaying,
          currentTime,
          totalTime,
          progress,
          isLiked,
          isDisliked
        });
      }
    }, 500);
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
    createToggleSwitch();

    // Initialize canvas for lines
    linesCanvas = document.getElementById('living-bg-lines');
    if (linesCanvas) {
      linesContext = linesCanvas.getContext('2d');

      // Handle window resize
      window.addEventListener('resize', () => {
        linesCanvas.width = window.innerWidth;
        linesCanvas.height = window.innerHeight;
      });
    }

    // === DEFAULT STATE: DISABLED ===
    // Hide the background element initially
    const bg = document.getElementById('living-bg');
    if (bg) {
      bg.style.display = 'none';
    }

    // Setup interaction handler for audio context (will connect when enabled)
    setupInteractionHandler();

    // Watch for song changes (for color extraction when enabled)
    setTimeout(() => {
      watchSongChanges();
    }, 3000);

    console.log('[Living BG] Ready! Toggle switch is in the top-right corner.');
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 1000);
  }
})();
