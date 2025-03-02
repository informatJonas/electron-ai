// src/main/services/chat-history.js
// Module for chat history management - ES Module Version

import {app} from 'electron';
import fs from 'fs';
import path from 'path';
import {ensureDirectoryExists} from '../utils/file-utils.js';
import {generateUniqueId, truncate} from '../utils/string-utils.js';

/**
 * Chat History Manager class
 */
export default class ChatHistoryManager {
    /**
     * Creates a new ChatHistoryManager instance
     * @param {Object} config - Configuration options
     */
    constructor(config) {
        // Directory for storing chat history
        this.historyDir = path.join(app.getPath('userData'), 'chat_history');

        // Maximum number of messages to store per conversation
        this.maxMessagesPerConversation = config.maxHistoryMessages || 20;

        // Maximum number of conversations to store
        this.maxConversations = config.maxConversations || 10;

        // Current history in memory
        this.currentSessionId = null;
        this.currentHistory   = [];

        // Initialize
        this.initialize();
    }

    /**
     * Initializes the chat history directory
     */
    initialize() {
        console.log('Initializing chat history directory:', this.historyDir);

        try {
            // Ensure history directory exists
            ensureDirectoryExists(this.historyDir);

            // Clean up old conversations if maximum is exceeded
            this.cleanupOldConversations();

            // Start new conversation
            this.startNewConversation();
        } catch (error) {
            console.error('Error initializing chat history:', error);
        }
    }

    /**
     * Starts a new conversation
     * @returns {string} - ID of the new conversation
     */
    startNewConversation() {
        this.currentSessionId = generateUniqueId('conversation_');
        this.currentHistory   = [];
        return this.currentSessionId;
    }

    /**
     * Adds a message to the history
     * @param {string} role - Role of the sender ('user' or 'assistant')
     * @param {string} content - Message content
     * @returns {Object} - Added message
     */
    addMessage(role, content) {
        // Add message to current history
        const message = {role, content, timestamp: Date.now()};
        this.currentHistory.push(message);

        // Limit number of messages
        if (this.currentHistory.length > this.maxMessagesPerConversation) {
            // Keep system prompt (if any) and remove oldest messages
            const systemPrompt  = this.currentHistory.find(msg => msg.role === 'system');
            this.currentHistory = this.currentHistory.slice(-this.maxMessagesPerConversation);

            // Ensure system prompt is preserved
            if (systemPrompt && !this.currentHistory.some(msg => msg.role === 'system')) {
                this.currentHistory.unshift(systemPrompt);
            }
        }

        // Save updated history
        this.saveCurrentHistory();

        return message;
    }

    /**
     * Saves the current chat history
     */
    saveCurrentHistory() {
        try {
            const filePath = path.join(this.historyDir, `${this.currentSessionId}.json`);
            fs.writeFileSync(filePath, JSON.stringify({
                id         : this.currentSessionId,
                lastUpdated: Date.now(),
                messages   : this.currentHistory
            }, null, 2));
        } catch (error) {
            console.error('Error saving chat history:', error);
        }
    }

    /**
     * Loads a specific conversation
     * @param {string} conversationId - ID of the conversation to load
     * @returns {Array} - Messages of the conversation
     */
    loadConversation(conversationId) {
        try {
            const filePath = path.join(this.historyDir, `${conversationId}.json`);

            if (fs.existsSync(filePath)) {
                const data            = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                this.currentSessionId = conversationId;
                this.currentHistory   = data.messages || [];
                return this.currentHistory;
            }

            return [];
        } catch (error) {
            console.error('Error loading conversation:', error);
            return [];
        }
    }

    /**
     * Gets all existing conversations
     * @returns {Array} - List of conversations
     */
    getAllConversations() {
        try {
            const conversations = [];

            // List all JSON files in the directory
            const files = fs.readdirSync(this.historyDir)
                .filter(file => file.endsWith('.json'))
                .sort((a, b) => {
                    // Sort by date descending
                    const statA = fs.statSync(path.join(this.historyDir, a));
                    const statB = fs.statSync(path.join(this.historyDir, b));
                    return statB.mtime.getTime() - statA.mtime.getTime();
                });

            for (const file of files) {
                const filePath = path.join(this.historyDir, file);
                const data     = JSON.parse(fs.readFileSync(filePath, 'utf8'));

                // Find first user message (for title)
                const firstUserMessage = data.messages.find(msg => msg.role === 'user');

                conversations.push({
                    id          : data.id,
                    title       : this.generateConversationTitle(firstUserMessage?.content),
                    lastUpdated : data.lastUpdated,
                    messageCount: data.messages.length
                });
            }

            return conversations;
        } catch (error) {
            console.error('Error getting conversations:', error);
            return [];
        }
    }

