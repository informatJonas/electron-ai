// script.js - Frontend-Funktionalität
document.addEventListener('DOMContentLoaded', () => {
    loadSources();

    // Element-Referenzen
    const chatMessages         = document.getElementById('chat-messages');
    const userInput            = document.getElementById('user-input');
    const sendButton           = document.getElementById('send-button');
    const webSearchMode        = document.getElementById('webSearchMode');
    const statusIndicator      = document.getElementById('status-indicator');
    const contentUrlInput      = document.getElementById('content-url');
    const settingsButton       = document.getElementById('settingsButton');
    const settingsModal        = document.getElementById('settings-modal');
    const closeSettingsButton  = document.querySelector('.close');
    const saveSettingsButton   = document.getElementById('save-settings');
    const cancelSettingsButton = document.getElementById('cancel-settings');

    // Einstellungsfelder
    const lmStudioUrlInput       = document.getElementById('lmStudioUrl');
    const lmStudioModelInput     = document.getElementById('lmStudioModel');
    const serverPortInput        = document.getElementById('serverPort');
    const maxSearchResultsInput  = document.getElementById('maxSearchResults');
    const searchTimeoutInput     = document.getElementById('searchTimeout');
    const autoCheckLMStudioInput = document.getElementById('autoCheckLMStudio');
    const debugModeInput         = document.getElementById('debugMode');
    const systemPromptInput      = document.getElementById('systemPrompt');
    const minimizeToTrayInput    = document.getElementById('minimizeToTray');
    const startWithWindowsInput  = document.getElementById('startWithWindows');
    const checkForUpdatesInput   = document.getElementById('checkForUpdates');
    const defaultSearchModeInput = document.getElementById('defaultSearchMode');

    // Modellverwaltung-Elemente
    const modelsList            = document.getElementById('models-list');
    const downloadModelButton   = document.getElementById('download-model-button');
    const modelDownloadUrl      = document.getElementById('model-download-url');
    const modelDownloadName     = document.getElementById('model-download-name');
    const modelProgressBar      = document.getElementById('model-progress-bar');
    const modelProgressText     = document.getElementById('model-progress-text');
    const modelDownloadProgress = document.getElementById('model-download-progress');
    const modelStatusIndicator  = document.getElementById('model-status-indicator');
    const modelStatusText       = document.getElementById('model-status-text');
    const useLocalLlmToggle     = document.getElementById('useLocalLlm');
    const llmModeText           = document.getElementById('llm-mode-text');
    const localLlmSettings      = document.getElementById('local-llm-settings');
    const lmStudioSettings      = document.getElementById('lm-studio-settings');

    // Kontextgröße, CPU-Threads und GPU-Layer
    const contextSizeInput = document.getElementById('context-size');
    const cpuThreadsInput  = document.getElementById('cpu-threads');
    const gpuLayersInput   = document.getElementById('gpu-layers');

    // Element-Referenzen
    const selectFolderButton    = document.getElementById('select-folder-button');
    const foldersList           = document.getElementById('folders-list');
    const addRepositoryButton   = document.getElementById('add-repository-button');
    const repoUrlInput          = document.getElementById('repo-url');
    const repoBranchInput       = document.getElementById('repo-branch');
    const repositoriesList      = document.getElementById('repositories-list');
    const tokenServiceSelect    = document.getElementById('token-service');
    const tokenDomainInput      = document.getElementById('token-domain');
    const tokenValueInput       = document.getElementById('token-value');
    const saveTokenButton       = document.getElementById('save-token-button');
    const customDomainContainer = document.getElementById('custom-domain-container');
    const githubTokenHelp       = document.getElementById('github-token-help');
    const gitlabTokenHelp       = document.getElementById('gitlab-token-help');

    // File Browser Modal Elemente
    const fileBrowserModal      = document.getElementById('file-browser-modal');
    const fileBrowserTitle      = document.getElementById('file-browser-title');
    const fileBrowserBack       = document.getElementById('file-browser-back');
    const fileBrowserPath       = document.getElementById('file-browser-path');
    const fileSearchInput       = document.getElementById('file-search-input');
    const fileSearchButton      = document.getElementById('file-search-button');
    const fileBrowserContent    = document.getElementById('file-browser-content');
    const fileContentViewer     = document.getElementById('file-content-viewer');
    const fileContentName       = document.getElementById('file-content-name');
    const fileContentPre        = document.getElementById('file-content-pre');
    const fileContentClose      = document.getElementById('file-content-close');
    const fileBrowserClose      = document.getElementById('file-browser-close');
    const fileBrowserSendToChat = document.getElementById('file-browser-send-to-chat');

    // UI-Zustände
    let currentBrowsingSource = null;
    let currentBrowsingPath   = '';
    let selectedFiles         = [];
    let browseHistory         = [];
    let sources               = {};

    // Status-Tracking
    let isProcessing = false;

    if (userInput) {
        // Auto-resize des Textfeldes beim Tippen
        userInput.addEventListener('input', function () {
            // Zuerst Höhe auf auto setzen, um die Scrollhöhe zu bekommen
            this.style.height    = 'auto';
            // Die neue Höhe auf die Scrollhöhe beschränkt auf 300px setzen
            this.style.height    = Math.min(this.scrollHeight, 300) + 'px';
            // Wenn die Scrollhöhe größer als 300px ist, Scrollbalken anzeigen
            this.style.overflowY = this.scrollHeight > 300 ? 'scroll' : 'hidden';
        });

        // Initial-Größe korrekt setzen
        setTimeout(() => {
            userInput.style.height = 'auto';
            userInput.style.height = Math.min(userInput.scrollHeight, 300) + 'px';
        }, 0);
    }

    // IPC-Listener für Dateiverarbeitungs-Status
    let removeProcessingListener = window.electronAPI.onProcessingStatus((status) => {
        if (status && typeof status === 'object') {
            if (status.status === 'processing-files') {
                // Zeige einen Hinweis an, dass Dateien verarbeitet werden
                showNotification(`Verarbeite ${status.count} Datei(en)...`, 'info');
            }
        }
    });

    // IPC-Listener für LM Studio Status
    let removeStatusListener = window.electronAPI.onLMStudioStatus((status) => {
        // Stelle sicher, dass der Status ein Objekt ist
        if (status && typeof status === 'object') {
            if (status.status && status.message) {
                updateStatusIndicator(status.status, status.message);
            } else {
                console.warn('Unvollständiger Status', status);
            }
        } else {
            console.error('Ungültiger Status empfangen', status);
        }
    });

    // IPC-Listener für Modell-Status
    let removeModelListener = window.electronAPI.onModelStatus((status) => {
        if (status && typeof status === 'object') {
            updateModelStatus(status);
        } else {
            console.error('Ungültiger Modell-Status empfangen', status);
        }
    });

    // IPC-Listener für Einstellungen-Dialog
    let removeSettingsListener = window.electronAPI.onShowSettings((settings) => {
        updateSettingsForm(settings);
        settingsModal.style.display = 'block';
    });

    // Tab für Modelle anzeigen, wenn angefordert
    window.electronAPI.onShowModelsTab(() => {
        settingsModal.style.display = 'block';
        // Tab wechseln
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelector('[data-tab="models"]').classList.add('active');

        // Tab-Inhalte umschalten
        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
        document.getElementById('models-tab').classList.add('active');

        // Modelle laden
        loadModelsList();
    });

    // Status-Prüfung starten
    checkConnectionStatus();

    // Standard-Suchmodus aus Einstellungen laden
    loadDefaultSearchMode();

    /**
     * Sendet die Nachricht an den Server
     */
    async function sendMessage() {
        const message    = userInput.value.trim();
        const contentUrl = contentUrlInput ? contentUrlInput.value.trim() : null;

        if (!message || isProcessing) return;

        // Zeige die Benutzernachricht
        await appendMessage('user', message);
        if (contentUrl) {
            await appendMessage('user', `📋 URL-Inhalt: ${contentUrl}`);
        }

        // Zeige Lade-Indikator
        const loadingElement = appendLoading();

        // Feld leeren und Status aktualisieren
        userInput.value = '';
        if (contentUrlInput) contentUrlInput.value = '';
        isProcessing        = true;
        sendButton.disabled = true;

        try {
            // Sende Anfrage an Server
            const response = await fetch('/api/chat', {
                method : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept'      : 'text/event-stream'
                },
                body   : JSON.stringify({
                    message      : message,
                    webSearchMode: webSearchMode.value,
                    contentUrl   : contentUrl
                })
            });

            // Lade-Indikator entfernen
            loadingElement.remove();

            if (!response.ok) {
                throw new Error('Netzwerkantwort war nicht ok');
            }

            // Vorbereitung für Streaming-Antwort
            const responseElement     = document.createElement('div');
            responseElement.className = 'message assistant';
            const contentElement      = document.createElement('div');
            contentElement.className  = 'message-content';
            responseElement.appendChild(contentElement);
            chatMessages.appendChild(responseElement);

            // Stream-Verarbeitung
            const reader         = response.body.getReader();
            const decoder        = new TextDecoder();
            let fullResponse     = '';
            let isStreamComplete = false;

            while (!isStreamComplete) {
                const {done, value} = await reader.read();

                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            let content = line.substring(6);

                            if (content !== 'END') {
                                content = JSON.parse(line.substring(6));
                            } else {
                                isStreamComplete = true;

                                // Finale Formatierung
                                contentElement.innerHTML = await processText(fullResponse);

                                // Links klickbar machen
                                const links = contentElement.querySelectorAll('a');
                                links.forEach(link => {
                                    link.addEventListener('click', (event) => {
                                        event.preventDefault();
                                        window.electronAPI.openExternalLink(link.href);
                                    });
                                });

                                break; // Beende die innere Schleife
                            }

                            // Inkrementelle Antwort
                            fullResponse += content;
                            contentElement.innerHTML = await processText(fullResponse);

                            // Scrollen
                            //chatMessages.scrollTop = chatMessages.scrollHeight;
                        } catch (parseError) {
                            console.error('Parsing-Fehler:', parseError);
                        }
                    }
                }

                // Beende äußere Schleife, wenn Stream komplett
                if (isStreamComplete) break;
            }
        } catch (error) {
            console.error('Fehler beim Senden der Nachricht:', error);
            await appendMessage('assistant', 'Verbindungsfehler: Stelle sicher, dass der Server läuft und das Modell geladen ist.');
            updateStatusIndicator('error', 'Verbindungsproblem: Server nicht erreichbar');
        } finally {
            isProcessing        = false;
            sendButton.disabled = false;
            userInput.focus();
        }
    }

    /**
     * Prüft den Verbindungsstatus (LM Studio oder Modell-Status)
     */
    async function checkConnectionStatus() {
        try {
            const config = await window.electronAPI.getSettings();

            if (config.useLocalLlm) {
                // Bei lokalem LLM: Modellstatus prüfen
                const modelResult = await window.electronAPI.getAvailableModels();
                if (modelResult.success && modelResult.currentModel) {
                    updateModelStatus({
                        status : 'loaded',
                        message: `Modell geladen: ${modelResult.currentModel}`
                    });
                } else {
                    updateModelStatus({
                        status : 'error',
                        message: 'Kein Modell geladen'
                    });
                }

                document.getElementsByClassName('status')[0].style.display = 'none';
            } else {
                document.getElementsByClassName('status')[0].style.display = 'flex';
                // Bei LM Studio: Verbindung prüfen
                await window.electronAPI.checkLMStudioStatus();
            }
        } catch (error) {
            console.error('Fehler bei der Statusprüfung:', error);
            updateStatusIndicator('error', 'Verbindungsproblem');
        }
    }

    /**
     * Lädt den Standard-Suchmodus aus den Einstellungen
     */
    async function loadDefaultSearchMode() {
        try {
            const config = await window.electronAPI.getSettings();
            if (config.defaultSearchMode) {
                webSearchMode.value = config.defaultSearchMode;
            } else {
                webSearchMode.value = 'auto'; // Standardwert, wenn nicht definiert
            }
        } catch (error) {
            console.error('Fehler beim Laden des Standard-Suchmodus:', error);
        }
    }

    /**
     * Aktualisiert die Statusanzeige für LM Studio
     * @param {string} status - 'connected', 'disconnected' oder 'error'
     * @param {string} message - Anzuzeigende Nachricht
     */
    function updateStatusIndicator(status, message) {
        // Debug-Log hinzufügen
        const statusDot  = statusIndicator.querySelector('.status-dot');
        const statusText = statusIndicator.querySelector('span');

        // Stelle sicher, dass die Elemente existieren
        if (!statusDot || !statusText) {
            console.error('Status-Elemente nicht gefunden');
            return;
        }

        // Entferne alle Status-Klassen
        statusDot.classList.remove('online', 'offline', 'warning');

        // Setze die passende Klasse
        switch (status) {
            case 'connected':
                statusDot.classList.add('online');
                break;
            case 'disconnected':
                statusDot.classList.add('offline');
                break;
            case 'warning':
                statusDot.classList.add('warning');
                break;
            default:
                statusDot.classList.add('offline');
        }

        // Aktualisiere den Text
        statusText.textContent = message;
    }

    /**
     * Aktualisiert den Modellstatus im UI
     * @param {object} status - Statusobjekt mit status und message
     */
    function updateModelStatus(status) {
        if (!modelStatusIndicator) return;

        const statusDot = modelStatusIndicator.querySelector('.status-dot');

        // Status-Punkt aktualisieren
        statusDot.classList.remove('online', 'offline', 'warning');

        switch (status.status) {
            case 'loaded':
                statusDot.classList.add('online');
                break;
            case 'loading':
            case 'downloading':
                statusDot.classList.add('warning');
                break;
            case 'error':
                statusDot.classList.add('offline');
                break;
            default:
                statusDot.classList.add('offline');
        }

        // Statustext aktualisieren
        if (modelStatusText) {
            modelStatusText.textContent = status.message;
        }
    }

    /**
     * Fügt eine Nachricht zum Chat hinzu
     */
    async function appendMessage(sender, text) {
        const messageElement     = document.createElement('div');
        messageElement.className = `message ${sender}`;

        const contentElement     = document.createElement('div');
        contentElement.className = 'message-content';

        // Verarbeite Markdown-ähnliche Formatierung
        contentElement.innerHTML = await processText(text);

        // Event-Listener für Link-Klicks hinzufügen
        setTimeout(() => {
            const links = contentElement.querySelectorAll('a');
            links.forEach(link => {
                link.addEventListener('click', (event) => {
                    event.preventDefault();
                    // Öffne den Link mit Electron's shell.openExternal
                    window.electronAPI.openExternalLink(link.href);
                });
            });
        }, 0);

        messageElement.appendChild(contentElement);
        chatMessages.appendChild(messageElement);

        // Scroll nach unten
        chatMessages.scrollTop = chatMessages.scrollHeight;

        return messageElement;
    }

    /**
     * Fügt einen Lade-Indikator hinzu
     */
    function appendLoading() {
        const loadingElement     = document.createElement('div');
        loadingElement.className = 'message assistant';

        const loadingContent     = document.createElement('div');
        loadingContent.className = 'loading';

        for (let i = 0; i < 3; i++) {
            const dot     = document.createElement('div');
            dot.className = 'loading-dot';
            loadingContent.appendChild(dot);
        }

        loadingElement.appendChild(loadingContent);
        chatMessages.appendChild(loadingElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        return loadingElement;
    }

    /**
     * Verarbeitet Text für Formatierung (Markdown)
     */
    async function processText(text) {
        return await window.markdownAPI.render(text);
    }

    /**
     * Sammelt Einstellungen aus dem Formular
     */
    function getSettingsFromForm() {
        const settings = {
            lmStudioUrl      : lmStudioUrlInput.value,
            lmStudioModel    : lmStudioModelInput.value,
            serverPort       : parseInt(serverPortInput.value) || 65535,
            maxSearchResults : parseInt(maxSearchResultsInput.value) || 3,
            searchTimeout    : parseInt(searchTimeoutInput.value) || 5000,
            autoCheckLmStudio: autoCheckLMStudioInput.checked,
            debugMode        : debugModeInput.checked,
            systemPrompt     : systemPromptInput.value,
            minimizeToTray   : minimizeToTrayInput.checked,
            startWithWindows : startWithWindowsInput.checked,
            checkForUpdates  : checkForUpdatesInput.checked,
            defaultSearchMode: defaultSearchModeInput.value
        };

        // LLM-Einstellungen hinzufügen, wenn verfügbar
        if (useLocalLlmToggle) {
            settings.useLocalLlm = useLocalLlmToggle.checked;
        }

        if (contextSizeInput) {
            settings.contextSize = parseInt(contextSizeInput.value) || 2048;
        }

        if (cpuThreadsInput) {
            settings.threads = parseInt(cpuThreadsInput.value) || 4;
        }

        if (gpuLayersInput) {
            settings.gpuLayers = parseInt(gpuLayersInput.value) || 0;
        }

        return settings;
    }

    /**
     * Aktualisiert das Einstellungsformular mit neuen Werten
     */
    function updateSettingsForm(config) {
        if (!config) return;

        // Grundeinstellungen
        if (lmStudioUrlInput) lmStudioUrlInput.value = config.lmStudioUrl || '';
        if (lmStudioModelInput) lmStudioModelInput.value = config.lmStudioModel || 'local-model';
        if (serverPortInput) serverPortInput.value = config.serverPort || 65535;
        if (maxSearchResultsInput) maxSearchResultsInput.value = config.maxSearchResults || 3;
        if (searchTimeoutInput) searchTimeoutInput.value = config.searchTimeout || 5000;
        if (autoCheckLMStudioInput) autoCheckLMStudioInput.checked = !!config.autoCheckLmStudio;
        if (debugModeInput) debugModeInput.checked = !!config.debugMode;
        if (systemPromptInput) systemPromptInput.value = config.systemPrompt || '';
        if (minimizeToTrayInput) minimizeToTrayInput.checked = !!config.minimizeToTray;
        if (startWithWindowsInput) startWithWindowsInput.checked = !!config.startWithWindows;
        if (checkForUpdatesInput) checkForUpdatesInput.checked = !!config.checkForUpdates;
        if (defaultSearchModeInput) defaultSearchModeInput.value = config.defaultSearchMode || 'auto';

        // LLM-Einstellungen
        if (useLocalLlmToggle) useLocalLlmToggle.checked = config.useLocalLlm !== undefined ? config.useLocalLlm : true;
        if (contextSizeInput) contextSizeInput.value = config.contextSize || 2048;
        if (cpuThreadsInput) cpuThreadsInput.value = config.threads || 4;
        if (gpuLayersInput) gpuLayersInput.value = config.gpuLayers || 0;

        // UI-Element-Sichtbarkeit aktualisieren
        updateLLMMode(config.useLocalLlm);
    }

    /**
     * Zeigt eine Benachrichtigung an
     * @param {string} message - Anzuzeigende Nachricht
     * @param {string} type - Typ der Benachrichtigung ('success', 'error', 'info')
     */
    function showNotification(message, type = 'success') {
        const container    = document.getElementById('notification-container');
        const notification = document.createElement('div');

        notification.className   = `notification ${
            type === 'error' ? 'error' :
                type === 'info' ? 'info' : ''
        }`;
        notification.textContent = message;

        container.appendChild(notification);

        // Animation einblenden
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        // Automatisch ausblenden
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }

    // LLM-Modus umschalten
    if (useLocalLlmToggle) {
        useLocalLlmToggle.addEventListener('change', function () {
            const useLocalLlm = this.checked;
            updateLLMMode(useLocalLlm);
        });
    }

    // LLM-Modus aktualisieren
    function updateLLMMode(useLocalLlm) {
        if (llmModeText) {
            llmModeText.textContent = useLocalLlm
                ? 'Lokales LLM verwenden'
                : 'LM Studio verwenden';
        }

        if (localLlmSettings && lmStudioSettings) {
            localLlmSettings.style.display = useLocalLlm ? 'block' : 'none';
            lmStudioSettings.style.display = useLocalLlm ? 'none' : 'block';
        }
    }

    // Lade Modellliste bei Öffnen des Models-Tabs
    if (document.querySelector('[data-tab="models"]')) {
        document.querySelector('[data-tab="models"]').addEventListener('click', () => {
            loadModelsList();
        });
    }

    // Modell herunterladen
    if (downloadModelButton) {
        downloadModelButton.addEventListener('click', async () => {
            const url  = modelDownloadUrl.value.trim();
            const name = modelDownloadName.value.trim();

            if (!url || !name) {
                showNotification('URL und Name sind erforderlich', 'error');
                return;
            }

            try {
                // Download-UI anzeigen
                modelDownloadProgress.classList.remove('hidden');
                downloadModelButton.disabled = true;

                const result = await window.electronAPI.downloadModel({
                    url,
                    modelName: name
                });

                if (result.success) {
                    showNotification(`Modell "${name}" erfolgreich heruntergeladen`);
                    modelDownloadUrl.value  = '';
                    modelDownloadName.value = '';
                    loadModelsList(); // Liste aktualisieren
                } else {
                    showNotification(`Fehler: ${result.error}`, 'error');
                }
            } catch (error) {
                showNotification(`Fehler: ${error.message}`, 'error');
            } finally {
                modelDownloadProgress.classList.add('hidden');
                downloadModelButton.disabled = false;
            }
        });
    }

    // Fortschrittsanzeige aktualisieren
    window.electronAPI.onModelProgress((progress) => {
        if (modelProgressBar && modelProgressText) {
            modelProgressBar.value        = progress.progress;
            modelProgressText.textContent = progress.text;
        }
    });

    // Modellliste laden
    async function loadModelsList() {
        if (!modelsList) return;

        try {
            const result = await window.electronAPI.getAvailableModels();

            if (result.success) {
                renderModelsList(result.models, result.currentModel);
            } else {
                modelsList.innerHTML = `<p class="text-red-500">Fehler: ${result.error}</p>`;
            }
        } catch (error) {
            modelsList.innerHTML = `<p class="text-red-500">Fehler: ${error.message}</p>`;
        }
    }

    // Modellliste rendern
    function renderModelsList(models, currentModel) {
        if (!modelsList) return;

        if (!models || models.length === 0) {
            modelsList.innerHTML = '<p>Keine Modelle gefunden. Bitte laden Sie zuerst ein Modell herunter.</p>';
            return;
        }

        modelsList.innerHTML = '';

        models.forEach((model) => {
            const template = document.getElementById('model-item-template');
            if (!template) return;

            const clone = document.importNode(template.content, true);

            // Modellname und Info setzen
            clone.querySelector('.model-name').textContent = model;

            // Prüfen, ob es das aktuell geladene Modell ist
            if (model === currentModel) {
                clone.querySelector('.model-info').textContent        = 'Aktuell geladen';
                clone.querySelector('.load-model-button').disabled    = true;
                clone.querySelector('.load-model-button').textContent = 'Geladen';
            } else {
                clone.querySelector('.model-info').textContent = 'Klicken Sie auf "Laden", um dieses Modell zu verwenden';
            }

            // Lade-Button Event
            clone.querySelector('.load-model-button').addEventListener('click', async () => {
                try {
                    const result = await window.electronAPI.loadModel(model);

                    if (result.success) {
                        showNotification(`Modell "${model}" erfolgreich geladen`);
                        loadModelsList(); // Liste aktualisieren
                    } else {
                        showNotification(`Fehler: ${result.error}`, 'error');
                    }
                } catch (error) {
                    showNotification(`Fehler: ${error.message}`, 'error');
                }
            });

            // Lösch-Button Event
            clone.querySelector('.delete-model-button').addEventListener('click', async () => {
                // Sicherheitsabfrage
                if (confirm(`Sind Sie sicher, dass Sie das Modell "${model}" löschen möchten?`)) {
                    try {
                        const result = await window.electronAPI.deleteModel(model);

                        if (result.success) {
                            showNotification(`Modell "${model}" erfolgreich gelöscht`);
                            loadModelsList(); // Liste aktualisieren
                        } else {
                            showNotification(`Fehler: ${result.error}`, 'error');
                        }
                    } catch (error) {
                        showNotification(`Fehler: ${error.message}`, 'error');
                    }
                }
            });

            modelsList.appendChild(clone);
        });
    }

    // Settings Modal
    settingsButton.addEventListener('click', async () => {
        // Lade aktuelle Einstellungen beim Öffnen
        try {
            const config = await window.electronAPI.getSettings();
            updateSettingsForm(config);
        } catch (error) {
            console.error('Fehler beim Laden der Einstellungen:', error);
        }

        settingsModal.style.display = 'block';
    });

    closeSettingsButton.addEventListener('click', () => {
        settingsModal.style.display = 'none';
    });

    cancelSettingsButton.addEventListener('click', () => {
        settingsModal.style.display = 'none';
    });

    saveSettingsButton.addEventListener('click', async () => {
        // Einstellungen aus Formular sammeln
        const settings = getSettingsFromForm();

        try {
            // Einstellungen speichern
            const result = await window.electronAPI.saveSettings(settings);

            if (result.success) {
                showNotification('Einstellungen gespeichert');
                settingsModal.style.display = 'none';

                // Standard-Suchmodus aktualisieren, wenn er geändert wurde
                if (settings.defaultSearchMode) {
                    webSearchMode.value = settings.defaultSearchMode;
                }

                // Verbindungsstatus nach Modus-Änderung erneut prüfen
                checkConnectionStatus();
            }
        } catch (error) {
            console.error('Fehler beim Speichern der Einstellungen:', error);
            showNotification('Fehler beim Speichern der Einstellungen', 'error');
        }
    });

    // Reset-Button für Einstellungen
    document.getElementById('reset-settings').addEventListener('click', async () => {
        if (confirm('Möchtest du alle Einstellungen auf die Standardwerte zurücksetzen?')) {
            try {
                const result = await window.electronAPI.resetSettings();

                if (result.success) {
                    updateSettingsForm(result.config);
                    loadDefaultSearchMode();
                    showNotification('Einstellungen zurückgesetzt');
                }
            } catch (error) {
                console.error('Fehler beim Zurücksetzen der Einstellungen:', error);
                showNotification('Fehler beim Zurücksetzen der Einstellungen', 'error');
            }
        }
    });

    // Einstellungen zurückgesetzt Event
    let removeResetListener = window.electronAPI.onSettingsReset((settings) => {
        updateSettingsForm(settings);
        loadDefaultSearchMode();
        showNotification('Einstellungen wurden zurückgesetzt');
    });

    // Modal schließen, wenn außerhalb geklickt wird
    window.addEventListener('click', (event) => {
        if (event.target === settingsModal) {
            settingsModal.style.display = 'none';
        }
    });

    // Tab-Funktionalität
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes   = document.querySelectorAll('.tab-pane');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Aktiven Tab ändern
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Tab-Inhalt anzeigen
            const tabId = button.getAttribute('data-tab');
            tabPanes.forEach(pane => pane.classList.remove('active'));
            document.getElementById(`${tabId}-tab`).classList.add('active');
        });
    });

    // Event-Listener für Senden-Button und Enter-Taste
    sendButton.addEventListener('click', sendMessage);
    userInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });

    // Initialer Fokus auf Eingabefeld
    userInput.focus();

    // Event-Listener entfernen, wenn die Seite entladen wird
    window.addEventListener('beforeunload', () => {
        if (removeStatusListener) removeStatusListener();
        if (removeSettingsListener) removeSettingsListener();
        if (removeResetListener) removeResetListener();
        if (removeModelListener) removeModelListener();
        if (removeProcessingListener) removeProcessingListener();
    });

    function addCopyButtons() {
        document.querySelectorAll('pre code').forEach((codeBlock) => {
            if (!codeBlock.parentNode.querySelector('.copy-button')) {
                const button       = document.createElement('button');
                button.className   = 'copy-button';
                button.textContent = 'Kopieren';

                button.addEventListener('click', () => {
                    const code = codeBlock.innerText;
                    navigator.clipboard.writeText(code).then(() => {
                        button.textContent = 'Kopiert!';
                        setTimeout(() => {
                            button.textContent = 'Kopieren';
                        }, 2000);
                    }).catch((err) => {
                        console.error('Fehler beim Kopieren:', err);
                    });
                });

                const pre          = codeBlock.parentNode;
                pre.style.position = 'relative';
                pre.appendChild(button);
            }
        });
    }

    // Initiale Kopier-Buttons hinzufügen
    addCopyButtons();

    // MutationObserver, um auf dynamisch hinzugefügte Code-Blöcke zu reagieren
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.addedNodes.length) {
                addCopyButtons();
            }
        });
    });

    observer.observe(document.body, {childList: true, subtree: true});

    // Hugging Face Integration
    const hfSearchInput   = document.getElementById('hf-search-input');
    const hfSearchButton  = document.getElementById('hf-search-button');
    const hfSearchResults = document.getElementById('hf-search-results');
    const hfLoading       = document.getElementById('hf-loading');

    if (hfSearchButton && hfSearchInput) {
        // Suchfunktion für Hugging Face Modelle
        const searchHuggingFaceModels = async () => {
            const query = hfSearchInput.value.trim();
            if (!query) {
                showNotification('Bitte geben Sie einen Suchbegriff ein', 'error');
                return;
            }

            // UI-Status aktualisieren
            hfLoading.classList.remove('hidden');
            hfSearchResults.innerHTML = '';

            try {
                // API-Anfrage
                const result = await window.electronAPI.searchHuggingFaceModels(query);

                // Ergebnisse anzeigen
                if (result.success && result.models && result.models.length > 0) {
                    renderHuggingFaceModels(result.models);
                } else {
                    hfSearchResults.innerHTML = `
          <div class="text-center p-4">
            <p class="text-gray-600">Keine GGUF-Modelle gefunden für "${query}".</p>
            <p class="text-sm text-gray-500 mt-2">Versuchen Sie es mit anderen Suchbegriffen oder prüfen Sie Ihre Internetverbindung.</p>
          </div>
        `;
                }
            } catch (error) {
                console.error('Fehler bei der Hugging Face-Suche:', error);
                hfSearchResults.innerHTML = `
        <div class="text-center p-4 text-red-500">
          <p>Fehler bei der Suche: ${error.message || 'Unbekannter Fehler'}</p>
        </div>
      `;
            } finally {
                hfLoading.classList.add('hidden');
            }
        };

        // Event-Listener für die Suche
        hfSearchButton.addEventListener('click', searchHuggingFaceModels);
        hfSearchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                searchHuggingFaceModels();
            }
        });

        // Funktion zum Rendern der Suchergebnisse
        function renderHuggingFaceModels(models) {
            hfSearchResults.innerHTML = '';

            // Anzahl der Ergebnisse anzeigen
            const resultsCount       = document.createElement('p');
            resultsCount.className   = 'text-sm text-gray-600 mb-3';
            resultsCount.textContent = `${models.length} Modelle gefunden`;
            hfSearchResults.appendChild(resultsCount);

            models.forEach(model => {
                // Modell-Template klonen
                const template = document.getElementById('hf-model-template');
                const clone    = document.importNode(template.content, true);

                // Modelldetails einfügen
                clone.querySelector('.model-name').textContent      = model.name;
                clone.querySelector('.model-author').textContent    = `von ${model.author}`;
                clone.querySelector('.model-downloads').textContent = model.downloads.toLocaleString();

                // Beschreibung kürzen, wenn zu lang
                const description                                     = model.description || 'Keine Beschreibung verfügbar';
                clone.querySelector('.model-description').textContent =
                    description.length > 200 ? description.substring(0, 200) + '...' : description;

                // Dateiliste erstellen
                const fileList = clone.querySelector('.file-list');

                if (model.files && model.files.length > 0) {
                    model.files.forEach(file => {
                        const fileTemplate = document.getElementById('hf-file-template');
                        const fileClone    = document.importNode(fileTemplate.content, true);

                        fileClone.querySelector('.file-name').textContent = file.name;
                        fileClone.querySelector('.file-size').textContent = file.sizeFormatted;

                        // Download-Button-Handler
                        const downloadButton = fileClone.querySelector('.download-file-button');
                        downloadButton.addEventListener('click', async () => {
                            try {
                                // Erst fragen, ob der Benutzer das Modell wirklich herunterladen möchte
                                if (confirm(`Möchten Sie die Datei "${file.name}" (${file.sizeFormatted}) herunterladen?`)) {
                                    // Download starten
                                    await downloadHuggingFaceModel(file.url, file.name);
                                }
                            } catch (error) {
                                console.error('Fehler beim Modell-Download:', error);
                                showNotification(`Download-Fehler: ${error.message}`, 'error');
                            }
                        });

                        fileList.appendChild(fileClone);
                    });
                } else {
                    fileList.innerHTML = '<p class="text-gray-500">Keine GGUF-Dateien verfügbar</p>';
                }

                hfSearchResults.appendChild(clone);
            });
        }

        // Funktion zum Herunterladen eines Modells
        async function downloadHuggingFaceModel(url, filename) {
            try {
                // Status-Aktualisierung
                showNotification(`Download wird vorbereitet: ${filename}`, 'info');

                // Download starten
                const downloadResult = await window.electronAPI.downloadModel({
                    url      : url,
                    modelName: filename
                });

                if (downloadResult.success) {
                    showNotification(`Modell erfolgreich heruntergeladen: ${filename}`);
                    loadModelsList(); // Liste der verfügbaren Modelle aktualisieren
                } else {
                    showNotification(`Fehler beim Download: ${downloadResult.error}`, 'error');
                }
            } catch (error) {
                showNotification(`Download-Fehler: ${error.message}`, 'error');
                throw error;
            }
        }
    }

    // Repositories und Ordner laden
    async function loadSources() {
        try {
            const result = await window.electronAPI.getAllSources();

            if (result.success) {
                // Speichere die Quellen global für spätere Verwendung
                sources = {
                    repositories: result.repositories || {},
                    folders     : result.folders || {}
                };

                renderFolders(result.folders);
                renderRepositories(result.repositories);
            } else {
                console.error('Fehler beim Laden der Quellen:', result.error);
            }
        } catch (error) {
            console.error('Fehler beim Laden der Quellen:', error);
        }
    }

