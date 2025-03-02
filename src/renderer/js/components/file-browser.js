// src/renderer/js/components/file-browser.js
// File browser component for navigating repositories and folders

// State for file browser
let currentBrowsingSource = null;
let currentBrowsingPath   = '';
let browseHistory         = [];
let selectedFiles         = [];
let sources               = {
    repositories: {},
    folders     : {}
};

/**
 * Initializes the file browser
 */
function initFileBrowser() {
    // Elements
    const fileBrowserModal      = document.getElementById('select-folder-button');
    const fileBrowserBack       = document.getElementById('file-browser-back');
    const fileSearchInput       = document.getElementById('file-search-input');
    const fileSearchButton      = document.getElementById('file-search-button');
    const fileContentClose      = document.getElementById('file-content-close');
    const fileBrowserClose      = document.getElementById('file-browser-close');
    const fileBrowserSendToChat = document.getElementById('file-browser-send-to-chat');

    // Init event handlers if elements exist
    if (fileBrowserBack) {
        fileBrowserBack.addEventListener('click', navigateBack);
    }

    if (fileSearchButton && fileSearchInput) {
        fileSearchButton.addEventListener('click', () => {
            searchFiles(fileSearchInput.value);
        });

        fileSearchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                searchFiles(fileSearchInput.value);
            }
        });
    }

    if (fileContentClose) {
        fileContentClose.addEventListener('click', () => {
            document.getElementById('file-content-viewer').classList.add('hidden');
        });
    }

    if (fileBrowserClose) {
        fileBrowserClose.addEventListener('click', () => {
            fileBrowserModal.style.display = 'none';
        });
    }

    if (fileBrowserSendToChat) {
        fileBrowserSendToChat.addEventListener('click', addFilesToChat);
    }

    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === fileBrowserModal) {
            fileBrowserModal.style.display = 'none';
        }
    });

    // Load sources
    loadSources();
}

/**
 * Loads all available sources (repositories and folders)
 */
async function loadSources() {
    try {
        const result = await window.electronAPI.getAllSources();

        if (result.success) {
            sources = {
                repositories: result.repositories || {},
                folders     : result.folders || {}
            };
        } else {
            console.error('Error loading sources:', result.error);
        }
    } catch (error) {
        console.error('Error loading sources:', error);
    }
}

/**
 * Opens the file browser for a specific source
 * @param {string} sourceId - ID of the source
 * @param {string} sourceType - Type of the source ('repository' or 'folder')
 * @param {string} sourceName - Name of the source
 */
async function openFileBrowser(sourceId, sourceType, sourceName) {
    const fileBrowserModal = document.getElementById('file-browser-modal');
    const fileBrowserTitle = document.getElementById('file-browser-title');

    if (!fileBrowserModal || !fileBrowserTitle) return;

    // Reset state
    currentBrowsingSource = sourceId;
    currentBrowsingPath   = '';
    browseHistory         = [];
    selectedFiles         = [];

    // Set modal title
    const icon                 = sourceType === 'folder' ? 'fa-folder-open' : 'fa-code-branch';
    fileBrowserTitle.innerHTML = `<i class="fas ${icon} mr-2"></i> ${sourceName}`;

    // Open modal
    fileBrowserModal.style.display = 'block';

    // List files
    await listFiles(sourceId, '');

    // Update the "Send to Chat" button
    updateSendToChatButton();
}

/**
 * Lists files for a source and path
 * @param {string} sourceId - ID of the source
 * @param {string} subPath - Sub-path within the source
 */
async function listFiles(sourceId, subPath) {
    const fileBrowserContent = document.getElementById('file-browser-content');

    if (!fileBrowserContent) return;

    try {
        // Show loading animation
        fileBrowserContent.innerHTML = `
      <div class="loading">
        <div class="loading-dot"></div>
        <div class="loading-dot"></div>
        <div class="loading-dot"></div>
      </div>
    `;

        // Get files
        const result = await window.electronAPI.listFiles({
            sourceId,
            subPath
        });

        if (result.success) {
            currentBrowsingPath = subPath;
            renderBreadcrumbs(subPath);

            // Render content
            renderFileBrowserContent(result);
        } else {
            fileBrowserContent.innerHTML = `<p class="text-red-500">Error: ${result.error}</p>`;
        }
    } catch (error) {
        fileBrowserContent.innerHTML = `<p class="text-red-500">Error: ${error.message}</p>`;
    }
}

