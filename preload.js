// Prüfen und aktualisieren Sie Ihre preload.js wie folgt:

const {contextBridge, ipcRenderer} = require('electron');
const MarkdownIt                   = require('markdown-it');
const hljs                         = require('highlight.js').default;
const md                           = new MarkdownIt({
    html     : true,
    xhtmlOut : true,
    breaks   : true,
    highlight: function (str, lang) {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return hljs.highlight(str, {language: lang}).value;
            } catch (__) {
            }
        }

        return ''; // use external default escaping
    }
});

contextBridge.exposeInMainWorld('markdownAPI', {
    render: (markdown) => md.render(markdown)
});

// API für den Renderer-Prozess verfügbar machen
contextBridge.exposeInMainWorld('electronAPI', {
    // Einstellungen
    getSettings  : () => ipcRenderer.invoke('get-settings'),
    saveSettings : (settings) => ipcRenderer.invoke('save-settings', settings),
    resetSettings: () => ipcRenderer.invoke('reset-settings'),

    // LM Studio
    checkLMStudio: () => ipcRenderer.invoke('check-lm-studio'),

    // Externe Links
    openExternalLink: (url) => ipcRenderer.invoke('open-external-link', url),

    // Ereignisse empfangen
    onLMStudioStatus     : (callback) => {
        const wrappedCallback = (event, status) => {
            callback(status);
        };

        ipcRenderer.on('lm-studio-status', wrappedCallback);

        return () => {
            ipcRenderer.removeListener('lm-studio-status', wrappedCallback);
        };
    },
    checkLMStudioManually: () => {
        return ipcRenderer.invoke('check-lm-studio');
    },
    checkLMStudioStatus  : () => {
        return ipcRenderer.invoke('check-lm-studio');
    },

    onShowSettings : (callback) => {
        ipcRenderer.on('show-settings', (event, config) => callback(config));
    },
    onSettingsReset: (callback) => {
        ipcRenderer.on('settings-reset', (event, config) => callback(config));
    }
});