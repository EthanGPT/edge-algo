import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Text, Box, Plane, Html, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { supabase } from "@/lib/supabase";
import { useBots } from "@/context/BotContext";

// =============================================================================
// TYPES
// =============================================================================

interface MLSignal {
  id: string;
  timestamp: string;
  instrument: string;
  direction: string;
  ml_confidence: number;
  final_decision: string;
  outcome?: string;
}

interface AccountPauseState {
  [accountId: string]: {
    pausedForDay: boolean;
    signalsPaused: boolean;
  };
}

type RoomKey = 'gate' | 'technical' | 'patterns' | 'time' | 'ml' | 'office' | 'achievements';

// =============================================================================
// BIG MITCH STATE - Sims-style needs system
// =============================================================================

interface MitchState {
  energy: number;      // 0-100, recharges near bed
  focus: number;       // 0-100, increases at gaming setup
  confidence: number;  // 0-100, goes up with wins
  wealth: number;      // Total PnL
  mood: 'grinding' | 'relaxing' | 'sleeping' | 'analyzing' | 'celebrating';
  currentActivity: string;
}

interface InteractiveItem {
  id: string;
  name: string;
  actions: { label: string; emoji: string; effect: () => void }[];
}

// =============================================================================
// ROOM DATA - Enhanced with main.py + Pine Script details
// =============================================================================

const ROOM_DATA: Record<RoomKey, { name: string; subtitle: string; color: string; description: string; items: { title: string; value: string; desc: string; detail?: string }[] }> = {
  gate: {
    name: "Gate Checks",
    subtitle: "Hard Filters",
    color: "#dc2626", // Darker red for better readability
    description: "Binary pass/fail checks before ML scoring",
    items: [
      { title: "Instruments", value: "MES • MNQ • MGC", desc: "Micro futures only", detail: "TP/SL: MES 25pt, MNQ 50pt, MGC 20pt" },
      { title: "London", value: "03:00-08:00 ET", desc: "78% of total PnL", detail: "Primary session - 56.1% WR" },
      { title: "New York", value: "09:30-16:00 ET", desc: "22% of total PnL", detail: "Secondary session - 54.9% WR" },
      { title: "RSI Filter", value: "<65 long, >35 short", desc: "Avoid overextended", detail: "Pine: RSI(14) based scoring" },
      { title: "ATR Ceiling", value: "Max 1.5%", desc: "Avoid volatility", detail: "ATR% = ATR(14) / Close" },
      { title: "Circuit Breaker", value: "3 consec losses", desc: "Risk management", detail: "Pauses until next session" },
    ]
  },
  technical: {
    name: "Technical Analysis",
    subtitle: "30-Dim Feature Vector",
    color: "#2563eb", // Darker blue
    description: "GradientBoostingClassifier with 500 trees",
    items: [
      { title: "RSI Score", value: "14.88%", desc: "#1 Feature Importance", detail: "Long: RSI<35 = 1.0, RSI>65 = 0.0" },
      { title: "Hour Norm", value: "13.24%", desc: "#2 Feature Importance", detail: "ET hour / 24 normalized" },
      { title: "RSI Momentum", value: "7.73%", desc: "#3 Feature Importance", detail: "RSI_ROC normalized ±10" },
      { title: "Setup Score", value: "6.21%", desc: "#4 Combined signals", detail: "Level + Session + Direction" },
      { title: "DI Alignment", value: "5.89%", desc: "#5 +DI vs -DI", detail: "Long: +DI > -DI alignment" },
      { title: "MACD Signal", value: "5.34%", desc: "#6 Cross direction", detail: "MACD histogram polarity" },
    ]
  },
  patterns: {
    name: "Key Levels",
    subtitle: "Price Structure",
    color: "#7c3aed", // Darker purple
    description: "Institutional reference levels from Pine Script",
    items: [
      { title: "PML", value: "58.3% WR", desc: "Pre-Market Low", detail: "BEST LEVEL - Highest win rate" },
      { title: "PMH", value: "55.9% WR", desc: "Pre-Market High", detail: "Strong reversal zone" },
      { title: "LPL", value: "55.9% WR", desc: "London Session Low", detail: "London pivot support" },
      { title: "LPH", value: "53.7% WR", desc: "London Session High", detail: "London pivot resistance" },
      { title: "PDL", value: "54.4% WR", desc: "Prior Day Low", detail: "Yesterday's low support" },
      { title: "PDH", value: "51.2% WR", desc: "Prior Day High", detail: "Yesterday's high resistance" },
    ]
  },
  time: {
    name: "Temporal Features",
    subtitle: "Time-Based Scoring",
    color: "#d97706", // Darker amber
    description: "Session & Hour optimization from 14 years data",
    items: [
      { title: "Hour Score", value: "4.45%", desc: "#8 Feature", detail: "Hour-specific win rate lookup" },
      { title: "Day of Week", value: "5 features", desc: "One-hot encoded", detail: "Mon-Fri binary encoding" },
      { title: "Session", value: "2 features", desc: "London / NY", detail: "Binary session indicator" },
      { title: "Best Hours", value: "10:00-11:30", desc: "Peak performance", detail: "NY open momentum" },
      { title: "Longs WR", value: "57.1%", desc: "$774K sim profit", detail: "Direction bias: slightly bullish" },
      { title: "Shorts WR", value: "54.7%", desc: "$565K sim profit", detail: "Lower but still profitable" },
    ]
  },
  ml: {
    name: "ML Decision Engine",
    subtitle: "Position Sizing",
    color: "#16a34a", // Darker green for better readability
    description: "Confidence-tiered position sizing",
    items: [
      { title: "Baseline", value: "55.9%", desc: "No ML filter", detail: "Raw signal performance" },
      { title: "≥50% Conf", value: "58.6% WR", desc: "1x position size", detail: "Default threshold" },
      { title: "≥65% Conf", value: "61.9% WR", desc: "2x position size", detail: "High confidence tier" },
      { title: "≥70% Conf", value: "67.0% WR", desc: "3x MAX size", detail: "Maximum conviction" },
      { title: "Recovery", value: "117x", desc: "Per $1 drawdown", detail: "$117 return per $1 DD" },
      { title: "Training", value: "25,656 signals", desc: "14 years validated", detail: "2012-2026 backtest" },
    ]
  },
  office: {
    name: "Command Center",
    subtitle: "Operations",
    color: "#16a34a",
    description: "Live monitoring & account management",
    items: []
  },
  achievements: {
    name: "Hall of Fame",
    subtitle: "Mitch's Trophies",
    color: "#eab308",
    description: "Big Mitch's proudest moments and milestones",
    items: [
      { title: "First Trade", value: "Jan 2024", desc: "The journey begins", detail: "First signal processed successfully" },
      { title: "100 Trades", value: "Milestone", desc: "Consistency achieved", detail: "Maintained 55%+ win rate" },
      { title: "67% WR Peak", value: "Record", desc: "Highest confidence tier", detail: "70%+ confidence signals" },
      { title: "$117 Recovery", value: "Per $1 DD", desc: "Risk efficiency", detail: "Best-in-class risk management" },
      { title: "14 Years", value: "Backtest", desc: "Data validated", detail: "25,656 signals analyzed" },
      { title: "3 Accounts", value: "Active", desc: "Funded & running", detail: "Multiple prop firms conquered" },
    ]
  }
};

// =============================================================================
// LIGHT THEME COLORS
// =============================================================================

const COLORS = {
  bg: "#f5f5f7",
  panel: "#ffffff",
  panelBorder: "#e5e5e5",
  textPrimary: "#1d1d1f",
  textSecondary: "#6b6b6b", // Darker for better readability
  textMuted: "#8e8e93",     // Darker for better readability
  floor: "#e8e8ed",
  wall: "#f0f0f5",
  accent: "#16a34a",        // Darker green for better contrast
  accentRed: "#dc2626",     // Darker red
  accentBlue: "#2563eb",    // Darker blue
  accentAmber: "#d97706",   // Darker amber
};

// =============================================================================
// GLASS PANEL - Light theme
// =============================================================================

function Panel({ position, size, children, accent = "#22c55e" }: {
  position: [number, number, number];
  size: [number, number];
  children?: React.ReactNode;
  accent?: string;
}) {
  return (
    <group position={position}>
      <RoundedBox args={[size[0], size[1], 0.02]} radius={0.04}>
        <meshStandardMaterial color={COLORS.panel} roughness={0.3} />
      </RoundedBox>
      {/* Top accent bar */}
      <mesh position={[0, size[1] / 2 - 0.02, 0.015]}>
        <planeGeometry args={[size[0] - 0.1, 0.03]} />
        <meshBasicMaterial color={accent} />
      </mesh>
      {children}
    </group>
  );
}

// =============================================================================
// ENVIRONMENT - Light
// =============================================================================

function Lighting() {
  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[10, 10, 5]} intensity={0.8} color="#fff" />
      <directionalLight position={[-5, 8, -5]} intensity={0.4} color="#fff" />
    </>
  );
}

function Floor() {
  return (
    <Plane args={[60, 60]} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <meshStandardMaterial color={COLORS.floor} roughness={0.8} />
    </Plane>
  );
}

function Ceiling() {
  return (
    <Plane args={[60, 60]} rotation={[Math.PI / 2, 0, 0]} position={[0, 5, 0]}>
      <meshStandardMaterial color="#ffffff" />
    </Plane>
  );
}

function Wall({ position, rotation = [0, 0, 0], size = [10, 5, 0.1] }: {
  position: [number, number, number];
  rotation?: [number, number, number];
  size?: [number, number, number];
}) {
  return (
    <group position={position} rotation={rotation}>
      <Box args={size}>
        <meshStandardMaterial color={COLORS.wall} roughness={0.9} />
      </Box>
      {/* Cartoon-style black border outline */}
      <CartoonBorder width={size[0]} height={size[1]} />
    </group>
  );
}

// =============================================================================
// CARTOON BORDERS - Black outlines for that stylized look
// =============================================================================

function CartoonBorder({ width, height, thickness = 0.03 }: { width: number; height: number; thickness?: number }) {
  return (
    <group position={[0, 0, 0.06]}>
      {/* Top edge */}
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[width + thickness * 2, thickness, thickness]} />
        <meshBasicMaterial color="#1d1d1f" />
      </mesh>
      {/* Bottom edge */}
      <mesh position={[0, -height / 2, 0]}>
        <boxGeometry args={[width + thickness * 2, thickness, thickness]} />
        <meshBasicMaterial color="#1d1d1f" />
      </mesh>
      {/* Left edge */}
      <mesh position={[-width / 2, 0, 0]}>
        <boxGeometry args={[thickness, height, thickness]} />
        <meshBasicMaterial color="#1d1d1f" />
      </mesh>
      {/* Right edge */}
      <mesh position={[width / 2, 0, 0]}>
        <boxGeometry args={[thickness, height, thickness]} />
        <meshBasicMaterial color="#1d1d1f" />
      </mesh>
    </group>
  );
}

// =============================================================================
// DECORATIVE ELEMENTS - Add life to rooms
// =============================================================================

function WallDecor({ position, rotation }: { position: [number, number, number]; rotation?: [number, number, number] }) {
  return (
    <group position={position} rotation={rotation}>
      {/* Framed motivational poster */}
      <RoundedBox args={[0.8, 1, 0.02]} radius={0.02}>
        <meshStandardMaterial color="#fff" />
      </RoundedBox>
      {/* Frame border */}
      <mesh position={[0, 0, 0.015]}>
        <planeGeometry args={[0.7, 0.9]} />
        <meshBasicMaterial color="#f0f0f0" />
      </mesh>
      {/* Black frame outline */}
      <CartoonBorder width={0.8} height={1} thickness={0.02} />
      <Text fontSize={0.08} color="#1d1d1f" anchorX="center" position={[0, 0.2, 0.03]} fontWeight="bold">
        TRADE
      </Text>
      <Text fontSize={0.08} color="#1d1d1f" anchorX="center" position={[0, 0, 0.03]} fontWeight="bold">
        THE
      </Text>
      <Text fontSize={0.08} color="#16a34a" anchorX="center" position={[0, -0.2, 0.03]} fontWeight="bold">
        PLAN
      </Text>
    </group>
  );
}

function Plant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Pot */}
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.12, 0.1, 0.3, 12]} />
        <meshStandardMaterial color="#4a4a4a" />
      </mesh>
      {/* Soil */}
      <mesh position={[0, 0.31, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.02, 12]} />
        <meshStandardMaterial color="#3d2817" />
      </mesh>
      {/* Leaves */}
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[Math.sin(i * 1.2) * 0.08, 0.45 + i * 0.06, Math.cos(i * 1.2) * 0.08]} rotation={[0.3, i * 1.2, 0.2]}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshStandardMaterial color="#22c55e" />
        </mesh>
      ))}
    </group>
  );
}

function Trophy({ position, label, color = "#eab308" }: { position: [number, number, number]; label: string; color?: string }) {
  return (
    <group position={position}>
      {/* Base */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[0.2, 0.1, 0.12]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      {/* Stem */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.02, 0.04, 0.2, 8]} />
        <meshStandardMaterial color={color} metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Cup */}
      <mesh position={[0, 0.38, 0]}>
        <cylinderGeometry args={[0.08, 0.05, 0.15, 16]} />
        <meshStandardMaterial color={color} metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Label */}
      <Text fontSize={0.03} color="#fff" anchorX="center" position={[0, 0.03, 0.07]} fontWeight="bold">
        {label}
      </Text>
    </group>
  );
}

