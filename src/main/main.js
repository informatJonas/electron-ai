// src/main/main.js
// Main entry point for the Electron application

const { app, BrowserWindow, ipcMain, Menu, Tray, dialog, shell } = require('electron');
const path = require('path');

// Import services and utilities
const configManager = require('./config/config-manager');
const config = configManager.getConfig();
const LLMEngine = require('./llm/llm-engine');
const createExpressServer = require('./api/express-server');
const GitConnector = require('./services/git-connector');
const ChatHistoryManager = require('./services/chat-history');
const { ensureDirectoryExists } = require('./utils/file-utils');

// Dynamic imports (handled as needed)
let searchModule, lmStudioConnector;

// Global references
let mainWindow;
let tray;
let server;
let llmEngine;
let gitConnector;
let chatHistoryManager;
let lmStudioCheckInterval;
let expressServer;

/**
 * Initializes all services and modules
 */
async function initializeServices() {
    try {
        // Dynamically import modules
        const searchModuleImport = await import('./services/search.js');
        const lmStudioConnectorImport = await import('./llm/lm-studio-connector.js');

        // Assign imported modules
        searchModule = searchModuleImport;
        lmStudioConnector = lmStudioConnectorImport;

        // Configure paths
        const dataPath = app.getPath('userData');
        ensureDirectoryExists(dataPath);

        // Initialize Git connector
        gitConnector = new GitConnector({
            dataPath
        });
        console.log('GitConnector initialized');

        // Initialize Chat history manager
        chatHistoryManager = new ChatHistoryManager({
            maxHistoryMessages: config.maxHistoryMessages,
            maxConversations: config.maxConversations
        });
        console.log('ChatHistoryManager initialized');

        // Initialize LLM engine if using local LLM
        if (config.useLocalLlm) {
            initLLMEngine();
        }

        // Register IPC handlers
        registerIPCHandlers();

        return true;
    } catch (error) {
        console.error('Error initializing services:', error);
        return false;
    }
}

/**
 * Initializes the LLM engine
 */
function initLLMEngine() {
    llmEngine = new LLMEngine(config);

    // Automatically load last used model
    const lastModel = config.lastUsedModel;
    if (lastModel && config.useLocalLlm) {
        loadModel(lastModel);
    }
}

/**
 * Loads a model
 * @param {string} modelPath - Path to the model
 * @returns {Promise<boolean>} - Success status
 */
async function loadModel(modelPath) {
    try {
        if (!llmEngine) {
            console.error('LLM Engine not initialized');
            return false;
        }

        // Update UI status
        if (mainWindow) {
            mainWindow.webContents.send('model-status', {
                status: 'loading',
                message: `Loading model: ${modelPath}`
            });
        }

        // Load model
        const success = await llmEngine.loadModel(modelPath, {
            contextSize: config.contextSize || 2048,
            threads: config.threads || 4,
            gpuLayers: config.gpuLayers || 0
        });

        if (success) {
            // Update config
            configManager.updateConfig({
                lastUsedModel: modelPath
            });

            // Update UI status
            if (mainWindow) {
                mainWindow.webContents.send('model-status', {
                    status: 'loaded',
                    message: `Model loaded: ${modelPath}`,
                    model: modelPath
                });
            }

            return true;
        } else {
            throw new Error(`Failed to load model: ${modelPath}`);
        }
    } catch (error) {
        console.error('Error loading model:', error);

        // Update UI status
        if (mainWindow) {
            mainWindow.webContents.send('model-status', {
                status: 'error',
                message: `Error loading model: ${error.message}`
            });
        }

        return false;
    }
}

/**
 * Creates the main application window
 */
