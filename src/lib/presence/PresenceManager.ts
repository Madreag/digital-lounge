/**
 * Presence Manager
 *
 * Manages player presence state including:
 * - Player list tracking
 * - Status auto-detection (active/idle/away)
 * - Typing indicators
 * - Join/leave event dispatching
 */

import { LoungeClient } from '../websocket/client.js';
import {
  PlayerState,
  PlayerStatus,
  PlayerMessageType,
  PlayerJoinMessage,
  PlayerLeaveMessage,
  PlayerStateMessage,
  PlayerStatusChangeMessage,
  PlayerTypingMessage,
} from '../player/types.js';

/** Idle timeout: 60 seconds without input */
const IDLE_TIMEOUT = 60 * 1000;

/** Away timeout: 5 minutes without input */
const AWAY_TIMEOUT = 5 * 60 * 1000;

/** Typing timeout: stop showing typing after 3 seconds */
const TYPING_TIMEOUT = 3000;

export interface PresenceEventMap {
  'player:join': PlayerState;
  'player:leave': { id: string; username: string };
  'player:status': { id: string; status: PlayerStatus };
  'player:typing': { id: string; username: string; isTyping: boolean };
  'players:update': PlayerState[];
}

export type PresenceEventHandler<K extends keyof PresenceEventMap> = (
  data: PresenceEventMap[K]
) => void;

export class PresenceManager {
  private client: LoungeClient;
  private players: Map<string, PlayerState> = new Map();
  private localPlayerId: string | null = null;
  private localStatus: PlayerStatus = 'active';
  private localIsTyping = false;

  private lastInputTime = Date.now();
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  private typingTimer: ReturnType<typeof setTimeout> | null = null;

  private eventHandlers: Map<string, Set<PresenceEventHandler<keyof PresenceEventMap>>> = new Map();
  private unsubscribers: (() => void)[] = [];

  constructor(client: LoungeClient) {
    this.client = client;
    this.setupMessageHandlers();
    this.setupActivityTracking();
  }

  /** Get all online players */
  getPlayers(): PlayerState[] {
    return Array.from(this.players.values());
  }

  /** Get player count */
  get playerCount(): number {
    return this.players.size;
  }

  /** Get local player ID */
  get localId(): string | null {
    return this.localPlayerId;
  }

  /** Get players currently typing (excluding self) */
  getTypingPlayers(): PlayerState[] {
    return this.getPlayers().filter(
      (p) => p.isTyping && p.id !== this.localPlayerId
    );
  }

