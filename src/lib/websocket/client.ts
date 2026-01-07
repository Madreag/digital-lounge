/**
 * WebSocket Client Wrapper
 *
 * Provides auto-reconnection, heartbeat, and typed message handling
 * for the Digital Lounge multiplayer client.
 */

import {
  BaseMessage,
  SystemMessageType,
  CloseCode,
  ConnectMessage,
  PingMessage,
  PongMessage,
  createMessage,
  parseMessage,
  serializeMessage,
  isSystemMessage,
} from './protocol.js';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface ClientConfig {
  url: string;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
}

export type MessageHandler<T extends BaseMessage = BaseMessage> = (message: T) => void;
export type StateChangeHandler = (state: ConnectionState, previousState: ConnectionState) => void;

const DEFAULT_CONFIG: Required<Omit<ClientConfig, 'url'>> = {
  autoReconnect: true,
  reconnectInterval: 2000,
  maxReconnectAttempts: 10,
  heartbeatInterval: 25000,
  heartbeatTimeout: 5000,
};

export class LoungeClient {
  private config: Required<ClientConfig>;
  private socket: WebSocket | null = null;
  private clientId: string | null = null;
  private state: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private pingSeq = 0;
  private lastPongTime = 0;

  private messageHandlers: Map<string, Set<MessageHandler>> = new Map();
  private stateChangeHandlers: Set<StateChangeHandler> = new Set();

  constructor(config: ClientConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Current connection state */
  get connectionState(): ConnectionState {
    return this.state;
  }

  /** Our assigned client ID (null until connected) */
  get id(): string | null {
    return this.clientId;
  }

  /** Connect to the WebSocket server */
  connect(): void {
    if (this.state === 'connected' || this.state === 'connecting') {
      return;
    }

    this.setState(this.state === 'disconnected' ? 'connecting' : 'reconnecting');

    try {
      this.socket = new WebSocket(this.config.url);
      this.setupSocketHandlers();
    } catch (error) {
      console.error('[Client] Connection error:', error);
      this.handleConnectionFailure();
    }
  }

  /** Disconnect from the server */
  disconnect(): void {
    this.stopHeartbeat();
    this.stopReconnect();

    if (this.socket) {
      this.socket.close(CloseCode.NORMAL, 'Client disconnected');
      this.socket = null;
    }

    this.clientId = null;
    this.setState('disconnected');
  }

  /** Send a message to the server */
  send<T extends BaseMessage>(type: T['type'], payload: T['payload']): boolean {
    if (this.state !== 'connected' || !this.socket || !this.clientId) {
      console.warn('[Client] Cannot send message: not connected');
      return false;
    }

    const msg = createMessage<T>(type, payload, this.clientId);
    this.socket.send(serializeMessage(msg));
    return true;
  }

  /** Subscribe to messages of a specific type */
  on<T extends BaseMessage>(type: string, handler: MessageHandler<T>): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    this.messageHandlers.get(type)!.add(handler as MessageHandler);

    // Return unsubscribe function
    return () => {
      const handlers = this.messageHandlers.get(type);
      if (handlers) {
        handlers.delete(handler as MessageHandler);
      }
    };
  }

  /** Subscribe to all non-system messages */
  onMessage(handler: MessageHandler): () => void {
    return this.on('*', handler);
  }

  /** Subscribe to connection state changes */
  onStateChange(handler: StateChangeHandler): () => void {
    this.stateChangeHandlers.add(handler);
    return () => {
      this.stateChangeHandlers.delete(handler);
    };
  }

  private setupSocketHandlers(): void {
    if (!this.socket) return;

    this.socket.onopen = () => {
      console.log('[Client] Connected to server');
      this.reconnectAttempts = 0;
    };

    this.socket.onmessage = (event) => {
      const msg = parseMessage(event.data);
      if (!msg) {
        console.warn('[Client] Received invalid message');
        return;
      }

      this.handleMessage(msg);
    };

    this.socket.onclose = (event) => {
      console.log(`[Client] Connection closed: ${event.code} ${event.reason}`);
      this.stopHeartbeat();

      if (
        this.config.autoReconnect &&
        event.code !== CloseCode.NORMAL &&
        this.state !== 'disconnected'
      ) {
        this.handleConnectionFailure();
      } else {
        this.clientId = null;
        this.setState('disconnected');
      }
    };

    this.socket.onerror = (error) => {
      console.error('[Client] Socket error:', error);
    };
  }

  private handleMessage(msg: BaseMessage): void {
    // Handle system messages internally
    if (isSystemMessage(msg)) {
      switch (msg.type) {
        case SystemMessageType.CONNECT:
          const connectMsg = msg as ConnectMessage;
          this.clientId = connectMsg.payload.clientId;
          this.setState('connected');
          this.startHeartbeat();
          console.log(`[Client] Assigned client ID: ${this.clientId}`);
          break;

        case SystemMessageType.PONG:
          const pongMsg = msg as PongMessage;
          this.lastPongTime = Date.now();
          this.clearHeartbeatTimeout();
          break;

        case SystemMessageType.DISCONNECT:
        case SystemMessageType.ERROR:
          // Let these fall through to handlers
          break;
      }
    }

    // Dispatch to type-specific handlers
    const handlers = this.messageHandlers.get(msg.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(msg);
        } catch (error) {
          console.error(`[Client] Handler error for ${msg.type}:`, error);
        }
      }
    }

    // Dispatch to wildcard handlers (non-system messages only)
    if (!isSystemMessage(msg)) {
      const wildcardHandlers = this.messageHandlers.get('*');
      if (wildcardHandlers) {
        for (const handler of wildcardHandlers) {
          try {
            handler(msg);
          } catch (error) {
            console.error('[Client] Wildcard handler error:', error);
          }
        }
      }
    }
  }

  private handleConnectionFailure(): void {
    this.socket = null;
    this.clientId = null;

    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('[Client] Max reconnect attempts reached');
      this.setState('disconnected');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectInterval * Math.min(this.reconnectAttempts, 5);
    console.log(`[Client] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.setState('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (this.state !== 'connected' || !this.socket || !this.clientId) {
        return;
      }

      this.pingSeq++;
      const pingMsg = createMessage<PingMessage>(
        SystemMessageType.PING,
        { seq: this.pingSeq },
        this.clientId
      );
      this.socket.send(serializeMessage(pingMsg));

      // Set timeout for pong response
      this.heartbeatTimeoutTimer = setTimeout(() => {
        console.warn('[Client] Heartbeat timeout, closing connection');
        this.socket?.close(CloseCode.HEARTBEAT_TIMEOUT, 'Heartbeat timeout');
      }, this.config.heartbeatTimeout);
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.clearHeartbeatTimeout();
  }

  private clearHeartbeatTimeout(): void {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  private stopReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
  }

  private setState(newState: ConnectionState): void {
    if (this.state === newState) return;

    const previousState = this.state;
    this.state = newState;

    for (const handler of this.stateChangeHandlers) {
      try {
        handler(newState, previousState);
      } catch (error) {
        console.error('[Client] State change handler error:', error);
      }
    }
  }
}
