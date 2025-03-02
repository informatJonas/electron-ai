// src/main/utils/http-utils.js
// Network request utilities

const axios = require('axios');

/**
 * Default request timeout in milliseconds
 */
const DEFAULT_TIMEOUT = 10000;

/**
 * Default user agent string for HTTP requests
 */
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

/**
 * Sends an HTTP request with standardized error handling
 * @param {string} url - Request URL
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {Object|null} data - Request body for POST, PUT etc.
 * @param {Object} options - Additional options (headers, timeout, etc.)
 * @returns {Promise<Object>} - Response data
 */
async function sendRequest(url, method = 'GET', data = null, options = {}) {
    try {
        // Normalize URL (replace localhost with 127.0.0.1 for better reliability)
        let normalizedUrl = url;
        if (url.includes('localhost')) {
            normalizedUrl = url.replace('localhost', '127.0.0.1');
        }

        // Default options
        const requestOptions = {
            method,
            url: normalizedUrl,
            timeout: options.timeout || DEFAULT_TIMEOUT,
            headers: {
                'User-Agent': DEFAULT_USER_AGENT,
                ...options.headers
            }
        };

        // Add request data if provided
        if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            requestOptions.data = data;
        }

        // Add query parameters if provided
        if (options.params) {
            requestOptions.params = options.params;
        }

        // Add signal if provided
        if (options.signal) {
            requestOptions.signal = options.signal;
        }

        // Send request
        const response = await axios(requestOptions);

        return response.data;
    } catch (error) {
        throw handleApiError(error);
    }
}

/**
 * Standardizes error handling for HTTP requests
 * @param {Error} error - Original error object
 * @returns {Error} - Standardized error
 */
function handleApiError(error) {
    // Create a standardized error object with useful details
    const standardError = new Error();

    if (error.response) {
        // Server responded with non-2xx status
        standardError.message = `API error: ${error.response.status} ${error.response.statusText}`;
        standardError.statusCode = error.response.status;
        standardError.data = error.response.data;
    } else if (error.request) {
        // Request was made but no response received
        if (error.code === 'ECONNABORTED') {
            standardError.message = `Request timeout: ${error.config.url}`;
            standardError.isTimeout = true;
        } else {
            standardError.message = `No response received: ${error.message}`;
            standardError.isNetworkError = true;
        }
    } else {
        // Error in setting up the request
        standardError.message = `Request configuration error: ${error.message}`;
    }

    // Add original error for debugging
    standardError.originalError = error;

    // Log the error details
    console.error('HTTP Request Error:', {
        message: standardError.message,
        url: error.config?.url,
        method: error.config?.method,
        status: error.response?.status
    });

    return standardError;
}

/**
 * Creates API client with predefined base URL and common options
 * @param {string} baseUrl - Base URL for all requests
 * @param {Object} defaultOptions - Default options for all requests
 * @returns {Object} - API client with get, post, put, delete methods
 */
function createApiClient(baseUrl, defaultOptions = {}) {
    // Ensure baseUrl ends with a slash
    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

    return {
        /**
         * Send GET request
         * @param {string} endpoint - API endpoint (will be appended to baseUrl)
         * @param {Object} options - Request options
         * @returns {Promise<Object>} - Response data
         */
        get: (endpoint, options = {}) =>
            sendRequest(`${normalizedBaseUrl}${endpoint}`, 'GET', null, { ...defaultOptions, ...options }),

        /**
         * Send POST request
         * @param {string} endpoint - API endpoint
         * @param {Object} data - Request payload
         * @param {Object} options - Request options
         * @returns {Promise<Object>} - Response data
         */
        post: (endpoint, data, options = {}) =>
            sendRequest(`${normalizedBaseUrl}${endpoint}`, 'POST', data, { ...defaultOptions, ...options }),

        /**
         * Send PUT request
         * @param {string} endpoint - API endpoint
         * @param {Object} data - Request payload
         * @param {Object} options - Request options
         * @returns {Promise<Object>} - Response data
         */
        put: (endpoint, data, options = {}) =>
            sendRequest(`${normalizedBaseUrl}${endpoint}`, 'PUT', data, { ...defaultOptions, ...options }),

        /**
         * Send DELETE request
         * @param {string} endpoint - API endpoint
         * @param {Object} options - Request options
         * @returns {Promise<Object>} - Response data
         */
        delete: (endpoint, options = {}) =>
            sendRequest(`${normalizedBaseUrl}${endpoint}`, 'DELETE', null, { ...defaultOptions, ...options })
    };
}

/**
 * Downloads a file from a URL and saves it to the specified path
 * @param {string} url - URL of the file to download
 * @param {string} outputPath - Path where to save the file
 * @param {Function} progressCallback - Callback for download progress
 * @returns {Promise<string>} - Path of the downloaded file
 */
async function downloadFile(url, outputPath, progressCallback = null) {
    try {
        const axios = require('axios');
        const fs = require('fs');
        const { ensureDirectoryExists } = require('./file-utils');
        const path = require('path');

        // Ensure the directory exists
        ensureDirectoryExists(path.dirname(outputPath));

        // Create a write stream to save the file
        const writer = fs.createWriteStream(outputPath);

        // Download the file
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            headers: {
                'User-Agent': DEFAULT_USER_AGENT
            },
            onDownloadProgress: progressCallback
        });

        // Get total length for progress calculation
        const totalLength = response.headers['content-length'];

        // Setup progress callback if provided
        if (progressCallback && totalLength) {
            let downloaded = 0;

            response.data.on('data', (chunk) => {
                downloaded += chunk.length;
                progressCallback({
                    percent: downloaded / totalLength,
                    transferred: downloaded,
                    total: totalLength
                });
            });
        }

        // Pipe the response to the file
        response.data.pipe(writer);

        // Return a promise that resolves when the file is written
        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(outputPath));
            writer.on('error', reject);
        });
    } catch (error) {
        console.error('Error downloading file:', error);
        throw error;
    }
}

module.exports = {
    sendRequest,
    handleApiError,
    createApiClient,
    downloadFile,
    DEFAULT_TIMEOUT,
    DEFAULT_USER_AGENT
};