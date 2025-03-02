// src/renderer/js/utils/dom-utils.js
// DOM manipulation utilities

/**
 * Creates an element with classes and attributes
 * @param {string} tag - HTML tag name
 * @param {string|Array} classes - CSS class(es)
 * @param {Object} attrs - HTML attributes
 * @returns {HTMLElement} - Created element
 */
function createElement(tag, classes = '', attrs = {}) {
    const element = document.createElement(tag);

    // Add classes
    if (Array.isArray(classes)) {
        element.classList.add(...classes);
    } else if (typeof classes === 'string' && classes) {
        classes.split(' ').forEach(cls => {
            if (cls) element.classList.add(cls);
        });
    }

    // Add attributes
    Object.entries(attrs).forEach(([key, value]) => {
        if (key === 'text') {
            element.textContent = value;
        } else if (key === 'html') {
            element.innerHTML = value;
        } else if (key.startsWith('on') && typeof value === 'function') {
            // Event handlers
            const eventType = key.substring(2).toLowerCase();
            element.addEventListener(eventType, value);
        } else if (key === 'data' && typeof value === 'object') {
            // Data attributes
            Object.entries(value).forEach(([dataKey, dataValue]) => {
                element.dataset[dataKey] = dataValue;
            });
        } else {
            element.setAttribute(key, value);
        }
    });

    return element;
}

/**
 * Creates a button element
 * @param {string} text - Button text
 * @param {Function} onClick - Click handler
 * @param {string} classes - CSS classes
 * @returns {HTMLButtonElement} - Button element
 */
function createButton(text, onClick, classes = 'primary-button') {
    return createElement('button', classes, {
        text,
        onclick: onClick
    });
}

/**
 * Creates an input element
 * @param {string} type - Input type
 * @param {string} id - Input ID
 * @param {Object} options - Input options
 * @returns {HTMLInputElement} - Input element
 */
function createInput(type, id, options = {}) {
    const {
              placeholder = '',
              value = '',
              classes = '',
              required = false,
              onChange = null,
              min = null,
              max = null,
              step = null,
              ...attrs
          } = options;

    const inputAttrs = {
        type,
        id,
        placeholder,
        value,
        ...attrs
    };

    if (required) inputAttrs.required = 'required';
    if (min !== null) inputAttrs.min = min;
    if (max !== null) inputAttrs.max = max;
    if (step !== null) inputAttrs.step = step;

    const input = createElement('input', classes, inputAttrs);

    if (onChange) {
        input.addEventListener('input', onChange);
    }

    return input;
}

/**
 * Creates a form group with label
 * @param {string} labelText - Label text
 * @param {HTMLElement} inputElement - Input element
 * @param {string} hint - Optional hint text
 * @returns {HTMLDivElement} - Form group container
 */
function createFormGroup(labelText, inputElement, hint = '') {
    const group = createElement('div', 'form-group');

    const id = inputElement.getAttribute('id');
    const label = createElement('label', '', {
        for: id,
        text: labelText
    });

    group.appendChild(label);
    group.appendChild(inputElement);

    if (hint) {
        const hintElement = createElement('small', 'form-hint', {
            text: hint
        });
        group.appendChild(hintElement);
    }

    return group;
}

/**
 * Creates a checkbox input with label
 * @param {string} id - Checkbox ID
 * @param {string} labelText - Label text
 * @param {boolean} checked - Initial checked state
 * @param {Function} onChange - Change handler
 * @returns {HTMLDivElement} - Checkbox container
 */
function createCheckbox(id, labelText, checked = false, onChange = null) {
    const container = createElement('label', 'checkbox-container', {
        text: labelText
    });

    const input = createElement('input', '', {
        type: 'checkbox',
        id,
        checked: checked ? 'checked' : ''
    });

    if (onChange) {
        input.addEventListener('change', onChange);
    }

    const checkmark = createElement('span', 'checkmark');

    container.prepend(input);
    container.appendChild(checkmark);

    return container;
}