function Couch({ position, rotation = [0, 0, 0] }: { position: [number, number, number]; rotation?: [number, number, number] }) {
  return (
    <group position={position} rotation={rotation}>
      {/* Seat */}
      <RoundedBox args={[1.8, 0.25, 0.8]} position={[0, 0.3, 0]} radius={0.05}>
        <meshStandardMaterial color="#374151" />
      </RoundedBox>
      {/* Back */}
      <RoundedBox args={[1.8, 0.6, 0.2]} position={[0, 0.65, -0.35]} radius={0.05}>
        <meshStandardMaterial color="#374151" />
      </RoundedBox>
      {/* Arms */}
      <RoundedBox args={[0.2, 0.35, 0.7]} position={[-0.85, 0.45, 0]} radius={0.04}>
        <meshStandardMaterial color="#374151" />
      </RoundedBox>
      <RoundedBox args={[0.2, 0.35, 0.7]} position={[0.85, 0.45, 0]} radius={0.04}>
        <meshStandardMaterial color="#374151" />
      </RoundedBox>
      {/* Green accent pillows */}
      <RoundedBox args={[0.35, 0.35, 0.12]} position={[-0.5, 0.55, -0.15]} rotation={[0.2, 0.1, 0]} radius={0.04}>
        <meshStandardMaterial color="#22c55e" />
      </RoundedBox>
      <RoundedBox args={[0.35, 0.35, 0.12]} position={[0.5, 0.55, -0.15]} rotation={[0.2, -0.1, 0]} radius={0.04}>
        <meshStandardMaterial color="#22c55e" />
      </RoundedBox>
    </group>
  );
}

function CoffeeTable({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Table top */}
      <RoundedBox args={[1, 0.05, 0.5]} position={[0, 0.35, 0]} radius={0.02}>
        <meshStandardMaterial color="#1a1a1a" />
      </RoundedBox>
      {/* Legs */}
      {[[-0.4, -0.2], [0.4, -0.2], [-0.4, 0.2], [0.4, 0.2]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.17, z]}>
          <boxGeometry args={[0.05, 0.34, 0.05]} />
          <meshStandardMaterial color="#333" />
        </mesh>
      ))}
      {/* Coffee mug */}
      <mesh position={[0.2, 0.42, 0]}>
        <cylinderGeometry args={[0.04, 0.035, 0.08, 12]} />
        <meshStandardMaterial color="#fff" />
      </mesh>
      {/* Mug handle */}
      <mesh position={[0.27, 0.42, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.025, 0.008, 8, 12, Math.PI]} />
        <meshStandardMaterial color="#fff" />
      </mesh>
    </group>
  );
}

function TrophyShelf({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Shelf */}
      <RoundedBox args={[2.5, 0.08, 0.35]} position={[0, 0, 0]} radius={0.02}>
        <meshStandardMaterial color="#1a1a1a" />
      </RoundedBox>
      {/* Black border */}
      <CartoonBorder width={2.5} height={0.08} thickness={0.015} />
      {/* Trophies */}
      <Trophy position={[-0.9, 0.04, 0]} label="67% WR" color="#eab308" />
      <Trophy position={[-0.3, 0.04, 0]} label="$117x" color="#c0c0c0" />
      <Trophy position={[0.3, 0.04, 0]} label="25K SIG" color="#cd7f32" />
      <Trophy position={[0.9, 0.04, 0]} label="14 YRS" color="#eab308" />
    </group>
  );
}

function WorldsBestSign({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Sign background */}
      <RoundedBox args={[4, 0.8, 0.05]} radius={0.03}>
        <meshStandardMaterial color="#1a1a1a" />
      </RoundedBox>
      {/* Gold border */}
      <mesh position={[0, 0, 0.03]}>
        <planeGeometry args={[3.8, 0.7]} />
        <meshBasicMaterial color="#eab308" />
      </mesh>
      <mesh position={[0, 0, 0.035]}>
        <planeGeometry args={[3.6, 0.6]} />
        <meshBasicMaterial color="#1a1a1a" />
      </mesh>
      {/* Text */}
      <Text fontSize={0.12} color="#eab308" anchorX="center" position={[0, 0.12, 0.04]} fontWeight="bold" letterSpacing={0.05}>
        WORLD'S BEST
      </Text>
      <Text fontSize={0.1} color="#fff" anchorX="center" position={[0, -0.08, 0.04]} fontWeight="bold">
        RETAIL ML TRADER
      </Text>
      {/* Stars */}
      <Text fontSize={0.15} color="#eab308" anchorX="center" position={[-1.5, 0, 0.04]}>
        ★
      </Text>
      <Text fontSize={0.15} color="#eab308" anchorX="center" position={[1.5, 0, 0.04]}>
        ★
      </Text>
    </group>
  );
}

function Rug({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[4, 3]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      {/* Green accent border */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <ringGeometry args={[1.8, 2, 32]} />
        <meshBasicMaterial color="#22c55e" transparent opacity={0.3} />
      </mesh>
      {/* M logo in center */}
      <Text fontSize={0.5} color="#22c55e" anchorX="center" rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} fontWeight="bold">
        M
      </Text>
    </group>
  );
}

function PoolTable({ position, rotation = [0, 0, 0] }: { position: [number, number, number]; rotation?: [number, number, number] }) {
  return (
    <group position={position} rotation={rotation}>
      {/* Table legs */}
      {[[-1.1, -0.6], [1.1, -0.6], [-1.1, 0.6], [1.1, 0.6]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.4, z]}>
          <boxGeometry args={[0.15, 0.8, 0.15]} />
          <meshStandardMaterial color="#3d2817" />
        </mesh>
      ))}
      {/* Table frame */}
      <mesh position={[0, 0.85, 0]}>
        <boxGeometry args={[2.8, 0.15, 1.6]} />
        <meshStandardMaterial color="#3d2817" />
      </mesh>
      {/* Green felt surface */}
      <mesh position={[0, 0.93, 0]}>
        <boxGeometry args={[2.5, 0.05, 1.3]} />
        <meshStandardMaterial color="#166534" roughness={0.9} />
      </mesh>
      {/* Cushion rails */}
      <mesh position={[0, 0.97, 0.72]}>
        <boxGeometry args={[2.5, 0.08, 0.08]} />
        <meshStandardMaterial color="#3d2817" />
      </mesh>
      <mesh position={[0, 0.97, -0.72]}>
        <boxGeometry args={[2.5, 0.08, 0.08]} />
        <meshStandardMaterial color="#3d2817" />
      </mesh>
      <mesh position={[1.32, 0.97, 0]}>
        <boxGeometry args={[0.08, 0.08, 1.3]} />
        <meshStandardMaterial color="#3d2817" />
      </mesh>
      <mesh position={[-1.32, 0.97, 0]}>
        <boxGeometry args={[0.08, 0.08, 1.3]} />
        <meshStandardMaterial color="#3d2817" />
      </mesh>
      {/* Corner pockets */}
      {[[-1.2, -0.6], [1.2, -0.6], [-1.2, 0.6], [1.2, 0.6]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.94, z]}>
          <cylinderGeometry args={[0.08, 0.08, 0.1, 16]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      ))}
      {/* Balls rack triangle */}
      <group position={[0.6, 0.98, 0]}>
        {/* Cue ball */}
        <mesh position={[-1.5, 0, 0]}>
          <sphereGeometry args={[0.045, 16, 16]} />
          <meshStandardMaterial color="#fff" />
        </mesh>
        {/* Racked balls */}
        {[
          [0, 0],
          [-0.1, 0.06], [-0.1, -0.06],
          [-0.2, 0.12], [-0.2, 0], [-0.2, -0.12],
        ].map(([x, z], i) => (
          <mesh key={i} position={[x, 0, z]}>
            <sphereGeometry args={[0.045, 16, 16]} />
            <meshStandardMaterial color={i === 0 ? "#eab308" : i % 2 === 0 ? "#ef4444" : "#3b82f6"} />
          </mesh>
        ))}
      </group>
      {/* Cue stick leaning on table */}
      <mesh position={[-1.6, 0.6, 0.3]} rotation={[0, 0, 0.1]}>
        <cylinderGeometry args={[0.015, 0.025, 1.5, 8]} />
        <meshStandardMaterial color="#8b6914" />
      </mesh>
    </group>
  );
}

function Bookshelf({ position, rotation = [0, 0, 0] }: { position: [number, number, number]; rotation?: [number, number, number] }) {
  const bookColors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316', '#ec4899', '#14b8a6'];
  return (
    <group position={position} rotation={rotation}>
      {/* Back panel */}
      <mesh position={[0, 1.2, -0.12]}>
        <boxGeometry args={[1.2, 2.4, 0.05]} />
        <meshStandardMaterial color="#2d1f14" />
      </mesh>
      {/* Side panels */}
      <mesh position={[-0.57, 1.2, 0]}>
        <boxGeometry args={[0.06, 2.4, 0.3]} />
        <meshStandardMaterial color="#3d2817" />
      </mesh>
      <mesh position={[0.57, 1.2, 0]}>
        <boxGeometry args={[0.06, 2.4, 0.3]} />
        <meshStandardMaterial color="#3d2817" />
      </mesh>
      {/* Shelves */}
      {[0.4, 0.9, 1.4, 1.9, 2.4].map((y, i) => (
        <mesh key={i} position={[0, y, 0]}>
          <boxGeometry args={[1.2, 0.04, 0.3]} />
          <meshStandardMaterial color="#3d2817" />
        </mesh>
      ))}
      {/* Books on shelves */}
      {[0.6, 1.1, 1.6, 2.1].map((shelfY, shelfI) => (
        <group key={shelfI} position={[0, shelfY, 0]}>
          {Array.from({ length: 5 + Math.floor(Math.random() * 3) }).map((_, i) => {
            const height = 0.25 + Math.random() * 0.15;
            const width = 0.08 + Math.random() * 0.04;
            return (
              <mesh key={i} position={[-0.4 + i * 0.14, height / 2, 0]}>
                <boxGeometry args={[width, height, 0.18]} />
                <meshStandardMaterial color={bookColors[(shelfI * 5 + i) % bookColors.length]} />
              </mesh>
            );
          })}
        </group>
      ))}
    </group>
  );
}

function VinylSetup({ position, rotation = [0, 0, 0] }: { position: [number, number, number]; rotation?: [number, number, number] }) {
  return (
    <group position={position} rotation={rotation}>
      {/* Cabinet */}
      <RoundedBox args={[1.2, 0.7, 0.5]} position={[0, 0.35, 0]} radius={0.02}>
        <meshStandardMaterial color="#2d2d2d" />
      </RoundedBox>
      {/* Turntable base */}
      <mesh position={[0, 0.75, 0]}>
        <boxGeometry args={[0.5, 0.06, 0.4]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      {/* Platter */}
      <mesh position={[0, 0.79, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.02, 32]} />
        <meshStandardMaterial color="#333" metalness={0.5} />
      </mesh>
      {/* Record */}
      <mesh position={[0, 0.81, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.14, 0.14, 0.01, 32]} />
        <meshStandardMaterial color="#111" />
      </mesh>
      {/* Record label */}
      <mesh position={[0, 0.82, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.005, 32]} />
        <meshStandardMaterial color="#22c55e" />
      </mesh>
      {/* Tonearm */}
      <group position={[0.18, 0.8, 0.12]}>
        <mesh rotation={[0, -0.3, 0]}>
          <boxGeometry args={[0.15, 0.02, 0.015]} />
          <meshStandardMaterial color="#888" metalness={0.8} />
        </mesh>
      </group>
      {/* Speaker - Left */}
      <mesh position={[-0.45, 0.85, 0]}>
        <boxGeometry args={[0.2, 0.3, 0.18]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[-0.45, 0.9, 0.1]}>
        <cylinderGeometry args={[0.06, 0.06, 0.02, 16]} />
        <meshStandardMaterial color="#333" />
      </mesh>
      {/* Speaker - Right */}
      <mesh position={[0.45, 0.85, 0]}>
        <boxGeometry args={[0.2, 0.3, 0.18]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0.45, 0.9, 0.1]}>
        <cylinderGeometry args={[0.06, 0.06, 0.02, 16]} />
        <meshStandardMaterial color="#333" />
      </mesh>
      {/* Vinyl records leaning */}
      {[0.25, 0.32, 0.39].map((x, i) => (
        <mesh key={i} position={[x, 0.45, 0.1]} rotation={[0.1, 0, 0]}>
          <boxGeometry args={[0.02, 0.28, 0.28]} />
          <meshStandardMaterial color={['#ef4444', '#3b82f6', '#eab308'][i]} />
        </mesh>
      ))}
    </group>
  );
}

