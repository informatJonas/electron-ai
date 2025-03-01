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

    // Status-Tracking
    let isProcessing = false;

    // IPC-Listener für LM Studio Status
    console.log('Registriere LM Studio Status Listener');
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

    // IPC-Listener für Einstellungen-Dialog
    let removeSettingsListener = window.electronAPI.onShowSettings((settings) => {
        updateSettingsForm(settings);
        settingsModal.style.display = 'block';
    });

    // LM Studio Verbindung prüfen
    window.electronAPI.checkLMStudioStatus();

    // Standard-Suchmodus aus Einstellungen laden
    loadDefaultSearchMode();

    /**
     * Sendet die Nachricht an den Server
     */
    // Wichtigste Änderung: Streaming-Funktion in sendMessage
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
                            chatMessages.scrollTop = chatMessages.scrollHeight;
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
            await appendMessage('assistant', 'Verbindungsfehler: Stelle sicher, dass der Server läuft und LM Studio gestartet ist.');
            updateStatusIndicator('error', 'Verbindungsproblem: LM Studio nicht erreichbar');
        } finally {
            isProcessing        = false;
            sendButton.disabled = false;
            userInput.focus();
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
     * Aktualisiert die Statusanzeige
     * @param {string} status - 'connected', 'disconnected' oder 'error'
     * @param {string} message - Anzuzeigende Nachricht
     */
    function updateStatusIndicator(status, message) {
        // Debug-Log hinzufügen
        console.log('updateStatusIndicator aufgerufen mit:', {status, message});

        const statusDot  = statusIndicator.querySelector('.status-dot');
        const statusText = statusIndicator.querySelector('span');

        // Stelle sicher, dass die Elemente existieren
        if (!statusDot || !statusText) {
            console.error('Status-Elemente nicht gefunden');
            return;
        }

        // Log der aktuellen Klassen
        console.log('Aktuelle Klassen:', statusDot.classList.toString());

        // Entferne alle Status-Klassen
        statusDot.classList.remove('online', 'offline', 'warning');

        // Setze die passende Klasse
        switch (status) {
            case 'connected':
                console.log('Setze online-Klasse');
                statusDot.classList.add('online');
                break;
            case 'disconnected':
                console.log('Setze offline-Klasse');
                statusDot.classList.add('offline');
                break;
            case 'warning':
                console.log('Setze warning-Klasse');
                statusDot.classList.add('warning');
                break;
            default:
                console.log('Setze default offline-Klasse');
                statusDot.classList.add('offline');
        }

        // Aktualisiere den Text
        statusText.textContent = message;
        console.log('Neuer Statustext:', message);
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
     * Verarbeitet Text für Formatierung (einfaches Markdown)
     */
    async function processText(text) {
        return await window.markdownAPI.render(text);
    }

    /**
     * Sammelt Einstellungen aus dem Formular
     */
    function getSettingsFromForm() {
        return {
            lmStudioUrl      : lmStudioUrlInput.value,
            lmStudioModel    : lmStudioModelInput.value,
            serverPort       : parseInt(serverPortInput.value) || 3000,
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
    }

    /**
     * Aktualisiert das Einstellungsformular mit neuen Werten
     */
    function updateSettingsForm(config) {
        lmStudioUrlInput.value         = config.lmStudioUrl || '';
        lmStudioModelInput.value       = config.lmStudioModel || 'local-model';
        serverPortInput.value          = config.serverPort || 3000;
        maxSearchResultsInput.value    = config.maxSearchResults || 3;
        searchTimeoutInput.value       = config.searchTimeout || 5000;
        autoCheckLMStudioInput.checked = !!config.autoCheckLmStudio;
        debugModeInput.checked         = !!config.debugMode;
        systemPromptInput.value        = config.systemPrompt || '';
        minimizeToTrayInput.checked    = !!config.minimizeToTray;
        startWithWindowsInput.checked  = !!config.startWithWindows;
        checkForUpdatesInput.checked   = !!config.checkForUpdates;

        if (defaultSearchModeInput) {
            defaultSearchModeInput.value = config.defaultSearchMode || 'auto';
        }
    }

    /**
     * Zeigt eine Benachrichtigung an
     */
    function showNotification(message, type = 'success') {
        const container    = document.getElementById('notification-container');
        const notification = document.createElement('div');

        notification.className   = `notification ${type === 'error' ? 'error' : ''}`;
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
    });

    function addCopyButtons() {
        document.querySelectorAll('pre code').forEach((codeBlock) => {
            if (!codeBlock.parentNode.querySelector('.copy-button')) {
                const button = document.createElement('button');
                button.className = 'copy-button';
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

                const pre = codeBlock.parentNode;
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

    observer.observe(document.body, { childList: true, subtree: true });
});