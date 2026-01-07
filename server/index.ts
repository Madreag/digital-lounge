import { WebSocketServer, WebSocket as WS } from 'ws';
import { randomUUID } from 'crypto';
import {
  BaseMessage,
  SystemMessageType,
  CloseCode,
  createMessage,
  parseMessage,
  serializeMessage,
  ConnectMessage,
  DisconnectMessage,
  PongMessage,
  ErrorMessage,
} from '../src/lib/websocket/protocol.js';
import {
  PlayerMessageType,
  PlayerJoinMessage,
  PlayerLeaveMessage,
  PlayerStateMessage,
  PlayerPositionMessage,
  PlayerBatchPositionMessage,
  PlayerPositionUpdate,
  isPlayerMessage,
} from '../src/lib/player/types.js';
import {
  ChatMessageType,
  ChatSendMessage,
  ChatWhisperMessage,
  ChatEmoteMessage,
  ChatBroadcastMessage,
  ChatSystemMessage,
  ChatErrorMessage,
  isChatMessage,
  createChatMessage,
  SystemMessages,
} from '../src/lib/chat/types.js';
import { PlayerRegistry } from './PlayerRegistry.js';

const PORT = Number(process.env.WS_PORT) || 8080;
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

interface ClientConnection {
  id: string;
  socket: WS;
  isAlive: boolean;
  connectedAt: number;
  lastPingSeq: number;
  username: string;
  metadata: Record<string, unknown>;
}

