// src/renderer/js/components/chat.js
// Chat UI functionality

// Global state
let isProcessing = false;
let cancelCurrentRequest = false;
let currentSessionId = null;
let chatHistory = [];

/**
 * Initialize the chat UI
 */
function initChatUI() {
    // Elements
    const chatMessages = document.getElementById('chat-messages');

    // Add MutationObserver to watch for new code blocks
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.addedNodes.length) {
                window.uiUtils.addCopyButtons();
            }
        });
    });

    if (chatMessages) {
        observer.observe(chatMessages, { childList: true, subtree: true });
    }
}

/**
 * Sends a message to the server
 * @param {boolean} startNewConversation - Whether to start a new conversation
 */
async function sendMessage(startNewConversation = false) {
    // Elements
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const webSearchMode = document.getElementById('webSearchMode');
    const contentUrlInput = document.getElementById('content-url');

    const message = userInput ? userInput.value.trim() : '';
    const contentUrl = contentUrlInput ? contentUrlInput.value.trim() : null;

    if (!message || isProcessing) return;

    // Show user message
    await appendMessage('user', message);
    if (contentUrl) {
        await appendMessage('user', `📋 URL content: ${contentUrl}`);
    }

    // Show loading indicator
    const loadingElement = window.uiUtils.appendLoading(chatMessages);

    // Clear input field and update status
    userInput.value = '';
    if (contentUrlInput) contentUrlInput.value = '';
    isProcessing = true;
    sendButton.disabled = true;

    try {
        // Reset cancel flag
        cancelCurrentRequest = false;

        // Send request to server
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream'
            },
            body: JSON.stringify({
                message,
                webSearchMode: webSearchMode.value,
                contentUrl,
                newConversation: startNewConversation
            })
        });

        // Remove loading indicator
        loadingElement.remove();

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        // Prepare for streaming response
        const responseElement = document.createElement('div');
        responseElement.className = 'message assistant';
        const contentElement = document.createElement('div');
        contentElement.className = 'message-content';
        responseElement.appendChild(contentElement);
        chatMessages.appendChild(responseElement);

        // Process stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';
        let isStreamComplete = false;

        while (!isStreamComplete && !cancelCurrentRequest) {
            const { done, value } = await reader.read();

            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        let content = line.substring(6);

                        if (content !== 'END') {
                            content = JSON.parse(line.substring(6));
                        } else {
                            isStreamComplete = true;

                            // Final formatting
                            contentElement.innerHTML = await window.markdownAPI.render(fullResponse);

                            // Make links clickable
                            const links = contentElement.querySelectorAll('a');
                            links.forEach(link => {
                                link.addEventListener('click', (event) => {
                                    event.preventDefault();
                                    window.electronAPI.openExternalLink(link.href);
                                });
                            });

                            break; // End inner loop
                        }

                        // Incremental response
                        fullResponse += content;
                        contentElement.innerHTML = await window.markdownAPI.render(fullResponse);

                        // Scroll
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    } catch (parseError) {
                        console.error('Parsing error:', parseError);
                    }
                }
            }

            // End outer loop if stream is complete or cancelled
            if (isStreamComplete || cancelCurrentRequest) break;
        }

        if (cancelCurrentRequest) {
            contentElement.innerHTML += '<p><em>(Response cancelled)</em></p>';
        }
    } catch (error) {
        console.error('Error sending message:', error);
        await appendMessage('assistant', 'Connection error: Make sure the server is running and the model is loaded.');
        updateStatusIndicator('error', 'Connection problem: Server unreachable');
    } finally {
        isProcessing = false;
        sendButton.disabled = false;
        userInput.focus();
    }
}

/**
 * Cancels the current message generation
 */
async function cancelMessage() {
    if (!isProcessing) return;

    cancelCurrentRequest = true;

    try {
        const result = await window.electronAPI.cancelCurrentRequest();
        if (!result.success) {
            console.warn('Could not cancel current request:', result.message);
        }
    } catch (error) {
        console.error('Error cancelling request:', error);
    }
}

/**
 * Adds a message to the chat
 * @param {string} sender - 'user' or 'assistant'
 * @param {string} text - Message text
 * @returns {Promise<HTMLElement>} - The created message element
 */
