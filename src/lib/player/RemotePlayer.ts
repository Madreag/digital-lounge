/**
 * Remote Player Representation
 *
 * Handles rendering and interpolation for other players in the lounge.
 * Uses position buffering and lerp for smooth movement at 30fps server tick.
 */

import * as THREE from 'three';
import { PlayerState, Vector3, PlayerPositionUpdate } from './types.js';

/** Buffered position snapshot for interpolation */
interface PositionSnapshot {
  position: Vector3;
  rotation: Vector3;
  timestamp: number;
}

/** Interpolation settings */
const INTERPOLATION_DELAY = 100; // ms delay for smooth interpolation
const MAX_BUFFER_SIZE = 10;
const LERP_SPEED = 0.15; // For smooth catch-up

export class RemotePlayer {
  readonly id: string;
  readonly mesh: THREE.Group;

  private state: PlayerState;
  private positionBuffer: PositionSnapshot[] = [];
  private targetPosition: THREE.Vector3;
  private targetRotation: THREE.Euler;
  private nameMesh: THREE.Sprite | null = null;

  constructor(state: PlayerState) {
    this.id = state.id;
    this.state = state;
    this.targetPosition = new THREE.Vector3(state.position.x, state.position.y, state.position.z);
    this.targetRotation = new THREE.Euler(state.rotation.x, state.rotation.y, state.rotation.z);

    // Create player mesh
    this.mesh = this.createPlayerMesh();
    this.mesh.position.copy(this.targetPosition);
    this.mesh.rotation.copy(this.targetRotation);
  }

  private createPlayerMesh(): THREE.Group {
    const group = new THREE.Group();

    // Body - capsule shape
    const bodyGeometry = new THREE.CapsuleGeometry(0.3, 0.8, 8, 16);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: this.state.color,
      roughness: 0.5,
      metalness: 0.3,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.9;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Head - sphere
    const headGeometry = new THREE.SphereGeometry(0.25, 16, 16);
    const headMaterial = new THREE.MeshStandardMaterial({
      color: this.state.color,
      roughness: 0.4,
      metalness: 0.2,
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.65;
    head.castShadow = true;
    group.add(head);

    // Eyes
    const eyeGeometry = new THREE.SphereGeometry(0.05, 8, 8);
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupilMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });

    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.08, 1.68, 0.2);
    group.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(0.08, 1.68, 0.2);
    group.add(rightEye);