// Ordner auswählen
    if (selectFolderButton) {
        selectFolderButton.addEventListener('click', async () => {
            try {
                const result = await window.electronAPI.selectFolder();

                if (result.success) {
                    showNotification(`Ordner "${result.folderName}" hinzugefügt`);
                    loadSources(); // Liste aktualisieren
                } else if (!result.canceled) {
                    showNotification(`Fehler: ${result.error}`, 'error');
                }
            } catch (error) {
                showNotification(`Fehler: ${error.message}`, 'error');
            }
        });
    }

// Repository hinzufügen
    if (addRepositoryButton) {
        addRepositoryButton.addEventListener('click', async () => {
            const url    = repoUrlInput.value.trim();
            const branch = repoBranchInput.value.trim() || 'main';

            if (!url) {
                showNotification('Bitte gib eine Repository-URL ein', 'error');
                return;
            }

            try {
                addRepositoryButton.disabled  = true;
                addRepositoryButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Wird hinzugefügt...';

                const result = await window.electronAPI.addRepository({
                    url,
                    branch
                });

                if (result.success) {
                    showNotification(`Repository "${result.name || url}" hinzugefügt`);
                    repoUrlInput.value    = '';
                    repoBranchInput.value = '';
                    loadSources(); // Liste aktualisieren
                } else {
                    showNotification(`Fehler: ${result.error}`, 'error');
                }
            } catch (error) {
                showNotification(`Fehler: ${error.message}`, 'error');
            } finally {
                addRepositoryButton.disabled  = false;
                addRepositoryButton.innerHTML = '<i class="fas fa-code-branch mr-2"></i> Repository hinzufügen';
            }
        });
    }

