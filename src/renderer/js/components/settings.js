// src/renderer/js/components/settings.js
// Settings management functionality

/**
 * Opens the settings modal
 */
async function openSettings() {
    try {
        // Load current settings
        const config = await window.electronAPI.getSettings();

        updateSettingsForm(config);

        // Show modal
        document.getElementById('settings-modal').style.display = 'block';
    } catch (error) {
        console.error('Error opening settings:', error);
        window.uiUtils.showNotification('Error loading settings', 'error');
    }
}

/**
 * Updates the settings form with values from config
 * @param {Object} config - Configuration object
 */
function updateSettingsForm(config) {
    if (!config) return;

    // Basic settings
    setInputValue('lmStudioUrl', config.lmStudioUrl);
    setInputValue('lmStudioModel', config.lmStudioModel);
    setInputValue('serverPort', config.serverPort);
    setInputValue('maxSearchResults', config.maxSearchResults);
    setInputValue('searchTimeout', config.searchTimeout);
    setCheckboxValue('autoCheckLMStudio', config.autoCheckLmStudio);
    setCheckboxValue('debugMode', config.debugMode);
    setInputValue('systemPrompt', config.systemPrompt);
    setCheckboxValue('minimizeToTray', config.minimizeToTray);
    setCheckboxValue('startWithWindows', config.startWithWindows);
    setCheckboxValue('checkForUpdates', config.checkForUpdates);
    setSelectValue('defaultSearchMode', config.defaultSearchMode);

    // LLM settings
    setCheckboxValue('useLocalLlm', config.useLocalLlm !== undefined ? config.useLocalLlm : true);
    setInputValue('context-size', config.contextSize);
    setInputValue('cpu-threads', config.threads);
    setInputValue('gpu-layers', config.gpuLayers);

    // Chat history settings
    setInputValue('max-history-messages', config.maxHistoryMessages);
    setInputValue('max-conversations', config.maxConversations);

    // Update UI element visibility
    updateLLMMode(config.useLocalLlm);
}

/**
 * Saves settings from the form
 */
async function saveSettings() {
    try {
        // Collect settings from form
        const settings = getSettingsFromForm();

        // Save previous LLM mode to detect changes
        const previousConfig      = await window.electronAPI.getSettings();
        const previousUseLocalLlm = previousConfig.useLocalLlm;

        // Save settings
        const result = await window.electronAPI.saveSettings(settings);

        if (result.success) {
            window.uiUtils.showNotification('Settings saved');
            document.getElementById('settings-modal').style.display = 'none';

            // Update default search mode if changed
            if (settings.defaultSearchMode) {
                const webSearchMode = document.getElementById('webSearchMode');
                if (webSearchMode) {
                    webSearchMode.value = settings.defaultSearchMode;
                }
            }

            // If LLM mode changed, update status display
            if (previousUseLocalLlm !== settings.useLocalLlm) {
                // Add delay to ensure backend changes take effect
                setTimeout(() => {
                    window.appFunctions.checkConnectionStatus();
                }, 500);
            } else {
                // Check connection status after mode change
                window.appFunctions.checkConnectionStatus();
            }
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        window.uiUtils.showNotification('Error saving settings', 'error');
    }
}

/**
 * Resets settings to defaults
 */
async function resetSettings() {
    try {
        // Confirm reset
        const confirmed = await window.uiUtils.confirmDialog(
            'Do you want to reset all settings to their default values?',
            {
                title    : 'Reset Settings',
                dangerous: true
            }
        );

        if (!confirmed) return;

        // Reset settings
        const result = await window.electronAPI.resetSettings();

        if (result.success) {
            // Update form with new settings
            updateSettingsForm(result.config);

            // Update search mode dropdown
            window.appFunctions.loadDefaultSearchMode();

            window.uiUtils.showNotification('Settings reset to defaults');
        }
    } catch (error) {
        console.error('Error resetting settings:', error);
        window.uiUtils.showNotification('Error resetting settings', 'error');
    }
}

/**
 * Collects settings from the form
 * @returns {Object} - Settings object
 */
function getSettingsFromForm() {
    const settings = {
        lmStudioUrl      : getInputValue('lmStudioUrl'),
        lmStudioModel    : getInputValue('lmStudioModel'),
        serverPort       : getIntValue('serverPort', 65535),
        maxSearchResults : getIntValue('maxSearchResults', 3),
        searchTimeout    : getIntValue('searchTimeout', 5000),
        autoCheckLmStudio: getCheckboxValue('autoCheckLMStudio'),
        debugMode        : getCheckboxValue('debugMode'),
        systemPrompt     : getInputValue('systemPrompt'),
        minimizeToTray   : getCheckboxValue('minimizeToTray'),
        startWithWindows : getCheckboxValue('startWithWindows'),
        checkForUpdates  : getCheckboxValue('checkForUpdates'),
        defaultSearchMode: getSelectValue('defaultSearchMode'),

        // Chat history settings
        maxHistoryMessages: getIntValue('max-history-messages', 20),
        maxConversations  : getIntValue('max-conversations', 10),
    };

    // LLM settings
    const useLocalLlmElement = document.getElementById('useLocalLlm');
    if (useLocalLlmElement) {
        settings.useLocalLlm = useLocalLlmElement.checked;
    }

    // Context size, threads, and GPU layers
    const contextSizeElement = document.getElementById('context-size');
    if (contextSizeElement) {
        settings.contextSize = parseInt(contextSizeElement.value) || 2048;
    }

    const cpuThreadsElement = document.getElementById('cpu-threads');
    if (cpuThreadsElement) {
        settings.threads = parseInt(cpuThreadsElement.value) || 4;
    }

    const gpuLayersElement = document.getElementById('gpu-layers');
    if (gpuLayersElement) {
        settings.gpuLayers = parseInt(gpuLayersElement.value) || 0;
    }

    return settings;
}

/**
 * Gets value from a text input
 * @param {string} id - Input element ID
 * @param {string} defaultValue - Default value if not found
 * @returns {string} - Input value
 */
function getInputValue(id, defaultValue = '') {
    const element = document.getElementById(id);
    return element ? element.value : defaultValue;
}

/**
 * Gets integer value from a number input
 * @param {string} id - Input element ID
 * @param {number} defaultValue - Default value if not found
 * @returns {number} - Input value as integer
 */
function getIntValue(id, defaultValue = 0) {
    const element = document.getElementById(id);
    return element ? (parseInt(element.value) || defaultValue) : defaultValue;
}

/**
 * Gets checked state from a checkbox
 * @param {string} id - Checkbox element ID
 * @param {boolean} defaultValue - Default value if not found
 * @returns {boolean} - Checked state
 */
function getCheckboxValue(id, defaultValue = false) {
    const element = document.getElementById(id);
    return element ? element.checked : defaultValue;
}

/**
 * Gets value from a select element
 * @param {string} id - Select element ID
 * @param {string} defaultValue - Default value if not found
 * @returns {string} - Selected value
 */
function getSelectValue(id, defaultValue = '') {
    const element = document.getElementById(id);
    return element ? element.value : defaultValue;
}

/**
 * Sets value for a text input
 * @param {string} id - Input element ID
 * @param {string} value - Value to set
 */
function setInputValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = value !== undefined ? value : '';
}

