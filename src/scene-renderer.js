// SceneRenderer: seluruh batas Three.js editor.
// Kelas ini tidak menyimpan data kreatif; ia menerima scene view dan waktu, lalu
// membangun/memperbarui mesh. Sampling pose selalu melalui TimelineEngine agar
// preview observer, preview kamera dan ekspor memakai angka yang sama.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {wallPanels} from './spatial.js';
import {sampleScene} from './timeline-engine.js';

export class SceneRenderer {
  /**
   * @param {{viewport:HTMLElement, labelLayer:HTMLElement, povContainer:HTMLElement}} elements
   */
  constructor({viewport, labelLayer, povContainer}) {
    this.viewport = viewport;
    this.labelLayer = labelLayer;
    this.walls = true;      // dinding transparan
    this.paths = true;      // jalur gerakan
    this.viewMode = 'perspective'; // perspective | top | camera
    this.selected = null;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#eeeee7');
    this.scene.fog = new THREE.Fog('#eeeee7', 50, 100);

    this.renderer = new THREE.WebGLRenderer({antialias: true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor('#eeeee7');
    viewport.prepend(this.renderer.domElement);

    this.povRenderer = new THREE.WebGLRenderer({antialias: true, preserveDrawingBuffer: true});
    this.povRenderer.setSize(1280, 720, false);
    this.povRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.povRenderer.toneMappingExposure = 1.15;
    this.povRenderer.shadowMap.enabled = true;
    this.povRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    povContainer.prepend(this.povRenderer.domElement);

    this.observer = new THREE.PerspectiveCamera(40, 1, .1, 200);
    this.observer.position.set(16, 17, 21);
    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, .1, 30);
    this.camera.filmGauge = 36;
    this.controls = new OrbitControls(this.observer, this.renderer.domElement);
    this.controls.target.set(0, 0, -1);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2.08;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 65;
    this.controls.update();

    this.scene.add(new THREE.HemisphereLight('#fff9e9', '#afb4a2', 2.8));
    const sun = new THREE.DirectionalLight('#fff4dd', 3);
    sun.position.set(-10, 20, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {left: -25, right: 25, top: 25, bottom: -25});
    sun.shadow.normalBias = .04;
    this.scene.add(sun);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({color: '#eeeee7', roughness: 1}));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -.09;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.grid = new THREE.GridHelper(90, 90, '#d1d5c6', '#dfe2d6');
    this.grid.position.y = -.075;
    this.scene.add(this.grid);

    this.roomsGroup = new THREE.Group();
    this.actorsGroup = new THREE.Group();
    this.decorGroup = new THREE.Group();
    this.pathsGroup = new THREE.Group();
    this.scene.add(this.roomsGroup, this.actorsGroup, this.decorGroup, this.pathsGroup);
    this.actorMeshes = new Map();
    this.roomMeshes = new Map();
    this.labels = [];

    this.cameraMarker = new THREE.Group();
    const markerMaterial = new THREE.MeshStandardMaterial({color: '#5c7053'});
    this.cameraMarker.add(new THREE.Mesh(new THREE.BoxGeometry(.55, .35, .4), markerMaterial));
    const cone = new THREE.Mesh(new THREE.ConeGeometry(.26, .4, 4), markerMaterial);
    cone.rotation.x = -Math.PI / 2;
    cone.position.z = -.34;
    this.cameraMarker.add(cone);
    this.scene.add(this.cameraMarker);

    this.helperCamera = this.camera.clone();
    this.helperCamera.far = 5;
    this.helper = new THREE.CameraHelper(this.helperCamera);
    this.helper.setColors('#718264', '#718264', '#718264', '#718264', '#718264');
    this.helper.material.transparent = true;
    this.helper.material.opacity = .55;
    this.scene.add(this.helper);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }

  get canvas() {return this.renderer.domElement;}
  get povCanvas() {return this.povRenderer.domElement;}

