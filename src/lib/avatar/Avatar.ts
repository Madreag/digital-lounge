/**
 * Avatar
 *
 * 3D representation of a player in the lounge. Consists of:
 * - Capsule body mesh
 * - Sphere head mesh
 * - Eyes with pupils
 * - Username label (canvas sprite)
 * - Status indicator orb
 * - Ground shadow
 *
 * Includes position buffering and lerp interpolation for smooth
 * movement of remote players at 30fps server tick rate.
 */

import * as THREE from 'three';
import {
  AvatarPlayerState,
  AvatarConfig,
  PositionUpdate,
  PlayerStatus,
  DEFAULT_COLORS,
  DEFAULT_DIMENSIONS,
} from './types.js';

/** Default interpolation settings */
const DEFAULT_INTERPOLATION_DELAY = 100; // ms
const DEFAULT_MAX_BUFFER_SIZE = 10;
const DEFAULT_LERP_SPEED = 0.15;

/** Internal position snapshot for interpolation buffer */
interface PositionSnapshot {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  timestamp: number;
}

export class Avatar {
  /** Player ID this avatar represents */
  readonly id: string;

  /** The Three.js group containing all avatar meshes */
  readonly mesh: THREE.Group;

  /** Current player state */
  private state: AvatarPlayerState;

  /** Configuration */
  private config: Required<AvatarConfig>;

  /** Position interpolation buffer */
  private positionBuffer: PositionSnapshot[] = [];

  /** Target position for interpolation */
  private targetPosition: THREE.Vector3;

  /** Target rotation for interpolation */
  private targetRotation: THREE.Euler;

  /** Interpolation settings */
  private interpolationDelay: number;
  private maxBufferSize: number;
  private lerpSpeed: number;

  /** Named mesh references for updates */
  private bodyMesh: THREE.Mesh | null = null;
  private headMesh: THREE.Mesh | null = null;
  private nameLabelSprite: THREE.Sprite | null = null;
  private statusOrbMesh: THREE.Mesh | null = null;

  constructor(
    state: AvatarPlayerState,
    config: AvatarConfig = {},
    interpolationConfig?: {
      interpolationDelay?: number;
      maxBufferSize?: number;
      lerpSpeed?: number;
    }
  ) {
    this.id = state.id;
    this.state = { ...state };

    // Merge config with defaults
    this.config = {
      bodyRadius: config.bodyRadius ?? DEFAULT_DIMENSIONS.bodyRadius,
      bodyHeight: config.bodyHeight ?? DEFAULT_DIMENSIONS.bodyHeight,
      headRadius: config.headRadius ?? DEFAULT_DIMENSIONS.headRadius,
      castShadow: config.castShadow ?? true,
      showNameLabel: config.showNameLabel ?? true,
      showStatusIndicator: config.showStatusIndicator ?? true,
    };

    // Interpolation settings
    this.interpolationDelay = interpolationConfig?.interpolationDelay ?? DEFAULT_INTERPOLATION_DELAY;
    this.maxBufferSize = interpolationConfig?.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE;
    this.lerpSpeed = interpolationConfig?.lerpSpeed ?? DEFAULT_LERP_SPEED;

    // Initialize target transforms
    this.targetPosition = new THREE.Vector3(state.position.x, state.position.y, state.position.z);
    this.targetRotation = new THREE.Euler(state.rotation.x, state.rotation.y, state.rotation.z);

    // Create the avatar mesh group
    this.mesh = this.createMeshGroup();
    this.mesh.position.copy(this.targetPosition);
    this.mesh.rotation.copy(this.targetRotation);
  }

  /** Create the complete avatar mesh group */
  private createMeshGroup(): THREE.Group {
    const group = new THREE.Group();
    group.name = `avatar-${this.id}`;

    // Body group (elevated to ground level)
    const bodyGroup = new THREE.Group();
    bodyGroup.position.y = 1;

    // Body - capsule shape
    this.bodyMesh = this.createBody();
    bodyGroup.add(this.bodyMesh);

    // Head - sphere above body
    this.headMesh = this.createHead();
    bodyGroup.add(this.headMesh);

    // Eyes
    const eyes = this.createEyes();
    bodyGroup.add(eyes);

    group.add(bodyGroup);

    // Name label (billboard sprite)
    if (this.config.showNameLabel) {
      this.nameLabelSprite = this.createNameLabel(this.state.username);
      this.nameLabelSprite.position.y = DEFAULT_DIMENSIONS.nameLabelHeight;
      group.add(this.nameLabelSprite);
    }

    // Status indicator orb
    if (this.config.showStatusIndicator) {
      this.statusOrbMesh = this.createStatusIndicator();
      this.statusOrbMesh.position.set(0.35, 2.0, 0);
      this.statusOrbMesh.name = 'statusOrb';
      group.add(this.statusOrbMesh);
    }

    // Ground shadow
    const shadow = this.createShadow();
    group.add(shadow);

    return group;
  }