/**
 * Creates a select element with options
 * @param {string} id - Select ID
 * @param {Array} options - Options array [{value, text, selected}]
 * @param {Object} attrs - Additional attributes
 * @returns {HTMLSelectElement} - Select element
 */
function createSelect(id, options, attrs = {}) {
    const select = createElement('select', attrs.classes || '', {
        id,
        ...attrs
    });

    options.forEach(opt => {
        const option = createElement('option', '', {
            value: opt.value,
            text: opt.text
        });

        if (opt.selected) {
            option.selected = true;
        }

        select.appendChild(option);
    });

    return select;
}

/**
 * Clears all children from an element
 * @param {HTMLElement} element - Element to clear
 */
function clearElement(element) {
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}

/**
 * Appends multiple children to an element
 * @param {HTMLElement} parent - Parent element
 * @param {Array} children - Child elements
 * @returns {HTMLElement} - Parent element
 */
function appendChildren(parent, children) {
    children.forEach(child => {
        if (child) {
            parent.appendChild(child);
        }
    });

    return parent;
}

/**
 * Toggles an element's visibility
 * @param {HTMLElement} element - Element to toggle
 * @param {boolean} visible - Whether element should be visible
 * @param {string} displayMode - Display mode when visible
 */
function toggleVisibility(element, visible, displayMode = 'block') {
    if (element) {
        element.style.display = visible ? displayMode : 'none';
    }
}

/**
 * Creates a modal dialog
 * @param {string} title - Modal title
 * @param {string|HTMLElement} content - Modal content
 * @param {Object} options - Modal options
 * @returns {Object} - Modal control object
 */
function createModal(title, content, options = {}) {
    const {
              closable = true,
              width = '500px',
              buttons = [],
              onClose = null,
              id = `modal-${Date.now()}`
          } = options;

    // Create modal elements
    const overlay = createElement('div', 'modal', {
        id,
        style: 'display: none;'
    });

    const modalContent = createElement('div', 'modal-content', {
        style: `max-width: ${width};`
    });

    const header = createElement('div', 'modal-header');
    const headerTitle = createElement('h2', '', { text: title });
    header.appendChild(headerTitle);

    if (closable) {
        const closeBtn = createElement('span', 'close', {
            text: '×',
            onclick: () => close()
        });
        header.appendChild(closeBtn);
    }

    const body = createElement('div', 'modal-body');
    if (typeof content === 'string') {
        body.innerHTML = content;
    } else if (content instanceof HTMLElement) {
        body.appendChild(content);
    }

    // Assemble modal
    modalContent.appendChild(header);
    modalContent.appendChild(body);

    // Add buttons if provided
    if (buttons.length > 0) {
        const footer = createElement('div', 'modal-footer p-4 flex justify-between');

        buttons.forEach(btn => {
            const button = createButton(btn.text, () => {
                if (btn.action) {
                    btn.action();
                }

                if (btn.closeModal) {
                    close();
                }
            }, btn.class || (btn.primary ? 'primary-button' : 'secondary-button'));

            footer.appendChild(button);
        });

        modalContent.appendChild(footer);
    }

    overlay.appendChild(modalContent);
    document.body.appendChild(overlay);

    // Close when clicking outside if closable
    if (closable) {
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                close();
            }
        });
    }

    // Close function
    function close() {
        overlay.style.display = 'none';
        if (onClose) {
            onClose();
        }
    }

    // Show function
    function show() {
        overlay.style.display = 'block';
    }

    // Return modal control object
    return {
        show,
        close,
        element: overlay,
        contentElement: body
    };
}

// Export DOM utilities
window.domUtils = {
    createElement,
    createButton,
    createInput,
    createFormGroup,
    createCheckbox,
    createSelect,
    clearElement,
    appendChildren,
    toggleVisibility,
    createModal
};