/**
 * Renders breadcrumb navigation
 * @param {string} path - Current path
 */
function renderBreadcrumbs(path) {
    const fileBrowserPath = document.getElementById('file-browser-path');
    if (!fileBrowserPath) return;

    // Clear breadcrumbs
    fileBrowserPath.innerHTML = '';

    // Root element
    const rootItem       = document.createElement('span');
    rootItem.className   = 'breadcrumb-item';
    const rootLink       = document.createElement('a');
    rootLink.href        = '#';
    rootLink.textContent = 'Root';
    rootLink.addEventListener('click', (e) => {
        e.preventDefault();
        listFiles(currentBrowsingSource, '');
    });
    rootItem.appendChild(rootLink);
    fileBrowserPath.appendChild(rootItem);

    // If at root, we're done
    if (!path) return;

    // Split path and create breadcrumb items
    const segments  = path.split('/');
    let currentPath = '';

    segments.forEach((segment, index) => {
        if (!segment) return;

        currentPath += (currentPath ? '/' : '') + segment;
        const isLast = index === segments.length - 1;

        const item     = document.createElement('span');
        item.className = 'breadcrumb-item';

        if (isLast) {
            // Last element is not a link
            item.textContent = segment;
        } else {
            // Intermediate elements are links
            const link       = document.createElement('a');
            link.href        = '#';
            link.textContent = segment;
            const pathToHere = currentPath;
            link.addEventListener('click', (e) => {
                e.preventDefault();
                listFiles(currentBrowsingSource, pathToHere);
            });
            item.appendChild(link);
        }

        fileBrowserPath.appendChild(item);
    });
}

/**
 * Renders file browser content
 * @param {Object} data - File listing data
 */
