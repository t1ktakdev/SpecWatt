/**
 * Rooms & Spaces — vector room artwork.
 *
 * Hand-drawn react-native-svg scenes in the Warm Graphite palette: graphite
 * surfaces, one peach light source per scene, thin rounded strokes matching
 * the app icon set. Pure vectors — no bitmaps — so scenes scale crisply on
 * any density. `RoomArtwork` renders by `RoomArt` id; `RoomsHero` is the
 * empty-state illustration.
 */

import React from "react";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import type { RoomArt } from "./model";
import { theme } from "../../specwatt/theme";

const W = 320;
const H = 200;

const wall = "#2A2D26";
const wallDeep = "#24271F";
const floor = "#33362E";
const furniture = "#3A3D34";
const furnitureDark = "#2F322A";
const outline = "#4A4E44";
const soft = "#55594D";
const glow = theme.peach;

function Backdrop({ children }: { children: React.ReactNode }) {
  // A plain <G>: scenes render inside the host <Svg> of RoomArtwork, never
  // as a nested <Svg> (react-native-svg does not support that).
  return (
    <G>
      <Rect x={0} y={0} width={W} height={H} rx={0} fill={wall} />
      <Rect x={0} y={0} width={W} height={86} fill={wallDeep} opacity={0.55} />
      <Line x1={0} y1={152} x2={W} y2={152} stroke={outline} strokeWidth={1.4} />
      <Rect x={0} y={152} width={W} height={H - 152} fill={floor} opacity={0.5} />
      {children}
    </G>
  );
}

function Glow({ cx, cy, r, id }: { cx: number; cy: number; r: number; id: string }) {
  return (
    <>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={glow} stopOpacity={0.5} />
          <Stop offset="55%" stopColor={glow} stopOpacity={0.16} />
          <Stop offset="100%" stopColor={glow} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={cx} cy={cy} r={r} fill={`url(#${id})`} />
    </>
  );
}

function Living() {
  return (
    <Backdrop>
      <Glow cx={62} cy={92} r={64} id="g-living" />
      {/* window */}
      <Rect x={196} y={26} width={92} height={72} rx={8} fill={wallDeep} stroke={outline} strokeWidth={1.6} />
      <Line x1={242} y1={26} x2={242} y2={98} stroke={outline} strokeWidth={1.4} />
      <Circle cx={222} cy={50} r={9} fill={glow} opacity={0.85} />
      <Path d="M204 82q14-10 28 0t28 0" stroke={soft} strokeWidth={1.6} fill="none" strokeLinecap="round" />
      {/* floor lamp */}
      <Line x1={62} y1={64} x2={62} y2={150} stroke={outline} strokeWidth={2} strokeLinecap="round" />
      <Path d="M44 64h36l-7-18H51Z" fill={furniture} stroke={outline} strokeWidth={1.6} strokeLinejoin="round" />
      <Circle cx={62} cy={54} r={5} fill={glow} />
      <Line x1={50} y1={152} x2={74} y2={152} stroke={outline} strokeWidth={2.4} strokeLinecap="round" />
      {/* sofa */}
      <Rect x={104} y={96} width={132} height={40} rx={10} fill={furniture} stroke={outline} strokeWidth={1.6} />
      <Rect x={96} y={84} width={20} height={52} rx={9} fill={furnitureDark} stroke={outline} strokeWidth={1.6} />
      <Rect x={224} y={84} width={20} height={52} rx={9} fill={furnitureDark} stroke={outline} strokeWidth={1.6} />
      <Rect x={116} y={88} width={48} height={22} rx={8} fill={furnitureDark} stroke={outline} strokeWidth={1.3} />
      <Rect x={172} y={88} width={48} height={22} rx={8} fill={furnitureDark} stroke={outline} strokeWidth={1.3} />
      <Rect x={108} y={136} width={10} height={16} rx={3} fill={furnitureDark} />
      <Rect x={222} y={136} width={10} height={16} rx={3} fill={furnitureDark} />
      {/* cushion accent */}
      <Rect x={196} y={90} width={20} height={20} rx={6} fill={glow} opacity={0.9} />
      {/* plant */}
      <Path d="M286 138c0-12 8-20 8-20s8 8 8 20Z" fill="#4E5A45" stroke={outline} strokeWidth={1.3} />
      <Rect x={284} y={138} width={20} height={14} rx={4} fill={furnitureDark} stroke={outline} strokeWidth={1.3} />
    </Backdrop>
  );
}

