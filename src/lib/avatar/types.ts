/**
 * Avatar System Types
 *
 * Type definitions for the 3D player avatar system.
 */

/** 3D vector for position and rotation */
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/** Player status indicator */
export type PlayerStatus = 'active' | 'idle' | 'away';

/** Avatar visual style configuration */
export interface AvatarStyle {
  /** Body color (hex) */
  bodyColor: number;
  /** Head color (hex, optional - defaults to lighter shade) */
  headColor?: number;
  /** Eye color (hex, defaults to dark) */
  eyeColor?: number;
}

/** Player state required for avatar rendering */
export interface AvatarPlayerState {
  id: string;
  username: string;
  position: Vector3;
  rotation: Vector3;
  status: PlayerStatus;
  style?: AvatarStyle;
}

/** Position update with timestamp for interpolation */
export interface PositionUpdate {
  position: Vector3;
  rotation: Vector3;
  timestamp: number;
}

/** Avatar configuration options */
export interface AvatarConfig {
  /** Body capsule radius (default: 0.3) */
  bodyRadius?: number;
  /** Body capsule height (default: 0.8) */
  bodyHeight?: number;
  /** Head sphere radius (default: 0.25) */
  headRadius?: number;
  /** Enable shadow casting (default: true) */
  castShadow?: boolean;
  /** Enable name label (default: true) */
  showNameLabel?: boolean;
  /** Enable status indicator (default: true) */
  showStatusIndicator?: boolean;
}

/** AvatarManager configuration */
export interface AvatarManagerConfig {
  /** Interpolation delay in ms (default: 100) */
  interpolationDelay?: number;
  /** Maximum position buffer size (default: 10) */
  maxBufferSize?: number;
  /** Lerp speed for smooth catch-up (default: 0.15) */
  lerpSpeed?: number;
}

/** Avatar event callbacks */
export interface AvatarManagerEvents {
  /** Called when an avatar is spawned */
  onAvatarSpawn?: (id: string) => void;
  /** Called when an avatar is despawned */
  onAvatarDespawn?: (id: string) => void;
}

/** Default colors */
export const DEFAULT_COLORS = {
  body: 0x667eea,
  bodyIdle: 0x9ca3af,
  bodyAway: 0x4b5563,
  head: 0xf8fafc,
  eye: 0x1e293b,
  statusActive: 0x4ade80,
  statusIdle: 0xfbbf24,
  statusAway: 0x6b7280,
  shadow: 0x000000,
  nameBackground: 'rgba(0, 0, 0, 0.7)',
  nameText: '#ffffff',
} as const;

/** Default avatar dimensions */
export const DEFAULT_DIMENSIONS = {
  bodyRadius: 0.3,
  bodyHeight: 0.8,
  headRadius: 0.25,
  eyeRadius: 0.05,
  pupilRadius: 0.025,
  statusOrbRadius: 0.08,
  shadowRadius: 0.4,
  nameLabelHeight: 2.3,
} as const;
