// src/main/llm/lm-studio-connector.js
// Module for LM Studio API integration - ES Module Version

import { createApiClient } from '../utils/http-utils.js';

/**
 * Checks if LM Studio API is reachable
 * @param {string} baseUrl - Base URL of the LM Studio API server (e.g. http://localhost:1234/)
 * @returns {Promise<boolean>} - true if reachable, false otherwise
 */
export async function checkLMStudioStatus(baseUrl) {
    console.log('Starting LM Studio status check for URL:', baseUrl);

    try {
        let url = baseUrl;
        if (url.includes('localhost')) {
            url = url.replace('localhost', '127.0.0.1');
        }

        const api = createApiClient(url);
        const modelsEndpoint = 'v1/models';
        console.log('Checking URL:', `${url}${modelsEndpoint}`);

        const response = await api.get(modelsEndpoint, {
            timeout: 5000,
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        });

        console.log('Response status:', response ? 'OK' : 'Failed');
        return !!response;
    } catch (error) {
        console.error('Error connecting to LM Studio:', error.message);
        if (error.response) {
            console.log('Response status:', error.response.status);
            console.log('Response data:', error.response.data);
        } else if (error.request) {
            console.log('No response received');
        } else {
            console.log('Request error:', error.message);
        }
        return false;
    }
}

/**
 * Gets available models from LM Studio
 * @param {string} baseUrl - Base URL of the LM Studio API server
 * @returns {Promise<Array>} - Array of available models
 */
export async function getAvailableModels(baseUrl) {
    try {
        let url = baseUrl;
        if (url.includes('localhost')) {
            url = url.replace('localhost', '127.0.0.1');
        }

        const api = createApiClient(url);
        const response = await api.get('v1/models', {
            timeout: 5000
        });

        return response?.data || [];
    } catch (error) {
        console.error('Error getting models:', error.message);
        return [];
    }
}

/**
 * Sends a request to LM Studio
 * @param {string} baseUrl - Base URL of the LM Studio API server
 * @param {string} endpoint - API endpoint (e.g. "v1/chat/completions")
 * @param {Object} data - Data to send
 * @returns {Promise<Object>} - Response from LM Studio
 */
export async function sendRequest(baseUrl, endpoint, data) {
    try {
        let url = baseUrl;
        if (url.includes('localhost')) {
            url = url.replace('localhost', '127.0.0.1');
        }

        const api = createApiClient(url);
        const response = await api.post(endpoint, data, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        return response;
    } catch (error) {
        console.error(`Error in request to ${endpoint}:`, error.message);
        throw error;
    }
}

/**
 * Creates a streaming chat completion
 * @param {string} baseUrl - Base URL of the LM Studio API server
 * @param {Array} messages - Chat messages
 * @param {Object} options - Generation options
 * @param {AbortSignal} signal - Abort signal
 * @returns {Promise<ReadableStream>} - Stream of responses
 */
export async function createChatCompletionStream(baseUrl, messages, options = {}, signal = null) {
    try {
        let url = baseUrl;
        if (url.includes('localhost')) {
            url = url.replace('localhost', '127.0.0.1');
        }

        url = `${url.endsWith('/') ? url.slice(0, -1) : url}/v1/chat/completions`;

        const requestOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: options.model || 'local-model',
                messages,
                temperature: options.temperature || 0.7,
                stream: true,
                ...options
            }),
            signal
        };

        const response = await fetch(url, requestOptions);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return response.body;
    } catch (error) {
        console.error('Error creating chat completion stream:', error);
        throw error;
    }
}
