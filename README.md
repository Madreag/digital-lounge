# @digital-lounge/avatar

3D player avatar system for the Digital Lounge multiplayer experience.

## Features

- **Avatar mesh**: Capsule body + sphere head + eyes with pupils
- **Username labels**: Canvas-based sprite that always faces camera
- **Status indicators**: Colored orb showing active/idle/away status
- **Position interpolation**: Smooth remote player movement via position buffering
- **AvatarManager**: Spawn/despawn lifecycle management for multiple avatars
- **Proximity queries**: Find avatars within radius or closest avatar

## Installation

```bash
npm install @digital-lounge/avatar three
```

## Usage

```typescript
import * as THREE from 'three';
import { AvatarManager } from '@digital-lounge/avatar';

// Create scene
const scene = new THREE.Scene();

// Create avatar manager
const avatarManager = new AvatarManager(scene, {
  interpolationDelay: 100,  // ms delay for smooth interpolation
  maxBufferSize: 10,        // position buffer size
  lerpSpeed: 0.15,          // smooth catch-up speed
});

// Set local player ID (won't create avatar for local player)
avatarManager.setLocalPlayerId('my-player-id');

// Spawn avatar when player joins
avatarManager.spawn({
  id: 'player-123',
  username: 'Alice',
  position: { x: 0, y: 0, z: 5 },
  rotation: { x: 0, y: 0, z: 0 },
  status: 'active',
});

// Push position updates from server (typically at 30fps tick)
avatarManager.pushBatchPositionUpdate([
  {
    id: 'player-123',
    position: { x: 1, y: 0, z: 5 },
    rotation: { x: 0, y: 0.5, z: 0 },
    timestamp: Date.now(),
  },
]);

// In render loop - update interpolation
function animate() {
  const delta = clock.getDelta();
  avatarManager.update(delta);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

// Update status
avatarManager.updateStatus('player-123', 'idle');

// Despawn when player leaves
avatarManager.despawn('player-123');

// Clean up
avatarManager.dispose();
```

## API

### Avatar

Individual player avatar representation.

```typescript
const avatar = new Avatar(
  {
    id: 'player-1',
    username: 'Bob',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    status: 'active',
    style: { bodyColor: 0x667eea },
  },
  {
    bodyRadius: 0.3,
    bodyHeight: 0.8,
    headRadius: 0.25,
    castShadow: true,
    showNameLabel: true,
    showStatusIndicator: true,
  }
);

// Add to scene
scene.add(avatar.mesh);

// Push position updates
avatar.pushPositionUpdate({ position, rotation, timestamp });

// Update every frame
avatar.update(deltaTime);

// Update status/state
avatar.updateStatus('idle');
avatar.updateState({ username: 'Bobby' });

// Clean up
avatar.dispose();
```

### AvatarManager

Manages multiple avatars with scene integration.

```typescript
const manager = new AvatarManager(scene, config, avatarConfig, {
  onAvatarSpawn: (id) => console.log(`Spawned: ${id}`),
  onAvatarDespawn: (id) => console.log(`Despawned: ${id}`),
});

// Lifecycle
manager.spawn(playerState);
manager.despawn(playerId);
manager.despawnAll();

// Updates
manager.pushPositionUpdate(id, update);
manager.pushBatchPositionUpdate(updates);
manager.updateStatus(id, status);
manager.syncState(allPlayers);  // Sync with full server state

// Queries
manager.getAvatar(id);
manager.getAllAvatars();
manager.hasAvatar(id);
manager.count;

// Proximity
manager.findNearby(position, radius);
manager.findClosest(position);

// Render loop
manager.update(deltaTime);

// Cleanup
manager.dispose();
```

## Types

```typescript
interface AvatarPlayerState {
  id: string;
  username: string;
  position: Vector3;
  rotation: Vector3;
  status: PlayerStatus;
  style?: AvatarStyle;
}

type PlayerStatus = 'active' | 'idle' | 'away';

interface AvatarStyle {
  bodyColor: number;
  headColor?: number;
  eyeColor?: number;
}

interface PositionUpdate {
  position: Vector3;
  rotation: Vector3;
  timestamp: number;
}
```

## Interpolation

The avatar system uses position buffering for smooth remote player movement:

1. Server sends position updates at ~30fps tick rate
2. Updates are buffered with timestamps
3. Render uses 100ms delay to find bracketing snapshots
4. Linear interpolation between snapshots
5. Additional lerp for smooth catch-up

This ensures smooth avatar movement even with network jitter.