function renderFileBrowserContent(data) {
    const fileBrowserContent = document.getElementById('file-browser-content');
    if (!fileBrowserContent) return;

    fileBrowserContent.innerHTML = '';

    if (data.directories.length === 0 && data.files.length === 0) {
        fileBrowserContent.innerHTML = '<p class="text-gray-500">This folder is empty</p>';
        return;
    }

    // Show directories first
    if (data.directories.length > 0) {
        const dirContainer     = document.createElement('div');
        dirContainer.className = 'mb-2';

        data.directories.forEach(dir => {
            const dirItem     = document.createElement('div');
            dirItem.className = 'flex items-center p-2 hover:bg-gray-100 cursor-pointer';
            dirItem.innerHTML = `
        <i class="fas fa-folder text-yellow-500 mr-2"></i>
        <span>${dir.name}</span>
      `;

            dirItem.addEventListener('click', () => {
                // Directory navigation with history
                browseHistory.push(currentBrowsingPath);
                listFiles(currentBrowsingSource, dir.path);
            });

            dirContainer.appendChild(dirItem);
        });

        fileBrowserContent.appendChild(dirContainer);
    }

    // Show files
    if (data.files.length > 0) {
        const fileContainer = document.createElement('div');

        // Add separator if directories exist
        if (data.directories.length > 0) {
            const separator     = document.createElement('div');
            separator.className = 'border-t border-gray-200 my-2';
            fileContainer.appendChild(separator);
        }

        data.files.forEach(file => {
            const fileItem     = document.createElement('div');
            fileItem.className = 'flex items-center justify-between p-2 hover:bg-gray-100';

            // Choose icon based on file type
            let icon      = 'fa-file';
            let iconClass = 'text-gray-500';

            if (file.extension === '.js' || file.extension === '.jsx' || file.extension === '.ts') {
                icon      = 'fa-file-code';
                iconClass = 'text-yellow-600';
            } else if (file.extension === '.html' || file.extension === '.htm' || file.extension === '.xml') {
                icon      = 'fa-file-code';
                iconClass = 'text-orange-500';
            } else if (file.extension === '.css' || file.extension === '.scss' || file.extension === '.sass') {
                icon      = 'fa-file-code';
                iconClass = 'text-blue-500';
            } else if (file.extension === '.json') {
                icon      = 'fa-file-code';
                iconClass = 'text-green-600';
            } else if (file.extension === '.md') {
                icon      = 'fa-file-alt';
                iconClass = 'text-blue-600';
            } else if (['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'].includes(file.extension)) {
                icon      = 'fa-file-image';
                iconClass = 'text-purple-500';
            } else if (['.mp4', '.webm', '.avi', '.mov'].includes(file.extension)) {
                icon      = 'fa-file-video';
                iconClass = 'text-red-500';
            } else if (['.mp3', '.wav', '.ogg'].includes(file.extension)) {
                icon      = 'fa-file-audio';
                iconClass = 'text-green-500';
            } else if (['.pdf'].includes(file.extension)) {
                icon      = 'fa-file-pdf';
                iconClass = 'text-red-600';
            } else if (['.doc', '.docx'].includes(file.extension)) {
                icon      = 'fa-file-word';
                iconClass = 'text-blue-600';
            } else if (['.xls', '.xlsx'].includes(file.extension)) {
                icon      = 'fa-file-excel';
                iconClass = 'text-green-600';
            } else if (['.ppt', '.pptx'].includes(file.extension)) {
                icon      = 'fa-file-powerpoint';
                iconClass = 'text-orange-600';
            } else if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(file.extension)) {
                icon      = 'fa-file-archive';
                iconClass = 'text-amber-700';
            }

            const nameElement     = document.createElement('div');
            nameElement.className = 'flex items-center flex-1';
            nameElement.innerHTML = `
        <i class="fas ${icon} ${iconClass} mr-2"></i>
        <span class="truncate">${file.name}</span>
        <span class="text-xs text-gray-500 ml-2">${formatFileSize(file.size)}</span>
      `;

            fileItem.appendChild(nameElement);

            const actionDiv = document.createElement('div');

            // View button for text files
            if (isTextFile(file.extension)) {
                const viewButton     = document.createElement('button');
                viewButton.className = 'text-blue-600 hover:text-blue-700 px-2';
                viewButton.innerHTML = '<i class="fas fa-eye"></i>';
                viewButton.title     = 'View file';

                viewButton.addEventListener('click', async () => {
                    await showFileContent(currentBrowsingSource, file.path);
                });

                actionDiv.appendChild(viewButton);
            }

            // Add to selection button
            const addButton     = document.createElement('button');
            addButton.className = 'text-green-600 hover:text-green-700 px-2';
            addButton.innerHTML = '<i class="fas fa-plus"></i>';
            addButton.title     = 'Add to selection';

            let isSelected = false;

            addButton.addEventListener('click', () => {
                isSelected = !isSelected;

                if (isSelected) {
                    selectedFiles.push({
                        sourceId: currentBrowsingSource,
                        path    : file.path,
                        name    : file.name
                    });
                    fileItem.classList.add('bg-blue-50');
                    addButton.innerHTML = '<i class="fas fa-check text-green-600"></i>';
                } else {
                    selectedFiles = selectedFiles.filter(f => !(f.sourceId === currentBrowsingSource && f.path === file.path));
                    fileItem.classList.remove('bg-blue-50');
                    addButton.innerHTML = '<i class="fas fa-plus"></i>';
                }

                // Update "Send to Chat" button
                updateSendToChatButton();
            });

            actionDiv.appendChild(addButton);
            fileItem.appendChild(actionDiv);

            fileContainer.appendChild(fileItem);
        });

        fileBrowserContent.appendChild(fileContainer);
    }
}

/**
 * Updates the "Send to Chat" button state based on selection
 */
function updateSendToChatButton() {
    const fileBrowserSendToChat = document.getElementById('file-browser-send-to-chat');
    if (!fileBrowserSendToChat) return;

    if (selectedFiles.length > 0) {
        fileBrowserSendToChat.disabled  = false;
        fileBrowserSendToChat.innerHTML = `
      <i class="fas fa-paper-plane mr-2"></i> ${selectedFiles.length} file(s) to chat
      <span class="selected-files-count">${selectedFiles.length}</span>
    `;
    } else {
        fileBrowserSendToChat.disabled  = true;
        fileBrowserSendToChat.innerHTML = `
      <i class="fas fa-paper-plane mr-2"></i> Send to chat
    `;
    }
}

/**
 * Shows file content
 * @param {string} sourceId - Source ID
 * @param {string} filePath - File path
 */
