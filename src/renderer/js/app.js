// src/renderer/js/app.js
// Main frontend application

/**
 * Main application entry point
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('Document loaded');
    // Initialize all UI components
    initUI();
    loadSources();

    initChatHistory();
    // Setup event handlers
    setupEventHandlers();
    setupIpcListeners();

    // Check initial connection status
    checkConnectionStatus();

    // Load default search mode
    loadDefaultSearchMode();
});

/**
 * Initialize UI components
 */
function initUI() {
    // Add copy buttons to all code blocks
    window.uiUtils.addCopyButtons();

    // Add conversation buttons to header
    addConversationButtons();

    // Initialize chat UI
    initChatUI();

    // Auto-resize text input
    setupTextareaAutoResize();

    // Initialize additional components
    if (window.fileBrowserFunctions && window.fileBrowserFunctions.initFileBrowser) {
        window.fileBrowserFunctions.initFileBrowser();
    }

    if (window.modelFunctions && window.modelFunctions.initModelManagement) {
        window.modelFunctions.initModelManagement();
    }

    if (window.settingsFunctions && window.settingsFunctions.initSettings) {
        window.settingsFunctions.initSettings();
    }
}

function getApiBaseUrl() {
    // Beim direkten File-Loading: Express-Server URL zurückgeben
    if (window.location.protocol === 'file:') {
        return `http://localhost:${window.electronAPI.getServerPort()}`;
    }
    // Bei Server-Loading: relativen Pfad verwenden
    return '';
}

/**
 * Setup event handlers
 */
function setupEventHandlers() {
    // Elements
    const sendButton     = document.getElementById('send-button');
    const userInput      = document.getElementById('user-input');
    const settingsButton = document.getElementById('settingsButton');

    // Send message on button click
    if (sendButton) {
        sendButton.addEventListener('click', sendMessage);
    }

    // Send message on Enter (not with Shift)
    if (userInput) {
        userInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        });

        // Focus input on page load
        userInput.focus();
    }

    // Open settings on button click
    if (settingsButton) {
        settingsButton.addEventListener('click', openSettings);
    }

    // Settings modal events
    setupSettingsModalEvents();

    // Setup tab navigation
    setupTabNavigation();

    // Setup folder and repository buttons
    setupSourceButtons();
}

/**
 * Setup source buttons (folders and repositories)
 */
function setupSourceButtons() {
    // Select folder button
    const selectFolderButton = document.getElementById('select-folder-button');
    if (selectFolderButton) {
        selectFolderButton.addEventListener('click', async () => {
            try {
                const result = await window.electronAPI.selectFolder();
                if (result.success) {
                    window.uiUtils.showNotification(`Folder added: ${result.folderName}`);
                    loadSources();
                } else if (!result.canceled) {
                    window.uiUtils.showNotification(`Error: ${result.error}`, 'error');
                }
            } catch (error) {
                window.uiUtils.showNotification(`Error: ${error.message}`, 'error');
            }
        });
    }

    // Add repository button
    const addRepositoryButton = document.getElementById('add-repository-button');
    if (addRepositoryButton) {
        addRepositoryButton.addEventListener('click', async () => {
            const repoUrl = document.getElementById('repo-url').value.trim();
            const repoBranch = document.getElementById('repo-branch').value.trim();

            if (!repoUrl) {
                window.uiUtils.showNotification('Please enter a repository URL', 'error');
                return;
            }

            try {
                const result = await window.electronAPI.addRepository({
                    url: repoUrl,
                    branch: repoBranch || 'main'
                });

                if (result.success) {
                    window.uiUtils.showNotification(`Repository added: ${result.repoId}`);
                    document.getElementById('repo-url').value = '';
                    document.getElementById('repo-branch').value = '';
                    loadSources();
                } else {
                    window.uiUtils.showNotification(`Error: ${result.error}`, 'error');
                }
            } catch (error) {
                window.uiUtils.showNotification(`Error: ${error.message}`, 'error');
            }
        });
    }

    // Save token button
    const saveTokenButton = document.getElementById('save-token-button');
    if (saveTokenButton) {
        saveTokenButton.addEventListener('click', async () => {
            const service = document.getElementById('token-service').value;
            const token = document.getElementById('token-value').value.trim();
            const domain = document.getElementById('token-domain')?.value.trim();

            if (!token) {
                window.uiUtils.showNotification('Please enter a token value', 'error');
                return;
            }

            try {
                const result = await window.electronAPI.saveGitToken({
                    service,
                    token,
                    domain: service === 'custom' ? domain : null
                });

                if (result.success) {
                    window.uiUtils.showNotification('Token saved successfully');
                    document.getElementById('token-value').value = '';
                    if (document.getElementById('token-domain')) {
                        document.getElementById('token-domain').value = '';
                    }
                } else {
                    window.uiUtils.showNotification(`Error: ${result.error}`, 'error');
                }
            } catch (error) {
                window.uiUtils.showNotification(`Error: ${error.message}`, 'error');
            }
        });
    }
}

