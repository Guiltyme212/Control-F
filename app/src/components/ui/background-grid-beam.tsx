import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

const G = 32

/* ------------------------------------------------------------------ */
/*  Color palettes                                                     */
/* ------------------------------------------------------------------ */
const P = [
  ['#18CCFC', '#6344F5', '#AE48FF'],
  ['#6366f1', '#818cf8', '#a5b4fc'],
  ['#06b6d4', '#3b82f6', '#6366f1'],
  ['#8b5cf6', '#6366f1', '#18CCFC'],
  ['#18CCFC', '#10b981', '#6344F5'],
  ['#a5b4fc', '#6366f1', '#4f46e5'],
] as const

/* ------------------------------------------------------------------ */
/*  Grid-aligned paths  [d-string, widthCells, heightCells]            */
/* ------------------------------------------------------------------ */
const PATHS: [string, number, number][] = [
  /* 0  */ [`M0 0h${3*G}v${2*G}h${3*G}`, 6, 2],
  /* 1  */ [`M0 0v${2*G}h${4*G}v${2*G}`, 4, 4],
  /* 2  */ [`M0 0h${5*G}v${3*G}`, 5, 3],
  /* 3  */ [`M0 0h${2*G}v${G}h${2*G}v${G}h${2*G}v${G}`, 6, 3],
  /* 4  */ [`M0 0h${4*G}M${2*G} 0v${2*G}`, 4, 2],
  /* 5  */ [`M0 0v${2*G}h${3*G}`, 3, 2],
  /* 6  */ [`M0 0h${6*G}`, 6, 0],
  /* 7  */ [`M0 0v${3*G}h${2*G}v${3*G}`, 2, 6],
  /* 8  */ [`M0 0h${2*G}v${2*G}h${2*G}`, 4, 2],
  /* 9  */ [`M0 ${G}h${4*G}M${2*G} 0v${2*G}`, 4, 2],
  /* 10 */ [`M0 0v${5*G}`, 0, 5],
  /* 11 */ [`M0 0v${2*G}h${G}v${2*G}h${G}`, 2, 4],
  /* 12 */ [`M0 0h${3*G}v${5*G}`, 3, 5],
  /* 13 */ [`M0 0h${G}v${G}h${G}v${G}h${G}v${G}h${G}v${G}`, 4, 4],
  /* 14 */ [`M0 0h${4*G}v${G}h${4*G}`, 8, 1],
  /* 15 */ [`M${2*G} 0v${3*G}h${2*G}M${2*G} ${3*G}h${-2*G}`, 4, 3],
  /* 16 */ [`M0 0h${3*G}v${G}h${3*G}v${G}h${3*G}`, 9, 2],
  /* 17 */ [`M0 0v${4*G}h${3*G}`, 3, 4],
  /* 18 */ [`M0 0h${2*G}v${3*G}h${2*G}v${3*G}`, 4, 6],
  /* 19 */ [`M0 0h${7*G}`, 7, 0],
  /* 20 */ [`M0 0v${7*G}`, 0, 7],
]

/* ------------------------------------------------------------------ */
/*  Beam definition                                                    */
/* ------------------------------------------------------------------ */
interface BeamDef {
  p: number   // pathIdx
  c: number   // paletteIdx
  x: number   // col offset from center
  y: number   // row offset from center
  d: number   // duration
  w: number   // repeat delay (wait between loops)
  o: number   // target opacity
  fh?: boolean
  fv?: boolean
}

/* Mirror a beam set into all 4 quadrants with staggered repeat delays */
function radiate(defs: Omit<BeamDef, 'fh' | 'fv'>[]): BeamDef[] {
  const out: BeamDef[] = []
  for (const b of defs) {
    out.push({ ...b })
    out.push({ ...b, x: -b.x, fh: true, w: b.w + 0.15 })
    out.push({ ...b, y: -b.y, fv: true, w: b.w + 0.3 })
    out.push({ ...b, x: -b.x, y: -b.y, fh: true, fv: true, w: b.w + 0.45 })
  }
  return out
}