    const leftPupil = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), pupilMaterial);
    leftPupil.position.set(-0.08, 1.68, 0.24);
    group.add(leftPupil);

    const rightPupil = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), pupilMaterial);
    rightPupil.position.set(0.08, 1.68, 0.24);
    group.add(rightPupil);

    // Name label
    this.nameMesh = this.createNameLabel(this.state.username);
    this.nameMesh.position.y = 2.1;
    group.add(this.nameMesh);

    // Status indicator (small floating orb above head)
    const statusOrb = this.createStatusIndicator();
    statusOrb.position.set(0.3, 1.9, 0);
    statusOrb.name = 'statusOrb';
    group.add(statusOrb);

    return group;
  }

  private createNameLabel(name: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = 256;
    canvas.height = 64;

    // Background
    context.fillStyle = 'rgba(0, 0, 0, 0.6)';
    context.roundRect(0, 0, canvas.width, canvas.height, 8);
    context.fill();

    // Text
    context.font = 'bold 28px Arial';
    context.fillStyle = '#ffffff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(name, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.5, 0.4, 1);

    return sprite;
  }

  private createStatusIndicator(): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(0.08, 8, 8);
    const material = new THREE.MeshBasicMaterial({
      color: this.getStatusColor(),
      transparent: true,
      opacity: 0.9,
    });
    return new THREE.Mesh(geometry, material);
  }

  private getStatusColor(): number {
    switch (this.state.status) {
      case 'active': return 0x00ff00;
      case 'idle': return 0xffff00;
      case 'away': return 0xff0000;
      default: return 0x888888;
    }
  }

  /** Add a position update to the interpolation buffer */
  pushPositionUpdate(update: PlayerPositionUpdate): void {
    this.positionBuffer.push({
      position: update.position,
      rotation: update.rotation,
      timestamp: update.timestamp,
    });

    // Keep buffer from growing too large
    while (this.positionBuffer.length > MAX_BUFFER_SIZE) {
      this.positionBuffer.shift();
    }
  }

  /** Update the player's full state */
  updateState(state: PlayerState): void {
    this.state = state;

    // Update status indicator
    const statusOrb = this.mesh.getObjectByName('statusOrb') as THREE.Mesh;
    if (statusOrb) {
      (statusOrb.material as THREE.MeshBasicMaterial).color.setHex(this.getStatusColor());
    }
  }

  /** Update status */
  updateStatus(status: PlayerState['status']): void {
    this.state.status = status;
    const statusOrb = this.mesh.getObjectByName('statusOrb') as THREE.Mesh;
    if (statusOrb) {
      (statusOrb.material as THREE.MeshBasicMaterial).color.setHex(this.getStatusColor());
    }
  }

  /** Called each frame to interpolate position */
  update(_deltaTime: number): void {
    const renderTime = Date.now() - INTERPOLATION_DELAY;

    // Find two snapshots to interpolate between
    if (this.positionBuffer.length >= 2) {
      // Find the two snapshots that bracket our render time
      let prevSnapshot: PositionSnapshot | null = null;
      let nextSnapshot: PositionSnapshot | null = null;

      for (let i = 0; i < this.positionBuffer.length - 1; i++) {
        if (this.positionBuffer[i].timestamp <= renderTime &&
            this.positionBuffer[i + 1].timestamp >= renderTime) {
          prevSnapshot = this.positionBuffer[i];
          nextSnapshot = this.positionBuffer[i + 1];
          break;
        }
      }

      if (prevSnapshot && nextSnapshot) {
        // Calculate interpolation factor
        const duration = nextSnapshot.timestamp - prevSnapshot.timestamp;
        const elapsed = renderTime - prevSnapshot.timestamp;
        const t = Math.min(1, Math.max(0, elapsed / duration));

        // Interpolate position
        this.targetPosition.set(
          THREE.MathUtils.lerp(prevSnapshot.position.x, nextSnapshot.position.x, t),
          THREE.MathUtils.lerp(prevSnapshot.position.y, nextSnapshot.position.y, t),
          THREE.MathUtils.lerp(prevSnapshot.position.z, nextSnapshot.position.z, t)
        );

        // Interpolate rotation
        this.targetRotation.set(
          THREE.MathUtils.lerp(prevSnapshot.rotation.x, nextSnapshot.rotation.x, t),
          THREE.MathUtils.lerp(prevSnapshot.rotation.y, nextSnapshot.rotation.y, t),
          THREE.MathUtils.lerp(prevSnapshot.rotation.z, nextSnapshot.rotation.z, t)
        );
      }
    } else if (this.positionBuffer.length === 1) {
      // Only one snapshot - use it directly
      const snapshot = this.positionBuffer[0];
      this.targetPosition.set(snapshot.position.x, snapshot.position.y, snapshot.position.z);
      this.targetRotation.set(snapshot.rotation.x, snapshot.rotation.y, snapshot.rotation.z);
    }

    // Smooth lerp to target position for any remaining catch-up
    this.mesh.position.lerp(this.targetPosition, LERP_SPEED);
    this.mesh.rotation.x += (this.targetRotation.x - this.mesh.rotation.x) * LERP_SPEED;
    this.mesh.rotation.y += (this.targetRotation.y - this.mesh.rotation.y) * LERP_SPEED;
    this.mesh.rotation.z += (this.targetRotation.z - this.mesh.rotation.z) * LERP_SPEED;

    // Clean up old snapshots
    while (this.positionBuffer.length > 0 && this.positionBuffer[0].timestamp < renderTime - 1000) {
      this.positionBuffer.shift();
    }
  }

  /** Clean up resources */
  dispose(): void {
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => mat.dispose());
        } else {
          child.material.dispose();
        }
      } else if (child instanceof THREE.Sprite) {
        child.material.map?.dispose();
        child.material.dispose();
      }
    });
  }
}