/**
 * Setup tab navigation
 */
function setupTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes   = document.querySelectorAll('.tab-pane');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Change active tab
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Show tab content
            const tabId = button.getAttribute('data-tab');
            tabPanes.forEach(pane => pane.classList.remove('active'));
            document.getElementById(`${tabId}-tab`).classList.add('active');

            // Load content for specific tabs
            if (tabId === 'models') {
                loadModelsList();
            } else if (tabId === 'repositories') {
                loadSources();
            }
        });
    });
}

/**
 * Setup settings modal events
 */
function setupSettingsModalEvents() {
    const settingsModal        = document.getElementById('settings-modal');
    const closeSettingsButton  = document.querySelector('.close');
    const saveSettingsButton   = document.getElementById('save-settings');
    const cancelSettingsButton = document.getElementById('cancel-settings');
    const resetSettingsButton  = document.getElementById('reset-settings');

    if (closeSettingsButton) {
        closeSettingsButton.addEventListener('click', () => {
            settingsModal.style.display = 'none';
        });
    }

    if (cancelSettingsButton) {
        cancelSettingsButton.addEventListener('click', () => {
            settingsModal.style.display = 'none';
        });
    }

    if (saveSettingsButton) {
        saveSettingsButton.addEventListener('click', saveSettings);
    }

    if (resetSettingsButton) {
        resetSettingsButton.addEventListener('click', resetSettings);
    }

    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === settingsModal) {
            settingsModal.style.display = 'none';
        }
    });
}

/**
 * Setup IPC event listeners
 */
function setupIpcListeners() {
    // LM Studio status listener
    window.electronAPI.onLMStudioStatus((status) => {
        if (status && typeof status === 'object') {
            if (status.status && status.message) {
                updateApplicationStatus(status);
            } else {
                console.warn('Incomplete status', status);
            }
        } else {
            console.error('Invalid status received', status);
        }
    });

    // Model status listener
    window.electronAPI.onModelStatus((status) => {
        if (status && typeof status === 'object') {
            updateApplicationStatus(status);
        } else {
            console.error('Invalid model status received', status);
        }
    });

    // File processing status listener
    window.electronAPI.onProcessingStatus((status) => {
        if (status && typeof status === 'object') {
            if (status.status === 'processing-files') {
                // Show notification that files are being processed
                window.uiUtils.showNotification(`Processing ${status.count} file(s)...`, 'info');
            }
        }
    });

    // Settings dialog listener
    window.electronAPI.onShowSettings((settings) => {
        updateSettingsForm(settings);
        document.getElementById('settings-modal').style.display = 'block';
    });

    // Models tab listener
    window.electronAPI.onShowModelsTab(() => {
        const settingsModal         = document.getElementById('settings-modal');
        settingsModal.style.display = 'block';

        // Switch tab
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelector('[data-tab="models"]').classList.add('active');

        // Switch tab panes
        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
        document.getElementById('models-tab').classList.add('active');

        // Load models
        loadModelsList();
    });

    // Settings reset listener
    window.electronAPI.onSettingsReset((settings) => {
        updateSettingsForm(settings);
        loadDefaultSearchMode();
        window.uiUtils.showNotification('Settings have been reset');
    });

    // Model download progress listener
    window.electronAPI.onModelProgress((progress) => {
        const modelProgressBar  = document.getElementById('model-progress-bar');
        const modelProgressText = document.getElementById('model-progress-text');

        if (modelProgressBar && modelProgressText) {
            modelProgressBar.value        = progress.progress;
            modelProgressText.textContent = progress.text;
        }
    });
}

/**
 * Check connection status (LM Studio or model status)
 */
