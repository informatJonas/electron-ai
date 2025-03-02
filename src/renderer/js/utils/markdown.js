// src/renderer/js/utils/markdown.js
// Markdown and syntax highlighting utilities for the renderer process

/**
 * Processes Markdown text and renders it as HTML with syntax highlighting
 * @param {string} text - Markdown text to process
 * @returns {Promise<string>} - HTML content with highlighted code
 */
async function renderMarkdown(text) {
    try {
        // First, render the markdown using the preload API
        const html = await window.markdownAPI.render(text);

        // Then post-process with enhanced highlight.js integration
        return enhanceCodeHighlighting(html);
    } catch (error) {
        console.error('Error rendering markdown:', error);
        // Fallback to basic processing if render fails
        return safeHtmlEscape(text)
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>');
    }
}

/**
 * Enhances HTML with improved code highlighting and features
 * @param {string} html - HTML content to enhance
 * @returns {string} - Enhanced HTML content
 */
function enhanceCodeHighlighting(html) {
    // Create a document fragment to manipulate the HTML
    const template = document.createElement('template');
    template.innerHTML = html;
    const fragment = template.content;

    // Process code blocks for better display with highlight.js
    processCodeBlocksWithHighlightJs(fragment);

    // Process other elements
    processLinks(fragment);
    processFileReferences(fragment);

    // Return the modified HTML
    return template.innerHTML;
}

/**
 * Processes code blocks with highlight.js enhancements
 * @param {DocumentFragment} fragment - HTML fragment to process
 */
function processCodeBlocksWithHighlightJs(fragment) {
    const codeBlocks = fragment.querySelectorAll('pre code');

    codeBlocks.forEach(codeBlock => {
        // Extract language class (highlight.js uses class="language-xxx")
        const languageClass = Array.from(codeBlock.classList)
            .find(cls => cls.startsWith('language-'));

        // If language class exists, ensure proper highlighting
        if (languageClass) {
            const language = languageClass.replace('language-', '');

            // Add data attribute for easier reference
            codeBlock.dataset.language = language;

            // Add a language label to the code block
            const pre = codeBlock.parentNode;
            if (pre && pre.tagName === 'PRE') {
                // Create language indicator
                const languageIndicator = document.createElement('div');
                languageIndicator.className = 'code-language';
                languageIndicator.textContent = getLanguageDisplayName(language);
                pre.insertBefore(languageIndicator, pre.firstChild);

                // Add special class to pre for styling
                pre.classList.add('code-block-with-language');
            }
        }

        // Add line numbers if the code has multiple lines
        const linesCount = (codeBlock.textContent.match(/\n/g) || []).length + 1;
        if (linesCount > 3) {
            addLineNumbers(codeBlock, linesCount);
        }
    });

    // Apply highlight.js
    if (window.hljs) {
        try {
            window.hljs.highlightAll();
        } catch (error) {
            console.error('Error applying highlight.js:', error);
        }
    }
}

/**
 * Adds line numbers to a code block
 * @param {HTMLElement} codeBlock - Code block element
 * @param {number} lineCount - Number of lines
 */
function addLineNumbers(codeBlock, lineCount) {
    const pre = codeBlock.parentNode;
    if (!pre || pre.tagName !== 'PRE') return;

    // Mark the pre element
    pre.classList.add('line-numbers');

    // Create line numbers element
    const lineNumbers = document.createElement('div');
    lineNumbers.className = 'line-numbers-rows';

    // Add the correct number of line number elements
    let lineNumbersHTML = '';
    for (let i = 0; i < lineCount; i++) {
        lineNumbersHTML += '<span></span>';
    }
    lineNumbers.innerHTML = lineNumbersHTML;

    // Append to pre
    pre.appendChild(lineNumbers);
}

/**
 * Gets a user-friendly display name for a language
 * @param {string} language - Language identifier
 * @returns {string} - Display name
 */
function getLanguageDisplayName(language) {
    const languageMap = {
        'js': 'JavaScript',
        'javascript': 'JavaScript',
        'ts': 'TypeScript',
        'typescript': 'TypeScript',
        'html': 'HTML',
        'css': 'CSS',
        'scss': 'SCSS',
        'sass': 'Sass',
        'jsx': 'JSX',
        'tsx': 'TSX',
        'json': 'JSON',
        'py': 'Python',
        'python': 'Python',
        'rb': 'Ruby',
        'ruby': 'Ruby',
        'java': 'Java',
        'c': 'C',
        'cpp': 'C++',
        'cs': 'C#',
        'csharp': 'C#',
        'go': 'Go',
        'rust': 'Rust',
        'php': 'PHP',
        'swift': 'Swift',
        'bash': 'Bash',
        'sh': 'Shell',
        'powershell': 'PowerShell',
        'sql': 'SQL',
        'markdown': 'Markdown',
        'md': 'Markdown',
        'xml': 'XML',
        'yaml': 'YAML',
        'yml': 'YAML',
        'toml': 'TOML',
        'plaintext': 'Text',
        'text': 'Text'
    };

    return languageMap[language.toLowerCase()] || language;
}

/**
 * Processes links in HTML to ensure they open externally
 * @param {DocumentFragment} fragment - HTML fragment to process
 */