async function appendMessage(sender, text) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return null;

    const messageElement = document.createElement('div');
    messageElement.className = `message ${sender}`;

    const contentElement = document.createElement('div');
    contentElement.className = 'message-content';

    // Process markdown formatting
    contentElement.innerHTML = await window.markdownAPI.render(text);

    // Add event listeners for links
    setTimeout(() => {
        const links = contentElement.querySelectorAll('a');
        links.forEach(link => {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                // Open the link with Electron's shell.openExternal
                window.electronAPI.openExternalLink(link.href);
            });
        });
    }, 0);

    messageElement.appendChild(contentElement);
    chatMessages.appendChild(messageElement);

    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return messageElement;
}

/**
 * Initialize chat history
 */
async function initChatHistory() {
    try {
        const result = await window.electronAPI.getChatHistory();

        if (result.success) {
            currentSessionId = result.currentSessionId;
            chatHistory = result.messages || [];

            // Clear chat container (only if there are no messages)
            const chatMessages = document.getElementById('chat-messages');
            if (chatHistory.length === 0 && chatMessages) {
                chatMessages.innerHTML = '';

                // Add welcome message
                appendMessage('assistant', 'Hello! I am your AI assistant with web access. How can I help you today?');
            } else if (chatMessages) {
                // Show existing messages
                chatMessages.innerHTML = '';

                for (const message of chatHistory) {
                    await appendMessage(message.role, message.content);
                }
            }
        } else {
            console.error('Error initializing chat history:', result.error);
        }
    } catch (error) {
        console.error('Error loading chat history:', error);
    }
}

/**
 * Loads a conversation
 * @param {string} conversationId - ID of the conversation to load
 * @returns {Promise<boolean>} - Success status
 */
async function loadConversation(conversationId) {
    try {
        const result = await window.electronAPI.loadConversation({conversationId});

        if (result.success) {
            // Reset processing status
            isProcessing = false;
            const sendButton = document.getElementById('send-button');
            if (sendButton) sendButton.disabled = false;

            currentSessionId = result.conversationId;
            chatHistory = result.messages || [];

            // Show chat history
            const chatMessages = document.getElementById('chat-messages');
            if (chatMessages) {
                chatMessages.innerHTML = '';

                for (const message of chatHistory) {
                    await appendMessage(message.role, message.content);
                }
            }

            return true;
        } else {
            window.uiUtils.showNotification(`Error: ${result.error}`, 'error');
            return false;
        }
    } catch (error) {
        window.uiUtils.showNotification(`Error: ${error.message}`, 'error');
        return false;
    }
}

/**
 * Starts a new conversation
 * @returns {Promise<boolean>} - Success status
 */
async function startNewConversation() {
    if (isProcessing) {
        cancelCurrentRequest = true;
        await window.electronAPI.cancelCurrentRequest();
    }

    try {
        const result = await window.electronAPI.startNewConversation();

        if (result.success) {
            // Reset processing status
            isProcessing = false;
            const sendButton = document.getElementById('send-button');
            if (sendButton) sendButton.disabled = false;

            currentSessionId = result.sessionId;
            chatHistory = [];

            // Clear chat history
            const chatMessages = document.getElementById('chat-messages');
            if (chatMessages) {
                chatMessages.innerHTML = '';

                // Add welcome message
                appendMessage('assistant', 'Hello! I am your AI assistant with web access. How can I help you today?');
            }

            window.uiUtils.showNotification('New conversation started');
            return true;
        } else {
            window.uiUtils.showNotification(`Error: ${result.error}`, 'error');
            return false;
        }
    } catch (error) {
        window.uiUtils.showNotification(`Error: ${error.message}`, 'error');
        return false;
    }
}

/**
 * Shows the history modal with all conversations
 */