async function createWindow() {
    // Wait for services to initialize
    const servicesInitialized = await initializeServices();

    if (!servicesInitialized) {
        console.error('Failed to initialize services, exiting application');
        app.quit();
        return;
    }

    // Create browser window
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: true,
            enableRemoteModules: true,
        },
        icon: path.join(__dirname, '../../assets/icons/icon.png'),
        title: 'KI-Assistant',
        show: false, // Only show when loaded
        backgroundColor: '#f8fafc'
    });

    // Initialize Express server with dependencies
    expressServer = createExpressServer({
        config,
        mainWindow,
        llmEngine,
        chatHistoryManager,
        duckDuckGoSearch: searchModule.duckDuckGoSearch,
        fetchWebContent: searchModule.fetchWebContent,
        checkLMStudioStatus: lmStudioConnector.checkLMStudioStatus,
        gitConnector
    });

    // Start Express server
    const serverPort = config.serverPort;
    server = await expressServer.startServer(serverPort);

    // Load app from Express server
    await mainWindow.loadURL(`http://localhost:${serverPort}`);

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();

        // Check LM Studio connection or LLM status
        if (config.useLocalLlm) {
            // LLM Engine is already initialized in initializeServices
        } else {
            checkLMStudioConnection();
        }
    });

    // Create application menu
    createMenu();

    // Create system tray
    if (config.minimizeToTray) {
        createTray();
    }

    // Start LM Studio status check if not using local LLM
    if (!config.useLocalLlm && config.autoCheckLmStudio) {
        startLMStudioCheck();
    }

    // Window events
    mainWindow.on('closed', () => {
        mainWindow = null;
        stopServer();
    });

    // Minimize to tray
    if (config.minimizeToTray) {
        mainWindow.on('minimize', (event) => {
            event.preventDefault();
            mainWindow.hide();
        });
    }

    // Set up auto-startup
    app.setLoginItemSettings({
        openAtLogin: config.startWithWindows,
        path: app.getPath('exe')
    });
}

/**
 * Creates the application menu
 */
function createMenu() {
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Settings',
                    click: showSettings
                },
                {type: 'separator'},
                {
                    label: 'Manage Models',
                    click: showModels
                },
                {type: 'separator'},
                {
                    label: 'Open LM Studio',
                    visible: !config.useLocalLlm,
                    click: openLMStudio
                },
                {type: 'separator'},
                {
                    label: 'Exit',
                    click: () => app.quit()
                }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                {role: 'undo'},
                {role: 'redo'},
                {type: 'separator'},
                {role: 'cut'},
                {role: 'copy'},
                {role: 'paste'}
            ]
        },
        {
            label: 'View',
            submenu: [
                {role: 'reload'},
                {role: 'forceReload'},
                {type: 'separator'},
                {role: 'resetZoom'},
                {role: 'zoomIn'},
                {role: 'zoomOut'},
                {type: 'separator'},
                {role: 'togglefullscreen'}
            ]
        },
        {
            label: 'Tools',
            submenu: [
                {
                    label: 'Developer Tools',
                    click: () => {
                        if (mainWindow) mainWindow.webContents.toggleDevTools();
                    }
                },
                {
                    label: 'Reset Settings',
                    click: resetSettings
                }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'About',
                    click: showAbout
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

/**
 * Creates system tray icon
 */
function createTray() {
    tray = new Tray(path.join(__dirname, '../../assets/icons/icon.png'));

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Open',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                }
            }
        },
        {type: 'separator'},
        {
            label: 'Open LM Studio',
            visible: !config.useLocalLlm,
            click: openLMStudio
        },
        {
            label: 'Manage Models',
            visible: config.useLocalLlm,
            click: showModels
        },
        {type: 'separator'},
        {
            label: 'Exit',
            click: () => {
                app.quit();
            }
        }
    ]);

    tray.setToolTip('KI-Assistant');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.show();
            }
        }
    });
}

/**
 * Starts LM Studio connection check
 */
function startLMStudioCheck() {
    if (config.autoCheckLmStudio) {
        lmStudioCheckInterval = setInterval(checkLMStudioConnection, 30000);
    }
}

/**
 * Checks LM Studio connection status
 */
