/**
 * Avatar System
 *
 * Modular 3D player avatar system for multiplayer lounges.
 *
 * Features:
 * - Capsule body + sphere head avatar design
 * - Canvas-based username label sprites
 * - Status indicator orbs (active/idle/away)
 * - Position buffering and lerp interpolation for smooth remote player movement
 * - AvatarManager for spawning/despawning multiple avatars
 * - Proximity-based avatar queries
 *
 * Usage:
 * ```ts
 * import { Avatar, AvatarManager } from './lib/avatar';
 *
 * // Create manager
 * const avatarManager = new AvatarManager(scene);
 * avatarManager.setLocalPlayerId(myId);
 *
 * // Spawn avatars for remote players
 * avatarManager.spawn({ id, username, position, rotation, status: 'active' });
 *
 * // Push position updates from server
 * avatarManager.pushBatchPositionUpdate(updates);
 *
 * // In render loop
 * avatarManager.update(deltaTime);
 *
 * // Despawn when player leaves
 * avatarManager.despawn(id);
 * ```
 */

export { Avatar } from './Avatar.js';
export { AvatarManager } from './AvatarManager.js';
export * from './types.js';