async function showHistoryModal() {
    try {
        const result = await window.electronAPI.getAllConversations();

        if (!result.success) {
            window.uiUtils.showNotification(`Error: ${result.error}`, 'error');
            return;
        }

        const conversations = result.conversations || [];

        // Create modal if it doesn't exist
        let historyModal = document.getElementById('history-modal');

        if (!historyModal) {
            // Create modal
            historyModal = document.createElement('div');
            historyModal.id = 'history-modal';
            historyModal.className = 'modal';

            // Modal content
            historyModal.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h2><i class="fas fa-history"></i> Chat History</h2>
            <span class="close">&times;</span>
          </div>
          <div class="modal-body">
            <div id="conversations-list" class="max-h-96 overflow-y-auto">
              <p class="text-gray-500">No conversations</p>
            </div>
          </div>
          <div class="modal-footer p-4 flex justify-between">
            <button id="clear-all-conversations" class="danger-button">
              <i class="fas fa-trash mr-2"></i> Delete All
            </button>
            <button id="close-history-modal" class="secondary-button">
              Close
            </button>
          </div>
        </div>
      `;

            document.body.appendChild(historyModal);

            // Event listener for close button
            historyModal.querySelector('.close').addEventListener('click', () => {
                historyModal.style.display = 'none';
            });

            // Event listener for close button in footer
            historyModal.querySelector('#close-history-modal').addEventListener('click', () => {
                historyModal.style.display = 'none';
            });

            // Event listener for "Delete All" button
            historyModal.querySelector('#clear-all-conversations').addEventListener('click', async () => {
                const confirmed = await window.uiUtils.confirmDialog(
                    'Do you really want to delete all conversations? This action cannot be undone.',
                    {
                        title: 'Delete All Conversations',
                        dangerous: true
                    }
                );

                if (confirmed) {
                    try {
                        const result = await window.electronAPI.clearAllConversations();

                        if (result.success) {
                            window.uiUtils.showNotification('All conversations have been deleted');
                            historyModal.style.display = 'none';
                            await startNewConversation();
                        } else {
                            window.uiUtils.showNotification(`Error: ${result.error}`, 'error');
                        }
                    } catch (error) {
                        window.uiUtils.showNotification(`Error: ${error.message}`, 'error');
                    }
                }
            });

            // Close modal when clicking outside
            window.addEventListener('click', (event) => {
                if (event.target === historyModal) {
                    historyModal.style.display = 'none';
                }
            });
        }

        // Show conversations in modal
        const conversationsList = historyModal.querySelector('#conversations-list');

        if (conversations.length === 0) {
            conversationsList.innerHTML = '<p class="text-gray-500">No conversations</p>';
        } else {
            conversationsList.innerHTML = '';

            conversations.forEach(conversation => {
                const item = document.createElement('div');
                item.className = 'border rounded p-3 mb-2 hover:bg-gray-50 cursor-pointer';

                // Format date
                const date = new Date(conversation.lastUpdated);
                const formattedDate = date.toLocaleString('de-de', {
                    year: '2-digit',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                item.innerHTML = `
          <div class="flex justify-between items-center">
            <div>
              <div class="font-medium">${conversation.title}</div>
              <div class="text-sm text-gray-600">${formattedDate} · ${conversation.messageCount} messages</div>
            </div>
            <div class="flex gap-2">
              <button class="secondary-button text-sm py-1 px-2 flex items-center justify-center load-conversation-button">
                <i class="fas fa-folder-open"></i>
              </button>
              <button class="danger-button text-sm py-1 px-2 flex items-center justify-center delete-conversation-button">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
        `;

                // Load conversation
                item.querySelector('.load-conversation-button').addEventListener('click', async (e) => {
                    e.stopPropagation(); // Prevent clicking the parent element

                    await loadConversation(conversation.id);
                    historyModal.style.display = 'none';
                });

                // Delete conversation
                item.querySelector('.delete-conversation-button').addEventListener('click', async (e) => {
                    e.stopPropagation(); // Prevent clicking the parent element

                    const confirmed = await window.uiUtils.confirmDialog(
                        `Do you want to delete the conversation "${conversation.title}"?`,
                        {
                            title: 'Delete Conversation',
                            dangerous: true
                        }
                    );

                    if (confirmed) {
                        try {
                            const result = await window.electronAPI.deleteConversation({conversationId: conversation.id});

                            if (result.success) {
                                window.uiUtils.showNotification('Conversation deleted');
                                // Update the list
                                showHistoryModal();

                                // If the current conversation was deleted, start a new one
                                if (conversation.id === currentSessionId) {
                                    await startNewConversation();
                                }
                            } else {
                                window.uiUtils.showNotification(`Error: ${result.error}`, 'error');
                            }
                        } catch (error) {
                            window.uiUtils.showNotification(`Error: ${error.message}`, 'error');
                        }
                    }
                });

                // Load conversation when clicking on the item
                item.addEventListener('click', async () => {
                    await loadConversation(conversation.id);
                    historyModal.style.display = 'none';
                });

                conversationsList.appendChild(item);
            });
        }

        // Show modal
        historyModal.style.display = 'block';
    } catch (error) {
        window.uiUtils.showNotification(`Error: ${error.message}`, 'error');
    }
}

// Make functions available globally
window.chatFunctions = {
    sendMessage,
    cancelMessage,
    appendMessage,
    initChatHistory,
    loadConversation,
    startNewConversation,
    showHistoryModal
};