  // ---------- konstruksi scene ----------
  static clearGroup(group) {
    while (group.children.length) {
      const object = group.children[0];
      group.remove(object);
      object.traverse(child => {
        child.geometry?.dispose();
        if (child.material) for (const m of Array.isArray(child.material) ? child.material : [child.material]) m.dispose();
      });
    }
  }
  static box(parent, w, h, d, x, y, z, color, opacity = 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({color, roughness: .85, transparent: opacity < 1, opacity, depthWrite: opacity === 1}));
    mesh.position.set(x, y, z);
    mesh.castShadow = opacity === 1;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  addLabel(text, kind, id, position) {
    const el = document.createElement('div');
    el.className = `scene-label ${kind}`;
    el.textContent = text;
    this.labelLayer.append(el);
    this.labels.push({el, id, position, kind});
  }

  /** Membangun ulang seluruh geometri scene dari scene view. */
  build(view, time) {
    const box = SceneRenderer.box;
    [this.roomsGroup, this.actorsGroup, this.decorGroup].forEach(SceneRenderer.clearGroup);
    this.actorMeshes.clear();
    this.roomMeshes.clear();
    this.labels.length = 0;
    this.labelLayer.innerHTML = '';

    view.rooms.forEach((r, i) => {
      const g = new THREE.Group();
      g.position.set(r.x, 0, r.z);
      g.userData.id = r.id;
      g.visible = r.visible !== false;
      this.roomsGroup.add(g);
      this.roomMeshes.set(r.id, g);
      box(g, r.w, .14, r.d, 0, 0, 0, r.color);
      const wallColor = new THREE.Color(r.color).lerp(new THREE.Color('#faf7eb'), .3);
      for (const side of ['back', 'left']) {
        for (const p of wallPanels(r, side)) {
          const mesh = side === 'back'
            ? box(g, p.width, p.height, .12, p.center, p.y, -r.d / 2, wallColor, this.walls ? .24 : 1)
            : box(g, .12, p.height, p.width, -r.w / 2, p.y, p.center, wallColor, this.walls ? .24 : 1);
          mesh.userData.wallPanel = side;
        }
        const door = r.doors?.find(d => d.wall === side);
        if (door) {
          for (const offset of [door.offset - door.width / 2, door.offset + door.width / 2]) {
            if (side === 'back') box(g, .08, door.height, .2, offset, door.height / 2, -r.d / 2, '#8d795c');
            else box(g, .2, door.height, .08, -r.w / 2, door.height / 2, offset, '#8d795c');
          }
          if (side === 'back') box(g, door.width + .08, .08, .2, door.offset, door.height, -r.d / 2, '#8d795c');
          else box(g, .2, .08, door.width + .08, -r.w / 2, door.height, door.offset, '#8d795c');
        }
      }
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(r.w, r.h, r.d)), new THREE.LineBasicMaterial({color: '#8d9586', transparent: true, opacity: .45}));
      edge.position.y = r.h / 2;
      g.add(edge);
      this.addLabel(`${String(i + 1).padStart(2, '0')} / ${r.name}`, 'room', r.id, new THREE.Vector3(r.x, .2, r.z + (i === 2 ? -r.d / 2 - .6 : r.d / 2 + .3)));
      // Set dressing arsitektural mengikuti dimensi ruangannya.
      if (i === 1) {
        box(g, r.w * .32, .6, .85, .5, .37, -r.d * .12, '#b9ab8e');
        box(g, r.w * .34, .1, .96, .5, .72, -r.d * .12, '#e6dcc4');
        for (const x of [-r.w * .32, r.w * .32]) {
          box(g, .65, 1, .65, x, .58, -r.d * .30, '#e7dfcb');
          const sculpture = new THREE.Mesh(new THREE.IcosahedronGeometry(.38, 0), new THREE.MeshStandardMaterial({color: '#8a927d', roughness: .9}));
          sculpture.position.set(x, 1.45, -r.d * .30);
          g.add(sculpture);
        }
        for (const x of [-r.w * .27, 0, r.w * .27]) {
          const doorway = r.doors?.find(d => d.wall === 'back');
          if (doorway && Math.abs(x - doorway.offset) < doorway.width / 2 + .75) continue;
          box(g, 1.5, 1.35, .08, x, 1.75, -r.d / 2 + .08, '#ece5d6');
          box(g, 1.25, 1.1, .09, x, 1.75, -r.d / 2 + .14, x === 0 ? '#a08767' : '#788c80');
        }
      }
      if (i === 0) {
        box(g, 1.8, .7, .65, -r.w * .22, .4, -r.d * .25, '#82958b');
        box(g, 1.9, .1, .75, -r.w * .22, .8, -r.d * .25, '#dce1d4');
      }
      if (i === 2) box(g, r.w * .42, .8, .7, 0, .45, -r.d * .2, '#96a18b');
    });

    view.actors.forEach(a => {
      const g = new THREE.Group();
      g.userData.id = a.id;
      g.visible = a.visible !== false;
      this.actorsGroup.add(g);
      this.actorMeshes.set(a.id, g);
      const mat = new THREE.MeshStandardMaterial({color: a.color, roughness: .8});
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.22, .62, 4, 12), mat);
      torso.position.y = .95;
      g.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(.23, 20, 16), mat);
      head.position.y = 1.57;
      g.add(head);
      for (const [index, x] of [-.13, .13].entries()) {
        const hip = new THREE.Group();
        hip.name = `leg-${index}`;
        hip.position.set(x, .65, 0);
        g.add(hip);
        const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.075, .39, 4, 8), mat);
        leg.position.y = -.26;
        hip.add(leg);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(.15, .10, .24), mat);
        foot.position.set(0, -.53, .055);
        hip.add(foot);
        const shoulder = new THREE.Group();
        shoulder.name = `arm-${index}`;
        shoulder.position.set(x < 0 ? -.29 : .29, 1.18, 0);
        g.add(shoulder);
        const arm = new THREE.Mesh(new THREE.CapsuleGeometry(.06, .38, 4, 8), mat);
        arm.position.y = -.22;
        shoulder.add(arm);
      }
      const nose = new THREE.Mesh(new THREE.ConeGeometry(.075, .17, 8), new THREE.MeshStandardMaterial({color: new THREE.Color(a.color).multiplyScalar(.75)}));
      nose.rotation.x = Math.PI / 2;
      nose.position.set(0, 1.57, .23);
      g.add(nose);
      for (const x of [-.08, .08]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(.026, 8, 8), new THREE.MeshStandardMaterial({color: '#353f32'}));
        eye.position.set(x, 1.63, .211);
        g.add(eye);
      }
      const direction = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, .13, .5), .7, a.color, .2, .16);
      direction.name = 'direction';
      g.add(direction);
      const ring = new THREE.Mesh(new THREE.RingGeometry(.38, .43, 40), new THREE.MeshBasicMaterial({color: a.color, side: THREE.DoubleSide}));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = .1;
      ring.name = 'selection';
      g.add(ring);
      g.scale.setScalar(a.height / 1.8);
      g.traverse(o => {if (o.isMesh) {o.castShadow = true; o.receiveShadow = true;}});
      this.addLabel(a.name, 'actor', a.id, new THREE.Vector3());
    });

    this.buildPaths(view);
    this.update(view, time);
  }

  buildPaths(view) {
    SceneRenderer.clearGroup(this.pathsGroup);
    const tracks = [...view.actors, ...(view.camera ? [{...view.camera, color: '#748466'}] : [])];
    for (const a of tracks) {
      if (a.visible === false || a.keys.length < 2) continue;
      const points = a.keys.map(k => new THREE.Vector3(k.x, .13, k.z));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineDashedMaterial({color: a.color, dashSize: .16, gapSize: .13, transparent: true, opacity: .65}));
      line.computeLineDistances();
      this.pathsGroup.add(line);
      for (const p of points) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(.075, 8, 8), new THREE.MeshBasicMaterial({color: a.color}));
        dot.position.copy(p);
        this.pathsGroup.add(dot);
      }
    }
    this.pathsGroup.visible = this.paths;
  }

  /** Menempatkan aktor dan kamera pada waktu tertentu memakai TimelineEngine. */
  update(view, time) {
    const frame = sampleScene(view, time);
    for (const actor of frame.actors) {
      const g = this.actorMeshes.get(actor.id);
      if (!g) continue;
      g.position.set(actor.pose.x, .07, actor.pose.z);
      g.rotation.y = THREE.MathUtils.degToRad(actor.pose.r);
      g.visible = actor.visible;
      g.getObjectByName('selection').visible = actor.id === this.selected && !actor.locked;
      g.getObjectByName('direction').visible = actor.id === this.selected;
      for (let i = 0; i < 2; i++) {
        g.getObjectByName(`leg-${i}`).rotation.x = actor.gait.angle * (i === 0 ? 1 : -1);
        g.getObjectByName(`arm-${i}`).rotation.x = actor.gait.angle * (i === 0 ? -.65 : .65);
      }
    }
    if (!frame.camera) {
      this.helper.visible = false;
      this.cameraMarker.visible = false;
      return frame;
    }
    const {pose, target} = frame.camera;
    this.camera.position.set(pose.x, pose.y, pose.z);
    this.camera.setFocalLength(frame.camera.focal);
    this.camera.lookAt(new THREE.Vector3(target.x, target.y, target.z));
    this.camera.updateMatrixWorld();
    this.helperCamera.copy(this.camera);
    this.helperCamera.far = 5;
    this.helperCamera.updateProjectionMatrix();
    this.helperCamera.updateMatrixWorld();
    this.helper.update();
    this.cameraMarker.position.copy(this.camera.position);
    this.cameraMarker.quaternion.copy(this.camera.quaternion);
    const markerVisible = view.camera.visible !== false;
    this.helper.visible = markerVisible;
    this.cameraMarker.visible = markerVisible;
    return frame;
  }

  updateLabels(view) {
    for (const label of this.labels) {
      let position = label.position.clone();
      if (label.kind === 'actor') {
        const actor = view.actors.find(a => a.id === label.id);
        const g = this.actorMeshes.get(label.id);
        if (!actor || !g) continue;
        position = g.position.clone();
        position.y += actor.height + .4;
        label.el.classList.toggle('selected', this.selected === label.id);
      }
      position.project(this.observer);
      const object = [...view.actors, ...view.rooms].find(o => o.id === label.id);
      label.el.style.display = this.viewMode === 'camera' || object?.visible === false || position.z > 1 || position.z < -1 ? 'none' : '';
      label.el.style.left = `${(position.x * .5 + .5) * this.viewport.clientWidth}px`;
      label.el.style.top = `${(-position.y * .5 + .5) * this.viewport.clientHeight}px`;
    }
  }

  resize() {
    const el = this.viewport;
    this.renderer.setSize(el.clientWidth, el.clientHeight);
    this.observer.aspect = el.clientWidth / el.clientHeight;
    this.observer.fov = this.observer.aspect < 1 ? 60 : 40;
    this.observer.updateProjectionMatrix();
  }

  resetView(top = false) {
    this.observer.position.set(...(top ? [0, 38, .01] : [16, 17, 21]));
    this.controls.target.set(0, 0, -1);
    this.controls.update();
    this.viewMode = top ? 'top' : 'perspective';
  }

  // ---------- rendering ----------
  /** Render sudut pandang kamera final; dipakai preview kanan dan ekspor video. */
  renderPOV(view, targetRenderer = this.povRenderer) {
    if (!view.camera) {
      targetRenderer.setClearColor('#30362f');
      targetRenderer.clear();
      return;
    }
    const oldBackground = this.scene.background;
    this.scene.background = new THREE.Color('#dbdfd1');
    this.pathsGroup.visible = false;
    this.helper.visible = false;
    this.cameraMarker.visible = false;
    this.grid.visible = false;
    const rings = [];
    this.actorsGroup.traverse(o => {
      if (o.name === 'selection' || o.name === 'direction') {rings.push([o, o.visible]); o.visible = false;}
    });
    const materialState = [];
    this.roomsGroup.traverse(o => {
      if (o.isMesh && o.material.transparent) {
        materialState.push([o.material, o.material.opacity]);
        o.material.opacity = 1;
        o.material.transparent = false;
        o.material.depthWrite = true;
      }
    });
    targetRenderer.render(this.scene, this.camera);
    materialState.forEach(([m, opacity]) => {m.opacity = opacity; m.transparent = true; m.depthWrite = false;});
    rings.forEach(([o, visible]) => {o.visible = visible;});
    this.scene.background = oldBackground;
    this.pathsGroup.visible = this.paths;
    const markerVisible = view.camera.visible !== false;
    this.helper.visible = markerVisible;
    this.cameraMarker.visible = markerVisible;
    this.grid.visible = true;
  }

  /** Menggambar viewport utama: observer, atau kamera final dengan letterbox 16:9. */
  renderViewport(view) {
    this.controls.update();
    if (this.viewMode === 'camera') {
      const w = this.viewport.clientWidth, h = this.viewport.clientHeight;
      const fw = Math.min(w, h * 16 / 9), fh = fw * 9 / 16;
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, w, h);
      this.renderer.setClearColor('#30362f');
      this.renderer.clear();
      this.renderer.setViewport((w - fw) / 2, (h - fh) / 2, fw, fh);
      this.renderer.setScissor((w - fw) / 2, (h - fh) / 2, fw, fh);
      this.renderer.setScissorTest(true);
      this.renderPOV(view, this.renderer);
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, w, h);
    } else this.renderer.render(this.scene, this.observer);
    this.renderPOV(view);
    this.updateLabels(view);
  }

  // ---------- picking ----------
  frameRect() {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (this.viewMode !== 'camera') return rect;
    const width = Math.min(rect.width, rect.height * 16 / 9), height = width * 9 / 16;
    return {left: rect.left + (rect.width - width) / 2, top: rect.top + (rect.height - height) / 2, width, height};
  }
  ray(event) {
    const rect = this.frameRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    if (Math.abs(this.pointer.x) > 1 || Math.abs(this.pointer.y) > 1) return false;
    this.raycaster.setFromCamera(this.pointer, this.viewMode === 'camera' ? this.camera : this.observer);
    return true;
  }
  floorPoint(event) {
    if (!this.ray(event)) return null;
    return this.raycaster.ray.intersectPlane(this.floor, new THREE.Vector3());
  }
  /** ID objek di bawah pointer; ruangan hanya menjadi target setelah dipilih eksplisit. */
  hitId(event, {mode, roomIds}) {
    if (!this.ray(event)) return null;
    const hits = this.raycaster.intersectObjects([...this.actorsGroup.children, this.cameraMarker, ...this.roomsGroup.children], true);
    for (const hit of hits) {
      if (!hit.object.isMesh) continue;
      let object = hit.object, root = null, visible = true;
      while (object) {
        if (!object.visible || object.name === 'direction' || object.name === 'selection') visible = false;
        if (object === this.cameraMarker) root = 'camera';
        if (object.userData.id) root = object.userData.id;
        object = object.parent;
      }
      if (!visible || !root || (this.viewMode === 'camera' && root === 'camera')) continue;
      if (mode !== 'orbit' && roomIds.includes(root) && root !== this.selected) continue;
      return root;
    }
    return null;
  }
  cameraDebug() {
    return {
      position: this.camera.position.toArray(),
      direction: this.camera.getWorldDirection(new THREE.Vector3()).toArray(),
      fov: this.camera.fov,
    };
  }
  projectPoint(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.viewMode === 'camera' ? this.camera : this.observer);
    const rect = this.frameRect();
    return {x: rect.left + (v.x * .5 + .5) * rect.width, y: rect.top + (-v.y * .5 + .5) * rect.height};
  }
}
