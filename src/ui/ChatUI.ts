/**
 * Chat UI Component
 *
 * Renders chat messages and input field, integrated with ChatManager.
 */

import { ChatManager, ChatMessage } from '../lib/chat/index.js';

/** Chat UI configuration */
export interface ChatUIConfig {
  maxVisibleMessages?: number;
  fadeTimeout?: number;
  showTimestamps?: boolean;
}

const DEFAULT_CONFIG: Required<ChatUIConfig> = {
  maxVisibleMessages: 50,
  fadeTimeout: 10000, // Messages fade after 10 seconds of inactivity
  showTimestamps: true,
};

export class ChatUI {
  private chatManager: ChatManager;
  private config: Required<ChatUIConfig>;

  // DOM Elements
  private container: HTMLElement;
  private messagesContainer: HTMLElement;
  private inputContainer: HTMLElement;
  private input: HTMLInputElement;
  private sendButton: HTMLButtonElement;

  // State
  private isInputFocused = false;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(chatManager: ChatManager, config?: ChatUIConfig) {
    this.chatManager = chatManager;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Create DOM structure
    this.container = this.createContainer();
    this.messagesContainer = this.createMessagesContainer();
    this.inputContainer = this.createInputContainer();
    this.input = this.createInput();
    this.sendButton = this.createSendButton();

    // Assemble
    this.inputContainer.appendChild(this.input);
    this.inputContainer.appendChild(this.sendButton);
    this.container.appendChild(this.messagesContainer);
    this.container.appendChild(this.inputContainer);

    // Setup event handlers
    this.setupEventHandlers();
    this.setupChatManagerCallbacks();

    // Start fade timer
    this.resetFadeTimer();
  }

  /** Attach to DOM */
  mount(parent: HTMLElement): void {
    parent.appendChild(this.container);
    this.injectStyles();
  }

  /** Remove from DOM */
  unmount(): void {
    this.container.remove();
  }