async function checkLMStudioConnection() {
    if (!mainWindow) {
        return;
    }

    try {
        const status = await lmStudioConnector.checkLMStudioStatus(config.lmStudioUrl);

        console.log('MAIN: Status check result:', status);

        const statusMessage = {
            status: status ? 'connected' : 'disconnected',
            message: status
                ? 'Connected to LM Studio'
                : 'LM Studio not reachable'
        };

        // Additional checks before sending
        if (mainWindow && !mainWindow.isDestroyed()) {
            // Always send lm-studio-status, even in local LLM mode
            mainWindow.webContents.send('lm-studio-status', statusMessage);
        }
    } catch (error) {
        console.error('MAIN: Error checking connection:', error);
    }
}

/**
 * Checks connection status based on current mode
 */
async function checkConnectionStatus() {
    try {
        if (config.useLocalLlm) {
            // For local LLM: Check model status
            const modelResult = await llmEngine.getAvailableModels();
            if (modelResult.success && modelResult.currentModel) {
                // Send model status
                if (mainWindow) {
                    mainWindow.webContents.send('model-status', {
                        status: 'loaded',
                        message: `Model loaded: ${modelResult.currentModel}`,
                        model: modelResult.currentModel
                    });
                }
            } else {
                if (mainWindow) {
                    mainWindow.webContents.send('model-status', {
                        status: 'error',
                        message: 'No model loaded'
                    });
                }
            }
        } else {
            // For LM Studio: Check connection
            await checkLMStudioConnection();
        }
    } catch (error) {
        console.error('Error checking status:', error);
        if (mainWindow) {
            mainWindow.webContents.send('model-status', {
                status: 'error',
                message: 'Connection problem'
            });
        }
    }
}

/**
 * Opens LM Studio application
 */
function openLMStudio() {
    const lmStudioPath = path.join(
        process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local'),
        'Programs',
        'LM Studio',
        'LM Studio.exe'
    );

    try {
        shell.openPath(lmStudioPath)
            .then(result => {
                if (result) {
                    dialog.showMessageBox(mainWindow, {
                        type: 'error',
                        title: 'Error',
                        message: `Could not open LM Studio: ${result}`,
                        detail: 'Please ensure LM Studio is installed.',
                        buttons: ['OK']
                    });
                }
            });
    } catch (error) {
        dialog.showMessageBox(mainWindow, {
            type: 'error',
            title: 'Error',
            message: 'Could not open LM Studio',
            detail: 'Please ensure LM Studio is installed.',
            buttons: ['OK']
        });
    }
}

/**
 * Shows settings dialog
 */
function showSettings() {
    if (!mainWindow) return;

    mainWindow.webContents.send('show-settings', config);
}

/**
 * Shows models management tab
 */
function showModels() {
    if (!mainWindow) return;

    mainWindow.webContents.send('show-models-tab');
}

/**
 * Resets settings to defaults
 */
function resetSettings() {
    const response = dialog.showMessageBoxSync(mainWindow, {
        type: 'question',
        buttons: ['Yes', 'No'],
        title: 'Reset Settings',
        message: 'Do you want to reset all settings to their default values?'
    });

    if (response === 0) { // "Yes" was clicked
        const newConfig = configManager.resetToDefaults();
        mainWindow.webContents.send('settings-reset', newConfig);

        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Settings Reset',
            message: 'All settings have been reset to their default values.',
            buttons: ['OK']
        });
    }
}

/**
 * Shows about dialog
 */
function showAbout() {
    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'About KI-Assistant',
        message: 'KI-Assistant',
        detail: 'Version 2.0.0\n\nA desktop application with integrated LLM and web search.\n\nDeveloped with Electron and Node.js.',
        buttons: ['OK']
    });
}

/**
 * Stops the server and cleans up resources
 */
function stopServer() {
    if (expressServer) {
        expressServer.stopServer();
    }

    if (lmStudioCheckInterval) {
        clearInterval(lmStudioCheckInterval);
        lmStudioCheckInterval = null;
    }

    // Close model if exists
    if (llmEngine && llmEngine.model) {
        llmEngine.model = null;
    }
}

/**
 * Registers all IPC handlers
 */
