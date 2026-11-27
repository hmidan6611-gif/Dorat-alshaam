// Floor reflections for an orthographic camera: the scene is rendered from a camera mirrored under the floor
// into a half-size texture, then added faintly on top of the floor. Used only at "high" quality.
import { THREE } from './scene.js';

const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

export function makeFloorReflection(size = 16, strength = 0.22) {
  const rt = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType });
  const texMatrix = new THREE.Matrix4();
  const mat = new THREE.ShaderMaterial({
    uniforms: { tMap: { value: rt.texture }, uTex: { value: texMatrix }, uStrength: { value: strength } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: `uniform mat4 uTex; varying vec4 vUv;
      void main(){ vec4 w = modelMatrix * vec4(position,1.0); vUv = uTex * w; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform sampler2D tMap; uniform float uStrength; varying vec4 vUv;
      void main(){ vec3 c = texture2DProj(tMap, vUv).rgb; gl_FragColor = vec4(c * uStrength, 1.0); }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.004; mesh.renderOrder = -1;
  const mirror = new THREE.OrthographicCamera();
  const p = new THREE.Vector3(), dir = new THREE.Vector3(), up = new THREE.Vector3();
  /** Render the mirrored view; call before the main render (not during it). hide: objects to leave out, e.g. floor plates. */
  mesh.userData.update = (renderer, scene, camera, hide = []) => {
    if (!mesh.visible || !mesh.parent?.visible) return;
    const w = renderer.domElement.width, h = renderer.domElement.height;
    if (rt.width !== Math.round(w / 2) || rt.height !== Math.round(h / 2)) rt.setSize(Math.round(w / 2), Math.round(h / 2));
    mesh.updateMatrixWorld();
    const y = mesh.getWorldPosition(p).y;
    camera.updateMatrixWorld();
    mirror.copy(camera);
    camera.getWorldPosition(p); camera.getWorldDirection(dir); up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    mirror.position.set(p.x, 2 * y - p.y, p.z);
    dir.y = -dir.y; up.y = -up.y;
    mirror.up.copy(up); mirror.lookAt(mirror.position.clone().add(dir));
    mirror.updateMatrixWorld(); mirror.updateProjectionMatrix();
    texMatrix.copy(BIAS).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
    mesh.visible = false; hide.forEach(o => { o.visible = false; });
    const prevTarget = renderer.getRenderTarget(), prevShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, mirror);
    renderer.setRenderTarget(prevTarget); renderer.shadowMap.autoUpdate = prevShadow;
    mesh.visible = true; hide.forEach(o => { o.visible = true; });
  };
  return mesh;
}
