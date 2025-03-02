// src/renderer/js/utils/ui-utils.js
// UI utility functions for the renderer process

/**
 * Shows a notification to the user
 * @param {string} message - Notification message
 * @param {string} type - Notification type ('success', 'error', 'info')
 * @param {number} duration - Duration in milliseconds
 */
function showNotification(message, type = 'success', duration = 3000) {
    let container = document.getElementById('notification-container');
    if (!container) {
        // Create container if it doesn't exist
        const newContainer     = document.createElement('div');
        newContainer.id        = 'notification-container';
        newContainer.className = 'fixed bottom-4 right-4 z-50';
        document.body.appendChild(newContainer);
        container = newContainer;
    }

    const notification       = document.createElement('div');
    notification.className   = `notification ${type === 'error' ? 'error' : type === 'info' ? 'info' : ''}`;
    notification.textContent = message;

    container.appendChild(notification);

    // Animation fade in
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    // Auto-hide after duration
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, duration);
}

/**
 * Appends a loading indicator to the chat container
 * @param {HTMLElement} container - Container element
 * @returns {HTMLElement} - The created loading element
 */
function appendLoading(container) {
    if (!container) return null;

    const loadingElement     = document.createElement('div');
    loadingElement.className = 'message assistant';

    const loadingContent     = document.createElement('div');
    loadingContent.className = 'loading';

    for (let i = 0; i < 3; i++) {
        const dot     = document.createElement('div');
        dot.className = 'loading-dot';
        loadingContent.appendChild(dot);
    }

    loadingElement.appendChild(loadingContent);
    container.appendChild(loadingElement);

    // Auto-scroll to show the loading indicator
    container.scrollTop = container.scrollHeight;

    return loadingElement;
}

/**
 * Adds copy buttons to all code blocks in the document
 */
function addCopyButtons() {
    document.querySelectorAll('pre code').forEach((codeBlock) => {
        if (!codeBlock.parentNode.querySelector('.copy-button')) {
            const button       = document.createElement('button');
            button.className   = 'copy-button';
            button.textContent = 'Copy';

            button.addEventListener('click', () => {
                const code = codeBlock.innerText;
                navigator.clipboard.writeText(code).then(() => {
                    button.textContent = 'Copied!';
                    setTimeout(() => {
                        button.textContent = 'Copy';
                    }, 2000);
                }).catch((err) => {
                    console.error('Error copying code:', err);
                    button.textContent = 'Error!';
                    setTimeout(() => {
                        button.textContent = 'Copy';
                    }, 2000);
                });
            });

            const pre          = codeBlock.parentNode;
            pre.style.position = 'relative';
            pre.appendChild(button);
        }
    });
}

/**
 * Creates a DOM element with specified attributes
 * @param {string} type - Element type (div, span, etc.)
 * @param {string|string[]} className - Class name(s)
 * @param {Object} attributes - Element attributes
 * @returns {HTMLElement} - Created element
 */
function createElement(type, className = '', attributes = {}) {
    const element = document.createElement(type);

    // Add classes
    if (Array.isArray(className)) {
        element.classList.add(...className);
    } else if (className) {
        element.className = className;
    }

    // Add attributes
    Object.entries(attributes).forEach(([key, value]) => {
        if (key === 'text' || key === 'textContent') {
            element.textContent = value;
        } else if (key === 'html' || key === 'innerHTML') {
            element.innerHTML = value;
        } else {
            element.setAttribute(key, value);
        }
    });

    return element;
}

/**
 * Updates application status indicator
 * @param {string} status - Status type ('connected', 'disconnected', 'error', etc.)
 * @param {string} message - Status message
 * @param {HTMLElement} statusIndicator - Status indicator element
 */
function updateStatusIndicator(status, message, statusIndicator) {
    if (!statusIndicator) return;

    const statusDot   = statusIndicator.querySelector('.status-dot');
    const pingElement = statusIndicator.querySelector('.ping-element');
    const statusText  = statusIndicator.querySelector('span');

    // Ensure the elements exist
    if (!statusDot || !statusText) return;

    // Remove all status classes and animations
    statusDot.classList.remove('online', 'offline', 'warning', 'animate-pulse');

    // Set appropriate class and message
    switch (status) {
        case 'connected':
        case 'loaded':
        case 'success':
            statusDot.classList.add('online');
            break;

        case 'disconnected':
        case 'error':
            statusDot.classList.add('offline');
            break;

        case 'loading':
        case 'downloading':
        case 'warning':
            statusDot.classList.add('warning');
            // Add a pulse animation for warning status
            statusDot.classList.add('animate-pulse');
            break;

        default:
            statusDot.classList.add('offline');
    }

    // Update ping element color directly if :has() selector isn't supported in all browsers
    if (pingElement) {
        // Reset all possible status-related classes
        pingElement.classList.remove('ping-online', 'ping-offline', 'ping-warning');

        console.log(status);

        // Add class based on current status
        if (status === 'connected' || status === 'loaded' || status === 'success') {
            pingElement.classList.add('ping-online');
            pingElement.style.backgroundColor = 'var(--success-color)';
        } else if (status === 'loading' || status === 'downloading' || status === 'warning') {
            pingElement.classList.add('ping-warning');
            pingElement.style.backgroundColor = 'var(--warning-color)';
        } else {
            pingElement.classList.add('ping-offline');
            pingElement.style.backgroundColor = 'var(--error-color)';
        }
    }

    statusText.textContent = message;
}

