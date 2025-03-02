// src/main/utils/string-utils.js
// String manipulation utilities - ES Module Version

/**
 * Escapes HTML special characters in a string
 * @param {string} text - Input text
 * @returns {string} - HTML-escaped text
 */
export function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Converts a string value to appropriate type (boolean, number, or string)
 * @param {string} value - String value to convert
 * @returns {boolean|number|string} - Converted value
 */
export function convertValue(value) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (!isNaN(value) && value.trim() !== '') return Number(value);
    return value;
}

/**
 * Converts camelCase to UPPER_SNAKE_CASE
 * @param {string} key - camelCase string
 * @returns {string} - UPPER_SNAKE_CASE string
 */
export function keyToEnvFormat(key) {
    return key.replace(/([A-Z])/g, '_$1').toUpperCase();
}

/**
 * Converts UPPER_SNAKE_CASE to camelCase
 * @param {string} key - UPPER_SNAKE_CASE string
 * @returns {string} - camelCase string
 */
export function keyToCamelCase(key) {
    return key.toLowerCase().replace(/_([a-z])/g, (match, char) => char.toUpperCase());
}

/**
 * Truncates text to specified length with ellipsis
 * @param {string} text - Input text
 * @param {number} maxLength - Maximum length
 * @param {boolean} addEllipsis - Whether to add ellipsis
 * @returns {string} - Truncated text
 */
export function truncate(text, maxLength = 30, addEllipsis = true) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + (addEllipsis ? '...' : '');
}

/**
 * Extracts file references from text using the pattern #file:sourceId/path/to/file
 * @param {string} text - Input text
 * @returns {Array} - Array of file reference objects
 */
export function extractFileReferences(text) {
    const references = [];
    // Matches the pattern #file:sourceId/path/to/file
    const regex = /#file:([a-zA-Z0-9_]+)\/([^\s\n]+)/g;

    let match;
    while ((match = regex.exec(text)) !== null) {
        references.push({
            sourceId: match[1],
            path: match[2],
            fullMatch: match[0]
        });
    }

    return references;
}

/**
 * Generates a unique ID
 * @param {string} prefix - Optional prefix for the ID
 * @returns {string} - Unique ID
 */
export function generateUniqueId(prefix = '') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `${prefix}${timestamp}_${random}`;
}

/**
 * Validates if a string is a valid URL
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid URL
 */
export function isValidUrl(url) {
    try {
        new URL(url);
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Formats a date to a locale string representation
 * @param {Date|number|string} date - Date to format
 * @param {string} locale - Locale string (e.g., 'en-US', 'de-DE')
 * @param {Object} options - Formatting options
 * @returns {string} - Formatted date string
 */
export function formatDate(date, locale = 'de-DE', options = {}) {
    const dateObj = date instanceof Date ? date : new Date(date);

    // Default options
    const defaultOptions = {
        year: '2-digit',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    };

    return dateObj.toLocaleString(locale, { ...defaultOptions, ...options });
}

/**
 * Removes duplicate items from an array
 * @param {Array} array - Input array
 * @param {Function} keyFn - Optional function to extract comparison key
 * @returns {Array} - Deduplicated array
 */
export function uniqueArray(array, keyFn = null) {
    if (!keyFn) {
        return [...new Set(array)];
    }

    const seen = new Set();
    return array.filter(item => {
        const key = keyFn(item);
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

/**
 * Slugifies a string (converts to lowercase, replaces spaces with dashes, removes special chars)
 * @param {string} text - Input text
 * @returns {string} - Slugified text
 */
export function slugify(text) {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')         // Replace spaces with -
        .replace(/&/g, '-and-')       // Replace & with 'and'
        .replace(/[^\w\-]+/g, '')     // Remove all non-word chars
        .replace(/\-\-+/g, '-');      // Replace multiple - with single -
}

export default {
    escapeHtml,
    convertValue,
    keyToEnvFormat,
    keyToCamelCase,
    truncate,
    extractFileReferences,
    generateUniqueId,
    isValidUrl,
    formatDate,
    uniqueArray,
    slugify
};