import { useEffect, useRef } from 'react';
import * as THREE from 'three';

type MissionGlobe3DProps = {
  deployCritical: boolean;
  opsWaiting: boolean;
};

type MarkerVisual = {
  core: THREE.MeshBasicMaterial;
  glow: THREE.SpriteMaterial;
};

const continentPolygons: Array<Array<[number, number]>> = [
  [[-168,72],[-130,70],[-102,60],[-82,49],[-66,45],[-82,25],[-99,18],[-118,31],[-137,52],[-160,60]],
  [[-81,12],[-65,9],[-49,-5],[-40,-20],[-55,-55],[-70,-48],[-76,-20]],
  [[-12,70],[20,71],[42,60],[32,45],[10,36],[-9,43]],
  [[-18,35],[8,37],[28,31],[42,12],[36,-35],[17,-35],[-5,-18],[-17,12]],
  [[34,70],[77,72],[117,58],[146,48],[160,31],[132,10],[103,5],[80,19],[58,27],[42,42]],
  [[112,-11],[153,-12],[154,-39],[119,-43],[110,-27]],
  [[-48,83],[-18,82],[-25,64],[-51,60],[-63,70]],
];

const cities: Array<[number, number]> = [
  [40.7,-74],[34,-118],[37.8,-122],[25.8,-80],[19.4,-99],[43.7,-79],[49.3,-123],
  [-23.5,-46.6],[-34.6,-58.4],[-12,-77],[4.7,-74],
  [51.5,-0.1],[48.9,2.35],[52.5,13.4],[41.9,12.5],[40.4,-3.7],[52.4,4.9],
  [30,31.2],[25.2,55.3],[24.7,46.7],[21.4,39.8],[33.3,44.4],
  [-1.3,36.8],[6.5,3.4],[-26.2,28],
  [28.6,77.2],[19.1,72.9],[13.1,80.3],[22.6,88.4],
  [31.2,121.5],[39.9,116.4],[22.3,114.2],[23.1,113.3],[30.6,104.1],
  [35.7,139.7],[37.6,127],[1.35,103.8],[13.8,100.5],
  [-33.9,151.2],[-37.8,145],
];

const latLonToVector = (lat: number, lon: number, radius: number) => {
  const latRad = THREE.MathUtils.degToRad(lat);
  const lonRad = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(
    radius * Math.cos(latRad) * Math.sin(lonRad),
    radius * Math.sin(latRad),
    radius * Math.cos(latRad) * Math.cos(lonRad)
  );
};

function makeEarthTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const ocean = ctx.createLinearGradient(0, 0, 0, canvas.height);
  ocean.addColorStop(0, '#082854');
  ocean.addColorStop(0.45, '#063a70');
  ocean.addColorStop(1, '#031630');
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const project = (lon: number, lat: number) => ({
    x: ((lon + 180) / 360) * canvas.width,
    y: ((90 - lat) / 180) * canvas.height,
  });

  for (const polygon of continentPolygons) {
    ctx.beginPath();
    polygon.forEach(([lon, lat], index) => {
      const point = project(lon, lat);
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    const land = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    land.addColorStop(0, '#116bb5');
    land.addColorStop(0.55, '#0b4e91');
    land.addColorStop(1, '#063568');
    ctx.fillStyle = land;
    ctx.fill();
    ctx.strokeStyle = 'rgba(83,190,255,.65)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = '#55bff7';
  ctx.lineWidth = 1;
  for (let lat = -60; lat <= 60; lat += 20) {
    const y = ((90 - lat) / 180) * canvas.height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  for (let lon = -150; lon <= 150; lon += 30) {
    const x = ((lon + 180) / 360) * canvas.width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 60);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.18, 'rgba(255,255,255,.75)');
  gradient.addColorStop(0.48, 'rgba(255,255,255,.22)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function makeOrbit(radiusX: number, radiusY: number, color: number, opacity: number, rotation: [number, number, number]) {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 180; i += 1) {
    const t = (i / 180) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(t) * radiusX, Math.sin(t) * radiusY, 0));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const line = new THREE.LineLoop(geometry, material);
  line.rotation.set(...rotation);
  return line;
}

function MissionGlobe3D({ deployCritical, opsWaiting }: MissionGlobe3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const visualsRef = useRef<Record<string, MarkerVisual>>({});

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0.06, 4.65);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = 'globe-3d-canvas';
    renderer.domElement.style.touchAction = 'pan-y';
    container.appendChild(renderer.domElement);

    const earthGroup = new THREE.Group();
    earthGroup.rotation.x = THREE.MathUtils.degToRad(-8);
    earthGroup.rotation.y = THREE.MathUtils.degToRad(-4);
    scene.add(earthGroup);

    const earthTexture = makeEarthTexture();
    const earthGeometry = new THREE.SphereGeometry(1.48, 72, 72);
    const earthMaterial = new THREE.MeshPhongMaterial({
      map: earthTexture ?? undefined,
      color: 0xffffff,
      emissive: 0x03152d,
      emissiveIntensity: 0.38,
      shininess: 32,
      specular: 0x2e8fd1,
    });
    const earth = new THREE.Mesh(earthGeometry, earthMaterial);
    earthGroup.add(earth);

    const grid = new THREE.Mesh(
      new THREE.SphereGeometry(1.493, 36, 20),
      new THREE.MeshBasicMaterial({
        color: 0x39b9ff,
        wireframe: true,
        transparent: true,
        opacity: 0.06,
        depthWrite: false,
      })
    );
    earthGroup.add(grid);

    const atmosphereMaterial = new THREE.ShaderMaterial({
      vertexShader: 'varying vec3 vNormal; void main(){vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'varying vec3 vNormal; void main(){float i=pow(0.7-dot(vNormal,vec3(0.0,0.0,1.0)),2.8);gl_FragColor=vec4(0.08,0.52,1.0,1.0)*i;}',
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.59, 64, 64), atmosphereMaterial);
    scene.add(atmosphere);

    const cityPositions: number[] = [];
    for (const [lat, lon] of cities) {
      for (let j = 0; j < 3; j += 1) {
        const jitterLat = lat + Math.sin((lat + lon + j) * 1.71) * 1.4;
        const jitterLon = lon + Math.cos((lat - lon + j) * 1.37) * 1.8;
        const point = latLonToVector(jitterLat, jitterLon, 1.505);
        cityPositions.push(point.x, point.y, point.z);
      }
    }
    const cityGeometry = new THREE.BufferGeometry();
    cityGeometry.setAttribute('position', new THREE.Float32BufferAttribute(cityPositions, 3));
    const cityMaterial = new THREE.PointsMaterial({
      color: 0xffc766,
      size: 0.025,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const cityLights = new THREE.Points(cityGeometry, cityMaterial);
    earthGroup.add(cityLights);

    const glowTexture = makeGlowTexture();
    const markerSpecs = [
      { id: 'research', lat: 23, lon: -42, color: 0x19e1a0 },
      { id: 'ops', lat: 17, lon: 42, color: 0xffc044 },
      { id: 'deploy', lat: -28, lon: 3, color: 0x19e1a0 },
    ];

    for (const marker of markerSpecs) {
      const holder = new THREE.Group();
      holder.position.copy(latLonToVector(marker.lat, marker.lon, 1.54));

      const coreMaterial = new THREE.MeshBasicMaterial({ color: marker.color });
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.045, 18, 18), coreMaterial);
      holder.add(core);

      const glowMaterial = new THREE.SpriteMaterial({
        map: glowTexture ?? undefined,
        color: marker.color,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glow = new THREE.Sprite(glowMaterial);
      glow.scale.set(0.28, 0.28, 0.28);
      holder.add(glow);

      visualsRef.current[marker.id] = { core: coreMaterial, glow: glowMaterial };
      earthGroup.add(holder);
    }

    const orbitGroup = new THREE.Group();
    orbitGroup.add(makeOrbit(1.96, 0.64, 0x28b8ff, 0.35, [0.35, 0.08, -0.1]));
    orbitGroup.add(makeOrbit(2.08, 0.78, 0x158fff, 0.2, [-0.25, 0.1, 0.18]));
    orbitGroup.add(makeOrbit(1.87, 0.52, 0xffb842, 0.24, [0.7, 0.25, -0.4]));
    scene.add(orbitGroup);

    const starPositions: number[] = [];
    for (let i = 0; i < 180; i += 1) {
      const angle = i * 12.9898;
      const x = (Math.sin(angle) * 0.5 + 0.5) * 8 - 4;
      const y = (Math.sin(angle * 1.37) * 0.5 + 0.5) * 5 - 2.5;
      const z = -1.5 - (Math.sin(angle * 2.1) * 0.5 + 0.5) * 2;
      starPositions.push(x, y, z);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({ color: 0x7bcfff, size: 0.018, transparent: true, opacity: 0.65 })
    );
    scene.add(stars);

    scene.add(new THREE.AmbientLight(0x1d6097, 1.35));
    const keyLight = new THREE.DirectionalLight(0x8fd8ff, 2.5);
    keyLight.position.set(-3, 2.5, 4.5);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0x168dff, 9, 9);
    rimLight.position.set(2.5, -0.5, 3);
    scene.add(rimLight);

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let velocity = 0;

    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      velocity = 0;
      renderer.domElement.setPointerCapture?.(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      if (Math.abs(dx) > Math.abs(dy) * 0.6) {
        const delta = dx * 0.006;
        earthGroup.rotation.y += delta;
        velocity = delta;
      }
      lastX = event.clientX;
      lastY = event.clientY;
    };

    const stopDrag = () => {
      dragging = false;
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', stopDrag);
    renderer.domElement.addEventListener('pointercancel', stopDrag);

    const resize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.position.z = width < 560 ? 4.35 : 4.55;
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (!dragging) {
        earthGroup.rotation.y += 0.00115 + velocity;
        velocity *= 0.94;
      }
      orbitGroup.rotation.z += 0.00022;
      orbitGroup.rotation.y -= 0.00016;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', stopDrag);
      renderer.domElement.removeEventListener('pointercancel', stopDrag);
      renderer.dispose();
      earthTexture?.dispose();
      glowTexture?.dispose();
      earthGeometry.dispose();
      earthMaterial.dispose();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      atmosphere.geometry.dispose();
      atmosphereMaterial.dispose();
      cityGeometry.dispose();
      cityMaterial.dispose();
      starGeometry.dispose();
      (stars.material as THREE.Material).dispose();
      orbitGroup.traverse(object => {
        if (object instanceof THREE.Line) {
          object.geometry.dispose();
          (object.material as THREE.Material).dispose();
        }
      });
      for (const visual of Object.values(visualsRef.current)) {
        visual.core.dispose();
        visual.glow.dispose();
      }
      visualsRef.current = {};
      container.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    const research = visualsRef.current.research;
    const ops = visualsRef.current.ops;
    const deploy = visualsRef.current.deploy;
    if (research) {
      research.core.color.setHex(0x19e1a0);
      research.glow.color.setHex(0x19e1a0);
    }
    if (ops) {
      const color = opsWaiting ? 0xffc044 : 0x19e1a0;
      ops.core.color.setHex(color);
      ops.glow.color.setHex(color);
    }
    if (deploy) {
      const color = deployCritical ? 0xff4d64 : 0x19e1a0;
      deploy.core.color.setHex(color);
      deploy.glow.color.setHex(color);
    }
  }, [deployCritical, opsWaiting]);

  return (
    <div ref={containerRef} className="globe-3d" role="img" aria-label="Interactive three-dimensional AI operations globe">
      <span className="globe-3d-hint">DRAG TO ROTATE</span>
    </div>
  );
}

export default MissionGlobe3D;