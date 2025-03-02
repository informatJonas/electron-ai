import axios from 'axios';
import express from 'express';
import path from 'path';
import {fileURLToPath} from 'url';
import {extractFileReferences} from '../utils/string-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export function createExpressServer(dependencies) {
    const expressApp                = express();
    let server                      = null;
    let currentGenerationController = null;

    if (!dependencies) {
        console.error('Dependencies not provided to Express server');
        dependencies = {};
    }

    const {
              config              = {},
              mainWindow          = null,
              llmEngine           = null,
              chatHistoryManager  = null,
              duckDuckGoSearch    = null,
              fetchWebContent     = null,
              checkLMStudioStatus = null,
              gitConnector        = null
          } = dependencies;

    expressApp.use(express.json());
    expressApp.use((req, res, next) => {
        // CORS-Header für alle Anfragen hinzufügen
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

        // Bei OPTIONS-Anfragen sofort antworten
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        next();
    });
    expressApp.use(express.static(path.join(__dirname, '../../renderer')));
    expressApp.use(express.static(path.join(__dirname, '../../renderer/html')));

    async function processFileReferences(message) {
        try {
            const fileRefs = extractFileReferences(message);

            if (fileRefs.length === 0) {
                return message;
            }

            if (mainWindow) {
                mainWindow.webContents.send('processing-status', {
                    status: 'processing-files',
                    count : fileRefs.length
                });
            }

            if (!gitConnector) {
                return `${message}\n\nNote: File references were found, but file processing is not available.`;
            }

            let fileContents       = '';
            let processedFileCount = 0;

            for (const fileRef of fileRefs) {
                try {
                    if (!fileRef.sourceId.startsWith('repo_') && !fileRef.sourceId.startsWith('folder_')) {
                        fileContents += `\nInvalid source ID: ${fileRef.sourceId}\n`;
                        continue;
                    }

                    const result = await gitConnector.readFile(fileRef.sourceId, fileRef.path);

                    if (result.success) {
                        const extension = path.extname(fileRef.path).toLowerCase().substring(1) || '';
                        fileContents += `\n### File: ${fileRef.path}\n\`\`\`${extension}\n${result.content}\n\`\`\`\n\n`;
                        processedFileCount++;
                    } else {
                        fileContents += `\nError loading ${fileRef.path}: ${result.error}\n\n`;
                    }
                } catch (error) {
                    fileContents += `\nError processing ${fileRef.fullMatch}: ${error.message}\n\n`;
                }
            }

            let cleanedMessage = message;
            fileRefs.forEach(ref => {
                cleanedMessage = cleanedMessage.replace(ref.fullMatch, '');
            });

            cleanedMessage = cleanedMessage.replace(/\n{3,}/g, '\n\n').trim();

            return processedFileCount > 0
                ? `${cleanedMessage}\n\n--- File contents (${processedFileCount} files) ---\n${fileContents}`
                : `${cleanedMessage}\n\nNote: File references were found, but no valid files could be loaded.`;
        } catch (error) {
            console.error('Error processing file references:', error);
            return `${message}\n\nError processing file references: ${error.message}`;
        }
    }

    function shouldPerformWebSearch(message) {
        if (!message) return false;

        const lowerMessage = message.toLowerCase();

        const needsCurrentInfo = [
            'heute', 'aktuell', 'neu', 'letzte', 'kürzlich', 'news',
            'wetter', 'preis', 'kosten', 'kurs', 'börse', 'aktie',
            'neueste version', 'gerade', 'dieser tage', 'momentan'
        ].some(term => lowerMessage.includes(term));

        const needsFactChecking = [
            'wie viel', 'wie viele', 'wie lange', 'wann', 'wo', 'wer',
            'woher', 'warum', 'welche', 'welcher', 'welches', 'was kostet',
            'preis von', 'unterschied zwischen', 'vergleich'
        ].some(term => lowerMessage.includes(term));

        const needsTechnicalInfo = [
            'fehler', 'problem', 'installation', 'anleitung', 'tutorial',
            'dokumentation', 'api', 'funktion', 'methode', 'beispiel',
            'code für', 'programmierung', 'library', 'bibliothek', 'framework'
        ].some(term => lowerMessage.includes(term));

        const containsSpecificEntity = /\d{4}|version \d+|\b[A-Z][a-z]+ [A-Z][a-z]+\b/.test(message);

        const needsWebInfo = [
            'link', 'url', 'website', 'webseite', 'seite', 'homepage',
            'blog', 'forum', 'suche nach', 'finde', 'suchen'
        ].some(term => lowerMessage.includes(term));

        const isPhilosophicalQuestion = [
            'was wäre wenn', 'könnte man', 'warum gibt es', 'bedeutung von',
            'sinn des', 'theorie', 'philosophie', 'ethik', 'moral', 'wert',
            'meinung', 'denkst du', 'glaubst du', 'stelle dir vor'
        ].some(term => lowerMessage.includes(term));

        const isSmallTalk = [
            'hallo', 'hi', 'wie geht es dir', 'guten tag', 'guten morgen',
            'guten abend', 'kennst du', 'magst du', 'was denkst du über',
            'erzähl mir', 'bist du', 'kannst du', 'wie heißt du', 'danke'
        ].some(term => lowerMessage.includes(term));

        const shouldSearch = (
            needsCurrentInfo ||
            needsFactChecking ||
            needsTechnicalInfo ||
            containsSpecificEntity ||
            needsWebInfo
        ) && !isPhilosophicalQuestion && !isSmallTalk;

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

    expressApp.post('/api/chat', async (req, res) => {
        try {
            const {message, webSearchMode, contentUrl, newConversation} = req.body;

            if (!message) {
                return res.status(400).json({
                    success: false,
                    message: 'No message provided'
                });
            }

            if (newConversation && currentGenerationController) {
                currentGenerationController.abort();
                currentGenerationController = null;
            }

            currentGenerationController = new AbortController();
            const signal                = currentGenerationController.signal;

            const useLocalLLM = config.useLocalLlm;

            if (useLocalLLM && !llmEngine) {
                return res.status(400).json({
                    success: false,
                    message: 'Local LLM engine is not initialized'
                });
            }

            if (useLocalLLM) {
                if (!llmEngine.currentModel) {
                    return res.status(400).json({
                        success: false,
                        message: 'No model is loaded. Please load a model first.'
                    });
                }
            } else if (checkLMStudioStatus) {
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

            let shouldSearch = false;
            let urlContent   = null;

            let processedMessage = message;
            const fileRefs       = extractFileReferences(message);

            if (fileRefs.length > 0) {
                processedMessage = await processFileReferences(message);
            }

            let actualMessage = processedMessage;
            if (processedMessage.toLowerCase().startsWith('lokal:')) {
                actualMessage = processedMessage.substring(6).trim();
                shouldSearch  = false;
            } else {
                if (contentUrl && fetchWebContent) {
                    try {
                        urlContent = await fetchWebContent(contentUrl);
                        actualMessage += `\n\nContent from ${contentUrl}:\n${urlContent?.mainContent || 'No content found'}`;
                    } catch (urlError) {
                        console.error('Error fetching URL:', urlError);
                    }
                }

                switch (webSearchMode) {
                    case 'always':
                        shouldSearch = true;
                        break;
                    case 'never':
                        shouldSearch = false;
                        break;
                    case 'auto':
                        shouldSearch = shouldPerformWebSearch(actualMessage);
                        break;
                    default:
                        shouldSearch = true;
                }
            }

            let contextInfo = '';

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

            const systemPrompt = config.systemPrompt ||
                'You are a helpful assistant with internet access. You help with programming and answer questions based on current information from the internet. Always answer in German, even if the question or information is in English.';

            const fullMessage = contextInfo
                ? `${contextInfo}\nQuestion: ${actualMessage}`
                : actualMessage;

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-open');

            if (useLocalLLM && llmEngine && chatHistoryManager) {
                try {
                    chatHistoryManager.addMessage('user', fullMessage);
                    const messages = chatHistoryManager.getFormattedHistoryForLLM(systemPrompt, true);
                    messages.push({role: 'user', content: fullMessage});

                    let streamContent = '';

                    const onTokenCallback = (token) => {
                        streamContent += token;
                        res.write(`data: ${JSON.stringify(token)}\n\n`);
                    };

                    await llmEngine.generateChatResponse(messages, {
                        temperature: 0.7,
                        maxTokens  : 2048,
                        stream     : true,
                        onToken    : onTokenCallback,
                        signal
                    });

                    chatHistoryManager.addMessage('assistant', streamContent);
                    res.write('event: done\ndata: END\n\n');
                    res.end();

                    if (mainWindow) {
                        mainWindow.webContents.send('model-status', {
                            status : 'success',
                            message: 'Response successfully generated'
                        });
                    }
                } catch (error) {
                    if (error.name === 'AbortError') {
                        console.log('Generation aborted');
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
                try {
                    let apiUrl = config.lmStudioUrl || 'http://127.0.0.1:1234';
                    if (apiUrl.includes('localhost')) {
                        apiUrl = apiUrl.replace('localhost', '127.0.0.1');
                    }
                    apiUrl = `${apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl}/v1/chat/completions`;

                    if (chatHistoryManager) {
                        chatHistoryManager.addMessage('user', fullMessage);
                    }

                    const messagesWithHistory = chatHistoryManager
                        ? chatHistoryManager.getFormattedHistoryForLLM(systemPrompt, true)
                        : [{role: 'system', content: systemPrompt}];

                    messagesWithHistory.push({role: 'user', content: fullMessage});

                    const axiosInstance = axios.create({
                        baseURL     : apiUrl,
                        timeout     : 60000,
                        responseType: 'stream',
                        signal
                    });

                    let fullResponse = '';

                    const response = await axiosInstance.post('', {
                        model      : config.lmStudioModel || 'local-model',
                        messages   : messagesWithHistory,
                        temperature: 0.7,
                        stream     : true
                    });

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
                            res.status(500).json({error: 'Streaming error'});
                        }
                    });

                    if (mainWindow) {
                        mainWindow.webContents.send('lm-studio-status', {
                            status : 'connected',
                            message: 'Connected to LM Studio'
                        });
                    }
                } catch (error) {
                    if (error.name === 'AbortError' || error.message === 'canceled') {
                        console.log('LM Studio request aborted');
                        if (!res.writableEnded) {
                            res.write('event: done\ndata: ABORTED\n\n');
                            res.end();
                        }
                    } else {
                        console.error('Error in LM Studio request:', error);

                        if (mainWindow) {
                            mainWindow.webContents.send('lm-studio-status', {
                                status : 'error',
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
            currentGenerationController = null;
        }
    });

    expressApp.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../../renderer/html/index.html'));
    });

    async function startServer(port = 3000) {
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

    async function stopServer() {
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

export default createExpressServer;