  /** Create body capsule mesh */
  private createBody(): THREE.Mesh {
    const geometry = new THREE.CapsuleGeometry(
      this.config.bodyRadius,
      this.config.bodyHeight,
      8,
      16
    );
    const material = new THREE.MeshStandardMaterial({
      color: this.getBodyColor(),
      roughness: 0.6,
      metalness: 0.2,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = this.config.castShadow;
    mesh.receiveShadow = true;
    mesh.name = 'body';
    return mesh;
  }

  /** Create head sphere mesh */
  private createHead(): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(this.config.headRadius, 16, 16);
    const headColor = this.state.style?.headColor ?? DEFAULT_COLORS.head;
    const material = new THREE.MeshStandardMaterial({
      color: headColor,
      roughness: 0.7,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = this.config.bodyHeight / 2 + this.config.headRadius + 0.05;
    mesh.castShadow = this.config.castShadow;
    mesh.name = 'head';
    return mesh;
  }

  /** Create eyes group with pupils */
  private createEyes(): THREE.Group {
    const eyesGroup = new THREE.Group();
    eyesGroup.name = 'eyes';

    const eyeGeometry = new THREE.SphereGeometry(DEFAULT_DIMENSIONS.eyeRadius, 8, 8);
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupilGeometry = new THREE.SphereGeometry(DEFAULT_DIMENSIONS.pupilRadius, 8, 8);
    const pupilMaterial = new THREE.MeshBasicMaterial({
      color: this.state.style?.eyeColor ?? DEFAULT_COLORS.eye,
    });

    const headY = this.config.bodyHeight / 2 + this.config.headRadius + 0.05;
    const eyeY = headY + 0.03;
    const eyeZ = this.config.headRadius - 0.05;

    // Left eye
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.08, eyeY, eyeZ);
    eyesGroup.add(leftEye);

    const leftPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
    leftPupil.position.set(-0.08, eyeY, eyeZ + 0.04);
    eyesGroup.add(leftPupil);

    // Right eye
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(0.08, eyeY, eyeZ);
    eyesGroup.add(rightEye);

    const rightPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
    rightPupil.position.set(0.08, eyeY, eyeZ + 0.04);
    eyesGroup.add(rightPupil);

    return eyesGroup;
  }

  /** Create name label sprite using canvas texture */
  private createNameLabel(name: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = 256;
    canvas.height = 64;

    // Draw rounded background
    ctx.fillStyle = DEFAULT_COLORS.nameBackground;
    this.roundRect(ctx, 8, 8, canvas.width - 16, canvas.height - 16, 12);
    ctx.fill();

    // Draw text
    ctx.font = 'bold 24px Arial, sans-serif';
    ctx.fillStyle = DEFAULT_COLORS.nameText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.5, 0.4, 1);
    sprite.name = 'nameLabel';

    return sprite;
  }

  /** Helper to draw rounded rectangle */
  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /** Create status indicator orb */
  private createStatusIndicator(): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(DEFAULT_DIMENSIONS.statusOrbRadius, 8, 8);
    const material = new THREE.MeshBasicMaterial({
      color: this.getStatusColor(),
      transparent: true,
      opacity: 0.9,
    });
    const mesh = new THREE.Mesh(geometry, material);
    return mesh;
  }