/* ------------------------------------------------------------------ */
/*  Single animated beam — fades in based on distance from center,     */
/*  then loops steadily                                                */
/* ------------------------------------------------------------------ */
const BeamSignal = React.memo<{ def: BeamDef; id: number; entrance: number }>(({ def, id, entrance }) => {
  const [pathD, cellsW, cellsH] = PATHS[def.p]
  const palette = P[def.c]
  const gid = `g${id}`
  const fid = `f${id}`
  const w = Math.max(cellsW * G, 2)
  const h = Math.max(cellsH * G, 2)
  const pad = 8

  return (
    <motion.svg
      width={w + pad * 2}
      height={h + pad * 2}
      viewBox={`${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`}
      fill="none"
      className="absolute pointer-events-none"
      style={{
        left: def.x * G - pad,
        top: def.y * G - pad,
        transform: `scale(${def.fh ? -1 : 1}, ${def.fv ? -1 : 1})`,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: def.o }}
      transition={{ duration: 1.2, delay: entrance, ease: 'easeOut' }}
    >
      <defs>
        <motion.linearGradient
          id={gid}
          variants={{
            initial: { x1: '40%', x2: '50%', y1: '160%', y2: '180%' },
            animate: { x1: '0%', x2: '10%', y1: '-40%', y2: '-20%' },
          }}
          animate="animate"
          initial="initial"
          transition={{
            duration: def.d,
            repeat: Infinity,
            repeatType: 'loop',
            ease: 'linear',
            delay: entrance,
            repeatDelay: def.w,
          }}
        >
          <stop stopColor={palette[0]} stopOpacity="0" />
          <stop stopColor={palette[0]} />
          <stop offset="0.325" stopColor={palette[1]} />
          <stop offset="1" stopColor={palette[2]} stopOpacity="0" />
        </motion.linearGradient>
        <filter id={fid}>
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path d={pathD} stroke={`url(#${gid})`} strokeWidth={2} filter={`url(#${fid})`} />
    </motion.svg>
  )
})
BeamSignal.displayName = 'BeamSignal'

/* ------------------------------------------------------------------ */
/*  Glowing intersection nodes                                         */
/* ------------------------------------------------------------------ */
interface NodeDef {
  x: number
  y: number
  color: string
  size: number
  delay: number
  pulseSpeed: number
  entrance: number
}

const GlowNode = React.memo<{ def: NodeDef }>(({ def }) => (
  <motion.div
    className="absolute rounded-full pointer-events-none"
    style={{
      left: def.x * G - def.size / 2,
      top: def.y * G - def.size / 2,
      width: def.size,
      height: def.size,
      background: `radial-gradient(circle, ${def.color} 0%, transparent 70%)`,
    }}
    initial={{ opacity: 0, scale: 0 }}
    animate={{ opacity: [0, 0.15, 0.6, 0.15], scale: [0, 0.8, 1.2, 0.8] }}
    transition={{
      duration: def.pulseSpeed,
      repeat: Infinity,
      ease: 'easeInOut',
      delay: def.entrance,
    }}
  />
))
GlowNode.displayName = 'GlowNode'

/* ------------------------------------------------------------------ */
/*  Entrance timing — distance-based stagger from center               */
/*  Inner beams appear first (~0.3s), outer beams last (~3s)           */
/* ------------------------------------------------------------------ */
function entranceDelay(x: number, y: number): number {
  const dist = Math.sqrt(x * x + y * y)
  // Map distance 0–20 → delay 0.3–3.0s with easeOut curve
  const t = Math.min(dist / 20, 1)
  return 0.3 + t * t * 2.7
}