function ArcadeGame({ position, rotation = [0, 0, 0] }: { position: [number, number, number]; rotation?: [number, number, number] }) {
  return (
    <group position={position} rotation={rotation}>
      {/* Cabinet body */}
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[0.7, 1.8, 0.6]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>
      {/* Screen bezel */}
      <mesh position={[0, 1.35, 0.31]}>
        <boxGeometry args={[0.55, 0.5, 0.02]} />
        <meshStandardMaterial color="#111" />
      </mesh>
      {/* Screen */}
      <mesh position={[0, 1.35, 0.33]}>
        <planeGeometry args={[0.45, 0.4]} />
        <meshBasicMaterial color="#000" />
      </mesh>
      {/* Game graphics on screen */}
      <Text fontSize={0.08} color="#22c55e" anchorX="center" position={[0, 1.45, 0.34]} fontWeight="bold">
        TRADER
      </Text>
      <Text fontSize={0.05} color="#eab308" anchorX="center" position={[0, 1.3, 0.34]}>
        HIGH SCORE: 999,999
      </Text>
      {/* Control panel */}
      <mesh position={[0, 0.7, 0.25]} rotation={[-0.4, 0, 0]}>
        <boxGeometry args={[0.6, 0.25, 0.3]} />
        <meshStandardMaterial color="#2d2d2d" />
      </mesh>
      {/* Joystick */}
      <group position={[-0.15, 0.82, 0.32]}>
        <mesh>
          <cylinderGeometry args={[0.025, 0.025, 0.08, 8]} />
          <meshStandardMaterial color="#111" />
        </mesh>
        <mesh position={[0, 0.05, 0]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshStandardMaterial color="#ef4444" />
        </mesh>
      </group>
      {/* Buttons */}
      {[[0.1, '#22c55e'], [0.18, '#3b82f6'], [0.26, '#eab308']].map(([x, color], i) => (
        <mesh key={i} position={[x as number, 0.8, 0.32]}>
          <cylinderGeometry args={[0.025, 0.025, 0.02, 16]} />
          <meshBasicMaterial color={color as string} />
        </mesh>
      ))}
      {/* Marquee */}
      <mesh position={[0, 1.75, 0.2]}>
        <boxGeometry args={[0.65, 0.15, 0.1]} />
        <meshBasicMaterial color="#22c55e" />
      </mesh>
      <Text fontSize={0.06} color="#000" anchorX="center" position={[0, 1.75, 0.26]} fontWeight="bold">
        BIG MITCH
      </Text>
    </group>
  );
}

function Mirror({ position, rotation = [0, 0, 0] }: { position: [number, number, number]; rotation?: [number, number, number] }) {
  return (
    <group position={position} rotation={rotation}>
      {/* Frame */}
      <RoundedBox args={[0.9, 1.4, 0.06]} position={[0, 0, 0]} radius={0.02}>
        <meshStandardMaterial color="#333" />
      </RoundedBox>
      {/* Mirror surface */}
      <mesh position={[0, 0, 0.035]}>
        <planeGeometry args={[0.75, 1.25]} />
        <meshStandardMaterial color="#c4d4e4" metalness={0.95} roughness={0.05} />
      </mesh>
      {/* LED strip around mirror */}
      <pointLight position={[0, 0, 0.1]} color="#fff" intensity={0.5} distance={2} />
    </group>
  );
}

// =============================================================================
// LAVISH LIFESTYLE - Cars, Bikes, Drip
// =============================================================================

function SportsCar({ position, rotation = [0, 0, 0], color = "#22c55e" }: { position: [number, number, number]; rotation?: [number, number, number]; color?: string }) {
  return (
    <group position={position} rotation={rotation}>
      {/* Body - sleek Lambo style */}
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[1.8, 0.35, 0.9]} />
        <meshStandardMaterial color={color} metalness={0.9} roughness={0.1} />
      </mesh>
      {/* Hood slope */}
      <mesh position={[0.6, 0.4, 0]} rotation={[0, 0, -0.15]}>
        <boxGeometry args={[0.8, 0.15, 0.85]} />
        <meshStandardMaterial color={color} metalness={0.9} roughness={0.1} />
      </mesh>
      {/* Cabin */}
      <mesh position={[-0.15, 0.55, 0]}>
        <boxGeometry args={[0.9, 0.25, 0.8]} />
        <meshStandardMaterial color="#111" metalness={0.3} roughness={0.1} />
      </mesh>
      {/* Windshield */}
      <mesh position={[0.25, 0.6, 0]} rotation={[0, 0, -0.5]}>
        <planeGeometry args={[0.4, 0.7]} />
        <meshStandardMaterial color="#1a1a2e" metalness={0.5} roughness={0.1} transparent opacity={0.8} />
      </mesh>
      {/* Wheels */}
      {[[-0.55, -0.35], [0.55, -0.35], [-0.55, 0.35], [0.55, 0.35]].map(([x, z], i) => (
        <group key={i} position={[x, 0.15, z]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.15, 0.15, 0.1, 16]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.12, 0.12, 0.12, 16]} />
            <meshStandardMaterial color="#333" metalness={0.8} />
          </mesh>
        </group>
      ))}
      {/* Headlights */}
      <mesh position={[0.9, 0.35, 0.3]}>
        <boxGeometry args={[0.05, 0.08, 0.15]} />
        <meshBasicMaterial color="#fff" />
      </mesh>
      <mesh position={[0.9, 0.35, -0.3]}>
        <boxGeometry args={[0.05, 0.08, 0.15]} />
        <meshBasicMaterial color="#fff" />
      </mesh>
      {/* Taillights */}
      <mesh position={[-0.9, 0.38, 0.3]}>
        <boxGeometry args={[0.05, 0.06, 0.2]} />
        <meshBasicMaterial color="#ef4444" />
      </mesh>
      <mesh position={[-0.9, 0.38, -0.3]}>
        <boxGeometry args={[0.05, 0.06, 0.2]} />
        <meshBasicMaterial color="#ef4444" />
      </mesh>
      {/* Spoiler */}
      <mesh position={[-0.85, 0.6, 0]}>
        <boxGeometry args={[0.08, 0.04, 0.9]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[-0.85, 0.55, -0.35]}>
        <boxGeometry args={[0.06, 0.12, 0.06]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[-0.85, 0.55, 0.35]}>
        <boxGeometry args={[0.06, 0.12, 0.06]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
    </group>
  );
}

function Motorbike({ position, rotation = [0, 0, 0] }: { position: [number, number, number]; rotation?: [number, number, number] }) {
  return (
    <group position={position} rotation={rotation}>
      {/* Frame */}
      <mesh position={[0, 0.4, 0]} rotation={[0, 0, 0.1]}>
        <boxGeometry args={[0.8, 0.15, 0.12]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.8} />
      </mesh>
      {/* Tank */}
      <mesh position={[0.1, 0.5, 0]}>
        <boxGeometry args={[0.35, 0.2, 0.22]} />
        <meshStandardMaterial color="#ef4444" metalness={0.7} roughness={0.2} />
      </mesh>
      {/* Seat */}
      <mesh position={[-0.2, 0.52, 0]}>
        <boxGeometry args={[0.4, 0.1, 0.18]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      {/* Front wheel */}
      <group position={[0.45, 0.22, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.2, 0.05, 8, 24]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 0.08, 16]} />
          <meshStandardMaterial color="#333" metalness={0.9} />
        </mesh>
      </group>
      {/* Back wheel */}
      <group position={[-0.4, 0.22, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.2, 0.06, 8, 24]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 0.1, 16]} />
          <meshStandardMaterial color="#333" metalness={0.9} />
        </mesh>
      </group>
      {/* Handlebars */}
      <mesh position={[0.35, 0.65, 0]}>
        <boxGeometry args={[0.05, 0.2, 0.4]} />
        <meshStandardMaterial color="#333" metalness={0.8} />
      </mesh>
      {/* Headlight */}
      <mesh position={[0.5, 0.55, 0]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshBasicMaterial color="#fff" />
      </mesh>
      {/* Exhaust */}
      <mesh position={[-0.5, 0.25, 0.15]} rotation={[0, 0, 0.2]}>
        <cylinderGeometry args={[0.03, 0.04, 0.3, 8]} />
        <meshStandardMaterial color="#666" metalness={0.9} />
      </mesh>
    </group>
  );
}

function NeonSign({ position, rotation = [0, 0, 0], text, color = "#22c55e" }: { position: [number, number, number]; rotation?: [number, number, number]; text: string; color?: string }) {
  return (
    <group position={position} rotation={rotation}>
      {/* Backplate */}
      <RoundedBox args={[text.length * 0.15 + 0.4, 0.5, 0.03]} radius={0.02}>
        <meshStandardMaterial color="#1a1a1a" />
      </RoundedBox>
      {/* Neon text */}
      <Text fontSize={0.18} color={color} anchorX="center" position={[0, 0, 0.02]} fontWeight="bold">
        {text}
      </Text>
      {/* Glow effect */}
      <pointLight position={[0, 0, 0.2]} color={color} intensity={0.5} distance={2} />
    </group>
  );
}

function QuotePainting({ position, rotation = [0, 0, 0], quote, author, accent = "#22c55e" }: {
  position: [number, number, number];
  rotation?: [number, number, number];
  quote: string;
  author: string;
  accent?: string;
}) {
  return (
    <group position={position} rotation={rotation}>
      {/* Frame */}
      <RoundedBox args={[1.6, 1, 0.04]} radius={0.03}>
        <meshStandardMaterial color="#1a1a1a" />
      </RoundedBox>
      {/* Canvas */}
      <mesh position={[0, 0, 0.025]}>
        <planeGeometry args={[1.45, 0.85]} />
        <meshBasicMaterial color="#111" />
      </mesh>
      {/* Quote */}
      <Text fontSize={0.07} color="#fff" anchorX="center" position={[0, 0.15, 0.03]} fontWeight="bold" maxWidth={1.3} textAlign="center">
        "{quote}"
      </Text>
      {/* Author */}
      <Text fontSize={0.05} color={accent} anchorX="center" position={[0, -0.25, 0.03]}>
        — {author}
      </Text>
      {/* Accent line */}
      <mesh position={[0, -0.1, 0.03]}>
        <planeGeometry args={[0.8, 0.01]} />
        <meshBasicMaterial color={accent} />
      </mesh>
    </group>
  );
}