function registerIPCHandlers() {
    // Chat history handlers
    ipcMain.handle('get-chat-history', getHistoryHandler);
    ipcMain.handle('get-all-conversations', getAllConversationsHandler);
    ipcMain.handle('load-conversation', loadConversationHandler);
    ipcMain.handle('delete-conversation', deleteConversationHandler);
    ipcMain.handle('start-new-conversation', startNewConversationHandler);
    ipcMain.handle('clear-all-conversations', clearAllConversationsHandler);

    // Settings handlers
    ipcMain.handle('get-settings', getSettingsHandler);
    ipcMain.handle('save-settings', saveSettingsHandler);
    ipcMain.handle('reset-settings', resetSettingsHandler);

    // LM Studio handlers
    ipcMain.handle('check-lm-studio', checkLMStudioHandler);

    // External link handler
    ipcMain.handle('open-external-link', openExternalLinkHandler);

    // LLM model handlers
    ipcMain.handle('get-available-models', getAvailableModelsHandler);
    ipcMain.handle('load-model', loadModelHandler);
    ipcMain.handle('download-model', downloadModelHandler);
    ipcMain.handle('delete-model', deleteModelHandler);
    ipcMain.handle('search-huggingface-models', searchHuggingFaceModelsHandler);

    // Folder and repository handlers
    ipcMain.handle('select-folder', selectFolderHandler);
    ipcMain.handle('add-repository', addRepositoryHandler);
    ipcMain.handle('save-git-token', saveGitTokenHandler);
    ipcMain.handle('list-files', listFilesHandler);
    ipcMain.handle('read-file', readFileHandler);
    ipcMain.handle('search-files', searchFilesHandler);
    ipcMain.handle('sync-repository', syncRepositoryHandler);
    ipcMain.handle('remove-source', removeSourceHandler);
    ipcMain.handle('get-all-sources', getAllSourcesHandler);
}

/**
 * Chat history IPC handlers
 */
async function getHistoryHandler() {
    try {
        if (!chatHistoryManager) return {success: false, error: 'ChatHistoryManager not initialized'};

        return {
            success: true,
            currentSessionId: chatHistoryManager.currentSessionId,
            messages: chatHistoryManager.getCurrentHistory()
        };
    } catch (error) {
        console.error('Error getting chat history:', error);
        return {success: false, error: error.message};
    }
}

async function getAllConversationsHandler() {
    try {
        if (!chatHistoryManager) return {success: false, error: 'ChatHistoryManager not initialized'};

        const conversations = chatHistoryManager.getAllConversations();
        return {success: true, conversations};
    } catch (error) {
        console.error('Error getting all conversations:', error);
        return {success: false, error: error.message};
    }
}

async function loadConversationHandler(event, {conversationId}) {
    try {
        if (!chatHistoryManager) return {success: false, error: 'ChatHistoryManager not initialized'};

        const messages = chatHistoryManager.loadConversation(conversationId);
        return {
            success: true,
            conversationId,
            messages
        };
    } catch (error) {
        console.error('Error loading conversation:', error);
        return {success: false, error: error.message};
    }
}

async function deleteConversationHandler(event, {conversationId}) {
    try {
        if (!chatHistoryManager) return {success: false, error: 'ChatHistoryManager not initialized'};

        const result = chatHistoryManager.deleteConversation(conversationId);
        return {success: result};
    } catch (error) {
        console.error('Error deleting conversation:', error);
        return {success: false, error: error.message};
    }
}

async function startNewConversationHandler() {
    try {
        // Cancel current request if active
        if (expressServer) {
            expressServer.cancelCurrentRequest();
        }

        if (!chatHistoryManager) return {success: false, error: 'ChatHistoryManager not initialized'};

        const sessionId = chatHistoryManager.startNewConversation();
        return {success: true, sessionId};
    } catch (error) {
        console.error('Error starting new conversation:', error);
        return {success: false, error: error.message};
    }
}

async function clearAllConversationsHandler() {
    try {
        if (!chatHistoryManager) return {success: false, error: 'ChatHistoryManager not initialized'};

        const result = chatHistoryManager.deleteAllConversations();
        return {success: result};
    } catch (error) {
        console.error('Error clearing all conversations:', error);
        return {success: false, error: error.message};
    }
}

/**
 * Settings IPC handlers
 */
