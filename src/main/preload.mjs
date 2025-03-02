// src/main/preload.mjs
// Preload script for Electron (secure bridge between renderer and main processes) - ES Module Version

import {contextBridge, ipcRenderer} from 'electron';
import hljs from 'highlight.js';
import MarkdownIt from 'markdown-it';

/**
 * Initialize Markdown parser with syntax highlighting
 */
const md = new MarkdownIt({
    html       : true,
    xhtmlOut   : true,
    breaks     : true,
    linkify    : true,
    typographer: true,
    highlight  : function (str, lang) {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return hljs.highlight(str, {language: lang}).value;
            } catch (__) {
                // Fallback to no highlighting on error
            }
        }
        return ''; // Use external default escaping
    }
});

/**
 * Make Markdown API available to the renderer process
 */
contextBridge.exposeInMainWorld('markdownAPI', {
    /**
     * Renders markdown text to HTML
     * @param {string} markdown - Markdown text to render
     * @returns {string} - Rendered HTML
     */
    render: (markdown) => md.render(markdown)
});

/**
 * Make Electron API available to the renderer process
 */
contextBridge.exposeInMainWorld('electronAPI', {
    // Settings
    getSettings  : () => ipcRenderer.invoke('get-settings'),
    saveSettings : (settings) => ipcRenderer.invoke('save-settings', settings),
    resetSettings: () => ipcRenderer.invoke('reset-settings'),

    // LM Studio
    checkLMStudio: () => ipcRenderer.invoke('check-lm-studio'),

    // External links
    openExternalLink: (url) => ipcRenderer.invoke('open-external-link', url),

    // LLM model management
    getAvailableModels: () => ipcRenderer.invoke('get-available-models'),
    loadModel         : (modelPath) => ipcRenderer.invoke('load-model', modelPath),
    downloadModel     : (options) => ipcRenderer.invoke('download-model', options),
    deleteModel       : (modelName) => ipcRenderer.invoke('delete-model', modelName),

    // Event listeners
    onLMStudioStatus: (callback) => {
        const wrappedCallback = (_, status) => callback(status);
        ipcRenderer.on('lm-studio-status', wrappedCallback);
        return () => ipcRenderer.removeListener('lm-studio-status', wrappedCallback);
    },

    // Model status updates
    onModelStatus: (callback) => {
        const wrappedCallback = (_, status) => callback(status);
        ipcRenderer.on('model-status', wrappedCallback);
        return () => ipcRenderer.removeListener('model-status', wrappedCallback);
    },

    // Model download progress
    onModelProgress: (callback) => {
        const wrappedCallback = (_, progress) => callback(progress);
        ipcRenderer.on('model-download-progress', wrappedCallback);
        return () => ipcRenderer.removeListener('model-download-progress', wrappedCallback);
    },

    // Manual status checks
    checkLMStudioManually: () => ipcRenderer.invoke('check-lm-studio'),
    checkLMStudioStatus  : () => ipcRenderer.invoke('check-lm-studio'),

    // UI event listeners
    onShowSettings : (callback) => {
        ipcRenderer.on('show-settings', (_, config) => callback(config));
    },
    onSettingsReset: (callback) => {
        ipcRenderer.on('settings-reset', (_, config) => callback(config));
    },

    // Show models tab
    onShowModelsTab: (callback) => {
        ipcRenderer.on('show-models-tab', () => callback());
    },

    // Model search
    searchHuggingFaceModels: (query) => ipcRenderer.invoke('search-huggingface-models', query),

    // File and Git management
    selectFolder  : () => ipcRenderer.invoke('select-folder'),
    addRepository : (options) => ipcRenderer.invoke('add-repository', options),
    saveGitToken  : (options) => ipcRenderer.invoke('save-git-token', options),
    listFiles     : (options) => ipcRenderer.invoke('list-files', options),
    readFile      : (options) => ipcRenderer.invoke('read-file', options),
    searchFiles   : (options) => ipcRenderer.invoke('search-files', options),
    syncRepository: (options) => ipcRenderer.invoke('sync-repository', options),
    removeSource  : (options) => ipcRenderer.invoke('remove-source', options),
    getAllSources : () => ipcRenderer.invoke('get-all-sources'),

    // Processing status updates
    onProcessingStatus: (callback) => {
        const wrappedCallback = (_, status) => callback(status);
        ipcRenderer.on('processing-status', wrappedCallback);
        return () => ipcRenderer.removeListener('processing-status', wrappedCallback);
    },

    // Chat history
    getChatHistory       : () => ipcRenderer.invoke('get-chat-history'),
    getAllConversations  : () => ipcRenderer.invoke('get-all-conversations'),
    loadConversation     : (options) => ipcRenderer.invoke('load-conversation', options),
    deleteConversation   : (options) => ipcRenderer.invoke('delete-conversation', options),
    startNewConversation : () => ipcRenderer.invoke('start-new-conversation'),
    clearAllConversations: () => ipcRenderer.invoke('clear-all-conversations'),

    // Cancel current request
    cancelCurrentRequest: () => ipcRenderer.invoke('cancel-current-request'),
});

console.log(contextBridge)