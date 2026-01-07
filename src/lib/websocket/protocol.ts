/**
 * WebSocket Message Protocol
 *
 * All messages follow a consistent structure for type-safe communication
 * between server and clients.
 */

/** Base message structure all messages must follow */
export interface BaseMessage {
  type: string;
  payload: unknown;
  timestamp: number;
  senderId: string;
}

/** System message types for connection management */
export enum SystemMessageType {
  PING = 'system:ping',
  PONG = 'system:pong',
  CONNECT = 'system:connect',
  DISCONNECT = 'system:disconnect',
  ERROR = 'system:error',
  ACK = 'system:ack',
}

/** Connection state for a client */
export interface ConnectionInfo {
  clientId: string;
  connectedAt: number;
  lastPingAt: number;
  metadata?: Record<string, unknown>;
}

/** System messages */
export interface PingMessage extends BaseMessage {
  type: SystemMessageType.PING;
  payload: { seq: number };
}

export interface PongMessage extends BaseMessage {
  type: SystemMessageType.PONG;
  payload: { seq: number; serverTime: number };
}

export interface ConnectMessage extends BaseMessage {
  type: SystemMessageType.CONNECT;
  payload: {
    clientId: string;
    serverTime: number;
  };
}

export interface DisconnectMessage extends BaseMessage {
  type: SystemMessageType.DISCONNECT;
  payload: {
    clientId: string;
    reason?: string;
  };
}

export interface ErrorMessage extends BaseMessage {
  type: SystemMessageType.ERROR;
  payload: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface AckMessage extends BaseMessage {
  type: SystemMessageType.ACK;
  payload: {
    originalType: string;
    success: boolean;
  };
}

/** Union of all system messages */
export type SystemMessage =
  | PingMessage
  | PongMessage
  | ConnectMessage
  | DisconnectMessage
  | ErrorMessage
  | AckMessage;

/** Type guard to check if a message is a system message */
export function isSystemMessage(msg: BaseMessage): msg is SystemMessage {
  return msg.type.startsWith('system:');
}

/** Create a properly typed message */
export function createMessage<T extends BaseMessage>(
  type: T['type'],
  payload: T['payload'],
  senderId: string
): T {
  return {
    type,
    payload,
    timestamp: Date.now(),
    senderId,
  } as T;
}

/** Parse raw WebSocket data into a typed message */
export function parseMessage(data: string): BaseMessage | null {
  try {
    const parsed = JSON.parse(data);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.type === 'string' &&
      'payload' in parsed &&
      typeof parsed.timestamp === 'number' &&
      typeof parsed.senderId === 'string'
    ) {
      return parsed as BaseMessage;
    }
    return null;
  } catch {
    return null;
  }
}

/** Serialize a message for transmission */
export function serializeMessage(msg: BaseMessage): string {
  return JSON.stringify(msg);
}

/** Connection close codes */
export enum CloseCode {
  NORMAL = 1000,
  GOING_AWAY = 1001,
  PROTOCOL_ERROR = 1002,
  INVALID_DATA = 1003,
  POLICY_VIOLATION = 1008,
  MESSAGE_TOO_BIG = 1009,
  INTERNAL_ERROR = 1011,
  // Custom codes (4000-4999)
  HEARTBEAT_TIMEOUT = 4000,
  AUTH_FAILED = 4001,
  KICKED = 4002,
}
