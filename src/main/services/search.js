// src/main/services/search.js
// Module for web search functionality

const { sendRequest } = require('../utils/http-utils');
const cheerio = require('cheerio');

/**
 * Performs a DuckDuckGo search and returns the results
 * @param {string} query - Search query
 * @param {number} maxResults - Maximum number of results
 * @param {number} timeout - Timeout for the request in ms
 * @returns {Promise<Array>} - Array of search results
 */
async function duckDuckGoSearch(query, maxResults = 3, timeout = 5000) {
    try {
        // DuckDuckGo uses no official API, so we use the HTML endpoint
        const response = await sendRequest(
            'https://html.duckduckgo.com/html/',
            'GET',
            null,
            {
                params: { q: query },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                },
                timeout: timeout
            }
        );

        // Parse HTML
        const $ = cheerio.load(response);
        const results = [];

        // Extract search results
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

        // If no results found, try fallback
        if (results.length === 0) {
            return fallbackSearch(query, maxResults, timeout);
        }

        return results;
    } catch (error) {
        console.error('Error in DuckDuckGo search:', error.message);
        return fallbackSearch(query, maxResults, timeout);
    }
}

/**
 * Fallback search method using Google Search
 * @param {string} query - Search query
 * @param {number} maxResults - Maximum number of results
 * @param {number} timeout - Timeout for the request in ms
 * @returns {Promise<Array>} - Array of search results
 */
async function fallbackSearch(query, maxResults = 3, timeout = 5000) {
    try {
        // Use Google as fallback (can be unreliable due to rate limiting)
        const response = await sendRequest(
            'https://www.google.com/search',
            'GET',
            null,
            {
                params: { q: query },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                },
                timeout: timeout
            }
        );

        // Parse HTML
        const $ = cheerio.load(response);
        const results = [];

        // Google-specific selectors (may change)
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
        console.error('Error in fallback search:', error.message);

        // If all fails, return static mock results
        return [
            {
                title: 'No search results available',
                url: 'https://example.com',
                description: 'Web search is currently unavailable. Please try again later or ensure you are connected to the internet.'
            }
        ];
    }
}

/**
 * Loads the content of a webpage and extracts the main text
 * @param {string} url - URL of the webpage
 * @param {number} timeout - Timeout for the request in ms
 * @returns {Promise<object>} - Object with extracted text
 */
async function fetchWebContent(url, timeout = 5000) {
    try {
        const response = await sendRequest(
            url,
            'GET',
            null,
            {
                timeout: timeout,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            }
        );

        // Parse HTML
        const $ = cheerio.load(response);

        // Remove unwanted elements
        $('script, style, nav, footer, header, aside, [role="complementary"]').remove();

        // Try to find main content
        let mainContent = $('main, article, .content, .post, .article');

        if (mainContent.length === 0) {
            // Fallback: Use body
            mainContent = $('body');
        }

        // Extract text
        const text = mainContent.text()
            .replace(/\s+/g, ' ')
            .trim();

        return {
            mainContent: text.substring(0, 2000) // Limit to 2000 characters
        };
    } catch (error) {
        console.error('Error fetching web content:', error.message);
        return {
            mainContent: ''
        };
    }
}

module.exports = {
    duckDuckGoSearch,
    fetchWebContent
};