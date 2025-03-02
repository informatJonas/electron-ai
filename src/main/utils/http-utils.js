// src/main/utils/http-utils.js
// Network request utilities - ES Module Version

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { ensureDirectoryExists } from './file-utils.js';

// Constants
export const DEFAULT_TIMEOUT = 10000;
export const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

export async function sendRequest(url, method = 'GET', data = null, options = {}) {
    try {
        let normalizedUrl = url.replace('localhost', '127.0.0.1');

        const requestOptions = {
            method,
            url: normalizedUrl,
            timeout: options.timeout || DEFAULT_TIMEOUT,
            headers: {
                'User-Agent': DEFAULT_USER_AGENT,
                ...options.headers
            }
        };

        if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            requestOptions.data = data;
        }

        if (options.params) {
            requestOptions.params = options.params;
        }

        if (options.signal) {
            requestOptions.signal = options.signal;
        }

        const response = await axios(requestOptions);
        return response.data;
    } catch (error) {
        throw handleApiError(error);
    }
}

export function handleApiError(error) {
    const standardError = new Error();

    if (error.response) {
        standardError.message = `API error: ${error.response.status} ${error.response.statusText}`;
        standardError.statusCode = error.response.status;
        standardError.data = error.response.data;
    } else if (error.request) {
        if (error.code === 'ECONNABORTED') {
            standardError.message = `Request timeout: ${error.config.url}`;
            standardError.isTimeout = true;
        } else {
            standardError.message = `No response received: ${error.message}`;
            standardError.isNetworkError = true;
        }
    } else {
        standardError.message = `Request configuration error: ${error.message}`;
    }

    standardError.originalError = error;

    console.error('HTTP Request Error:', {
        message: standardError.message,
        url: error.config?.url,
        method: error.config?.method,
        status: error.response?.status
    });

    return standardError;
}

export function createApiClient(baseUrl, defaultOptions = {}) {
    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

    return {
        get: (endpoint, options = {}) =>
            sendRequest(`${normalizedBaseUrl}${endpoint}`, 'GET', null, { ...defaultOptions, ...options }),

        post: (endpoint, data, options = {}) =>
            sendRequest(`${normalizedBaseUrl}${endpoint}`, 'POST', data, { ...defaultOptions, ...options }),

        put: (endpoint, data, options = {}) =>
            sendRequest(`${normalizedBaseUrl}${endpoint}`, 'PUT', data, { ...defaultOptions, ...options }),

        delete: (endpoint, options = {}) =>
            sendRequest(`${normalizedBaseUrl}${endpoint}`, 'DELETE', null, { ...defaultOptions, ...options })
    };
}

export async function downloadFile(url, outputPath, progressCallback = null) {
    try {
        ensureDirectoryExists(path.dirname(outputPath));
        const writer = fs.createWriteStream(outputPath);

        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            headers: {
                'User-Agent': DEFAULT_USER_AGENT
            },
            onDownloadProgress: progressCallback
        });

        const totalLength = response.headers['content-length'];

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

        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(outputPath));
            writer.on('error', reject);
        });
    } catch (error) {
        console.error('Error downloading file:', error);
        throw error;
    }
}
