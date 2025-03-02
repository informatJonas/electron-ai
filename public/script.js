// script.js - Frontend-Funktionalität
document.addEventListener('DOMContentLoaded', () => {
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

    // Status-Tracking
    let isProcessing = false;

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

        // Vorbereitung für Streaming-Antwort
        const responseElement     = document.createElement('div');
        responseElement.className = 'message assistant';
        const contentElement      = document.createElement('div');
        contentElement.className  = 'message-content';
        responseElement.appendChild(contentElement);
        chatMessages.appendChild(responseElement);

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
});