  private createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'chat-container';
    container.className = 'chat-container';
    return container;
  }

  private createMessagesContainer(): HTMLElement {
    const messages = document.createElement('div');
    messages.className = 'chat-messages';
    return messages;
  }

  private createInputContainer(): HTMLElement {
    const inputContainer = document.createElement('div');
    inputContainer.className = 'chat-input-container';
    return inputContainer;
  }

  private createInput(): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'chat-input';
    input.placeholder = 'Press Enter to chat...';
    input.maxLength = 500;
    return input;
  }

  private createSendButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'chat-send-button';
    button.textContent = 'Send';
    return button;
  }

  private setupEventHandlers(): void {
    // Input focus/blur
    this.input.addEventListener('focus', () => {
      this.isInputFocused = true;
      this.showChat();
      this.clearFadeTimer();
    });

    this.input.addEventListener('blur', () => {
      this.isInputFocused = false;
      this.resetFadeTimer();
    });

    // Send on Enter
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      } else if (e.key === 'Escape') {
        this.input.blur();
      }
    });

    // Send button click
    this.sendButton.addEventListener('click', () => {
      this.sendMessage();
    });

    // Global key handler for opening chat
    document.addEventListener('keydown', (e) => {
      // Open chat on Enter when not focused
      if (e.key === 'Enter' && !this.isInputFocused && document.activeElement !== this.input) {
        e.preventDefault();
        this.focus();
      }
    });

    // Show chat on mouse hover
    this.container.addEventListener('mouseenter', () => {
      this.showChat();
      this.clearFadeTimer();
    });

    this.container.addEventListener('mouseleave', () => {
      if (!this.isInputFocused) {
        this.resetFadeTimer();
      }
    });
  }

  private setupChatManagerCallbacks(): void {
    this.chatManager.onMessage = (message) => {
      this.addMessageToUI(message);
      this.showChat();
      this.resetFadeTimer();
    };

    this.chatManager.onError = (error) => {
      this.showErrorMessage(error.message);
    };
  }

  private sendMessage(): void {
    const content = this.input.value.trim();
    if (!content) return;

    const result = this.chatManager.send(content);

    if (result.handled) {
      this.input.value = '';
    } else if (result.error) {
      this.showErrorMessage(result.error);
    }
  }

  private addMessageToUI(message: ChatMessage): void {
    const messageEl = this.createMessageElement(message);
    this.messagesContainer.appendChild(messageEl);

    // Trim old messages
    while (this.messagesContainer.children.length > this.config.maxVisibleMessages) {
      this.messagesContainer.firstChild?.remove();
    }

    // Scroll to bottom
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  private createMessageElement(message: ChatMessage): HTMLElement {
    const el = document.createElement('div');
    el.className = `chat-message chat-message-${message.type}`;
    el.dataset.messageId = message.id;

    const content = this.formatMessage(message);
    el.innerHTML = content;

    return el;
  }

  private formatMessage(message: ChatMessage): string {
    const time = this.config.showTimestamps
      ? `<span class="chat-timestamp">${this.formatTime(message.timestamp)}</span>`
      : '';

    switch (message.type) {
      case 'chat':
        return `${time}<span class="chat-sender">${this.escapeHtml(message.senderName)}:</span> <span class="chat-content">${this.escapeHtml(message.content)}</span>`;

      case 'system':
        return `${time}<span class="chat-system-content">${this.escapeHtml(message.content)}</span>`;

      case 'whisper':
        const direction = message.senderId === this.chatManager['client']?.id
          ? `To ${this.escapeHtml(message.targetName || 'unknown')}`
          : `From ${this.escapeHtml(message.senderName)}`;
        return `${time}<span class="chat-whisper-label">[${direction}]</span> <span class="chat-whisper-content">${this.escapeHtml(message.content)}</span>`;

      case 'emote':
        return `${time}<span class="chat-emote">* ${this.escapeHtml(message.senderName)} ${this.escapeHtml(message.content)}</span>`;

      default:
        return `${time}<span class="chat-content">${this.escapeHtml(message.content)}</span>`;
    }
  }

  private formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private showErrorMessage(error: string): void {
    const errorMsg: ChatMessage = {
      id: `error_${Date.now()}`,
      senderId: 'local',
      senderName: 'System',
      content: error,
      timestamp: Date.now(),
      type: 'system',
    };
    this.addMessageToUI(errorMsg);
  }

  /** Focus the chat input */
  focus(): void {
    this.showChat();
    this.input.focus();
  }

  /** Blur the chat input */
  blur(): void {
    this.input.blur();
  }

  private showChat(): void {
    this.container.classList.remove('chat-faded');
  }

  private fadeChat(): void {
    if (!this.isInputFocused) {
      this.container.classList.add('chat-faded');
    }
  }

  private resetFadeTimer(): void {
    this.clearFadeTimer();
    this.fadeTimer = setTimeout(() => {
      this.fadeChat();
    }, this.config.fadeTimeout);
  }

  private clearFadeTimer(): void {
    if (this.fadeTimer) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  /** Inject CSS styles */
  private injectStyles(): void {
    if (document.getElementById('chat-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'chat-styles';
    styles.textContent = `
      .chat-container {
        position: absolute;
        bottom: 20px;
        left: 20px;
        width: 400px;
        max-height: 300px;
        display: flex;
        flex-direction: column;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        font-size: 14px;
        transition: opacity 0.3s ease;
        z-index: 1000;
      }

      .chat-container.chat-faded {
        opacity: 0.3;
      }

      .chat-container:hover {
        opacity: 1;
      }

      .chat-messages {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 10px;
        background: linear-gradient(to top, rgba(20, 20, 35, 0.9), rgba(20, 20, 35, 0.6));
        border-radius: 8px 8px 0 0;
        max-height: 200px;
        scrollbar-width: thin;
        scrollbar-color: rgba(100, 100, 150, 0.5) transparent;
      }

      .chat-messages::-webkit-scrollbar {
        width: 6px;
      }

      .chat-messages::-webkit-scrollbar-track {
        background: transparent;
      }

      .chat-messages::-webkit-scrollbar-thumb {
        background: rgba(100, 100, 150, 0.5);
        border-radius: 3px;
      }

      .chat-message {
        padding: 4px 0;
        line-height: 1.4;
        word-wrap: break-word;
      }

      .chat-timestamp {
        color: #666;
        font-size: 11px;
        margin-right: 6px;
      }

      .chat-sender {
        color: #00ffff;
        font-weight: 600;
        margin-right: 4px;
      }

      .chat-content {
        color: #e0e0e0;
      }

      .chat-message-system .chat-system-content {
        color: #888;
        font-style: italic;
      }

      .chat-message-whisper {
        background: rgba(128, 0, 128, 0.2);
        padding: 4px 8px;
        border-radius: 4px;
        margin: 2px 0;
      }

      .chat-whisper-label {
        color: #ff00ff;
        font-weight: 600;
      }

      .chat-whisper-content {
        color: #e0b0ff;
      }

      .chat-message-emote .chat-emote {
        color: #ffa500;
        font-style: italic;
      }

      .chat-input-container {
        display: flex;
        gap: 8px;
        padding: 8px;
        background: rgba(20, 20, 35, 0.95);
        border-radius: 0 0 8px 8px;
        border-top: 1px solid rgba(100, 100, 150, 0.3);
      }

      .chat-input {
        flex: 1;
        padding: 8px 12px;
        background: rgba(40, 40, 60, 0.8);
        border: 1px solid rgba(100, 100, 150, 0.4);
        border-radius: 4px;
        color: #fff;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s ease;
      }

      .chat-input:focus {
        border-color: #00ffff;
        box-shadow: 0 0 8px rgba(0, 255, 255, 0.3);
      }

      .chat-input::placeholder {
        color: #666;
      }

      .chat-send-button {
        padding: 8px 16px;
        background: linear-gradient(135deg, #00ffff, #0088ff);
        border: none;
        border-radius: 4px;
        color: #000;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.1s ease, box-shadow 0.2s ease;
      }

      .chat-send-button:hover {
        transform: scale(1.02);
        box-shadow: 0 0 12px rgba(0, 255, 255, 0.5);
      }

      .chat-send-button:active {
        transform: scale(0.98);
      }
    `;
    document.head.appendChild(styles);
  }

  /** Clean up */
  dispose(): void {
    this.clearFadeTimer();
    this.container.remove();
  }
}
