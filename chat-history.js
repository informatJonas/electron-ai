// chat-history.js - Modul für die Verwaltung der Chat-Historie
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

class ChatHistoryManager {
    constructor(config) {
        // Verzeichnis für die Speicherung der Chat-Historie
        this.historyDir = path.join(app.getPath('userData'), 'chat_history');

        // Maximale Anzahl der zu speichernden Nachrichten pro Konversation
        this.maxMessagesPerConversation = config.maxHistoryMessages || 20;

        // Maximale Anzahl zu speichernder Konversationen
        this.maxConversations = config.maxConversations || 10;

        // Aktueller Verlauf im Speicher
        this.currentSessionId = null;
        this.currentHistory = [];

        // Initialisierung
        this.initialize();
    }

    /**
     * Initialisiert das Verzeichnis für die Chat-Historie
     */
    initialize() {
        try {
            if (!fs.existsSync(this.historyDir)) {
                fs.mkdirSync(this.historyDir, { recursive: true });
            }

            // Aufräumen - alte Konversationen entfernen, wenn die maximale Anzahl überschritten wird
            this.cleanupOldConversations();

            // Neue Konversation starten
            this.startNewConversation();
        } catch (error) {
            console.error('Fehler bei der Initialisierung der Chat-Historie:', error);
        }
    }

    /**
     * Startet eine neue Konversation
     * @returns {string} - ID der neuen Konversation
     */
    startNewConversation() {
        this.currentSessionId = `conversation_${Date.now()}`;
        this.currentHistory = [];
        return this.currentSessionId;
    }

    /**
     * Fügt eine Nachricht zur Historie hinzu
     * @param {string} role - Rolle des Absenders ('user' oder 'assistant')
     * @param {string} content - Inhalt der Nachricht
     */
    addMessage(role, content) {
        // Füge die Nachricht zum aktuellen Verlauf hinzu
        const message = { role, content, timestamp: Date.now() };
        this.currentHistory.push(message);

        // Begrenze die Anzahl der Nachrichten
        if (this.currentHistory.length > this.maxMessagesPerConversation) {
            // Behalte den System-Prompt (falls vorhanden) und entferne die ältesten Nachrichten
            const systemPrompt = this.currentHistory.find(msg => msg.role === 'system');
            this.currentHistory = this.currentHistory.slice(-this.maxMessagesPerConversation);

            // Stelle sicher, dass der System-Prompt erhalten bleibt
            if (systemPrompt && !this.currentHistory.some(msg => msg.role === 'system')) {
                this.currentHistory.unshift(systemPrompt);
            }
        }

        // Speichere den aktualisierten Verlauf
        this.saveCurrentHistory();

        return message;
    }

    /**
     * Speichert den aktuellen Chatverlauf
     */
    saveCurrentHistory() {
        try {
            const filePath = path.join(this.historyDir, `${this.currentSessionId}.json`);
            fs.writeFileSync(filePath, JSON.stringify({
                id: this.currentSessionId,
                lastUpdated: Date.now(),
                messages: this.currentHistory
            }, null, 2));
        } catch (error) {
            console.error('Fehler beim Speichern der Chat-Historie:', error);
        }
    }

    /**
     * Lädt eine bestimmte Konversation
     * @param {string} conversationId - ID der zu ladenden Konversation
     * @returns {Array} - Nachrichten der Konversation
     */
    loadConversation(conversationId) {
        try {
            const filePath = path.join(this.historyDir, `${conversationId}.json`);

            if (fs.existsSync(filePath)) {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                this.currentSessionId = conversationId;
                this.currentHistory = data.messages || [];
                return this.currentHistory;
            }

            return [];
        } catch (error) {
            console.error('Fehler beim Laden der Konversation:', error);
            return [];
        }
    }

    /**
     * Gibt alle vorhandenen Konversationen zurück
     * @returns {Array} - Liste der Konversationen
     */
    getAllConversations() {
        try {
            const conversations = [];

            // Alle JSON-Dateien im Verzeichnis auflisten
            const files = fs.readdirSync(this.historyDir)
                .filter(file => file.endsWith('.json'))
                .sort((a, b) => {
                    // Nach Datum absteigend sortieren
                    const statA = fs.statSync(path.join(this.historyDir, a));
                    const statB = fs.statSync(path.join(this.historyDir, b));
                    return statB.mtime.getTime() - statA.mtime.getTime();
                });

            for (const file of files) {
                const filePath = path.join(this.historyDir, file);
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

                // Erste Nachricht des Benutzers finden (für Titel)
                const firstUserMessage = data.messages.find(msg => msg.role === 'user');

                conversations.push({
                    id: data.id,
                    title: this.generateConversationTitle(firstUserMessage?.content),
                    lastUpdated: data.lastUpdated,
                    messageCount: data.messages.length
                });
            }

            return conversations;
        } catch (error) {
            console.error('Fehler beim Abrufen der Konversationen:', error);
            return [];
        }
    }

