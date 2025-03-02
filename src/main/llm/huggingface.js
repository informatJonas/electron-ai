// src/main/llm/huggingface.js
// Module for Hugging Face API integration

const { sendRequest } = require('../utils/http-utils');
const { formatFileSize } = require('../utils/file-utils');

// Hugging Face API URL
const HF_API_URL = 'https://huggingface.co/api';

/**
 * Searches for models on Hugging Face
 * @param {string} query - Search query
 * @param {number} limit - Maximum number of results
 * @returns {Promise<Array>} - List of found models
 */
async function searchModels(query, limit = 20) {
    try {
        console.log(`Searching for models matching "${query}"...`);

        // Hugging Face API request
        const response = await sendRequest(
            `${HF_API_URL}/models`,
            'GET',
            null,
            {
                params: {
                    search: query,
                    limit: limit,
                    filter: 'quantized',  // Filter for quantized models (for GGUF)
                    sort: 'downloads',
                    direction: -1
                }
            }
        );

        if (!response || !Array.isArray(response)) {
            console.error('Invalid response format from Hugging Face API');
            return [];
        }

        // Filter for GGUF models (by checking tags and description)
        let models = response.filter(model => {
            const hasGGUFTag = model.tags && (
                model.tags.includes('gguf') ||
                model.tags.includes('llama.cpp') ||
                model.tags.includes('quantized')
            );

            const descriptionMentionsGGUF = model.description && (
                model.description.toLowerCase().includes('gguf') ||
                model.description.toLowerCase().includes('llama.cpp') ||
                model.description.toLowerCase().includes('quantized')
            );

            return hasGGUFTag || descriptionMentionsGGUF;
        });

        // Get additional model details
        const modelDetails = await Promise.all(
            models.map(async (model) => {
                try {
                    // Get model details for file list
                    const details = await getModelDetails(model.id);
                    return {
                        ...model,
                        files: details.files || [],
                        downloadCount: details.downloads || 0
                    };
                } catch (error) {
                    console.error(`Error getting details for ${model.id}:`, error);
                    return {
                        ...model,
                        files: [],
                        downloadCount: 0
                    };
                }
            })
        );

        // Filter for models with GGUF files
        const modelsWithGGUF = modelDetails.filter(model => {
            return model.files && model.files.some(file =>
                file.path && file.path.toLowerCase().endsWith('.gguf')
            );
        });

        // Format model list
        return modelsWithGGUF.map(model => ({
            id: model.id,
            name: model.modelId || model.id.split('/').pop(),
            author: model.id.split('/')[0],
            description: model.description || 'No description available',
            lastModified: model.lastModified || null,
            downloads: model.downloadCount || 0,
            files: model.files
                .filter(file => file.path && file.path.toLowerCase().endsWith('.gguf'))
                .map(file => ({
                    name: file.path,
                    size: file.size,
                    sizeFormatted: formatFileSize(file.size),
                    url: `https://huggingface.co/${model.id}/resolve/main/${file.path}`
                }))
        }));
    } catch (error) {
        console.error('Error in Hugging Face API request:', error);
        return [];
    }
}

/**
 * Gets details for a specific model
 * @param {string} modelId - ID of the model (e.g. "TheBloke/Llama-2-7B-Chat-GGUF")
 * @returns {Promise<Object>} - Detailed information about the model
 */
async function getModelDetails(modelId) {
    try {
        // Get model metadata
        const modelData = await sendRequest(`${HF_API_URL}/models/${modelId}`, 'GET');

        // Get file list
        const filesResponse = await sendRequest(`${HF_API_URL}/models/${modelId}/tree/main`, 'GET');

        return {
            ...modelData,
            files: filesResponse || []
        };
    } catch (error) {
        console.error(`Error getting model information for ${modelId}:`, error);
        return {};
    }
}

module.exports = {
    searchModels,
    getModelDetails
};