async function showFileContent(sourceId, filePath) {
    const fileContentViewer = document.getElementById('file-content-viewer');
    const fileContentPre    = document.getElementById('file-content-pre');
    const fileContentName   = document.getElementById('file-content-name');

    if (!fileContentViewer || !fileContentPre || !fileContentName) return;

    try {
        fileContentViewer.classList.remove('hidden');
        fileContentPre.innerHTML    = '<div class="loading"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div>';
        fileContentName.textContent = filePath.split('/').pop();

        const result = await window.electronAPI.readFile({
            sourceId,
            filePath
        });

        if (result.success) {
            // Syntax highlighting based on file extension
            const extension = result.extension.replace('.', '');
            const language  = getLanguageFromExtension(extension);

            // Format content
            if (language) {
                fileContentPre.innerHTML = `<code class="language-${language}">${escapeHtml(result.content)}</code>`;
                hljs.highlightElement(fileContentPre.querySelector('code'));
            } else {
                fileContentPre.textContent = result.content;
            }
        } else {
            fileContentPre.innerHTML = `<div class="text-red-500">Error: ${result.error}</div>`;
        }
    } catch (error) {
        fileContentPre.innerHTML = `<div class="text-red-500">Error: ${error.message}</div>`;
    }
}

/**
 * Formats file size in human-readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} - Formatted size
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';

    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i     = Math.floor(Math.log(bytes) / Math.log(1024));

    return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`;
}

/**
 * Checks if a file is a text file
 * @param {string} extension - File extension
 * @returns {boolean} - Whether it's a text file
 */
function isTextFile(extension) {
    const textExtensions = [
        '.txt', '.md', '.json', '.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.sass',
        '.html', '.htm', '.xml', '.svg', '.c', '.cpp', '.h', '.cs', '.java', '.py',
        '.rb', '.php', '.go', '.rs', '.swift', '.sh', '.bat', '.ps1', '.yaml', '.yml',
        '.toml', '.ini', '.config', '.conf', '.log', '.gitignore', '.env', '.htaccess',
        '.csv', '.tsv'
    ];

    return textExtensions.includes(extension);
}

/**
 * Gets language for syntax highlighting
 * @param {string} extension - File extension
 * @returns {string} - Language name
 */
function getLanguageFromExtension(extension) {
    const languageMap = {
        'js'   : 'javascript',
        'jsx'  : 'javascript',
        'ts'   : 'typescript',
        'tsx'  : 'typescript',
        'html' : 'html',
        'css'  : 'css',
        'scss' : 'scss',
        'sass' : 'scss',
        'json' : 'json',
        'md'   : 'markdown',
        'py'   : 'python',
        'java' : 'java',
        'c'    : 'c',
        'cpp'  : 'cpp',
        'cs'   : 'csharp',
        'rb'   : 'ruby',
        'php'  : 'php',
        'go'   : 'go',
        'rs'   : 'rust',
        'swift': 'swift',
        'sh'   : 'bash',
        'bat'  : 'batch',
        'ps1'  : 'powershell',
        'yaml' : 'yaml',
        'yml'  : 'yaml',
        'xml'  : 'xml',
        'sql'  : 'sql',
        'toml' : 'toml',
        'ini'  : 'ini'
    };

    return languageMap[extension] || '';
}

/**
 * Escapes HTML in a string
 * @param {string} text - Input text
 * @returns {string} - Escaped HTML
 */
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Navigates back in history
 */
function navigateBack() {
    if (browseHistory.length > 0) {
        const previousPath = browseHistory.pop();
        listFiles(currentBrowsingSource, previousPath);
    } else if (currentBrowsingPath) {
        // Navigate to parent directory
        const pathParts = currentBrowsingPath.split('/');
        pathParts.pop();
        const parentPath = pathParts.join('/');
        listFiles(currentBrowsingSource, parentPath);
    }
}

/**
 * Searches for files
 * @param {string} query - Search query
 */
async function searchFiles(query) {
    if (!query.trim()) {
        window.uiUtils.showNotification('Please enter a search term', 'error');
        return;
    }

    const fileBrowserContent = document.getElementById('file-browser-content');
    if (!fileBrowserContent) return;

    try {
        const fileSearchButton = document.getElementById('file-search-button');
        if (fileSearchButton) fileSearchButton.disabled = true;

        fileBrowserContent.innerHTML = `
      <div class="loading">
        <div class="loading-dot"></div>
        <div class="loading-dot"></div>
        <div class="loading-dot"></div>
      </div>
      <p class="text-center text-gray-600 mt-2">Searching for "${query}"...</p>
    `;

        const result = await window.electronAPI.searchFiles({
            sourceId: currentBrowsingSource,
            query,
            options : {
                maxResults   : 50,
                extensions   : null, // All file types
                includeBinary: false,
                recursive    : true
            }
        });

        if (result.success) {
            renderSearchResults(result);
        } else {
            fileBrowserContent.innerHTML = `<p class="text-red-500">Error: ${result.error}</p>`;
        }
    } catch (error) {
        fileBrowserContent.innerHTML = `<p class="text-red-500">Error: ${error.message}</p>`;
    } finally {
        const fileSearchButton = document.getElementById('file-search-button');
        if (fileSearchButton) fileSearchButton.disabled = false;
    }
}

