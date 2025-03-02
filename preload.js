// Preload-Skript für Electron (CommonJS-Version)
const { contextBridge, ipcRenderer } = require('electron');
const MarkdownIt = require('markdown-it');
const hljs = require('highlight.js');

const md = new MarkdownIt({
    html: true,
    xhtmlOut: true,
    breaks: true,
    linkify: true,
    typographer: true,
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

// Markdown-API für den Renderer-Prozess verfügbar machen
contextBridge.exposeInMainWorld('markdownAPI', {
    render: (markdown) => md.render(markdown)
});

// API für den Renderer-Prozess verfügbar machen
contextBridge.exposeInMainWorld('electronAPI', {
    // Einstellungen
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    resetSettings: () => ipcRenderer.invoke('reset-settings'),

    // LM Studio
    checkLMStudio: () => ipcRenderer.invoke('check-lm-studio'),

    // Externe Links
    openExternalLink: (url) => ipcRenderer.invoke('open-external-link', url),

    // LLM-Modellverwaltung
    getAvailableModels: () => ipcRenderer.invoke('get-available-models'),
    loadModel: (modelPath) => ipcRenderer.invoke('load-model', modelPath),
    downloadModel: (options) => ipcRenderer.invoke('download-model', options),
    deleteModel: (modelName) => ipcRenderer.invoke('delete-model', modelName),

    // Ereignisse empfangen
    onLMStudioStatus: (callback) => {
        const wrappedCallback = (_, status) => callback(status);
        ipcRenderer.on('lm-studio-status', wrappedCallback);
        return () => ipcRenderer.removeListener('lm-studio-status', wrappedCallback);
    },

    // Modell-Status-Updates
    onModelStatus: (callback) => {
        const wrappedCallback = (_, status) => callback(status);
        ipcRenderer.on('model-status', wrappedCallback);
        return () => ipcRenderer.removeListener('model-status', wrappedCallback);
    },

    // Modell-Download-Fortschritt
    onModelProgress: (callback) => {
        const wrappedCallback = (_, progress) => callback(progress);
        ipcRenderer.on('model-download-progress', wrappedCallback);
        return () => ipcRenderer.removeListener('model-download-progress', wrappedCallback);
    },

    checkLMStudioManually: () => ipcRenderer.invoke('check-lm-studio'),
    checkLMStudioStatus: () => ipcRenderer.invoke('check-lm-studio'),

    onShowSettings: (callback) => {
        ipcRenderer.on('show-settings', (_, config) => callback(config));
    },
    onSettingsReset: (callback) => {
        ipcRenderer.on('settings-reset', (_, config) => callback(config));
    },

    // Tab für Modelle anzeigen
    onShowModelsTab: (callback) => {
        ipcRenderer.on('show-models-tab', () => callback());
    },

    searchHuggingFaceModels: (query) => ipcRenderer.invoke('search-huggingface-models', query),

    // Git und Ordner-Verwaltung
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    addRepository: (options) => ipcRenderer.invoke('add-repository', options),
    saveGitToken: (options) => ipcRenderer.invoke('save-git-token', options),
    listFiles: (options) => ipcRenderer.invoke('list-files', options),
    readFile: (options) => ipcRenderer.invoke('read-file', options),
    searchFiles: (options) => ipcRenderer.invoke('search-files', options),
    syncRepository: (options) => ipcRenderer.invoke('sync-repository', options),
    removeSource: (options) => ipcRenderer.invoke('remove-source', options),
    getAllSources: () => ipcRenderer.invoke('get-all-sources'),
});