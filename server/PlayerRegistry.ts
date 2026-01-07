/**
 * Server-Side Player Registry
 *
 * Manages player state and handles position broadcasts at 30fps tick rate.
 */

import {
  PlayerState,
  PlayerPositionUpdate,
  Vector3,
  createDefaultPlayerState,
} from '../src/lib/player/types.js';

/** Extended player state with server-side tracking */
interface ServerPlayerState extends PlayerState {
  lastUpdate: number;
  dirty: boolean; // Has position changed since last broadcast
}

export class PlayerRegistry {
  private players: Map<string, ServerPlayerState> = new Map();
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private onBroadcast: ((updates: PlayerPositionUpdate[], serverTime: number) => void) | null = null;

  // 30fps = ~33ms tick rate
  private readonly TICK_RATE = 1000 / 30;

  constructor() {}

  /** Start the position broadcast tick */
  start(onBroadcast: (updates: PlayerPositionUpdate[], serverTime: number) => void): void {
    this.onBroadcast = onBroadcast;

    if (this.tickInterval) {
      clearInterval(this.tickInterval);
    }

    this.tickInterval = setInterval(() => {
      this.tick();
    }, this.TICK_RATE);

    console.log(`[PlayerRegistry] Started with ${this.TICK_RATE}ms tick rate (30fps)`);
  }

  /** Stop the broadcast tick */
  stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.onBroadcast = null;
    console.log('[PlayerRegistry] Stopped');
  }

  /** Add a new player to the registry */
  addPlayer(clientId: string, username: string): PlayerState {
    const state = createDefaultPlayerState(clientId, username);
    const serverState: ServerPlayerState = {
      ...state,
      lastUpdate: Date.now(),
      dirty: true, // Mark as dirty so they appear in next broadcast
    };

    this.players.set(clientId, serverState);
    console.log(`[PlayerRegistry] Player added: ${username} (${clientId})`);

    return state;
  }

  /** Remove a player from the registry */
  removePlayer(clientId: string): PlayerState | null {
    const player = this.players.get(clientId);
    if (player) {
      this.players.delete(clientId);
      console.log(`[PlayerRegistry] Player removed: ${player.username} (${clientId})`);
      return player;
    }
    return null;
  }

  /** Update a player's position */
  updatePosition(clientId: string, position: Vector3, rotation: Vector3): boolean {
    const player = this.players.get(clientId);
    if (!player) {
      return false;
    }

    player.position = position;
    player.rotation = rotation;
    player.lastUpdate = Date.now();
    player.dirty = true;

    return true;
  }

  /** Update a player's status */
  updateStatus(clientId: string, status: PlayerState['status']): boolean {
    const player = this.players.get(clientId);
    if (!player) {
      return false;
    }

    player.status = status;
    player.lastUpdate = Date.now();

    return true;
  }

  /** Get a specific player's state */
  getPlayer(clientId: string): PlayerState | null {
    const player = this.players.get(clientId);
    if (!player) {
      return null;
    }

    // Return public state without server-side fields
    return this.toPublicState(player);
  }

  /** Get all players' states */
  getAllPlayers(): PlayerState[] {
    return Array.from(this.players.values()).map(p => this.toPublicState(p));
  }

  /** Get count of active players */
  get playerCount(): number {
    return this.players.size;
  }

  /** Broadcast tick - collects dirty positions and sends update */
  private tick(): void {
    if (!this.onBroadcast || this.players.size === 0) {
      return;
    }

    const updates: PlayerPositionUpdate[] = [];
    const serverTime = Date.now();

    for (const player of this.players.values()) {
      if (player.dirty) {
        updates.push({
          id: player.id,
          position: { ...player.position },
          rotation: { ...player.rotation },
          timestamp: player.lastUpdate,
        });
        player.dirty = false;
      }
    }

    // Only broadcast if there are actual updates
    if (updates.length > 0) {
      this.onBroadcast(updates, serverTime);
    }
  }

  /** Convert server state to public state */
  private toPublicState(server: ServerPlayerState): PlayerState {
    return {
      id: server.id,
      username: server.username,
      position: { ...server.position },
      rotation: { ...server.rotation },
      avatar: server.avatar,
      status: server.status,
      color: server.color,
    };
  }
}
