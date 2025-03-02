// main.js - Hybrid-Ansatz mit CommonJS und dynamischen Imports für ES-Module
const {app, BrowserWindow, ipcMain, Menu, Tray, dialog, shell} = require('electron');
const path                                                     = require('path');
const express                                                  = require('express');
const axios                                                    = require('axios');
const {searchModels}                                           = require('./huggingface');
const LLMEngine                                                = require('./llm-engine');

// Globale Variablen für die Module
let duckDuckGoSearch, fetchWebContent;
let checkLMStudioStatus;
let env;

// Globale Variablen für die Anwendung
const expressApp = express();
let server;
let mainWindow;
let tray;
let lmStudioCheckInterval;
let llmEngine;
let currentModel = null;
let config       = {};

// Module asynchron laden
async function loadModules() {
    try {
        // Module als ES-Module importieren
        const searchModule = await import('./search.js');
        duckDuckGoSearch   = searchModule.duckDuckGoSearch;
        fetchWebContent    = searchModule.fetchWebContent;

        const lmStudioModule = await import('./lm-studio-connector.js');
        checkLMStudioStatus  = lmStudioModule.checkLMStudioStatus;

        const envModule = await import('./env.js');
        env             = envModule.default;

        // Konfiguration laden
        config = env.getConfig();
        return true;
    } catch (error) {
        console.error('Fehler beim Laden der Module:', error);
        return false;
    }
}

// Express Middleware
expressApp.use(express.json());

// CORS-Probleme vermeiden
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');

// LLM-Engine initialisieren
function initLLMEngine() {
    llmEngine = new LLMEngine(config);

    // Automatisch das zuletzt verwendete Modell laden
    const lastModel = config.lastUsedModel;
    if (lastModel && config.useLocalLlm) {
        loadModel(lastModel);
    }
}

// Modell laden
async function loadModel(modelPath) {
    try {
        if (!llmEngine) {
            console.error('LLM-Engine nicht initialisiert');
            return false;
        }

        // Status an die UI senden
        if (mainWindow) {
            mainWindow.webContents.send('model-status', {
                status : 'loading',
                message: `Lade Modell: ${modelPath}`
            });
        }

        // Modell laden
        const success = await llmEngine.loadModel(modelPath, {
            contextSize: config.contextSize || 2048,
            threads    : config.threads || 4,
            gpuLayers  : config.gpuLayers || 0
        });

        if (success) {
            currentModel = modelPath;

            // Config aktualisieren
            env.updateConfig({
                lastUsedModel: modelPath
            });

            // Status an die UI senden
            if (mainWindow) {
                mainWindow.webContents.send('model-status', {
                    status : 'loaded',
                    message: `Modell geladen: ${modelPath}`,
                    model  : modelPath
                });
            }

            return true;
        } else {
            throw new Error(`Modell konnte nicht geladen werden: ${modelPath}`);
        }
    } catch (error) {
        console.error('Fehler beim Laden des Modells:', error);

        // Status an die UI senden
        if (mainWindow) {
            mainWindow.webContents.send('model-status', {
                status : 'error',
                message: `Fehler beim Laden des Modells: ${error.message}`
            });
        }

        return false;
    }
}

