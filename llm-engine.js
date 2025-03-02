// llm-engine.js - Modul für die LLM-Integration
const path   = require('path');
const fs     = require('fs');
const {app}  = require('electron');
const AdmZip = require('adm-zip');

class LLMEngine {
    constructor(config) {
        this.config        = config;
        this.model         = null;
        this.context       = null;
        this.llama         = null;
        this.isInitialized = false;
        this.modelsDir     = path.join(app.getPath('userData'), config.modelDir || 'models');

        // Stelle sicher, dass das Modellverzeichnis existiert
        if (!fs.existsSync(this.modelsDir)) {
            fs.mkdirSync(this.modelsDir, {recursive: true});
        }

        // Initialisiere Llama beim Konstruktor
        this.initializeLlama();
    }

    /**
     * Initialisiert das Llama-Modul
     */
    async initializeLlama() {
        try {
            const llamaModule  = await import('node-llama-cpp');
            this.llama         = {
                getLlama        : llamaModule.getLlama,
                LlamaChatSession: llamaModule.LlamaChatSession
            };
            this.isInitialized = true;
        } catch (error) {
            console.error('Fehler bei der Initialisierung von Llama:', error);
            this.isInitialized = false;
        }
    }

    /**
     * Lädt ein Modell
     * @param {string} modelPath - Pfad zur Modelldatei
     * @param {object} options - Modelloptionen
     */
    async loadModel(modelPath, options = {}) {
        if (!this.llama) {
            await this.initializeLlama();
        }

        try {
            // Warte auf Initialisierung der Module
            if (!this.isInitialized) {
                console.log('Warte auf Initialisierung der Module...');
                await new Promise(resolve => {
                    const checkInterval = setInterval(() => {
                        if (this.isInitialized) {
                            clearInterval(checkInterval);
                            resolve();
                        }
                    }, 100);
                });
            }

            const fullModelPath = path.isAbsolute(modelPath)
                ? modelPath
                : path.join(this.modelsDir, modelPath);

            if (!fs.existsSync(fullModelPath)) {
                throw new Error(`Modell nicht gefunden: ${fullModelPath}`);
            }

            // Standardoptionen mit übergebenen Optionen zusammenführen
            const modelOptions = {
                modelPath: fullModelPath,
                //contextSize: options.contextSize || this.config.contextSize || 2048,
                threads  : options.threads || this.config.threads || 4,
                gpuLayers: 'auto',
                ...options
            };

            // Bestehendes Modell schließen, falls vorhanden
            if (this.model) {
                console.log('Schließe bestehendes Modell...');
                if (this.context) {
                    await this.context.dispose();
                }
                await this.model.dispose();
                this.model   = null;
                this.context = null;
            }

            // Llama laden und Modell initialisieren
            const llama = await this.llama.getLlama();
            this.model  = await llama.loadModel(modelOptions);

            // Kontext erstellen
            this.context = await this.model.createContext({
                contextSize: options.contextSize || this.config.contextSize || 2048
            });
            return true;
        } catch (error) {
            console.error('Fehler beim Laden des Modells:', error);
            return false;
        }
    }

    async generateChatResponse(messages, options = {}) {
        if (!this.model || !this.context) {
            throw new Error('Es ist kein Modell oder Kontext aktiv.');
        }

        try {
            // Extrahiere den letzten Benutzer-Prompt
            const lastUserMessage = messages.filter(m => m.role === 'user').pop();

            if (!lastUserMessage) {
                throw new Error('Kein Benutzer-Prompt gefunden');
            }

            // Optionen für die Generierung
            const inferenceOptions = {
                temperature: options.temperature || 0.7,
                maxTokens  : options.maxTokens || 1024,
                topP       : options.topP || 0.95,
                ...options
            };

            // Konvertiere Nachrichten in einen formatierten Prompt
            let formattedPrompt = messages.map(msg => {
                switch (msg.role) {
                    case 'system':
                        return `<|im_start|>system\n${msg.content}<|im_end|>`;
                    case 'user':
                        return `<|im_start|>user\n${msg.content}<|im_end|>`;
                    case 'assistant':
                        return `<|im_start|>assistant\n${msg.content}<|im_end|>`;
                    default:
                        return '';
                }
            }).join('\n') + '\n<|im_start|>assistant\n';

            // Erstelle eine Chat-Sitzung
            const session    = new this.llama.LlamaChatSession({
                contextSequence: this.context.getSequence() ?? await this.model.createContext(),
                systemPrompt   : this.config.systemPrompt
            });
            let fullResponse = '';
            const model      = this.model;

            // Abbruch-Signal behandeln
            if (options.signal) {
                options.signal.addEventListener('abort', () => {
                    // Hier könnte man versuchen, die laufende Session zu beenden
                    // Die genaue Implementierung hängt von der LLM-Bibliothek ab
                    console.log('LLM Generierung abgebrochen');
                    // Möglicherweise die Session beenden oder zurücksetzen
                });
            }

            // Wenn ein Stream-Callback definiert ist, verwenden wir die Streaming-API
            await session.prompt(formattedPrompt, {
                ...inferenceOptions,
                onToken: (token) => {
                    const tokenText = model.detokenize(token);
                    fullResponse += tokenText;

                    options.onToken(tokenText);
                }
            });

            return fullResponse;
        } catch (error) {
            // Abbruch abfangen
            if (error.message === 'AbortError' || error.name === 'AbortError') {
                throw new Error('AbortError');
            }

            console.error('Fehler bei der Chat-Antwort:', error);
            throw error;
        }
    }

