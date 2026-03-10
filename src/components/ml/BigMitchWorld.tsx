import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  PointerLockControls,
  Text,
  Html,
  Stars,
  Float,
  MeshDistortMaterial,
  Sparkles,
  Trail,
  useKeyboardControls,
  KeyboardControls,
} from "@react-three/drei";
import * as THREE from "three";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import {
  Brain,
  Zap,
  CheckCircle,
  XCircle,
  Radio,
  Scale,
  Building2,
  X,
  Eye,
  Mouse,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface MLSignal {
  id: number;
  timestamp: string;
  ticker: string;
  action: string;
  level: string;
  session: string;
  price: number;
  rsi: number;
  rsi_roc: number;
  macd: number;
  macd_hist: number;
  plus_di: number;
  minus_di: number;
  atr_pct: number;
  confidence: number;
  approved: boolean;
  reason: string;
  outcome: string | null;
  pnl: number | null;
  accounts_sent: string[];
}

// Keyboard control mapping
enum Controls {
  forward = "forward",
  backward = "backward",
  left = "left",
  right = "right",
}

const keyMap = [
  { name: Controls.forward, keys: ["KeyW", "ArrowUp"] },
  { name: Controls.backward, keys: ["KeyS", "ArrowDown"] },
  { name: Controls.left, keys: ["KeyA", "ArrowLeft"] },
  { name: Controls.right, keys: ["KeyD", "ArrowRight"] },
];

// ═══════════════════════════════════════════════════════════════════════════
// FIRST PERSON CONTROLS
// ═══════════════════════════════════════════════════════════════════════════

function FirstPersonController({ speed = 8 }: { speed?: number }) {
  const { camera } = useThree();
  const [, getKeys] = useKeyboardControls<Controls>();
  const velocity = useRef(new THREE.Vector3());
  const direction = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    const { forward, backward, left, right } = getKeys();

    // Calculate movement direction
    direction.current.set(0, 0, 0);

    if (forward) direction.current.z -= 1;
    if (backward) direction.current.z += 1;
    if (left) direction.current.x -= 1;
    if (right) direction.current.x += 1;

    direction.current.normalize();

    // Apply movement relative to camera rotation
    if (direction.current.length() > 0) {
      const moveSpeed = speed * delta;

      // Get camera's forward and right vectors (ignoring Y for ground movement)
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();

      const right = new THREE.Vector3();
      right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

      // Calculate movement
      velocity.current.set(0, 0, 0);
      velocity.current.addScaledVector(forward, -direction.current.z * moveSpeed);
      velocity.current.addScaledVector(right, direction.current.x * moveSpeed);

      camera.position.add(velocity.current);
    }

    // Keep camera at eye level
    camera.position.y = 2;

    // Boundary limits
    camera.position.x = Math.max(-50, Math.min(50, camera.position.x));
    camera.position.z = Math.max(-50, Math.min(50, camera.position.z));
  });

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// GROUND & ENVIRONMENT
// ═══════════════════════════════════════════════════════════════════════════

function Ground() {
  const gridRef = useRef<THREE.GridHelper>(null);

  return (
    <>
      {/* Main floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#050508" metalness={0.8} roughness={0.4} />
      </mesh>

      {/* Grid */}
      <gridHelper
        ref={gridRef}
        args={[200, 100, "#1a1a2e", "#0a0a15"]}
        position={[0, 0.01, 0]}
      />

      {/* Ambient glow spots on ground */}
      {[
        { pos: [0, 0.02, 0], color: "#06b6d4", intensity: 2 },
        { pos: [-15, 0.02, 0], color: "#8b5cf6", intensity: 1 },
        { pos: [15, 0.02, 0], color: "#10b981", intensity: 1 },
      ].map((light, i) => (
        <pointLight
          key={i}
          position={light.pos as [number, number, number]}
          color={light.color}
          intensity={light.intensity}
          distance={20}
        />
      ))}
    </>
  );
}