class LoungeServer {
  private wss: WebSocketServer;
  private clients: Map<string, ClientConnection> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private playerRegistry: PlayerRegistry;

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });
    this.playerRegistry = new PlayerRegistry();

    this.setupServer();
    this.startHeartbeat();
    this.startPlayerBroadcast();

    console.log(`[Server] WebSocket server started on port ${port}`);
  }

  private setupServer(): void {
    this.wss.on('connection', (socket) => {
      const clientId = randomUUID();
      const client: ClientConnection = {
        id: clientId,
        socket,
        isAlive: true,
        connectedAt: Date.now(),
        lastPingSeq: 0,
        username: `Player_${clientId.substring(0, 6)}`,
        metadata: {},
      };

      this.clients.set(clientId, client);
      console.log(`[Server] Client connected: ${clientId} (${this.clients.size} total)`);

      // Send connection confirmation
      const connectMsg = createMessage<ConnectMessage>(
        SystemMessageType.CONNECT,
        { clientId, serverTime: Date.now() },
        'server'
      );
      this.sendTo(client, connectMsg);

      // Add player to registry and broadcast join
      const playerState = this.playerRegistry.addPlayer(clientId, client.username);

      // Send full state to new player
      const allPlayers = this.playerRegistry.getAllPlayers();
      this.sendTo(
        client,
        createMessage<PlayerStateMessage>(
          PlayerMessageType.PLAYER_STATE,
          { players: allPlayers },
          'server'
        )
      );

      // Broadcast new player to others
      this.broadcast(
        createMessage<PlayerJoinMessage>(
          PlayerMessageType.PLAYER_JOIN,
          playerState,
          'server'
        ),
        clientId
      );

      // Send system chat message for player join
      const joinChatMsg = createChatMessage(
        'server',
        'System',
        SystemMessages.playerJoin(client.username),
        'system'
      );
      this.broadcast(
        createMessage<ChatSystemMessage>(
          ChatMessageType.CHAT_SYSTEM,
          joinChatMsg,
          'server'
        )
      );

      socket.on('message', (data) => this.handleMessage(client, data.toString()));
      socket.on('close', (code, reason) => this.handleDisconnect(client, code, reason.toString()));
      socket.on('error', (err) => this.handleError(client, err));
      socket.on('pong', () => {
        client.isAlive = true;
      });
    });

    this.wss.on('error', (error) => {
      console.error('[Server] Server error:', error);
    });
  }

  private handleMessage(client: ClientConnection, data: string): void {
    const msg = parseMessage(data);
    if (!msg) {
      console.warn(`[Server] Invalid message from ${client.id}:`, data.substring(0, 100));
      this.sendTo(
        client,
        createMessage<ErrorMessage>(
          SystemMessageType.ERROR,
          { code: 'INVALID_MESSAGE', message: 'Message could not be parsed' },
          'server'
        )
      );
      return;
    }

    // Handle system messages
    switch (msg.type) {
      case SystemMessageType.PING:
        const pongMsg = createMessage<PongMessage>(
          SystemMessageType.PONG,
          { seq: (msg.payload as { seq: number }).seq, serverTime: Date.now() },
          'server'
        );
        this.sendTo(client, pongMsg);
        return;

      case SystemMessageType.PONG:
        client.isAlive = true;
        return;
    }

    // Handle player messages
    if (isPlayerMessage(msg)) {
      this.handlePlayerMessage(client, msg);
      return;
    }

    // Handle chat messages
    if (isChatMessage(msg)) {
      this.handleChatMessage(client, msg);
      return;
    }

    // Unknown application messages - broadcast to all other clients
    this.broadcast(msg, client.id);
  }

  private handleChatMessage(client: ClientConnection, msg: BaseMessage): void {
    switch (msg.type) {
      case ChatMessageType.CHAT_SEND: {
        const sendMsg = msg as ChatSendMessage;
        const chatMsg = createChatMessage(
          client.id,
          client.username,
          sendMsg.payload.content,
          'chat'
        );

        // Broadcast to all clients including sender
        this.broadcast(
          createMessage<ChatBroadcastMessage>(
            ChatMessageType.CHAT_MESSAGE,
            chatMsg,
            'server'
          )
        );
        break;
      }

      case ChatMessageType.CHAT_WHISPER: {
        const whisperMsg = msg as ChatWhisperMessage;
        const { targetId, targetName, content } = whisperMsg.payload;

        // Find target by ID or name
        let targetClient: ClientConnection | undefined;
        if (targetId) {
          targetClient = this.clients.get(targetId);
        } else if (targetName) {
          for (const c of this.clients.values()) {
            if (c.username.toLowerCase() === targetName.toLowerCase()) {
              targetClient = c;
              break;
            }
          }
        }

        if (!targetClient) {
          // Send error back to sender
          this.sendTo(
            client,
            createMessage<ChatErrorMessage>(
              ChatMessageType.CHAT_ERROR,
              {
                code: 'PLAYER_NOT_FOUND',
                message: SystemMessages.playerNotFound(targetName || targetId || 'unknown'),
              },
              'server'
            )
          );
          return;
        }

        // Create whisper message
        const chatMsg = createChatMessage(
          client.id,
          client.username,
          content,
          'whisper',
          targetClient.id,
          targetClient.username
        );

        // Send to target
        this.sendTo(
          targetClient,
          createMessage<ChatBroadcastMessage>(
            ChatMessageType.CHAT_MESSAGE,
            chatMsg,
            'server'
          )
        );

        // Send confirmation to sender (with swapped target info for display)
        const senderChatMsg = createChatMessage(
          client.id,
          client.username,
          content,
          'whisper',
          targetClient.id,
          targetClient.username
        );
        this.sendTo(
          client,
          createMessage<ChatBroadcastMessage>(
            ChatMessageType.CHAT_MESSAGE,
            senderChatMsg,
            'server'
          )
        );
        break;
      }

      case ChatMessageType.CHAT_EMOTE: {
        const emoteMsg = msg as ChatEmoteMessage;
        const chatMsg = createChatMessage(
          client.id,
          client.username,
          emoteMsg.payload.action,
          'emote'
        );

        // Broadcast to all clients
        this.broadcast(
          createMessage<ChatBroadcastMessage>(
            ChatMessageType.CHAT_MESSAGE,
            chatMsg,
            'server'
          )
        );
        break;
      }

      default:
        console.warn(`[Server] Unknown chat message type: ${msg.type}`);
    }
  }

  private handlePlayerMessage(client: ClientConnection, msg: BaseMessage): void {
    switch (msg.type) {
      case PlayerMessageType.PLAYER_POSITION: {
        const posMsg = msg as PlayerPositionMessage;
        const { position, rotation } = posMsg.payload;
        this.playerRegistry.updatePosition(client.id, position, rotation);
        break;
      }

      case PlayerMessageType.REQUEST_FULL_STATE: {
        const allPlayers = this.playerRegistry.getAllPlayers();
        this.sendTo(
          client,
          createMessage<PlayerStateMessage>(
            PlayerMessageType.PLAYER_STATE,
            { players: allPlayers },
            'server'
          )
        );
        break;
      }

      case PlayerMessageType.PLAYER_STATUS_CHANGE: {
        const payload = msg.payload as { status: 'active' | 'idle' | 'away' };
        this.playerRegistry.updateStatus(client.id, payload.status);
        // Broadcast status change to all
        this.broadcast(msg);
        break;
      }

      default:
        console.warn(`[Server] Unknown player message type: ${msg.type}`);
    }
  }

  private handleDisconnect(client: ClientConnection, code: number, reason: string): void {
    console.log(`[Server] Client disconnected: ${client.id} (code: ${code}, reason: ${reason})`);

    const username = client.username;

    // Remove from registry
    this.playerRegistry.removePlayer(client.id);
    this.clients.delete(client.id);

    // Broadcast player leave
    this.broadcast(
      createMessage<PlayerLeaveMessage>(
        PlayerMessageType.PLAYER_LEAVE,
        { id: client.id, reason },
        'server'
      )
    );

    // Send system chat message for player leave
    const leaveChatMsg = createChatMessage(
      'server',
      'System',
      SystemMessages.playerLeave(username),
      'system'
    );
    this.broadcast(
      createMessage<ChatSystemMessage>(
        ChatMessageType.CHAT_SYSTEM,
        leaveChatMsg,
        'server'
      )
    );

    // Also broadcast system disconnect
    this.broadcast(
      createMessage<DisconnectMessage>(
        SystemMessageType.DISCONNECT,
        { clientId: client.id, reason },
        'server'
      )
    );
  }

  private handleError(client: ClientConnection, error: Error): void {
    console.error(`[Server] Client error (${client.id}):`, error.message);
  }

  private sendTo(client: ClientConnection, msg: BaseMessage): void {
    if (client.socket.readyState === WS.OPEN) {
      client.socket.send(serializeMessage(msg));
    }
  }

  private broadcast(msg: BaseMessage, excludeId?: string): void {
    const data = serializeMessage(msg);
    for (const [id, client] of this.clients) {
      if (id !== excludeId && client.socket.readyState === WS.OPEN) {
        client.socket.send(data);
      }
    }
  }

  private startPlayerBroadcast(): void {
    this.playerRegistry.start((updates: PlayerPositionUpdate[], serverTime: number) => {
      if (updates.length > 0) {
        this.broadcast(
          createMessage<PlayerBatchPositionMessage>(
            PlayerMessageType.PLAYER_BATCH_POSITION,
            { updates, serverTime },
            'server'
          )
        );
      }
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      for (const [id, client] of this.clients) {
        if (!client.isAlive) {
          console.log(`[Server] Client ${id} failed heartbeat, terminating`);
          client.socket.terminate();

          // Clean up player
          this.playerRegistry.removePlayer(id);
          this.clients.delete(id);

          // Broadcast leave
          this.broadcast(
            createMessage<PlayerLeaveMessage>(
              PlayerMessageType.PLAYER_LEAVE,
              { id, reason: 'heartbeat timeout' },
              'server'
            )
          );
          this.broadcast(
            createMessage<DisconnectMessage>(
              SystemMessageType.DISCONNECT,
              { clientId: id, reason: 'heartbeat timeout' },
              'server'
            )
          );
          continue;
        }

        client.isAlive = false;
        client.socket.ping();
      }
    }, HEARTBEAT_INTERVAL);
  }

  public shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.playerRegistry.stop();

    for (const client of this.clients.values()) {
      client.socket.close(CloseCode.GOING_AWAY, 'Server shutting down');
    }

    this.wss.close();
    console.log('[Server] Server shut down');
  }
}

// Start server
const server = new LoungeServer(PORT);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Received SIGINT, shutting down...');
  server.shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[Server] Received SIGTERM, shutting down...');
  server.shutdown();
  process.exit(0);
});