/**
 * Creates a confirmation dialog
 * @param {string} message - Confirmation message
 * @param {Object} options - Dialog options
 * @returns {Promise<boolean>} - User confirmation result
 */
function confirmDialog(message, options = {}) {
    return new Promise((resolve) => {
        // Default options
        const settings = {
            title      : options.title || 'Confirmation',
            confirmText: options.confirmText || 'Yes',
            cancelText : options.cancelText || 'No',
            dangerous  : options.dangerous || false
        };

        // Create dialog container
        const overlay = createElement('div', 'modal-overlay', {
            style: 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;'
        });

        // Create dialog content
        const dialog = createElement('div', 'confirmation-dialog', {
            style: 'background: white; border-radius: 0; padding: 0; width: 400px; max-width: 90%; box-shadow: 0 4px 20px rgba(0,0,0,0.15);'
        });

        // Header
        const header = createElement('div', 'dialog-header', {
            style: `background-color: ${settings.dangerous ? '#ef4444' : '#3b82f6'}; color: white; padding: 16px 20px; border-radius: 0;`
        });
        header.appendChild(createElement('h3', '', {text: settings.title, style: 'margin: 0; font-size: 1.25rem;'}));

        // Body
        const body = createElement('div', 'dialog-body', {
            style: 'padding: 20px;',
            html : message
        });

        // Footer
        const footer = createElement('div', 'dialog-footer', {
            style: 'padding: 16px 20px; display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid #e5e7eb;'
        });

        // Cancel button
        const cancelButton = createElement('button', 'secondary-button', {
            text : settings.cancelText,
            style: 'padding: 8px 16px; background-color: #e5e7eb; border: none; border-radius: 0; cursor: pointer;'
        });
        cancelButton.addEventListener('click', () => {
            document.body.removeChild(overlay);
            resolve(false);
        });

        // Confirm button
        const confirmButton = createElement('button', settings.dangerous ? 'danger-button' : 'primary-button', {
            text : settings.confirmText,
            style: `padding: 8px 16px; background-color: ${settings.dangerous ? '#ef4444' : '#3b82f6'}; color: white; border: none; border-radius: 0; cursor: pointer;`
        });
        confirmButton.addEventListener('click', () => {
            document.body.removeChild(overlay);
            resolve(true);
        });

        // Assemble dialog
        footer.appendChild(cancelButton);
        footer.appendChild(confirmButton);
        dialog.appendChild(header);
        dialog.appendChild(body);
        dialog.appendChild(footer);
        overlay.appendChild(dialog);

        // Add to document
        document.body.appendChild(overlay);

        // Focus the cancel button by default for safety
        cancelButton.focus();
    });
}

/**
 * Formats a date to a locale string representation
 * @param {Date|number|string} date - Date to format
 * @param {string} locale - Locale string (e.g., 'en-US', 'de-DE')
 * @param {Object} options - Formatting options
 * @returns {string} - Formatted date string
 */
function formatDate(date, locale = 'de-DE', options = {}) {
    const dateObj = date instanceof Date ? date : new Date(date);

    // Default options
    const defaultOptions = {
        year  : '2-digit',
        month : '2-digit',
        day   : '2-digit',
        hour  : '2-digit',
        minute: '2-digit'
    };

    return dateObj.toLocaleString(locale, {...defaultOptions, ...options});
}

/**
 * Creates a progress indicator
 * @param {HTMLElement} container - Container element
 * @param {string} message - Initial message
 * @returns {Object} - Progress indicator controls
 */
function createProgressIndicator(container, message = 'Loading...') {
    // Create progress elements
    const wrapper      = createElement('div', 'progress-container my-4');
    const progressBar  = createElement('progress', 'w-full', {value: 0, max: 100});
    const progressText = createElement('div', 'text-sm text-gray-600 mt-1', {text: message});

    // Assemble
    wrapper.appendChild(progressBar);
    wrapper.appendChild(progressText);
    container.appendChild(wrapper);

    return {
        /**
         * Updates progress
         * @param {number} value - Progress value (0-100)
         * @param {string} message - Progress message
         */
        update: (value, message = null) => {
            progressBar.value = value;
            if (message) {
                progressText.textContent = message;
            }
        },
        /**
         * Completes progress
         * @param {string} message - Completion message
         * @param {boolean} success - Whether operation was successful
         */
        complete: (message = 'Complete', success = true) => {
            progressBar.value        = 100;
            progressText.textContent = message;
            progressText.className   = `text-sm ${success ? 'text-green-600' : 'text-red-600'} mt-1`;
        },
        /**
         * Removes progress indicator
         */
        remove: () => {
            wrapper.remove();
        }
    };
}

// Export the utility functions
window.uiUtils = {
    showNotification,
    appendLoading,
    addCopyButtons,
    createElement,
    updateStatusIndicator,
    confirmDialog,
    formatDate,
    createProgressIndicator
};