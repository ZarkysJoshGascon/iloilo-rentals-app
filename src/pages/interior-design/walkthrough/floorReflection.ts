// src/pages/interior-design/walkthrough/floorReflection.ts
// Planar reflections for a polished floor. Each frame the room is rendered
// from a camera mirrored in the floor plane, at reduced resolution and in
// HDR, into a texture with mipmaps. The floor's own material then blends that
// image in: rippled by its normal map, blurred by its roughness map (sharper
// where the finish is smoother), and stronger at grazing angles (Fresnel), as
// a lacquered timber floor does. The room probe still lights the rest.

type FloorReflectionOptions = {
  /** Height of the floor plane, in metres. */
  y?: number
  /** Resolution of the reflection relative to the drawing buffer. */
  scale?: number
  /** Overall strength of the reflection, 0–1. */
  strength?: number
  /** Blur of the lacquer, 0 (mirror) to 1 (satin). Roughness maps vary it. */
  gloss?: number
  /** How far the normal map ripples the reflection, in screen units. */
  ripple?: number
}

export function createFloorReflection(THREE, renderer, scene, floor, { y = 0, scale = 0.5, strength = 0.7, gloss = 0.22, ripple = 0.035 }: FloorReflectionOptions = {}) {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
  })
  const mirror = new THREE.PerspectiveCamera()
  mirror.layers.mask = 0xffffffff
  const textureMatrix = new THREE.Matrix4()
  const plane = new THREE.Plane()
  const clip = new THREE.Vector4()
  const q = new THREE.Vector4()
  const normal = new THREE.Vector3(0, 1, 0)
  const onPlane = new THREE.Vector3(0, y, 0)
  const eye = new THREE.Vector3()
  const view = new THREE.Vector3()
  const look = new THREE.Vector3()
  const lookTarget = new THREE.Vector3()
  const rotation = new THREE.Matrix4()
  const size = new THREE.Vector2()
  let maxLod = 1
  let leaves = null

  const uniforms = {
    floorReflection: { value: target.texture },
    floorReflectionMatrix: { value: textureMatrix },
    floorReflectionStrength: { value: strength },
    floorReflectionGloss: { value: gloss },
    floorReflectionRipple: { value: ripple },
    floorReflectionMaxLod: { value: maxLod },
  }
  const material = floor.material
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 floorReflectionMatrix;\nvarying vec4 vFloorReflection;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFloorReflection = floorReflectionMatrix * (modelMatrix * vec4(transformed, 1.0));')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D floorReflection;
uniform float floorReflectionStrength;
uniform float floorReflectionGloss;
uniform float floorReflectionRipple;
uniform float floorReflectionMaxLod;
varying vec4 vFloorReflection;`)
      .replace('#include <opaque_fragment>', `{
  // How much the normal map tilts this point away from the flat floor.
  vec3 flatNormal = normalize(vNormal);
  vec2 ripple = (normal - flatNormal).xy * floorReflectionRipple;
  vec2 uv = vFloorReflection.xy / vFloorReflection.w + ripple;
  // Smoother lacquer reflects more sharply; the roughness map varies it.
  float blur = clamp(floorReflectionGloss * (0.55 + roughnessFactor), 0.0, 1.0);
  vec3 reflected = textureLod(floorReflection, uv, blur * floorReflectionMaxLod).rgb;
  float facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  float fresnel = 0.04 + 0.96 * pow(1.0 - facing, 5.0);
  float weight = floorReflectionStrength * mix(0.22, 1.0, fresnel) * (1.0 - 0.6 * blur);
  outgoingLight = mix(outgoingLight, outgoingLight + reflected, weight);
}
#include <opaque_fragment>`)
  }
  material.customProgramCacheKey = () => 'floor-reflection'
  material.needsUpdate = true

  function setSize() {
    renderer.getDrawingBufferSize(size)
    const w = Math.max(1, Math.round(size.x * scale))
    const h = Math.max(1, Math.round(size.y * scale))
    target.setSize(w, h)
    maxLod = Math.floor(Math.log2(Math.max(w, h)))
    uniforms.floorReflectionMaxLod.value = Math.min(7, maxLod)
  }

  // Mirror the camera in the floor plane (after three's Reflector), with an
  // oblique near plane so nothing below the floor gets into the reflection.
  function update(camera) {
    eye.setFromMatrixPosition(camera.matrixWorld)
    if (eye.y <= y) return
    view.subVectors(onPlane, eye).reflect(normal).negate().add(onPlane)
    rotation.extractRotation(camera.matrixWorld)
    look.set(0, 0, -1).applyMatrix4(rotation).add(eye)
    lookTarget.subVectors(onPlane, look).reflect(normal).negate().add(onPlane)
    mirror.position.copy(view)
    mirror.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal)
    mirror.lookAt(lookTarget)
    mirror.far = camera.far
    mirror.updateMatrixWorld()
    mirror.projectionMatrix.copy(camera.projectionMatrix)

    textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
    textureMatrix.multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse)

    plane.setFromNormalAndCoplanarPoint(normal, onPlane).applyMatrix4(mirror.matrixWorldInverse)
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant)
    const p = mirror.projectionMatrix.elements
    q.x = (Math.sign(clip.x) + p[8]) / p[0]
    q.y = (Math.sign(clip.y) + p[9]) / p[5]
    q.z = -1
    q.w = (1 + p[10]) / p[14]
    clip.multiplyScalar(2 / clip.dot(q))
    p[2] = clip.x
    p[6] = clip.y
    p[10] = clip.z + 1
    p[14] = clip.w
    mirror.projectionMatrixInverse.copy(mirror.projectionMatrix).invert()

    // Leaves (instanced) barely register in a blurred floor reflection, and
    // are the costliest thing to draw twice.
    if (!leaves) { leaves = []; scene.traverse((o) => { if (o.isInstancedMesh) leaves.push(o) }) }
    const previousTarget = renderer.getRenderTarget()
    floor.visible = false
    for (const leaf of leaves) leaf.visible = false
    renderer.setRenderTarget(target)
    renderer.clear()
    renderer.render(scene, mirror)
    renderer.setRenderTarget(previousTarget)
    floor.visible = true
    for (const leaf of leaves) leaf.visible = true
  }

  function dispose() {
    target.dispose()
  }

  return { update, setSize, dispose, uniforms, target }
}
