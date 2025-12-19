const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods for renderer process
contextBridge.exposeInMainWorld('ytMusicApp', {
    // Get platform info
    platform: process.platform,

    // Send messages to main process
    send: (channel, data) => {
        const validChannels = ['media-control', 'window-control', 'toggle-mini-player', 'track-info-update'];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },

    // Receive messages from main process
    receive: (channel, func) => {
        const validChannels = ['media-state', 'theme-update'];
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
    }
});

// Log when preload is ready
console.log('YT Music App: Preload script loaded');