/**
 * Renders search results
 * @param {Object} data - Search results
 */
function renderSearchResults(data) {
    const fileBrowserContent = document.getElementById('file-browser-content');
    if (!fileBrowserContent) return;

    fileBrowserContent.innerHTML = '';

    if (!data.results || data.results.length === 0) {
        fileBrowserContent.innerHTML = `<p class="text-gray-500">No results found for "${data.query}"</p>`;
        return;
    }

    // Header for search results
    const header     = document.createElement('div');
    header.className = 'mb-4';
    header.innerHTML = `
    <h3 class="text-lg font-medium">${data.results.length} results for "${data.query}"</h3>
    <p class="text-sm text-gray-600">Click on a result to view the file</p>
  `;
    fileBrowserContent.appendChild(header);

    // Results list
    const resultsList     = document.createElement('div');
    resultsList.className = 'space-y-2';

    data.results.forEach(result => {
        const resultItem     = document.createElement('div');
        resultItem.className = 'border rounded p-2 hover:bg-gray-50 cursor-pointer';

        // Choose icon by file type
        let icon      = 'fa-file';
        let iconClass = 'text-gray-500';

        if (result.extension === '.js' || result.extension === '.jsx' || result.extension === '.ts') {
            icon      = 'fa-file-code';
            iconClass = 'text-yellow-600';
        } else if (result.extension === '.html' || result.extension === '.htm') {
            icon      = 'fa-file-code';
            iconClass = 'text-orange-500';
        } else if (result.extension === '.css' || result.extension === '.scss') {
            icon      = 'fa-file-code';
            iconClass = 'text-blue-500';
        }

        resultItem.innerHTML = `
      <div class="flex items-center">
        <i class="fas ${icon} ${iconClass} mr-2"></i>
        <div class="flex-1">
          <div class="font-medium">${result.path}</div>
          <div class="text-sm text-gray-600">Line ${result.lineNumber}: <span class="font-mono">${escapeHtml(result.content)}</span></div>
        </div>
        <button class="ml-2 text-blue-600 hover:text-blue-700" title="View file">
          <i class="fas fa-eye"></i>
        </button>
      </div>
    `;

        resultItem.addEventListener('click', async () => {
            await showFileContent(currentBrowsingSource, result.path);
        });

        resultsList.appendChild(resultItem);
    });

    fileBrowserContent.appendChild(resultsList);
}

/**
 * Adds selected files to chat
 */
function addFilesToChat() {
    if (selectedFiles.length === 0) return;

    try {
        let fileReferences = '';

        // Create file references in format #file:sourceId/path/to/file.js
        selectedFiles.forEach(file => {
            fileReferences += `#file:${file.sourceId}/${file.path}\n`;
        });

        if (fileReferences) {
            // Add hint text
            const hint = selectedFiles.length === 1
                ? "I'm referencing the following file:"
                : `I'm referencing the following ${selectedFiles.length} files:`;

            // Insert into chat input
            const userInput = document.getElementById('user-input');
            if (userInput) {
                userInput.value += (userInput.value ? '\n\n' : '') +
                    `${hint}\n${fileReferences}`;

                // Adjust input height
                userInput.style.height    = 'auto';
                userInput.style.height    = Math.min(userInput.scrollHeight, 300) + 'px';
                userInput.style.overflowY = userInput.scrollHeight > 300 ? 'scroll' : 'hidden';

                // Close modal
                document.getElementById('file-browser-modal').style.display = 'none';

                // Reset selection
                selectedFiles = [];

                // Focus input
                userInput.focus();

                // Show notification
                window.uiUtils.showNotification(
                    selectedFiles.length === 1
                        ? "File reference added"
                        : `${selectedFiles.length} file references added`,
                    'success'
                );
            }
        }
    } catch (error) {
        window.uiUtils.showNotification(`Error: ${error.message}`, 'error');
    }
}

// Export functions
window.fileBrowserFunctions = {
    initFileBrowser,
    loadSources,
    openFileBrowser,
    showFileContent,
    searchFiles
};