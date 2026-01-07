/**
 * Player Manager
 *
 * Manages local and remote players, connecting WebSocket events
 * to the 3D scene. Handles join/leave events and state synchronization.
 */

import * as THREE from 'three';
import { LoungeClient } from '../websocket/client.js';
import {
  PlayerState,
  PlayerMessageType,
  PlayerJoinMessage,
  PlayerLeaveMessage,
  PlayerStateMessage,
  PlayerPositionMessage,
  PlayerBatchPositionMessage,
  PlayerStatusChangeMessage,
  Vector3,
} from './types.js';
import { RemotePlayer } from './RemotePlayer.js';

/** Position update throttle (60fps client-side, but we only send at ~30fps) */
const POSITION_UPDATE_INTERVAL = 1000 / 30;

export class PlayerManager {
  private scene: THREE.Scene;
  private client: LoungeClient;
  private remotePlayers: Map<string, RemotePlayer> = new Map();
  private localPlayerId: string | null = null;
  private localPosition: Vector3 = { x: 0, y: 0, z: 0 };
  private localRotation: Vector3 = { x: 0, y: 0, z: 0 };
  private lastPositionUpdate = 0;
  private unsubscribers: (() => void)[] = [];

  // Event callbacks
  public onPlayerJoin: ((state: PlayerState) => void) | null = null;
  public onPlayerLeave: ((id: string) => void) | null = null;
  public onPlayersLoaded: ((players: PlayerState[]) => void) | null = null;

  constructor(scene: THREE.Scene, client: LoungeClient) {
    this.scene = scene;
    this.client = client;
    this.setupMessageHandlers();
  }

  private setupMessageHandlers(): void {
    // Handle full state sync (on connect/request)
    this.unsubscribers.push(
      this.client.on<PlayerStateMessage>(PlayerMessageType.PLAYER_STATE, (msg) => {
        this.handleFullState(msg.payload.players);
      })
    );

    // Handle new player joining
    this.unsubscribers.push(
      this.client.on<PlayerJoinMessage>(PlayerMessageType.PLAYER_JOIN, (msg) => {
        this.handlePlayerJoin(msg.payload);
      })
    );

    // Handle player leaving
    this.unsubscribers.push(
      this.client.on<PlayerLeaveMessage>(PlayerMessageType.PLAYER_LEAVE, (msg) => {
        this.handlePlayerLeave(msg.payload.id);
      })
    );

    // Handle batch position updates
    this.unsubscribers.push(
      this.client.on<PlayerBatchPositionMessage>(PlayerMessageType.PLAYER_BATCH_POSITION, (msg) => {
        this.handleBatchPositionUpdate(msg.payload.updates);
      })
    );

    // Handle status changes
    this.unsubscribers.push(
      this.client.on<PlayerStatusChangeMessage>(PlayerMessageType.PLAYER_STATUS_CHANGE, (msg) => {
        this.handleStatusChange(msg.payload.id, msg.payload.status);
      })
    );

    // Track connection state for local player ID
    this.unsubscribers.push(
      this.client.onStateChange((state) => {
        if (state === 'connected') {
          this.localPlayerId = this.client.id;
          console.log(`[PlayerManager] Local player ID: ${this.localPlayerId}`);
        } else if (state === 'disconnected') {
          this.clearAllPlayers();
          this.localPlayerId = null;
        }
      })
    );
  }

  /** Initialize with full player state */
  private handleFullState(players: PlayerState[]): void {
    console.log(`[PlayerManager] Received full state with ${players.length} players`);

    // Clear existing remote players
    this.clearAllPlayers();

    // Add all players except local
    for (const state of players) {
      if (state.id !== this.localPlayerId) {
        this.addRemotePlayer(state);
      }
    }

    this.onPlayersLoaded?.(players);
  }

  /** Handle a new player joining */
  private handlePlayerJoin(state: PlayerState): void {
    console.log(`[PlayerManager] Player joined: ${state.username} (${state.id})`);

    if (state.id === this.localPlayerId) {
      return; // Don't create remote mesh for local player
    }

    this.addRemotePlayer(state);
    this.onPlayerJoin?.(state);
  }

  /** Handle a player leaving */
  private handlePlayerLeave(id: string): void {
    console.log(`[PlayerManager] Player left: ${id}`);
    this.removeRemotePlayer(id);
    this.onPlayerLeave?.(id);
  }

  /** Handle batch position updates from server */
  private handleBatchPositionUpdate(updates: { id: string; position: Vector3; rotation: Vector3; timestamp: number }[]): void {
    for (const update of updates) {
      // Skip local player updates
      if (update.id === this.localPlayerId) {
        continue;
      }

      const player = this.remotePlayers.get(update.id);
      if (player) {
        player.pushPositionUpdate(update);
      }
    }
  }

  /** Handle player status change */
  private handleStatusChange(id: string, status: PlayerState['status']): void {
    const player = this.remotePlayers.get(id);
    if (player) {
      player.updateStatus(status);
    }
  }

  /** Add a remote player to the scene */
  private addRemotePlayer(state: PlayerState): void {
    if (this.remotePlayers.has(state.id)) {
      console.warn(`[PlayerManager] Player ${state.id} already exists`);
      return;
    }

    const remotePlayer = new RemotePlayer(state);
    this.remotePlayers.set(state.id, remotePlayer);
    this.scene.add(remotePlayer.mesh);
  }

  /** Remove a remote player from the scene */
  private removeRemotePlayer(id: string): void {
    const player = this.remotePlayers.get(id);
    if (player) {
      this.scene.remove(player.mesh);
      player.dispose();
      this.remotePlayers.delete(id);
    }
  }

  /** Clear all remote players */
  private clearAllPlayers(): void {
    for (const player of this.remotePlayers.values()) {
      this.scene.remove(player.mesh);
      player.dispose();
    }
    this.remotePlayers.clear();
  }

  /** Update local player position (call from game loop) */
  setLocalPosition(position: Vector3, rotation: Vector3): void {
    this.localPosition = position;
    this.localRotation = rotation;

    // Throttle position updates to server
    const now = Date.now();
    if (now - this.lastPositionUpdate >= POSITION_UPDATE_INTERVAL) {
      this.sendPositionUpdate();
      this.lastPositionUpdate = now;
    }
  }

  /** Send position update to server */
  private sendPositionUpdate(): void {
    if (!this.localPlayerId || this.client.connectionState !== 'connected') {
      return;
    }

    this.client.send<PlayerPositionMessage>(PlayerMessageType.PLAYER_POSITION, {
      id: this.localPlayerId,
      position: this.localPosition,
      rotation: this.localRotation,
      timestamp: Date.now(),
    });
  }

  /** Update all remote players (call from render loop) */
  update(deltaTime: number): void {
    for (const player of this.remotePlayers.values()) {
      player.update(deltaTime);
    }
  }

  /** Get remote player count */
  get playerCount(): number {
    return this.remotePlayers.size;
  }

  /** Get all remote players */
  getRemotePlayers(): RemotePlayer[] {
    return Array.from(this.remotePlayers.values());
  }

  /** Clean up */
  dispose(): void {
    // Unsubscribe from all message handlers
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];

    // Clear all players
    this.clearAllPlayers();
  }
}