// Token-Service ändern
    if (tokenServiceSelect) {
        tokenServiceSelect.addEventListener('change', () => {
            const isCustom = tokenServiceSelect.value === 'custom';
            customDomainContainer.classList.toggle('hidden', !isCustom);
        });
    }

// Token speichern
    if (saveTokenButton) {
        saveTokenButton.addEventListener('click', async () => {
            const service = tokenServiceSelect.value;
            const token   = tokenValueInput.value.trim();
            const domain  = tokenDomainInput.value.trim();

            if (!token) {
                showNotification('Bitte gib ein Token ein', 'error');
                return;
            }

            if (service === 'custom' && !domain) {
                showNotification('Bitte gib eine Domain für den benutzerdefinierten Service ein', 'error');
                return;
            }

            try {
                saveTokenButton.disabled = true;

                const result = await window.electronAPI.saveGitToken({
                    service,
                    token,
                    domain: service === 'custom' ? domain : null
                });

                if (result.success) {
                    showNotification('Token erfolgreich gespeichert');
                    tokenValueInput.value    = '';
                    tokenDomainInput.value   = '';
                    tokenServiceSelect.value = 'github';
                    customDomainContainer.classList.add('hidden');
                } else {
                    showNotification(`Fehler: ${result.error}`, 'error');
                }
            } catch (error) {
                showNotification(`Fehler: ${error.message}`, 'error');
            } finally {
                saveTokenButton.disabled = false;
            }
        });
    }

