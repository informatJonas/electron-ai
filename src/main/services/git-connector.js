// src/main/services/git-connector.js
// Module for Git repository and local folder integration - ES Module Version

import axios from 'axios';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';
const execAsync = promisify(exec);

import { ensureDirectoryExists, deleteRecursive } from '../utils/file-utils.js';
import { isValidUrl } from '../utils/string-utils.js';

/**
 * Class for repository management
 */
export default class GitConnector {
    /**
     * Creates a new GitConnector instance
     * @param {Object} config - Configuration options
     */
    constructor(config) {
        this.config = config;
        this.repos = {};
        this.folders = {};
        this.tokens = {};

        // Create directory for cached repositories
        this.reposCachePath = path.join(config.dataPath || process.cwd(), 'repos_cache');
        ensureDirectoryExists(this.reposCachePath);

        // Load saved repositories and folders
        this.loadSavedData();
    }

    /**
     * Loads saved repositories and folders
     */
    loadSavedData() {
        try {
            const dataPath = path.join(this.config.dataPath || process.cwd(), 'shared_sources.json');

            if (fs.existsSync(dataPath)) {
                const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
                this.repos = data.repos || {};
                this.folders = data.folders || {};
                this.tokens = data.tokens || {};
            }
        } catch (error) {
            console.error('Error loading saved repositories and folders:', error);
        }
    }

    /**
     * Saves repositories and folders
     */
    saveData() {
        try {
            const dataPath = path.join(this.config.dataPath || process.cwd(), 'shared_sources.json');

            // Remove sensitive information from the data to be saved
            const safeRepos = {};
            for (const [id, repo] of Object.entries(this.repos)) {
                safeRepos[id] = {
                    ...repo,
                    // Remove local path from saved data
                    localPath: undefined
                };
            }

            const data = {
                repos: safeRepos,
                folders: this.folders,
                tokens: this.tokens
            };

            fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
        } catch (error) {
            console.error('Error saving repositories and folders:', error);
        }
    }

    /**
     * Adds a new Git repository
     * @param {Object} repo - Repository information
     * @returns {string} - ID of the repository
     */
    addRepository(repo) {
        const repoId = `repo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        this.repos[repoId] = {
            id: repoId,
            name: repo.name,
            url: repo.url,
            type: repo.type, // 'github', 'gitlab', etc.
            branch: repo.branch || 'main',
            customDomain: repo.customDomain || false,
            baseUrl: repo.baseUrl, // For self-hosted instances
            addedAt: new Date().toISOString(),
            lastSynced: null,
            isPrivate: repo.isPrivate || false
        };

        this.saveData();
        return repoId;
    }

    /**
     * Adds a local folder
     * @param {Object} folder - Folder information
     * @returns {string} - ID of the folder
     */
    addFolder(folder) {
        const folderId = `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        this.folders[folderId] = {
            id: folderId,
            name: folder.name || path.basename(folder.path),
            path: folder.path,
            addedAt: new Date().toISOString(),
            lastIndexed: null
        };

        this.saveData();
        return folderId;
    }

    /**
     * Saves an API token for a Git service
     * @param {string} service - Service ('github', 'gitlab', etc.)
     * @param {string} token - API token
     * @param {string} domain - Optional domain for self-hosted instances
     * @returns {string} - Token ID
     */
    saveToken(service, token, domain = null) {
        const tokenId = domain ? `${service}_${domain}` : service;

        this.tokens[tokenId] = {
            service,
            domain,
            token,
            addedAt: new Date().toISOString()
        };

        this.saveData();
        return tokenId;
    }

    /**
     * Downloads or updates a repository
     * @param {string} repoId - ID of the repository
     * @returns {Promise<Object>} - Result of the operation
     */
    async syncRepository(repoId) {
        const repo = this.repos[repoId];
        if (!repo) {
            throw new Error(`Repository with ID ${repoId} not found`);
        }

        // Determine local path for the repository
        const repoDir = path.join(this.reposCachePath, repoId);
        repo.localPath = repoDir;

        try {
            // Check if the repository already exists locally
            const exists = fs.existsSync(path.join(repoDir, '.git'));

            if (exists) {
                // Update repository (git pull)
                await this.gitPull(repoDir, repo);
            } else {
                // Clone repository
                await this.gitClone(repo, repoDir);
            }

            // Update last sync timestamp
            repo.lastSynced = new Date().toISOString();
            this.saveData();

            return {
                success: true,
                repoId,
                localPath: repoDir
            };
        } catch (error) {
            console.error(`Error syncing repository ${repoId}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Clones a repository
     * @param {Object} repo - Repository information
     * @param {string} targetDir - Target directory
     */
    async gitClone(repo, targetDir) {
        // Create target directory if it doesn't exist
        ensureDirectoryExists(targetDir);

        let cloneUrl = repo.url;

        // For private repositories: Add authentication if possible
        if (repo.isPrivate) {
            const tokenInfo = this.getTokenForRepo(repo);
            if (tokenInfo) {
                // Example for GitHub: https://{token}@github.com/user/repo.git
                const urlObj = new URL(cloneUrl);
                cloneUrl = `https://${tokenInfo.token}@${urlObj.host}${urlObj.pathname}`;
            }
        }

        const command = `git clone --depth 1 --branch ${repo.branch} ${cloneUrl} "${targetDir}"`;
        await execAsync(command);
    }

