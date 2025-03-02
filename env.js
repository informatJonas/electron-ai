// env.js - Konfiguration mit Electron Store
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const Store = require('electron-store');
const { app } = require('electron');

// Bestimme, ob wir uns im Entwicklungsmodus befinden
const isDevelopment = process.env.NODE_ENV === 'development' || !app;

// Konfiguriere den Electron Store mit explizitem Pfad
const store = new Store({
    name: 'ki-assistant-config', // Name der Konfigurationsdatei
    cwd: isDevelopment ? process.cwd() : undefined, // Im Entwicklungsmodus im aktuellen Verzeichnis speichern
    // Definiere Schema für bessere Typisierung (optional)
    schema: {
        LM_STUDIO_URL: {
            type: 'string',
            default: 'http://127.0.0.1:1234/'
        },
        LM_STUDIO_MODEL: {
            type: 'string',
            default: 'local-model'
        },
        SERVER_PORT: {
            type: 'integer',
            default: 3000
        },
        MAX_SEARCH_RESULTS: {
            type: 'integer',
            default: 3
        },
        SEARCH_TIMEOUT: {
            type: 'integer',
            default: 5000
        },
        DEFAULT_SEARCH_MODE: {
            type: 'string',
            default: 'auto'
        },
        AUTO_CHECK_LM_STUDIO: {
            type: 'boolean',
            default: true
        },
        DEBUG_MODE: {
            type: 'boolean',
            default: false
        },
        DEFAULT_SYSTEM_PROMPT: {
            type: 'string',
            default: 'Du bist ein hilfreicher Assistent mit Internetzugang. Du hilfst beim Programmieren und beantwortest Fragen auf Basis aktueller Informationen aus dem Internet. Antworte IMMER auf Deutsch, auch wenn die Frage oder die Informationen auf Englisch sind.'
        },
        MINIMIZE_TO_TRAY: {
            type: 'boolean',
            default: true
        },
        START_WITH_WINDOWS: {
            type: 'boolean',
            default: false
        },
        CHECK_FOR_UPDATES: {
            type: 'boolean',
            default: true
        },
        UPDATE_SERVER_URL: {
            type: 'string',
            default: ''
        },
        // Neue LLM-Einstellungen
        USE_LOCAL_LLM: {
            type: 'boolean',
            default: true
        },
        LAST_USED_MODEL: {
            type: 'string',
            default: ''
        },
        CONTEXT_SIZE: {
            type: 'integer',
            default: 2048
        },
        THREADS: {
            type: 'integer',
            default: 4
        },
        GPU_LAYERS: {
            type: 'integer',
            default: 0
        },
        MODEL_DIR: {
            type: 'string',
            default: 'models'
        },

        // Chat-Historie Einstellungen
        MAX_HISTORY_MESSAGES: {
            type: 'integer',
            default: 20
        },
        MAX_CONVERSATIONS: {
            type: 'integer',
            default: 10
        },
    }
});

// Standardkonfiguration
const defaultConfig = {
    LM_STUDIO_URL: 'http://127.0.0.1:1234/',
    LM_STUDIO_MODEL: 'local-model',
    SERVER_PORT: 3000,
    MAX_SEARCH_RESULTS: 3,
    SEARCH_TIMEOUT: 5000,
    DEFAULT_SEARCH_MODE: 'auto',
    AUTO_CHECK_LM_STUDIO: true,
    DEBUG_MODE: false,
    DEFAULT_SYSTEM_PROMPT: 'Du bist ein hilfreicher Assistent mit Internetzugang. Du hilfst beim Programmieren und beantwortest Fragen auf Basis aktueller Informationen aus dem Internet. Antworte IMMER auf Deutsch, auch wenn die Frage oder die Informationen auf Englisch sind.',
    MINIMIZE_TO_TRAY: true,
    START_WITH_WINDOWS: false,
    CHECK_FOR_UPDATES: true,
    UPDATE_SERVER_URL: '',
    // Neue LLM-Einstellungen
    USE_LOCAL_LLM: true,
    LAST_USED_MODEL: '',
    CONTEXT_SIZE: 2048,
    THREADS: 4,
    GPU_LAYERS: 0,
    MODEL_DIR: 'models',
    // Neue Chat-Historie-Einstellungen
    MAX_HISTORY_MESSAGES: 20,
    MAX_CONVERSATIONS: 10,
};

/**
 * Lädt die .env-Datei und aktualisiert den Store (nur beim ersten Start)
 */
function loadEnvFile() {
    try {
        const envPath = path.join(process.cwd(), '.env');

        // Prüfen ob .env Datei existiert
        if (fs.existsSync(envPath)) {
            const envConfig = dotenv.parse(fs.readFileSync(envPath));

            // Store mit Werten aus .env aktualisieren, falls vorhanden
            for (const key in envConfig) {
                if (key in defaultConfig) {
                    store.set(key, convertValue(envConfig[key]));
                }
            }

            return true;
        }
    } catch (error) {
        console.error('Fehler beim Laden der .env-Datei:', error);
    }

    return false;
}