// Token-Hilfe-Links
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

// Ordner rendern
    function renderFolders(folders) {
        if (!foldersList) return;

        if (!folders || Object.keys(folders).length === 0) {
            foldersList.innerHTML = '<p class="text-gray-500">Keine Ordner freigegeben</p>';
            return;
        }

        foldersList.innerHTML = '';

        for (const [folderId, folder] of Object.entries(folders)) {
            const template = document.getElementById('folder-item-template');
            if (!template) continue;

            const clone = document.importNode(template.content, true);

            // Ordnername und Pfad setzen
            clone.querySelector('.folder-name-text').textContent = folder.name;
            clone.querySelector('.folder-path').textContent      = folder.path;

            // Durchsuchen-Button
            clone.querySelector('.browse-folder-button').addEventListener('click', () => {
                openFileBrowser(folderId, 'folder', folder.name);
            });

            // Entfernen-Button
            clone.querySelector('.remove-folder-button').addEventListener('click', async () => {
                if (confirm(`Möchtest du den Ordner "${folder.name}" wirklich entfernen?`)) {
                    try {
                        const result = await window.electronAPI.removeSource({sourceId: folderId});

                        if (result.success) {
                            showNotification(`Ordner "${folder.name}" entfernt`);
                            loadSources(); // Liste aktualisieren
                        } else {
                            showNotification(`Fehler: ${result.error}`, 'error');
                        }
                    } catch (error) {
                        showNotification(`Fehler: ${error.message}`, 'error');
                    }
                }
            });

            foldersList.appendChild(clone);
        }
    }

