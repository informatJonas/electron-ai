// huggingface.js - Modul für die Hugging Face API-Integration
const axios = require('axios');

// Hugging Face API URL
const HF_API_URL = 'https://huggingface.co/api';

/**
 * Sucht nach Modellen auf Hugging Face
 * @param {string} query - Suchbegriff
 * @param {number} limit - Maximale Anzahl der Ergebnisse
 * @returns {Promise<Array>} - Liste der gefundenen Modelle
 */
async function searchModels(query, limit = 20) {
    try {
        console.log(`Suche nach Modellen für "${query}"...`);

        // Hugging Face API-Anfrage
        const response = await axios.get(`${HF_API_URL}/models`, {
            params: {
                search   : query,
                limit    : limit,
                filter   : 'quantized',  // Nach quantisierten Modellen filtern (für GGUF)
                sort     : 'downloads',
                direction: -1
            }
        });

        if (!response.data || !Array.isArray(response.data)) {
            console.error('Ungültiges Antwortformat von Hugging Face API');
            return [];
        }

        // Filtern nach GGUF-Modellen (durch Prüfung der Tags und Beschreibung)
        let models = response.data.filter(model => {
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

        // Weitere Modellinformationen abrufen
        const modelDetails = await Promise.all(
            models.map(async (model) => {
                try {
                    // Modelldetails für die Dateiliste abrufen
                    const details = await getModelDetails(model.id);
                    return {
                        ...model,
                        files        : details.files || [],
                        downloadCount: details.downloads || 0
                    };
                } catch (error) {
                    console.error(`Fehler beim Abrufen der Details für ${model.id}:`, error);
                    return {
                        ...model,
                        files        : [],
                        downloadCount: 0
                    };
                }
            })
        );

        // Nach GGUF-Dateien filtern und nur Modelle mit GGUF-Dateien behalten
        const modelsWithGGUF = modelDetails.filter(model => {
            console.log(model.files);

            return model.files && model.files.some(file =>
                file.path && file.path.toLowerCase().endsWith('.gguf')
            );
        });

        // Formatierte Modellliste zurückgeben
        return modelsWithGGUF.map(model => ({
            id          : model.id,
            name        : model.modelId || model.id.split('/').pop(),
            author      : model.id.split('/')[0],
            description : model.description || 'Keine Beschreibung verfügbar',
            lastModified: model.lastModified || null,
            downloads   : model.downloadCount || 0,
            files       : model.files
                .filter(file => file.path && file.path.toLowerCase().endsWith('.gguf'))
                .map(file => ({
                    name         : file.path,
                    size         : file.size,
                    sizeFormatted: formatFileSize(file.size),
                    url          : `https://huggingface.co/${model.id}/resolve/main/${file.path}`
                }))
        }));
    } catch (error) {
        console.error('Fehler bei der Hugging Face API-Anfrage:', error);
        return [];
    }
}

/**
 * Ruft Details zu einem bestimmten Modell ab
 * @param {string} modelId - ID des Modells (z.B. "TheBloke/Llama-2-7B-Chat-GGUF")
 * @returns {Promise<Object>} - Detailinformationen zum Modell
 */
async function getModelDetails(modelId) {
    try {
        const response = await axios.get(`${HF_API_URL}/models/${modelId}`);

        // Dateiliste abrufen
        const filesResponse = await axios.get(`${HF_API_URL}/models/${modelId}/tree/main`);

        return {
            ...response.data,
            files: filesResponse.data || []
        };
    } catch (error) {
        console.error(`Fehler beim Abrufen der Modellinformationen für ${modelId}:`, error);
        return {};
    }
}

/**
 * Formatiert die Dateigröße in lesbare Form
 * @param {number} bytes - Größe in Bytes
 * @returns {string} - Formatierte Größe (z.B. "1.5 GB")
 */
function formatFileSize(bytes) {
    if (!bytes || isNaN(bytes)) return 'Unbekannt';

    const units   = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size      = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
}

module.exports = {
    searchModels,
    getModelDetails
};