  /** Create ground shadow circle */
  private createShadow(): THREE.Mesh {
    const geometry = new THREE.CircleGeometry(DEFAULT_DIMENSIONS.shadowRadius, 16);
    const material = new THREE.MeshBasicMaterial({
      color: DEFAULT_COLORS.shadow,
      transparent: true,
      opacity: 0.3,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.01;
    mesh.name = 'shadow';
    return mesh;
  }

  /** Get body color based on status and style */
  private getBodyColor(): number {
    if (this.state.style?.bodyColor) {
      return this.state.style.bodyColor;
    }
    switch (this.state.status) {
      case 'active':
        return DEFAULT_COLORS.body;
      case 'idle':
        return DEFAULT_COLORS.bodyIdle;
      case 'away':
        return DEFAULT_COLORS.bodyAway;
      default:
        return DEFAULT_COLORS.body;
    }
  }

  /** Get status indicator color */
  private getStatusColor(): number {
    switch (this.state.status) {
      case 'active':
        return DEFAULT_COLORS.statusActive;
      case 'idle':
        return DEFAULT_COLORS.statusIdle;
      case 'away':
        return DEFAULT_COLORS.statusAway;
      default:
        return DEFAULT_COLORS.statusAway;
    }
  }

  /** Push a position update to the interpolation buffer */
  pushPositionUpdate(update: PositionUpdate): void {
    this.positionBuffer.push({
      position: new THREE.Vector3(update.position.x, update.position.y, update.position.z),
      rotation: new THREE.Euler(update.rotation.x, update.rotation.y, update.rotation.z),
      timestamp: update.timestamp,
    });

    // Keep buffer from growing too large
    while (this.positionBuffer.length > this.maxBufferSize) {
      this.positionBuffer.shift();
    }
  }

  /** Update avatar status */
  updateStatus(status: PlayerStatus): void {
    this.state.status = status;

    // Update body color
    if (this.bodyMesh) {
      (this.bodyMesh.material as THREE.MeshStandardMaterial).color.setHex(this.getBodyColor());
    }

    // Update status orb color
    if (this.statusOrbMesh) {
      (this.statusOrbMesh.material as THREE.MeshBasicMaterial).color.setHex(this.getStatusColor());
    }
  }

  /** Update full player state */
  updateState(state: Partial<AvatarPlayerState>): void {
    if (state.status !== undefined) {
      this.updateStatus(state.status);
    }
    if (state.username !== undefined && state.username !== this.state.username) {
      this.state.username = state.username;
      // Recreate name label
      if (this.nameLabelSprite) {
        const pos = this.nameLabelSprite.position.clone();
        this.mesh.remove(this.nameLabelSprite);
        this.nameLabelSprite.material.map?.dispose();
        this.nameLabelSprite.material.dispose();
        this.nameLabelSprite = this.createNameLabel(state.username);
        this.nameLabelSprite.position.copy(pos);
        this.mesh.add(this.nameLabelSprite);
      }
    }
    if (state.style !== undefined) {
      this.state.style = state.style;
      if (this.bodyMesh) {
        (this.bodyMesh.material as THREE.MeshStandardMaterial).color.setHex(this.getBodyColor());
      }
    }
  }

  /** Set position directly (without interpolation) */
  setPosition(position: { x: number; y: number; z: number }): void {
    this.targetPosition.set(position.x, position.y, position.z);
    this.mesh.position.copy(this.targetPosition);
    this.positionBuffer = [];
  }

  /** Set rotation directly (without interpolation) */
  setRotation(rotation: { x: number; y: number; z: number }): void {
    this.targetRotation.set(rotation.x, rotation.y, rotation.z);
    this.mesh.rotation.copy(this.targetRotation);
  }

  /**
   * Update avatar position interpolation.
   * Call this every frame in the render loop.
   */
  update(_deltaTime: number): void {
    const renderTime = Date.now() - this.interpolationDelay;

    // Interpolate from position buffer
    if (this.positionBuffer.length >= 2) {
      // Find two snapshots that bracket our render time
      let prev: PositionSnapshot | null = null;
      let next: PositionSnapshot | null = null;

      for (let i = 0; i < this.positionBuffer.length - 1; i++) {
        if (
          this.positionBuffer[i].timestamp <= renderTime &&
          this.positionBuffer[i + 1].timestamp >= renderTime
        ) {
          prev = this.positionBuffer[i];
          next = this.positionBuffer[i + 1];
          break;
        }
      }

      if (prev && next) {
        // Calculate interpolation factor
        const duration = next.timestamp - prev.timestamp;
        const elapsed = renderTime - prev.timestamp;
        const t = Math.min(1, Math.max(0, elapsed / duration));

        // Interpolate position
        this.targetPosition.lerpVectors(prev.position, next.position, t);

        // Interpolate rotation (simple lerp on Euler angles)
        this.targetRotation.set(
          THREE.MathUtils.lerp(prev.rotation.x, next.rotation.x, t),
          THREE.MathUtils.lerp(prev.rotation.y, next.rotation.y, t),
          THREE.MathUtils.lerp(prev.rotation.z, next.rotation.z, t)
        );
      }
    } else if (this.positionBuffer.length === 1) {
      // Single snapshot - use directly
      const snapshot = this.positionBuffer[0];
      this.targetPosition.copy(snapshot.position);
      this.targetRotation.copy(snapshot.rotation);
    }

    // Smooth lerp to target for catch-up
    this.mesh.position.lerp(this.targetPosition, this.lerpSpeed);
    this.mesh.rotation.x += (this.targetRotation.x - this.mesh.rotation.x) * this.lerpSpeed;
    this.mesh.rotation.y += (this.targetRotation.y - this.mesh.rotation.y) * this.lerpSpeed;
    this.mesh.rotation.z += (this.targetRotation.z - this.mesh.rotation.z) * this.lerpSpeed;

    // Clean up old snapshots (older than 1 second)
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
    this.positionBuffer = [];
  }

  /** Get current position */
  get position(): THREE.Vector3 {
    return this.mesh.position;
  }

  /** Get current rotation */
  get rotation(): THREE.Euler {
    return this.mesh.rotation;
  }

  /** Get player username */
  get username(): string {
    return this.state.username;
  }

  /** Get player status */
  get status(): PlayerStatus {
    return this.state.status;
  }
}