function SneakerDisplay({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Glass case */}
      <RoundedBox args={[0.8, 1.2, 0.5]} radius={0.02}>
        <meshStandardMaterial color="#fff" transparent opacity={0.15} />
      </RoundedBox>
      {/* Shelves */}
      {[0.3, 0, -0.3].map((y, i) => (
        <group key={i}>
          <mesh position={[0, y, 0]}>
            <boxGeometry args={[0.7, 0.02, 0.4]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
          {/* Sneaker */}
          <mesh position={[0, y + 0.08, 0]}>
            <boxGeometry args={[0.25, 0.1, 0.1]} />
            <meshStandardMaterial color={i === 0 ? "#22c55e" : i === 1 ? "#ef4444" : "#3b82f6"} />
          </mesh>
          <mesh position={[0.08, y + 0.12, 0]}>
            <boxGeometry args={[0.1, 0.06, 0.1]} />
            <meshStandardMaterial color={i === 0 ? "#22c55e" : i === 1 ? "#ef4444" : "#3b82f6"} />
          </mesh>
        </group>
      ))}
      {/* Base */}
      <mesh position={[0, -0.55, 0]}>
        <boxGeometry args={[0.85, 0.1, 0.55]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
    </group>
  );
}

function WatchCase({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Case */}
      <RoundedBox args={[0.6, 0.4, 0.25]} radius={0.02}>
        <meshStandardMaterial color="#1a1a1a" />
      </RoundedBox>
      {/* Glass top */}
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[0.55, 0.05, 0.22]} />
        <meshStandardMaterial color="#fff" transparent opacity={0.2} />
      </mesh>
      {/* Watches */}
      {[-0.18, 0, 0.18].map((x, i) => (
        <group key={i} position={[x, 0.05, 0]}>
          {/* Watch face */}
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.02, 16]} />
            <meshStandardMaterial color={i === 1 ? "#eab308" : "#c0c0c0"} metalness={0.9} roughness={0.1} />
          </mesh>
          {/* Watch dial */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
            <cylinderGeometry args={[0.045, 0.045, 0.01, 16]} />
            <meshStandardMaterial color="#111" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function FlatScreenTV({ position, rotation = [0, 0, 0] }: { position: [number, number, number]; rotation?: [number, number, number] }) {
  return (
    <group position={position} rotation={rotation}>
      {/* Bezel */}
      <RoundedBox args={[2.4, 1.4, 0.08]} radius={0.02}>
        <meshStandardMaterial color="#1a1a1a" />
      </RoundedBox>
      {/* Screen */}
      <mesh position={[0, 0, 0.045]}>
        <planeGeometry args={[2.2, 1.25]} />
        <meshBasicMaterial color="#0a0a0a" />
      </mesh>
      {/* Chart display - green candles */}
      {[-0.8, -0.5, -0.2, 0.1, 0.4, 0.7].map((x, i) => (
        <mesh key={i} position={[x, -0.1 + Math.sin(i * 1.5) * 0.2, 0.05]}>
          <boxGeometry args={[0.08, 0.15 + Math.random() * 0.3, 0.01]} />
          <meshBasicMaterial color={i % 2 === 0 ? "#22c55e" : "#ef4444"} />
        </mesh>
      ))}
      {/* "LIVE" indicator */}
      <mesh position={[0.9, 0.5, 0.05]}>
        <planeGeometry args={[0.2, 0.08]} />
        <meshBasicMaterial color="#ef4444" />
      </mesh>
      <Text fontSize={0.04} color="#fff" anchorX="center" position={[0.9, 0.5, 0.06]} fontWeight="bold">
        LIVE
      </Text>
      {/* Stand */}
      <mesh position={[0, -0.8, 0]}>
        <boxGeometry args={[0.15, 0.25, 0.15]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0, -0.95, 0]}>
        <boxGeometry args={[0.6, 0.03, 0.25]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
    </group>
  );
}

function MiniBar({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Cabinet */}
      <RoundedBox args={[1.2, 1, 0.5]} radius={0.02}>
        <meshStandardMaterial color="#1a1a1a" />
      </RoundedBox>
      {/* Counter top */}
      <mesh position={[0, 0.52, 0]}>
        <boxGeometry args={[1.25, 0.04, 0.55]} />
        <meshStandardMaterial color="#374151" />
      </mesh>
      {/* Bottles */}
      {[-0.35, -0.1, 0.15, 0.4].map((x, i) => (
        <group key={i} position={[x, 0.72, 0]}>
          <mesh>
            <cylinderGeometry args={[0.04, 0.05, 0.35, 8]} />
            <meshStandardMaterial color={['#22c55e', '#eab308', '#3b82f6', '#a855f7'][i]} transparent opacity={0.8} />
          </mesh>
          {/* Cap */}
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 0.05, 8]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
        </group>
      ))}
      {/* Glasses */}
      <mesh position={[-0.4, 0.6, 0.15]}>
        <cylinderGeometry args={[0.03, 0.025, 0.08, 8]} />
        <meshStandardMaterial color="#fff" transparent opacity={0.3} />
      </mesh>
      <mesh position={[-0.32, 0.6, 0.15]}>
        <cylinderGeometry args={[0.03, 0.025, 0.08, 8]} />
        <meshStandardMaterial color="#fff" transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

function Bed({ position, rotation = [0, 0, 0] }: { position: [number, number, number]; rotation?: [number, number, number] }) {
  return (
    <group position={position} rotation={rotation}>
      {/* Bed frame */}
      <RoundedBox args={[1.4, 0.35, 2.2]} position={[0, 0.175, 0]} radius={0.03}>
        <meshStandardMaterial color="#1a1a1a" />
      </RoundedBox>
      {/* Mattress */}
      <RoundedBox args={[1.3, 0.2, 2]} position={[0, 0.45, 0]} radius={0.05}>
        <meshStandardMaterial color="#f5f5f5" />
      </RoundedBox>
      {/* Pillow */}
      <RoundedBox args={[1, 0.15, 0.4]} position={[0, 0.6, -0.7]} radius={0.06}>
        <meshStandardMaterial color="#22c55e" />
      </RoundedBox>
      {/* Blanket/Duvet */}
      <RoundedBox args={[1.25, 0.12, 1.3]} position={[0, 0.58, 0.25]} radius={0.04}>
        <meshStandardMaterial color="#374151" />
      </RoundedBox>
      {/* Headboard */}
      <RoundedBox args={[1.5, 0.8, 0.1]} position={[0, 0.75, -1.05]} radius={0.03}>
        <meshStandardMaterial color="#1a1a1a" />
      </RoundedBox>
      {/* Green accent stripe on headboard */}
      <mesh position={[0, 0.75, -0.99]}>
        <planeGeometry args={[1.3, 0.05]} />
        <meshBasicMaterial color="#22c55e" />
      </mesh>
      {/* Bedside table */}
      <group position={[0.9, 0, -0.5]}>
        <RoundedBox args={[0.4, 0.45, 0.4]} position={[0, 0.225, 0]} radius={0.02}>
          <meshStandardMaterial color="#1a1a1a" />
        </RoundedBox>
        {/* Lamp */}
        <mesh position={[0, 0.55, 0]}>
          <cylinderGeometry args={[0.08, 0.1, 0.15, 12]} />
          <meshStandardMaterial color="#374151" />
        </mesh>
        <mesh position={[0, 0.7, 0]}>
          <coneGeometry args={[0.12, 0.2, 12]} />
          <meshStandardMaterial color="#f5f5f5" />
        </mesh>
        <pointLight position={[0, 0.6, 0]} color="#fef3c7" intensity={0.3} distance={2} />
      </group>
    </group>
  );
}

function GamingSetup({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Desk */}
      <mesh position={[0, 0.72, 0]}>
        <boxGeometry args={[2, 0.05, 0.8]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      {/* RGB strip under desk */}
      <mesh position={[0, 0.68, 0.38]}>
        <boxGeometry args={[1.9, 0.02, 0.02]} />
        <meshBasicMaterial color="#22c55e" />
      </mesh>
      {/* Legs */}
      <mesh position={[-0.9, 0.36, 0]}>
        <boxGeometry args={[0.05, 0.72, 0.7]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      <mesh position={[0.9, 0.36, 0]}>
        <boxGeometry args={[0.05, 0.72, 0.7]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      {/* Triple monitors */}
      {[-0.6, 0, 0.6].map((x, i) => (
        <group key={i} position={[x, 1.3, -0.2]} rotation={[0, i === 0 ? 0.25 : i === 2 ? -0.25 : 0, 0]}>
          <RoundedBox args={[0.55, 0.35, 0.02]} radius={0.01}>
            <meshStandardMaterial color="#1a1a1a" />
          </RoundedBox>
          <mesh position={[0, 0, 0.015]}>
            <planeGeometry args={[0.5, 0.3]} />
            <meshBasicMaterial color="#0f172a" />
          </mesh>
          {/* Green accent on screen */}
          <mesh position={[0, -0.05, 0.02]}>
            <planeGeometry args={[0.45, 0.02]} />
            <meshBasicMaterial color="#22c55e" />
          </mesh>
        </group>
      ))}
      {/* Keyboard */}
      <RoundedBox args={[0.45, 0.02, 0.15]} position={[0, 0.76, 0.15]} radius={0.005}>
        <meshStandardMaterial color="#1a1a1a" />
      </RoundedBox>
      {/* RGB keyboard glow */}
      <pointLight position={[0, 0.78, 0.15]} color="#22c55e" intensity={0.2} distance={0.5} />
      {/* Mouse */}
      <mesh position={[0.35, 0.76, 0.15]}>
        <boxGeometry args={[0.06, 0.02, 0.1]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
    </group>
  );
}

// =============================================================================
// STATUS HUD - Sims-style needs bars
// =============================================================================

function StatusHUD({ mitchState, isVisible }: { mitchState: MitchState; isVisible: boolean }) {
  if (!isVisible) return null;

  const getMoodEmoji = (mood: MitchState['mood']) => {
    switch (mood) {
      case 'grinding': return '💪';
      case 'relaxing': return '😌';
      case 'sleeping': return '😴';
      case 'analyzing': return '🧠';
      case 'celebrating': return '🎉';
      default: return '😊';
    }
  };

  const getMoodColor = (mood: MitchState['mood']) => {
    switch (mood) {
      case 'grinding': return '#22c55e';
      case 'relaxing': return '#3b82f6';
      case 'sleeping': return '#8b5cf6';
      case 'analyzing': return '#eab308';
      case 'celebrating': return '#f59e0b';
      default: return '#22c55e';
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-black/90 backdrop-blur-xl rounded-2xl p-4 shadow-2xl border border-white/10">
        {/* Header with mood */}
        <div className="flex items-center gap-3 mb-3 pb-3 border-b border-white/10">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
            style={{ backgroundColor: getMoodColor(mitchState.mood) + '20', border: `2px solid ${getMoodColor(mitchState.mood)}` }}
          >
            {getMoodEmoji(mitchState.mood)}
          </div>
          <div>
            <div className="text-white font-bold text-sm">BIG MITCH</div>
            <div className="text-xs" style={{ color: getMoodColor(mitchState.mood) }}>
              {mitchState.currentActivity}
            </div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-xs text-gray-400">WEALTH</div>
            <div className={`font-bold text-lg ${mitchState.wealth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ${mitchState.wealth.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Stats bars */}
        <div className="flex gap-4">
          {/* Energy */}
          <div className="flex-1 min-w-[100px]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <span>⚡</span> Energy
              </span>
              <span className="text-xs text-white font-medium">{mitchState.energy}%</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${mitchState.energy}%`,
                  background: mitchState.energy > 60 ? '#22c55e' : mitchState.energy > 30 ? '#eab308' : '#ef4444'
                }}
              />
            </div>
          </div>

          {/* Focus */}
          <div className="flex-1 min-w-[100px]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <span>🎯</span> Focus
              </span>
              <span className="text-xs text-white font-medium">{mitchState.focus}%</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${mitchState.focus}%`,
                  background: mitchState.focus > 60 ? '#3b82f6' : mitchState.focus > 30 ? '#8b5cf6' : '#6b7280'
                }}
              />
            </div>
          </div>

          {/* Confidence */}
          <div className="flex-1 min-w-[100px]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <span>🔥</span> Confidence
              </span>
              <span className="text-xs text-white font-medium">{mitchState.confidence}%</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${mitchState.confidence}%`,
                  background: mitchState.confidence > 60 ? '#f59e0b' : mitchState.confidence > 30 ? '#f97316' : '#78716c'
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MINIMAP - Top-down view of the room
// =============================================================================

function Minimap({ isVisible }: { isVisible: boolean }) {
  const [mitchPos, setMitchPos] = useState({ x: 0, z: 0 });

  // Waypoints matching WanderingBigMitch
  const waypoints = [
    [0, 0], [-8, -9], [-9, -3], [-8, 5], [-9, 3], [0, 9], [8, 3], [8, -3], [8, -9], [0, 0]
  ];

  useEffect(() => {
    if (!isVisible) return;
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const idx = Math.floor(elapsed / 4) % waypoints.length;
      const t = (elapsed % 4) / 4; // 0-1 within current waypoint
      const nextIdx = (idx + 1) % waypoints.length;
      const current = waypoints[idx];
      const next = waypoints[nextIdx];
      setMitchPos({
        x: current[0] + (next[0] - current[0]) * t,
        z: current[1] + (next[1] - current[1]) * t
      });
    }, 100);
    return () => clearInterval(interval);
  }, [isVisible]);

  if (!isVisible) return null;

  // Map coordinates: room is -12 to 12 on both x and z
  const mapSize = 120;
  const scale = mapSize / 24; // 24 units total

  const toMapX = (x: number) => (x + 12) * scale;
  const toMapY = (z: number) => (12 - z) * scale; // Flip z for top-down

  // Room positions for dots
  const rooms = [
    { x: -8, z: -11.9, color: '#22c55e', label: 'Gate' },
    { x: 8, z: -11.9, color: '#eab308', label: 'Awards' },
    { x: -11.9, z: -3, color: '#3b82f6', label: 'Patterns' },
    { x: -11.9, z: 3, color: '#a855f7', label: 'ML' },
    { x: 11.9, z: -3, color: '#ef4444', label: 'Tech' },
    { x: 11.9, z: 3, color: '#14b8a6', label: 'Time' },
    { x: 0, z: 11.9, color: '#22c55e', label: 'Office' },
  ];

  // Furniture positions (simplified)
  const furniture = [
    { x: -8, z: 5, icon: '🚗' },      // Car
    { x: -9, z: 8, icon: '🏍️' },     // Bike
    { x: -4, z: -1, icon: '🛋️' },    // Couch
    { x: -4, z: -5, icon: '📺' },     // TV
    { x: 8, z: 0, icon: '💻' },       // Gaming
    { x: -9, z: -9, icon: '🛏️' },    // Bed
    { x: 9, z: 5, icon: '🍸' },       // Bar
    { x: 4, z: 7, icon: '🎱' },       // Pool
    { x: 10, z: 8, icon: '🕹️' },     // Arcade
  ];

  return (
    <div className="fixed top-4 right-4 z-50">
      <div className="bg-black/80 backdrop-blur-xl rounded-xl p-3 shadow-2xl border border-white/10">
        <div className="text-[10px] text-gray-400 text-center mb-2 font-medium">BIG MITCH'S CRIB</div>
        <div
          className="relative rounded-lg overflow-hidden"
          style={{ width: mapSize, height: mapSize, background: '#1a1a2e' }}
        >
          {/* Grid lines */}
          <svg className="absolute inset-0" width={mapSize} height={mapSize}>
            {/* Border */}
            <rect x="2" y="2" width={mapSize - 4} height={mapSize - 4} fill="none" stroke="#333" strokeWidth="2" />

            {/* Room doors */}
            {rooms.map((room, i) => (
              <g key={i}>
                <circle
                  cx={toMapX(room.x)}
                  cy={toMapY(room.z)}
                  r="6"
                  fill={room.color + '40'}
                  stroke={room.color}
                  strokeWidth="1.5"
                />
              </g>
            ))}

            {/* Big Mitch */}
            <circle
              cx={toMapX(mitchPos.x)}
              cy={toMapY(mitchPos.z)}
              r="5"
              fill="#22c55e"
              className="animate-pulse"
            />
            <circle
              cx={toMapX(mitchPos.x)}
              cy={toMapY(mitchPos.z)}
              r="8"
              fill="none"
              stroke="#22c55e"
              strokeWidth="1"
              opacity="0.5"
            />
          </svg>

          {/* Furniture icons */}
          {furniture.map((item, i) => (
            <div
              key={i}
              className="absolute text-[8px] transform -translate-x-1/2 -translate-y-1/2 opacity-60"
              style={{ left: toMapX(item.x), top: toMapY(item.z) }}
            >
              {item.icon}
            </div>
          ))}

          {/* Center rug marker */}
          <div
            className="absolute w-3 h-2 rounded-sm bg-gray-600/50 transform -translate-x-1/2 -translate-y-1/2"
            style={{ left: toMapX(0), top: toMapY(0) }}
          />
        </div>
        {/* Legend */}
        <div className="flex justify-center gap-2 mt-2">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[9px] text-gray-400">Mitch</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-white/30 border border-white/50" />
            <span className="text-[9px] text-gray-400">Room</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// INTERACTIVE OBJECT - Hover glow + click actions
// =============================================================================

function InteractiveObject({
  children,
  name,
  position,
  onInteract,
  glowColor = "#22c55e"
}: {
  children: React.ReactNode;
  name: string;
  position: [number, number, number];
  onInteract?: () => void;
  glowColor?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef<THREE.Group>(null);

  return (
    <group
      ref={groupRef}
      position={position}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default'; }}
      onClick={(e) => { e.stopPropagation(); onInteract?.(); }}
    >
      {children}

      {/* Glow effect when hovered */}
      {hovered && (
        <pointLight position={[0, 1, 0]} color={glowColor} intensity={2} distance={4} />
      )}

      {/* Tooltip */}
      {hovered && (
        <Html position={[0, 2.5, 0]} center>
          <div className="px-3 py-2 bg-black/90 backdrop-blur rounded-lg shadow-xl border border-white/20 whitespace-nowrap">
            <div className="text-white font-bold text-sm">{name}</div>
            <div className="text-green-400 text-xs mt-0.5">Click to interact</div>
          </div>
        </Html>
      )}
    </group>
  );
}

// =============================================================================
// ACTION MENU - Popup menu when clicking objects
// =============================================================================

function ActionMenu({
  isOpen,
  position,
  itemName,
  actions,
  onClose
}: {
  isOpen: boolean;
  position: [number, number, number];
  itemName: string;
  actions: { label: string; emoji: string; onClick: () => void }[];
  onClose: () => void;
}) {
  if (!isOpen) return null;

  return (
    <Html position={position} center>
      <div className="bg-black/95 backdrop-blur-xl rounded-xl shadow-2xl border border-white/20 overflow-hidden min-w-[180px]">
        {/* Header */}
        <div className="px-4 py-3 bg-gradient-to-r from-green-500/20 to-transparent border-b border-white/10">
          <div className="text-white font-bold text-sm">{itemName}</div>
        </div>

        {/* Actions */}
        <div className="p-2">
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={() => { action.onClick(); onClose(); }}
              className="w-full px-3 py-2 text-left rounded-lg hover:bg-white/10 transition-colors flex items-center gap-2 group"
            >
              <span className="text-lg group-hover:scale-110 transition-transform">{action.emoji}</span>
              <span className="text-white text-sm">{action.label}</span>
            </button>
          ))}
        </div>

        {/* Close */}
        <div className="px-2 pb-2">
          <button
            onClick={onClose}
            className="w-full px-3 py-1.5 text-gray-400 text-xs rounded-lg hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </Html>
  );
}

// =============================================================================
// DOOR - Clean minimal
// =============================================================================

function Door({ position, rotation = [0, 0, 0], roomKey, onEnter }: {
  position: [number, number, number];
  rotation?: [number, number, number];
  roomKey: RoomKey;
  onEnter: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const data = ROOM_DATA[roomKey];

  return (
    <group position={position} rotation={rotation}>
      {/* Door frame */}
      <RoundedBox args={[1.4, 2.6, 0.08]} position={[0, 1.3, 0]} radius={0.03}>
        <meshStandardMaterial color="#e0e0e0" />
      </RoundedBox>

      {/* Door surface */}
      <mesh position={[0, 1.3, 0.045]}>
        <planeGeometry args={[1.2, 2.4]} />
        <meshStandardMaterial color={hovered ? data.color : "#fafafa"} opacity={hovered ? 0.2 : 1} transparent={hovered} />
      </mesh>

      {/* Color accent strip */}
      <mesh position={[0, 2.55, 0.05]}>
        <planeGeometry args={[1.2, 0.04]} />
        <meshBasicMaterial color={data.color} />
      </mesh>

      {/* Label - BLACK TEXT */}
      <Text fontSize={0.12} color="#1d1d1f" anchorX="center" position={[0, 2.8, 0.05]} fontWeight="bold">
        {data.name}
      </Text>
      <Text fontSize={0.08} color="#4b5563" anchorX="center" position={[0, 2.65, 0.05]}>
        {data.subtitle}
      </Text>

      {/* Hitbox */}
      <mesh
        position={[0, 1.3, 0.3]}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={onEnter}
      >
        <boxGeometry args={[1.6, 2.8, 0.6]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {hovered && (
        <Html position={[0, 2, 0.6]} center>
          <div className="px-4 py-2 bg-white shadow-lg rounded-lg text-sm font-medium text-gray-900 whitespace-nowrap border border-gray-100">
            Enter {data.name}
          </div>
        </Html>
      )}
    </group>
  );
}

// =============================================================================
// DATA CARD - Shows all info directly (no hover needed)
// =============================================================================

function DataCard({ item, color, position }: {
  item: { title: string; value: string; desc: string; detail?: string };
  color: string;
  position: [number, number, number];
}) {
  return (
    <group position={position}>
      {/* Card background */}
      <RoundedBox args={[2.6, 0.7, 0.015]} radius={0.02}>
        <meshStandardMaterial color="#fafafa" />
      </RoundedBox>

      {/* Left accent bar */}
      <mesh position={[-1.27, 0, 0.01]}>
        <planeGeometry args={[0.04, 0.6]} />
        <meshBasicMaterial color={color} />
      </mesh>

      {/* Title - DARK TEXT */}
      <Text fontSize={0.07} color="#1d1d1f" anchorX="left" position={[-1.15, 0.22, 0.02]} fontWeight="bold">
        {item.title}
      </Text>

      {/* Value - big and bold in accent color */}
      <Text fontSize={0.16} color={color} anchorX="left" position={[-1.15, 0.02, 0.02]} fontWeight="bold">
        {item.value}
      </Text>

      {/* Description - DARK TEXT */}
      <Text fontSize={0.055} color="#374151" anchorX="left" position={[-1.15, -0.15, 0.02]}>
        {item.desc}
      </Text>

      {/* Detail - shown directly below - DARKER */}
      {item.detail && (
        <Text fontSize={0.05} color="#4b5563" anchorX="left" position={[-1.15, -0.28, 0.02]} maxWidth={2.4}>
          {item.detail}
        </Text>
      )}
    </group>
  );
}

// =============================================================================
// ROOM VIEW - All info visible, no hover needed
// =============================================================================

function RoomView({ roomKey, onExit }: { roomKey: RoomKey; onExit: () => void }) {
  const data = ROOM_DATA[roomKey];
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 1.7, 5);
    camera.lookAt(0, 2.2, 0);
  }, [camera]);

  return (
    <group>
      <Lighting />
      <Floor />
      <Ceiling />
      <Wall position={[0, 2.5, -1]} size={[14, 5, 0.1]} />

      {/* Main panel - bigger to fit all details */}
      <Panel position={[0, 2.4, -0.9]} size={[11, 3.8]} accent={data.color}>
        {/* Header - BLACK TEXT */}
        <Text fontSize={0.1} color="#374151" anchorX="center" position={[0, 1.65, 0.02]} letterSpacing={0.08} fontWeight="bold">
          {data.subtitle.toUpperCase()}
        </Text>
        <Text fontSize={0.32} color="#1d1d1f" anchorX="center" position={[0, 1.35, 0.02]} fontWeight="bold">
          {data.name}
        </Text>
        <Text fontSize={0.1} color="#4b5563" anchorX="center" position={[0, 1.08, 0.02]}>
          {data.description}
        </Text>

        {/* Divider */}
        <mesh position={[0, 0.92, 0.015]}>
          <planeGeometry args={[10, 0.003]} />
          <meshBasicMaterial color={COLORS.panelBorder} />
        </mesh>

        {/* Data cards - 3 columns, 2 rows - all details visible */}
        {data.items.map((item, i) => {
          const col = i % 3;
          const row = Math.floor(i / 3);
          const x = -3.5 + col * 3.5;
          const y = 0.45 - row * 0.85;

          return (
            <DataCard key={i} item={item} color={data.color} position={[x, y, 0.02]} />
          );
        })}
      </Panel>

      {/* Exit button */}
      <Html position={[0, 0.5, 4]} center>
        <button
          onClick={onExit}
          className="px-6 py-3 bg-white hover:bg-gray-50 shadow-lg rounded-full text-sm font-medium text-gray-700 border border-gray-200 transition-all"
        >
          Press ESC to exit
        </button>
      </Html>
    </group>
  );
}

// =============================================================================
// BIG MITCH
// =============================================================================

function BigMitch({ position, isProcessing, lastDecision, hideLabel = false }: {
  position: [number, number, number];
  isProcessing: boolean;
  lastDecision?: string;
  hideLabel?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.position.y = position[1] + Math.sin(t * (isProcessing ? 5 : 1.5)) * (isProcessing ? 0.04 : 0.015);
  });

  const eyeColor = isProcessing ? "#f59e0b" : lastDecision === "approved" ? "#22c55e" : lastDecision === "rejected" ? "#ef4444" : "#22c55e";

  return (
    <group ref={groupRef} position={position}>
      <mesh position={[0, 0.4, 0]}>
        <capsuleGeometry args={[0.22, 0.4, 8, 16]} />
        <meshStandardMaterial color="#374151" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.95, 0]}>
        <sphereGeometry args={[0.28, 32, 32]} />
        <meshStandardMaterial color="#374151" roughness={0.4} />
      </mesh>
      <mesh position={[-0.09, 0.98, 0.22]}>
        <sphereGeometry args={[0.055, 16, 16]} />
        <meshBasicMaterial color={eyeColor} />
      </mesh>
      <mesh position={[0.09, 0.98, 0.22]}>
        <sphereGeometry args={[0.055, 16, 16]} />
        <meshBasicMaterial color={eyeColor} />
      </mesh>
      <pointLight position={[0, 0.98, 0.3]} color={eyeColor} intensity={isProcessing ? 1 : 0.4} distance={2} />
      <Text fontSize={0.14} color="#22c55e" anchorX="center" position={[0, 0.4, 0.23]} fontWeight="bold">
        M
      </Text>
      {!hideLabel && (
        <>
          <Text fontSize={0.1} color="#1d1d1f" anchorX="center" position={[0, 1.35, 0]} fontWeight="bold">
            BIG MITCH
          </Text>
          <Text fontSize={0.06} color="#4b5563" anchorX="center" position={[0, 1.22, 0]}>
            {isProcessing ? "Processing..." : "Ready"}
          </Text>
        </>
      )}
    </group>
  );
}

// =============================================================================
// WANDERING BIG MITCH - Moves around lobby visiting rooms
// =============================================================================

function WanderingBigMitch({
  isProcessing,
  lastDecision,
  targetOverride,
  currentActivity
}: {
  isProcessing: boolean;
  lastDecision?: string;
  targetOverride?: [number, number, number] | null;
  currentActivity?: string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [targetRoom, setTargetRoom] = useState(0);
  const [isAtTarget, setIsAtTarget] = useState(false);

  // Waypoints around the lobby (visit each door/area on the walls)
  const waypoints: [number, number, number][] = [
    [0, 0, 0],       // Center (start - on the rug)
    [-8, 0, -9],     // Gate checks door (back wall left)
    [-9, 0, -3],     // Patterns door (left wall)
    [-8, 0, 5],      // Check on his car
    [-9, 0, 3],      // ML door (left wall)
    [0, 0, 9],       // Command Center door (front wall)
    [8, 0, 3],       // Time door (right wall)
    [8, 0, -3],      // Technical door (right wall)
    [8, 0, -9],      // Achievements (back wall right)
    [0, 0, 0],       // Back to center
  ];

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;

    // Use override target if provided, otherwise patrol
    let target: [number, number, number];
    if (targetOverride) {
      target = targetOverride;
    } else {
      // Change target every 4 seconds when patrolling
      const roomIndex = Math.floor(t / 4) % waypoints.length;
      if (roomIndex !== targetRoom) setTargetRoom(roomIndex);
      target = waypoints[targetRoom];
    }

    const current = groupRef.current.position;

    // Smooth movement toward target - faster when going to interaction
    const speed = targetOverride ? 0.04 : 0.02;
    current.x += (target[0] - current.x) * speed;
    current.z += (target[2] - current.z) * speed;

    // Check if at target
    const distToTarget = Math.sqrt(Math.pow(target[0] - current.x, 2) + Math.pow(target[2] - current.z, 2));
    setIsAtTarget(distToTarget < 0.5);

    // Bobbing - less when at activity target
    const bobAmount = (targetOverride && isAtTarget) ? 0.005 : 0.015;
    current.y = Math.sin(t * 1.5) * bobAmount;

    // Rotate to face direction of movement
    const dx = target[0] - current.x;
    const dz = target[2] - current.z;
    if (Math.abs(dx) > 0.1 || Math.abs(dz) > 0.1) {
      const targetAngle = Math.atan2(dx, dz);
      groupRef.current.rotation.y += (targetAngle - groupRef.current.rotation.y) * 0.05;
    }
  });

  const eyeColor = isProcessing ? "#f59e0b" : lastDecision === "approved" ? "#22c55e" : lastDecision === "rejected" ? "#ef4444" : "#22c55e";
  const statusText = currentActivity && targetOverride ? currentActivity : isProcessing ? "Processing..." : "Patrolling...";

  return (
    <group ref={groupRef} position={[0, 0, 2]}>
      <mesh position={[0, 0.4, 0]}>
        <capsuleGeometry args={[0.22, 0.4, 8, 16]} />
        <meshStandardMaterial color="#374151" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.95, 0]}>
        <sphereGeometry args={[0.28, 32, 32]} />
        <meshStandardMaterial color="#374151" roughness={0.4} />
      </mesh>
      <mesh position={[-0.09, 0.98, 0.22]}>
        <sphereGeometry args={[0.055, 16, 16]} />
        <meshBasicMaterial color={eyeColor} />
      </mesh>
      <mesh position={[0.09, 0.98, 0.22]}>
        <sphereGeometry args={[0.055, 16, 16]} />
        <meshBasicMaterial color={eyeColor} />
      </mesh>
      <pointLight position={[0, 0.98, 0.3]} color={eyeColor} intensity={isProcessing ? 1 : 0.4} distance={2} />
      <Text fontSize={0.14} color="#22c55e" anchorX="center" position={[0, 0.4, 0.23]} fontWeight="bold">
        M
      </Text>
      <Text fontSize={0.1} color="#1d1d1f" anchorX="center" position={[0, 1.35, 0]} fontWeight="bold">
        BIG MITCH
      </Text>
      <Text fontSize={0.06} color="#4b5563" anchorX="center" position={[0, 1.22, 0]}>
        {statusText}
      </Text>
    </group>
  );
}

