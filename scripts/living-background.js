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
    for (let i = 0; i < 15; i++) {
      const orb = document.createElement('div');
      orb.className = 'living-bg-orb';
      orb.id = `living-bg-orb-${i}`;
      orb.dataset.index = i;
      bg.appendChild(orb);
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
        filter: blur(80px);
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
        filter: blur(100px);
        transition: opacity 0.15s ease-out;
        pointer-events: none;
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
        width: 3px;
        height: 3px;
        background: rgba(255, 255, 255, 0.8);
        border-radius: 50%;
        box-shadow: 0 0 10px rgba(var(--bg-r), var(--bg-g), var(--bg-b), 0.8);
        animation: float-particle 4s infinite ease-in-out;
      }
      
      @keyframes float-particle {
        0%, 100% { transform: translate(0, 0) scale(1); opacity: 0; }
        10% { opacity: 1; }
        90% { opacity: 1; }
        100% { transform: translate(var(--tx), var(--ty)) scale(0); opacity: 0; }
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
      
      /* Shimmer overlay */
      #living-bg-shimmer {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: radial-gradient(
          ellipse at center,
          rgba(255, 255, 255, var(--shimmer-intensity, 0)) 0%,
          rgba(255, 255, 255, calc(var(--shimmer-intensity, 0) * 0.5)) 30%,
          transparent 70%
        );
        background-size: 300% 300%;
        background-position: center;
        animation: shimmer-move 4s ease-in-out infinite;
        opacity: 0.8;
        filter: blur(60px);
      }
      
      @keyframes shimmer-move {
        0%, 100% { transform: scale(1) translate(0, 0); opacity: 0.6; }
        50% { transform: scale(1.2) translate(10%, -10%); opacity: 1; }
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
    document.documentElement.style.setProperty('--pulse-opacity', bassIntensity * 0.5);

    // Wave overlay intensity
    const waveOpacity = Math.min(smoothEnergy / 200, 0.3);
    document.documentElement.style.setProperty('--wave-opacity', waveOpacity);

    // Update all orbs - random flash behind album art
    const orbs = document.querySelectorAll('.living-bg-orb');

    // Fade speed based on music tempo
    const fadeSpeed = 0.3 - musicSpeed * 0.2;

    orbs.forEach((orb, i) => {
      orb.style.transition = `opacity ${fadeSpeed}s ease-out, transform ${fadeSpeed * 1.5}s ease-out`;

      // Random flash on bass hit - each orb independently
      if (isBassHit && bassIntensity > 0.3) {
        // Random chance to flash (60% chance)
        const shouldFlash = Math.random() > 0.4;

        if (shouldFlash) {
          const intensity = 0.5 + Math.random() * 0.4;
          orb.style.opacity = intensity;
          
          // Add random movement on beat
          const moveX = (Math.random() - 0.5) * 20;
          const moveY = (Math.random() - 0.5) * 20;
          orb.style.transform = `translate(${moveX}px, ${moveY}px) scale(${1 + bassIntensity * 0.3})`;
        } else {
          orb.style.opacity = baseIntensity * 0.1;
          orb.style.transform = 'translate(0, 0) scale(1)';
        }
      } else {
        // Fade out when no bass
        orb.style.opacity = baseIntensity * 0.1;
        orb.style.transform = 'translate(0, 0) scale(1)';
      }
    });

    // Spawn particles on strong bass hits
    if (isBassHit && bassIntensity > 0.5 && Math.random() > 0.7) {
      spawnParticles(3 + Math.floor(bassIntensity * 5));
    }

    // Draw connecting lines between orbs
    drawConnectingLines(bassIntensity, musicSpeed);

    // Shimmer on high frequencies
    document.documentElement.style.setProperty('--shimmer-intensity', shimmerIntensity);
  }

  // Spawn particle effects
  function spawnParticles(count) {
    const container = document.getElementById('living-bg-particles');
    if (!container) return;

    for (let i = 0; i < count; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      
      // Random starting position
      const startX = Math.random() * window.innerWidth;
      const startY = Math.random() * window.innerHeight;
      
      particle.style.left = startX + 'px';
      particle.style.top = startY + 'px';
      
      // Random movement direction
      const tx = (Math.random() - 0.5) * 200;
      const ty = (Math.random() - 0.5) * 200;
      
      particle.style.setProperty('--tx', tx + 'px');
      particle.style.setProperty('--ty', ty + 'px');
      
      // Random delay and duration
      const duration = 2 + Math.random() * 3;
      particle.style.animationDuration = duration + 's';
      particle.style.animationDelay = (Math.random() * 0.5) + 's';
      
      container.appendChild(particle);
      
      // Remove after animation
      setTimeout(() => {
        particle.remove();
      }, (duration + 0.5) * 1000);
    }
  }

  // Draw connecting lines between active orbs
  function drawConnectingLines(intensity, speed) {
    if (!linesCanvas || !linesContext) return;
    
    const ctx = linesContext;
    const width = linesCanvas.width;
    const height = linesCanvas.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    if (intensity < 0.2) return; // Don't draw lines when music is quiet
    
    // Get orb positions
    const orbs = document.querySelectorAll('.living-bg-orb');
    const activeOrbs = [];
    
    orbs.forEach(orb => {
      const opacity = parseFloat(orb.style.opacity || 0);
      if (opacity > 0.2) {
        const rect = orb.getBoundingClientRect();
        activeOrbs.push({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          opacity: opacity
        });
      }
    });
    
    // Draw lines between nearby orbs
    const maxDistance = 400 + speed * 200;
    
    ctx.strokeStyle = `rgba(${dominantColor.r}, ${dominantColor.g}, ${dominantColor.b}, ${intensity * 0.4})`;
    ctx.lineWidth = 1 + intensity * 2;
    
    for (let i = 0; i < activeOrbs.length; i++) {
      for (let j = i + 1; j < activeOrbs.length; j++) {
        const orb1 = activeOrbs[i];
        const orb2 = activeOrbs[j];
        
        const dx = orb2.x - orb1.x;
        const dy = orb2.y - orb1.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < maxDistance) {
          const opacity = (1 - distance / maxDistance) * Math.min(orb1.opacity, orb2.opacity) * intensity;
          
          ctx.globalAlpha = opacity;
          ctx.beginPath();
          ctx.moveTo(orb1.x, orb1.y);
          ctx.lineTo(orb2.x, orb2.y);
          ctx.stroke();
        }
      }
    }
    
    ctx.globalAlpha = 1;
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