/**
 * Sets checked state for a checkbox
 * @param {string} id - Checkbox element ID
 * @param {boolean} checked - Checked state
 */
function setCheckboxValue(id, checked) {
    const element = document.getElementById(id);
    if (element) element.checked = !!checked;
}

/**
 * Sets value for a select element
 * @param {string} id - Select element ID
 * @param {string} value - Value to select
 */
function setSelectValue(id, value) {
    const element = document.getElementById(id);
    if (element && value !== undefined) element.value = value;
}

/**
 * Initialize settings functionality
 */
function initSettings() {
    // Listen for settings reset event
    window.electronAPI.onSettingsReset((settings) => {
        updateSettingsForm(settings);
        window.appFunctions.loadDefaultSearchMode();
        window.uiUtils.showNotification('Settings have been reset');
    });

    // Listen for show settings event
    window.electronAPI.onShowSettings((settings) => {
        updateSettingsForm(settings);
        document.getElementById('settings-modal').style.display = 'block';
    });

    // Add token service change handler
    const tokenServiceSelect    = document.getElementById('token-service');
    const customDomainContainer = document.getElementById('custom-domain-container');

    if (tokenServiceSelect && customDomainContainer) {
        tokenServiceSelect.addEventListener('change', () => {
            const isCustom = tokenServiceSelect.value === 'custom';
            customDomainContainer.classList.toggle('hidden', !isCustom);
        });
    }

    // Add help links for tokens
    setupTokenHelpLinks();
}

/**
 * Sets up token help links
 */
function setupTokenHelpLinks() {
    const githubTokenHelp = document.getElementById('github-token-help');
    const gitlabTokenHelp = document.getElementById('gitlab-token-help');

    if (githubTokenHelp) {
        githubTokenHelp.addEventListener('click', (event) => {
            event.preventDefault();
            window.electronAPI.openExternalLink('https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token');
        });
    }

    if (gitlabTokenHelp) {
        gitlabTokenHelp.addEventListener('click', (event) => {
            event.preventDefault();
            window.electronAPI.openExternalLink('https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html');
        });
    }
}

// Export functions
window.settingsFunctions = {
    openSettings,
    updateSettingsForm,
    saveSettings,
    resetSettings,
    initSettings
};