    /**
     * Generates a title for the conversation based on first message
     * @param {string} firstMessage - First message of the conversation
     * @returns {string} - Generated title
     */
    generateConversationTitle(firstMessage) {
        if (!firstMessage) return 'New Conversation';

        return truncate(firstMessage, 30, true);
    }

    /**
     * Deletes a conversation
     * @param {string} conversationId - ID of the conversation to delete
     * @returns {boolean} - Success status
     */
    deleteConversation(conversationId) {
        try {
            const filePath = path.join(this.historyDir, `${conversationId}.json`);

            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);

                // If current conversation was deleted, start a new one
                if (this.currentSessionId === conversationId) {
                    this.startNewConversation();
                }

                return true;
            }

            return false;
        } catch (error) {
            console.error('Error deleting conversation:', error);
            return false;
        }
    }

    /**
     * Deletes all conversations
     * @returns {boolean} - Success status
     */
    deleteAllConversations() {
        try {
            const files = fs.readdirSync(this.historyDir)
                .filter(file => file.endsWith('.json'));

            for (const file of files) {
                fs.unlinkSync(path.join(this.historyDir, file));
            }

            // Start new conversation
            this.startNewConversation();

            return true;
        } catch (error) {
            console.error('Error deleting all conversations:', error);
            return false;
        }
    }

    /**
     * Cleans up old conversations if maximum is exceeded
     */
    cleanupOldConversations() {
        try {
            const files = fs.readdirSync(this.historyDir)
                .filter(file => file.endsWith('.json'))
                .map(file => {
                    const filePath = path.join(this.historyDir, file);
                    const stat     = fs.statSync(filePath);
                    return {file, mtime: stat.mtime.getTime()};
                })
                .sort((a, b) => b.mtime - a.mtime); // Newest first

            // Remove older conversations if maximum is exceeded
            if (files.length > this.maxConversations) {
                const toDelete = files.slice(this.maxConversations);

                for (const item of toDelete) {
                    fs.unlinkSync(path.join(this.historyDir, item.file));
                }
            }
        } catch (error) {
            console.error('Error cleaning up old conversations:', error);
        }
    }

    /**
     * Gets the current chat history
     * @returns {Array} - Current chat history
     */
    getCurrentHistory() {
        return this.currentHistory;
    }

    /**
     * Formats the chat history for the LLM API, optionally without the last user request
     * @param {string|null} systemPrompt - Optional system prompt
     * @param {boolean} excludeLastUserMessage - Whether to exclude the last user request
     * @returns {Array} - Chat history in LLM API format
     */
    getFormattedHistoryForLLM(systemPrompt = null, excludeLastUserMessage = false) {
        const formattedHistory = [];

        // Add system prompt if provided
        if (systemPrompt) {
            formattedHistory.push({role: 'system', content: systemPrompt});
        }

        // Create copy of current history
        const historyToFormat = [...this.currentHistory];

        // Remove last user request if desired
        if (excludeLastUserMessage && historyToFormat.length > 0) {
            // Find index of last user message
            let lastUserMessageIndex = -1;
            for (let i = historyToFormat.length - 1; i >= 0; i--) {
                if (historyToFormat[i].role === 'user') {
                    lastUserMessageIndex = i;
                    break;
                }
            }

            // Remove last user message if found
            if (lastUserMessageIndex !== -1) {
                historyToFormat.splice(lastUserMessageIndex, 1);
            }
        }

        // Add chat history (without system prompt if already added)
        historyToFormat.forEach(message => {
            if (message.role !== 'system' || !systemPrompt) {
                formattedHistory.push({
                    role   : message.role,
                    content: message.content
                });
            }
        });

        return formattedHistory;
    }
}