    /**
     * Gibt alle verfügbaren Modelle zurück
     */
    async getAvailableModels() {
        try {
            const files = fs.readdirSync(this.modelsDir);
            return files.filter(file =>
                file.endsWith('.gguf') ||
                file.endsWith('.bin') ||
                file.endsWith('.ggml')
            );
        } catch (error) {
            console.error('Fehler beim Abrufen der Modelle:', error);
            return [];
        }
    }

    /**
     * Herunterladefunktionalität für Modelle
     * @param {string} url - URL zum Herunterladen
     * @param {string} modelName - Name des Modells
     * @param {BrowserWindow} window - Electron-Fenster für Download-Fortschritt
     */
    async downloadModel(url, modelName, window) {
        try {
            // Warte auf Initialisierung der Module
            if (!this.isInitialized) {
                console.log('Warte auf Initialisierung der Module...');
                await new Promise(resolve => {
                    const checkInterval = setInterval(() => {
                        if (this.isInitialized) {
                            clearInterval(checkInterval);
                            resolve();
                        }
                    }, 100);
                });
            }

            console.log(`Starte Download für ${modelName} von ${url}`);

            // Bestimme den Zieldateipfad
            const targetFile = path.join(this.modelsDir, modelName);

            // Stelle sicher, dass die Datei noch nicht existiert
            if (fs.existsSync(targetFile)) {
                throw new Error(`Die Datei ${modelName} existiert bereits`);
            }

            // Download mit electron-dl (dynamisch geladen)
            const {download} = await import('electron-dl');
            const dl         = await download(window, url, {
                directory : this.modelsDir,
                filename  : modelName,
                onProgress: (progress) => {
                    window.webContents.send('model-download-progress', {
                        text    : `Lade ${modelName} herunter...`,
                        progress: progress.percent * 100
                    });
                }
            });

            console.log(`Downloaded ${dl}`);

            console.log(`Download abgeschlossen: ${dl.getSavePath()}`);

            // Wenn es sich um eine ZIP-Datei handelt, entpacken
            if (modelName.endsWith('.zip')) {
                console.log('Entpacke ZIP-Datei...');

                window.webContents.send('model-download-progress', {
                    text    : 'Entpacke Modell...',
                    progress: 99
                });

                const zip = new AdmZip(dl.getSavePath());
                zip.extractAllTo(this.modelsDir, true);

                // ZIP-Datei nach dem Entpacken löschen
                fs.unlinkSync(dl.getSavePath());

                console.log('ZIP-Datei entpackt und gelöscht');
            }

            window.webContents.send('model-download-progress', {
                text    : 'Download abgeschlossen',
                progress: 100
            });

            return true;
        } catch (error) {
            console.error('Fehler beim Herunterladen des Modells:', error);
            throw error;
        }
    }

    /**
     * Löscht ein Modell
     * @param {string} modelName - Name des zu löschenden Modells
     */
    async deleteModel(modelName) {
        try {
            const modelPath = path.join(this.modelsDir, modelName);

            if (!fs.existsSync(modelPath)) {
                throw new Error(`Das Modell ${modelName} existiert nicht`);
            }

            // Wenn es sich um das aktuell geladene Modell handelt, zuerst schließen
            if (this.model && this.config.lastUsedModel === modelName) {
                if (this.context) {
                    await this.context.dispose();
                }
                await this.model.dispose();
                this.model   = null;
                this.context = null;
            }

            // Datei löschen
            fs.unlinkSync(modelPath);
            console.log(`Modell ${modelName} wurde gelöscht`);

            return true;
        } catch (error) {
            console.error('Fehler beim Löschen des Modells:', error);
            throw error;
        }
    }
}

module.exports = LLMEngine;