// Repositories rendern
    function renderRepositories(repositories) {
        if (!repositoriesList) return;

        if (!repositories || Object.keys(repositories).length === 0) {
            repositoriesList.innerHTML = '<p class="text-gray-500">Keine Repositories freigegeben</p>';
            return;
        }

        repositoriesList.innerHTML = '';

        for (const [repoId, repo] of Object.entries(repositories)) {
            const template = document.getElementById('repository-item-template');
            if (!template) continue;

            const clone = document.importNode(template.content, true);

            // Repository-Name und URL setzen
            clone.querySelector('.repo-name-text').textContent = repo.name;
            clone.querySelector('.repo-url').textContent       = repo.url;

            // Status-Text setzen
            const statusText = clone.querySelector('.repo-status-text');
            if (repo.lastSynced) {
                const lastSyncDate     = new Date(repo.lastSynced);
                statusText.textContent = `Zuletzt synchronisiert: ${lastSyncDate.toLocaleString('de-de', {
                    year  : '2-digit',
                    month : '2-digit',
                    day   : '2-digit',
                    hour  : '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                })}`;
                statusText.classList.add('text-green-600');
            } else {
                statusText.textContent = 'Noch nicht synchronisiert';
                statusText.classList.add('text-yellow-600');
            }

            // Private Repositories markieren
            if (repo.isPrivate) {
                const repoNameText = clone.querySelector('.repo-name-text');
                repoNameText.innerHTML += ' <span class="text-xs bg-gray-200 text-gray-700 py-0.5 px-1">privat</span>';
            }

            // Durchsuchen-Button
            clone.querySelector('.browse-repo-button').addEventListener('click', () => {
                openFileBrowser(repoId, 'repository', repo.name);
            });

            // Sync-Button
            clone.querySelector('.sync-repo-button').addEventListener('click', async () => {
                try {
                    const syncButton     = clone.querySelector('.sync-repo-button');
                    syncButton.disabled  = true;
                    syncButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Sync';

                    const result = await window.electronAPI.syncRepository({repoId});

                    if (result.success) {
                        showNotification(`Repository "${repo.name}" synchronisiert`);
                        loadSources(); // Liste aktualisieren
                    } else {
                        showNotification(`Fehler: ${result.error}`, 'error');
                    }
                } catch (error) {
                    showNotification(`Fehler: ${error.message}`, 'error');
                } finally {
                    const syncButton     = clone.querySelector('.sync-repo-button');
                    syncButton.disabled  = false;
                    syncButton.innerHTML = '<i class="fas fa-sync mr-1"></i> Sync';
                }
            });

            // Entfernen-Button
            clone.querySelector('.remove-repo-button').addEventListener('click', async () => {
                if (confirm(`Möchtest du das Repository "${repo.name}" wirklich entfernen?`)) {
                    try {
                        const result = await window.electronAPI.removeSource({sourceId: repoId});

                        if (result.success) {
                            showNotification(`Repository "${repo.name}" entfernt`);
                            loadSources(); // Liste aktualisieren
                        } else {
                            showNotification(`Fehler: ${result.error}`, 'error');
                        }
                    } catch (error) {
                        showNotification(`Fehler: ${error.message}`, 'error');
                    }
                }
            });

            repositoriesList.appendChild(clone);
        }
    }

