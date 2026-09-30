import { RoundedBox } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Group, Vector3 } from 'three'
import { STICKERS, type Vec3 } from '../cube/geometry.ts'
import { BASE_MOVES, isInLayer, moveAxis, type BaseMove, type Move } from '../cube/moves.ts'
import type { CubeState, Face } from '../cube/state.ts'
import { FACE_COLORS, UNPAINTED_COLOR } from './colors.ts'
import type { Turn } from './useTurnQueue.ts'

interface Props {
  state: CubeState
  turn: Turn | null
  /** Quarter turns per second; half turns take 1.5x as long. */
  speed: number
  onTurnDone: () => void
  /** When set, clicking a sticker calls this (used by the colour editor). */
  onStickerClick?: (index: number) => void
  /** Allow idle animations (off while editing, so the cube holds still for painting). */
  idleEnabled?: boolean
}

/** Seconds without a turn or pointer interaction before the cube starts idling. */
export const IDLE_AFTER = 5

const CUBIES: Vec3[] = []
for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
  if (x || y || z) CUBIES.push([x, y, z])
}

/** Rotation that turns a plane (facing +z) to face `normal`. */
const facing = ([x, y, z]: Vec3): [number, number, number] =>
  x ? [0, (x * Math.PI) / 2, 0] : y ? [(-y * Math.PI) / 2, 0, 0] : [0, z > 0 ? 0 : Math.PI, 0]

/** Rotation axis of every move, created once. */
const AXES = Object.fromEntries(BASE_MOVES.map((b) => [b, new Vector3(...moveAxis(b))])) as Record<BaseMove, Vector3>

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

// ---------------------------------------------------------------------------
// Idle animations: purely visual, every one ends exactly where it started
// ---------------------------------------------------------------------------

interface LayerFidget {
  move: Move
  id: number
}

/** Seconds for one full layer spin. */
const SPIN_DURATION = 1.5
/** Pause between spins while idling: random between these (seconds). */
const SPIN_GAP = [1, 1.2] as const
const nextGap = () => SPIN_GAP[0] + Math.random() * (SPIN_GAP[1] - SPIN_GAP[0])
const LAYERS = ['U', 'D', 'R', 'L', 'F', 'B', 'M', 'E', 'S'] as const

/** A random layer to spin, never the same one twice in a row. */
const randomFidget = (id: number, previous: Move['base'] | null): LayerFidget => {
  const choices = LAYERS.filter((l) => l !== previous)
  return {
    move: { base: choices[Math.floor(Math.random() * choices.length)], amount: Math.random() < 0.5 ? 1 : 3 },
    id,
  }
}

/** Layer angle over time: one full turn, eased at both ends. */
const fidgetAngle = ({ move }: LayerFidget, p: number) => (move.amount === 3 ? 1 : -1) * 2 * Math.PI * easeInOut(p)

/** Wraps an angle into (-pi, pi] so easing back takes the short way round. */
const wrap = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI))

const now = () => performance.now() / 1000

/** People who asked their OS for less motion get a still cube (checked once on load). */
const REDUCED_MOTION = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// ---------------------------------------------------------------------------

const Cubie = ({ pos }: { pos: Vec3 }) => (
  <RoundedBox args={[0.96, 0.96, 0.96]} radius={0.07} smoothness={3} position={pos}>
    <meshStandardMaterial color="#151515" roughness={0.6} />
  </RoundedBox>
)

interface StickerProps {
  index: number
  color: string
  onClick?: (index: number) => void
}

const Sticker = ({ index, color, onClick }: StickerProps) => {
  const { pos, normal } = STICKERS[index]
  const at: Vec3 = [pos[0] + normal[0] * 0.485, pos[1] + normal[1] * 0.485, pos[2] + normal[2] * 0.485]
  return (
    <mesh
      position={at}
      rotation={facing(normal)}
      onClick={
        onClick &&
        ((e) => {
          if (e.delta > 4) return // it was a drag to orbit, not a click
          e.stopPropagation()
          onClick(index)
        })
      }
    >
      <planeGeometry args={[0.84, 0.84]} />
      <meshStandardMaterial color={color} roughness={0.35} />
    </mesh>
  )
}

/**
 * Draws the cube from a sticker string. While a layer moves (a real turn or
 * an idle fidget), its cubies sit in their own group, rotated a little each
 * frame. After a real turn the parent commits the move to `state`; the new
 * state at rest looks exactly like the old one fully rotated, so the swap is
 * invisible. Fidgets end at their start angle and never touch `state`.
 */