// Express API-Route mit Streaming (wird nach dem Laden der Module eingerichtet)
function setupExpressRoutes() {
    expressApp.use(express.static(path.join(__dirname, 'public')));

    expressApp.post('/api/chat', async (req, res) => {
        try {
            const {message, webSearchMode, contentUrl} = req.body;

            // Entscheidung: LM Studio oder lokales LLM verwenden
            const useLocalLLM = config.useLocalLlm;

            if (useLocalLLM) {
                // Prüfen, ob ein Modell geladen ist
                if (!currentModel) {
                    return res.status(400).json({
                        success: false,
                        message: 'Es ist kein Modell geladen. Bitte laden Sie zuerst ein Modell.'
                    });
                }
            } else {
                // LM Studio URL überprüfen und Verbindung testen
                const lmStudioStatus = await checkLMStudioStatus(config.lmStudioUrl);
                if (!lmStudioStatus) {
                    return res.status(500).json({
                        success: false,
                        message: 'Verbindung zu LM Studio fehlgeschlagen. Bitte stelle sicher, dass LM Studio läuft.'
                    });
                }
            }

            // Entscheide basierend auf dem Modus und der Nachricht, ob eine Websuche durchgeführt werden soll
            let shouldSearch = false;
            let urlContent   = null;

            // Lokalen Modus erkennen
            let actualMessage = message;
            if (message.toLowerCase().startsWith('lokal:')) {
                actualMessage = message.substring(6).trim();
                shouldSearch  = false; // Immer lokal, wenn explizit angegeben
            } else {
                // URL-Inhalte abrufen, wenn angegeben
                if (contentUrl) {
                    try {
                        urlContent = await fetchWebContent(contentUrl);
                        actualMessage += `\n\nInhalte von ${contentUrl}:\n${urlContent.mainContent}`;
                    } catch (urlError) {
                        console.error('Fehler beim Abrufen der URL:', urlError);
                    }
                }

                // Entscheidung basierend auf dem Websuche-Modus
                switch (webSearchMode) {
                    case 'always':
                        shouldSearch = true;
                        break;
                    case 'never':
                        shouldSearch = false;
                        break;
                    case 'auto':
                        // Hier entscheidet die KI selbst, ob eine Websuche sinnvoll ist
                        shouldSearch = shouldPerformWebSearch(actualMessage);
                        break;
                    default:
                        shouldSearch = true; // Standardmäßig suchen
                }
            }

            let contextInfo = '';

            // Websuche durchführen, wenn aktiviert
            if (shouldSearch) {
                try {
                    const searchResults = await duckDuckGoSearch(
                        actualMessage,
                        config.maxSearchResults,
                        config.searchTimeout
                    );

                    if (searchResults && searchResults.length > 0) {
                        contextInfo = 'Hier sind aktuelle Informationen aus dem Internet:\n\n';

                        searchResults.forEach((result, index) => {
                            contextInfo += `[${index + 1}] ${result.title}\n`;
                            contextInfo += `URL: ${result.url}\n`;
                            contextInfo += `Beschreibung: ${result.description}\n\n`;
                        });
                    }
                } catch (searchError) {
                    console.error('Fehler bei der Websuche:', searchError);
                }
            }

            // System-Prompt und LM Studio URL aus den Einstellungen laden
            const systemPrompt = config.systemPrompt;

            // Vollständiger Prompt mit Kontext
            const fullMessage = contextInfo
                ? `${contextInfo}\nFrage: ${actualMessage}`
                : actualMessage;

            // Streaming-Header setzen
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-open');

            // Verarbeitungsweg basierend auf Konfiguration wählen
            if (useLocalLLM) {
                // ***** Lokales LLM verwenden *****
                try {
                    // Chat-Nachrichten vorbereiten
                    const messages = [
                        {role: 'system', content: systemPrompt},
                        {role: 'user', content: fullMessage}
                    ];

                    // Ergebnisse streamen
                    let streamContent = '';

                    // Stream-Funktion
                    const onTokenCallback = (token) => {
                        streamContent += token;
                        res.write(`data: ${JSON.stringify(token)}\n\n`);
                    };

                    // Chat-Antwort generieren
                    await llmEngine.generateChatResponse(messages, {
                        temperature: 0.7,
                        maxTokens  : 2048,
                        stream     : true,
                        onToken    : onTokenCallback
                    });

                    // Stream beenden
                    res.write('event: done\ndata: END\n\n');
                    res.end();

                    // Status an die UI senden
                    mainWindow.webContents.send('model-status', {
                        status : 'success',
                        message: 'Antwort erfolgreich generiert'
                    });
                } catch (error) {
                    console.error('Fehler bei der LLM-Generierung:', error);

                    if (!res.writableEnded) {
                        res.status(500).json({
                            success: false,
                            message: `Fehler bei der Antwortgenerierung: ${error.message}`
                        });
                    }
                }
            } else {
                // ***** LM Studio verwenden *****
                try {
                    // URL korrekt formatieren - IPv4 bevorzugen
                    let apiUrl = config.lmStudioUrl;
                    if (apiUrl.includes('localhost')) {
                        apiUrl = apiUrl.replace('localhost', '127.0.0.1');
                    }
                    apiUrl = `${apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl}/v1/chat/completions`;

                    // Axios-Konfiguration für Streaming
                    const axiosInstance = axios.create({
                        baseURL     : apiUrl,
                        timeout     : 60000, // 60 Sekunden Timeout
                        responseType: 'stream'
                    });

                    // Streaming-Request
                    const response = await axiosInstance.post('', {
                        model      : config.lmStudioModel,
                        messages   : [
                            {role: 'system', content: systemPrompt},
                            {role: 'user', content: fullMessage}
                        ],
                        temperature: 0.7,
                        stream     : true
                    });

                    // Stream-Verarbeitung
                    response.data.on('data', (chunk) => {
                        const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');

                        lines.forEach((line) => {
                            if (line.startsWith('data: ')) {
                                try {
                                    const jsonStr = line.substring(6);
                                    if (jsonStr !== '[DONE]') {
                                        const parsed = JSON.parse(jsonStr);
                                        if (parsed.choices && parsed.choices[0].delta.content) {
                                            const content = parsed.choices[0].delta.content;
                                            res.write(`data: ${JSON.stringify(content)}\n\n`);
                                        }
                                    } else {
                                        res.write('event: done\ndata: END\n\n');
                                        res.end();
                                    }
                                } catch (parseError) {
                                    console.error('Parsing error:', parseError);
                                }
                            }
                        });
                    });

                    response.data.on('end', () => {
                        if (!res.writableEnded) {
                            res.write('event: done\ndata: END\n\n');
                            res.end();
                        }
                    });

                    response.data.on('error', (error) => {
                        console.error('Stream error:', error);
                        if (!res.writableEnded) {
                            res.status(500).json({error: 'Streaming error'});
                        }
                    });

                    // Status an die UI senden
                    mainWindow.webContents.send('lm-studio-status', {
                        status : 'connected',
                        message: 'Verbunden mit LM Studio'
                    });
                } catch (error) {
                    console.error('Fehler bei der LM Studio-Anfrage:', error);

                    // Status an die UI senden
                    mainWindow.webContents.send('lm-studio-status', {
                        status : 'error',
                        message: 'Verbindung zu LM Studio fehlgeschlagen'
                    });

                    if (!res.writableEnded) {
                        res.status(500).json({
                            success: false,
                            message: 'Es gab ein Problem bei der Verarbeitung deiner Anfrage. Stelle sicher, dass LM Studio läuft und der API-Server gestartet ist.'
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Fehler bei der Verarbeitung der Anfrage:', error);

            res.status(500).json({
                success: false,
                message: 'Es gab ein Problem bei der Verarbeitung deiner Anfrage.'
            });
        }
    });
}

/**
 * Entscheidet, ob für eine bestimmte Nachricht eine Websuche durchgeführt werden sollte
 * @param {string} message - Die Benutzeranfrage
 * @returns {boolean} - true, wenn eine Websuche sinnvoll erscheint
 */
function shouldPerformWebSearch(message) {
    // Nachricht in Kleinbuchstaben für einfachere Überprüfung
    const lowerMessage = message.toLowerCase();

    // Überprüfen, ob die Nachricht aktuelle Daten erfordert
    const needsCurrentInfo = [
        'heute', 'aktuell', 'neu', 'letzte', 'kürzlich', 'news',
        'wetter', 'preis', 'kosten', 'kurs', 'börse', 'aktie',
        'neueste version', 'gerade', 'dieser tage', 'momentan'
    ].some(term => lowerMessage.includes(term));

    // Überprüfen, ob die Nachricht nach spezifischen Fakten fragt
    const needsFactChecking = [
        'wie viel', 'wie viele', 'wie lange', 'wann', 'wo', 'wer',
        'woher', 'warum', 'welche', 'welcher', 'welches', 'was kostet',
        'preis von', 'unterschied zwischen', 'vergleich'
    ].some(term => lowerMessage.includes(term));

    // Überprüfen, ob die Nachricht spezifische technische Informationen erfordert
    const needsTechnicalInfo = [
        'fehler', 'problem', 'installation', 'anleitung', 'tutorial',
        'dokumentation', 'api', 'funktion', 'methode', 'beispiel',
        'code für', 'programmierung', 'library', 'bibliothek', 'framework'
    ].some(term => lowerMessage.includes(term));

    // Überprüfen, ob die Nachricht nach bestimmten Daten, Namen, etc. fragt
    const containsSpecificEntity = /\d{4}|version \d+|\b[A-Z][a-z]+ [A-Z][a-z]+\b/.test(message);

    // Überprüfen, ob Link, URL oder Website in der Anfrage vorkommt
    const needsWebInfo = [
        'link', 'url', 'website', 'webseite', 'seite', 'homepage',
        'blog', 'forum', 'suche nach', 'finde', 'suchen'
    ].some(term => lowerMessage.includes(term));

    // Überprüfen, ob es sich um eine philosophische oder hypothetische Frage handelt
    const isPhilosophicalQuestion = [
        'was wäre wenn', 'könnte man', 'warum gibt es', 'bedeutung von',
        'sinn des', 'theorie', 'philosophie', 'ethik', 'moral', 'wert',
        'meinung', 'denkst du', 'glaubst du', 'stelle dir vor'
    ].some(term => lowerMessage.includes(term));

    // Überprüfen, ob es sich um einen Smalltalk oder persönliche Meinung handelt
    const isSmallTalk = [
        'hallo', 'hi', 'wie geht es dir', 'guten tag', 'guten morgen',
        'guten abend', 'kennst du', 'magst du', 'was denkst du über',
        'erzähl mir', 'bist du', 'kannst du', 'wie heißt du', 'danke'
    ].some(term => lowerMessage.includes(term));

    // Entscheidung basierend auf den verschiedenen Faktoren
    const shouldSearch = (
        needsCurrentInfo ||
        needsFactChecking ||
        needsTechnicalInfo ||
        containsSpecificEntity ||
        needsWebInfo
    ) && !isPhilosophicalQuestion && !isSmallTalk;

    if (config.debugMode) {
        console.log('Auto-Websuche-Entscheidung:', {
            message: lowerMessage,
            needsCurrentInfo,
            needsFactChecking,
            needsTechnicalInfo,
            containsSpecificEntity,
            needsWebInfo,
            isPhilosophicalQuestion,
            isSmallTalk,
            shouldSearch
        });
    }

    return shouldSearch;
}

// Electron App erstellen
async function createWindow() {
    // Warte auf das Laden der Module
    const modulesLoaded = await loadModules();

    if (!modulesLoaded) {
        console.error('Konnte Module nicht laden, beende Anwendung');
        app.quit();
        return;
    }

    // Express-Routen einrichten
    setupExpressRoutes();

    mainWindow = new BrowserWindow({
        width          : 1000,
        height         : 800,
        minWidth       : 800,
        minHeight      : 600,
        webPreferences : {
            preload            : path.join(__dirname, 'preload.js'),
            contextIsolation   : true,
            nodeIntegration    : true,
            enableRemoteModules: true,
        },
        icon           : path.join(__dirname, 'assets/icons/icon.png'),
        title          : 'KI-Assistant',
        show           : false, // Erst anzeigen, wenn geladen
        backgroundColor: '#f8fafc'
    });

    // Express-Server starten
    server = expressApp.listen(config.serverPort, () => {
        console.log(`Express-Server running on port ${config.serverPort}`);

        // Lade die App aus dem Express-Server
        mainWindow.loadURL(`http://localhost:${config.serverPort}`);

        // Show window when ready
        mainWindow.once('ready-to-show', () => {
            mainWindow.show();

            // LLM-Engine initialisieren oder LM Studio-Status prüfen
            if (config.useLocalLlm) {
                initLLMEngine();
            } else {
                checkLMStudioConnection();
            }
        });
    });

    // Menü erstellen
    createMenu();

    // System Tray erstellen
    if (config.minimizeToTray) {
        createTray();
    }

    // LM Studio Status-Prüfung starten, wenn nicht lokales LLM verwendet wird
    if (!config.useLocalLlm && config.autoCheckLmStudio) {
        startLMStudioCheck();
    }

    // Event Handler
    mainWindow.on('closed', () => {
        mainWindow = null;
        stopServer();
    });

    // Minimieren in Tray
    if (config.minimizeToTray) {
        mainWindow.on('minimize', (event) => {
            event.preventDefault();
            mainWindow.hide();
        });
    }
}

// Menü erstellen
function createMenu() {
    const template = [
        {
            label  : 'Datei',
            submenu: [
                {
                    label: 'Einstellungen',
                    click: showSettings
                },
                {type: 'separator'},
                {
                    label: 'Modelle verwalten',
                    click: showModels
                },
                {type: 'separator'},
                {
                    label  : 'LM Studio öffnen',
                    visible: !config.useLocalLlm,
                    click  : openLMStudio
                },
                {type: 'separator'},
                {
                    label: 'Beenden',
                    click: () => app.quit()
                }
            ]
        },
        {
            label  : 'Bearbeiten',
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
            label  : 'Ansicht',
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
            label  : 'Werkzeuge',
            submenu: [
                {
                    label: 'Entwicklertools',
                    click: () => {
                        if (mainWindow) mainWindow.webContents.toggleDevTools();
                    }
                },
                {
                    label: 'Einstellungen zurücksetzen',
                    click: resetSettings
                }
            ]
        },
        {
            label  : 'Hilfe',
            submenu: [
                {
                    label: 'Über',
                    click: showAbout
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// System Tray erstellen
function createTray() {
    tray = new Tray(path.join(__dirname, 'assets/icons/icon.png'));

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Öffnen',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                }
            }
        },
        {type: 'separator'},
        {
            label  : 'LM Studio öffnen',
            visible: !config.useLocalLlm,
            click  : openLMStudio
        },
        {
            label  : 'Modelle verwalten',
            visible: config.useLocalLlm,
            click  : showModels
        },
        {type: 'separator'},
        {
            label: 'Beenden',
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

// LM Studio Check starten
function startLMStudioCheck() {
    if (config.autoCheckLmStudio) {
        lmStudioCheckInterval = setInterval(checkLMStudioConnection, 30000);
    }
}

// LM Studio Connection prüfen
async function checkLMStudioConnection() {
    if (!mainWindow || config.useLocalLlm) {
        return;
    }

    try {
        const status = await checkLMStudioStatus(config.lmStudioUrl);

        console.log('MAIN: Status-Prüfung Ergebnis:', status);

        const statusMessage = {
            status : status ? 'connected' : 'disconnected',
            message: status
                ? 'Verbunden mit LM Studio'
                : 'LM Studio nicht erreichbar'
        };

        // Zusätzliche Überprüfungen vor dem Senden
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('lm-studio-status', statusMessage);
        }
    } catch (error) {
        console.error('MAIN: Fehler bei der Verbindungsprüfung:', error);
    }
}

// LM Studio öffnen
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
                        type   : 'error',
                        title  : 'Fehler',
                        message: `LM Studio konnte nicht geöffnet werden: ${result}`,
                        detail : 'Bitte stelle sicher, dass LM Studio installiert ist.',
                        buttons: ['OK']
                    });
                }
            });
    } catch (error) {
        dialog.showMessageBox(mainWindow, {
            type   : 'error',
            title  : 'Fehler',
            message: 'LM Studio konnte nicht geöffnet werden',
            detail : 'Bitte stelle sicher, dass LM Studio installiert ist.',
            buttons: ['OK']
        });
    }
}

// Einstellungen anzeigen
function showSettings() {
    if (!mainWindow) return;

    mainWindow.webContents.send('show-settings', config);
}

// Modelle anzeigen
function showModels() {
    if (!mainWindow) return;

    mainWindow.webContents.send('show-models-tab');
}

// Einstellungen zurücksetzen
function resetSettings() {
    const response = dialog.showMessageBoxSync(mainWindow, {
        type   : 'question',
        buttons: ['Ja', 'Nein'],
        title  : 'Einstellungen zurücksetzen',
        message: 'Möchtest du alle Einstellungen auf die Standardwerte zurücksetzen?'
    });

    if (response === 0) { // "Ja" wurde geklickt
        const newConfig = env.resetToDefaults();
        mainWindow.webContents.send('settings-reset', newConfig);

        dialog.showMessageBox(mainWindow, {
            type   : 'info',
            title  : 'Einstellungen zurückgesetzt',
            message: 'Alle Einstellungen wurden auf die Standardwerte zurückgesetzt.',
            buttons: ['OK']
        });
    }
}

// Über-Dialog anzeigen
function showAbout() {
    dialog.showMessageBox(mainWindow, {
        type   : 'info',
        title  : 'Über KI-Assistant',
        message: 'KI-Assistant',
        detail : 'Version 2.0.0\n\nEine Desktop-Anwendung mit integriertem LLM und Websuche.\n\nEntwickelt mit Electron und Node.js.',
        buttons: ['OK']
    });
}

// Server stoppen
function stopServer() {
    if (server) {
        server.close();
        server = null;
    }

    if (lmStudioCheckInterval) {
        clearInterval(lmStudioCheckInterval);
        lmStudioCheckInterval = null;
    }

    // Modell schließen, wenn vorhanden
    if (llmEngine && llmEngine.model) {
        llmEngine.model = null;
    }
}

// App ready
app.whenReady().then(async () => {
    // IPC-Hauptprozess-Handler registrieren
    ipcMain.handle('save-settings', async (event, newSettings) => {
        try {
            const updatedConfig = env.updateConfig(newSettings);

            // Sofort nach dem Speichern die Einstellungen neu laden und überprüfen
            const currentConfig = env.getConfig();
            config              = currentConfig; // Lokale Config aktualisieren

            // LLM-Modusänderung prüfen
            if (currentConfig.useLocalLlm !== config.useLocalLlm) {
                if (currentConfig.useLocalLlm) {
                    // Wechsel zu lokalem LLM
                    if (lmStudioCheckInterval) {
                        clearInterval(lmStudioCheckInterval);
                        lmStudioCheckInterval = null;
                    }

                    // LLM-Engine initialisieren, wenn noch nicht geschehen
                    if (!llmEngine) {
                        initLLMEngine();
                    }
                } else {
                    // Wechsel zu LM Studio
                    if (!lmStudioCheckInterval && currentConfig.autoCheckLmStudio) {
                        startLMStudioCheck();
                    }

                    // Sofortige Verbindungsprüfung
                    checkLMStudioConnection();
                }
            }

            return {success: true, config: updatedConfig};
        } catch (error) {
            console.error('Fehler beim Speichern der Einstellungen:', error);
            return {success: false, error: error.message};
        }
    });

    ipcMain.handle('get-settings', async () => {
        try {
            return env.getConfig();
        } catch (error) {
            console.error('Fehler beim Abrufen der Einstellungen:', error);
            return null;
        }
    });

    ipcMain.handle('reset-settings', async () => {
        try {
            console.log('Einstellungen zurücksetzen...');
            const newConfig = env.resetToDefaults();
            config          = newConfig; // Lokale Config aktualisieren
            console.log('Einstellungen zurückgesetzt:', newConfig);
            return {success: true, config: newConfig};
        } catch (error) {
            console.error('Fehler beim Zurücksetzen der Einstellungen:', error);
            return {success: false, error: error.message};
        }
    });

    ipcMain.handle('check-lm-studio', async () => {
        console.log('Main: Manueller LM Studio Status Check angefordert');
        try {
            await checkLMStudioConnection();
            return {success: true};
        } catch (error) {
            console.error('Main: Fehler beim manuellen Status-Check', error);
            return {success: false, error: error.message};
        }
    });

    // Link-Öffnungs-Handler
    ipcMain.handle('open-external-link', async (event, url) => {
        try {
            await shell.openExternal(url);
            return {success: true};
        } catch (error) {
            console.error('Fehler beim Öffnen des Links:', error);
            return {success: false, error: error.message};
        }
    });

    // LLM-Modellverwaltung
    ipcMain.handle('get-available-models', async () => {
        try {
            if (!llmEngine) {
                if (config.useLocalLlm) {
                    initLLMEngine();
                } else {
                    return {success: false, error: 'Lokales LLM ist deaktiviert'};
                }
            }

            const models = await llmEngine.getAvailableModels();
            return {success: true, models, currentModel};
        } catch (error) {
            console.error('Fehler beim Abrufen der Modelle:', error);
            return {success: false, error: error.message};
        }
    });

    ipcMain.handle('load-model', async (event, modelPath) => {
        try {
            if (!config.useLocalLlm) {
                return {success: false, error: 'Lokales LLM ist deaktiviert'};
            }

            const success = await loadModel(modelPath);
            return {success, model: modelPath};
        } catch (error) {
            console.error('Fehler beim Laden des Modells:', error);
            return {success: false, error: error.message};
        }
    });

    ipcMain.handle('download-model', async (event, {url, modelName}) => {
        try {
            if (!llmEngine) {
                if (config.useLocalLlm) {
                    initLLMEngine();
                } else {
                    return {success: false, error: 'Lokales LLM ist deaktiviert'};
                }
            }

            // Status an die UI senden
            mainWindow.webContents.send('model-status', {
                status : 'downloading',
                message: `Lade Modell herunter: ${modelName}`
            });

            await llmEngine.downloadModel(url, modelName, mainWindow);

            // Status an die UI senden
            mainWindow.webContents.send('model-status', {
                status : 'downloaded',
                message: `Modell heruntergeladen: ${modelName}`
            });

            return {success: true, modelName};
        } catch (error) {
            console.error('Fehler beim Herunterladen des Modells:', error);

            // Status an die UI senden
            mainWindow.webContents.send('model-status', {
                status : 'error',
                message: `Fehler beim Herunterladen des Modells: ${error.message}`
            });

            return {success: false, error: error.message};
        }
    });

    ipcMain.handle('delete-model', async (event, modelName) => {
        try {
            if (!llmEngine) {
                return {success: false, error: 'LLM-Engine nicht initialisiert'};
            }

            await llmEngine.deleteModel(modelName);

            // Status an die UI senden
            mainWindow.webContents.send('model-status', {
                status : 'deleted',
                message: `Modell gelöscht: ${modelName}`
            });

            return {success: true};
        } catch (error) {
            console.error('Fehler beim Löschen des Modells:', error);
            return {success: false, error: error.message};
        }
    });

    ipcMain.handle('search-huggingface-models', async (event, query) => {
        try {
            console.log(`Suche nach Hugging Face Modellen: "${query}"`);
            const models = await searchModels(query);
            return {success: true, models};
        } catch (error) {
            console.error('Fehler bei der Modellsuche:', error);
            return {success: false, error: error.message};
        }
    });

    // Fenster erstellen
    createWindow();

    // Autostart mit Windows einrichten (wenn aktiviert)
    app.setLoginItemSettings({
        openAtLogin: config.startWithWindows,
        path       : app.getPath('exe')
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Alle Fenster geschlossen
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// App beenden
app.on('before-quit', () => {
    stopServer();
});

// Für CommonJS-Kompatibilität
module.exports = {
    app
};