// Datei-Browser öffnen
    async function openFileBrowser(sourceId, sourceType, sourceName) {
        currentBrowsingSource = sourceId;
        currentBrowsingPath   = '';
        browseHistory         = [];
        selectedFiles         = [];

        // Modal-Titel setzen
        const icon                 = sourceType === 'folder' ? 'fa-folder-open' : 'fa-code-branch';
        fileBrowserTitle.innerHTML = `<i class="fas ${icon} mr-2"></i> ${sourceName}`;

        // Modal öffnen
        fileBrowserModal.style.display = 'block';

        // Dateien anzeigen
        await listFiles(sourceId, '');
    }

// Dateien auflisten
    async function listFiles(sourceId, subPath) {
        try {
            // Lade-Animation anzeigen
            fileBrowserContent.innerHTML = `
            <div class="loading">
                <div class="loading-dot"></div>
                <div class="loading-dot"></div>
                <div class="loading-dot"></div>
            </div>
        `;

            // Dateien abrufen
            const result = await window.electronAPI.listFiles({
                sourceId,
                subPath
            });

            if (result.success) {
                currentBrowsingPath = subPath;
                renderBreadcrumbs(subPath);

                // Inhalte anzeigen
                renderFileBrowserContent(result);
            } else {
                fileBrowserContent.innerHTML = `<p class="text-red-500">Fehler: ${result.error}</p>`;
            }
        } catch (error) {
            fileBrowserContent.innerHTML = `<p class="text-red-500">Fehler: ${error.message}</p>`;
        }
    }

    function renderBreadcrumbs(path) {
        if (!fileBrowserPath) return;

        // Leere die aktuelle Breadcrumb
        fileBrowserPath.innerHTML = '';

        // Root-Element
        const rootItem       = document.createElement('span');
        rootItem.className   = 'breadcrumb-item';
        const rootLink       = document.createElement('a');
        rootLink.href        = '#';
        rootLink.textContent = 'Root';
        rootLink.addEventListener('click', (e) => {
            e.preventDefault();
            listFiles(currentBrowsingSource, '');
        });
        rootItem.appendChild(rootLink);
        fileBrowserPath.appendChild(rootItem);

        // Wenn wir im Root-Verzeichnis sind, fertig
        if (!path) return;

        // Sonst die Pfadsegmente aufteilen und für jedes ein Element erstellen
        const segments  = path.split('/');
        let currentPath = '';

        segments.forEach((segment, index) => {
            if (!segment) return;

            currentPath += (currentPath ? '/' : '') + segment;
            const isLast = index === segments.length - 1;

            const item     = document.createElement('span');
            item.className = 'breadcrumb-item';

            if (isLast) {
                // Das letzte Element ist kein Link
                item.textContent = segment;
            } else {
                // Zwischenelemente sind Links
                const link       = document.createElement('a');
                link.href        = '#';
                link.textContent = segment;
                const pathToHere = currentPath;
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    listFiles(currentBrowsingSource, pathToHere);
                });
                item.appendChild(link);
            }

            fileBrowserPath.appendChild(item);
        });
    }