    /**
     * Generiert einen Titel für die Konversation basierend auf der ersten Nachricht
     * @param {string} firstMessage - Erste Nachricht der Konversation
     * @returns {string} - Generierter Titel
     */
    generateConversationTitle(firstMessage) {
        if (!firstMessage) return 'Neue Konversation';

        // Begrenzen auf die ersten 30 Zeichen
        const truncated = firstMessage.length > 30
            ? firstMessage.substring(0, 30) + '...'
            : firstMessage;

        return truncated;
    }

    /**
     * Löscht eine Konversation
     * @param {string} conversationId - ID der zu löschenden Konversation
     * @returns {boolean} - Erfolgsstatus
     */
    deleteConversation(conversationId) {
        try {
            const filePath = path.join(this.historyDir, `${conversationId}.json`);

            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);

                // Wenn die aktuelle Konversation gelöscht wurde, eine neue starten
                if (this.currentSessionId === conversationId) {
                    this.startNewConversation();
                }

                return true;
            }

            return false;
        } catch (error) {
            console.error('Fehler beim Löschen der Konversation:', error);
            return false;
        }
    }

    /**
     * Löscht alle Konversationen
     * @returns {boolean} - Erfolgsstatus
     */
    deleteAllConversations() {
        try {
            const files = fs.readdirSync(this.historyDir)
                .filter(file => file.endsWith('.json'));

            for (const file of files) {
                fs.unlinkSync(path.join(this.historyDir, file));
            }

            // Neue Konversation starten
            this.startNewConversation();

            return true;
        } catch (error) {
            console.error('Fehler beim Löschen aller Konversationen:', error);
            return false;
        }
    }

    /**
     * Bereinigt alte Konversationen, wenn die maximale Anzahl überschritten wird
     */
    cleanupOldConversations() {
        try {
            const files = fs.readdirSync(this.historyDir)
                .filter(file => file.endsWith('.json'))
                .map(file => {
                    const filePath = path.join(this.historyDir, file);
                    const stat = fs.statSync(filePath);
                    return { file, mtime: stat.mtime.getTime() };
                })
                .sort((a, b) => b.mtime - a.mtime); // Neueste zuerst

            // Entferne ältere Konversationen, wenn die maximale Anzahl überschritten wird
            if (files.length > this.maxConversations) {
                const toDelete = files.slice(this.maxConversations);

                for (const item of toDelete) {
                    fs.unlinkSync(path.join(this.historyDir, item.file));
                }
            }
        } catch (error) {
            console.error('Fehler bei der Bereinigung alter Konversationen:', error);
        }
    }

    /**
     * Gibt die aktuelle Chat-Historie zurück
     * @returns {Array} - Aktuelle Chat-Historie
     */
    getCurrentHistory() {
        return this.currentHistory;
    }

    /**
     * Formatiert die Chat-Historie für die LLM-API, optional ohne die letzte Benutzeranfrage
     * @param {null|String} systemPrompt - Optionaler System-Prompt
     * @param {boolean} excludeLastUserMessage - Gibt an, ob die letzte Benutzeranfrage ausgeschlossen werden soll
     * @returns {Array} - Chat-Historie im LLM-API-Format
     */
    getFormattedHistoryForLLM(systemPrompt = null, excludeLastUserMessage = false) {
        const formattedHistory = [];

        // Füge den System-Prompt hinzu, wenn vorhanden
        if (systemPrompt) {
            formattedHistory.push({ role: 'system', content: systemPrompt });
        }

        // Kopie der aktuellen Historie erstellen
        const historyToFormat = [...this.currentHistory];

        // Letzte Benutzeranfrage entfernen, wenn gewünscht
        if (excludeLastUserMessage && historyToFormat.length > 0) {
            // Finde den Index der letzten Benutzeranfrage
            let lastUserMessageIndex = -1;
            for (let i = historyToFormat.length - 1; i >= 0; i--) {
                if (historyToFormat[i].role === 'user') {
                    lastUserMessageIndex = i;
                    break;
                }
            }

            // Entferne die letzte Benutzeranfrage, wenn gefunden
            if (lastUserMessageIndex !== -1) {
                historyToFormat.splice(lastUserMessageIndex, 1);
            }
        }

        // Füge die Chat-Historie hinzu (ohne System-Prompt, falls bereits vorhanden)
        historyToFormat.forEach(message => {
            if (message.role !== 'system' || !systemPrompt) {
                formattedHistory.push({
                    role: message.role,
                    content: message.content
                });
            }
        });

        return formattedHistory;
    }
}

module.exports = ChatHistoryManager;