// =============================================================================
// TRADING MONITOR - Clean rendering, no z-fighting
// =============================================================================

function TradingMonitor({ position, rotation, size, title, children }: {
  position: [number, number, number];
  rotation?: [number, number, number];
  size: [number, number];
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <group position={position} rotation={rotation}>
      {/* Monitor bezel - single mesh */}
      <mesh>
        <boxGeometry args={[size[0] + 0.15, size[1] + 0.15, 0.06]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      {/* Screen - offset forward to avoid z-fighting */}
      <mesh position={[0, 0, 0.035]}>
        <planeGeometry args={[size[0], size[1]]} />
        <meshBasicMaterial color="#111" />
      </mesh>
      {/* Monitor stand */}
      <mesh position={[0, -size[1]/2 - 0.2, -0.05]}>
        <boxGeometry args={[0.12, 0.35, 0.08]} />
        <meshStandardMaterial color="#333" />
      </mesh>
      {/* Content - offset more forward */}
      <group position={[0, 0, 0.04]}>
        <Text fontSize={0.08} color="#888" anchorX="center" position={[0, size[1]/2 - 0.12, 0]} fontWeight="bold">
          {title}
        </Text>
        {children}
      </group>
    </group>
  );
}

// =============================================================================
// OFFICE - Enhanced with account management & sick trading setup
// =============================================================================

function MitchOffice({ stats, accounts, signals, onExit, accountPauses, onTogglePause }: {
  stats: { totalTrades: number; winRate: number; wins: number; losses: number; profitFactor: number; totalPnl: number };
  accounts: { id: string; name: string; balance: number; status: string; totalPnl: number }[];
  signals: MLSignal[];
  onExit: () => void;
  accountPauses: AccountPauseState;
  onTogglePause: (accountId: string, type: 'day' | 'signals') => void;
}) {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 2, 3.5);
    camera.lookAt(0, 1.8, 0);
  }, [camera]);

  const recent = signals.slice(0, 5);
  const approvedCount = signals.filter(s => s.final_decision === 'approved').length;
  const rejectedCount = signals.filter(s => s.final_decision === 'rejected').length;

  return (
    <group>
      <Lighting />
      <Floor />
      <Ceiling />
      <Wall position={[0, 2.5, -1.5]} size={[12, 5, 0.1]} />
      <Wall position={[-6, 2.5, 1.5]} rotation={[0, Math.PI / 2, 0]} size={[6, 5, 0.1]} />
      <Wall position={[6, 2.5, 1.5]} rotation={[0, Math.PI / 2, 0]} size={[6, 5, 0.1]} />

      {/* Header on wall */}
      <Text fontSize={0.15} color="#1d1d1f" anchorX="center" position={[0, 3.8, -1.4]} fontWeight="bold">
        COMMAND CENTER
      </Text>

      {/* ===== TRADING DESK ===== */}
      <mesh position={[0, 0.72, 0.3]}>
        <boxGeometry args={[6, 0.08, 1.2]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>

      {/* ===== CENTER MONITOR - PERFORMANCE ===== */}
      <TradingMonitor position={[0, 1.8, -0.1]} size={[2.8, 1.6]} title="PERFORMANCE">
        <Text fontSize={0.07} color="#888" anchorX="left" position={[-1.2, 0.45, 0]}>Trades</Text>
        <Text fontSize={0.28} color="#fff" anchorX="left" position={[-1.2, 0.2, 0]} fontWeight="bold">{stats.totalTrades}</Text>

        <Text fontSize={0.07} color="#888" anchorX="left" position={[0.2, 0.45, 0]}>Win Rate</Text>
        <Text fontSize={0.28} color="#22c55e" anchorX="left" position={[0.2, 0.2, 0]} fontWeight="bold">{stats.winRate.toFixed(1)}%</Text>

        <Text fontSize={0.07} color="#888" anchorX="left" position={[-1.2, -0.05, 0]}>W/L</Text>
        <Text fontSize={0.2} color="#fff" anchorX="left" position={[-1.2, -0.28, 0]} fontWeight="bold">{stats.wins}/{stats.losses}</Text>

        <Text fontSize={0.07} color="#888" anchorX="left" position={[0.2, -0.05, 0]}>PnL</Text>
        <Text fontSize={0.2} color={stats.totalPnl >= 0 ? "#22c55e" : "#ef4444"} anchorX="left" position={[0.2, -0.28, 0]} fontWeight="bold">
          ${stats.totalPnl.toLocaleString()}
        </Text>

        <Text fontSize={0.07} color="#888" anchorX="left" position={[-1.2, -0.5, 0]}>PF</Text>
        <Text fontSize={0.18} color={stats.profitFactor >= 1.25 ? "#22c55e" : "#f59e0b"} anchorX="left" position={[-1.2, -0.68, 0]} fontWeight="bold">
          {stats.profitFactor.toFixed(2)}x
        </Text>
      </TradingMonitor>

      {/* ===== LEFT MONITOR - SIGNALS ===== */}
      <TradingMonitor position={[-2.8, 1.8, 0]} rotation={[0, 0.2, 0]} size={[2.2, 1.6]} title="SIGNALS">
        <Text fontSize={0.08} color="#22c55e" anchorX="left" position={[-0.9, 0.45, 0]} fontWeight="bold">{approvedCount} OK</Text>
        <Text fontSize={0.08} color="#ef4444" anchorX="left" position={[0.1, 0.45, 0]} fontWeight="bold">{rejectedCount} REJ</Text>

        {recent.length > 0 ? recent.map((sig, i) => (
          <group key={sig.id} position={[-0.9, 0.15 - i * 0.22, 0]}>
            <Text fontSize={0.06} color="#666" anchorX="left">
              {new Date(sig.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            <Text fontSize={0.07} color="#fff" anchorX="left" position={[0.4, 0, 0]} fontWeight="bold">
              {sig.instrument || 'N/A'}
            </Text>
            <Text fontSize={0.07} color={sig.direction === 'LONG' ? '#22c55e' : '#ef4444'} anchorX="left" position={[0.85, 0, 0]}>
              {sig.direction || '?'}
            </Text>
          </group>
        )) : (
          <Text fontSize={0.09} color="#666" anchorX="center" position={[0, 0, 0]}>
            No signals yet
          </Text>
        )}
      </TradingMonitor>

      {/* ===== RIGHT MONITOR - ACCOUNTS WITH PNL ===== */}
      <TradingMonitor position={[2.8, 1.8, 0]} rotation={[0, -0.2, 0]} size={[2.2, 1.6]} title="ACCOUNTS">
        {accounts.length > 0 ? accounts.slice(0, 3).map((acc, i) => {
          const balance = acc.balance ?? 0;
          const pnl = acc.totalPnl ?? 0;
          const status = acc.status || 'unknown';
          return (
            <group key={acc.id || i} position={[-0.9, 0.35 - i * 0.45, 0]}>
              <Text fontSize={0.09} color="#fff" anchorX="left" fontWeight="bold">{acc.name || 'Account'}</Text>
              <Text fontSize={0.06} color={status === 'funded' || status === 'evaluation' ? '#22c55e' : '#888'} anchorX="left" position={[0, -0.11, 0]}>
                {status.toUpperCase()}
              </Text>
              <Text fontSize={0.08} color="#60a5fa" anchorX="left" position={[0, -0.24, 0]}>
                Bal: ${balance.toLocaleString()}
              </Text>
              <Text fontSize={0.08} color={pnl >= 0 ? '#22c55e' : '#ef4444'} anchorX="left" position={[0, -0.36, 0]} fontWeight="bold">
                PnL: ${pnl.toLocaleString()}
              </Text>
            </group>
          );
        }) : (
          <Text fontSize={0.09} color="#666" anchorX="center" position={[0, 0, 0]}>
            No accounts
          </Text>
        )}
      </TradingMonitor>

      {/* Account Controls Panel - Bottom right */}
      <Html position={[5.5, 1.2, 2]} center>
        <div className="bg-white/95 backdrop-blur p-4 rounded-xl shadow-xl border border-gray-200 w-56">
          <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Account Controls
          </h3>
          {accounts.length > 0 ? accounts.slice(0, 3).map((acc) => {
            const pause = accountPauses[acc.id] || { pausedForDay: false, signalsPaused: false };
            return (
              <div key={acc.id || `acc-${Math.random()}`} className="mb-3 last:mb-0 p-2 bg-gray-50 rounded-lg">
                <div className="text-xs font-bold text-gray-800 mb-2">{acc.name || 'Account'}</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onTogglePause(acc.id, 'day')}
                    className={`flex-1 px-2 py-1.5 text-xs rounded-lg font-semibold transition-all ${
                      pause.pausedForDay
                        ? 'bg-red-500 text-white hover:bg-red-600'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {pause.pausedForDay ? '▶ Resume' : '⏸ Day'}
                  </button>
                  <button
                    onClick={() => onTogglePause(acc.id, 'signals')}
                    className={`flex-1 px-2 py-1.5 text-xs rounded-lg font-semibold transition-all ${
                      pause.signalsPaused
                        ? 'bg-amber-500 text-white hover:bg-amber-600'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {pause.signalsPaused ? '▶ Sigs' : '⏸ Sigs'}
                  </button>
                </div>
              </div>
            );
          }) : (
            <p className="text-xs text-gray-500">No accounts connected</p>
          )}
        </div>
      </Html>

      {/* Big Mitch sitting at his desk - no floating label in office */}
      <BigMitch position={[0, 0, 1.5]} isProcessing={false} lastDecision={undefined} hideLabel={true} />

      {/* Gaming chair with green accents */}
      <group position={[0, 0, 2.2]}>
        {/* Seat */}
        <RoundedBox args={[0.7, 0.12, 0.6]} position={[0, 0.5, 0]} radius={0.03}>
          <meshStandardMaterial color="#1a1a1a" />
        </RoundedBox>
        {/* Backrest */}
        <RoundedBox args={[0.65, 0.9, 0.12]} position={[0, 1, -0.25]} radius={0.04}>
          <meshStandardMaterial color="#1a1a1a" />
        </RoundedBox>
        {/* Green racing stripes */}
        <mesh position={[0.22, 1, -0.18]}>
          <planeGeometry args={[0.04, 0.7]} />
          <meshBasicMaterial color="#22c55e" />
        </mesh>
        <mesh position={[-0.22, 1, -0.18]}>
          <planeGeometry args={[0.04, 0.7]} />
          <meshBasicMaterial color="#22c55e" />
        </mesh>
        {/* Chair base */}
        <mesh position={[0, 0.25, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.25, 8]} />
          <meshStandardMaterial color="#333" />
        </mesh>
        <mesh position={[0, 0.1, 0]}>
          <cylinderGeometry args={[0.35, 0.35, 0.05, 16]} />
          <meshStandardMaterial color="#222" />
        </mesh>
      </group>

      {/* RGB LED strip under desk */}
      <mesh position={[0, 0.65, 0.85]}>
        <boxGeometry args={[7.5, 0.02, 0.02]} />
        <meshBasicMaterial color="#22c55e" />
      </mesh>

      {/* Exit button */}
      <Html position={[0, 0.5, 5]} center>
        <button
          onClick={onExit}
          className="px-8 py-3 bg-gray-900 hover:bg-gray-800 shadow-lg rounded-full text-sm font-semibold text-white transition-all"
        >
          Press ESC to exit
        </button>
      </Html>
    </group>
  );
}

// =============================================================================
// LOBBY - Big Mitch's Home
// =============================================================================

function Lobby({ onEnterRoom, stats, isProcessing, lastDecision, onInteract, doActivity, mitchTarget, mitchActivity }: {
  onEnterRoom: (room: string) => void;
  stats: { totalTrades: number; winRate: number; wins: number; losses: number; profitFactor: number };
  isProcessing: boolean;
  lastDecision?: string;
  onInteract: (itemName: string, position: [number, number, number], actions: { label: string; emoji: string; onClick: () => void }[]) => void;
  doActivity: (activity: string, mood: MitchState['mood'], statChanges: Partial<MitchState>, targetPos: [number, number, number]) => void;
  mitchTarget: [number, number, number] | null;
  mitchActivity: string;
}) {
  return (
    <group>
      <Lighting />
      <Floor />
      <Ceiling />

      {/* Walls with cartoon borders */}
      <Wall position={[0, 2.5, -12]} size={[24, 5, 0.1]} />
      <Wall position={[0, 2.5, 12]} size={[24, 5, 0.1]} />
      <Wall position={[-12, 2.5, 0]} rotation={[0, Math.PI / 2, 0]} size={[24, 5, 0.1]} />
      <Wall position={[12, 2.5, 0]} rotation={[0, Math.PI / 2, 0]} size={[24, 5, 0.1]} />

      {/* ===== WORLD'S BEST SIGN - Above stats ===== */}
      <WorldsBestSign position={[0, 4.2, -11.8]} />

      {/* ===== WANDERING BIG MITCH ===== */}
      <WanderingBigMitch
        isProcessing={isProcessing}
        lastDecision={lastDecision}
        targetOverride={mitchTarget}
        currentActivity={mitchActivity}
      />

      {/* ===== GARAGE AREA - Left side ===== */}
      <InteractiveObject
        name="Lambo"
        position={[-8, 0, 5]}
        glowColor="#22c55e"
        onInteract={() => onInteract('Lambo', [-8, 1.5, 5], [
          { label: 'Take for a spin', emoji: '🏎️', onClick: () => doActivity('Cruising the Lambo', 'celebrating', { confidence: 90, energy: 80 }, [-8, 0, 5]) },
          { label: 'Admire the whip', emoji: '👀', onClick: () => doActivity('Admiring the Lambo', 'relaxing', { confidence: 85 }, [-8, 0, 5]) },
          { label: 'Rev the engine', emoji: '🔊', onClick: () => doActivity('Revving the engine', 'celebrating', { confidence: 88, energy: 75 }, [-8, 0, 5]) },
        ])}
      >
        <SportsCar position={[0, 0, 0]} rotation={[0, Math.PI / 3, 0]} color="#22c55e" />
      </InteractiveObject>
      <InteractiveObject
        name="Motorbike"
        position={[-9, 0, 8]}
        glowColor="#ef4444"
        onInteract={() => onInteract('Motorbike', [-9, 1.5, 8], [
          { label: 'Ride around the block', emoji: '🏍️', onClick: () => doActivity('Riding the bike', 'celebrating', { confidence: 82, energy: 70 }, [-9, 0, 8]) },
          { label: 'Check the pipes', emoji: '🔧', onClick: () => doActivity('Checking the bike', 'relaxing', { focus: 72 }, [-9, 0, 8]) },
        ])}
      >
        <Motorbike position={[0, 0, 0]} rotation={[0, Math.PI / 4, 0]} />
      </InteractiveObject>

      {/* ===== LIVING AREA - Center ===== */}
      <Rug position={[0, 0, 0]} />
      <InteractiveObject
        name="Couch"
        position={[-4, 0, -1]}
        glowColor="#a855f7"
        onInteract={() => onInteract('Couch', [-4, 1.5, -1], [
          { label: 'Chill for a bit', emoji: '🛋️', onClick: () => doActivity('Chilling on the couch', 'relaxing', { energy: 92, focus: 65 }, [-4, 0, -1]) },
          { label: 'Power nap', emoji: '😴', onClick: () => doActivity('Power napping', 'sleeping', { energy: 100, focus: 50 }, [-4, 0, -1]) },
          { label: 'Watch the charts', emoji: '📊', onClick: () => doActivity('Watching charts on couch', 'analyzing', { focus: 82, energy: 78 }, [-4, 0, -1]) },
        ])}
      >
        <Couch position={[0, 0, 0]} rotation={[0, Math.PI, 0]} />
      </InteractiveObject>
      <CoffeeTable position={[-4, 0, -2.5]} />
      {/* TV on entertainment unit against wall */}
      <InteractiveObject
        name="TV Setup"
        position={[-4, 0, -5]}
        glowColor="#3b82f6"
        onInteract={() => onInteract('TV Setup', [-4, 2, -5], [
          { label: 'Watch charts', emoji: '📈', onClick: () => doActivity('Watching live charts', 'analyzing', { focus: 88, energy: 72 }, [-4, 0, -4]) },
          { label: 'Watch highlights', emoji: '🎬', onClick: () => doActivity('Watching trade highlights', 'relaxing', { confidence: 80, energy: 85 }, [-4, 0, -4]) },
          { label: 'Background vibes', emoji: '🎵', onClick: () => doActivity('Vibing with music', 'relaxing', { energy: 90, focus: 60 }, [-4, 0, -4]) },
        ])}
      >
        <group>
          {/* TV Stand/Entertainment unit */}
          <RoundedBox args={[3, 0.6, 0.5]} position={[0, 0.3, 0]} radius={0.02}>
            <meshStandardMaterial color="#1a1a1a" />
          </RoundedBox>
          <FlatScreenTV position={[0, 1.5, 0]} rotation={[0, 0, 0]} />
        </group>
      </InteractiveObject>

      {/* ===== LOUNGE AREA - Right side ===== */}
      <InteractiveObject
        name="Mini Bar"
        position={[9, 0, 5]}
        glowColor="#eab308"
        onInteract={() => onInteract('Mini Bar', [9, 1.5, 5], [
          { label: 'Pour a drink', emoji: '🥃', onClick: () => doActivity('Having a celebratory drink', 'celebrating', { confidence: 88, energy: 70, focus: 55 }, [9, 0, 5]) },
          { label: 'Mix something fancy', emoji: '🍸', onClick: () => doActivity('Mixing a cocktail', 'relaxing', { energy: 75, confidence: 82 }, [9, 0, 5]) },
          { label: 'Grab water', emoji: '💧', onClick: () => doActivity('Staying hydrated', 'grinding', { energy: 95, focus: 85 }, [9, 0, 5]) },
        ])}
      >
        <MiniBar position={[0, 0, 0]} />
      </InteractiveObject>

      {/* ===== TROPHY & DRIP CORNER - away from doors ===== */}
      <InteractiveObject
        name="Trophy Shelf"
        position={[3, 2.2, -11.7]}
        glowColor="#fbbf24"
        onInteract={() => onInteract('Trophy Shelf', [3, 3, -11.7], [
          { label: 'Admire achievements', emoji: '🏆', onClick: () => doActivity('Looking at trophies', 'celebrating', { confidence: 95 }, [3, 0, -10]) },
          { label: 'Polish the trophies', emoji: '✨', onClick: () => doActivity('Polishing trophies', 'relaxing', { confidence: 88, focus: 65 }, [3, 0, -10]) },
        ])}
      >
        <TrophyShelf position={[0, 0, 0]} />
      </InteractiveObject>
      <InteractiveObject
        name="Sneaker Collection"
        position={[5, 0.6, -9]}
        glowColor="#f97316"
        onInteract={() => onInteract('Sneaker Collection', [5, 1.5, -9], [
          { label: 'Check the drip', emoji: '👟', onClick: () => doActivity('Checking sneaker collection', 'relaxing', { confidence: 85 }, [5, 0, -9]) },
          { label: 'Pick a fresh pair', emoji: '🔥', onClick: () => doActivity('Picking new kicks', 'celebrating', { confidence: 92, energy: 88 }, [5, 0, -9]) },
        ])}
      >
        <SneakerDisplay position={[0, 0, 0]} />
      </InteractiveObject>
      <InteractiveObject
        name="Watch Case"
        position={[3, 1.1, -9]}
        glowColor="#a855f7"
        onInteract={() => onInteract('Watch Case', [3, 2, -9], [
          { label: 'Check the time', emoji: '⌚', onClick: () => doActivity('Checking the time', 'grinding', { focus: 78 }, [3, 0, -9]) },
          { label: 'Pick a piece', emoji: '💎', onClick: () => doActivity('Picking a watch', 'celebrating', { confidence: 90 }, [3, 0, -9]) },
        ])}
      >
        <WatchCase position={[0, 0, 0]} />
      </InteractiveObject>

      {/* ===== GAMING CORNER ===== */}
      <InteractiveObject
        name="Gaming Setup"
        position={[8, 0, 0]}
        glowColor="#22c55e"
        onInteract={() => onInteract('Gaming Setup', [8, 1.5, 0], [
          { label: 'Analyze charts', emoji: '📊', onClick: () => doActivity('Deep chart analysis', 'analyzing', { focus: 98, energy: 65 }, [8, 0, 0]) },
          { label: 'Review backtest', emoji: '🔬', onClick: () => doActivity('Reviewing backtests', 'analyzing', { focus: 95, confidence: 85 }, [8, 0, 0]) },
          { label: 'Monitor signals', emoji: '🎯', onClick: () => doActivity('Monitoring live signals', 'grinding', { focus: 92, energy: 70 }, [8, 0, 0]) },
          { label: 'Take a game break', emoji: '🎮', onClick: () => doActivity('Gaming break', 'relaxing', { energy: 88, focus: 50, confidence: 75 }, [8, 0, 0]) },
        ])}
      >
        <GamingSetup position={[0, 0, 0]} />
      </InteractiveObject>

      {/* ===== BEDROOM AREA - Back corner ===== */}
      <InteractiveObject
        name="Bed"
        position={[-9, 0, -9]}
        glowColor="#6366f1"
        onInteract={() => onInteract('Bed', [-9, 1.5, -9], [
          { label: 'Get some rest', emoji: '😴', onClick: () => doActivity('Sleeping', 'sleeping', { energy: 100, focus: 40 }, [-9, 0, -9]) },
          { label: 'Quick power nap', emoji: '⚡', onClick: () => doActivity('Power napping', 'sleeping', { energy: 90, focus: 55 }, [-9, 0, -9]) },
          { label: 'Meditate', emoji: '🧘', onClick: () => doActivity('Meditating', 'relaxing', { energy: 85, focus: 95, confidence: 80 }, [-9, 0, -9]) },
        ])}
      >
        <Bed position={[0, 0, 0]} rotation={[0, Math.PI / 4, 0]} />
      </InteractiveObject>

      {/* ===== ENTERTAINMENT AREA - Pool Table ===== */}
      <InteractiveObject
        name="Pool Table"
        position={[4, 0, 7]}
        glowColor="#166534"
        onInteract={() => onInteract('Pool Table', [4, 1.5, 7], [
          { label: 'Practice shots', emoji: '🎱', onClick: () => doActivity('Practicing pool', 'relaxing', { focus: 75, energy: 82 }, [4, 0, 7]) },
          { label: 'Play a round', emoji: '🏆', onClick: () => doActivity('Playing pool', 'relaxing', { confidence: 78, energy: 75 }, [4, 0, 7]) },
        ])}
      >
        <PoolTable position={[0, 0, 0]} rotation={[0, Math.PI / 2, 0]} />
      </InteractiveObject>

      {/* ===== CHILL ZONE - Vinyl + Books ===== */}
      <InteractiveObject
        name="Vinyl Setup"
        position={[6, 0, -7]}
        glowColor="#22c55e"
        onInteract={() => onInteract('Vinyl Setup', [6, 1.5, -7], [
          { label: 'Spin some records', emoji: '🎵', onClick: () => doActivity('Spinning vinyl', 'relaxing', { energy: 88, focus: 65 }, [6, 0, -7]) },
          { label: 'Browse the collection', emoji: '💿', onClick: () => doActivity('Browsing records', 'relaxing', { confidence: 75, focus: 70 }, [6, 0, -7]) },
        ])}
      >
        <VinylSetup position={[0, 0, 0]} rotation={[0, Math.PI, 0]} />
      </InteractiveObject>
      <Bookshelf position={[-6, 0, 7]} rotation={[0, 0, 0]} />

      {/* ===== ARCADE CORNER ===== */}
      <InteractiveObject
        name="Arcade Game"
        position={[10, 0, 8]}
        glowColor="#22c55e"
        onInteract={() => onInteract('Arcade Game', [10, 2, 8], [
          { label: 'Play TRADER', emoji: '🕹️', onClick: () => doActivity('Playing arcade', 'relaxing', { energy: 80, focus: 60, confidence: 72 }, [10, 0, 8]) },
          { label: 'Beat high score', emoji: '🏆', onClick: () => doActivity('Going for high score', 'grinding', { focus: 85, confidence: 80 }, [10, 0, 8]) },
        ])}
      >
        <ArcadeGame position={[0, 0, 0]} rotation={[0, -Math.PI / 2, 0]} />
      </InteractiveObject>

      {/* ===== BEDROOM DETAILS ===== */}
      <Mirror position={[-11.85, 1.8, -5]} rotation={[0, Math.PI / 2, 0]} />

      {/* ===== PLANTS for life ===== */}
      <Plant position={[-10, 0, -10]} />
      <Plant position={[10, 0, -10]} />
      <Plant position={[-10, 0, 10]} />
      <Plant position={[10, 0, 10]} />
      <Plant position={[5, 0, 5]} />
      <Plant position={[-6, 0, -3]} />

      {/* ===== QUOTE PAINTINGS - Properly mounted on walls ===== */}
      {/* Left wall - rotate to face into room (+X) */}
      <QuotePainting
        position={[-11.85, 2.5, 0]}
        rotation={[0, Math.PI / 2, 0]}
        quote="The market pays you to be patient"
        author="Big Mitch"
        accent="#22c55e"
      />
      <QuotePainting
        position={[-11.85, 2.5, -7]}
        rotation={[0, Math.PI / 2, 0]}
        quote="Risk small, win big"
        author="The Algorithm"
        accent="#3b82f6"
      />
      {/* Right wall - rotate to face into room (-X) */}
      <QuotePainting
        position={[11.85, 2.5, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        quote="67% confidence. 100% execution"
        author="ML Engine"
        accent="#eab308"
      />
      <QuotePainting
        position={[11.85, 2.5, 7]}
        rotation={[0, -Math.PI / 2, 0]}
        quote="Trust the backtest"
        author="14 Years of Data"
        accent="#a855f7"
      />

      {/* ===== NEON VIBES - Properly mounted on walls ===== */}
      {/* Left wall - rotate to face into room (+X) */}
      <NeonSign position={[-11.85, 3.8, -7]} rotation={[0, Math.PI / 2, 0]} text="FUNDED" color="#22c55e" />
      <NeonSign position={[-11.85, 3.8, 7]} rotation={[0, Math.PI / 2, 0]} text="SEND IT" color="#22c55e" />
      {/* Right wall - rotate to face into room (-X) */}
      <NeonSign position={[11.85, 3.8, -7]} rotation={[0, -Math.PI / 2, 0]} text="PATIENCE" color="#eab308" />
      <NeonSign position={[11.85, 3.8, 7]} rotation={[0, -Math.PI / 2, 0]} text="GG" color="#a855f7" />
      {/* Front wall neon - welcomes visitors */}
      <NeonSign position={[0, 4.2, 11.85]} rotation={[0, Math.PI, 0]} text="BIG MITCH" color="#22c55e" />

      {/* Stats panel - LARGER TEXT - BLACK TEXT NOT GREY */}
      <Panel position={[0, 2.8, -5]} size={[7, 1.8]} accent="#16a34a">
        <Text fontSize={0.1} color="#1d1d1f" anchorX="center" position={[0, 0.7, 0.02]} letterSpacing={0.12} fontWeight="bold">
          LIVE PERFORMANCE
        </Text>

        <group position={[-2.8, 0.1, 0.02]}>
          <Text fontSize={0.08} color="#374151" anchorX="left" fontWeight="bold">Trades</Text>
          <Text fontSize={0.26} color="#1d1d1f" anchorX="left" position={[0, -0.25, 0]} fontWeight="bold">{stats.totalTrades}</Text>
        </group>

        <group position={[-1.1, 0.1, 0.02]}>
          <Text fontSize={0.08} color="#374151" anchorX="left" fontWeight="bold">Win Rate</Text>
          <Text fontSize={0.26} color="#16a34a" anchorX="left" position={[0, -0.25, 0]} fontWeight="bold">{stats.winRate.toFixed(1)}%</Text>
        </group>

        <group position={[0.7, 0.1, 0.02]}>
          <Text fontSize={0.08} color="#374151" anchorX="left" fontWeight="bold">W / L</Text>
          <Text fontSize={0.26} color="#1d1d1f" anchorX="left" position={[0, -0.25, 0]} fontWeight="bold">{stats.wins} / {stats.losses}</Text>
        </group>

        <group position={[2.4, 0.1, 0.02]}>
          <Text fontSize={0.08} color="#374151" anchorX="left" fontWeight="bold">PF</Text>
          <Text fontSize={0.26} color={stats.profitFactor >= 1.25 ? "#16a34a" : "#d97706"} anchorX="left" position={[0, -0.25, 0]} fontWeight="bold">
            {stats.profitFactor.toFixed(2)}x
          </Text>
        </group>
      </Panel>

      {/* ===== ROOMS ON WALLS - Like a real home ===== */}
      {/* Back wall rooms */}
      <Door position={[-8, 0, -11.9]} rotation={[0, 0, 0]} roomKey="gate" onEnter={() => onEnterRoom('gate')} />
      <Door position={[8, 0, -11.9]} rotation={[0, 0, 0]} roomKey="achievements" onEnter={() => onEnterRoom('achievements')} />

      {/* Left wall rooms */}
      <Door position={[-11.9, 0, -3]} rotation={[0, Math.PI / 2, 0]} roomKey="patterns" onEnter={() => onEnterRoom('patterns')} />
      <Door position={[-11.9, 0, 3]} rotation={[0, Math.PI / 2, 0]} roomKey="ml" onEnter={() => onEnterRoom('ml')} />

      {/* Right wall rooms */}
      <Door position={[11.9, 0, -3]} rotation={[0, -Math.PI / 2, 0]} roomKey="technical" onEnter={() => onEnterRoom('technical')} />
      <Door position={[11.9, 0, 3]} rotation={[0, -Math.PI / 2, 0]} roomKey="time" onEnter={() => onEnterRoom('time')} />

      {/* Front wall - Command Center (main office) */}
      <Door position={[0, 0, 11.9]} rotation={[0, Math.PI, 0]} roomKey="office" onEnter={() => onEnterRoom('office')} />
    </group>
  );
}

// =============================================================================
// CONTROLLER
// =============================================================================

function Controller({ locked, onEscape }: { locked?: boolean; onEscape?: () => void }) {
  const { camera, gl } = useThree();
  const velocity = useRef(new THREE.Vector3());
  const moveState = useRef({ forward: false, backward: false, left: false, right: false });
  const isLocked = useRef(false);
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));

  useEffect(() => {
    if (!locked) camera.position.set(0, 1.7, 9);

    const onKeyDown = (e: KeyboardEvent) => {
      if (locked) {
        if (e.code === 'Escape' && onEscape) onEscape();
        return;
      }
      if (e.code === 'KeyW' || e.code === 'ArrowUp') moveState.current.forward = true;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') moveState.current.backward = true;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') moveState.current.left = true;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') moveState.current.right = true;
      if (e.code === 'Escape' && onEscape) onEscape();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyW' || e.code === 'ArrowUp') moveState.current.forward = false;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') moveState.current.backward = false;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') moveState.current.left = false;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') moveState.current.right = false;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isLocked.current || locked) return;
      euler.current.setFromQuaternion(camera.quaternion);
      euler.current.y -= e.movementX * 0.002;
      euler.current.x -= e.movementY * 0.002;
      euler.current.x = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, euler.current.x));
      camera.quaternion.setFromEuler(euler.current);
    };

    const onPointerLockChange = () => { isLocked.current = document.pointerLockElement === gl.domElement; };
    const onClick = () => { if (!locked) gl.domElement.requestPointerLock(); };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    gl.domElement.addEventListener('click', onClick);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      gl.domElement.removeEventListener('click', onClick);
    };
  }, [camera, gl, locked, onEscape]);

  useFrame((_, delta) => {
    if (locked) return;
    const speed = 5;
    const { forward, backward, left, right } = moveState.current;

    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();

    const rightDir = new THREE.Vector3();
    rightDir.crossVectors(dir, new THREE.Vector3(0, 1, 0));

    const target = new THREE.Vector3();
    if (forward) target.add(dir);
    if (backward) target.sub(dir);
    if (right) target.add(rightDir);
    if (left) target.sub(rightDir);
    if (target.length() > 0) target.normalize().multiplyScalar(speed);

    velocity.current.lerp(target, 1 - Math.exp(-10 * delta));
    camera.position.addScaledVector(velocity.current, delta);
    camera.position.y = 1.7;
  });

  return null;
}