// Datei-Browser-Inhalte rendern
    function renderFileBrowserContent(data) {
        fileBrowserContent.innerHTML = '';

        if (data.directories.length === 0 && data.files.length === 0) {
            fileBrowserContent.innerHTML = '<p class="text-gray-500">Dieser Ordner ist leer</p>';
            return;
        }

        // Ordner zuerst anzeigen
        if (data.directories.length > 0) {
            const dirContainer     = document.createElement('div');
            dirContainer.className = 'mb-2';

            data.directories.forEach(dir => {
                const dirItem     = document.createElement('div');
                dirItem.className = 'flex items-center p-2 hover:bg-gray-100 cursor-pointer';
                dirItem.innerHTML = `
                <i class="fas fa-folder text-yellow-500 mr-2"></i>
                <span>${dir.name}</span>
            `;

                dirItem.addEventListener('click', () => {
                    // Verzeichniswechsel mit Verlauf
                    browseHistory.push(currentBrowsingPath);
                    listFiles(currentBrowsingSource, dir.path);
                });

                dirContainer.appendChild(dirItem);
            });

            fileBrowserContent.appendChild(dirContainer);
        }

        // Dateien anzeigen
        if (data.files.length > 0) {
            const fileContainer = document.createElement('div');

            // Trennlinie, wenn Verzeichnisse vorhanden sind
            if (data.directories.length > 0) {
                const separator     = document.createElement('div');
                separator.className = 'border-t border-gray-200 my-2';
                fileContainer.appendChild(separator);
            }

            data.files.forEach(file => {
                const fileItem     = document.createElement('div');
                fileItem.className = 'flex items-center justify-between p-2 hover:bg-gray-100';

                // Icon nach Dateityp auswählen
                let icon      = 'fa-file';
                let iconClass = 'text-gray-500';

                if (file.extension === '.js' || file.extension === '.jsx' || file.extension === '.ts') {
                    icon      = 'fa-file-code';
                    iconClass = 'text-yellow-600';
                } else if (file.extension === '.html' || file.extension === '.htm' || file.extension === '.xml') {
                    icon      = 'fa-file-code';
                    iconClass = 'text-orange-500';
                } else if (file.extension === '.css' || file.extension === '.scss' || file.extension === '.sass') {
                    icon      = 'fa-file-code';
                    iconClass = 'text-blue-500';
                } else if (file.extension === '.json') {
                    icon      = 'fa-file-code';
                    iconClass = 'text-green-600';
                } else if (file.extension === '.md') {
                    icon      = 'fa-file-alt';
                    iconClass = 'text-blue-600';
                } else if (['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'].includes(file.extension)) {
                    icon      = 'fa-file-image';
                    iconClass = 'text-purple-500';
                } else if (['.mp4', '.webm', '.avi', '.mov'].includes(file.extension)) {
                    icon      = 'fa-file-video';
                    iconClass = 'text-red-500';
                } else if (['.mp3', '.wav', '.ogg'].includes(file.extension)) {
                    icon      = 'fa-file-audio';
                    iconClass = 'text-green-500';
                } else if (['.pdf'].includes(file.extension)) {
                    icon      = 'fa-file-pdf';
                    iconClass = 'text-red-600';
                } else if (['.doc', '.docx'].includes(file.extension)) {
                    icon      = 'fa-file-word';
                    iconClass = 'text-blue-600';
                } else if (['.xls', '.xlsx'].includes(file.extension)) {
                    icon      = 'fa-file-excel';
                    iconClass = 'text-green-600';
                } else if (['.ppt', '.pptx'].includes(file.extension)) {
                    icon      = 'fa-file-powerpoint';
                    iconClass = 'text-orange-600';
                } else if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(file.extension)) {
                    icon      = 'fa-file-archive';
                    iconClass = 'text-amber-700';
                }

                const nameElement     = document.createElement('div');
                nameElement.className = 'flex items-center flex-1';
                nameElement.innerHTML = `
                <i class="fas ${icon} ${iconClass} mr-2"></i>
                <span class="truncate">${file.name}</span>
                <span class="text-xs text-gray-500 ml-2">${formatFileSize(file.size)}</span>
            `;

                fileItem.appendChild(nameElement);

                const actionDiv = document.createElement('div');

                // Nur für Textdateien: Anzeigen-Button
                if (isTextFile(file.extension)) {
                    const viewButton     = document.createElement('button');
                    viewButton.className = 'text-blue-600 hover:text-blue-700 px-2';
                    viewButton.innerHTML = '<i class="fas fa-eye"></i>';
                    viewButton.title     = 'Datei anzeigen';

                    viewButton.addEventListener('click', async () => {
                        await showFileContent(currentBrowsingSource, file.path);
                    });

                    actionDiv.appendChild(viewButton);
                }

                // Button zum Einbinden in den Chat
                const addButton     = document.createElement('button');
                addButton.className = 'text-green-600 hover:text-green-700 px-2';
                addButton.innerHTML = '<i class="fas fa-plus"></i>';
                addButton.title     = 'In Auswahl aufnehmen';

                let isSelected = false;

                addButton.addEventListener('click', () => {
                    isSelected = !isSelected;

                    if (isSelected) {
                        selectedFiles.push({
                            sourceId: currentBrowsingSource,
                            path    : file.path,
                            name    : file.name
                        });
                        fileItem.classList.add('bg-blue-50');
                        addButton.innerHTML = '<i class="fas fa-check text-green-600"></i>';
                    } else {
                        selectedFiles = selectedFiles.filter(f => !(f.sourceId === currentBrowsingSource && f.path === file.path));
                        fileItem.classList.remove('bg-blue-50');
                        addButton.innerHTML = '<i class="fas fa-plus"></i>';
                    }

                    // "In Chat einfügen" Button aktualisieren
                    updateSendToChatButton();
                });

                actionDiv.appendChild(addButton);
                fileItem.appendChild(actionDiv);

                fileContainer.appendChild(fileItem);
            });

            fileBrowserContent.appendChild(fileContainer);
        }
    }

// "In Chat einfügen" Button aktualisieren
    function updateSendToChatButton() {
        if (fileBrowserSendToChat) {
            if (selectedFiles.length > 0) {
                fileBrowserSendToChat.disabled  = false;
                fileBrowserSendToChat.innerHTML = `
                <i class="fas fa-paper-plane mr-2"></i> ${selectedFiles.length} Datei(en) in Chat einfügen
                <span class="selected-files-count">${selectedFiles.length}</span>
            `;
            } else {
                fileBrowserSendToChat.disabled  = true;
                fileBrowserSendToChat.innerHTML = `
                <i class="fas fa-paper-plane mr-2"></i> In Chat einfügen
            `;
            }
        }
    }

// Dateiinhalt anzeigen
    async function showFileContent(sourceId, filePath) {
        try {
            fileContentViewer.classList.remove('hidden');
            fileContentPre.innerHTML    = '<div class="loading"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div>';
            fileContentName.textContent = filePath.split('/').pop();

            const result = await window.electronAPI.readFile({
                sourceId,
                filePath
            });

            if (result.success) {
                // Syntax-Highlighting basierend auf der Dateierweiterung
                const extension = result.extension.replace('.', '');
                const language  = getLanguageFromExtension(extension);

                // Inhalt formatieren
                if (language) {
                    fileContentPre.innerHTML = `<code class="language-${language}">${escapeHtml(result.content)}</code>`;
                    hljs.highlightElement(fileContentPre.querySelector('code'));
                } else {
                    fileContentPre.textContent = result.content;
                }
            } else {
                fileContentPre.innerHTML = `<div class="text-red-500">Fehler: ${result.error}</div>`;
            }
        } catch (error) {
            fileContentPre.innerHTML = `<div class="text-red-500">Fehler: ${error.message}</div>`;
        }
    }

