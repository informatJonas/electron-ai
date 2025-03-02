// src/renderer/js/components/models.js
// Models management functionality

/**
 * Loads the list of models
 */
async function loadModelsList() {
    const modelsList = document.getElementById('models-list');
    if (!modelsList) return;

    try {
        const result = await window.electronAPI.getAvailableModels();

        if (result.success) {
            renderModelsList(result.models, result.currentModel);
        } else {
            modelsList.innerHTML = `<p class="text-red-500">Error: ${result.error}</p>`;
        }
    } catch (error) {
        modelsList.innerHTML = `<p class="text-red-500">Error: ${error.message}</p>`;
    }
}

/**
 * Renders the list of models
 * @param {Array} models - List of model names
 * @param {string} currentModel - Currently loaded model
 */
function renderModelsList(models, currentModel) {
    const modelsList = document.getElementById('models-list');
    if (!modelsList) return;

    if (!models || models.length === 0) {
        modelsList.innerHTML = '<p>No models found. Please download a model first.</p>';
        return;
    }

    modelsList.innerHTML = '';

    models.forEach((model) => {
        const template = document.getElementById('model-item-template');
        if (!template) return;

        const clone = document.importNode(template.content, true);

        // Set model name and info
        clone.querySelector('.model-name').textContent = model;

        // Check if it's the currently loaded model
        if (model === currentModel) {
            clone.querySelector('.model-info').textContent        = 'Currently loaded';
            clone.querySelector('.load-model-button').disabled    = true;
            clone.querySelector('.load-model-button').textContent = 'Loaded';
        } else {
            clone.querySelector('.model-info').textContent = 'Click "Load" to use this model';
        }

        // Load button event
        clone.querySelector('.load-model-button').addEventListener('click', async () => {
            await loadModel(model);
        });

        // Delete button event
        clone.querySelector('.delete-model-button').addEventListener('click', async () => {
            await deleteModel(model);
        });

        modelsList.appendChild(clone);
    });
}

/**
 * Loads a model
 * @param {string} model - Model name
 */
async function loadModel(model) {
    try {
        // Show loading notification
        window.uiUtils.showNotification(`Loading model "${model}"...`, 'info');

        const result = await window.electronAPI.loadModel(model);

        if (result.success) {
            window.uiUtils.showNotification(`Model "${model}" successfully loaded`);
            loadModelsList(); // Update list
        } else {
            window.uiUtils.showNotification(`Error: ${result.error}`, 'error');
        }
    } catch (error) {
        window.uiUtils.showNotification(`Error: ${error.message}`, 'error');
    }
}

/**
 * Deletes a model
 * @param {string} model - Model name
 */
async function deleteModel(model) {
    // Ask for confirmation
    const confirmed = await window.uiUtils.confirmDialog(
        `Are you sure you want to delete the model "${model}"?`,
        {
            title    : 'Delete Model',
            dangerous: true
        }
    );

    if (!confirmed) return;

    try {
        const result = await window.electronAPI.deleteModel(model);

        if (result.success) {
            window.uiUtils.showNotification(`Model "${model}" successfully deleted`);
            loadModelsList(); // Update list
        } else {
            window.uiUtils.showNotification(`Error: ${result.error}`, 'error');
        }
    } catch (error) {
        window.uiUtils.showNotification(`Error: ${error.message}`, 'error');
    }
}

/**
 * Initializes the Hugging Face model search
 */
function initHuggingFaceSearch() {
    const hfSearchInput   = document.getElementById('hf-search-input');
    const hfSearchButton  = document.getElementById('hf-search-button');
    const hfSearchResults = document.getElementById('hf-search-results');
    const hfLoading       = document.getElementById('hf-loading');

    if (!hfSearchButton || !hfSearchInput) return;

    // Search function for Hugging Face models
    const searchHuggingFaceModels = async () => {
        const query = hfSearchInput.value.trim();
        if (!query) {
            window.uiUtils.showNotification('Please enter a search term', 'error');
            return;
        }

        // Update UI status
        hfLoading.classList.remove('hidden');
        hfSearchResults.innerHTML = '';

        try {
            // API request
            const result = await window.electronAPI.searchHuggingFaceModels(query);

            // Show results
            if (result.success && result.models && result.models.length > 0) {
                renderHuggingFaceModels(result.models);
            } else {
                hfSearchResults.innerHTML = `
          <div class="text-center p-4">
            <p class="text-gray-600">No GGUF models found for "${query}".</p>
            <p class="text-sm text-gray-500 mt-2">Try different search terms or check your internet connection.</p>
          </div>
        `;
            }
        } catch (error) {
            console.error('Error in Hugging Face search:', error);
            hfSearchResults.innerHTML = `
        <div class="text-center p-4 text-red-500">
          <p>Search error: ${error.message || 'Unknown error'}</p>
        </div>
      `;
        } finally {
            hfLoading.classList.add('hidden');
        }
    };

    // Event listeners for search
    hfSearchButton.addEventListener('click', searchHuggingFaceModels);
    hfSearchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            searchHuggingFaceModels();
        }
    });
}

/**
 * Renders Hugging Face models
 * @param {Array} models - Models from search
 */