export const Cube3D = ({ state, turn, speed, onTurnDone, onStickerClick, idleEnabled: idleAllowed = true }: Props) => {
  const idleEnabled = idleAllowed && !REDUCED_MOTION
  const whole = useRef<Group>(null)
  const turning = useRef<Group>(null)
  const progress = useRef(0)
  const done = useRef(false)
  const [fidget, setFidget] = useState<LayerFidget | null>(null)
  const nextFidgetId = useRef(0)
  const lastActive = useRef(-Infinity)
  const nextIdleEventAt = useRef(0.4)
  const lastLayer = useRef<Move['base'] | null>(null)
  const { gl } = useThree()

  // Dragging or zooming the view counts as activity.
  useEffect(() => {
    const el = gl.domElement
    const poke = () => {
      lastActive.current = now()
    }
    el.addEventListener('pointerdown', poke)
    el.addEventListener('wheel', poke, { passive: true })
    return () => {
      el.removeEventListener('pointerdown', poke)
      el.removeEventListener('wheel', poke)
    }
  }, [gl])

  // A real turn always wins over an idle fidget.
  const active = turn ? { move: turn.move, key: `t${turn.id}` } : fidget ? { move: fidget.move, key: `f${fidget.id}` } : null
  const activeKey = active?.key ?? null
  const activeBase = active?.move.base ?? null

  // Reset before paint so a new layer never shows the old angle.
  useLayoutEffect(() => {
    progress.current = 0
    done.current = false
    turning.current?.quaternion.identity()
  }, [activeKey])

  const axis = activeBase ? AXES[activeBase] : null

  useFrame((_, delta) => {
    const t = now()
    if (turn || !idleEnabled) lastActive.current = t
    const idle = idleEnabled && !turn && t - lastActive.current > IDLE_AFTER
    if (!idle) nextIdleEventAt.current = t + 0.4

    // Real turn
    if (turn && axis && turning.current && !done.current) {
      if (fidget) setFidget(null)
      const { amount } = turn.move
      const duration = (amount === 2 ? 1.5 : 1) / (turn.speed ?? speed)
      progress.current = Math.min(1, progress.current + delta / duration)
      const quarterTurns = amount === 3 ? -1 : amount
      turning.current.quaternion.setFromAxisAngle(axis, (-Math.PI / 2) * quarterTurns * easeInOut(progress.current))
      if (progress.current >= 1) {
        done.current = true
        onTurnDone()
      }
    } else if (!turn && fidget && axis && turning.current) {
      // Idle layer fidget
      progress.current = Math.min(1, progress.current + delta / SPIN_DURATION)
      turning.current.quaternion.setFromAxisAngle(axis, fidgetAngle(fidget, progress.current))
      if (progress.current >= 1) {
        turning.current.quaternion.identity()
        setFidget(null)
        nextIdleEventAt.current = t + nextGap()
      }
    } else if (idle && !fidget && t >= nextIdleEventAt.current) {
      // Next idle spin
      const next = randomFidget(nextFidgetId.current++, lastLayer.current)
      lastLayer.current = next.move.base
      setFidget(next)
      nextIdleEventAt.current = Infinity
    }

    // Whole-cube motion: slow turntable spin and bob while idle, eased back to rest otherwise
    const g = whole.current
    if (!g) return
    if (idle) {
      g.rotation.y += delta * 0.3
      g.position.y = Math.sin(t * 1.3) * 0.06
      g.rotation.x = Math.sin(t * 0.7) * 0.05
    } else {
      const k = Math.exp(-delta * 7)
      g.rotation.y = wrap(g.rotation.y) * k
      g.rotation.x *= k
      g.position.y *= k
    }
  })

  const moving = (pos: Vec3) => active !== null && isInLayer(active.move.base, pos)
  const stickers = STICKERS.map((s, i) => ({ i, pos: s.pos, color: FACE_COLORS[state[i] as Face] ?? UNPAINTED_COLOR }))

  return (
    <group ref={whole}>
      <group>
        {CUBIES.filter((p) => !moving(p)).map((p) => <Cubie key={p.join()} pos={p} />)}
        {stickers.filter((s) => !moving(s.pos)).map((s) => <Sticker key={s.i} index={s.i} color={s.color} onClick={onStickerClick} />)}
      </group>
      <group ref={turning}>
        {CUBIES.filter(moving).map((p) => <Cubie key={p.join()} pos={p} />)}
        {stickers.filter((s) => moving(s.pos)).map((s) => <Sticker key={s.i} index={s.i} color={s.color} />)}
      </group>
    </group>
  )
}