    /**
     * Updates a repository (git pull)
     * @param {string} repoDir - Repository directory
     * @param {Object} repo - Repository information
     */
    async gitPull(repoDir, repo) {
        // Change to repository directory and execute git pull
        const command = `cd "${repoDir}" && git pull origin ${repo.branch}`;
        await execAsync(command);
    }

    /**
     * Finds the matching token for a repository
     * @param {Object} repo - Repository information
     * @returns {Object|null} - Token information or null
     */
    getTokenForRepo(repo) {
        // For self-hosted instances
        if (repo.customDomain && repo.baseUrl) {
            const domain = new URL(repo.baseUrl).host;
            const tokenId = `${repo.type}_${domain}`;
            return this.tokens[tokenId] || null;
        }

        // For standard instances
        return this.tokens[repo.type] || null;
    }

    /**
     * Lists files in a folder or repository
     * @param {string} sourceId - ID of the folder or repository
     * @param {string} subPath - Optional sub-path
     * @returns {Promise<Object>} - List of files and directories
     */
    async listFiles(sourceId, subPath = '') {
        try {
            // Determine if it's a repository or folder
            let basePath = '';
            let sourceType = '';

            if (sourceId.startsWith('repo_')) {
                const repo = this.repos[sourceId];
                if (!repo || !repo.localPath) {
                    // Repository not yet synchronized
                    await this.syncRepository(sourceId);
                }
                basePath = this.repos[sourceId].localPath;
                sourceType = 'repository';
            } else if (sourceId.startsWith('folder_')) {
                basePath = this.folders[sourceId].path;
                sourceType = 'folder';
            } else {
                throw new Error(`Invalid source ID: ${sourceId}`);
            }

            // Calculate full path
            const fullPath = path.join(basePath, subPath);

            // Check if path exists
            if (!fs.existsSync(fullPath)) {
                throw new Error(`Path does not exist: ${fullPath}`);
            }

            // List files and directories
            const entries = fs.readdirSync(fullPath, { withFileTypes: true });

            const files = [];
            const directories = [];

            for (const entry of entries) {
                // Skip .git directories and hidden files
                if (entry.name === '.git' || entry.name.startsWith('.')) {
                    continue;
                }

                const entryPath = path.join(subPath, entry.name);

                if (entry.isDirectory()) {
                    directories.push({
                        name: entry.name,
                        path: entryPath,
                        type: 'directory'
                    });
                } else {
                    // Get file size
                    const stats = fs.statSync(path.join(fullPath, entry.name));

                    files.push({
                        name: entry.name,
                        path: entryPath,
                        type: 'file',
                        size: stats.size,
                        extension: path.extname(entry.name).toLowerCase()
                    });
                }
            }

            return {
                success: true,
                sourceId,
                sourceType,
                currentPath: subPath,
                directories,
                files
            };
        } catch (error) {
            console.error(`Error listing files for ${sourceId}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Reads the content of a file
     * @param {string} sourceId - ID of the folder or repository
     * @param {string} filePath - Path to the file
     * @returns {Promise<Object>} - File content
     */
    async readFile(sourceId, filePath) {
        try {
            // Determine if it's a repository or folder
            let basePath = '';

            if (sourceId.startsWith('repo_')) {
                const repo = this.repos[sourceId];
                if (!repo || !repo.localPath) {
                    // Repository not yet synchronized
                    await this.syncRepository(sourceId);
                }
                basePath = this.repos[sourceId].localPath;
            } else if (sourceId.startsWith('folder_')) {
                basePath = this.folders[sourceId].path;
            } else {
                throw new Error(`Invalid source ID: ${sourceId}`);
            }

            // Calculate full path
            const fullPath = path.join(basePath, filePath);

            // Check if file exists
            if (!fs.existsSync(fullPath)) {
                throw new Error(`File does not exist: ${fullPath}`);
            }

            // Get file statistics
            const stats = fs.statSync(fullPath);

            if (stats.isDirectory()) {
                throw new Error(`The specified path is a directory: ${filePath}`);
            }

            // Check file size (limit to 5 MB)
            if (stats.size > 5 * 1024 * 1024) {
                throw new Error(`File is too large (> 5 MB): ${filePath}`);
            }

            // Read file content
            const content = fs.readFileSync(fullPath, 'utf8');
            const extension = path.extname(fullPath).toLowerCase();

            return {
                success: true,
                sourceId,
                filePath,
                content,
                extension,
                size: stats.size
            };
        } catch (error) {
            console.error(`Error reading file ${sourceId}/${filePath}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Searches for files in a folder or repository
     * @param {string} sourceId - ID of the folder or repository
     * @param {string} query - Search query
     * @param {Object} options - Search options (file types, max results, etc.)
     * @returns {Promise<Object>} - Search results
     */
    async searchFiles(sourceId, query, options = {}) {
        try {
            // Default options
            const searchOptions = {
                maxResults: options.maxResults || 20,
                extensions: options.extensions || null, // e.g. ['.js', '.html']
                includeBinary: options.includeBinary || false,
                recursive: options.recursive !== false // Recursive by default
            };

            // Determine if it's a repository or folder
            let basePath = '';

            if (sourceId.startsWith('repo_')) {
                const repo = this.repos[sourceId];
                if (!repo || !repo.localPath) {
                    // Repository not yet synchronized
                    await this.syncRepository(sourceId);
                }
                basePath = this.repos[sourceId].localPath;
            } else if (sourceId.startsWith('folder_')) {
                basePath = this.folders[sourceId].path;
            } else {
                throw new Error(`Invalid source ID: ${sourceId}`);
            }

            // Perform search with grep (Linux/macOS) or findstr (Windows)
            let command;
            if (process.platform === 'win32') {
                // Windows command (findstr)
                command = `cd "${basePath}" && findstr /s /i /n "${query}" *`;

                // Add file type filter if specified
                if (searchOptions.extensions && searchOptions.extensions.length > 0) {
                    command = `cd "${basePath}" && findstr /s /i /n "${query}" `;
                    searchOptions.extensions.forEach(ext => {
                        command += `*${ext} `;
                    });
                }
            } else {
                // Unix command (grep)
                command = `cd "${basePath}" && grep -r -i -n "${query}" --include="*" .`;

                // Add file type filter if specified
                if (searchOptions.extensions && searchOptions.extensions.length > 0) {
                    command = `cd "${basePath}" && grep -r -i -n "${query}" `;
                    searchOptions.extensions.forEach(ext => {
                        command += `--include="*${ext}" `;
                    });
                    command += '.';
                }
            }

            // Execute command
            const { stdout } = await execAsync(command);

            // Parse results
            const results = [];
            const lines = stdout.split('\n');

            for (const line of lines) {
                if (!line.trim()) continue;

                // Parse result (format depends on OS)
                let filePath, lineNumber, matchContent;

                if (process.platform === 'win32') {
                    // Windows (findstr): Filename:LineNumber:Content
                    const match = line.match(/^([^:]+):(\d+):(.*)/);
                    if (match) {
                        [, filePath, lineNumber, matchContent] = match;
                    }
                } else {
                    // Unix (grep): ./FilePath:LineNumber:Content
                    const match = line.match(/^\.\/([^:]+):(\d+):(.*)/);
                    if (match) {
                        [, filePath, lineNumber, matchContent] = match;
                    }
                }

                if (filePath) {
                    // Exclude binary files if not explicitly included
                    const ext = path.extname(filePath).toLowerCase();
                    const isBinary = ['.exe', '.dll', '.so', '.bin', '.dat', '.zip', '.rar', '.7z', '.gz'].includes(ext);

                    if (!isBinary || searchOptions.includeBinary) {
                        results.push({
                            path: filePath,
                            lineNumber: parseInt(lineNumber, 10),
                            content: matchContent.trim(),
                            extension: ext
                        });
                    }

                    // Limit number of results
                    if (results.length >= searchOptions.maxResults) {
                        break;
                    }
                }
            }

            return {
                success: true,
                sourceId,
                query,
                results
            };
        } catch (error) {
            console.error(`Error searching files in ${sourceId}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Removes a repository or folder
     * @param {string} sourceId - ID of the folder or repository
     * @returns {Promise<Object>} - Result of the operation
     */
    async removeSource(sourceId) {
        try {
            if (sourceId.startsWith('repo_')) {
                // Remove repository
                const repo = this.repos[sourceId];
                if (repo) {
                    // Delete local directory if it exists
                    if (repo.localPath && fs.existsSync(repo.localPath)) {
                        await deleteRecursive(repo.localPath);
                    }

                    // Remove from list
                    delete this.repos[sourceId];
                }
            } else if (sourceId.startsWith('folder_')) {
                // Remove folder from list (not physically delete)
                delete this.folders[sourceId];
            } else {
                throw new Error(`Invalid source ID: ${sourceId}`);
            }

            this.saveData();

            return {
                success: true,
                sourceId
            };
        } catch (error) {
            console.error(`Error removing source ${sourceId}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Gets all repositories
     * @returns {Object} - List of all repositories
     */
    getAllRepositories() {
        return this.repos;
    }

    /**
     * Gets all folders
     * @returns {Object} - List of all folders
     */
    getAllFolders() {
        return this.folders;
    }

    /**
     * Checks a repository URL and extracts information
     * @param {string} url - Repository URL
     * @returns {Promise<Object>} - Repository information
     */
    async checkRepositoryUrl(url) {
        try {
            // Validate URL format
            if (!isValidUrl(url)) {
                throw new Error('Invalid URL format');
            }

            // Determine base URL and type
            let type = '';
            let baseUrl = '';
            let repoPath = '';
            let customDomain = false;

            // URL processing
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;

            // Extract repository path (without .git extension)
            const pathname = urlObj.pathname.endsWith('.git')
                ? urlObj.pathname.slice(0, -4)
                : urlObj.pathname;

            // Determine service type
            if (hostname === 'github.com') {
                type = 'github';
                baseUrl = 'https://github.com';
                repoPath = pathname;
            } else if (hostname === 'gitlab.com') {
                type = 'gitlab';
                baseUrl = 'https://gitlab.com';
                repoPath = pathname;
            } else if (hostname.includes('github')) {
                // Self-hosted GitHub Enterprise
                type = 'github';
                baseUrl = `https://${hostname}`;
                repoPath = pathname;
                customDomain = true;
            } else if (hostname.includes('gitlab')) {
                // Self-hosted GitLab
                type = 'gitlab';
                baseUrl = `https://${hostname}`;
                repoPath = pathname;
                customDomain = true;
            } else {
                // Generic Git service
                type = 'git';
                baseUrl = `https://${hostname}`;
                repoPath = pathname;
                customDomain = true;
            }

            // Extract repository name from path
            let name = '';
            let owner = '';

            // Format: /owner/repo
            const pathParts = repoPath.split('/').filter(part => part.length > 0);
            if (pathParts.length >= 2) {
                owner = pathParts[0];
                name = pathParts[1];
            } else {
                throw new Error('Invalid repository format in URL');
            }

            // API request to check if repository exists and if it's private
            let isPrivate = false;

            // Only check API for known services
            if (type === 'github' && !customDomain) {
                try {
                    const repoInfoUrl = `https://api.github.com/repos/${owner}/${name}`;

                    console.log(repoInfoUrl);
                    const headers = {
                        'X-GitHub-Api-Version': '2022-11-28'
                    };

                    // Add token if available
                    if (this.tokens['github']) {
                        headers.Authorization = `Bearer ${this.tokens['github'].token}`;
                    }

                    const response = await axios.get(repoInfoUrl, {
                        headers: headers
                    });

                    if (response.data) {
                        isPrivate = response.data.private === true;
                    }
                } catch (apiError) {
                    if (apiError.response && apiError.response.status === 404) {
                        throw new Error('Repository not found');
                    }
                    // For other errors: Assume it's a private repository
                    isPrivate = true;
                }
            } else if (type === 'gitlab' && !customDomain) {
                try {
                    const repoInfoUrl = `https://gitlab.com/api/v4/projects/${encodeURIComponent(`${owner}/${name}`)}`;
                    const response = await axios.get(repoInfoUrl);

                    if (response.data) {
                        isPrivate = response.data.visibility === 'private';
                    }
                } catch (apiError) {
                    if (apiError.response && apiError.response.status === 404) {
                        throw new Error('Repository not found');
                    }
                    // For other errors: Assume it's a private repository
                    isPrivate = true;
                }
            } else {
                // For self-hosted or unknown services: Assume a token is required
                isPrivate = true;
            }

            return {
                success: true,
                url,
                type,
                name,
                owner,
                repoPath,
                baseUrl,
                customDomain,
                isPrivate
            };
        } catch (error) {
            console.error('Error checking repository URL:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}