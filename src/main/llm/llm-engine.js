// src/main/llm/llm-engine.js
// Module for LLM integration using node-llama-cpp - ES Module Version

import AdmZip from 'adm-zip';
import {app} from 'electron';
import fs from 'fs';
import {getLlama, LlamaChatSession} from "node-llama-cpp";
import path from 'path';
import {ensureDirectoryExists} from '../utils/file-utils.js';

/**
 * LLM Engine class for handling local AI models
 */
export default class LLMEngine {
    /**
     * Creates a new LLM Engine instance
     * @param {Object} config - Configuration options
     */
    constructor(config) {
        this.config        = config;
        this.model         = null;
        this.context       = null;
        this.llama         = null;
        this.isInitialized = false;
        this.currentModel  = null;

        // Ensure models directory exists
        this.modelsDir = path.join(app.getPath('userData'), config.modelDir || 'models');
        ensureDirectoryExists(this.modelsDir);

        // Initialize Llama
        this.initializeLlama();
    }

    /**
     * Initializes the Llama module
     * @returns {Promise<void>}
     */
    async initializeLlama() {
        try {
            this.llama         = {
                getLlama        : getLlama,
                LlamaChatSession: LlamaChatSession
            };
            this.isInitialized = true;
        } catch (error) {
            console.error('Error initializing Llama:', error);
            this.isInitialized = false;
        }
    }

    /**
     * Loads a model
     * @param {string} modelPath - Path to the model file
     * @param {Object} options - Model options
     * @returns {Promise<boolean>} - Success status
     */
    async loadModel(modelPath, options = {}) {
        if (!this.llama) {
            await this.initializeLlama();
        }

        try {
            // Wait for modules to initialize
            if (!this.isInitialized) {
                console.log('Waiting for modules to initialize...');
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
                throw new Error(`Model not found: ${fullModelPath}`);
            }

            // Merge default options with provided options
            const modelOptions = {
                modelPath: fullModelPath,
                threads  : options.threads || this.config.threads || 4,
                gpuLayers: 'auto',
                ...options
            };

            // Close existing model if any
            if (this.model) {
                console.log('Closing existing model...');
                if (this.context) {
                    await this.context.dispose();
                }
                await this.model.dispose();
                this.model   = null;
                this.context = null;
            }

            // Load Llama and initialize model
            const llama = await this.llama.getLlama();
            this.model  = await llama.loadModel(modelOptions);

            // Create context
            this.context = await this.model.createContext();

            // Save current model name
            this.currentModel = modelPath;

            return true;
        } catch (error) {
            console.error('Error loading model:', error);
            return false;
        }
    }

    /**
     * Generates a chat response
     * @param {Array} messages - Chat messages
     * @param {Object} options - Generation options
     * @returns {Promise<string>} - Generated response
     */
    async generateChatResponse(messages, options = {}) {
        if (!this.model || !this.context) {
            throw new Error('No model or context active.');
        }

        try {
            // Extract the last user prompt
            const lastUserMessage = messages.filter(m => m.role === 'user').pop();

            if (!lastUserMessage) {
                throw new Error('No user prompt found');
            }

            // Options for generation
            const inferenceOptions = {
                temperature: options.temperature || 0.7,
                maxTokens  : options.maxTokens || 1024,
                topP       : options.topP || 0.95,
                ...options
            };

            // Format messages into a prompt
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

            // Create a chat session
            let session;

            try {
                // Versuche, eine neue Sequenz zu bekommen
                const sequence = this.context.getSequence() ?? await this.model.createContext();
                session        = new this.llama.LlamaChatSession({
                    contextSequence: sequence,
                    systemPrompt   : this.config.systemPrompt
                });
            } catch (error) {
                // Bei "No sequences left" Fehler: Kontext neu erstellen
                if (error.message.includes('No sequences left')) {
                    console.log('No sequences left, recreating context...');

                    // Alten Kontext bereinigen
                    if (this.context) {
                        await this.context.dispose();
                    }

                    // Neuen Kontext erstellen
                    this.context = await this.model.createContext();

                    // Neue Sequenz und Session erstellen
                    const newSequence = this.context.getSequence();
                    session           = new this.llama.LlamaChatSession({
                        contextSequence: newSequence,
                        systemPrompt   : this.config.systemPrompt
                    });

                    console.log('Context recreated successfully');
                } else {
                    // Andere Fehler weiterwerfen
                    throw error;
                }
            }

            let fullResponse = '';
            const model      = this.model;

            // Handle abort signal
            if (options.signal) {
                options.signal.addEventListener('abort', () => {
                    console.log('LLM Generation aborted');
                });
            }

            // Use streaming if onToken callback is defined
            await session.prompt(formattedPrompt, {
                ...inferenceOptions,
                onToken: (token) => {
                    const tokenText = model.detokenize(token);

                    // Filtere Tags
                    const filteredText = tokenText.replace(/<\|im_end\|>/g, '');
                    fullResponse += filteredText;

                    if (options.onToken) {
                        options.onToken(filteredText);
                    }
                }
            });

            // Explizit Ressourcen freigeben, um Sequenzen zu bereinigen
            try {
                if (session && typeof session.dispose === 'function') {
                    await session.dispose();
                }
            } catch (cleanupError) {
                console.warn('Warning: Error during session cleanup:', cleanupError);
            }

            return fullResponse;
        } catch (error) {
            // Catch abort
            if (error.message === 'AbortError' || error.name === 'AbortError') {
                throw new Error('AbortError');
            }

            console.error('Error generating chat response:', error);
            throw error;
        }
    }