// =============================================================================
// MAIN
// =============================================================================

function BigMitchWorldInner() {
  const { botTrades, botAccounts } = useBots();
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [mlSignals, setMlSignals] = useState<MLSignal[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastDecision, setLastDecision] = useState<string>();
  const [accountPauses, setAccountPauses] = useState<AccountPauseState>({});

  // Big Mitch state - Sims style
  const [mitchState, setMitchState] = useState<MitchState>({
    energy: 85,
    focus: 70,
    confidence: 75,
    wealth: 0,
    mood: 'grinding',
    currentActivity: 'Patrolling the crib'
  });

  // Action menu state
  const [actionMenu, setActionMenu] = useState<{
    isOpen: boolean;
    position: [number, number, number];
    itemName: string;
    actions: { label: string; emoji: string; onClick: () => void }[];
  }>({
    isOpen: false,
    position: [0, 0, 0],
    itemName: '',
    actions: []
  });

  // Big Mitch movement target (for walking to objects)
  const [mitchTarget, setMitchTarget] = useState<[number, number, number] | null>(null);
  const activityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mitch interaction handlers
  const handleInteraction = useCallback((itemName: string, position: [number, number, number], actions: { label: string; emoji: string; onClick: () => void }[]) => {
    setActionMenu({ isOpen: true, position, itemName, actions });
  }, []);

  const closeActionMenu = useCallback(() => {
    setActionMenu(prev => ({ ...prev, isOpen: false }));
  }, []);

  // Update Mitch's mood/activity based on actions + make him walk there
  const doActivity = useCallback((activity: string, mood: MitchState['mood'], statChanges: Partial<MitchState>, targetPos: [number, number, number]) => {
    // Clear any existing timeout
    if (activityTimeoutRef.current) {
      clearTimeout(activityTimeoutRef.current);
    }

    // Set Big Mitch's target to walk to
    setMitchTarget(targetPos);

    // Update state
    setMitchState(prev => ({
      ...prev,
      ...statChanges,
      mood,
      currentActivity: activity,
      energy: Math.min(100, Math.max(0, (statChanges.energy !== undefined ? statChanges.energy : prev.energy))),
      focus: Math.min(100, Math.max(0, (statChanges.focus !== undefined ? statChanges.focus : prev.focus))),
      confidence: Math.min(100, Math.max(0, (statChanges.confidence !== undefined ? statChanges.confidence : prev.confidence))),
    }));

    // Close action menu
    setActionMenu(prev => ({ ...prev, isOpen: false }));

    // After activity time, return to patrolling
    activityTimeoutRef.current = setTimeout(() => {
      setMitchTarget(null);
      setMitchState(prev => ({
        ...prev,
        mood: 'grinding',
        currentActivity: 'Patrolling the crib'
      }));
    }, 8000); // 8 seconds doing the activity
  }, []);

  const handleTogglePause = useCallback((accountId: string, type: 'day' | 'signals') => {
    setAccountPauses(prev => {
      const current = prev[accountId] || { pausedForDay: false, signalsPaused: false };
      return {
        ...prev,
        [accountId]: {
          ...current,
          pausedForDay: type === 'day' ? !current.pausedForDay : current.pausedForDay,
          signalsPaused: type === 'signals' ? !current.signalsPaused : current.signalsPaused,
        }
      };
    });
  }, []);

  const stats = useMemo(() => {
    const closed = botTrades.filter(t => t.status === 'closed');
    const wins = closed.filter(t => (t.pnl || 0) > 0).length;
    const losses = closed.filter(t => (t.pnl || 0) < 0).length;
    const grossProfit = closed.filter(t => (t.pnl || 0) > 0).reduce((s, t) => s + (t.pnl || 0), 0);
    const grossLoss = Math.abs(closed.filter(t => (t.pnl || 0) < 0).reduce((s, t) => s + (t.pnl || 0), 0));
    const totalPnl = closed.reduce((s, t) => s + (t.pnl || 0), 0);
    return {
      totalTrades: closed.length,
      winRate: closed.length > 0 ? (wins / closed.length) * 100 : 0,
      wins,
      losses,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0,
      totalPnl
    };
  }, [botTrades]);

  const accounts = useMemo(() => {
    return botAccounts.map(a => ({
      id: a.id,
      name: a.account_name,
      balance: a.current_balance ?? 0,
      status: a.status,
      totalPnl: a.total_pnl ?? 0
    }));
  }, [botAccounts]);

  // Update Mitch's wealth and confidence from real stats
  useEffect(() => {
    setMitchState(prev => ({
      ...prev,
      wealth: stats.totalPnl,
      confidence: Math.min(100, Math.max(20, Math.round(stats.winRate + (stats.profitFactor > 1.5 ? 10 : 0))))
    }));
  }, [stats.totalPnl, stats.winRate, stats.profitFactor]);

  useEffect(() => {
    let mounted = true;
    const fetchSignals = async () => {
      try {
        const { data } = await supabase.from('ml_signals').select('*').order('timestamp', { ascending: false }).limit(50);
        if (data && mounted) {
          setMlSignals(data.map(d => ({
            id: d.id, timestamp: d.timestamp, instrument: d.instrument || '', direction: d.direction || '',
            ml_confidence: d.ml_confidence || 0, final_decision: d.final_decision || '', outcome: d.outcome
          })));
        }
      } catch (e) { /* ignore */ }
    };
    fetchSignals();

    const channel = supabase.channel('ml_signals_live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ml_signals' }, (payload) => {
        if (!mounted) return;
        const n = payload.new as any;
        setIsProcessing(true);
        setTimeout(() => {
          if (!mounted) return;
          setMlSignals(prev => [{
            id: n.id, timestamp: n.timestamp, instrument: n.instrument || '', direction: n.direction || '',
            ml_confidence: n.ml_confidence || 0, final_decision: n.final_decision || '', outcome: n.outcome
          }, ...prev].slice(0, 50));
          setLastDecision(n.final_decision);
          setIsProcessing(false);
        }, 1500);
      }).subscribe();

    return () => { mounted = false; supabase.removeChannel(channel); };
  }, []);

  const handleExit = useCallback(() => setCurrentRoom(null), []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.code === 'Escape' && currentRoom) setCurrentRoom(null); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [currentRoom]);

  const isInRoom = currentRoom !== null;

  return (
    <div style={{ width: '100vw', height: '100vh', background: COLORS.bg }}>
      {!isStarted && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center cursor-pointer"
          style={{ background: COLORS.bg }}
          onClick={() => setIsStarted(true)}
        >
          <div className="text-center max-w-lg px-6">
            <div className="w-28 h-28 mx-auto mb-8 rounded-full bg-gradient-to-br from-green-600/20 to-green-600/5 border-2 border-green-600/30 flex items-center justify-center">
              <span className="text-green-600 text-5xl font-bold">M</span>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-3">Big Mitch's World</h1>
            <p className="text-gray-600 text-lg mb-2">ML Signal Processing Center</p>
            <div className="flex items-center justify-center gap-3 text-sm text-gray-500 mb-8">
              <span className="px-3 py-1 bg-gray-100 rounded-full">30 Features</span>
              <span className="px-3 py-1 bg-green-50 text-green-700 rounded-full font-medium">67% Win Rate</span>
              <span className="px-3 py-1 bg-gray-100 rounded-full">14 Years</span>
            </div>
            <p className="text-gray-400 text-sm mb-10">
              Explore rooms for Gate Checks, Technical Analysis, Key Levels, Temporal Features, and ML Decisions
            </p>
            <div className="inline-block px-10 py-4 bg-gray-900 hover:bg-gray-800 shadow-lg rounded-full text-white text-sm font-medium transition-all">
              Click to Enter
            </div>
          </div>
        </div>
      )}

      <Canvas camera={{ fov: 60, near: 0.1, far: 100 }} gl={{ antialias: true }} dpr={[1, 2]}>
        <color attach="background" args={[COLORS.bg]} />
        <fog attach="fog" args={[COLORS.bg, 15, 50]} />

        {isStarted && <Controller locked={isInRoom} onEscape={isInRoom ? handleExit : undefined} />}

        {currentRoom === 'office' ? (
          <MitchOffice stats={stats} accounts={accounts} signals={mlSignals} onExit={handleExit} accountPauses={accountPauses} onTogglePause={handleTogglePause} />
        ) : currentRoom && currentRoom in ROOM_DATA ? (
          <RoomView roomKey={currentRoom as RoomKey} onExit={handleExit} />
        ) : (
          <Lobby
            onEnterRoom={setCurrentRoom}
            stats={stats}
            isProcessing={isProcessing}
            lastDecision={lastDecision}
            onInteract={handleInteraction}
            doActivity={doActivity}
            mitchTarget={mitchTarget}
            mitchActivity={mitchState.currentActivity}
          />
        )}

        {/* Action Menu (rendered in 3D space) */}
        <ActionMenu
          isOpen={actionMenu.isOpen}
          position={actionMenu.position}
          itemName={actionMenu.itemName}
          actions={actionMenu.actions}
          onClose={closeActionMenu}
        />
      </Canvas>

      {/* Status HUD - Only in lobby */}
      <StatusHUD mitchState={mitchState} isVisible={isStarted && !currentRoom} />

      {/* Minimap - Only in lobby */}
      <Minimap isVisible={isStarted && !currentRoom} />

      {isStarted && (
        <>
          {currentRoom && (
            <div className="fixed top-6 right-6 z-50 text-right">
              <p className="text-gray-400 text-xs tracking-widest mb-1">
                {ROOM_DATA[currentRoom as RoomKey]?.subtitle.toUpperCase()}
              </p>
              <p className="text-gray-900 text-base font-semibold">
                {ROOM_DATA[currentRoom as RoomKey]?.name}
              </p>
            </div>
          )}

          {isProcessing && (
            <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2 bg-amber-50 border border-amber-200 rounded-full shadow-sm">
              <span className="text-amber-700 text-sm font-medium">Processing Signal...</span>
            </div>
          )}

          {!currentRoom && (
            <div className="fixed bottom-6 right-6 z-50 px-4 py-2 bg-white/80 backdrop-blur rounded-lg shadow-sm border border-gray-100">
              <p className="text-gray-400 text-xs mb-0.5">LIVE</p>
              <p className="text-gray-700 text-sm font-medium">
                {stats.totalTrades} trades • {stats.winRate.toFixed(0)}% WR
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function BigMitchOffice() {
  return <BigMitchWorldInner />;
}
