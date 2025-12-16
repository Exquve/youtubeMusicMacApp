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
  
  // Initialize random beam angles and positions
  for (let i = 0; i < 12; i++) {
    beamAngles.push(Math.random() * 360);
    beamPositions.push({
      x: 20 + Math.random() * 60, // 20-80% of screen
      y: 20 + Math.random() * 60
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
    if (!backgroundEl) return;

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

    // Calculate base intensity - should be 0 when silent
    const baseIntensity = Math.max(0, (smoothEnergy - 30) / 200);

    // Music speed/tempo detection based on energy
    const musicSpeed = Math.min(smoothEnergy / 150, 1);

    // Beat detection - sharp bass hit with improved tempo-based threshold
    const isBeat = smoothBass > 130; // Higher threshold for cleaner beat detection
    const bassIntensity = isBeat ? Math.min((smoothBass - 90) / 140, 1) : 0;

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

    // Treble for shimmer - only white/amber colors
    const shimmerIntensity = Math.min(smoothTreble / 180, 0.3);

    // Center pulse - main color, follows bass
    document.documentElement.style.setProperty('--pulse-opacity', bassIntensity * 0.4);

    // Wave overlay intensity
    const waveOpacity = Math.min(smoothEnergy / 200, 0.25);
    document.documentElement.style.setProperty('--wave-opacity', waveOpacity);

    // Update orbs - only album color, no random colors
    const orbs = document.querySelectorAll('.living-bg-orb');
    const fadeSpeed = 0.15;

    orbs.forEach((orb, i) => {
      orb.style.transition = `opacity ${fadeSpeed}s ease-out, transform ${fadeSpeed}s ease-out`;

      // Flash on beat - synchronized
      if (isBeat && bassIntensity > 0.4) {
        const shouldFlash = Math.random() > 0.5;
        if (shouldFlash) {
          const intensity = 0.5 + bassIntensity * 0.4;
          orb.style.opacity = intensity;
          orb.style.filter = 'none'; // No color shift, keep album color
          
          const moveScale = bassIntensity * 30;
          const moveX = (Math.random() - 0.5) * moveScale;
          const moveY = (Math.random() - 0.5) * moveScale;
          orb.style.transform = `translate(${moveX}px, ${moveY}px) scale(${1 + bassIntensity * 0.3})`;
        } else {
          orb.style.opacity = baseIntensity * 0.15;
          orb.style.filter = 'none';
          orb.style.transform = 'translate(0, 0) scale(1)';
        }
      } else {
        orb.style.opacity = baseIntensity * 0.1;
        orb.style.filter = 'none';
        orb.style.transform = 'translate(0, 0) scale(1)';
      }
    });

    // Update light beams - synchronized with beats
    updateLightBeams(isBeat, bassIntensity, smoothEnergy, now);

    // Update spotlights - synchronized with rhythm
    updateSpotlights(isBeat, bassIntensity, smoothTreble);

    // Spawn particles on strong bass hits
    if (isBeat && bassIntensity > 0.5 && Math.random() > 0.6) {
      spawnParticles(4 + Math.floor(bassIntensity * 8));
    }

    // Treble sparkles - white/amber only
    if (smoothTreble > 130 && Math.random() > 0.7) {
      spawnParticles(2 + Math.floor(smoothTreble / 60));
    }

    // Draw connecting lines between orbs
    drawConnectingLines(bassIntensity, musicSpeed);

    // Shimmer on high frequencies - white/warm tones, sync with treble
    const shimmer = document.getElementById('living-bg-shimmer');
    if (shimmer) {
      shimmer.style.opacity = shimmerIntensity;
    }
  }

  // Update light beams synchronized with music
  function updateLightBeams(isBeat, intensity, energy, currentTime) {
    const beamsContainer = document.getElementById('disco-beams');
    if (!beamsContainer) return;

    const beams = beamsContainer.querySelectorAll('.disco-beam');
    const isActive = energy > 70;
    
    beamsContainer.style.opacity = isActive ? Math.min(energy / 150, 0.6) : 0;

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
        
        const beamIndex = Math.floor(Math.random() * beams.length);
        
        // Only this specific beam index range gets triggered
        const shouldTrigger = i >= beamIndex && i < (beamIndex + maxBeamsPerBeat);
        
        if (shouldTrigger && Math.random() < triggerChance) {
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
          
          // Random angle change
          const angleChange = (Math.random() - 0.5) * 80;
          beamAngles[i] = (beamAngles[i] + angleChange + 360) % 360;
          beam.style.transform = `rotate(${beamAngles[i]}deg)`;
          
          // More position changes in fast music
          const positionChangeChance = isFastTempo ? 0.2 : 0.1;
          if (Math.random() < positionChangeChance) {
            beamPositions[i] = {
              x: 15 + Math.random() * 70,
              y: 15 + Math.random() * 70
            };
          }
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
    
    spots.forEach((spot, i) => {
      if (isBeat && bassIntensity > 0.5) {
        // Flash on strong beats
        spot.style.opacity = 0.5 + bassIntensity * 0.4;
        
        // Move to random position on beat
        const x = 10 + Math.random() * 80;
        const y = 10 + Math.random() * 80;
        spot.style.left = x + '%';
        spot.style.top = y + '%';
        spot.style.transform = `scale(${1 + bassIntensity * 0.5})`;
        
        // Use white or warm amber
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
      } else {
        spot.style.opacity = 0;
      }
    });
  }

  // Spawn particle effects - white and warm tones only
  function spawnParticles(count) {
    const container = document.getElementById('living-bg-particles');
    if (!container) return;

    const currentParticles = container.children.length;
    const maxParticles = 60;
    if (currentParticles >= maxParticles) return;

    count = Math.min(count, maxParticles - currentParticles);

    for (let i = 0; i < count; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      
      const startX = Math.random() * window.innerWidth;
      const startY = Math.random() * window.innerHeight;
      
      particle.style.left = startX + 'px';
      particle.style.top = startY + 'px';
      
      const tx = (Math.random() - 0.5) * 250;
      const ty = (Math.random() - 0.5) * 250;
      
      particle.style.setProperty('--tx', tx + 'px');
      particle.style.setProperty('--ty', ty + 'px');
      
      // Use only white or warm amber colors - no rainbow
      const isWarm = Math.random() > 0.5;
      if (isWarm) {
        // Warm amber/sun tone
        particle.style.background = `radial-gradient(circle, 
          rgba(255, 220, 150, 1) 0%, 
          rgba(255, 180, 80, 0.9) 50%,
          transparent 100%)`;
        particle.style.boxShadow = `
          0 0 10px rgba(255, 220, 150, 1),
          0 0 18px rgba(255, 180, 80, 0.8)`;
      } else {
        // Pure white
        particle.style.background = `radial-gradient(circle, 
          rgba(255, 255, 255, 1) 0%, 
          rgba(255, 255, 255, 0.9) 50%,
          transparent 100%)`;
        particle.style.boxShadow = `
          0 0 10px rgba(255, 255, 255, 1),
          0 0 18px rgba(255, 255, 255, 0.8)`;
      }
      particle.style.filter = 'none'; // No hue rotation
      
      const size = 3 + Math.random() * 3;
      particle.style.width = size + 'px';
      particle.style.height = size + 'px';
      
      const duration = 1.5 + Math.random() * 2;
      particle.style.animationDuration = duration + 's';
      particle.style.animationDelay = (Math.random() * 0.2) + 's';
      
      container.appendChild(particle);
      
      setTimeout(() => {
        particle.remove();
      }, (duration + 0.2) * 1000);
    }
  }

  // Draw connecting lines between active orbs - album color + white only
  function drawConnectingLines(intensity, speed) {
    if (!linesCanvas || !linesContext) return;
    
    const ctx = linesContext;
    const width = linesCanvas.width;
    const height = linesCanvas.height;
    
    ctx.clearRect(0, 0, width, height);
    
    if (intensity < 0.3) return;
    
    const orbs = document.querySelectorAll('.living-bg-orb');
    const activeOrbs = [];
    
    orbs.forEach(orb => {
      const opacity = parseFloat(orb.style.opacity || 0);
      if (opacity > 0.25) {
        const rect = orb.getBoundingClientRect();
        activeOrbs.push({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          opacity: opacity
        });
      }
    });
    
    if (activeOrbs.length < 2) return;
    
    const maxDistance = 380 + speed * 180;
    
    // Use album dominant color with white highlights
    const lineColor = dominantColor;
    const whiteBlend = Math.min(intensity, 0.4);
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
          const opacity = (1 - distance / maxDistance) * Math.min(orb1.opacity, orb2.opacity) * intensity * 0.7;
          
          ctx.globalAlpha = opacity;
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 1)`;
          ctx.lineWidth = 1.5 + intensity * 1.5;
          ctx.shadowBlur = 10;
          ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.6)`;
          
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
