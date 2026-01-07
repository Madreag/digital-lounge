/**
 * Chat Message Types
 *
 * Defines the schema for chat messages and multiplayer chat protocol.
 */

import { BaseMessage } from '../websocket/protocol.js';

/** Types of chat messages */
export type ChatType = 'chat' | 'system' | 'whisper' | 'emote';

/** Chat message schema */
export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  type: ChatType;
  targetId?: string; // For whispers
  targetName?: string; // For whispers
}

/** Message types for chat synchronization */
export enum ChatMessageType {
  // Client -> Server
  CHAT_SEND = 'chat:send',
  CHAT_WHISPER = 'chat:whisper',
  CHAT_EMOTE = 'chat:emote',

  // Server -> Client(s)
  CHAT_MESSAGE = 'chat:message',
  CHAT_SYSTEM = 'chat:system',
  CHAT_ERROR = 'chat:error',
}

/** Client sends a chat message */
export interface ChatSendMessage extends BaseMessage {
  type: ChatMessageType.CHAT_SEND;
  payload: {
    content: string;
  };
}

/** Client sends a whisper to specific player */
export interface ChatWhisperMessage extends BaseMessage {
  type: ChatMessageType.CHAT_WHISPER;
  payload: {
    targetId?: string;
    targetName?: string; // Can target by name
    content: string;
  };
}

/** Client sends an emote (/me action) */
export interface ChatEmoteMessage extends BaseMessage {
  type: ChatMessageType.CHAT_EMOTE;
  payload: {
    action: string;
  };
}

/** Server broadcasts a chat message to clients */
export interface ChatBroadcastMessage extends BaseMessage {
  type: ChatMessageType.CHAT_MESSAGE;
  payload: ChatMessage;
}

/** Server sends a system message (join/leave/etc.) */
export interface ChatSystemMessage extends BaseMessage {
  type: ChatMessageType.CHAT_SYSTEM;
  payload: ChatMessage;
}

/** Server sends chat error to client */
export interface ChatErrorMessage extends BaseMessage {
  type: ChatMessageType.CHAT_ERROR;
  payload: {
    code: string;
    message: string;
  };
}

/** Union of all chat messages */
export type ChatMessageUnion =
  | ChatSendMessage
  | ChatWhisperMessage
  | ChatEmoteMessage
  | ChatBroadcastMessage
  | ChatSystemMessage
  | ChatErrorMessage;

/** Type guard for chat messages */
export function isChatMessage(msg: BaseMessage): msg is ChatMessageUnion {
  return msg.type.startsWith('chat:');
}

/** Generate a unique chat message ID */
export function generateChatId(): string {
  return `chat_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/** Create a chat message object */
export function createChatMessage(
  senderId: string,
  senderName: string,
  content: string,
  type: ChatType,
  targetId?: string,
  targetName?: string
): ChatMessage {
  return {
    id: generateChatId(),
    senderId,
    senderName,
    content,
    timestamp: Date.now(),
    type,
    targetId,
    targetName,
  };
}

/** System message content generators */
export const SystemMessages = {
  playerJoin: (playerName: string) => `${playerName} joined the lounge`,
  playerLeave: (playerName: string) => `${playerName} left the lounge`,
  whisperSent: (targetName: string) => `Whisper sent to ${targetName}`,
  playerNotFound: (targetName: string) => `Player "${targetName}" not found`,
};