function renderHuggingFaceModels(models) {
    const hfSearchResults = document.getElementById('hf-search-results');
    if (!hfSearchResults) return;

    hfSearchResults.innerHTML = '';

    // Show result count
    const resultsCount       = document.createElement('p');
    resultsCount.className   = 'text-sm text-gray-600 mb-3';
    resultsCount.textContent = `${models.length} models found`;
    hfSearchResults.appendChild(resultsCount);

    models.forEach(model => {
        // Clone model template
        const template = document.getElementById('hf-model-template');
        const clone    = document.importNode(template.content, true);

        // Insert model details
        clone.querySelector('.model-name').textContent      = model.name;
        clone.querySelector('.model-author').textContent    = `by ${model.author}`;
        clone.querySelector('.model-downloads').textContent = model.downloads.toLocaleString();

        // Truncate description if too long
        const description                                     = model.description || 'No description available';
        clone.querySelector('.model-description').textContent =
            description.length > 200 ? description.substring(0, 200) + '...' : description;

        // Create file list
        const fileList = clone.querySelector('.file-list');

        if (model.files && model.files.length > 0) {
            model.files.forEach(file => {
                const fileTemplate = document.getElementById('hf-file-template');
                const fileClone    = document.importNode(fileTemplate.content, true);

                fileClone.querySelector('.file-name').textContent = file.name;
                fileClone.querySelector('.file-size').textContent = file.sizeFormatted;

                // Download button handler
                const downloadButton = fileClone.querySelector('.download-file-button');
                downloadButton.addEventListener('click', async () => {
                    await downloadHuggingFaceModel(file.url, file.name);
                });

                fileList.appendChild(fileClone);
            });
        } else {
            fileList.innerHTML = '<p class="text-gray-500">No GGUF files available</p>';
        }

        hfSearchResults.appendChild(clone);
    });
}

/**
 * Downloads a model from Hugging Face
 * @param {string} url - Download URL
 * @param {string} filename - Model filename
 */
async function downloadHuggingFaceModel(url, filename) {
    try {
        // Ask for confirmation
        const confirmed = await window.uiUtils.confirmDialog(
            `Do you want to download the file "${filename}"?`,
            {
                title      : 'Download Model',
                confirmText: 'Download',
                dangerous  : false
            }
        );

        if (!confirmed) return;

        // Status update
        window.uiUtils.showNotification(`Preparing download: ${filename}`, 'info');

        // Start download
        const downloadResult = await window.electronAPI.downloadModel({
            url,
            modelName: filename
        });

        if (downloadResult.success) {
            window.uiUtils.showNotification(`Model successfully downloaded: ${filename}`);
            loadModelsList(); // Update model list
        } else {
            window.uiUtils.showNotification(`Download error: ${downloadResult.error}`, 'error');
        }
    } catch (error) {
        window.uiUtils.showNotification(`Download error: ${error.message}`, 'error');
    }
}

/**
 * Initializes manual model download
 */
function initManualDownload() {
    const downloadModelButton   = document.getElementById('download-model-button');
    const modelDownloadUrl      = document.getElementById('model-download-url');
    const modelDownloadName     = document.getElementById('model-download-name');
    const modelDownloadProgress = document.getElementById('model-download-progress');

    if (!downloadModelButton) return;

    downloadModelButton.addEventListener('click', async () => {
        const url  = modelDownloadUrl.value.trim();
        const name = modelDownloadName.value.trim();

        if (!url || !name) {
            window.uiUtils.showNotification('URL and name are required', 'error');
            return;
        }

        try {
            // Show download UI
            modelDownloadProgress.classList.remove('hidden');
            downloadModelButton.disabled = true;

            const result = await window.electronAPI.downloadModel({
                url,
                modelName: name
            });

            if (result.success) {
                window.uiUtils.showNotification(`Model "${name}" successfully downloaded`);
                modelDownloadUrl.value  = '';
                modelDownloadName.value = '';
                loadModelsList(); // Update list
            } else {
                window.uiUtils.showNotification(`Error: ${result.error}`, 'error');
            }
        } catch (error) {
            window.uiUtils.showNotification(`Error: ${error.message}`, 'error');
        } finally {
            modelDownloadProgress.classList.add('hidden');
            downloadModelButton.disabled = false;
        }
    });
}

/**
 * Initialize all model management components
 */
function initModelManagement() {
    console.log('hugging face is initializing');

    // Initialize Hugging Face search
    initHuggingFaceSearch();

    // Initialize manual download
    initManualDownload();

    // Load models list when the tab is shown
    document.querySelector('[data-tab="models"]')?.addEventListener('click', () => {
        loadModelsList();
    });

    // Initialize LLM mode toggle
    const useLocalLlmToggle = document.getElementById('useLocalLlm');
    if (useLocalLlmToggle) {
        useLocalLlmToggle.addEventListener('change', function () {
            updateLLMMode(this.checked);
        });
    }

    console.log('hugging face was initialized');
}

/**
 * Updates LLM mode UI based on toggle state
 * @param {boolean} useLocalLlm - Whether to use local LLM
 */
function updateLLMMode(useLocalLlm) {
    const llmModeText      = document.getElementById('llm-mode-text');
    const localLlmSettings = document.getElementById('local-llm-settings');
    const lmStudioSettings = document.getElementById('lm-studio-settings');

    if (llmModeText) {
        llmModeText.textContent = useLocalLlm
            ? 'Use local LLM'
            : 'Use LM Studio';
    }

    if (localLlmSettings && lmStudioSettings) {
        localLlmSettings.style.display = useLocalLlm ? 'block' : 'none';
        lmStudioSettings.style.display = useLocalLlm ? 'none' : 'block';
    }
}

// Export functions
window.modelFunctions = {
    loadModelsList,
    loadModel,
    deleteModel,
    searchHuggingFaceModels: initHuggingFaceSearch,
    downloadHuggingFaceModel,
    initModelManagement,
    updateLLMMode
};