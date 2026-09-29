import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Group, Vector3 } from 'three'
import { STICKERS, type Vec3 } from '../cube/geometry.ts'
import { isInLayer, moveAxis } from '../cube/moves.ts'
import type { CubeState, Face } from '../cube/state.ts'
import { FACE_COLORS } from './colors.ts'
import type { Turn } from './useTurnQueue.ts'

interface Props {
  state: CubeState
  turn: Turn | null
  /** Quarter turns per second; half turns take 1.5x as long. */
  speed: number
  onTurnDone: () => void
}

const CUBIES: Vec3[] = []
for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
  if (x || y || z) CUBIES.push([x, y, z])
}

/** Rotation that turns a plane (facing +z) to face `normal`. */
const facing = ([x, y, z]: Vec3): [number, number, number] =>
  x ? [0, (x * Math.PI) / 2, 0] : y ? [(-y * Math.PI) / 2, 0, 0] : [0, z > 0 ? 0 : Math.PI, 0]

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

const Cubie = ({ pos }: { pos: Vec3 }) => (
  <RoundedBox args={[0.96, 0.96, 0.96]} radius={0.07} smoothness={3} position={pos}>
    <meshStandardMaterial color="#151515" roughness={0.6} />
  </RoundedBox>
)

const Sticker = ({ index, color }: { index: number; color: string }) => {
  const { pos, normal } = STICKERS[index]
  const at: Vec3 = [pos[0] + normal[0] * 0.485, pos[1] + normal[1] * 0.485, pos[2] + normal[2] * 0.485]
  return (
    <mesh position={at} rotation={facing(normal)}>
      <planeGeometry args={[0.84, 0.84]} />
      <meshStandardMaterial color={color} roughness={0.35} />
    </mesh>
  )
}

/**
 * Draws the cube from a sticker string. While `turn` is set, the cubies in
 * the turning layer sit in their own group, which is rotated a little each
 * frame. When the turn finishes, the parent commits the move to `state`;
 * the new state at rest looks exactly like the old one fully rotated, so
 * swapping them is invisible.
 */
export const Cube3D = ({ state, turn, speed, onTurnDone }: Props) => {
  const turning = useRef<Group>(null)
  const progress = useRef(0)
  const done = useRef(false)

  // Reset before paint so the new layer never shows the old angle.
  useLayoutEffect(() => {
    progress.current = 0
    done.current = false
    turning.current?.quaternion.identity()
  }, [turn])

  const axis = useMemo(() => (turn ? new Vector3(...moveAxis(turn.move.base)) : null), [turn])

  useFrame((_, delta) => {
    if (!turn || !axis || !turning.current || done.current) return
    const { amount } = turn.move
    const duration = (amount === 2 ? 1.5 : 1) / speed
    progress.current = Math.min(1, progress.current + delta / duration)
    const quarterTurns = amount === 3 ? -1 : amount
    turning.current.quaternion.setFromAxisAngle(axis, (-Math.PI / 2) * quarterTurns * easeInOut(progress.current))
    if (progress.current >= 1) {
      done.current = true
      onTurnDone()
    }
  })

  const moving = (pos: Vec3) => turn !== null && isInLayer(turn.move.base, pos)
  const stickers = STICKERS.map((s, i) => ({ i, pos: s.pos, color: FACE_COLORS[state[i] as Face] ?? '#666' }))

  return (
    <group>
      <group>
        {CUBIES.filter((p) => !moving(p)).map((p) => <Cubie key={p.join()} pos={p} />)}
        {stickers.filter((s) => !moving(s.pos)).map((s) => <Sticker key={s.i} index={s.i} color={s.color} />)}
      </group>
      <group ref={turning}>
        {CUBIES.filter(moving).map((p) => <Cubie key={p.join()} pos={p} />)}
        {stickers.filter((s) => moving(s.pos)).map((s) => <Sticker key={s.i} index={s.i} color={s.color} />)}
      </group>
    </group>
  )
}
