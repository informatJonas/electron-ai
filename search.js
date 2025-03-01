// search.js - Modul für Websuche-Funktionalität
const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Führt eine DuckDuckGo-Suche durch und gibt die Ergebnisse zurück
 * @param {string} query - Suchanfrage
 * @param {number} maxResults - Maximale Anzahl an Ergebnissen
 * @param {number} timeout - Timeout für die Anfrage in ms
 * @returns {Promise<Array>} - Array mit Suchergebnissen
 */
async function duckDuckGoSearch(query, maxResults = 3, timeout = 5000) {
    try {
        // DuckDuckGo verwendet keine offizielle API, daher nutzen wir den HTML-Endpunkt
        const response = await axios.get('https://html.duckduckgo.com/html/', {
            params: { q: query },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: timeout
        });

        const $ = cheerio.load(response.data);
        const results = [];

        // Extrahiere die Suchergebnisse
        $('.result').slice(0, maxResults).each((i, element) => {
            const titleElement = $(element).find('.result__title a');
            const title = titleElement.text().trim();
            const url = titleElement.attr('href');
            const description = $(element).find('.result__snippet').text().trim();

            if (title && url) {
                results.push({
                    title,
                    url,
                    description
                });
            }
        });

        // Wenn keine Ergebnisse gefunden wurden, versuche eine alternative Methode
        if (results.length === 0) {
            return fallbackSearch(query, maxResults, timeout);
        }

        return results;
    } catch (error) {
        console.error('Fehler bei der DuckDuckGo-Suche:', error.message);
        return fallbackSearch(query, maxResults, timeout);
    }
}

/**
 * Fallback-Suchmethode mit Google Suche
 * @param {string} query - Suchanfrage
 * @param {number} maxResults - Maximale Anzahl an Ergebnissen
 * @param {number} timeout - Timeout für die Anfrage in ms
 * @returns {Promise<Array>} - Array mit Suchergebnissen
 */
async function fallbackSearch(query, maxResults = 3, timeout = 5000) {
    try {
        // Verwende Google als Fallback (kann aufgrund von Rate-Limiting unzuverlässig sein)
        const response = await axios.get('https://www.google.com/search', {
            params: { q: query },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: timeout
        });

        const $ = cheerio.load(response.data);
        const results = [];

        // Google-spezifische Selektoren (können sich ändern)
        $('div.g').slice(0, maxResults).each((i, element) => {
            const titleElement = $(element).find('h3');
            const title = titleElement.text().trim();
            const urlElement = $(element).find('a');
            const url = urlElement.attr('href');
            const descriptionElement = $(element).find('div.VwiC3b');
            const description = descriptionElement.text().trim();

            if (title && url && url.startsWith('http')) {
                results.push({
                    title,
                    url,
                    description
                });
            }
        });

        return results;
    } catch (error) {
        console.error('Fehler bei der Fallback-Suche:', error.message);

        // Wenn alles fehlschlägt, gib statische Mock-Ergebnisse zurück
        return [
            {
                title: 'Keine Suchergebnisse verfügbar',
                url: 'https://example.com',
                description: 'Die Websuche ist derzeit nicht verfügbar. Bitte versuche es später erneut oder stelle sicher, dass du mit dem Internet verbunden bist.'
            }
        ];
    }
}

/**
 * Lädt den Inhalt einer Webseite und extrahiert den Haupttext
 * @param {string} url - URL der Webseite
 * @param {number} timeout - Timeout für die Anfrage in ms
 * @returns {Promise<string>} - Extrahierter Text
 */
async function fetchWebContent(url, timeout = 5000) {
    try {
        const response = await axios.get(url, {
            timeout: timeout,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const $ = cheerio.load(response.data);

        // Entferne unerwünschte Elemente
        $('script, style, nav, footer, header, aside, [role="complementary"]').remove();

        // Versuche, den Hauptinhalt zu finden
        let mainContent = $('main, article, .content, .post, .article');

        if (mainContent.length === 0) {
            // Fallback: Verwende den Body
            mainContent = $('body');
        }

        // Extrahiere den Text
        const text = mainContent.text()
            .replace(/\s+/g, ' ')
            .trim();

        return text.substring(0, 2000); // Limitiere auf 2000 Zeichen
    } catch (error) {
        console.error('Fehler beim Abrufen von Webinhalten:', error.message);
        return '';
    }
}

// Exportiere die Funktionen
module.exports = {
    duckDuckGoSearch,
    fetchWebContent
};