async function getSettingsHandler() {
    try {
        return configManager.getConfig();
    } catch (error) {
        console.error('Error getting settings:', error);
        return null;
    }
}

async function saveSettingsHandler(event, newSettings) {
    try {
        const updatedConfig = configManager.updateConfig(newSettings);

        // Immediately reload settings and check
        const currentConfig = configManager.getConfig();

        // Check for LLM mode change
        if (currentConfig.useLocalLlm !== config.useLocalLlm) {
            if (currentConfig.useLocalLlm) {
                // Switch to local LLM
                if (lmStudioCheckInterval) {
                    clearInterval(lmStudioCheckInterval);
                    lmStudioCheckInterval = null;
                }

                // Initialize LLM Engine if not already done
                if (!llmEngine) {
                    initLLMEngine();
                }
            } else {
                // Switch to LM Studio
                if (!lmStudioCheckInterval && currentConfig.autoCheckLmStudio) {
                    startLMStudioCheck();
                }

                // Immediate connection check
                checkLMStudioConnection();
            }
        }

        return {success: true, config: updatedConfig};
    } catch (error) {
        console.error('Error saving settings:', error);
        return {success: false, error: error.message};
    }
}

async function resetSettingsHandler() {
    try {
        console.log('Resetting settings...');
        const newConfig = configManager.resetToDefaults();
        console.log('Settings reset:', newConfig);
        return {success: true, config: newConfig};
    } catch (error) {
        console.error('Error resetting settings:', error);
        return {success: false, error: error.message};
    }
}

/**
 * LM Studio IPC handlers
 */
async function checkLMStudioHandler() {
    console.log('Main: Manual LM Studio status check requested');
    try {
        await checkLMStudioConnection();
        return {success: true};
    } catch (error) {
        console.error('Main: Error in manual status check', error);
        return {success: false, error: error.message};
    }
}

/**
 * External link IPC handler
 */
async function openExternalLinkHandler(event, url) {
    try {
        await shell.openExternal(url);
        return {success: true};
    } catch (error) {
        console.error('Error opening link:', error);
        return {success: false, error: error.message};
    }
}

/**
 * LLM model IPC handlers
 */
async function getAvailableModelsHandler() {
    try {
        if (!llmEngine) {
            if (config.useLocalLlm) {
                initLLMEngine();
            } else {
                return {success: false, error: 'Local LLM is disabled'};
            }
        }

        const models = await llmEngine.getAvailableModels();
        return {success: true, models, currentModel: llmEngine.currentModel};
    } catch (error) {
        console.error('Error getting available models:', error);
        return {success: false, error: error.message};
    }
}

async function loadModelHandler(event, modelPath) {
    try {
        if (!config.useLocalLlm) {
            return {success: false, error: 'Local LLM is disabled'};
        }

        const success = await loadModel(modelPath);
        return {success, model: modelPath};
    } catch (error) {
        console.error('Error loading model:', error);
        return {success: false, error: error.message};
    }
}

async function downloadModelHandler(event, {url, modelName}) {
    try {
        if (!llmEngine) {
            if (config.useLocalLlm) {
                initLLMEngine();
            } else {
                return {success: false, error: 'Local LLM is disabled'};
            }
        }

        // Update UI status
        mainWindow.webContents.send('model-status', {
            status: 'downloading',
            message: `Downloading model: ${modelName}`
        });

        await llmEngine.downloadModel(url, modelName, mainWindow);

        // Update UI status
        mainWindow.webContents.send('model-status', {
            status: 'downloaded',
            message: `Model downloaded: ${modelName}`
        });

        return {success: true, modelName};
    } catch (error) {
        console.error('Error downloading model:', error);

        // Update UI status
        mainWindow.webContents.send('model-status', {
            status: 'error',
            message: `Error downloading model: ${error.message}`
        });

        return {success: false, error: error.message};
    }
}

