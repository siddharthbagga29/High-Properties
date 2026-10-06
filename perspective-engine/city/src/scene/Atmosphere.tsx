import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { live, PALETTE } from './shared'

/** Deep indigo ground, radial vignette, cyan and violet corner flames in a warped noise field. */
export function Background() {
  const size = useThree(s => s.size)
  const { geometry, material } = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
    const m = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uAspect: { value: 1 }, cBase: { value: PALETTE.ground }, cCyan: { value: PALETTE.active }, cViolet: { value: PALETTE.violet } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uAspect; uniform vec3 cBase, cCyan, cViolet; varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
        float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
        void main(){
          vec2 uv = vUv; vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
          vec2 w = vec2(fbm(uv * 3.0 + uTime * 0.03), fbm(uv * 3.0 - uTime * 0.025 + 7.1));
          float f = fbm(uv * 2.2 + w * 1.7 + uTime * 0.02);
          float cyan = smoothstep(1.05, 0.0, length((uv - vec2(0.0, 0.0)) * vec2(uAspect * 0.8, 1.0)));
          float violet = smoothstep(1.05, 0.0, length((uv - vec2(1.0, 1.0)) * vec2(uAspect * 0.8, 1.0)));
          vec3 col = cBase;
          col += cCyan * 0.2 * cyan * f * 1.7;
          col += cViolet * 0.2 * violet * (1.2 - f) * 1.6;
          col *= 1.0 - 0.6 * smoothstep(0.3, 1.05, length(p) * 1.15);
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
    return { geometry: g, material: m }
  }, [])
  useFrame(() => {
    material.uniforms.uTime.value = live.time
    material.uniforms.uAspect.value = size.width / Math.max(size.height, 1)
  })
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={-10} raycast={() => null} />
}

/** About 300 slow cyan motes drifting past the camera, wrapped around it so depth never runs out. */
export function Motes({ count = 300 }: { count?: number }) {
  const pr = useThree(s => s.viewport.dpr)
  const { geometry, material } = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const a = new Float32Array(count * 3)
    for (let i = 0; i < a.length; i++) a[i] = Math.random()
    g.setAttribute('position', new THREE.BufferAttribute(a, 3))
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uPR: { value: 1 }, cMote: { value: PALETTE.mote } },
      vertexShader: /* glsl */ `
        uniform float uTime, uPR; uniform vec3 uCam; varying float vA;
        void main(){
          vec3 box = vec3(70.0, 40.0, 70.0);
          vec3 p = position * box + vec3(uTime * 0.35, uTime * 0.12, uTime * 0.22) * (0.5 + position.x);
          p = mod(p - uCam + box * 0.5, box) - box * 0.5 + uCam;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = -mv.z;
          vA = smoothstep(1.5, 6.0, d) * (1.0 - smoothstep(22.0, 34.0, d));
          gl_PointSize = clamp((1.5 + position.y * 2.5) * uPR * (24.0 / d), 0.0, 9.0 * uPR);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 cMote; varying float vA;
        void main(){ float s = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(cMote, s * s * vA * 0.55); }`,
    })
    return { geometry: g, material: m }
  }, [count])
  useFrame(({ camera }) => {
    material.uniforms.uTime.value = live.time * live.motion
    material.uniforms.uCam.value.copy(camera.position)
    material.uniforms.uPR.value = pr
  })
  return <points geometry={geometry} material={material} frustumCulled={false} raycast={() => null} />
}
