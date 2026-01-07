/**
 * Player State Types
 *
 * Defines the schema for player state and multiplayer messages.
 */

import { BaseMessage } from '../websocket/protocol.js';

/** 3D Vector for position and rotation */
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/** Player status in the lounge */
export type PlayerStatus = 'active' | 'idle' | 'away';

/** Avatar type identifier */
export type AvatarType = 'default' | 'robot' | 'alien' | 'human';

/** Core player state synchronized across all clients */
export interface PlayerState {
  id: string;
  username: string;
  position: Vector3;
  rotation: Vector3;
  avatar: AvatarType;
  status: PlayerStatus;
  color: number; // Hex color for player representation
}

/** Minimal state for frequent position updates (30fps) */
export interface PlayerPositionUpdate {
  id: string;
  position: Vector3;
  rotation: Vector3;
  timestamp: number;
}

/** Message types for player synchronization */
export enum PlayerMessageType {
  // State sync messages
  PLAYER_JOIN = 'player:join',
  PLAYER_LEAVE = 'player:leave',
  PLAYER_STATE = 'player:state',
  PLAYER_POSITION = 'player:position',
  PLAYER_BATCH_POSITION = 'player:batch_position',

  // Request messages
  REQUEST_FULL_STATE = 'player:request_full_state',

  // Status updates
  PLAYER_STATUS_CHANGE = 'player:status_change',
}

/** Sent when a player joins the lounge */
export interface PlayerJoinMessage extends BaseMessage {
  type: PlayerMessageType.PLAYER_JOIN;
  payload: PlayerState;
}

/** Sent when a player leaves the lounge */
export interface PlayerLeaveMessage extends BaseMessage {
  type: PlayerMessageType.PLAYER_LEAVE;
  payload: {
    id: string;
    reason?: string;
  };
}

/** Full player state update (on join, request, or significant changes) */
export interface PlayerStateMessage extends BaseMessage {
  type: PlayerMessageType.PLAYER_STATE;
  payload: {
    players: PlayerState[];
  };
}

/** Single player position update (sent frequently) */
export interface PlayerPositionMessage extends BaseMessage {
  type: PlayerMessageType.PLAYER_POSITION;
  payload: PlayerPositionUpdate;
}

/** Batch position update for all players (server broadcasts at 30fps) */
export interface PlayerBatchPositionMessage extends BaseMessage {
  type: PlayerMessageType.PLAYER_BATCH_POSITION;
  payload: {
    updates: PlayerPositionUpdate[];
    serverTime: number;
  };
}

/** Request full state from server (on reconnect, etc.) */
export interface RequestFullStateMessage extends BaseMessage {
  type: PlayerMessageType.REQUEST_FULL_STATE;
  payload: Record<string, never>;
}

/** Player status change */
export interface PlayerStatusChangeMessage extends BaseMessage {
  type: PlayerMessageType.PLAYER_STATUS_CHANGE;
  payload: {
    id: string;
    status: PlayerStatus;
  };
}

/** Union of all player messages */
export type PlayerMessage =
  | PlayerJoinMessage
  | PlayerLeaveMessage
  | PlayerStateMessage
  | PlayerPositionMessage
  | PlayerBatchPositionMessage
  | RequestFullStateMessage
  | PlayerStatusChangeMessage;

/** Type guard for player messages */
export function isPlayerMessage(msg: BaseMessage): msg is PlayerMessage {
  return msg.type.startsWith('player:');
}

/** Create default player state */
export function createDefaultPlayerState(
  id: string,
  username: string,
  color?: number
): PlayerState {
  return {
    id,
    username,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    avatar: 'default',
    status: 'active',
    color: color ?? generatePlayerColor(id),
  };
}

/** Generate a consistent color from player ID */
export function generatePlayerColor(id: string): number {
  // Simple hash to generate color from ID
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Generate vibrant color in HSL, convert to hex
  const hue = Math.abs(hash) % 360;
  const saturation = 70;
  const lightness = 60;

  // HSL to RGB conversion
  const c = (1 - Math.abs(2 * lightness / 100 - 1)) * saturation / 100;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = lightness / 100 - c / 2;

  let r = 0, g = 0, b = 0;
  if (hue < 60) { r = c; g = x; b = 0; }
  else if (hue < 120) { r = x; g = c; b = 0; }
  else if (hue < 180) { r = 0; g = c; b = x; }
  else if (hue < 240) { r = 0; g = x; b = c; }
  else if (hue < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  const red = Math.round((r + m) * 255);
  const green = Math.round((g + m) * 255);
  const blue = Math.round((b + m) * 255);

  return (red << 16) | (green << 8) | blue;
}
