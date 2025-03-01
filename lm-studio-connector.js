const axios = require('axios');

/**
 * Prüft, ob LM Studio API erreichbar ist
 * @param {string} baseUrl - Basis-URL des LM Studio API-Servers (z.B. http://localhost:1234/)
 * @returns {Promise<boolean>} - true, wenn erreichbar, sonst false
 */
async function checkLMStudioStatus(baseUrl) {
    console.log('Starte LM Studio Status-Prüfung für URL:', baseUrl);

    try {
        let url = baseUrl;
        if (url.includes('localhost')) {
            url = url.replace('localhost', '127.0.0.1');
        }

        url = `${url.endsWith('/') ? url.slice(0, -1) : url}/v1/models`;

        console.log('Geprüfte URL:', url);

        const response = await axios.get(url, {
            timeout: 5000,
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        });

        console.log('Antwort-Status:', response.status);
        return response.status === 200;

    } catch (error) {
        console.error('Fehler bei LM Studio-Verbindung:', error.message);

        // Detaillierte Fehler-Logging
        if (error.response) {
            console.log('Antwort-Status:', error.response.status);
            console.log('Antwort-Daten:', error.response.data);
        } else if (error.request) {
            console.log('Keine Antwort erhalten');
        } else {
            console.log('Anfrage-Fehler:', error.message);
        }

        return false;
    }
}

/**
 * Ruft verfügbare Modelle von LM Studio ab
 * @param {string} baseUrl - Basis-URL des LM Studio API-Servers
 * @returns {Promise<Array>} - Array mit verfügbaren Modellen
 */
async function getAvailableModels(baseUrl) {
    try {
        // IPv4-Adresse explizit verwenden
        let url = baseUrl;
        if (url.includes('localhost')) {
            url = url.replace('localhost', '127.0.0.1');
        }

        // Stelle sicher, dass die Basis-URL richtig formatiert ist
        url = `${url.endsWith('/') ? url.slice(0, -1) : url}/v1/models`;

        // Modelle abfragen
        const response = await axios.get(url, {
            timeout: 5000
        });

        if (response.status === 200 && response.data && response.data.data) {
            return response.data.data;
        }

        return [];
    } catch (error) {
        console.error('Fehler beim Abrufen der Modelle:', error.message);
        return [];
    }
}

/**
 * Sendet eine Anfrage an LM Studio
 * @param {string} baseUrl - Basis-URL des LM Studio API-Servers
 * @param {string} endpoint - API-Endpunkt (z.B. "v1/chat/completions")
 * @param {Object} data - Zu sendende Daten
 * @returns {Promise<Object>} - Antwort von LM Studio
 */
async function sendRequest(baseUrl, endpoint, data) {
    try {
        // IPv4-Adresse explizit verwenden
        let url = baseUrl;
        if (url.includes('localhost')) {
            url = url.replace('localhost', '127.0.0.1');
        }

        // Stelle sicher, dass die Basis-URL und der Endpunkt richtig formatiert sind
        url = `${url.endsWith('/') ? url.slice(0, -1) : url}/${endpoint.startsWith('/') ? endpoint.substring(1) : endpoint}`;

        const response = await axios.post(url, data, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000 // 30 Sekunden Timeout
        });

        return response.data;
    } catch (error) {
        console.error(`Fehler bei Anfrage an ${endpoint}:`, error.message);
        throw error;
    }
}

module.exports = {
    checkLMStudioStatus,
    getAvailableModels,
    sendRequest
};