async function checkConnectionStatus() {
    try {
        console.log('checkConnectionStatus electronAPI', window.electronAPI)
        const config = await window.electronAPI.getSettings();

        // Remove the upper status display from the DOM as we don't need it anymore
        const modelStatusIndicator = document.getElementById('model-status-indicator');
        if (modelStatusIndicator) {
            modelStatusIndicator.style.display = 'none';
        }

        // Always show the bottom status bar
        document.getElementsByClassName('status')[0].style.display = 'flex';

        if (config.useLocalLlm) {
            // For local LLM: Check model status
            const modelResult = await window.electronAPI.getAvailableModels();
            if (modelResult.success && modelResult.currentModel) {
                updateApplicationStatus({
                    status : 'loaded',
                    message: `Model loaded: ${modelResult.currentModel}`,
                    model  : modelResult.currentModel
                });
            } else {
                updateApplicationStatus({
                    status : 'error',
                    message: 'No model loaded'
                });
            }
        } else {
            // For LM Studio: Check connection
            await window.electronAPI.checkLMStudioStatus();
        }
    } catch (error) {
        console.error('Error checking status:', error);
        updateApplicationStatus({
            status : 'error',
            message: 'Connection problem'
        });
    }
}

/**
 * Loads the default search mode from settings
 */
async function loadDefaultSearchMode() {
    try {
        console.log('loadDefaultSearchMode electronAPI', window.electronAPI)
        const config        = await window.electronAPI.getSettings();
        const webSearchMode = document.getElementById('webSearchMode');

        if (webSearchMode && config.defaultSearchMode) {
            webSearchMode.value = config.defaultSearchMode;
        } else if (webSearchMode) {
            webSearchMode.value = 'auto'; // Default if not defined
        }
    } catch (error) {
        console.error('Error loading default search mode:', error);
    }
}

/**
 * Updates the application status based on mode (local LLM or LM Studio)
 * @param {Object} status - Status object
 */
function updateApplicationStatus(status) {
    const statusIndicator = document.getElementById('status-indicator');
    if (!statusIndicator) return;

    window.electronAPI.getSettings().then(config => {
        // Update the status indicator using uiUtils
        window.uiUtils.updateStatusIndicator(
            status.status,
            config.useLocalLlm
                ? (status.status === 'loaded' ? `Model loaded: ${status.model || status.message.split(': ')[1] || ''}` : status.message)
                : (status.status === 'connected' ? 'Connected to LM Studio' : status.message),
            statusIndicator
        );
    }).catch(error => {
        console.error("Error getting settings:", error);
        // Fallback on error
        window.uiUtils.updateStatusIndicator(status.status, status.message, statusIndicator);
    });
}

/**
 * Auto-resize textarea on input
 */
function setupTextareaAutoResize() {
    const userInput = document.getElementById('user-input');

    if (userInput) {
        userInput.addEventListener('input', function () {
            // Reset height to auto to get the scrollHeight
            this.style.height    = 'auto';
            // Set new height to scrollHeight limited to 300px
            this.style.height    = Math.min(this.scrollHeight, 300) + 'px';
            // Show scrollbar if scrollHeight > 300px
            this.style.overflowY = this.scrollHeight > 300 ? 'scroll' : 'hidden';
        });

        // Initial size
        setTimeout(() => {
            userInput.style.height = 'auto';
            userInput.style.height = Math.min(userInput.scrollHeight, 300) + 'px';
        }, 0);
    }
}

/**
 * Adds conversation buttons to the header
 */
function addConversationButtons() {
    // Create container for conversation buttons
    const buttonsContainer     = document.createElement('div');
    buttonsContainer.className = 'flex items-center gap-2 ml-4';

    // New chat button
    const newChatButton     = document.createElement('button');
    newChatButton.className = 'bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium py-1 px-2';
    newChatButton.innerHTML = '<i class="fas fa-plus mr-1"></i> New Chat';
    newChatButton.addEventListener('click', startNewConversation);

    // History button
    const historyButton     = document.createElement('button');
    historyButton.className = 'bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium py-1 px-2';
    historyButton.innerHTML = '<i class="fas fa-history mr-1"></i> History';
    historyButton.addEventListener('click', showHistoryModal);

    // Add buttons to container
    buttonsContainer.appendChild(newChatButton);
    buttonsContainer.appendChild(historyButton);

    // Find the right place to insert the container
    const headerRightElement = document.querySelector('header > div');
    if (headerRightElement) {
        headerRightElement.insertBefore(buttonsContainer, headerRightElement.firstChild);
    }
}