function Bedroom() {
  return (
    <Backdrop>
      <Glow cx={252} cy={64} r={58} id="g-bed" />
      {/* window */}
      <Rect x={34} y={24} width={78} height={64} rx={8} fill={wallDeep} stroke={outline} strokeWidth={1.6} />
      <Line x1={73} y1={24} x2={73} y2={88} stroke={outline} strokeWidth={1.4} />
      <Circle cx={56} cy={46} r={8} fill={glow} opacity={0.8} />
      <Circle cx={92} cy={70} r={2} fill={glow} />
      <Circle cx={48} cy={76} r={1.6} fill={glow} opacity={0.7} />
      {/* bed */}
      <Rect x={140} y={72} width={140} height={30} rx={10} fill={furnitureDark} stroke={outline} strokeWidth={1.6} />
      <Rect x={132} y={98} width={156} height={40} rx={9} fill={furniture} stroke={outline} strokeWidth={1.6} />
      <Rect x={148} y={82} width={34} height={18} rx={7} fill="#3D4036" stroke={outline} strokeWidth={1.3} />
      <Rect x={188} y={82} width={34} height={18} rx={7} fill="#3D4036" stroke={outline} strokeWidth={1.3} />
      <Rect x={132} y={106} width={156} height={12} rx={6} fill={glow} opacity={0.32} />
      <Rect x={140} y={138} width={10} height={14} rx={3} fill={furnitureDark} />
      <Rect x={270} y={138} width={10} height={14} rx={3} fill={furnitureDark} />
      {/* bedside lamp */}
      <Rect x={104} y={118} width={22} height={34} rx={5} fill={furnitureDark} stroke={outline} strokeWidth={1.4} />
      <Line x1={115} y1={104} x2={115} y2={118} stroke={outline} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={115} cy={99} r={7} fill={glow} />
      <Path d="M104 99a11 11 0 0 1 22 0Z" fill={furniture} stroke={outline} strokeWidth={1.4} strokeLinejoin="round" />
    </Backdrop>
  );
}

function Kitchen() {
  return (
    <Backdrop>
      <Glow cx={110} cy={54} r={56} id="g-kitchen" />
      {/* cabinets */}
      <Rect x={186} y={26} width={104} height={40} rx={6} fill={furnitureDark} stroke={outline} strokeWidth={1.6} />
      <Line x1={221} y1={26} x2={221} y2={66} stroke={outline} strokeWidth={1.3} />
      <Line x1={256} y1={26} x2={256} y2={66} stroke={outline} strokeWidth={1.3} />
      {/* hood + counter */}
      <Rect x={196} y={92} width={56} height={12} rx={4} fill={furniture} stroke={outline} strokeWidth={1.4} />
      <Rect x={182} y={120} width={110} height={32} rx={6} fill={furniture} stroke={outline} strokeWidth={1.6} />
      <Rect x={196} y={126} width={34} height={20} rx={4} fill={wallDeep} stroke={outline} strokeWidth={1.3} />
      <Circle cx={252} cy={136} r={7} fill={wallDeep} stroke={outline} strokeWidth={1.3} />
      <Line x1={182} y1={152} x2={292} y2={152} stroke={outline} strokeWidth={1.2} opacity={0.6} />
      {/* pendants */}
      <Line x1={86} y1={26} x2={86} y2={58} stroke={outline} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M76 70a10 10 0 0 1 20 0Z" fill={furniture} stroke={outline} strokeWidth={1.5} strokeLinejoin="round" />
      <Circle cx={86} cy={73} r={3.4} fill={glow} />
      <Line x1={130} y1={26} x2={130} y2={44} stroke={outline} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M120 56a10 10 0 0 1 20 0Z" fill={furniture} stroke={outline} strokeWidth={1.5} strokeLinejoin="round" />
      <Circle cx={130} cy={59} r={3.4} fill={glow} />
      {/* table */}
      <Rect x={62} y={116} width={92} height={9} rx={4} fill={furniture} stroke={outline} strokeWidth={1.4} />
      <Line x1={74} y1={125} x2={74} y2={150} stroke={outline} strokeWidth={2} strokeLinecap="round" />
      <Line x1={142} y1={125} x2={142} y2={150} stroke={outline} strokeWidth={2} strokeLinecap="round" />
      <Rect x={96} y={106} width={18} height={10} rx={3} fill={furnitureDark} stroke={outline} strokeWidth={1.2} />
    </Backdrop>
  );
}

