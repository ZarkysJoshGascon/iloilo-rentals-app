// Static indirect light and contact occlusion for the reference room. These
// maps have their own UV set: artwork, wood grain and cloth keep their scale.
export function createReferenceLighting(THREE, kit, mirrors = []) {
  const clamp = (value) => Math.max(0, Math.min(1, value))
  // light(u, v) is RGB irradiance and occlusion(u, v) a 0–1 visibility, at
  // world coordinates (u, v) along the two axes the map spans.
  function bake(mesh, { axes, bounds, light, occlusion = () => 1, size = [512, 512], intensity = 3 }: {
    axes: number[]
    bounds: number[]
    light: (u: number, v: number) => number[]
    occlusion?: (u: number, v: number) => number
    size?: number[]
    intensity?: number
  }) {
    const [u0, v0, u1, v1] = bounds
    // Soft gradients: phones bake them at the kit's reduced detail.
    const [width, height] = size.map((n) => Math.max(64, Math.round(n * kit.detail)))
    const makeCanvas = (): [HTMLCanvasElement, CanvasRenderingContext2D] => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      return [canvas, canvas.getContext('2d')]
    }
    const [irradiance, lightContext] = makeCanvas()
    const [ambient, ambientContext] = makeCanvas()
    const illumination = lightContext.createImageData(width, height)
    const occlusionPixels = ambientContext.createImageData(width, height)
    for (let y = 0; y < height; y++) {
      const v = v1 - y / (height - 1) * (v1 - v0)
      for (let x = 0; x < width; x++) {
        const u = u0 + x / (width - 1) * (u1 - u0)
        const rgb = light(u, v)
        const i = (y * width + x) * 4
        for (let c = 0; c < 3; c++) illumination.data[i + c] = Math.round(clamp(rgb[c] / intensity) * 255)
        illumination.data[i + 3] = 255
        const value = Math.round(clamp(occlusion(u, v)) * 255)
        occlusionPixels.data.set([value, value, value, 255], i)
      }
    }
    lightContext.putImageData(illumination, 0, 0)
    ambientContext.putImageData(occlusionPixels, 0, 0)
    const lightMap = kit.tex(irradiance, { color: false })
    lightMap.colorSpace = THREE.LinearSRGBColorSpace
    const aoMap = kit.tex(ambient, { color: false })
    for (const texture of [lightMap, aoMap]) {
      texture.channel = 1
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
    }
    // Some kit primitives share immutable geometry. Keep this object's light
    // coordinates private before the static geometry batch is assembled.
    const geometry = mesh.geometry.clone()
    kit.track.geometries.push(geometry)
    mesh.geometry = geometry
    mesh.updateWorldMatrix(true, false)
    const positions = geometry.attributes.position
    const uv = new Float32Array(positions.count * 2)
    const point = new THREE.Vector3()
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld)
      uv[i * 2] = (point.getComponent(axes[0]) - u0) / (u1 - u0)
      uv[i * 2 + 1] = (point.getComponent(axes[1]) - v0) / (v1 - v0)
    }
    geometry.setAttribute('uv1', new THREE.BufferAttribute(uv, 2))
    const material = mesh.material.clone()
    Object.assign(material, { lightMap, lightMapIntensity: intensity, aoMap, aoMapIntensity: 0.8 })
    kit.track.materials.push(material)
    if (material.userData.mirror) mirrors.push(material)
    mesh.material = material
    return mesh
  }
  // Warm ceiling bounce falls off smoothly down the photographed feature
  // walls; it is not an exposed strip pretending to illuminate a whole room.
  // `scallops` are downlights just off the wall: { at } along the wall, with
  // the fitting `gap` metres out at height `top`. Each lights the wall as a
  // spot cone does (an arched top fanning out below, fading with distance),
  // as the scallops in the reference renders.
  function wallLight(across, height, { start, end, top = 2.6, strength = 1.5, base = 0.16, scallops = [] }: {
    start: number
    end: number
    top?: number
    strength?: number
    base?: number
    scallops?: { at: number; top?: number; gap?: number; power?: number }[]
  }) {
    const endFalloff = clamp((across - start) / 0.12) * clamp((end - across) / 0.12)
    let wash = strength * Math.exp(-Math.abs(top - height) / 0.28) * endFalloff
    for (const { at, top: lampY = 2.6, gap = 0.32, power = 1 } of scallops) {
      const dx = across - at, dy = lampY - height
      const distance = Math.sqrt(dx * dx + dy * dy + gap * gap)
      if (dy <= 0) continue
      // Angle from the beam axis (straight down): 35° full, 52° edge.
      const cosAngle = dy / distance
      const t = clamp((cosAngle - Math.cos(0.91)) / (Math.cos(0.61) - Math.cos(0.91)))
      const cone = t * t * (3 - 2 * t)
      // Irradiance on the wall: cosine of incidence over distance squared.
      wash += power * cone * (gap / distance) / (distance * distance) * 0.3
    }
    return [base + wash, base * 0.88 + wash * 0.77, base * 0.7 + wash * 0.46]
  }
  function ceilingLight(x, z) {
    let value = 0.13
    for (const [x0, z0, x1, z1] of [[0.02, 2.94, 3.98, 5.76], [0.02, 5.9, 3.73, 8.98]]) {
      if (x < x0 || x > x1 || z < z0 || z > z1) continue
      const edge = Math.min(x - x0, x1 - x, z - z0, z1 - z)
      value += 1.25 * Math.exp(-edge / 0.23)
    }
    return [value, value * 0.79, value * 0.52]
  }
  function floorOcclusion(x, z) {
    let visibility = 1
    // Soft grounded silhouettes under the sofa, coffee table, bed, bench and
    // dining table augment the real cached lamp shadows, without screen blur.
    for (const [x0, z0, x1, z1, density, softness] of [
      [0.13, 3.22, 0.96, 5.28, 0.64, 0.14],
      [1.2, 3.68, 1.68, 4.82, 0.38, 0.13],
      [0.13, 6.34, 2.2, 8.06, 0.74, 0.14],
      [2.37, 6.67, 2.69, 7.73, 0.38, 0.09],
      [3.0, 3.58, 3.7, 4.82, 0.22, 0.2],
    ]) {
      const dx = Math.max(x0 - x, 0, x - x1)
      const dz = Math.max(z0 - z, 0, z - z1)
      visibility *= 1 - density * Math.exp(-(dx * dx + dz * dz) / (softness * softness))
    }
    const wall = Math.min(Math.abs(x), Math.abs(4 - x))
    return visibility * (1 - 0.2 * Math.exp(-wall / 0.06))
  }
  return { bake, wallLight, ceilingLight, floorOcclusion }
}