// Dateigröße formatieren
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 B';

        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i     = Math.floor(Math.log(bytes) / Math.log(1024));

        return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`;
    }

// Prüft, ob eine Datei eine Textdatei ist
    function isTextFile(extension) {
        const textExtensions = [
            '.txt', '.md', '.json', '.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.sass',
            '.html', '.htm', '.xml', '.svg', '.c', '.cpp', '.h', '.cs', '.java', '.py',
            '.rb', '.php', '.go', '.rs', '.swift', '.sh', '.bat', '.ps1', '.yaml', '.yml',
            '.toml', '.ini', '.config', '.conf', '.log', '.gitignore', '.env', '.htaccess',
            '.csv', '.tsv'
        ];

        return textExtensions.includes(extension);
    }

// Ermittelt die Sprache für Syntax-Highlighting anhand der Dateierweiterung
    function getLanguageFromExtension(extension) {
        const languageMap = {
            'js'   : 'javascript',
            'jsx'  : 'javascript',
            'ts'   : 'typescript',
            'tsx'  : 'typescript',
            'html' : 'html',
            'css'  : 'css',
            'scss' : 'scss',
            'sass' : 'scss',
            'json' : 'json',
            'md'   : 'markdown',
            'py'   : 'python',
            'java' : 'java',
            'c'    : 'c',
            'cpp'  : 'cpp',
            'cs'   : 'csharp',
            'rb'   : 'ruby',
            'php'  : 'php',
            'go'   : 'go',
            'rs'   : 'rust',
            'swift': 'swift',
            'sh'   : 'bash',
            'bat'  : 'batch',
            'ps1'  : 'powershell',
            'yaml' : 'yaml',
            'yml'  : 'yaml',
            'xml'  : 'xml',
            'sql'  : 'sql',
            'toml' : 'toml',
            'ini'  : 'ini'
        };

        return languageMap[extension] || '';
    }

// HTML-Zeichen escapen
    function escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

// Zurück-Button im Datei-Browser
    if (fileBrowserBack) {
        fileBrowserBack.addEventListener('click', () => {
            if (browseHistory.length > 0) {
                const previousPath = browseHistory.pop();
                listFiles(currentBrowsingSource, previousPath);
            } else if (currentBrowsingPath) {
                // Zum übergeordneten Verzeichnis navigieren
                const pathParts = currentBrowsingPath.split('/');
                pathParts.pop();
                const parentPath = pathParts.join('/');
                listFiles(currentBrowsingSource, parentPath);
            }
        });
    }

// Datei-Suche
    if (fileSearchButton) {
        fileSearchButton.addEventListener('click', async () => {
            const query = fileSearchInput.value.trim();

            if (!query) {
                showNotification('Bitte gib einen Suchbegriff ein', 'error');
                return;
            }

            try {
                fileSearchButton.disabled    = true;
                fileBrowserContent.innerHTML = `
                <div class="loading">
                    <div class="loading-dot"></div>
                    <div class="loading-dot"></div>
                    <div class="loading-dot"></div>
                </div>
                <p class="text-center text-gray-600 mt-2">Suche nach "${query}"...</p>
            `;

                const result = await window.electronAPI.searchFiles({
                    sourceId: currentBrowsingSource,
                    query,
                    options : {
                        maxResults   : 50,
                        extensions   : null, // Alle Dateitypen
                        includeBinary: false,
                        recursive    : true
                    }
                });

                if (result.success) {
                    renderSearchResults(result);
                } else {
                    fileBrowserContent.innerHTML = `<p class="text-red-500">Fehler: ${result.error}</p>`;
                }
            } catch (error) {
                fileBrowserContent.innerHTML = `<p class="text-red-500">Fehler: ${error.message}</p>`;
            } finally {
                fileSearchButton.disabled = false;
            }
        });

        fileSearchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                fileSearchButton.click();
            }
        });
    }

// Suchergebnisse rendern
    function renderSearchResults(data) {
        fileBrowserContent.innerHTML = '';

        if (!data.results || data.results.length === 0) {
            fileBrowserContent.innerHTML = `<p class="text-gray-500">Keine Ergebnisse für "${data.query}" gefunden</p>`;
            return;
        }

        // Überschrift für Suchergebnisse
        const header     = document.createElement('div');
        header.className = 'mb-4';
        header.innerHTML = `
        <h3 class="text-lg font-medium">${data.results.length} Ergebnisse für "${data.query}"</h3>
        <p class="text-sm text-gray-600">Klicke auf ein Ergebnis, um die Datei anzuzeigen</p>
    `;
        fileBrowserContent.appendChild(header);

        // Ergebnisliste
        const resultsList     = document.createElement('div');
        resultsList.className = 'space-y-2';

        data.results.forEach(result => {
            const resultItem     = document.createElement('div');
            resultItem.className = 'border rounded p-2 hover:bg-gray-50 cursor-pointer';

            // Icon nach Dateityp auswählen
            let icon      = 'fa-file';
            let iconClass = 'text-gray-500';

            if (result.extension === '.js' || result.extension === '.jsx' || result.extension === '.ts') {
                icon      = 'fa-file-code';
                iconClass = 'text-yellow-600';
            } else if (result.extension === '.html' || result.extension === '.htm') {
                icon      = 'fa-file-code';
                iconClass = 'text-orange-500';
            } else if (result.extension === '.css' || result.extension === '.scss') {
                icon      = 'fa-file-code';
                iconClass = 'text-blue-500';
            }

            resultItem.innerHTML = `
            <div class="flex items-center">
                <i class="fas ${icon} ${iconClass} mr-2"></i>
                <div class="flex-1">
                    <div class="font-medium">${result.path}</div>
                    <div class="text-sm text-gray-600">Zeile ${result.lineNumber}: <span class="font-mono">${escapeHtml(result.content)}</span></div>
                </div>
                <button class="ml-2 text-blue-600 hover:text-blue-700" title="Datei anzeigen">
                    <i class="fas fa-eye"></i>
                </button>
            </div>
        `;

            resultItem.addEventListener('click', async () => {
                await showFileContent(currentBrowsingSource, result.path);
            });

            resultsList.appendChild(resultItem);
        });

        fileBrowserContent.appendChild(resultsList);
    }

// Datei-Inhalt schließen
    if (fileContentClose) {
        fileContentClose.addEventListener('click', () => {
            fileContentViewer.classList.add('hidden');
        });
    }

// Datei-Browser schließen
    if (fileBrowserClose) {
        fileBrowserClose.addEventListener('click', () => {
            fileBrowserModal.style.display = 'none';
        });
    }

// Dateien an Chat senden
    if (fileBrowserSendToChat) {
        fileBrowserSendToChat.addEventListener('click', () => {
            if (selectedFiles.length === 0) return;

            try {
                let fileReferences = '';

                // Dateireferenzen im Format #file:sourceId/pfad/zur/datei.js erstellen
                selectedFiles.forEach(file => {
                    fileReferences += `#file:${file.sourceId}/${file.path}\n`;
                });

                if (fileReferences) {
                    // Hinweistext hinzufügen
                    const hint = selectedFiles.length === 1
                        ? "Ich beziehe mich auf folgende Datei:"
                        : `Ich beziehe mich auf folgende ${selectedFiles.length} Dateien:`;

                    // In das Chat-Eingabefeld einfügen
                    userInput.value += (userInput.value ? '\n\n' : '') +
                        `${hint}\n${fileReferences}`;

                    // Eingabefeld-Höhe anpassen
                    userInput.style.height = 'auto';
                    userInput.style.height = Math.min(userInput.scrollHeight, 300) + 'px';
                    userInput.style.overflowY = userInput.scrollHeight > 300 ? 'scroll' : 'hidden';

                    // Modal schließen
                    fileBrowserModal.style.display = 'none';

                    // Ausgewählte Dateien zurücksetzen
                    selectedFiles = [];

                    // Fokus auf Eingabefeld setzen
                    userInput.focus();

                    // Benachrichtigung anzeigen
                    showNotification(
                        selectedFiles.length === 1
                            ? "Dateireferenz hinzugefügt"
                            : `${selectedFiles.length} Dateireferenzen hinzugefügt`,
                        'success'
                    );
                }
            } catch (error) {
                showNotification(`Fehler: ${error.message}`, 'error');
            }
        });
    }

// Modal schließen, wenn außerhalb geklickt wird
    window.addEventListener('click', (event) => {
        if (event.target === fileBrowserModal) {
            fileBrowserModal.style.display = 'none';
        }
    });

// Repositories und Ordner beim Laden des Tabs anzeigen
    document.querySelector('[data-tab="repositories"]')?.addEventListener('click', () => {
        loadSources();
    });

    function extractFileReferences(text) {
        const references = [];
        // Extrahiert #file:sourceId/pfad/zur/datei.js
        const regex      = /#file:([a-zA-Z0-9_]+)\/([^\s\n]+)/g;

        let match;
        while ((match = regex.exec(text)) !== null) {
            references.push({
                sourceId : match[1],
                path     : match[2],
                fullMatch: match[0]
            });
        }

        return references;
    }
});