function Office() {
  return (
    <Backdrop>
      <Glow cx={160} cy={84} r={62} id="g-office" />
      {/* monitor */}
      <Rect x={122} y={62} width={76} height={50} rx={7} fill={wallDeep} stroke={outline} strokeWidth={1.7} />
      <Rect x={130} y={70} width={60} height={34} rx={4} fill={glow} opacity={0.75} />
      <Path d="M138 92l10-12 8 7 12-14" stroke="#22201D" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Line x1={160} y1={112} x2={160} y2={122} stroke={outline} strokeWidth={2.2} />
      <Line x1={146} y1={122} x2={174} y2={122} stroke={outline} strokeWidth={2.2} strokeLinecap="round" />
      {/* desk */}
      <Rect x={92} y={122} width={136} height={9} rx={4} fill={furniture} stroke={outline} strokeWidth={1.5} />
      <Rect x={102} y={131} width={9} height={21} rx={3} fill={furnitureDark} />
      <Rect x={208} y={131} width={9} height={21} rx={3} fill={furnitureDark} />
      {/* keyboard + mug */}
      <Rect x={122} y={112} width={44} height={7} rx={3} fill={furnitureDark} stroke={outline} strokeWidth={1.1} />
      <Rect x={196} y={108} width={12} height={13} rx={3} fill={furnitureDark} stroke={outline} strokeWidth={1.2} />
      {/* chair */}
      <Rect x={252} y={92} width={30} height={26} rx={8} fill={furnitureDark} stroke={outline} strokeWidth={1.5} />
      <Rect x={258} y={118} width={18} height={22} rx={6} fill={furniture} stroke={outline} strokeWidth={1.4} />
      <Line x1={267} y1={140} x2={267} y2={150} stroke={outline} strokeWidth={2} strokeLinecap="round" />
      <Line x1={253} y1={152} x2={281} y2={152} stroke={outline} strokeWidth={2.4} strokeLinecap="round" />
      {/* shelf */}
      <Rect x={30} y={44} width={58} height={7} rx={3} fill={furniture} stroke={outline} strokeWidth={1.3} />
      <Rect x={38} y={30} width={9} height={14} rx={2} fill={furnitureDark} />
      <Rect x={50} y={34} width={9} height={10} rx={2} fill={glow} opacity={0.85} />
      <Rect x={62} y={32} width={9} height={12} rx={2} fill={furnitureDark} />
    </Backdrop>
  );
}

function Bathroom() {
  return (
    <Backdrop>
      <Glow cx={72} cy={64} r={52} id="g-bath" />
      {/* tiles */}
      <Line x1={0} y1={54} x2={W} y2={54} stroke={outline} strokeWidth={1} opacity={0.4} />
      <Line x1={0} y1={98} x2={W} y2={98} stroke={outline} strokeWidth={1} opacity={0.4} />
      {/* shower */}
      <Path d="M44 34h18a12 12 0 0 1 12 12v6" stroke={outline} strokeWidth={2} fill="none" strokeLinecap="round" />
      <Rect x={62} y={50} width={16} height={7} rx={3} fill={furniture} stroke={outline} strokeWidth={1.3} />
      <Line x1={66} y1={62} x2={66} y2={68} stroke={glow} strokeWidth={1.6} strokeLinecap="round" />
      <Line x1={72} y1={64} x2={72} y2={72} stroke={glow} strokeWidth={1.6} strokeLinecap="round" />
      <Line x1={78} y1={62} x2={78} y2={68} stroke={glow} strokeWidth={1.6} strokeLinecap="round" />
      {/* mirror */}
      <Rect x={116} y={36} width={40} height={52} rx={20} fill={wallDeep} stroke={outline} strokeWidth={1.6} />
      <Path d="M126 46c6-4 14-4 20 2" stroke={soft} strokeWidth={1.4} fill="none" strokeLinecap="round" />
      {/* bathtub */}
      <Path d="M188 108h104v18a18 18 0 0 1-18 18h-68a18 18 0 0 1-18-18Z" fill={furniture} stroke={outline} strokeWidth={1.7} />
      <Rect x={192} y={100} width={96} height={10} rx={5} fill={wallDeep} stroke={outline} strokeWidth={1.4} />
      <Circle cx={206} cy={122} r={3} fill={glow} opacity={0.9} />
      <Circle cx={222} cy={126} r={2.2} fill={glow} opacity={0.7} />
      <Line x1={198} y1={144} x2={198} y2={151} stroke={outline} strokeWidth={2.2} strokeLinecap="round" />
      <Line x1={282} y1={144} x2={282} y2={151} stroke={outline} strokeWidth={2.2} strokeLinecap="round" />
      {/* towel */}
      <Rect x={36} y={112} width={26} height={34} rx={4} fill={furnitureDark} stroke={outline} strokeWidth={1.4} />
      <Rect x={42} y={112} width={7} height={34} fill={glow} opacity={0.4} />
    </Backdrop>
  );
}