    /**
     * Gets all available models
     * @returns {Promise<Array<string>>} - List of available models
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
            console.error('Error getting available models:', error);
            return [];
        }
    }

    /**
     * Downloads a model
     * @param {string} url - URL to download
     * @param {string} modelName - Name of the model
     * @param {BrowserWindow} window - Electron window for progress
     * @returns {Promise<boolean>} - Success status
     */
    async downloadModel(url, modelName, window) {
        try {
            // Wait for modules to initialize
            if (!this.isInitialized) {
                console.log('Waiting for modules to initialize...');
                await new Promise(resolve => {
                    const checkInterval = setInterval(() => {
                        if (this.isInitialized) {
                            clearInterval(checkInterval);
                            resolve();
                        }
                    }, 100);
                });
            }

            console.log(`Starting download for ${modelName} from ${url}`);

            // Determine target file path
            const targetFile = path.join(this.modelsDir, modelName);

            // Check if file already exists
            if (fs.existsSync(targetFile)) {
                throw new Error(`File ${modelName} already exists`);
            }

            // Download with electron-dl (dynamically loaded)
            const {download} = await import('electron-dl');
            const dl         = await download(window, url, {
                directory : this.modelsDir,
                filename  : modelName,
                onProgress: (progress) => {
                    window.webContents.send('model-download-progress', {
                        text    : `Downloading ${modelName}...`,
                        progress: progress.percent * 100
                    });
                }
            });

            console.log(`Downloaded ${dl}`);

            console.log(`Download completed: ${dl.getSavePath()}`);

            // Extract if it's a ZIP file
            if (modelName.endsWith('.zip')) {
                console.log('Extracting ZIP file...');

                window.webContents.send('model-download-progress', {
                    text    : 'Extracting model...',
                    progress: 99
                });

                const zip = new AdmZip(dl.getSavePath());
                zip.extractAllTo(this.modelsDir, true);

                // Delete ZIP file after extraction
                fs.unlinkSync(dl.getSavePath());

                console.log('ZIP file extracted and deleted');
            }

            window.webContents.send('model-download-progress', {
                text    : 'Download completed',
                progress: 100
            });

            return true;
        } catch (error) {
            console.error('Error downloading model:', error);
            throw error;
        }
    }

    /**
     * Deletes a model
     * @param {string} modelName - Name of the model to delete
     * @returns {Promise<boolean>} - Success status
     */
    async deleteModel(modelName) {
        try {
            const modelPath = path.join(this.modelsDir, modelName);

            if (!fs.existsSync(modelPath)) {
                throw new Error(`Model ${modelName} does not exist`);
            }

            // If it's the currently loaded model, close it first
            if (this.model && this.currentModel === modelName) {
                if (this.context) {
                    await this.context.dispose();
                }
                await this.model.dispose();
                this.model        = null;
                this.context      = null;
                this.currentModel = null;
            }

            // Delete file
            fs.unlinkSync(modelPath);
            console.log(`Model ${modelName} has been deleted`);

            return true;
        } catch (error) {
            console.error('Error deleting model:', error);
            throw error;
        }
    }
}