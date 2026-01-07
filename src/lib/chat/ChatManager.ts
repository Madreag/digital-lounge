/**
 * Chat Manager
 *
 * Manages chat messages and commands, connecting WebSocket events
 * to the chat UI. Handles message history and command parsing.
 */

import { LoungeClient } from '../websocket/client.js';
import {
  ChatMessage,
  ChatMessageType,
  ChatSendMessage,
  ChatWhisperMessage,
  ChatEmoteMessage,
  ChatBroadcastMessage,
  ChatSystemMessage,
  ChatErrorMessage,
} from './types.js';

/** Maximum messages to keep in history */
const MAX_MESSAGE_HISTORY = 100;

/** Chat command result */
export interface CommandResult {
  handled: boolean;
  error?: string;
}

export class ChatManager {
  private client: LoungeClient;
  private messages: ChatMessage[] = [];
  private unsubscribers: (() => void)[] = [];

  // Event callbacks
  public onMessage: ((message: ChatMessage) => void) | null = null;
  public onError: ((error: { code: string; message: string }) => void) | null = null;

  constructor(client: LoungeClient) {
    this.client = client;
    this.setupMessageHandlers();
  }

  private setupMessageHandlers(): void {
    // Handle incoming chat messages
    this.unsubscribers.push(
      this.client.on<ChatBroadcastMessage>(ChatMessageType.CHAT_MESSAGE, (msg) => {
        this.handleChatMessage(msg.payload);
      })
    );

    // Handle system messages
    this.unsubscribers.push(
      this.client.on<ChatSystemMessage>(ChatMessageType.CHAT_SYSTEM, (msg) => {
        this.handleChatMessage(msg.payload);
      })
    );

    // Handle chat errors
    this.unsubscribers.push(
      this.client.on<ChatErrorMessage>(ChatMessageType.CHAT_ERROR, (msg) => {
        this.handleChatError(msg.payload);
      })
    );

    // Clear messages on disconnect
    this.unsubscribers.push(
      this.client.onStateChange((state) => {
        if (state === 'disconnected') {
          // Optionally clear messages on disconnect
          // this.messages = [];
        }
      })
    );
  }

  /** Handle incoming chat message */
  private handleChatMessage(message: ChatMessage): void {
    this.addMessage(message);
    this.onMessage?.(message);
  }

  /** Handle chat error */
  private handleChatError(error: { code: string; message: string }): void {
    console.warn(`[ChatManager] Error: ${error.code} - ${error.message}`);
    this.onError?.(error);
  }

  /** Add message to history */
  private addMessage(message: ChatMessage): void {
    this.messages.push(message);

    // Trim history if needed
    if (this.messages.length > MAX_MESSAGE_HISTORY) {
      this.messages = this.messages.slice(-MAX_MESSAGE_HISTORY);
    }
  }

  /**
   * Send a chat message or command
   * Returns true if successfully sent/handled
   */
  send(input: string): CommandResult {
    const trimmed = input.trim();
    if (!trimmed) {
      return { handled: false, error: 'Empty message' };
    }

    // Check if it's a command
    if (trimmed.startsWith('/')) {
      return this.handleCommand(trimmed);
    }

    // Regular chat message
    return this.sendChat(trimmed);
  }

  /** Send a regular chat message */
  private sendChat(content: string): CommandResult {
    if (this.client.connectionState !== 'connected') {
      return { handled: false, error: 'Not connected' };
    }

    const sent = this.client.send<ChatSendMessage>(ChatMessageType.CHAT_SEND, {
      content,
    });

    return { handled: sent, error: sent ? undefined : 'Failed to send' };
  }

  /** Send a whisper to a specific player */
  sendWhisper(targetName: string, content: string): CommandResult {
    if (this.client.connectionState !== 'connected') {
      return { handled: false, error: 'Not connected' };
    }

    if (!targetName.trim()) {
      return { handled: false, error: 'No target specified' };
    }

    if (!content.trim()) {
      return { handled: false, error: 'No message content' };
    }

    const sent = this.client.send<ChatWhisperMessage>(ChatMessageType.CHAT_WHISPER, {
      targetName: targetName.trim(),
      content: content.trim(),
    });

    return { handled: sent, error: sent ? undefined : 'Failed to send whisper' };
  }

  /** Send an emote action */
  sendEmote(action: string): CommandResult {
    if (this.client.connectionState !== 'connected') {
      return { handled: false, error: 'Not connected' };
    }

    if (!action.trim()) {
      return { handled: false, error: 'No action specified' };
    }

    const sent = this.client.send<ChatEmoteMessage>(ChatMessageType.CHAT_EMOTE, {
      action: action.trim(),
    });

    return { handled: sent, error: sent ? undefined : 'Failed to send emote' };
  }

  /** Handle chat commands */
  private handleCommand(input: string): CommandResult {
    // Parse command and arguments
    const parts = input.slice(1).split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (command) {
      case 'me': {
        // /me <action> - emote
        const action = args.join(' ');
        if (!action) {
          return { handled: false, error: 'Usage: /me <action>' };
        }
        return this.sendEmote(action);
      }

      case 'w':
      case 'whisper':
      case 'msg':
      case 'tell': {
        // /w <player> <message> - whisper
        if (args.length < 2) {
          return { handled: false, error: 'Usage: /w <player> <message>' };
        }
        const target = args[0];
        const message = args.slice(1).join(' ');
        return this.sendWhisper(target, message);
      }

      case 'help': {
        // Show help (handled locally, not sent to server)
        const helpMessage: ChatMessage = {
          id: `help_${Date.now()}`,
          senderId: 'local',
          senderName: 'Help',
          content: 'Commands: /me <action>, /w <player> <message>, /help',
          timestamp: Date.now(),
          type: 'system',
        };
        this.handleChatMessage(helpMessage);
        return { handled: true };
      }

      default:
        return { handled: false, error: `Unknown command: /${command}` };
    }
  }

  /** Get message history */
  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  /** Get recent messages */
  getRecentMessages(count: number = 50): ChatMessage[] {
    return this.messages.slice(-count);
  }

  /** Clear message history */
  clearHistory(): void {
    this.messages = [];
  }

  /** Clean up */
  dispose(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];
    this.messages = [];
  }
}
