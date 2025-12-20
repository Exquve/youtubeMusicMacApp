// Living Background Pro - Professional Audio Reactive Visualizer
// Hz-based frequency analysis with Sub-Bass, Bass, Low-Mids, Mids, High-Mids, Treble
// Created: 2024

(function () {
  'use strict';

  // Prevent re-initialization
  if (window.__livingBgProInitialized) {
    console.log('[Living BG Pro] Already initialized, skipping...');
    return;
  }
  window.__livingBgProInitialized = true;

  console.log('[Living BG Pro] Initializing professional audio visualizer...');

  // ============================================
  // CONFIGURATION
  // ============================================
  
  const CONFIG = {
    FFT_SIZE: 2048,           // High resolution for accurate frequency analysis
    SMOOTHING: 0.75,          // Temporal smoothing
    TARGET_FPS: 60,           // Target frame rate
    MIN_FPS: 30,              // Minimum acceptable FPS
    MAX_PARTICLES: 100,       // Maximum particle count
    
    // Frequency bands in Hz (based on audio engineering standards)
    FREQ_BANDS: {
      SUB_BASS:  { min: 20,   max: 60,    name: 'Sub-Bass',  color: { r: 80, g: 40, b: 120 } },
      BASS:      { min: 60,   max: 250,   name: 'Bass',      color: { r: 60, g: 80, b: 180 } },
      LOW_MIDS:  { min: 250,  max: 500,   name: 'Low-Mids',  color: { r: 80, g: 140, b: 160 } },
      MIDS:      { min: 500,  max: 2000,  name: 'Mids',      color: { r: 120, g: 180, b: 140 } },
      HIGH_MIDS: { min: 2000, max: 4000,  name: 'High-Mids', color: { r: 180, g: 160, b: 100 } },
      TREBLE:    { min: 4000, max: 20000, name: 'Treble',    color: { r: 200, g: 140, b: 160 } }
    }
  };

  // ============================================
  // STATE
  // ============================================
  
  let isEnabled = false;
  let audioContext = null;
  let analyser = null;
  let frequencyData = null;
  let timeData = null;
  let isConnected = false;
  let animationId = null;
  let lastFrameTime = 0;
  let frameCount = 0;
  let currentFPS = 60;
  
  // Frequency band levels (0-1)
  let bandLevels = {
    subBass: 0,
    bass: 0,
    lowMids: 0,
    mids: 0,
    highMids: 0,
    treble: 0
  };
  
  // Smoothed levels for visual smoothness
  let smoothedLevels = { ...bandLevels };
  
  // Beat detection state
  let beatState = {
    lastBeatTime: 0,
    beatThreshold: 0.6,
    adaptiveThreshold: 0.6,
    energyHistory: [],
    bpm: 120,
    beatPhase: 0,
    isBeat: false
  };
  
  // Album art dominant color
  let dominantColor = { r: 100, g: 80, b: 160 };
  
  // Visual elements
  let canvas = null;
  let ctx = null;
  let particles = [];
  let orbs = [];
  let auroraPhase = 0;

  // ============================================
  // AUDIO ANALYSIS
  // ============================================
  
  // Convert frequency (Hz) to FFT bin index
  function freqToIndex(freq) {
    const nyquist = audioContext.sampleRate / 2;
    const binCount = analyser.frequencyBinCount;
    return Math.round(freq / nyquist * binCount);
  }
  
  // Analyze frequency bands with Hz precision
  function analyzeFrequencyBands() {
    if (!analyser || !frequencyData) return;
    
    analyser.getByteFrequencyData(frequencyData);
    
    const bands = CONFIG.FREQ_BANDS;
    
    // Calculate energy for each frequency band
    for (const [key, band] of Object.entries(bands)) {
      const startIndex = freqToIndex(band.min);
      const endIndex = freqToIndex(band.max);
      
      let sum = 0;
      let count = 0;
      
      for (let i = startIndex; i <= endIndex && i < frequencyData.length; i++) {
        sum += frequencyData[i];
        count++;
      }
      
      // Normalize to 0-1 range
      const avgLevel = count > 0 ? (sum / count) / 255 : 0;
      
      // Map key to camelCase
      const levelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase()).toLowerCase();
      const camelKey = levelKey.charAt(0).toLowerCase() + levelKey.slice(1);
      
      // Apply different emphasis for different bands
      let emphasized = avgLevel;
      if (key === 'SUB_BASS' || key === 'BASS') {
        emphasized = Math.pow(avgLevel, 0.8); // Boost low frequencies
      } else if (key === 'TREBLE') {
        emphasized = Math.pow(avgLevel, 1.2); // Gentle rolloff for highs
      }
      
      bandLevels[camelKey] = emphasized;
    }
    
    // Smooth the levels for visual continuity
    const smoothFactor = 0.15;
    for (const key of Object.keys(smoothedLevels)) {
      smoothedLevels[key] = smoothedLevels[key] * (1 - smoothFactor) + bandLevels[key] * smoothFactor;
    }
  }
  
  // Professional beat detection using energy flux
  function detectBeat() {
    const now = performance.now();
    const timeSinceBeat = now - beatState.lastBeatTime;
    
    // Calculate total energy weighted towards bass
    const energy = (
      bandLevels.subBass * 2.0 +
      bandLevels.bass * 1.5 +
      bandLevels.lowMids * 0.8 +
      bandLevels.mids * 0.5
    ) / 4.8;
    
    // Add to energy history for adaptive threshold
    beatState.energyHistory.push(energy);
    if (beatState.energyHistory.length > 43) { // ~0.7 seconds at 60fps
      beatState.energyHistory.shift();
    }
    
    // Calculate adaptive threshold
    const avgEnergy = beatState.energyHistory.reduce((a, b) => a + b, 0) / beatState.energyHistory.length;
    beatState.adaptiveThreshold = avgEnergy * 1.4 + 0.1;
    
    // Minimum time between beats (prevents double triggers)
    const minBeatInterval = 200; // ms (300 BPM max)
    
    // Detect beat
    beatState.isBeat = false;
    if (energy > beatState.adaptiveThreshold && timeSinceBeat > minBeatInterval) {
      beatState.isBeat = true;
      
      // Estimate BPM from beat intervals
      if (timeSinceBeat < 2000 && timeSinceBeat > 200) {
        const instantBPM = 60000 / timeSinceBeat;
        beatState.bpm = beatState.bpm * 0.9 + instantBPM * 0.1; // Smooth BPM
      }
      
      beatState.lastBeatTime = now;
      beatState.beatPhase = 0;
    }
    
    // Update beat phase (0-1 cycle)
    const beatInterval = 60000 / beatState.bpm;
    beatState.beatPhase = (timeSinceBeat % beatInterval) / beatInterval;
    
    return beatState.isBeat;
  }

  // ============================================
  // VISUAL EFFECTS
  // ============================================
  
  // Initialize canvas and visual elements
  function initializeVisuals() {
    // Create main canvas
    canvas = document.getElementById('living-bg-canvas');
    if (!canvas) return;
    
    ctx = canvas.getContext('2d');
    resizeCanvas();
    
    // Initialize orbs
    orbs = [
      { x: 0.3, y: 0.4, radius: 0.25, band: 'subBass', opacity: 0 },
      { x: 0.7, y: 0.3, radius: 0.22, band: 'bass', opacity: 0 },
      { x: 0.5, y: 0.6, radius: 0.20, band: 'lowMids', opacity: 0 },
      { x: 0.2, y: 0.7, radius: 0.18, band: 'mids', opacity: 0 },
      { x: 0.8, y: 0.65, radius: 0.16, band: 'highMids', opacity: 0 }
    ];
    
    window.addEventListener('resize', resizeCanvas);
  }
  
  function resizeCanvas() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  
  // Render aurora-style gradient background
  function renderAurora(time) {
    if (!ctx) return;
    
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear with dark base
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    
    // Aurora phase advances based on overall energy
    const totalEnergy = (smoothedLevels.bass + smoothedLevels.mids + smoothedLevels.treble) / 3;
    auroraPhase += 0.002 + totalEnergy * 0.005;
    
    // Create multiple aurora layers
    const layers = [
      { band: 'subBass', yOffset: 0.3, amplitude: 0.15, speed: 0.3 },
      { band: 'bass', yOffset: 0.4, amplitude: 0.2, speed: 0.5 },
      { band: 'lowMids', yOffset: 0.5, amplitude: 0.18, speed: 0.7 },
      { band: 'mids', yOffset: 0.55, amplitude: 0.12, speed: 1.0 }
    ];
    
    for (const layer of layers) {
      const level = smoothedLevels[layer.band];
      if (level < 0.05) continue;
      
      // Create gradient for this aurora layer
      const baseY = height * layer.yOffset;
      const waveAmplitude = height * layer.amplitude * level;
      
      // Mix dominant color with band-specific color
      const bandInfo = Object.values(CONFIG.FREQ_BANDS).find(b => 
        b.name.replace('-', '').toLowerCase() === layer.band.toLowerCase()
      ) || CONFIG.FREQ_BANDS.BASS;
      
      const r = Math.round(dominantColor.r * 0.6 + bandInfo.color.r * 0.4);
      const g = Math.round(dominantColor.g * 0.6 + bandInfo.color.g * 0.4);
      const b = Math.round(dominantColor.b * 0.6 + bandInfo.color.b * 0.4);
      
      // Draw flowing aurora shape
      ctx.beginPath();
      ctx.moveTo(0, height);
      
      for (let x = 0; x <= width; x += 10) {
        const wave1 = Math.sin((x / width) * Math.PI * 2 + auroraPhase * layer.speed) * waveAmplitude;
        const wave2 = Math.sin((x / width) * Math.PI * 4 + auroraPhase * layer.speed * 1.3) * waveAmplitude * 0.5;
        const wave3 = Math.sin((x / width) * Math.PI * 6 + auroraPhase * layer.speed * 0.7) * waveAmplitude * 0.3;
        
        const y = baseY + wave1 + wave2 + wave3;
        ctx.lineTo(x, y);
      }
      
      ctx.lineTo(width, height);
      ctx.closePath();
      
      // Create gradient fill
      const gradient = ctx.createLinearGradient(0, baseY - waveAmplitude * 2, 0, height);
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
      gradient.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, ${level * 0.3})`);
      gradient.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, ${level * 0.15})`);
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      
      ctx.fillStyle = gradient;
      ctx.fill();
    }
  }
  
  // Render glowing orbs
  function renderOrbs(time) {
    if (!ctx) return;
    
    for (const orb of orbs) {
      const level = smoothedLevels[orb.band];
      
      // Smooth opacity transition
      const targetOpacity = Math.pow(level, 0.8);
      orb.opacity = orb.opacity * 0.9 + targetOpacity * 0.1;
      
      if (orb.opacity < 0.02) continue;
      
      const x = canvas.width * orb.x;
      const y = canvas.height * orb.y;
      const baseRadius = Math.min(canvas.width, canvas.height) * orb.radius;
      const radius = baseRadius * (0.8 + level * 0.4);
      
      // Create radial gradient for glow
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      
      const r = dominantColor.r;
      const g = dominantColor.g;
      const b = dominantColor.b;
      
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${orb.opacity * 0.6})`);
      gradient.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${orb.opacity * 0.3})`);
      gradient.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, ${orb.opacity * 0.1})`);
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  // Particle class
  class Particle {
    constructor(x, y, band) {
      this.x = x;
      this.y = y;
      this.band = band;
      this.life = 1;
      this.maxLife = 2 + Math.random() * 2;
      
      // Different behaviors based on frequency band
      if (band === 'subBass' || band === 'bass') {
        this.size = 4 + Math.random() * 6;
        this.speed = 0.3 + Math.random() * 0.3;
        this.decay = 0.008;
      } else if (band === 'mids' || band === 'lowMids') {
        this.size = 2 + Math.random() * 3;
        this.speed = 0.5 + Math.random() * 0.5;
        this.decay = 0.012;
      } else {
        this.size = 1 + Math.random() * 2;
        this.speed = 0.8 + Math.random() * 0.8;
        this.decay = 0.018;
      }
      
      // Random direction with upward bias
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.8;
      this.vx = Math.cos(angle) * this.speed;
      this.vy = Math.sin(angle) * this.speed;
    }
    
    update(deltaTime) {
      this.x += this.vx * deltaTime * 0.06;
      this.y += this.vy * deltaTime * 0.06;
      this.vy -= 0.001 * deltaTime; // Slight upward drift
      this.life -= this.decay * deltaTime * 0.06;
      return this.life > 0;
    }
    
    render(ctx) {
      const alpha = Math.pow(this.life, 0.5);
      const currentSize = this.size * (0.5 + this.life * 0.5);
      
      const r = dominantColor.r;
      const g = dominantColor.g;
      const b = dominantColor.b;
      
      // Glow effect
      const gradient = ctx.createRadialGradient(
        this.x, this.y, 0,
        this.x, this.y, currentSize * 2
      );
      gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.8})`);
      gradient.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, ${alpha * 0.5})`);
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(this.x, this.y, currentSize * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  // Spawn particles based on frequency levels
  function spawnParticles() {
    if (particles.length >= CONFIG.MAX_PARTICLES) return;
    
    // Spawn on beat
    if (beatState.isBeat) {
      const count = 3 + Math.floor(smoothedLevels.bass * 8);
      for (let i = 0; i < count && particles.length < CONFIG.MAX_PARTICLES; i++) {
        const x = Math.random() * canvas.width;
        const y = canvas.height * (0.6 + Math.random() * 0.3);
        particles.push(new Particle(x, y, 'bass'));
      }
    }
    
    // Continuous spawn for mids (melodic content)
    if (smoothedLevels.mids > 0.3 && Math.random() < smoothedLevels.mids * 0.3) {
      const x = Math.random() * canvas.width;
      const y = canvas.height * (0.4 + Math.random() * 0.4);
      particles.push(new Particle(x, y, 'mids'));
    }
    
    // Treble sparkles
    if (smoothedLevels.treble > 0.4 && Math.random() < smoothedLevels.treble * 0.4) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height * 0.7;
      particles.push(new Particle(x, y, 'treble'));
    }
  }
  
  // Update and render particles
  function updateParticles(deltaTime) {
    if (!ctx) return;
    
    // Update
    particles = particles.filter(p => p.update(deltaTime));
    
    // Render
    for (const particle of particles) {
      particle.render(ctx);
    }
  }
  
  // Render waveform visualization at bottom
  function renderWaveform() {
    if (!ctx || !analyser || !timeData) return;
    
    analyser.getByteTimeDomainData(timeData);
    
    const width = canvas.width;
    const height = canvas.height;
    const waveHeight = height * 0.08;
    const baseY = height - waveHeight / 2 - 20;
    
    // Draw waveform
    ctx.beginPath();
    ctx.strokeStyle = `rgba(${dominantColor.r}, ${dominantColor.g}, ${dominantColor.b}, 0.4)`;
    ctx.lineWidth = 2;
    
    const sliceWidth = width / timeData.length;
    let x = 0;
    
    for (let i = 0; i < timeData.length; i++) {
      const v = timeData[i] / 128.0 - 1;
      const y = baseY + v * waveHeight;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      
      x += sliceWidth;
    }
    
    ctx.stroke();
    
    // Add glow
    ctx.shadowColor = `rgba(${dominantColor.r}, ${dominantColor.g}, ${dominantColor.b}, 0.5)`;
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  
  // Render frequency bars at bottom
  function renderFrequencyBars() {
    if (!ctx) return;
    
    const width = canvas.width;
    const height = canvas.height;
    const barHeight = 60;
    const baseY = height - 10;
    
    const bands = ['subBass', 'bass', 'lowMids', 'mids', 'highMids', 'treble'];
    const barWidth = width / bands.length - 4;
    
    bands.forEach((band, i) => {
      const level = smoothedLevels[band];
      const x = i * (barWidth + 4) + 2;
      const h = level * barHeight;
      
      // Bar gradient
      const gradient = ctx.createLinearGradient(x, baseY, x, baseY - h);
      gradient.addColorStop(0, `rgba(${dominantColor.r}, ${dominantColor.g}, ${dominantColor.b}, 0.8)`);
      gradient.addColorStop(1, `rgba(${dominantColor.r}, ${dominantColor.g}, ${dominantColor.b}, 0.2)`);
      
      ctx.fillStyle = gradient;
      ctx.fillRect(x, baseY - h, barWidth, h);
      
      // Top glow
      ctx.shadowColor = `rgba(${dominantColor.r}, ${dominantColor.g}, ${dominantColor.b}, 0.8)`;
      ctx.shadowBlur = 8;
      ctx.fillRect(x, baseY - h, barWidth, 2);
      ctx.shadowBlur = 0;
    });
  }
  
  // Beat flash effect
  function renderBeatFlash() {
    if (!ctx || !beatState.isBeat) return;
    
    const gradient = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, 0,
      canvas.width / 2, canvas.height / 2, canvas.width * 0.8
    );
    
    const intensity = Math.min(smoothedLevels.bass * 0.3, 0.2);
    gradient.addColorStop(0, `rgba(255, 255, 255, ${intensity})`);
    gradient.addColorStop(0.5, `rgba(${dominantColor.r}, ${dominantColor.g}, ${dominantColor.b}, ${intensity * 0.5})`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // ============================================
  // MAIN RENDER LOOP
  // ============================================
  
  function render(timestamp) {
    if (!isEnabled) {
      animationId = null;
      return;
    }
    
    animationId = requestAnimationFrame(render);
    
    // Calculate delta time
    const deltaTime = timestamp - lastFrameTime;
    lastFrameTime = timestamp;
    
    // FPS calculation
    frameCount++;
    if (frameCount % 30 === 0) {
      currentFPS = 1000 / deltaTime;
    }
    
    // Skip frame if too fast (simple throttle)
    if (deltaTime < 1000 / CONFIG.TARGET_FPS - 2) return;
    
    // Analyze audio
    analyzeFrequencyBands();
    detectBeat();
    
    // Render visuals
    renderAurora(timestamp);
    renderOrbs(timestamp);
    spawnParticles();
    updateParticles(deltaTime);
    renderBeatFlash();
    renderFrequencyBars();
    renderWaveform();
  }

  // ============================================
  // AUDIO CONNECTION
  // ============================================
  
  async function connectAudio() {
    if (isConnected) return;

    const video = document.querySelector('video');
    if (!video) {
      console.log('[Living BG Pro] No video element found, retrying...');
      return;
    }

    if (video.__livingBgProConnected) {
      console.log('[Living BG Pro] Video already connected, reusing...');
      isConnected = true;
      return;
    }

    try {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      analyser = audioContext.createAnalyser();
      analyser.fftSize = CONFIG.FFT_SIZE;
      analyser.smoothingTimeConstant = CONFIG.SMOOTHING;

      const audioSource = audioContext.createMediaElementSource(video);
      audioSource.connect(analyser);
      analyser.connect(audioContext.destination);

      video.__livingBgProConnected = true;

      frequencyData = new Uint8Array(analyser.frequencyBinCount);
      timeData = new Uint8Array(analyser.frequencyBinCount);

      isConnected = true;
      console.log('[Living BG Pro] ✓ Audio connected successfully!');
      console.log(`[Living BG Pro] Sample rate: ${audioContext.sampleRate}Hz, FFT bins: ${analyser.frequencyBinCount}`);

    } catch (error) {
      if (error.message && error.message.includes('already connected')) {
        console.log('[Living BG Pro] Video was already connected');
        video.__livingBgProConnected = true;
        isConnected = true;
      } else {
        console.error('[Living BG Pro] Audio connection error:', error);
      }
    }
  }

  // ============================================
  // COLOR EXTRACTION
  // ============================================
  
  async function extractDominantColor() {
    console.log('[Living BG Pro] Extracting dominant color...');

    // Try YouTube Music's computed style first
    const playerPage = document.querySelector('ytmusic-player-page');
    if (playerPage) {
      const computedBg = getComputedStyle(playerPage).backgroundColor;
      const rgbMatch = computedBg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (rgbMatch && (parseInt(rgbMatch[1]) > 20 || parseInt(rgbMatch[2]) > 20 || parseInt(rgbMatch[3]) > 20)) {
        dominantColor = {
          r: Math.min(255, parseInt(rgbMatch[1]) + 30),
          g: Math.min(255, parseInt(rgbMatch[2]) + 30),
          b: Math.min(255, parseInt(rgbMatch[3]) + 30)
        };
        console.log('[Living BG Pro] ✓ Color from YT style:', dominantColor);
        return;
      }
    }

    // Try fetching album art
    const albumArt = document.querySelector('.image.ytmusic-player-bar img, .thumbnail img');
    if (albumArt && albumArt.src) {
      try {
        const response = await fetch(albumArt.src);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
          try {
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            const size = 50;
            tempCanvas.width = size;
            tempCanvas.height = size;

            tempCtx.drawImage(img, 0, 0, size, size);
            const imageData = tempCtx.getImageData(5, 5, size - 10, size - 10).data;

            let rSum = 0, gSum = 0, bSum = 0, count = 0;

            for (let i = 0; i < imageData.length; i += 4) {
              const r = imageData[i];
              const g = imageData[i + 1];
              const b = imageData[i + 2];
              const brightness = (r + g + b) / 3;
              
              // Skip very dark or very bright pixels
              if (brightness > 30 && brightness < 220) {
                // Weight by saturation
                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);
                const saturation = max > 0 ? (max - min) / max : 0;
                const weight = 0.5 + saturation * 0.5;
                
                rSum += r * weight;
                gSum += g * weight;
                bSum += b * weight;
                count += weight;
              }
            }

            if (count > 0) {
              dominantColor = {
                r: Math.round(rSum / count),
                g: Math.round(gSum / count),
                b: Math.round(bSum / count)
              };
              console.log('[Living BG Pro] ✓ Color extracted:', dominantColor);
            }

            URL.revokeObjectURL(blobUrl);
          } catch (e) {
            console.log('[Living BG Pro] Canvas error:', e.message);
          }
        };

        img.src = blobUrl;
      } catch (e) {
        console.log('[Living BG Pro] Fetch failed:', e.message);
      }
    }
  }

  // ============================================
  // DOM CREATION
  // ============================================
  
  function createBackgroundElement() {
    if (document.getElementById('living-bg-pro')) return;

    const container = document.createElement('div');
    container.id = 'living-bg-pro';
    
    const canvasEl = document.createElement('canvas');
    canvasEl.id = 'living-bg-canvas';
    container.appendChild(canvasEl);
    
    document.body.appendChild(container);
    console.log('[Living BG Pro] Background element created');
  }

  function injectStyles() {
    if (document.getElementById('living-bg-pro-styles')) return;

    const style = document.createElement('style');
    style.id = 'living-bg-pro-styles';
    style.textContent = `
      /* === TOGGLE SWITCH === */
      #living-bg-toggle-container {
        position: fixed;
        top: 12px;
        right: 12px;
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
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
        background: linear-gradient(135deg, #667eea, #764ba2);
      }
      
      #living-bg-toggle.active::after {
        left: 18px;
        background: #ffffff;
      }

      /* === MINI PLAYER BUTTON === */
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

      /* === LIVING BG CONTAINER === */
      #living-bg-pro {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: -1;
        overflow: hidden;
        pointer-events: none;
        background: #000;
      }
      
      #living-bg-canvas {
        width: 100%;
        height: 100%;
        display: block;
      }

      /* === MAKE YT MUSIC TRANSPARENT === */
      html, body {
        background: transparent !important;
      }
      
      ytmusic-app {
        background: transparent !important;
      }
      
      #layout {
        background: transparent !important;
      }
      
      ytmusic-browse-response,
      ytmusic-tabbed-search-results-renderer,
      #content.ytmusic-app,
      ytmusic-player-page {
        background: transparent !important;
      }
      
      #side-panel,
      ytmusic-tab-renderer,
      #tab-renderer,
      ytmusic-player-queue,
      #contents.ytmusic-player-queue,
      ytmusic-queue-header-renderer,
      #automix-contents,
      ytmusic-player-queue-item,
      #tabs-content,
      ytmusic-section-list-renderer {
        background: transparent !important;
      }
      
      ytmusic-nav-bar,
      ytmusic-guide-section-renderer,
      #guide-inner-content {
        background: rgba(0, 0, 0, 0.5) !important;
      }
      
      ytmusic-player-bar {
        background: rgba(0, 0, 0, 0.85) !important;
      }
      
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
      
      ytmusic-player-bar svg,
      tp-yt-paper-icon-button svg,
      yt-icon svg {
        fill: currentColor !important;
        opacity: 1 !important;
      }
    `;
    document.head.appendChild(style);
  }

  function createToggleSwitch() {
    if (document.getElementById('living-bg-toggle-container')) return;

    const container = document.createElement('div');
    container.id = 'living-bg-toggle-container';

    // Mini Player Button
    const miniPlayerBtn = document.createElement('button');
    miniPlayerBtn.id = 'mini-player-btn';
    miniPlayerBtn.title = 'Open Mini Player';

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

    console.log('[Living BG Pro] Toggle switch created');
  }

  // ============================================
  // ENABLE/DISABLE
  // ============================================
  
  function enableLivingBackground() {
    console.log('[Living BG Pro] Enabling...');

    const bg = document.getElementById('living-bg-pro');
    if (bg) {
      bg.style.display = 'block';
    }

    extractDominantColor();
    initializeVisuals();

    if (!isConnected) {
      connectAudio();
    }

    if (!animationId) {
      lastFrameTime = performance.now();
      animationId = requestAnimationFrame(render);
    }
  }

  function disableLivingBackground() {
    console.log('[Living BG Pro] Disabling...');

    const bg = document.getElementById('living-bg-pro');
    if (bg) {
      bg.style.display = 'none';
    }

    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    
    particles = [];
  }

  // ============================================
  // MINI PLAYER INTEGRATION
  // ============================================
  
  function watchSongChanges() {
    const updateTrackInfo = () => {
      setTimeout(() => {
        extractDominantColor();

        if (window.ytMusicApp && window.ytMusicApp.send) {
          const titleEl = document.querySelector('.title.ytmusic-player-bar');
          const artistEl = document.querySelector('.byline.ytmusic-player-bar');
          const playBtn = document.querySelector('.play-pause-button');

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

    setTimeout(updateTrackInfo, 2000);

    const observer = new MutationObserver(updateTrackInfo);
    const playerBar = document.querySelector('ytmusic-player-bar');
    if (playerBar) {
      observer.observe(playerBar, { subtree: true, childList: true, attributes: true });
    }

    // Progress and state updates
    setInterval(() => {
      if (window.ytMusicApp && window.ytMusicApp.send) {
        const playBtn = document.querySelector('.play-pause-button');
        const isPlaying = playBtn?.getAttribute('title')?.toLowerCase().includes('pause') ||
          playBtn?.getAttribute('aria-label')?.toLowerCase().includes('pause');

        const timeInfo = document.querySelector('.time-info.ytmusic-player-bar');
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

        const parseTime = (timeStr) => {
          const parts = timeStr.split(':').map(Number);
          if (parts.length === 2) return parts[0] * 60 + parts[1];
          if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
          return 0;
        };

        const currentSeconds = parseTime(currentTime);
        const totalSeconds = parseTime(totalTime);
        if (totalSeconds > 0) {
          progress = Math.max(0, Math.min(100, (currentSeconds / totalSeconds) * 100));
        }

        let isLiked = false;
        let isDisliked = false;
        const playerBarEl = document.querySelector('ytmusic-player-bar');
        if (playerBarEl) {
          const likeButtonRenderer = playerBarEl.querySelector('ytmusic-like-button-renderer');
          if (likeButtonRenderer) {
            const likeStatus = likeButtonRenderer.getAttribute('like-status');
            if (likeStatus === 'LIKE') isLiked = true;
            else if (likeStatus === 'DISLIKE') isDisliked = true;
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

  // ============================================
  // INITIALIZATION
  // ============================================
  
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

  function init() {
    console.log('[Living BG Pro] Starting professional audio visualizer...');
    
    injectStyles();
    createBackgroundElement();
    createToggleSwitch();

    // Hidden by default
    const bg = document.getElementById('living-bg-pro');
    if (bg) {
      bg.style.display = 'none';
    }

    setupInteractionHandler();

    setTimeout(() => {
      watchSongChanges();
    }, 3000);

    console.log('[Living BG Pro] Ready! Toggle is in top-right corner.');
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 1000);
  }
})();