async function deleteModelHandler(event, modelName) {
    try {
        if (!llmEngine) {
            return {success: false, error: 'LLM Engine not initialized'};
        }

        await llmEngine.deleteModel(modelName);

        // Update UI status
        mainWindow.webContents.send('model-status', {
            status: 'deleted',
            message: `Model deleted: ${modelName}`
        });

        return {success: true};
    } catch (error) {
        console.error('Error deleting model:', error);
        return {success: false, error: error.message};
    }
}

async function searchHuggingFaceModelsHandler(event, query) {
    try {
        console.log(`Searching for Hugging Face models: "${query}"`);

        // Dynamically import huggingface module
        const huggingFace = await import('./llm/huggingface.js');
        const models = await huggingFace.searchModels(query);

        return {success: true, models};
    } catch (error) {
        console.error('Error searching for models:', error);
        return {success: false, error: error.message};
    }
}

/**
 * File and repository IPC handlers
 */
async function selectFolderHandler() {
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        });

        if (result.canceled) {
            return {success: false, canceled: true};
        }

        const folderPath = result.filePaths[0];
        const folderName = path.basename(folderPath);

        // Add folder to GitConnector
        const folderId = gitConnector.addFolder({
            name: folderName,
            path: folderPath
        });

        return {
            success: true,
            folderId,
            folderPath,
            folderName
        };
    } catch (error) {
        console.error('Error selecting folder:', error);
        return {success: false, error: error.message};
    }
}

async function addRepositoryHandler(event, {url, branch, name}) {
    try {
        // Check repository URL
        const repoInfo = await gitConnector.checkRepositoryUrl(url);

        if (!repoInfo.success) {
            return {success: false, error: repoInfo.error};
        }

        // Add repository
        const repoId = gitConnector.addRepository({
            name: name || repoInfo.name,
            url,
            branch: branch || 'main',
            type: repoInfo.type,
            customDomain: repoInfo.customDomain,
            baseUrl: repoInfo.baseUrl,
            isPrivate: repoInfo.isPrivate
        });

        // Sync repository
        const syncResult = await gitConnector.syncRepository(repoId);

        return {
            success: true,
            repoId,
            ...repoInfo,
            syncResult
        };
    } catch (error) {
        console.error('Error adding repository:', error);
        return {success: false, error: error.message};
    }
}

async function saveGitTokenHandler(event, {service, token, domain}) {
    try {
        const tokenId = gitConnector.saveToken(service, token, domain);

        return {
            success: true,
            tokenId
        };
    } catch (error) {
        console.error('Error saving Git token:', error);
        return {success: false, error: error.message};
    }
}

async function listFilesHandler(event, {sourceId, subPath}) {
    try {
        return await gitConnector.listFiles(sourceId, subPath || '');
    } catch (error) {
        console.error('Error listing files:', error);
        return {success: false, error: error.message};
    }
}

async function readFileHandler(event, {sourceId, filePath}) {
    try {
        return await gitConnector.readFile(sourceId, filePath);
    } catch (error) {
        console.error('Error reading file:', error);
        return {success: false, error: error.message};
    }
}

async function searchFilesHandler(event, {sourceId, query, options}) {
    try {
        return await gitConnector.searchFiles(sourceId, query, options);
    } catch (error) {
        console.error('Error searching files:', error);
        return {success: false, error: error.message};
    }
}

async function syncRepositoryHandler(event, {repoId}) {
    try {
        return await gitConnector.syncRepository(repoId);
    } catch (error) {
        console.error('Error syncing repository:', error);
        return {success: false, error: error.message};
    }
}

async function removeSourceHandler(event, {sourceId}) {
    try {
        return await gitConnector.removeSource(sourceId);
    } catch (error) {
        console.error('Error removing source:', error);
        return {success: false, error: error.message};
    }
}

async function getAllSourcesHandler() {
    try {
        const repositories = gitConnector.getAllRepositories();
        const folders = gitConnector.getAllFolders();

        return {
            success: true,
            repositories,
            folders
        };
    } catch (error) {
        console.error('Error getting sources:', error);
        return {success: false, error: error.message};
    }
}

// App ready event
app.whenReady().then(createWindow);

// App events
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// App quit event
app.on('before-quit', () => {
    stopServer();
});

// For CommonJS compatibility
module.exports = {
    app
};