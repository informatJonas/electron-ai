// src/main/config/config-manager.js
// Configuration management module - ES Module Version

import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import Store from 'electron-store';
import { app } from 'electron';
import { convertValue, keyToEnvFormat, keyToCamelCase } from '../utils/string-utils.js';

/**
 * Determine if we're in development mode
 */
const isDevelopment = process.env.NODE_ENV === 'development' || !app;

/**
 * Default configuration values
 */
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
    // LLM settings
    USE_LOCAL_LLM: true,
    LAST_USED_MODEL: '',
    CONTEXT_SIZE: 2048,
    THREADS: 4,
    GPU_LAYERS: 0,
    MODEL_DIR: 'models',
    // Chat history settings
    MAX_HISTORY_MESSAGES: 20,
    MAX_CONVERSATIONS: 10,
};

/**
 * Configuration schema for Electron Store
 */
const configSchema = {
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
    MAX_HISTORY_MESSAGES: {
        type: 'integer',
        default: 20
    },
    MAX_CONVERSATIONS: {
        type: 'integer',
        default: 10
    },
};

/**
 * Initialize the Electron Store with explicit path
 */
const store = new Store({
    name: 'ki-assistant-config',
    cwd: isDevelopment ? process.cwd() : undefined,
    schema: configSchema
});

/**
 * Loads settings from .env file and updates the store
 * @returns {boolean} - True if .env file was loaded
 */
function loadEnvFile() {
    try {
        const envPath = path.join(process.cwd(), '.env');

        // Check if .env file exists
        if (fs.existsSync(envPath)) {
            const envConfig = dotenv.parse(fs.readFileSync(envPath));

            // Update store with values from .env if they exist
            for (const key in envConfig) {
                if (key in defaultConfig) {
                    store.set(key, convertValue(envConfig[key]));
                }
            }

            return true;
        }
    } catch (error) {
        console.error('Error loading .env file:', error);
    }

    return false;
}

/**
 * Initialize the environment configuration
 * @returns {Object} - Configuration manager API
 */
function initEnvironment() {
    // Ensure the store is always in a defined state
    let shouldInitialize = false;

    // 1. Check if the store has been initialized
    const isInitialized = store.get('INITIALIZED', false);
    if (!isInitialized) {
        shouldInitialize = true;
    }

    // 2. Check if all required keys are present
    const allKeysPresent = Object.keys(defaultConfig).every(key => store.has(key));
    if (!allKeysPresent) {
        shouldInitialize = true;
        console.log('Missing configuration keys in store, reinitializing');
    }

    if (shouldInitialize) {
        console.log('Initializing store with default values and .env file');

        // Set default values for all settings
        for (const [key, value] of Object.entries(defaultConfig)) {
            store.set(key, value);
        }

        // On first start: Load values from .env file (overrides defaults)
        loadEnvFile();

        // Mark as initialized
        store.set('INITIALIZED', true);
    }

    // For upward compatibility: Ensure process.env variables are set
    for (const key in defaultConfig) {
        process.env[key] = store.get(key, defaultConfig[key]).toString();
    }

    // Return the configuration API
    return {
        getConfig,
        updateConfig,
        resetToDefaults
    };
}

/**
 * Gets the current configuration in camelCase format
 * @returns {Object} - Current configuration
 */
function getConfig() {
    // Convert UPPER_SNAKE_CASE keys to camelCase
    const config = {};
    for (const key in defaultConfig) {
        const camelKey = keyToCamelCase(key);
        config[camelKey] = store.get(key);
    }
    return config;
}

/**
 * Updates the configuration
 * @param {Object} newConfig - Configuration values to update in camelCase
 * @returns {Object} - Updated configuration
 */
function updateConfig(newConfig) {
    // Debug output for diagnostic purposes
    for (const [key, value] of Object.entries(newConfig)) {
        const storeKey = keyToEnvFormat(key);
        if (storeKey in defaultConfig) {
            // Explicitly store in the store
            store.set(storeKey, value);
            // Also update process.env for compatibility
            process.env[storeKey] = value.toString();
        }
    }

    // Force store synchronization
    store.store = store.store;

    return getConfig();
}

/**
 * Resets configuration to default values
 * @returns {Object} - Reset configuration
 */
function resetToDefaults() {
    console.log('Resetting configuration to default values');

    // First reset all values to defaults
    for (const [key, value] of Object.entries(defaultConfig)) {
        store.set(key, value);
        process.env[key] = value.toString();
    }

    // Then try to load values from .env (if available)
    loadEnvFile();

    // Force store synchronization
    store.store = store.store;

    console.log('Configuration reset:', store.store);

    return getConfig();
}

export default initEnvironment();