  /** Subscribe to presence events */
  on<K extends keyof PresenceEventMap>(
    event: K,
    handler: PresenceEventHandler<K>
  ): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler as PresenceEventHandler<keyof PresenceEventMap>);

    return () => {
      const handlers = this.eventHandlers.get(event);
      if (handlers) {
        handlers.delete(handler as PresenceEventHandler<keyof PresenceEventMap>);
      }
    };
  }

  /** Notify that local user started/stopped typing */
  setTyping(isTyping: boolean): void {
    if (this.localIsTyping === isTyping) return;

    this.localIsTyping = isTyping;

    // Clear existing typing timeout
    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
      this.typingTimer = null;
    }

    // Send typing indicator to server
    this.client.send<PlayerTypingMessage>(PlayerMessageType.PLAYER_TYPING, {
      id: this.localPlayerId!,
      isTyping,
    });

    // Auto-clear typing after timeout
    if (isTyping) {
      this.typingTimer = setTimeout(() => {
        this.setTyping(false);
      }, TYPING_TIMEOUT);
    }
  }

  /** Record user activity (resets idle timer) */
  recordActivity(): void {
    this.lastInputTime = Date.now();

    if (this.localStatus !== 'active') {
      this.updateLocalStatus('active');
    }
  }

  /** Clean up */
  dispose(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];

    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }

    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
      this.typingTimer = null;
    }

    document.removeEventListener('mousemove', this.handleUserInput);
    document.removeEventListener('keydown', this.handleUserInput);
    document.removeEventListener('mousedown', this.handleUserInput);
    document.removeEventListener('touchstart', this.handleUserInput);
  }

  private setupMessageHandlers(): void {
    // Handle full state sync
    this.unsubscribers.push(
      this.client.on<PlayerStateMessage>(PlayerMessageType.PLAYER_STATE, (msg) => {
        this.players.clear();
        for (const player of msg.payload.players) {
          this.players.set(player.id, player);
        }
        this.emit('players:update', this.getPlayers());
      })
    );

    // Handle player join
    this.unsubscribers.push(
      this.client.on<PlayerJoinMessage>(PlayerMessageType.PLAYER_JOIN, (msg) => {
        const player = msg.payload;
        this.players.set(player.id, player);
        this.emit('player:join', player);
        this.emit('players:update', this.getPlayers());
      })
    );

    // Handle player leave
    this.unsubscribers.push(
      this.client.on<PlayerLeaveMessage>(PlayerMessageType.PLAYER_LEAVE, (msg) => {
        const player = this.players.get(msg.payload.id);
        if (player) {
          this.players.delete(msg.payload.id);
          this.emit('player:leave', { id: player.id, username: player.username });
          this.emit('players:update', this.getPlayers());
        }
      })
    );

    // Handle status changes
    this.unsubscribers.push(
      this.client.on<PlayerStatusChangeMessage>(PlayerMessageType.PLAYER_STATUS_CHANGE, (msg) => {
        const player = this.players.get(msg.payload.id);
        if (player) {
          player.status = msg.payload.status;
          this.emit('player:status', { id: player.id, status: msg.payload.status });
          this.emit('players:update', this.getPlayers());
        }
      })
    );

    // Handle typing indicators
    this.unsubscribers.push(
      this.client.on<PlayerTypingMessage>(PlayerMessageType.PLAYER_TYPING, (msg) => {
        const player = this.players.get(msg.payload.id);
        if (player && player.id !== this.localPlayerId) {
          player.isTyping = msg.payload.isTyping;
          this.emit('player:typing', {
            id: player.id,
            username: player.username,
            isTyping: msg.payload.isTyping,
          });
        }
      })
    );

    // Track connection state
    this.unsubscribers.push(
      this.client.onStateChange((state) => {
        if (state === 'connected') {
          this.localPlayerId = this.client.id;
        } else if (state === 'disconnected') {
          this.players.clear();
          this.localPlayerId = null;
          this.emit('players:update', []);
        }
      })
    );
  }

  private setupActivityTracking(): void {
    // Listen for user input
    document.addEventListener('mousemove', this.handleUserInput);
    document.addEventListener('keydown', this.handleUserInput);
    document.addEventListener('mousedown', this.handleUserInput);
    document.addEventListener('touchstart', this.handleUserInput);

    // Check idle status periodically
    this.idleTimer = setInterval(() => {
      this.checkIdleStatus();
    }, 5000);
  }

  private handleUserInput = (): void => {
    this.recordActivity();
  };

  private checkIdleStatus(): void {
    const elapsed = Date.now() - this.lastInputTime;

    let newStatus: PlayerStatus = 'active';
    if (elapsed >= AWAY_TIMEOUT) {
      newStatus = 'away';
    } else if (elapsed >= IDLE_TIMEOUT) {
      newStatus = 'idle';
    }

    if (newStatus !== this.localStatus) {
      this.updateLocalStatus(newStatus);
    }
  }

  private updateLocalStatus(status: PlayerStatus): void {
    this.localStatus = status;

    if (this.client.connectionState === 'connected' && this.localPlayerId) {
      this.client.send<PlayerStatusChangeMessage>(PlayerMessageType.PLAYER_STATUS_CHANGE, {
        id: this.localPlayerId,
        status,
      });
    }

    // Update local player in map
    const localPlayer = this.players.get(this.localPlayerId!);
    if (localPlayer) {
      localPlayer.status = status;
      this.emit('players:update', this.getPlayers());
    }
  }

  private emit<K extends keyof PresenceEventMap>(event: K, data: PresenceEventMap[K]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (error) {
          console.error(`[PresenceManager] Event handler error for ${event}:`, error);
        }
      }
    }
  }
}