/**
 * Initialisiert die Konfiguration
 */
function initEnvironment() {
    // Stelle sicher, dass der Store immer in einem definierten Zustand ist
    let shouldInitialize = false;

    // 1. Prüfe ob der Store bereits initialisiert wurde
    const isInitialized = store.get('INITIALIZED', false);
    if (!isInitialized) {
        shouldInitialize = true;
    }

    // 2. Prüfe ob alle erforderlichen Schlüssel vorhanden sind
    const allKeysPresent = Object.keys(defaultConfig).every(key => store.has(key));
    if (!allKeysPresent) {
        shouldInitialize = true;
        console.log('Fehlende Konfigurationsschlüssel im Store, initialisiere neu');
    }

    if (shouldInitialize) {
        console.log('Initialisiere Store mit Standardwerten und .env-Datei');

        // Standardwerte für alle Einstellungen setzen
        for (const [key, value] of Object.entries(defaultConfig)) {
            store.set(key, value);
        }

        // Bei Erststart: Lade Werte aus .env-Datei (überschreibt Standardwerte)
        loadEnvFile();

        // Als initialisiert markieren
        store.set('INITIALIZED', true);
    }

    // Für Aufwärtskompatibilität: Stelle sicher, dass process.env-Variablen gesetzt sind
    for (const key in defaultConfig) {
        process.env[key] = store.get(key, defaultConfig[key]).toString();
    }

    // Zeige aktuelle Konfiguration im Debug-Modus
    return {
        getConfig,
        updateConfig,
        resetToDefaults
    };
}

/**
 * Gibt die aktuelle Konfiguration zurück (in camelCase für bessere API)
 */
function getConfig() {
    return {
        lmStudioUrl: store.get('LM_STUDIO_URL'),
        lmStudioModel: store.get('LM_STUDIO_MODEL'),
        serverPort: store.get('SERVER_PORT'),
        maxSearchResults: store.get('MAX_SEARCH_RESULTS'),
        searchTimeout: store.get('SEARCH_TIMEOUT'),
        defaultSearchMode: store.get('DEFAULT_SEARCH_MODE'),
        autoCheckLmStudio: store.get('AUTO_CHECK_LM_STUDIO'),
        debugMode: store.get('DEBUG_MODE'),
        systemPrompt: store.get('DEFAULT_SYSTEM_PROMPT'),
        minimizeToTray: store.get('MINIMIZE_TO_TRAY'),
        startWithWindows: store.get('START_WITH_WINDOWS'),
        checkForUpdates: store.get('CHECK_FOR_UPDATES'),
        updateServerUrl: store.get('UPDATE_SERVER_URL'),
        // Neue LLM-Einstellungen
        useLocalLlm: store.get('USE_LOCAL_LLM'),
        lastUsedModel: store.get('LAST_USED_MODEL'),
        contextSize: store.get('CONTEXT_SIZE'),
        threads: store.get('THREADS'),
        gpuLayers: store.get('GPU_LAYERS'),
        modelDir: store.get('MODEL_DIR'),
        // Neue Chat-Historie-Einstellungen
        maxHistoryMessages: store.get('MAX_HISTORY_MESSAGES'),
        maxConversations: store.get('MAX_CONVERSATIONS'),
    };
}

/**
 * Aktualisiert die Konfiguration im Store
 */
function updateConfig(newConfig) {
    // Debug-Ausgabe zu Diagnosezwecken
    for (const [key, value] of Object.entries(newConfig)) {
        const storeKey = keyToEnvFormat(key);
        if (storeKey in defaultConfig) {
            // Speichere explizit im Store
            store.set(storeKey, value);
            // Aktualisiere auch process.env für Kompatibilität
            process.env[storeKey] = value.toString();
        }
    }

    // Synchronisiere den Store (erzwinge Speichern)
    store.store = store.store;

    return getConfig();
}

/**
 * Setzt die Konfiguration auf Standardwerte zurück
 */
function resetToDefaults() {
    console.log('Setze Konfiguration auf Standardwerte zurück');

    // Zuerst alle Werte auf Standard zurücksetzen
    for (const [key, value] of Object.entries(defaultConfig)) {
        store.set(key, value);
        process.env[key] = value.toString();
    }

    // Dann versuchen, Werte aus .env zu laden (falls vorhanden)
    loadEnvFile();

    // Synchronisiere den Store (erzwinge Speichern)
    store.store = store.store;

    console.log('Konfiguration zurückgesetzt:', store.store);

    return getConfig();
}

/**
 * Hilfsfunktion: Konvertiert camelCase zu UPPER_SNAKE_CASE
 */
function keyToEnvFormat(key) {
    return key.replace(/([A-Z])/g, '_$1').toUpperCase();
}

/**
 * Hilfsfunktion: Konvertiert String-Werte in entsprechende Typen
 */
function convertValue(value) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (!isNaN(value) && value.trim() !== '') return Number(value);
    return value;
}

module.exports = initEnvironment();