function Environment() {
  return (
    <>
      {/* Ambient */}
      <ambientLight intensity={0.15} />

      {/* Main directional light */}
      <directionalLight position={[10, 20, 10]} intensity={0.3} color="#ffffff" />

      {/* Stars */}
      <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={0.5} />

      {/* Fog for depth */}
      <fog attach="fog" args={["#030308", 30, 100]} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE STAGE NODES
// ═══════════════════════════════════════════════════════════════════════════

interface StageNodeProps {
  position: [number, number, number];
  name: string;
  description: string;
  color: string;
  glowColor: string;
  isActive?: boolean;
  onClick?: () => void;
  onHover?: (hovered: boolean) => void;
}

function StageNode({ position, name, description, color, glowColor, isActive, onClick, onHover }: StageNodeProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const glowRef = useRef<THREE.PointLight>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.005;
      // Subtle hover effect
      const targetScale = hovered ? 1.1 : 1;
      meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
    }
    if (glowRef.current) {
      glowRef.current.intensity = isActive
        ? 3 + Math.sin(state.clock.elapsedTime * 4) * 1.5
        : hovered ? 2 : 1;
    }
  });

  return (
    <group position={position}>
      {/* Main structure */}
      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.3}>
        <mesh
          ref={meshRef}
          onClick={onClick}
          onPointerEnter={() => { setHovered(true); onHover?.(true); }}
          onPointerLeave={() => { setHovered(false); onHover?.(false); }}
        >
          <octahedronGeometry args={[1.5, 0]} />
          <meshStandardMaterial
            color={color}
            emissive={glowColor}
            emissiveIntensity={hovered ? 0.5 : 0.2}
            metalness={0.8}
            roughness={0.2}
          />
        </mesh>

        {/* Inner core */}
        <mesh scale={0.6}>
          <icosahedronGeometry args={[1, 1]} />
          <meshStandardMaterial
            color={glowColor}
            emissive={glowColor}
            emissiveIntensity={0.8}
            transparent
            opacity={0.6}
          />
        </mesh>
      </Float>

      {/* Glow light */}
      <pointLight ref={glowRef} color={glowColor} intensity={1} distance={10} />

      {/* Label */}
      <Html position={[0, 3, 0]} center distanceFactor={15}>
        <div className={cn(
          "px-3 py-1.5 rounded-lg text-center whitespace-nowrap transition-all",
          "bg-slate-900/90 border border-slate-700/50 backdrop-blur-sm",
          hovered && "scale-110 border-slate-500"
        )}>
          <div className="text-sm font-bold text-white">{name}</div>
          <div className="text-[10px] text-slate-400">{description}</div>
        </div>
      </Html>

      {/* Ground ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[2, 2.3, 32]} />
        <meshBasicMaterial color={glowColor} transparent opacity={0.3} />
      </mesh>

      {/* Sparkles */}
      <Sparkles count={20} scale={4} size={2} speed={0.4} color={glowColor} />
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BIG MITCH - THE BRAIN
// ═══════════════════════════════════════════════════════════════════════════

interface BigMitchProps {
  position: [number, number, number];
  isProcessing: boolean;
  confidence: number | null;
  decision: "approved" | "rejected" | null;
  onClick?: () => void;
  onHover?: (hovered: boolean) => void;
}