function processLinks(fragment) {
    const links = fragment.querySelectorAll('a');
    links.forEach(link => {
        // Skip if it's an anchor link
        if (link.getAttribute('href').startsWith('#')) {
            return;
        }

        // Add target="_blank" to ensure links open in a new tab
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');

        // Add click handler to use electron openExternal
        link.dataset.href = link.getAttribute('href');

        // Remove existing event listeners to avoid duplicates
        const newLink = link.cloneNode(true);
        link.parentNode.replaceChild(newLink, link);

        // Add new event listener
        newLink.addEventListener('click', handleLinkClick, false);
    });
}

/**
 * Event handler for link clicks
 * @param {Event} event - Click event
 */
function handleLinkClick(event) {
    event.preventDefault();
    const href = event.currentTarget.dataset.href;
    if (href && href !== '#' && !href.startsWith('javascript:')) {
        window.electronAPI.openExternalLink(href);
    }
}

/**
 * Processes file references in HTML
 * @param {DocumentFragment} fragment - HTML fragment to process
 */
function processFileReferences(fragment) {
    // Look for text matching the pattern #file:sourceId/path/to/file
    const regex = /#file:([a-zA-Z0-9_]+)\/([^\s\n]+)/g;
    const textNodes = getTextNodes(fragment);

    textNodes.forEach(node => {
        const text = node.textContent;
        if (text.match(regex)) {
            // Create a container for the processed content
            const span = document.createElement('span');

            // Replace file references with styled spans
            let lastIndex = 0;
            let match;
            let processedContent = '';

            // Reset regex because we're reusing it
            regex.lastIndex = 0;

            while ((match = regex.exec(text)) !== null) {
                // Add the text before this match
                processedContent += safeHtmlEscape(text.substring(lastIndex, match.index));

                // Add the styled file reference
                const [fullMatch, sourceId, filePath] = match;
                processedContent += `<span class="file-reference" data-source-id="${sourceId}" data-file-path="${filePath}">`;
                processedContent += `<i class="fas fa-file-code"></i> ${sourceId}/${filePath}`;
                processedContent += `</span>`;

                lastIndex = match.index + fullMatch.length;
            }

            // Add any remaining text
            processedContent += safeHtmlEscape(text.substring(lastIndex));

            // Set the processed content
            span.innerHTML = processedContent;

            // Replace the original node with our processed span
            node.parentNode.replaceChild(span, node);
        }
    });
}

/**
 * Gets all text nodes in a DOM fragment
 * @param {DocumentFragment} fragment - HTML fragment to process
 * @returns {Array<Node>} - Array of text nodes
 */
function getTextNodes(fragment) {
    const nodes = [];
    const walk = document.createTreeWalker(
        fragment,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );

    let node;
    while (node = walk.nextNode()) {
        // Only process text nodes with content that's not just whitespace
        if (node.textContent.trim().length > 0) {
            nodes.push(node);
        }
    }

    return nodes;
}

/**
 * Safely escape HTML in text
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function safeHtmlEscape(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Extracts code blocks from markdown
 * @param {string} markdown - Markdown text
 * @returns {Array<Object>} - Array of code blocks with language and content
 */
function extractCodeBlocks(markdown) {
    const codeBlockRegex = /```([\w-]*)\n([\s\S]*?)```/g;
    const codeBlocks = [];

    let match;
    while ((match = codeBlockRegex.exec(markdown)) !== null) {
        codeBlocks.push({
            language: match[1] || 'plaintext',
            code: match[2].trim()
        });
    }

    return codeBlocks;
}

/**
 * Highlights code snippet with specific language
 * @param {string} code - Code to highlight
 * @param {string} language - Language for highlighting
 * @returns {string} - HTML with highlighted code
 */
function highlightCode(code, language) {
    if (!window.hljs) {
        return `<pre><code>${safeHtmlEscape(code)}</code></pre>`;
    }

    try {
        // If language is specified and supported
        if (language && window.hljs.getLanguage(language)) {
            const highlighted = window.hljs.highlight(code, { language });
            return `<pre><code class="hljs language-${language}">${highlighted.value}</code></pre>`;
        }
        // Auto-detect language
        else {
            const highlighted = window.hljs.highlightAuto(code);
            return `<pre><code class="hljs language-${highlighted.language}">${highlighted.value}</code></pre>`;
        }
    } catch (error) {
        console.error('Error highlighting code:', error);
        return `<pre><code>${safeHtmlEscape(code)}</code></pre>`;
    }
}

/**
 * Generates a summary of markdown content
 * @param {string} markdown - Markdown content
 * @param {number} maxLength - Maximum length of summary
 * @returns {string} - Summary text
 */
function generateSummary(markdown, maxLength = 150) {
    // Strip markdown formatting
    let text = markdown
        .replace(/#+\s+(.*)/g, '$1') // headers
        .replace(/\*\*(.*?)\*\*/g, '$1') // bold
        .replace(/\*(.*?)\*/g, '$1') // italic
        .replace(/`(.*?)`/g, '$1') // inline code
        .replace(/```[\s\S]*?```/g, '[Code Block]') // code blocks
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
        .replace(/!\[([^\]]+)\]\([^)]+\)/g, '[Image: $1]') // images
        .replace(/\n+/g, ' ') // newlines to spaces
        .replace(/\s+/g, ' ') // multiple spaces to single space
        .trim();

    // Truncate if needed
    if (text.length > maxLength) {
        text = text.substring(0, maxLength) + '...';
    }

    return text;
}

// Export functions for use in other modules
window.markdownUtils = {
    renderMarkdown,
    highlightCode,
    extractCodeBlocks,
    generateSummary
};