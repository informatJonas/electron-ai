// src/renderer/js/utils/api-utils.js
// Vereinfachte API-Utilities ohne Promises

// Fester Port für Express-Server
const SERVER_PORT = 50000;  // Hardcoded basierend auf deiner Konsolenausgabe

/**
 * Bestimmt die Basis-URL für API-Anfragen
 * @returns {string} Die Basis-URL für API-Anfragen
 */
function getApiBaseUrl() {
    // Bei File-Protokoll: Absolute URL mit Port
    if (window.location.protocol === 'file:') {
        return `http://localhost:${SERVER_PORT}`;
    }
    // Bei HTTP-Protokoll: Relative URL
    return '';
}

/**
 * Führt eine API-Anfrage durch
 * @param {string} endpoint - API-Endpunkt (z.B. '/api/chat')
 * @param {Object} options - Fetch-Optionen
 * @returns {Promise<Response>} - Fetch-Response
 */
async function fetchApi(endpoint, options = {}) {
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}${endpoint}`;

    console.log(`Fetching API: ${url}`);

    try {
        return await fetch(url, options);
    } catch (error) {
        console.error(`Error fetching ${url}:`, error);
        throw error;
    }
}

// Exportieren der API-Funktionen
window.apiUtils = {
    getApiBaseUrl,
    fetchApi
};

console.log('Simple API Utils loaded with fixed port:', SERVER_PORT);