/**
 * Loads source information (folders and repositories)
 */
async function loadSources() {
    try {
        const result = await window.electronAPI.getAllSources();

        if (result.success) {
            renderFolders(result.folders);
            renderRepositories(result.repositories);
        } else {
            console.error('Error loading sources:', result.error);
        }
    } catch (error) {
        console.error('Error loading sources:', error);
    }
}

/**
 * Renders the list of folders
 * @param {Object} folders - Object containing folder information
 */
function renderFolders(folders) {
    const foldersList = document.getElementById('folders-list');
    if (!foldersList) return;

    if (Object.keys(folders).length === 0) {
        foldersList.innerHTML = '<p class="text-gray-500">No folders shared</p>';
        return;
    }

    foldersList.innerHTML = '';

    Object.values(folders).forEach(folder => {
        const template = document.getElementById('folder-item-template');
        if (!template) return;

        const clone = document.importNode(template.content, true);

        clone.querySelector('.folder-name-text').textContent = folder.name;
        clone.querySelector('.folder-path').textContent = folder.path;

        clone.querySelector('.browse-folder-button').addEventListener('click', () => {
            if (window.fileBrowserFunctions) {
                window.fileBrowserFunctions.openFileBrowser(folder.id, 'folder', folder.name);
            }
        });

        clone.querySelector('.remove-folder-button').addEventListener('click', async () => {
            try {
                const result = await window.electronAPI.removeSource({ sourceId: folder.id });
                if (result.success) {
                    window.uiUtils.showNotification(`Folder removed: ${folder.name}`);
                    loadSources();
                } else {
                    window.uiUtils.showNotification(`Error: ${result.error}`, 'error');
                }
            } catch (error) {
                window.uiUtils.showNotification(`Error: ${error.message}`, 'error');
            }
        });

        foldersList.appendChild(clone);
    });
}

/**
 * Renders the list of repositories
 * @param {Object} repositories - Object containing repository information
 */
function renderRepositories(repositories) {
    const repositoriesList = document.getElementById('repositories-list');
    if (!repositoriesList) return;

    if (Object.keys(repositories).length === 0) {
        repositoriesList.innerHTML = '<p class="text-gray-500">No repositories shared</p>';
        return;
    }

    repositoriesList.innerHTML = '';

    Object.values(repositories).forEach(repo => {
        const template = document.getElementById('repository-item-template');
        if (!template) return;

        const clone = document.importNode(template.content, true);

        clone.querySelector('.repo-name-text').textContent = repo.name;
        clone.querySelector('.repo-url').textContent = repo.url;

        const statusText = repo.lastSynced
            ? `Last synced: ${new Date(repo.lastSynced).toLocaleString()}`
            : 'Not yet synchronized';
        clone.querySelector('.repo-status-text').textContent = statusText;

        clone.querySelector('.browse-repo-button').addEventListener('click', () => {
            if (window.fileBrowserFunctions) {
                window.fileBrowserFunctions.openFileBrowser(repo.id, 'repository', repo.name);
            }
        });

        clone.querySelector('.sync-repo-button').addEventListener('click', async () => {
            try {
                const result = await window.electronAPI.syncRepository({ repoId: repo.id });
                if (result.success) {
                    window.uiUtils.showNotification(`Repository synchronized: ${repo.name}`);
                    loadSources();
                } else {
                    window.uiUtils.showNotification(`Error: ${result.error}`, 'error');
                }
            } catch (error) {
                window.uiUtils.showNotification(`Error: ${error.message}`, 'error');
            }
        });

        clone.querySelector('.remove-repo-button').addEventListener('click', async () => {
            try {
                const result = await window.electronAPI.removeSource({ sourceId: repo.id });
                if (result.success) {
                    window.uiUtils.showNotification(`Repository removed: ${repo.name}`);
                    loadSources();
                } else {
                    window.uiUtils.showNotification(`Error: ${result.error}`, 'error');
                }
            } catch (error) {
                window.uiUtils.showNotification(`Error: ${error.message}`, 'error');
            }
        });

        repositoriesList.appendChild(clone);
    });
}

// Export main functions for other modules
window.appFunctions = {
    checkConnectionStatus,
    updateApplicationStatus,
    loadDefaultSearchMode,
    loadSources
};