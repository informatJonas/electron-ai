// src/main/api/express-server.js
// Express server for API endpoints

const express = require('express');
const path = require('path');
const axios = require('axios');
const { extractFileReferences } = require('../utils/string-utils');

/**
 * Creates and configures the Express server
 * @param {Object} dependencies - Required dependencies
 * @returns {Object} - Express server and setup methods
 */
function createExpressServer(dependencies) {
    const expressApp = express();
    let server = null;
    let currentGenerationController = null;

    // Ensure all dependencies are available
    if (!dependencies) {
        console.error('Dependencies not provided to Express server');
        dependencies = {};
    }

    const {
              config = {},
              mainWindow = null,
              llmEngine = null,
              chatHistoryManager = null,
              duckDuckGoSearch = null,
              fetchWebContent = null,
              checkLMStudioStatus = null,
              gitConnector = null
          } = dependencies;

    // Configure middleware
    expressApp.use(express.json());
    expressApp.use(express.static(path.join(__dirname, '../../renderer')));

    /**
     * Extract file references from message and process them
     * @param {string} message - User message text
     * @returns {Promise<string>} - Processed message with file contents
     */
    async function processFileReferences(message) {
        try {
            // Extract references with pattern #file:sourceId/path/to/file.js
            const fileRefs = extractFileReferences(message);

            if (fileRefs.length === 0) {
                return message;
            }

            // Notify UI that files are being processed
            if (mainWindow) {
                mainWindow.webContents.send('processing-status', {
                    status: 'processing-files',
                    count: fileRefs.length
                });
            }

            // Guard for missing gitConnector
            if (!gitConnector) {
                return `${message}\n\nNote: File references were found, but file processing is not available.`;
            }

            let fileContents = '';
            let processedFileCount = 0;

            // Process each file reference
            for (const fileRef of fileRefs) {
                try {
                    // Validate the sourceId
                    if (!fileRef.sourceId.startsWith('repo_') && !fileRef.sourceId.startsWith('folder_')) {
                        fileContents += `\nInvalid source ID: ${fileRef.sourceId}\n`;
                        continue;
                    }

                    // Load the file content
                    const result = await gitConnector.readFile(fileRef.sourceId, fileRef.path);

                    if (result.success) {
                        // Determine file extension for syntax highlighting
                        const extension = path.extname(fileRef.path).toLowerCase().substring(1) || ''; // Remove the dot

                        // Format the file content with Markdown codeblock
                        fileContents += `\n### File: ${fileRef.path}\n\`\`\`${extension}\n${result.content}\n\`\`\`\n\n`;
                        processedFileCount++;
                    } else {
                        fileContents += `\nError loading ${fileRef.path}: ${result.error}\n\n`;
                    }
                } catch (error) {
                    fileContents += `\nError processing ${fileRef.fullMatch}: ${error.message}\n\n`;
                }
            }

            // Clean the message by removing file references
            let cleanedMessage = message;
            fileRefs.forEach(ref => {
                cleanedMessage = cleanedMessage.replace(ref.fullMatch, '');
            });

            // Clean up multiple newlines
            cleanedMessage = cleanedMessage.replace(/\n{3,}/g, '\n\n').trim();

            // Add note if files were processed
            if (processedFileCount > 0) {
                return `${cleanedMessage}\n\n--- File contents (${processedFileCount} files) ---\n${fileContents}`;
            } else {
                return `${cleanedMessage}\n\nNote: File references were found, but no valid files could be loaded.`;
            }
        } catch (error) {
            console.error('Error processing file references:', error);
            return `${message}\n\nError processing file references: ${error.message}`;
        }
    }

    /**
     * Determines if web search should be performed for a given message
     * @param {string} message - User message
     * @returns {boolean} - True if search should be performed
     */
    function shouldPerformWebSearch(message) {
        if (!message) return false;

        // Message in lowercase for easier checking
        const lowerMessage = message.toLowerCase();

        // Check if the message requires current information
        const needsCurrentInfo = [
            'heute', 'aktuell', 'neu', 'letzte', 'kürzlich', 'news',
            'wetter', 'preis', 'kosten', 'kurs', 'börse', 'aktie',
            'neueste version', 'gerade', 'dieser tage', 'momentan'
        ].some(term => lowerMessage.includes(term));

        // Check if the message asks for specific facts
        const needsFactChecking = [
            'wie viel', 'wie viele', 'wie lange', 'wann', 'wo', 'wer',
            'woher', 'warum', 'welche', 'welcher', 'welches', 'was kostet',
            'preis von', 'unterschied zwischen', 'vergleich'
        ].some(term => lowerMessage.includes(term));

        // Check if the message requires specific technical information
        const needsTechnicalInfo = [
            'fehler', 'problem', 'installation', 'anleitung', 'tutorial',
            'dokumentation', 'api', 'funktion', 'methode', 'beispiel',
            'code für', 'programmierung', 'library', 'bibliothek', 'framework'
        ].some(term => lowerMessage.includes(term));

        // Check if the message asks for specific data, names, etc.
        const containsSpecificEntity = /\d{4}|version \d+|\b[A-Z][a-z]+ [A-Z][a-z]+\b/.test(message);

        // Check if link, URL or website is mentioned
        const needsWebInfo = [
            'link', 'url', 'website', 'webseite', 'seite', 'homepage',
            'blog', 'forum', 'suche nach', 'finde', 'suchen'
        ].some(term => lowerMessage.includes(term));

        // Check if it's a philosophical or hypothetical question
        const isPhilosophicalQuestion = [
            'was wäre wenn', 'könnte man', 'warum gibt es', 'bedeutung von',
            'sinn des', 'theorie', 'philosophie', 'ethik', 'moral', 'wert',
            'meinung', 'denkst du', 'glaubst du', 'stelle dir vor'
        ].some(term => lowerMessage.includes(term));

        // Check if it's small talk or personal opinion
        const isSmallTalk = [
            'hallo', 'hi', 'wie geht es dir', 'guten tag', 'guten morgen',
            'guten abend', 'kennst du', 'magst du', 'was denkst du über',
            'erzähl mir', 'bist du', 'kannst du', 'wie heißt du', 'danke'
        ].some(term => lowerMessage.includes(term));

        // Decision based on various factors
        const shouldSearch = (
            needsCurrentInfo ||
            needsFactChecking ||
            needsTechnicalInfo ||
            containsSpecificEntity ||
            needsWebInfo
        ) && !isPhilosophicalQuestion && !isSmallTalk;

        // Debug output if enabled
        if (config.debugMode) {
            console.log('Auto web search decision:', {
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

    // API routes
    expressApp.post('/api/chat', async (req, res) => {
        try {
            const { message, webSearchMode, contentUrl, newConversation } = req.body;

            if (!message) {
                return res.status(400).json({
                    success: false,
                    message: 'No message provided'
                });
            }

            // If a new conversation is requested and there's an active generation, abort it
            if (newConversation && currentGenerationController) {
                currentGenerationController.abort();
                currentGenerationController = null;
            }

            // Create AbortController for the current request
            currentGenerationController = new AbortController();
            const signal = currentGenerationController.signal;

            // Decide whether to use LM Studio or local LLM
            const useLocalLLM = config.useLocalLlm;

            // Check if the necessary components are available
            if (useLocalLLM && !llmEngine) {
                return res.status(400).json({
                    success: false,
                    message: 'Local LLM engine is not initialized'
                });
            }

            if (useLocalLLM) {
                // Check if a model is loaded
                if (!llmEngine.currentModel) {
                    return res.status(400).json({
                        success: false,
                        message: 'No model is loaded. Please load a model first.'
                    });
                }
            } else if (checkLMStudioStatus) {
                // Check LM Studio URL and test connection
                const lmStudioStatus = await checkLMStudioStatus(config.lmStudioUrl);
                if (!lmStudioStatus) {
                    return res.status(500).json({
                        success: false,
                        message: 'Connection to LM Studio failed. Please ensure LM Studio is running.'
                    });
                }
            } else {
                return res.status(500).json({
                    success: false,
                    message: 'LM Studio connection checker is not available'
                });
            }

            // Decide whether to perform web search based on mode and message
            let shouldSearch = false;
            let urlContent = null;

            // Check for file references in the text and process them
            let processedMessage = message;
            const fileRefs = extractFileReferences(message);

            if (fileRefs.length > 0) {
                // Process file references and inject content
                processedMessage = await processFileReferences(message);
            }

            // Detect local mode
            let actualMessage = processedMessage;
            if (processedMessage.toLowerCase().startsWith('lokal:')) {
                actualMessage = processedMessage.substring(6).trim();
                shouldSearch = false; // Always local if explicitly specified
            } else {
                // Fetch URL content if provided
                if (contentUrl && fetchWebContent) {
                    try {
                        urlContent = await fetchWebContent(contentUrl);
                        actualMessage += `\n\nContent from ${contentUrl}:\n${urlContent?.mainContent || 'No content found'}`;
                    } catch (urlError) {
                        console.error('Error fetching URL:', urlError);
                    }
                }

                // Decision based on web search mode
                switch (webSearchMode) {
                    case 'always':
                        shouldSearch = true;
                        break;
                    case 'never':
                        shouldSearch = false;
                        break;
                    case 'auto':
                        // Let AI decide if web search is useful
                        shouldSearch = shouldPerformWebSearch(actualMessage);
                        break;
                    default:
                        shouldSearch = true; // Search by default
                }
            }

            let contextInfo = '';

            // Perform web search if enabled
            if (shouldSearch && duckDuckGoSearch) {
                try {
                    const searchResults = await duckDuckGoSearch(
                        actualMessage,
                        config.maxSearchResults || 3,
                        config.searchTimeout || 5000
                    );

                    if (searchResults && searchResults.length > 0) {
                        contextInfo = 'Here is current information from the internet:\n\n';

                        searchResults.forEach((result, index) => {
                            contextInfo += `[${index + 1}] ${result.title}\n`;
                            contextInfo += `URL: ${result.url}\n`;
                            contextInfo += `Description: ${result.description}\n\n`;
                        });
                    }
                } catch (searchError) {
                    console.error('Error during web search:', searchError);
                }
            }

            // System prompt from settings
            const systemPrompt = config.systemPrompt ||
                'You are a helpful assistant with internet access. You help with programming and answer questions based on current information from the internet. Always answer in German, even if the question or information is in English.';

            // Full prompt with context
            const fullMessage = contextInfo
                ? `${contextInfo}\nQuestion: ${actualMessage}`
                : actualMessage;

            // Set streaming headers
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-open');

            // Processing path based on configuration
            if (useLocalLLM && llmEngine && chatHistoryManager) {
                // ***** Use local LLM *****
                try {
                    // Add user message to history
                    chatHistoryManager.addMessage('user', fullMessage);

                    // Prepare chat messages with history (without the just added message)
                    const messages = chatHistoryManager.getFormattedHistoryForLLM(systemPrompt, true);

                    // Explicitly add current user message
                    messages.push({ role: 'user', content: fullMessage });

                    // Stream results
                    let streamContent = '';

                    // Stream callback function
                    const onTokenCallback = (token) => {
                        streamContent += token;
                        res.write(`data: ${JSON.stringify(token)}\n\n`);
                    };

                    // Generate chat response
                    await llmEngine.generateChatResponse(messages, {
                        temperature: 0.7,
                        maxTokens: 2048,
                        stream: true,
                        onToken: onTokenCallback,
                        signal
                    });

                    // Add assistant response to history
                    chatHistoryManager.addMessage('assistant', streamContent);

                    // End stream
                    res.write('event: done\ndata: END\n\n');
                    res.end();

                    // Send status to UI
                    if (mainWindow) {
                        mainWindow.webContents.send('model-status', {
                            status: 'success',
                            message: 'Response successfully generated'
                        });
                    }
                } catch (error) {
                    // Detect abort
                    if (error.name === 'AbortError') {
                        console.log('Generation aborted');
                        // If not already ended, send abort status
                        if (!res.writableEnded) {
                            res.write('event: done\ndata: ABORTED\n\n');
                            res.end();
                        }
                    } else {
                        console.error('Error in LLM generation:', error);

                        if (!res.writableEnded) {
                            res.status(500).json({
                                success: false,
                                message: `Error generating response: ${error.message}`
                            });
                        }
                    }
                }
            } else {
                // ***** Use LM Studio *****
                try {
                    // Format URL correctly - prefer IPv4
                    let apiUrl = config.lmStudioUrl || 'http://127.0.0.1:1234';
                    if (apiUrl.includes('localhost')) {
                        apiUrl = apiUrl.replace('localhost', '127.0.0.1');
                    }
                    apiUrl = `${apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl}/v1/chat/completions`;

                    // Add user message to history if chatHistoryManager is available
                    if (chatHistoryManager) {
                        chatHistoryManager.addMessage('user', fullMessage);
                    }

                    // Format chat messages for LM Studio
                    const messagesWithHistory = chatHistoryManager
                        ? chatHistoryManager.getFormattedHistoryForLLM(systemPrompt, true)
                        : [{ role: 'system', content: systemPrompt }];

                    // Explicitly add current user message
                    messagesWithHistory.push({ role: 'user', content: fullMessage });

                    // Axios configuration for streaming
                    const axiosInstance = axios.create({
                        baseURL: apiUrl,
                        timeout: 60000, // 60 seconds timeout
                        responseType: 'stream',
                        signal
                    });

                    // Collection variable for the complete response
                    let fullResponse = '';

                    // Streaming request
                    const response = await axiosInstance.post('', {
                        model: config.lmStudioModel || 'local-model',
                        messages: messagesWithHistory,
                        temperature: 0.7,
                        stream: true
                    });

                    // Stream processing
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

                                            fullResponse += content;
                                            res.write(`data: ${JSON.stringify(content)}\n\n`);
                                        }
                                    } else {
                                        // Add assistant response to history
                                        if (chatHistoryManager) {
                                            chatHistoryManager.addMessage('assistant', fullResponse);
                                        }

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
                            // Ensure the assistant response is added to history
                            if (fullResponse && !res.headersSent && chatHistoryManager) {
                                chatHistoryManager.addMessage('assistant', fullResponse);
                            }

                            res.write('event: done\ndata: END\n\n');
                            res.end();
                        }
                    });

                    response.data.on('error', (error) => {
                        console.error('Stream error:', error);
                        if (!res.writableEnded) {
                            res.status(500).json({ error: 'Streaming error' });
                        }
                    });

                    // Send status to UI
                    if (mainWindow) {
                        mainWindow.webContents.send('lm-studio-status', {
                            status: 'connected',
                            message: 'Connected to LM Studio'
                        });
                    }
                } catch (error) {
                    // Detect abort
                    if (error.name === 'AbortError' || error.message === 'canceled') {
                        console.log('LM Studio request aborted');
                        if (!res.writableEnded) {
                            res.write('event: done\ndata: ABORTED\n\n');
                            res.end();
                        }
                    } else {
                        console.error('Error in LM Studio request:', error);

                        // Send status to UI
                        if (mainWindow) {
                            mainWindow.webContents.send('lm-studio-status', {
                                status: 'error',
                                message: 'Failed to connect to LM Studio'
                            });
                        }

                        if (!res.writableEnded) {
                            res.status(500).json({
                                success: false,
                                message: 'There was a problem processing your request. Ensure LM Studio is running and the API server is started.'
                            });
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error processing request:', error);

            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    message: 'There was a problem processing your request.'
                });
            }
        } finally {
            // Reset controller when request is complete
            currentGenerationController = null;
        }
    });

    /**
     * Starts the Express server
     * @param {number} port - Server port
     * @returns {Promise<Object>} - Server instance
     */
    function startServer(port = 3000) {
        return new Promise((resolve, reject) => {
            try {
                server = expressApp.listen(port, () => {
                    console.log(`Express server running on port ${port}`);
                    resolve(server);
                });

                server.on('error', (error) => {
                    console.error(`Error starting server on port ${port}:`, error);
                    reject(error);
                });
            } catch (error) {
                console.error('Failed to start Express server:', error);
                reject(error);
            }
        });
    }

    /**
     * Stops the Express server
     * @returns {Promise<void>}
     */
    function stopServer() {
        return new Promise((resolve, reject) => {
            if (server) {
                server.close((error) => {
                    if (error) {
                        console.error('Error stopping Express server:', error);
                        reject(error);
                    } else {
                        console.log('Express server stopped');
                        server = null;
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }

    /**
     * Cancels current request if any
     * @returns {boolean} - True if request was cancelled
     */
    function cancelCurrentRequest() {
        if (currentGenerationController) {
            currentGenerationController.abort();
            currentGenerationController = null;
            return true;
        }
        return false;
    }

    return {
        app: expressApp,
        startServer,
        stopServer,
        cancelCurrentRequest
    };
}

module.exports = createExpressServer;