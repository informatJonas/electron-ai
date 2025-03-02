// src/main/utils/file-utils.js
// File operation utilities

const fs = require('fs');
const path = require('path');

/**
 * Ensures the specified directory exists, creating it if necessary
 * @param {string} dirPath - Path to the directory
 * @returns {boolean} - True if directory exists or was created
 */
function ensureDirectoryExists(dirPath) {
    try {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        return true;
    } catch (error) {
        console.error(`Error ensuring directory exists: ${dirPath}`, error);
        return false;
    }
}

/**
 * Deletes a directory recursively
 * @param {string} folderPath - Path to the directory
 */
function deleteRecursive(folderPath) {
    if (fs.existsSync(folderPath)) {
        fs.readdirSync(folderPath).forEach((file) => {
            const curPath = path.join(folderPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                // Recursive delete for subdirectories
                deleteRecursive(curPath);
            } else {
                // Delete file
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(folderPath);
    }
}

/**
 * Checks if a file is a text file based on its extension
 * @param {string} extension - File extension (including the dot)
 * @returns {boolean} - True if the file is likely a text file
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
 * Formats file size into human-readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} - Formatted size (e.g. "1.5 MB")
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';

    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));

    return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`;
}

/**
 * Gets the language for syntax highlighting based on file extension
 * @param {string} extension - File extension (without the dot)
 * @returns {string} - Language identifier for highlight.js or empty string
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
 * Creates a temporary file with given content
 * @param {string} content - File content
 * @param {string} extension - File extension (including dot)
 * @returns {string} - Path to the temporary file
 */
function createTempFile(content, extension = '.txt') {
    const tempDir = path.join(require('os').tmpdir(), 'ki-assistant');
    ensureDirectoryExists(tempDir);

    const tempFile = path.join(tempDir, `temp_${Date.now()}${extension}`);
    fs.writeFileSync(tempFile, content);

    return tempFile;
}

/**
 * Reads a file and returns its content
 * @param {string} filePath - Path to the file
 * @param {string} encoding - File encoding
 * @returns {string|Buffer} - File content
 */
function readFile(filePath, encoding = 'utf8') {
    try {
        return fs.readFileSync(filePath, encoding);
    } catch (error) {
        console.error(`Error reading file: ${filePath}`, error);
        throw error;
    }
}

/**
 * Writes content to a file
 * @param {string} filePath - Path to the file
 * @param {string|Buffer} content - Content to write
 * @returns {boolean} - True if write successful
 */
function writeFile(filePath, content) {
    try {
        // Ensure the directory exists
        const directory = path.dirname(filePath);
        ensureDirectoryExists(directory);

        // Write the file
        fs.writeFileSync(filePath, content);
        return true;
    } catch (error) {
        console.error(`Error writing file: ${filePath}`, error);
        return false;
    }
}

module.exports = {
    ensureDirectoryExists,
    deleteRecursive,
    isTextFile,
    formatFileSize,
    getLanguageFromExtension,
    createTempFile,
    readFile,
    writeFile
};