function Hallway() {
  return (
    <Backdrop>
      <Glow cx={160} cy={44} r={54} id="g-hall" />
      {/* ceiling light */}
      <Line x1={160} y1={0} x2={160} y2={26} stroke={outline} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M146 40a14 14 0 0 1 28 0Z" fill={furniture} stroke={outline} strokeWidth={1.5} strokeLinejoin="round" />
      <Circle cx={160} cy={43} r={4} fill={glow} />
      {/* mirror */}
      <Rect x={36} y={44} width={44} height={70} rx={22} fill={wallDeep} stroke={outline} strokeWidth={1.6} />
      <Path d="M48 58c6-5 14-5 20 1" stroke={soft} strokeWidth={1.4} fill="none" strokeLinecap="round" />
      {/* coat rack */}
      <Rect x={216} y={30} width={7} height={122} rx={3} fill={furnitureDark} stroke={outline} strokeWidth={1.4} />
      <Line x1={196} y1={44} x2={243} y2={44} stroke={outline} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={200} cy={40} r={2.6} fill={glow} />
      <Circle cx={239} cy={40} r={2.6} fill={glow} />
      <Path d="M243 52c-12 0-16 8-16 22v30a6 6 0 0 0 6 6h20a6 6 0 0 0 6-6V74c0-14-4-22-16-22Z" fill={furniture} stroke={outline} strokeWidth={1.5} strokeLinejoin="round" />
      {/* console */}
      <Rect x={96} y={112} width={84} height={8} rx={4} fill={furniture} stroke={outline} strokeWidth={1.4} />
      <Line x1={106} y1={120} x2={106} y2={150} stroke={outline} strokeWidth={2} strokeLinecap="round" />
      <Line x1={170} y1={120} x2={170} y2={150} stroke={outline} strokeWidth={2} strokeLinecap="round" />
      {/* bowl */}
      <Path d="M124 106a14 7 0 0 0 28 0Z" fill={furnitureDark} stroke={outline} strokeWidth={1.3} />
      {/* shoes */}
      <Path d="M120 146h24v6h-24Z" fill={furnitureDark} />
      <Path d="M148 146h24v6h-24Z" fill={furnitureDark} />
    </Backdrop>
  );
}

function Loft() {
  return (
    <Backdrop>
      <Glow cx={238} cy={86} r={62} id="g-loft" />
      {/* grid window */}
      <Rect x={28} y={24} width={120} height={92} rx={8} fill={wallDeep} stroke={outline} strokeWidth={1.6} />
      <Line x1={68} y1={24} x2={68} y2={116} stroke={outline} strokeWidth={1.3} />
      <Line x1={108} y1={24} x2={108} y2={116} stroke={outline} strokeWidth={1.3} />
      <Line x1={28} y1={70} x2={148} y2={70} stroke={outline} strokeWidth={1.3} />
      <Circle cx={50} cy={48} r={7} fill={glow} opacity={0.8} />
      <Circle cx={124} cy={92} r={2} fill={glow} />
      {/* hanging bulb */}
      <Line x1={238} y1={0} x2={238} y2={62} stroke={outline} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={238} cy={76} r={13} fill={glow} opacity={0.9} />
      <Circle cx={238} cy={76} r={5} fill="#FFD9B8" />
      <Rect x={233} y={58} width={10} height={7} rx={2} fill={furnitureDark} stroke={outline} strokeWidth={1.2} />
      {/* boxes */}
      <Rect x={172} y={120} width={44} height={32} rx={4} fill={furniture} stroke={outline} strokeWidth={1.5} />
      <Rect x={180} y={98} width={36} height={22} rx={4} fill={furnitureDark} stroke={outline} strokeWidth={1.4} />
      <Line x1={172} y1={128} x2={216} y2={128} stroke={outline} strokeWidth={1} opacity={0.5} />
      {/* plant */}
      <Path d="M284 152c0-16 10-26 10-26s10 10 10 26" fill="none" stroke={soft} strokeWidth={1.6} strokeLinecap="round" />
      <Rect x={284} y={128} width={22} height={24} rx={5} fill={furnitureDark} stroke={outline} strokeWidth={1.4} />
    </Backdrop>
  );
}

