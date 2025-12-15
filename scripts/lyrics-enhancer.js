// Synced Lyrics Enhancement for YouTube Music
// Integrates directly into YouTube Music's native lyrics panel
// Uses LRCLIB API for synced lyrics data

(function () {
  'use strict';

  console.log('[YT Lyrics] Synced lyrics enhancement loading...');

  const LRCLIB_API = 'https://lrclib.net/api/get';
  let currentSong = { title: '', artist: '' };
  let syncedLyrics = [];
  let lastActiveIndex = -1;
  let lyricsContainer = null;

  // Inject styles
  function injectStyles() {
    if (document.getElementById('yt-lyrics-styles')) return;

    const style = document.createElement('style');
    style.id = 'yt-lyrics-styles';
    style.textContent = `
      /* Hide YouTube's native lyrics when we have synced lyrics */
      .yt-has-synced-lyrics .description,
      .yt-has-synced-lyrics ytmusic-description-shelf-renderer > .description,
      ytmusic-description-shelf-renderer.yt-has-synced-lyrics .description {
        display: none !important;
      }
      
      /* Our synced lyrics container */
      #yt-synced-container {
        padding: 16px;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
      }
      
      /* Each lyrics line */
      .yt-sync-line {
        display: block;
        padding: 10px 14px;
        margin: 4px 0;
        border-radius: 10px;
        font-size: 17px;
        line-height: 1.6;
        color: rgba(255, 255, 255, 0.35);
        transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
        cursor: pointer;
      }
      
      .yt-sync-line:hover {
        background: rgba(255, 255, 255, 0.06);
        color: rgba(255, 255, 255, 0.6);
      }
      
      /* ACTIVE LINE - Apple Music Style */
      .yt-sync-line.active {
        color: #ffffff !important;
        font-size: 19px;
        font-weight: 600;
        background: rgba(255, 82, 82, 0.12);
        text-shadow: 
          0 0 25px rgba(255, 255, 255, 0.7),
          0 0 50px rgba(255, 255, 255, 0.4);
        transform: scale(1.02);
        border-left: 3px solid #ff5252;
        padding-left: 11px;
      }
      
      /* Past lines */
      .yt-sync-line.past {
        color: rgba(255, 255, 255, 0.22);
      }
      
      /* Synced badge */
      .yt-synced-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        margin-bottom: 16px;
        background: rgba(255, 82, 82, 0.15);
        border-radius: 20px;
        font-size: 11px;
        font-weight: 600;
        color: #ff5252;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }
      
      .yt-synced-badge::before {
        content: "♪";
        font-size: 14px;
      }
    `;
    document.head.appendChild(style);
  }



  function getSongInfo() {
    const titleEl = document.querySelector('.title.ytmusic-player-bar');
    const subtitleEl = document.querySelector('.subtitle.ytmusic-player-bar');

    let title = titleEl?.textContent?.trim() || '';
    let artist = '';

    if (subtitleEl) {
      const parts = (subtitleEl.textContent || '').split('•');
      if (parts.length > 0) {
        artist = parts[0].trim();
      }
    }

    return { title, artist };
  }

  function getCurrentTime() {
    const video = document.querySelector('video');
    return video ? video.currentTime : 0;
  }

  async function fetchLyrics(title, artist) {
    try {
      const params = new URLSearchParams({
        track_name: title,
        artist_name: artist
      });

      console.log('[YT Lyrics] Fetching:', title, '-', artist);

      const response = await fetch(`${LRCLIB_API}?${params}`);

      if (!response.ok) {
        console.log('[YT Lyrics] Not found on LRCLIB');
        return null;
      }

      const data = await response.json();

      if (data.syncedLyrics) {
        console.log('[YT Lyrics] ✓ Found synced lyrics!');
        return parseLRC(data.syncedLyrics);
      }

      return null;
    } catch (error) {
      console.error('[YT Lyrics] Error:', error);
      return null;
    }
  }

  function parseLRC(lrc) {
    const lines = lrc.split('\n');
    const result = [];

    for (const line of lines) {
      const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
      if (match) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const ms = parseInt(match[3], 10);
        const divisor = match[3].length === 3 ? 1000 : 100;
        const time = minutes * 60 + seconds + ms / divisor;
        const text = match[4].trim();

        if (text) {
          result.push({ time, text });
        }
      }
    }

    return result.sort((a, b) => a.time - b.time);
  }

  // Find the lyrics tab content area
  function findLyricsPanel() {
    // Look for the description shelf which contains lyrics
    return document.querySelector('ytmusic-description-shelf-renderer');
  }

  // Inject our synced lyrics into YouTube's lyrics panel
  function injectSyncedLyrics() {
    const panel = findLyricsPanel();
    if (!panel || syncedLyrics.length === 0) return;

    // Check if already injected
    if (document.getElementById('yt-synced-container')) {
      return;
    }

    console.log('[YT Lyrics] Injecting into native panel...');

    // Add class to hide YT's lyrics
    panel.classList.add('yt-has-synced-lyrics');

    // Create our container
    const container = document.createElement('div');
    container.id = 'yt-synced-container';

    // Add synced badge
    const badge = document.createElement('div');
    badge.className = 'yt-synced-badge';
    badge.textContent = 'Synced Lyrics';
    container.appendChild(badge);

    // Add lyrics lines
    syncedLyrics.forEach((line, i) => {
      const el = document.createElement('span');
      el.className = 'yt-sync-line';
      el.dataset.index = i.toString();
      el.dataset.time = line.time.toString();
      el.textContent = line.text;

      el.addEventListener('click', () => {
        const video = document.querySelector('video');
        if (video) video.currentTime = line.time;
      });

      container.appendChild(el);
    });

    // Insert at the beginning of the panel
    panel.insertBefore(container, panel.firstChild);
    lyricsContainer = container;

    console.log('[YT Lyrics] ✓ Injected', syncedLyrics.length, 'lines into native panel!');
  }

  // Remove our injected content
  function removeSyncedLyrics() {
    const container = document.getElementById('yt-synced-container');
    if (container) {
      container.remove();
    }

    const panels = document.querySelectorAll('.yt-has-synced-lyrics');
    panels.forEach(p => p.classList.remove('yt-has-synced-lyrics'));

    lyricsContainer = null;
  }

  function updateActiveLine() {
    if (syncedLyrics.length === 0) return;

    const currentTime = getCurrentTime();

    // Find active line
    let activeIndex = -1;
    for (let i = syncedLyrics.length - 1; i >= 0; i--) {
      if (currentTime >= syncedLyrics[i].time - 0.1) {
        activeIndex = i;
        break;
      }
    }

    if (activeIndex === lastActiveIndex) return;
    lastActiveIndex = activeIndex;



    // Update lines in container
    if (!lyricsContainer) return;

    const lines = lyricsContainer.querySelectorAll('.yt-sync-line');
    lines.forEach((line, i) => {
      line.classList.remove('active', 'past');

      if (i === activeIndex) {
        line.classList.add('active');
        line.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (i < activeIndex) {
        line.classList.add('past');
      }
    });
  }

  async function checkSongChange() {
    const song = getSongInfo();

    if (song.title && song.artist &&
      (song.title !== currentSong.title || song.artist !== currentSong.artist)) {

      console.log('[YT Lyrics] New song:', song.title);
      currentSong = song;
      syncedLyrics = [];
      lastActiveIndex = -1;

      // Remove old lyrics
      removeSyncedLyrics();



      // Fetch new lyrics
      const lyrics = await fetchLyrics(song.title, song.artist);
      if (lyrics) {
        syncedLyrics = lyrics;
        // Delay injection to wait for YT panel to render
        setTimeout(injectSyncedLyrics, 500);
      }
    }
  }

  // Watch for lyrics tab becoming visible
  function watchLyricsTab() {
    const observer = new MutationObserver(() => {
      if (syncedLyrics.length > 0 && !document.getElementById('yt-synced-container')) {
        setTimeout(injectSyncedLyrics, 200);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function startLoop() {
    setInterval(checkSongChange, 2000);
    setInterval(updateActiveLine, 100);
    setInterval(() => {
      // Keep trying to inject if not present
      if (syncedLyrics.length > 0 && !document.getElementById('yt-synced-container')) {
        injectSyncedLyrics();
      }
    }, 1000);
  }

  function init() {
    console.log('[YT Lyrics] Initializing integrated lyrics...');
    injectStyles();

    watchLyricsTab();
    startLoop();
    console.log('[YT Lyrics] Ready! Synced lyrics will appear in the native LYRICS tab.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 1000);
  }
})();
