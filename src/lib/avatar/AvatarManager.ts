/**
 * Avatar Manager
 *
 * Manages the lifecycle of player avatars in the 3D scene.
 * Handles spawning, despawning, and updating avatars based on
 * player state changes from the network layer.
 *
 * Usage:
 * ```ts
 * const manager = new AvatarManager(scene);
 *
 * // Spawn avatar when player joins
 * manager.spawn({ id: 'player-1', username: 'Alice', ... });
 *
 * // Update positions from server
 * manager.pushPositionUpdate('player-1', { position, rotation, timestamp });
 *
 * // In render loop
 * manager.update(deltaTime);
 *
 * // Despawn when player leaves
 * manager.despawn('player-1');
 * ```
 */

import * as THREE from 'three';
import { Avatar } from './Avatar.js';
import {
  AvatarPlayerState,
  AvatarConfig,
  AvatarManagerConfig,
  AvatarManagerEvents,
  PositionUpdate,
  PlayerStatus,
} from './types.js';

/** Default manager configuration */
const DEFAULT_CONFIG: Required<AvatarManagerConfig> = {
  interpolationDelay: 100,
  maxBufferSize: 10,
  lerpSpeed: 0.15,
};

export class AvatarManager {
  /** Three.js scene to add avatars to */
  private scene: THREE.Scene;

  /** Map of player ID to Avatar instance */
  private avatars: Map<string, Avatar> = new Map();

  /** Configuration */
  private config: Required<AvatarManagerConfig>;

  /** Avatar mesh configuration */
  private avatarConfig: AvatarConfig;

  /** Event callbacks */
  private events: AvatarManagerEvents;

  /** Local player ID (to exclude from rendering) */
  private localPlayerId: string | null = null;

  constructor(
    scene: THREE.Scene,
    config?: AvatarManagerConfig,
    avatarConfig?: AvatarConfig,
    events?: AvatarManagerEvents
  ) {
    this.scene = scene;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.avatarConfig = avatarConfig ?? {};
    this.events = events ?? {};
  }

  /**
   * Set the local player ID.
   * The local player's avatar will not be managed by this manager
   * (since the local player is typically controlled by camera/first-person view).
   */
  setLocalPlayerId(id: string | null): void {
    this.localPlayerId = id;

    // Remove local player avatar if it exists
    if (id && this.avatars.has(id)) {
      this.despawn(id);
    }
  }

  /**
   * Spawn an avatar for a player.
   * Returns the created Avatar instance.
   */
  spawn(state: AvatarPlayerState): Avatar | null {
    // Don't spawn for local player
    if (state.id === this.localPlayerId) {
      return null;
    }

    // Check if already exists
    if (this.avatars.has(state.id)) {
      console.warn(`[AvatarManager] Avatar for ${state.id} already exists`);
      return this.avatars.get(state.id)!;
    }

    // Create avatar
    const avatar = new Avatar(state, this.avatarConfig, {
      interpolationDelay: this.config.interpolationDelay,
      maxBufferSize: this.config.maxBufferSize,
      lerpSpeed: this.config.lerpSpeed,
    });

    // Add to scene and registry
    this.avatars.set(state.id, avatar);
    this.scene.add(avatar.mesh);

    // Emit event
    this.events.onAvatarSpawn?.(state.id);

    return avatar;
  }

  /**
   * Despawn an avatar by player ID.
   */
  despawn(id: string): boolean {
    const avatar = this.avatars.get(id);
    if (!avatar) {
      return false;
    }

    // Remove from scene
    this.scene.remove(avatar.mesh);

    // Clean up resources
    avatar.dispose();

    // Remove from registry
    this.avatars.delete(id);

    // Emit event
    this.events.onAvatarDespawn?.(id);

    return true;
  }

  /**
   * Despawn all avatars.
   */
  despawnAll(): void {
    for (const id of this.avatars.keys()) {
      this.despawn(id);
    }
  }

  /**
   * Get an avatar by player ID.
   */
  getAvatar(id: string): Avatar | undefined {
    return this.avatars.get(id);
  }

  /**
   * Check if an avatar exists for a player.
   */
  hasAvatar(id: string): boolean {
    return this.avatars.has(id);
  }

  /**
   * Get all avatar instances.
   */
  getAllAvatars(): Avatar[] {
    return Array.from(this.avatars.values());
  }

  /**
   * Get avatar count.
   */
  get count(): number {
    return this.avatars.size;
  }

  /**
   * Push a position update to a specific avatar's interpolation buffer.
   */
  pushPositionUpdate(id: string, update: PositionUpdate): void {
    if (id === this.localPlayerId) return;

    const avatar = this.avatars.get(id);
    if (avatar) {
      avatar.pushPositionUpdate(update);
    }
  }

  /**
   * Push batch position updates from server tick.
   */
  pushBatchPositionUpdate(
    updates: Array<{ id: string } & PositionUpdate>
  ): void {
    for (const update of updates) {
      this.pushPositionUpdate(update.id, update);
    }
  }

  /**
   * Update a player's status.
   */
  updateStatus(id: string, status: PlayerStatus): void {
    const avatar = this.avatars.get(id);
    if (avatar) {
      avatar.updateStatus(status);
    }
  }

  /**
   * Update a player's full state.
   */
  updateState(id: string, state: Partial<AvatarPlayerState>): void {
    const avatar = this.avatars.get(id);
    if (avatar) {
      avatar.updateState(state);
    }
  }

  /**
   * Sync state with full player list from server.
   * Spawns new avatars, updates existing ones, and removes stale ones.
   */
  syncState(players: AvatarPlayerState[]): void {
    const incomingIds = new Set<string>();

    for (const state of players) {
      // Skip local player
      if (state.id === this.localPlayerId) continue;

      incomingIds.add(state.id);

      if (this.avatars.has(state.id)) {
        // Update existing avatar
        this.updateState(state.id, state);
      } else {
        // Spawn new avatar
        this.spawn(state);
      }
    }

    // Remove avatars for players no longer in the list
    for (const id of this.avatars.keys()) {
      if (!incomingIds.has(id)) {
        this.despawn(id);
      }
    }
  }

  /**
   * Update all avatars. Call this every frame in the render loop.
   * @param deltaTime Time since last frame in seconds
   */
  update(deltaTime: number): void {
    for (const avatar of this.avatars.values()) {
      avatar.update(deltaTime);
    }
  }

  /**
   * Find avatars within a radius of a point (for proximity interactions).
   */
  findNearby(
    position: { x: number; y: number; z: number },
    radius: number
  ): Avatar[] {
    const results: Avatar[] = [];
    const target = new THREE.Vector3(position.x, position.y, position.z);
    const radiusSq = radius * radius;

    for (const avatar of this.avatars.values()) {
      if (avatar.position.distanceToSquared(target) <= radiusSq) {
        results.push(avatar);
      }
    }

    return results;
  }

  /**
   * Get the closest avatar to a point.
   */
  findClosest(position: { x: number; y: number; z: number }): Avatar | null {
    const target = new THREE.Vector3(position.x, position.y, position.z);
    let closest: Avatar | null = null;
    let closestDistSq = Infinity;

    for (const avatar of this.avatars.values()) {
      const distSq = avatar.position.distanceToSquared(target);
      if (distSq < closestDistSq) {
        closest = avatar;
        closestDistSq = distSq;
      }
    }

    return closest;
  }

  /**
   * Clean up all resources.
   */
  dispose(): void {
    this.despawnAll();
  }
}
