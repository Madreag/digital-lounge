import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class DigitalLounge {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private container: HTMLElement;
  private animationId: number | null = null;
  private clock: THREE.Clock;
  private controls: OrbitControls;

  // Movement state for WASD controls
  private moveForward = false;
  private moveBackward = false;
  private moveLeft = false;
  private moveRight = false;
  private moveSpeed = 0.15;

  // Lounge elements
  private floor: THREE.Mesh | null = null;
  private ambientLight: THREE.AmbientLight | null = null;
  private pointLights: THREE.PointLight[] = [];
  private floatingOrbs: THREE.Mesh[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
    this.clock = new THREE.Clock();

    // Initialize scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
    this.scene.fog = new THREE.Fog(0x1a1a2e, 15, 60);

    // Initialize camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 5, 12);
    this.camera.lookAt(0, 0, 0);

    // Initialize renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);

    // Initialize OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 30;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.1; // Prevent going below floor
    this.controls.target.set(0, 1, 0);

    // Setup WASD controls
    this.setupKeyboardControls();

    // Build the lounge
    this.setupSkybox();
    this.setupLighting();
    this.setupLounge();
  }

  private setupKeyboardControls(): void {
    // Helper to check if an input element is focused
    const isInputFocused = (): boolean => {
      const activeElement = document.activeElement;
      return activeElement instanceof HTMLInputElement ||
             activeElement instanceof HTMLTextAreaElement;
    };

    document.addEventListener('keydown', (event) => {
      // Don't handle movement keys when typing in chat
      if (isInputFocused()) return;

      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.moveForward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.moveBackward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.moveLeft = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.moveRight = true;
          break;
      }
    });

    document.addEventListener('keyup', (event) => {
      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.moveForward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.moveBackward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.moveLeft = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.moveRight = false;
          break;
      }
    });
  }

  private setupSkybox(): void {
    // Create a procedural gradient skybox using a large sphere
    const skyGeometry = new THREE.SphereGeometry(100, 32, 32);

    // Custom shader for gradient sky
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x0a0a1a) },
        bottomColor: { value: new THREE.Color(0x1a1a3e) },
        offset: { value: 20 },
        exponent: { value: 0.6 }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide
    });

    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    this.scene.add(sky);

    // Add stars
    const starsGeometry = new THREE.BufferGeometry();
    const starPositions: number[] = [];

    for (let i = 0; i < 1000; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const radius = 80 + Math.random() * 10;

      starPositions.push(
        radius * Math.sin(phi) * Math.cos(theta),
        Math.abs(radius * Math.cos(phi)), // Only upper hemisphere
        radius * Math.sin(phi) * Math.sin(theta)
      );
    }

    starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));

    const starsMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.3,
      transparent: true,
      opacity: 0.8
    });

    const stars = new THREE.Points(starsGeometry, starsMaterial);
    this.scene.add(stars);
  }

  private setupLighting(): void {
    // Ambient light for base illumination
    this.ambientLight = new THREE.AmbientLight(0x404060, 0.4);
    this.scene.add(this.ambientLight);

    // Hemisphere light for natural sky/ground lighting
    const hemiLight = new THREE.HemisphereLight(0x8080ff, 0x404040, 0.3);
    this.scene.add(hemiLight);

    // Neon-style point lights for atmosphere
    const lightConfigs = [
      { color: 0xff00ff, position: new THREE.Vector3(-6, 4, -6), intensity: 1.2 },
      { color: 0x00ffff, position: new THREE.Vector3(6, 4, -6), intensity: 1.2 },
      { color: 0xff6600, position: new THREE.Vector3(0, 4, 6), intensity: 1.0 },
      { color: 0x00ff88, position: new THREE.Vector3(-8, 3, 3), intensity: 0.8 },
      { color: 0xff0088, position: new THREE.Vector3(8, 3, 3), intensity: 0.8 }
    ];

    lightConfigs.forEach((config) => {
      const light = new THREE.PointLight(config.color, config.intensity, 25);
      light.position.copy(config.position);
      light.castShadow = true;
      light.shadow.mapSize.width = 512;
      light.shadow.mapSize.height = 512;
      this.scene.add(light);
      this.pointLights.push(light);

      // Add visible light sphere
      const lightSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 16, 16),
        new THREE.MeshBasicMaterial({ color: config.color })
      );
      lightSphere.position.copy(config.position);
      this.scene.add(lightSphere);
    });
  }

  private setupLounge(): void {
    this.createFloor();
    this.addFurniture();
    this.addPlants();
    this.addDecorations();
  }

  private createFloor(): void {
    // Main floor with grid pattern
    const floorGeometry = new THREE.PlaneGeometry(40, 40, 40, 40);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d2d44,
      roughness: 0.7,
      metalness: 0.3
    });
    this.floor = new THREE.Mesh(floorGeometry, floorMaterial);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);

    // Add grid lines
    const gridHelper = new THREE.GridHelper(40, 40, 0x444466, 0x333355);
    gridHelper.position.y = 0.01;
    this.scene.add(gridHelper);
  }

  private addFurniture(): void {
    // Main circular couch
    this.createCircularCouch(0, 0, -4);

    // Secondary seating areas
    this.createSofa(-8, 0, 0, Math.PI / 4);
    this.createSofa(8, 0, 0, -Math.PI / 4);

    // Coffee tables
    this.createCoffeeTable(0, 0, 0);
    this.createCoffeeTable(-6, 0, 2, 0.8);
    this.createCoffeeTable(6, 0, 2, 0.8);

    // Side tables
    this.createSideTable(-10, 0, -3);
    this.createSideTable(10, 0, -3);

    // Bar area
    this.createBar(0, 0, 8);
  }

  private createCircularCouch(x: number, y: number, z: number): void {
    const couchGeometry = new THREE.TorusGeometry(3.5, 0.6, 12, 32, Math.PI * 1.3);
    const couchMaterial = new THREE.MeshStandardMaterial({
      color: 0x6b4c9a,
      roughness: 0.5,
      metalness: 0.1
    });
    const couch = new THREE.Mesh(couchGeometry, couchMaterial);
    couch.position.set(x, y + 0.6, z);
    couch.rotation.x = -Math.PI / 2;
    couch.rotation.z = Math.PI / 2 + 0.35;
    couch.castShadow = true;
    couch.receiveShadow = true;
    this.scene.add(couch);

    // Back rest
    const backGeometry = new THREE.TorusGeometry(3.5, 0.4, 12, 32, Math.PI * 1.3);
    const backMaterial = new THREE.MeshStandardMaterial({
      color: 0x5a3c8a,
      roughness: 0.5,
      metalness: 0.1
    });
    const back = new THREE.Mesh(backGeometry, backMaterial);
    back.position.set(x, y + 1.2, z - 0.3);
    back.rotation.x = -Math.PI / 2;
    back.rotation.z = Math.PI / 2 + 0.35;
    back.castShadow = true;
    this.scene.add(back);
  }

  private createSofa(x: number, y: number, z: number, rotation = 0): void {
    const group = new THREE.Group();

    // Seat
    const seatGeometry = new THREE.BoxGeometry(3, 0.5, 1.2);
    const sofaMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a5c8a,
      roughness: 0.6,
      metalness: 0.1
    });
    const seat = new THREE.Mesh(seatGeometry, sofaMaterial);
    seat.position.y = 0.4;
    seat.castShadow = true;
    seat.receiveShadow = true;
    group.add(seat);

    // Back
    const backGeometry = new THREE.BoxGeometry(3, 0.8, 0.3);
    const back = new THREE.Mesh(backGeometry, sofaMaterial);
    back.position.set(0, 0.8, -0.5);
    back.castShadow = true;
    group.add(back);

    // Arms
    const armGeometry = new THREE.BoxGeometry(0.3, 0.5, 1.2);
    const leftArm = new THREE.Mesh(armGeometry, sofaMaterial);
    leftArm.position.set(-1.35, 0.6, 0);
    leftArm.castShadow = true;
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeometry, sofaMaterial);
    rightArm.position.set(1.35, 0.6, 0);
    rightArm.castShadow = true;
    group.add(rightArm);

    group.position.set(x, y, z);
    group.rotation.y = rotation;
    this.scene.add(group);
  }

  private createCoffeeTable(x: number, y: number, z: number, scale = 1): void {
    const group = new THREE.Group();

    // Table top
    const topGeometry = new THREE.CylinderGeometry(1.5 * scale, 1.5 * scale, 0.1, 32);
    const tableMaterial = new THREE.MeshStandardMaterial({
      color: 0x333344,
      roughness: 0.2,
      metalness: 0.8
    });
    const top = new THREE.Mesh(topGeometry, tableMaterial);
    top.position.y = 0.45;
    top.castShadow = true;
    top.receiveShadow = true;
    group.add(top);

    // Glass surface
    const glassGeometry = new THREE.CylinderGeometry(1.4 * scale, 1.4 * scale, 0.02, 32);
    const glassMaterial = new THREE.MeshStandardMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.3,
      roughness: 0.0,
      metalness: 0.9
    });
    const glass = new THREE.Mesh(glassGeometry, glassMaterial);
    glass.position.y = 0.51;
    group.add(glass);

    // Legs
    const legGeometry = new THREE.CylinderGeometry(0.05 * scale, 0.05 * scale, 0.4, 8);
    const legMaterial = new THREE.MeshStandardMaterial({
      color: 0x222233,
      roughness: 0.3,
      metalness: 0.7
    });

    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const leg = new THREE.Mesh(legGeometry, legMaterial);
      leg.position.set(
        Math.cos(angle) * scale,
        0.2,
        Math.sin(angle) * scale
      );
      leg.castShadow = true;
      group.add(leg);
    }

    group.position.set(x, y, z);
    this.scene.add(group);
  }

  private createSideTable(x: number, y: number, z: number): void {
    const group = new THREE.Group();

    // Table top
    const topGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.05, 16);
    const tableMaterial = new THREE.MeshStandardMaterial({
      color: 0x444455,
      roughness: 0.3,
      metalness: 0.6
    });
    const top = new THREE.Mesh(topGeometry, tableMaterial);
    top.position.y = 0.6;
    top.castShadow = true;
    group.add(top);

    // Stem
    const stemGeometry = new THREE.CylinderGeometry(0.05, 0.08, 0.55, 8);
    const stem = new THREE.Mesh(stemGeometry, tableMaterial);
    stem.position.y = 0.3;
    stem.castShadow = true;
    group.add(stem);

    // Base
    const baseGeometry = new THREE.CylinderGeometry(0.3, 0.35, 0.05, 16);
    const base = new THREE.Mesh(baseGeometry, tableMaterial);
    base.position.y = 0.025;
    base.castShadow = true;
    group.add(base);

    group.position.set(x, y, z);
    this.scene.add(group);
  }

  private createBar(x: number, y: number, z: number): void {
    const group = new THREE.Group();

    // Bar counter
    const counterGeometry = new THREE.BoxGeometry(6, 1.1, 0.8);
    const barMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a3a5a,
      roughness: 0.4,
      metalness: 0.5
    });
    const counter = new THREE.Mesh(counterGeometry, barMaterial);
    counter.position.y = 0.55;
    counter.castShadow = true;
    counter.receiveShadow = true;
    group.add(counter);

    // Bar top surface
    const topGeometry = new THREE.BoxGeometry(6.2, 0.08, 1);
    const topMaterial = new THREE.MeshStandardMaterial({
      color: 0x222244,
      roughness: 0.2,
      metalness: 0.7
    });
    const barTop = new THREE.Mesh(topGeometry, topMaterial);
    barTop.position.y = 1.14;
    barTop.castShadow = true;
    group.add(barTop);

    // Neon strip on front
    const stripGeometry = new THREE.BoxGeometry(5.8, 0.05, 0.05);
    const stripMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const strip = new THREE.Mesh(stripGeometry, stripMaterial);
    strip.position.set(0, 0.9, 0.42);
    group.add(strip);

    // Bar stools
    for (let i = -2; i <= 2; i++) {
      if (i !== 0) {
        this.createBarStool(group, i * 1.3, 0, -1);
      }
    }

    group.position.set(x, y, z);
    this.scene.add(group);
  }

  private createBarStool(parent: THREE.Group, x: number, y: number, z: number): void {
    const stoolGroup = new THREE.Group();

    // Seat
    const seatGeometry = new THREE.CylinderGeometry(0.25, 0.25, 0.1, 16);
    const seatMaterial = new THREE.MeshStandardMaterial({
      color: 0x6b4c9a,
      roughness: 0.5,
      metalness: 0.2
    });
    const seat = new THREE.Mesh(seatGeometry, seatMaterial);
    seat.position.y = 0.75;
    seat.castShadow = true;
    stoolGroup.add(seat);

    // Stem
    const stemGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.7, 8);
    const metalMaterial = new THREE.MeshStandardMaterial({
      color: 0x888899,
      roughness: 0.3,
      metalness: 0.8
    });
    const stem = new THREE.Mesh(stemGeometry, metalMaterial);
    stem.position.y = 0.35;
    stem.castShadow = true;
    stoolGroup.add(stem);

    // Footrest ring
    const ringGeometry = new THREE.TorusGeometry(0.2, 0.02, 8, 16);
    const ring = new THREE.Mesh(ringGeometry, metalMaterial);
    ring.position.y = 0.25;
    ring.rotation.x = Math.PI / 2;
    stoolGroup.add(ring);

    // Base
    const baseGeometry = new THREE.CylinderGeometry(0.25, 0.28, 0.05, 16);
    const base = new THREE.Mesh(baseGeometry, metalMaterial);
    base.position.y = 0.025;
    stoolGroup.add(base);

    stoolGroup.position.set(x, y, z);
    parent.add(stoolGroup);
  }

  private addPlants(): void {
    // Potted plants around the lounge
    const plantPositions = [
      { x: -12, z: -8 },
      { x: 12, z: -8 },
      { x: -12, z: 8 },
      { x: 12, z: 8 },
      { x: -5, z: 10 },
      { x: 5, z: 10 },
      { x: 0, z: -10 }
    ];

    plantPositions.forEach((pos) => {
      this.createPlant(pos.x, 0, pos.z);
    });
  }

  private createPlant(x: number, y: number, z: number): void {
    const group = new THREE.Group();

    // Pot
    const potGeometry = new THREE.CylinderGeometry(0.4, 0.3, 0.6, 16);
    const potMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a3a2a,
      roughness: 0.8,
      metalness: 0.1
    });
    const pot = new THREE.Mesh(potGeometry, potMaterial);
    pot.position.y = 0.3;
    pot.castShadow = true;
    pot.receiveShadow = true;
    group.add(pot);

    // Soil
    const soilGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.1, 16);
    const soilMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a2a1a,
      roughness: 0.9
    });
    const soil = new THREE.Mesh(soilGeometry, soilMaterial);
    soil.position.y = 0.55;
    group.add(soil);

    // Plant leaves (simplified as spheres and cones)
    const leafMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d5a3d,
      roughness: 0.7,
      metalness: 0.0
    });

    // Central stem with leaves
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const height = 0.8 + Math.random() * 0.6;

      const leafGeometry = new THREE.ConeGeometry(0.15, 0.5, 8);
      const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
      leaf.position.set(
        Math.cos(angle) * 0.2,
        height,
        Math.sin(angle) * 0.2
      );
      leaf.rotation.x = Math.PI;
      leaf.rotation.z = Math.cos(angle) * 0.3;
      leaf.castShadow = true;
      group.add(leaf);
    }

    // Add some variety with a sphere bush on top
    const bushGeometry = new THREE.SphereGeometry(0.35, 8, 8);
    const bush = new THREE.Mesh(bushGeometry, leafMaterial);
    bush.position.y = 1.2;
    bush.castShadow = true;
    group.add(bush);

    group.position.set(x, y, z);
    this.scene.add(group);
  }

  private addDecorations(): void {
    // Floating orbs for ambiance
    const orbColors = [0x00ffff, 0xff00ff, 0x00ff88, 0xff8800, 0x8800ff];

    for (let i = 0; i < 15; i++) {
      const orbGeometry = new THREE.SphereGeometry(0.15, 16, 16);
      const orbMaterial = new THREE.MeshBasicMaterial({
        color: orbColors[i % orbColors.length],
        transparent: true,
        opacity: 0.7
      });

      const orb = new THREE.Mesh(orbGeometry, orbMaterial);
      orb.position.set(
        (Math.random() - 0.5) * 25,
        2.5 + Math.random() * 4,
        (Math.random() - 0.5) * 25
      );
      orb.userData.floatSpeed = 0.3 + Math.random() * 0.5;
      orb.userData.floatOffset = Math.random() * Math.PI * 2;
      orb.userData.baseY = orb.position.y;

      this.scene.add(orb);
      this.floatingOrbs.push(orb);
    }

    // Wall art / neon signs
    this.createNeonSign(-15, 4, 0, 'LOUNGE', 0xff00ff);
    this.createNeonSign(15, 4, 0, 'CHILL', 0x00ffff, Math.PI);
  }

  private createNeonSign(x: number, y: number, z: number, _text: string, color: number, rotationY = 0): void {
    const group = new THREE.Group();

    // Simple neon tube representation
    const tubeGeometry = new THREE.BoxGeometry(3, 0.5, 0.1);
    const neonMaterial = new THREE.MeshBasicMaterial({ color });
    const tube = new THREE.Mesh(tubeGeometry, neonMaterial);
    group.add(tube);

    // Glow effect using point light
    const glowLight = new THREE.PointLight(color, 0.5, 8);
    glowLight.position.z = 0.2;
    group.add(glowLight);

    group.position.set(x, y, z);
    group.rotation.y = rotationY;
    this.scene.add(group);
  }

  public start(): void {
    this.animate();
  }

  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);

    const elapsed = this.clock.getElapsedTime();
    const delta = this.clock.getDelta();

    // Handle WASD movement
    this.handleMovement(delta);

    // Update OrbitControls
    this.controls.update();

    // Animate floating orbs
    this.floatingOrbs.forEach((orb) => {
      const offset = Math.sin(elapsed * orb.userData.floatSpeed + orb.userData.floatOffset);
      orb.position.y = orb.userData.baseY + offset * 0.3;
    });

    // Subtle light pulsing
    this.pointLights.forEach((light, index) => {
      light.intensity = 0.8 + Math.sin(elapsed * 0.5 + index) * 0.2;
    });

    this.renderer.render(this.scene, this.camera);
  };

  private handleMovement(_delta: number): void {
    // Get camera direction
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    direction.y = 0;
    direction.normalize();

    // Get right vector
    const right = new THREE.Vector3();
    right.crossVectors(direction, new THREE.Vector3(0, 1, 0));

    // Calculate movement
    const movement = new THREE.Vector3();

    if (this.moveForward) {
      movement.add(direction.clone().multiplyScalar(this.moveSpeed));
    }
    if (this.moveBackward) {
      movement.sub(direction.clone().multiplyScalar(this.moveSpeed));
    }
    if (this.moveLeft) {
      movement.sub(right.clone().multiplyScalar(this.moveSpeed));
    }
    if (this.moveRight) {
      movement.add(right.clone().multiplyScalar(this.moveSpeed));
    }

    // Apply movement to both camera and controls target
    if (movement.length() > 0) {
      this.camera.position.add(movement);
      this.controls.target.add(movement);
    }
  }

  public onWindowResize(): void {
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  }

  public dispose(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }
    this.controls.dispose();
    this.renderer.dispose();
  }
}
