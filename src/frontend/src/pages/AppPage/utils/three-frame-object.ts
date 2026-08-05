type ThreeModule = typeof import("three");

/**
 * Centers an object at the origin and positions the camera so a fixed
 * distance-to-size ratio frames it regardless of its native units -- shared
 * by every Three.js-based widget (mesh, point cloud) that doesn't otherwise
 * know the scale of the data it's rendering.
 */
export function frameObject(
  THREE: ThreeModule,
  object: import("three").Object3D,
  camera: import("three").PerspectiveCamera,
  controls: import("three/addons/controls/OrbitControls.js").OrbitControls,
): void {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);

  const maxDimension = Math.max(size.x, size.y, size.z, 1e-6);
  const distance = maxDimension * 2.2;
  camera.position.set(distance, distance * 0.6, distance);
  camera.near = maxDimension / 100;
  camera.far = maxDimension * 100;
  camera.updateProjectionMatrix();
  controls.target.set(0, 0, 0);
  controls.update();
}