function BigMitch({ position, isProcessing, confidence, decision, onClick, onHover }: BigMitchProps) {
  const brainRef = useRef<THREE.Mesh>(null);
  const outerRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const color = useMemo(() => {
    if (isProcessing) return "#f59e0b";
    if (decision === "approved") return "#10b981";
    if (decision === "rejected") return "#ef4444";
    return "#06b6d4";
  }, [isProcessing, decision]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    if (brainRef.current) {
      brainRef.current.rotation.y += isProcessing ? 0.02 : 0.003;
      brainRef.current.rotation.x = Math.sin(t * 0.5) * 0.1;
    }

    if (outerRef.current) {
      outerRef.current.rotation.y -= 0.005;
      outerRef.current.rotation.z = Math.sin(t * 0.3) * 0.1;
      const scale = 1 + Math.sin(t * 2) * 0.05;
      outerRef.current.scale.set(scale, scale, scale);
    }
  });

  return (
    <group position={position}>
      {/* Outer shell */}
      <mesh
        ref={outerRef}
        onClick={onClick}
        onPointerEnter={() => { setHovered(true); onHover?.(true); }}
        onPointerLeave={() => { setHovered(false); onHover?.(false); }}
      >
        <icosahedronGeometry args={[4, 1]} />
        <meshStandardMaterial
          color="#1a1a2e"
          emissive={color}
          emissiveIntensity={0.1}
          wireframe
          transparent
          opacity={0.4}
        />
      </mesh>

      {/* Brain core */}
      <Float speed={1.5} rotationIntensity={0.3} floatIntensity={0.5}>
        <mesh ref={brainRef}>
          <icosahedronGeometry args={[2.5, 2]} />
          <MeshDistortMaterial
            color={color}
            emissive={color}
            emissiveIntensity={isProcessing ? 0.8 : 0.4}
            metalness={0.5}
            roughness={0.3}
            distort={isProcessing ? 0.4 : 0.2}
            speed={isProcessing ? 4 : 1}
          />
        </mesh>

        {/* Inner glow */}
        <mesh scale={1.5}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial color={color} transparent opacity={0.2} />
        </mesh>
      </Float>

      {/* Central light */}
      <pointLight color={color} intensity={isProcessing ? 5 : 2} distance={25} />

      {/* Orbiting particles */}
      <Sparkles count={100} scale={10} size={3} speed={isProcessing ? 2 : 0.5} color={color} />

      {/* Label */}
      <Html position={[0, 6, 0]} center distanceFactor={15}>
        <div className={cn(
          "px-4 py-2 rounded-xl text-center transition-all",
          "bg-slate-900/95 border-2 backdrop-blur-sm",
          isProcessing && "border-amber-500 animate-pulse",
          decision === "approved" && "border-emerald-500",
          decision === "rejected" && "border-red-500",
          !isProcessing && !decision && "border-cyan-500/50"
        )}>
          <div className="flex items-center gap-2 justify-center">
            <Brain className="w-5 h-5" style={{ color }} />
            <span className="text-lg font-bold text-white">BIG MITCH</span>
          </div>
          <div className="text-xs text-slate-400">ML Signal Filter</div>
          {confidence !== null && (
            <div className="text-xl font-mono font-bold mt-1" style={{ color }}>
              {(confidence * 100).toFixed(0)}%
            </div>
          )}
          {isProcessing && (
            <div className="text-xs text-amber-400 animate-pulse mt-1">PROCESSING...</div>
          )}
        </div>
      </Html>

      {/* Filter rings - 30 filters represented as orbiting rings */}
      {[...Array(6)].map((_, i) => (
        <mesh
          key={i}
          rotation={[Math.PI / 2, 0, (i * Math.PI) / 3]}
          position={[0, 0, 0]}
        >
          <torusGeometry args={[5 + i * 0.5, 0.02, 8, 64]} />
          <meshBasicMaterial color={color} transparent opacity={0.2 + i * 0.05} />
        </mesh>
      ))}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SIGNAL PARTICLE
// ═══════════════════════════════════════════════════════════════════════════

interface SignalParticle3DProps {
  signal: MLSignal;
  path: THREE.Vector3[];
  onComplete: () => void;
  onClick: () => void;
}

function SignalParticle3D({ signal, path, onComplete, onClick }: SignalParticle3DProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const progress = useRef(0);

  const color = signal.approved ? "#10b981" : "#ef4444";

  useFrame((_, delta) => {
    if (!meshRef.current || currentIndex >= path.length - 1) return;

    progress.current += delta * 0.8;

    if (progress.current >= 1) {
      progress.current = 0;
      if (currentIndex < path.length - 2) {
        setCurrentIndex(currentIndex + 1);
      } else {
        onComplete();
      }
    }

    const start = path[currentIndex];
    const end = path[currentIndex + 1];
    meshRef.current.position.lerpVectors(start, end, progress.current);
  });

  return (
    <Trail
      width={1}
      length={6}
      color={color}
      attenuation={(t) => t * t}
    >
      <mesh ref={meshRef} position={path[0]} onClick={onClick}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1}
        />
        <pointLight color={color} intensity={2} distance={5} />
      </mesh>
    </Trail>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CONNECTION BEAMS
// ═══════════════════════════════════════════════════════════════════════════

function ConnectionBeam({ start, end, color }: { start: THREE.Vector3; end: THREE.Vector3; color: string }) {
  const points = useMemo(() => [start, end], [start, end]);
  const lineRef = useRef<THREE.Line>(null);

  useFrame((state) => {
    if (lineRef.current) {
      const material = lineRef.current.material as THREE.LineBasicMaterial;
      material.opacity = 0.3 + Math.sin(state.clock.elapsedTime * 2) * 0.1;
    }
  });

  return (
    <line ref={lineRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={2}
          array={new Float32Array([...start.toArray(), ...end.toArray()])}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial color={color} transparent opacity={0.4} linewidth={2} />
    </line>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// INFO PANEL (HTML OVERLAY)
// ═══════════════════════════════════════════════════════════════════════════

function InfoPanel({
  signal,
  onClose
}: {
  signal: MLSignal | null;
  onClose: () => void;
}) {
  if (!signal) return null;

  return (
    <div className="fixed top-4 right-4 w-80 z-50 pointer-events-auto">
      <Card className="bg-slate-900/95 border-slate-700 backdrop-blur-sm">
        <div className="p-4">
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-3 h-3 rounded-full",
                signal.approved ? "bg-emerald-500" : "bg-red-500"
              )} />
              <span className="font-bold text-white">{signal.ticker}</span>
              <Badge variant={signal.action === "buy" ? "default" : "destructive"}>
                {signal.action.toUpperCase()}
              </Badge>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-800/50 rounded p-2">
              <div className="text-slate-500">Level</div>
              <div className="font-medium text-white">{signal.level}</div>
            </div>
            <div className="bg-slate-800/50 rounded p-2">
              <div className="text-slate-500">Session</div>
              <div className="font-medium text-white">{signal.session}</div>
            </div>
            <div className="bg-slate-800/50 rounded p-2">
              <div className="text-slate-500">Confidence</div>
              <div className={cn(
                "font-mono font-bold",
                signal.confidence >= 0.65 ? "text-emerald-400" :
                signal.confidence >= 0.5 ? "text-amber-400" : "text-red-400"
              )}>
                {(signal.confidence * 100).toFixed(1)}%
              </div>
            </div>
            <div className="bg-slate-800/50 rounded p-2">
              <div className="text-slate-500">RSI</div>
              <div className="font-mono text-white">{signal.rsi.toFixed(1)}</div>
            </div>
          </div>

          {signal.approved && signal.accounts_sent && (
            <div className="mt-3 p-2 bg-emerald-500/10 rounded border border-emerald-500/30">
              <div className="text-xs text-emerald-400 mb-1">Sent to:</div>
              <div className="flex flex-wrap gap-1">
                {signal.accounts_sent.map((acc, i) => (
                  <Badge key={i} variant="outline" className="text-[10px]">{acc}</Badge>
                ))}
              </div>
            </div>
          )}

          {!signal.approved && signal.reason && (
            <div className="mt-3 p-2 bg-red-500/10 rounded border border-red-500/30">
              <div className="text-xs text-red-400">Rejected: {signal.reason}</div>
            </div>
          )}

          {signal.outcome && (
            <div className={cn(
              "mt-3 p-2 rounded border",
              signal.outcome === "WIN" ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30"
            )}>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Outcome</span>
                <Badge variant={signal.outcome === "WIN" ? "default" : "destructive"}>
                  {signal.outcome}
                </Badge>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HUD OVERLAY
// ═══════════════════════════════════════════════════════════════════════════

function HUD({
  signals,
  isLocked
}: {
  signals: MLSignal[];
  isLocked: boolean;
}) {
  const approved = signals.filter(s => s.approved).length;
  const rejected = signals.filter(s => !s.approved).length;
  const wins = signals.filter(s => s.outcome === "WIN").length;
  const total = signals.filter(s => s.outcome).length;
  const winRate = total > 0 ? (wins / total) * 100 : 0;

  return (
    <>
      {/* Stats bar */}
      <div className="fixed top-4 left-4 z-50 pointer-events-none">
        <div className="flex gap-2">
          <div className="bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 backdrop-blur-sm">
            <div className="text-[10px] text-slate-500 uppercase">Signals</div>
            <div className="text-lg font-bold text-white">{signals.length}</div>
          </div>
          <div className="bg-slate-900/90 border border-emerald-500/30 rounded-lg px-3 py-2 backdrop-blur-sm">
            <div className="text-[10px] text-emerald-400 uppercase">Approved</div>
            <div className="text-lg font-bold text-emerald-400">{approved}</div>
          </div>
          <div className="bg-slate-900/90 border border-red-500/30 rounded-lg px-3 py-2 backdrop-blur-sm">
            <div className="text-[10px] text-red-400 uppercase">Rejected</div>
            <div className="text-lg font-bold text-red-400">{rejected}</div>
          </div>
          <div className="bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 backdrop-blur-sm">
            <div className="text-[10px] text-slate-500 uppercase">Win Rate</div>
            <div className={cn(
              "text-lg font-bold",
              winRate >= 55 ? "text-emerald-400" : "text-amber-400"
            )}>{winRate.toFixed(0)}%</div>
          </div>
        </div>
      </div>

      {/* Controls hint */}
      {!isLocked && (
        <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className="bg-slate-900/95 border border-cyan-500/50 rounded-xl p-8 text-center backdrop-blur-sm">
            <Mouse className="w-12 h-12 text-cyan-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Click to Enter Big Mitch's World</h3>
            <p className="text-slate-400 text-sm mb-4">WASD to move, Mouse to look around</p>
            <div className="flex gap-4 justify-center text-xs text-slate-500">
              <span className="px-2 py-1 bg-slate-800 rounded">W</span>
              <span className="px-2 py-1 bg-slate-800 rounded">A</span>
              <span className="px-2 py-1 bg-slate-800 rounded">S</span>
              <span className="px-2 py-1 bg-slate-800 rounded">D</span>
              <span className="text-slate-600">+</span>
              <span className="px-2 py-1 bg-slate-800 rounded">Mouse</span>
            </div>
          </div>
        </div>
      )}

      {/* ESC hint when locked */}
      {isLocked && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-2 backdrop-blur-sm">
            <span className="text-xs text-slate-400">Press <span className="text-cyan-400 font-mono">ESC</span> to unlock mouse</span>
          </div>
        </div>
      )}

      {/* Crosshair */}
      {isLocked && (
        <div className="fixed inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div className="w-1 h-1 rounded-full bg-cyan-400/80" />
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN 3D SCENE
// ═══════════════════════════════════════════════════════════════════════════

function Scene({
  signals,
  activeSignal,
  setActiveSignal,
  setSelectedSignal,
  setIsLocked
}: {
  signals: MLSignal[];
  activeSignal: MLSignal | null;
  setActiveSignal: (s: MLSignal | null) => void;
  setSelectedSignal: (s: MLSignal | null) => void;
  setIsLocked: (locked: boolean) => void;
}) {
  const controlsRef = useRef<any>(null);

  // Stage positions
  const stagePositions = {
    tradingView: new THREE.Vector3(-20, 2, 0),
    signalIn: new THREE.Vector3(-10, 2, 0),
    bigMitch: new THREE.Vector3(0, 3, 0),
    sizing: new THREE.Vector3(10, 2, 0),
    accounts: new THREE.Vector3(20, 2, 0),
  };

  // Signal path
  const signalPath = [
    stagePositions.tradingView,
    stagePositions.signalIn,
    stagePositions.bigMitch,
    stagePositions.sizing,
    stagePositions.accounts,
  ];

  useEffect(() => {
    const handleLock = () => setIsLocked(true);
    const handleUnlock = () => setIsLocked(false);

    if (controlsRef.current) {
      controlsRef.current.addEventListener("lock", handleLock);
      controlsRef.current.addEventListener("unlock", handleUnlock);
    }

    return () => {
      if (controlsRef.current) {
        controlsRef.current.removeEventListener("lock", handleLock);
        controlsRef.current.removeEventListener("unlock", handleUnlock);
      }
    };
  }, [setIsLocked]);

  return (
    <>
      {/* Controls */}
      <PointerLockControls ref={controlsRef} />
      <FirstPersonController speed={10} />

      {/* Environment */}
      <Environment />
      <Ground />

      {/* Connection beams */}
      <ConnectionBeam start={stagePositions.tradingView} end={stagePositions.signalIn} color="#8b5cf6" />
      <ConnectionBeam start={stagePositions.signalIn} end={stagePositions.bigMitch} color="#8b5cf6" />
      <ConnectionBeam start={stagePositions.bigMitch} end={stagePositions.sizing} color="#10b981" />
      <ConnectionBeam start={stagePositions.sizing} end={stagePositions.accounts} color="#10b981" />

      {/* Pipeline Stages */}
      <StageNode
        position={[-20, 2, 0]}
        name="TradingView"
        description="Pine Script Alerts"
        color="#1e1b4b"
        glowColor="#8b5cf6"
      />

      <StageNode
        position={[-10, 2, 0]}
        name="Signal Intake"
        description="Webhook Receiver"
        color="#172554"
        glowColor="#3b82f6"
      />

      {/* Big Mitch */}
      <BigMitch
        position={[0, 3, 0]}
        isProcessing={activeSignal !== null}
        confidence={activeSignal?.confidence ?? null}
        decision={activeSignal ? (activeSignal.approved ? "approved" : "rejected") : null}
        onClick={() => {
          if (signals.length > 0) {
            setSelectedSignal(signals[0]);
          }
        }}
      />

      <StageNode
        position={[10, 2, 0]}
        name="Position Sizing"
        description="Dynamic Scaling"
        color="#14532d"
        glowColor="#22c55e"
      />

      <StageNode
        position={[20, 2, 0]}
        name="Broker Accounts"
        description="Order Dispatch"
        color="#134e4a"
        glowColor="#14b8a6"
      />

      {/* Active signal particle */}
      {activeSignal && (
        <SignalParticle3D
          signal={activeSignal}
          path={signalPath}
          onComplete={() => setActiveSignal(null)}
          onClick={() => setSelectedSignal(activeSignal)}
        />
      )}

      {/* Decorative filter pillars around Big Mitch */}
      {[...Array(8)].map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const radius = 12;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        return (
          <group key={i} position={[x, 0, z]}>
            <mesh position={[0, 2, 0]}>
              <cylinderGeometry args={[0.1, 0.1, 4, 8]} />
              <meshStandardMaterial
                color="#06b6d4"
                emissive="#06b6d4"
                emissiveIntensity={0.3}
                transparent
                opacity={0.5}
              />
            </mesh>
            <pointLight position={[0, 4, 0]} color="#06b6d4" intensity={0.5} distance={8} />
          </group>
        );
      })}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function BigMitchWorld() {
  const [signals, setSignals] = useState<MLSignal[]>([]);
  const [activeSignal, setActiveSignal] = useState<MLSignal | null>(null);
  const [selectedSignal, setSelectedSignal] = useState<MLSignal | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  // Fetch signals
  const fetchSignals = useCallback(async () => {
    if (!supabase) return;

    try {
      const { data, error } = await supabase
        .from("ml_signals")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(50);

      if (error) throw error;
      if (data) setSignals(data as MLSignal[]);
    } catch (err) {
      console.error("Error fetching signals:", err);
    }
  }, []);

  // Subscribe to real-time
  useEffect(() => {
    fetchSignals();

    if (!supabase) return;

    const channel = supabase
      .channel("ml-signals-3d")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ml_signals" },
        (payload) => {
          const newSignal = payload.new as MLSignal;
          setSignals(prev => [newSignal, ...prev.slice(0, 49)]);
          setActiveSignal(newSignal);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "ml_signals" },
        () => fetchSignals()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSignals]);

  return (
    <div className="relative w-full h-[800px] rounded-xl overflow-hidden border border-slate-700 bg-slate-950">
      <KeyboardControls map={keyMap}>
        <Canvas
          camera={{ position: [0, 2, 25], fov: 75 }}
          shadows
          gl={{ antialias: true }}
        >
          <Suspense fallback={null}>
            <Scene
              signals={signals}
              activeSignal={activeSignal}
              setActiveSignal={setActiveSignal}
              setSelectedSignal={setSelectedSignal}
              setIsLocked={setIsLocked}
            />
          </Suspense>
        </Canvas>
      </KeyboardControls>

      {/* HUD */}
      <HUD signals={signals} isLocked={isLocked} />

      {/* Info panel */}
      <InfoPanel signal={selectedSignal} onClose={() => setSelectedSignal(null)} />
    </div>
  );
}