function Corner() {
  return (
    <Backdrop>
      <Glow cx={252} cy={78} r={58} id="g-corner" />
      {/* armchair */}
      <Rect x={196} y={86} width={76} height={52} rx={12} fill={furniture} stroke={outline} strokeWidth={1.6} />
      <Rect x={188} y={76} width={20} height={62} rx={9} fill={furnitureDark} stroke={outline} strokeWidth={1.5} />
      <Rect x={196} y={92} width={56} height={20} rx={8} fill={furnitureDark} stroke={outline} strokeWidth={1.3} />
      <Rect x={200} y={96} width={18} height={16} rx={5} fill={glow} opacity={0.9} />
      <Rect x={204} y={138} width={9} height={14} rx={3} fill={furnitureDark} />
      <Rect x={262} y={138} width={9} height={14} rx={3} fill={furnitureDark} />
      {/* books */}
      <Rect x={128} y={140} width={12} height={12} rx={2} fill={furnitureDark} stroke={outline} strokeWidth={1.1} />
      <Rect x={141} y={136} width={12} height={16} rx={2} fill={furniture} stroke={outline} strokeWidth={1.1} />
      <Rect x={154} y={142} width={12} height={10} rx={2} fill={glow} opacity={0.85} />
      {/* floor lamp behind */}
      <Line x1={92} y1={58} x2={92} y2={150} stroke={outline} strokeWidth={2} strokeLinecap="round" />
      <Path d="M78 58h28l-6-16H84Z" fill={furniture} stroke={outline} strokeWidth={1.5} strokeLinejoin="round" />
      <Circle cx={92} cy={49} r={4.4} fill={glow} />
      {/* plant */}
      <Path d="M40 150c0-18 12-30 12-30s12 12 12 30" fill="none" stroke={soft} strokeWidth={1.6} strokeLinecap="round" />
      <Rect x={40} y={126} width={24} height={26} rx={5} fill={furnitureDark} stroke={outline} strokeWidth={1.4} />
    </Backdrop>
  );
}

const scenes: Record<RoomArt, () => React.JSX.Element> = {
  living: Living,
  bedroom: Bedroom,
  kitchen: Kitchen,
  office: Office,
  bathroom: Bathroom,
  hallway: Hallway,
  loft: Loft,
  corner: Corner,
};

export function RoomArtwork({
  art,
  radius = 16,
}: {
  art: RoomArt;
  radius?: number;
}) {
  const Scene = scenes[art] ?? Corner;
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        <RadialGradient id={`vignette-${art}`} cx="50%" cy="42%" r="75%">
          <Stop offset="0%" stopColor="#2E312A" stopOpacity={0} />
          <Stop offset="100%" stopColor="#151713" stopOpacity={0.55} />
        </RadialGradient>
      </Defs>
      <G>
        <Scene />
        <Rect width={W} height={H} fill={`url(#vignette-${art})`} rx={radius} />
      </G>
    </Svg>
  );
}

/** Empty-state illustration: a quiet room waiting for its first label. */
export function RoomsHero({ size = 210 }: { size?: number }) {
  return (
    <Svg width={size} height={size * (H / W)} viewBox={`0 0 ${W} ${H}`}>
      <Glow cx={160} cy={92} r={86} id="g-hero" />
      <Rect x={104} y={30} width={112} height={92} rx={12} fill={wallDeep} stroke={outline} strokeWidth={1.8} />
      <Line x1={160} y1={30} x2={160} y2={122} stroke={outline} strokeWidth={1.4} />
      <Circle cx={138} cy={60} r={9} fill={glow} opacity={0.85} />
      <Circle cx={184} cy={96} r={2.4} fill={glow} />
      <Rect x={128} y={132} width={64} height={20} rx={8} fill={furniture} stroke={outline} strokeWidth={1.6} />
      <Path d="M150 132v-8a10 10 0 0 1 20 0v8" stroke={outline} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <Circle cx={160} cy={116} r={7} fill={glow} />
      <Rect x={60} y={152} width={200} height={4} rx={2} fill={outline} opacity={0.6} />
    </Svg>
  );
}