/* ------------------------------------------------------------------ */
/*  GridBeam                                                           */
/* ------------------------------------------------------------------ */
export const GridBeam: React.FC<{ children?: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => {
  const beams = useMemo<BeamDef[]>(() => {
    const radiated = radiate([
      // Ring 0 — touching center
      { p: 5,  c: 0, x: 0,  y: 0,  d: 1.5, w: 2.5, o: 0.9 },
      { p: 8,  c: 1, x: 1,  y: 0,  d: 1.7, w: 2.8, o: 0.85 },
      { p: 0,  c: 2, x: 0,  y: 1,  d: 1.6, w: 3.0, o: 0.85 },

      // Ring 1
      { p: 3,  c: 3, x: 3,  y: 1,  d: 2.0, w: 2.6, o: 0.8 },
      { p: 12, c: 4, x: 1,  y: 2,  d: 2.2, w: 3.2, o: 0.8 },
      { p: 13, c: 5, x: 4,  y: 0,  d: 1.8, w: 2.4, o: 0.75 },
      { p: 9,  c: 0, x: 2,  y: 2,  d: 1.9, w: 3.0, o: 0.75 },

      // Ring 2
      { p: 14, c: 1, x: 6,  y: 1,  d: 1.8, w: 2.8, o: 0.7 },
      { p: 7,  c: 2, x: 2,  y: 4,  d: 2.4, w: 2.2, o: 0.7 },
      { p: 1,  c: 3, x: 7,  y: 2,  d: 2.1, w: 3.4, o: 0.65 },
      { p: 11, c: 4, x: 5,  y: 4,  d: 2.0, w: 2.6, o: 0.65 },
      { p: 4,  c: 5, x: 4,  y: 3,  d: 1.7, w: 3.0, o: 0.7 },
      { p: 18, c: 0, x: 8,  y: 0,  d: 2.3, w: 2.4, o: 0.6 },

      // Ring 3
      { p: 16, c: 1, x: 10, y: 2,  d: 2.0, w: 3.2, o: 0.6 },
      { p: 2,  c: 3, x: 9,  y: 4,  d: 1.8, w: 2.8, o: 0.55 },
      { p: 17, c: 5, x: 3,  y: 7,  d: 2.5, w: 2.6, o: 0.6 },
      { p: 15, c: 0, x: 11, y: 0,  d: 2.2, w: 3.4, o: 0.5 },
      { p: 20, c: 2, x: 8,  y: 5,  d: 2.3, w: 2.2, o: 0.55 },
      { p: 6,  c: 4, x: 6,  y: 7,  d: 1.5, w: 3.0, o: 0.55 },

      // Ring 4
      { p: 19, c: 1, x: 13, y: 3,  d: 1.6, w: 3.6, o: 0.45 },
      { p: 10, c: 3, x: 12, y: 6,  d: 2.0, w: 2.8, o: 0.45 },
      { p: 0,  c: 5, x: 14, y: 1,  d: 1.9, w: 3.2, o: 0.4 },
      { p: 3,  c: 2, x: 10, y: 7,  d: 2.2, w: 2.4, o: 0.45 },
      { p: 8,  c: 4, x: 5,  y: 10, d: 2.1, w: 3.0, o: 0.5 },
      { p: 13, c: 0, x: 15, y: 5,  d: 2.4, w: 2.6, o: 0.4 },
      { p: 11, c: 1, x: 9,  y: 9,  d: 1.8, w: 3.4, o: 0.45 },

      // Ring 5
      { p: 14, c: 3, x: 16, y: 2,  d: 2.0, w: 3.8, o: 0.35 },
      { p: 7,  c: 5, x: 7,  y: 11, d: 2.6, w: 2.4, o: 0.4 },
      { p: 16, c: 0, x: 17, y: 7,  d: 2.2, w: 3.0, o: 0.35 },
      { p: 18, c: 2, x: 12, y: 9,  d: 2.3, w: 2.8, o: 0.4 },
      { p: 2,  c: 4, x: 3,  y: 13, d: 1.7, w: 3.2, o: 0.4 },
      { p: 20, c: 1, x: 14, y: 8,  d: 2.1, w: 3.6, o: 0.35 },
    ])

    const axial: BeamDef[] = [
      { p: 19, c: 0, x: 1,  y: 0,  d: 1.4, w: 3.0, o: 0.75 },
      { p: 6,  c: 2, x: 8,  y: 0,  d: 1.6, w: 2.6, o: 0.55 },
      { p: 19, c: 4, x: 15, y: 0,  d: 1.8, w: 3.2, o: 0.4 },
      { p: 19, c: 1, x: -1, y: 0,  d: 1.5, w: 2.8, o: 0.75, fh: true },
      { p: 6,  c: 3, x: -8, y: 0,  d: 1.7, w: 3.0, o: 0.55, fh: true },
      { p: 19, c: 5, x: -15,y: 0,  d: 1.9, w: 3.4, o: 0.4,  fh: true },
      { p: 20, c: 0, x: 0,  y: 1,  d: 2.0, w: 2.6, o: 0.75 },
      { p: 10, c: 2, x: 0,  y: 5,  d: 2.2, w: 3.0, o: 0.6 },
      { p: 20, c: 4, x: 0,  y: 8,  d: 2.4, w: 2.4, o: 0.5 },
      { p: 10, c: 1, x: 0,  y: 13, d: 2.0, w: 3.2, o: 0.4 },
      { p: 20, c: 3, x: 0,  y: -1, d: 2.0, w: 2.8, o: 0.75, fv: true },
      { p: 10, c: 5, x: 0,  y: -5, d: 2.1, w: 3.0, o: 0.6,  fv: true },
      { p: 20, c: 0, x: 0,  y: -8, d: 2.3, w: 2.6, o: 0.5,  fv: true },
      { p: 10, c: 2, x: 0,  y: -13,d: 2.0, w: 3.4, o: 0.4,  fv: true },
    ]

    return [...radiated, ...axial]
  }, [])

  const nodes = useMemo<NodeDef[]>(() => {
    const positions = [
      // Inner
      { x: 3, y: 2 }, { x: -3, y: 2 }, { x: 3, y: -2 }, { x: -3, y: -2 },
      { x: 0, y: 3 }, { x: 0, y: -3 }, { x: 4, y: 0 }, { x: -4, y: 0 },
      { x: 2, y: 3 }, { x: -2, y: 3 }, { x: 2, y: -3 }, { x: -2, y: -3 },
      // Mid
      { x: 6, y: 3 }, { x: -6, y: 3 }, { x: 6, y: -3 }, { x: -6, y: -3 },
      { x: 4, y: 5 }, { x: -4, y: 5 }, { x: 4, y: -5 }, { x: -4, y: -5 },
      { x: 8, y: 1 }, { x: -8, y: 1 }, { x: 8, y: -1 }, { x: -8, y: -1 },
      { x: 0, y: 6 }, { x: 0, y: -6 }, { x: 7, y: 4 }, { x: -7, y: 4 },
      { x: 7, y: -4 }, { x: -7, y: -4 }, { x: 5, y: 6 }, { x: -5, y: 6 },
      { x: 5, y: -6 }, { x: -5, y: -6 },
      // Outer
      { x: 10, y: 2 }, { x: -10, y: 2 }, { x: 10, y: -2 }, { x: -10, y: -2 },
      { x: 3, y: 9 }, { x: -3, y: 9 }, { x: 3, y: -9 }, { x: -3, y: -9 },
      { x: 8, y: 6 }, { x: -8, y: 6 }, { x: 8, y: -6 }, { x: -8, y: -6 },
      { x: 12, y: 4 }, { x: -12, y: 4 }, { x: 12, y: -4 }, { x: -12, y: -4 },
      { x: 6, y: 8 }, { x: -6, y: 8 }, { x: 6, y: -8 }, { x: -6, y: -8 },
      { x: 0, y: 10 }, { x: 0, y: -10 }, { x: 13, y: 0 }, { x: -13, y: 0 },
      // Far
      { x: 11, y: 8 }, { x: -11, y: 8 }, { x: 11, y: -8 }, { x: -11, y: -8 },
      { x: 15, y: 3 }, { x: -15, y: 3 }, { x: 15, y: -3 }, { x: -15, y: -3 },
      { x: 4, y: 12 }, { x: -4, y: 12 }, { x: 4, y: -12 }, { x: -4, y: -12 },
      { x: 9, y: 10 }, { x: -9, y: 10 }, { x: 9, y: -10 }, { x: -9, y: -10 },
      { x: 14, y: 6 }, { x: -14, y: 6 }, { x: 14, y: -6 }, { x: -14, y: -6 },
      { x: 0, y: 14 }, { x: 0, y: -14 }, { x: 17, y: 0 }, { x: -17, y: 0 },
    ]
    const colors = ['#6366f1', '#818cf8', '#18CCFC', '#8b5cf6', '#06b6d4', '#a5b4fc']

    return positions.map((pos, i) => {
      const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y)
      return {
        x: pos.x,
        y: pos.y,
        color: colors[i % colors.length],
        size: dist < 5 ? 10 : dist < 9 ? 8 : 6,
        delay: (i * 0.37) % 5,
        pulseSpeed: 2.5 + (i % 4) * 0.5,
        entrance: entranceDelay(pos.x, pos.y),
      }
    })
  }, [])

  return (
    <div className={cn('relative w-full h-full bg-grid overflow-hidden', className)}>
      {/* Radial glow from center */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 600,
          height: 600,
          background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, rgba(99,102,241,0.03) 40%, transparent 70%)',
        }}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
      />
      {/* Center origin for all beams + nodes */}
      <div className="absolute" style={{ left: '50%', top: '50%' }}>
        {nodes.map((node, i) => (
          <GlowNode key={`n${i}`} def={node} />
        ))}
        {beams.map((beam, i) => (
          <BeamSignal
            key={`b${i}`}
            def={beam}
            id={i}
            entrance={entranceDelay(beam.x, beam.y)}
          />
        ))}
      </div>
      {children}
    </div>
  )
}
