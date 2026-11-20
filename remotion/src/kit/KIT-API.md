# Motion-Graphic Studio Scene Kit API (`KIT-API.md`)

> Dihasilkan otomatis oleh `scripts/generate-kit-api.ts` dari tipe TypeScript & JSDoc di `remotion/src/kit/`.

## Contoh Singkat (Single Driver + Rakitan + HUD Zona)
```tsx
const crank = useDriver({ name: "crank_angle", from: 0, to: 720, unit: "°", durationSec: 16 });
<BlueprintStage palette="industrial-orange" telemetry={telemetry} hud={
  <HudLayout palette="industrial-orange">
    <HudZone zone="title"><KineticTitle title="Mesin 4 Tak" palette="industrial-orange" /></HudZone>
    <HudZone zone="callout"><StatCounter id="stat_crank_angle" label="Sudut" driver={crank} bindToDriver palette="industrial-orange" /></HudZone>
  </HudLayout>
}>
  <CameraRig mode="frameEntities" focusBox={{ center: [0, 1.45, 0], size: [1.7, 3.1, 1.7] }} />
  <PistonCrankAssembly entityId="piston_crank" crankAngleDeg={crank.value} palette="industrial-orange" />
</BlueprintStage>
```

## 3D Assemblies

### `CurvedRail`
Twin steel rails with sleepers supporting a straight entry seamlessly into a curved arc. Rail head top sits at world Y = 0.22 to match WheelsetOnRail contact geometry.
- **Signature:** `<CurvedRail ...CurvedRailProps />`
- **Props:**
  - `startZ?: number` — Straight approach start Z. Defaults to -10.
  - `curveStartZ?: number` — Z coordinate where the curve begins. Defaults to 2.
  - `curveRadius?: number` — Curve radius in scene units (> 0 curves toward +X). Defaults to 10.
  - `curveLength?: number` — Curve arc length. Defaults to 14.
  - `gauge?: number` — Track gauge (center-to-center of left and right rails). Defaults to 1.435.
  - `highlighted?: boolean` — Highlight rails.
  - `palette?: PaletteId` — Palette token ID.

### `PistonCrankAssembly`
4-stroke piston, connecting rod, crankshaft, enlarged intake/exhaust valves, spark plug, and driver-linked combustion chamber tint.
- **Signature:** `<PistonCrankAssembly ...PistonCrankAssemblyProps />`
- **Props:**
  - `entityId?: string` — Entity ID for telemetry and framing QC. Defaults to "piston_crank".
  - `role?: 'focus' | 'prop'` — Role in framing QC. Defaults to "focus".
  - `crankAngleDeg: number` — Crankshaft angle in degrees (0-720 for full 4-stroke cycle), from useDriver.
  - `crankRadius?: number` — Crank throw radius. Defaults to 0.55.
  - `rodLength?: number` — Connecting rod length. Defaults to 1.45.
  - `position?: [number, number, number]` — World-space position of crankshaft center. Defaults to [0, 0.25, 0].
  - `cutaway?: boolean` — Render cylinder sleeve as cutaway transparent glass. Defaults to true.
  - `overrideIntakeOpen?: boolean` — Optional override ONLY for mutation testing (simulates buggy time-driven valve).
  - `detachRodOffset?: [number, number, number]` — Optional rod offset ONLY for geometry mutation testing (detaches rod from crank pin).
  - `palette?: PaletteId` — Palette token ID.

### `Suspension`
Coil spring + telescopic damper anchored flush between an axle mount and an upper bogie frame.
- **Signature:** `<Suspension ...SuspensionProps />`
- **Props:**
  - `entityId?: string` — Entity ID for telemetry and framing QC. Defaults to "suspension".
  - `role?: 'focus' | 'prop'` — Role in framing QC. Defaults to "prop".
  - `position?: [number, number, number]` — World-space position of the lower axle mount.
  - `phaseRad?: number` — Oscillation phase in radians (from useDriver).
  - `restLength?: number` — Uncompressed spring height. Defaults to 0.75.
  - `amplitude?: number` — Stroke amplitude. Defaults to 0.14.
  - `palette?: PaletteId` — Palette token ID.

### `WheelsetOnRail`
Conical wheelset seated flush on twin Z-axis rail heads, with axle perpendicular to the track, inner flanges, and rotation derived strictly from distance.
- **Signature:** `<WheelsetOnRail ...WheelsetOnRailProps />`
- **Props:**
  - `entityId?: string` — Entity ID for telemetry and framing QC. Defaults to "wheelset".
  - `role?: 'focus' | 'prop'` — Role in framing QC. Defaults to "focus".
  - `distance?: number` — Linear travel distance along the Z-axis track (driven by useDriver).
  - `lateralShift?: number` — Lateral shift across the track (X-axis, > 0 shifts toward outer right rail).
  - `wheelRadius?: number` — Wheel tread radius in scene units. Defaults to 0.46.
  - `gauge?: number` — Track gauge (distance between left and right rail centers). Defaults to 1.435.
  - `coneRatio?: number` — Conical taper ratio (e.g. 0.05 for 1:20).
  - `taperExaggeration?: number` — Multiplier to exaggerate conical slope visually (e.g. 5).
  - `curveStartZ?: number` — Optional curve start Z and curve radius (>0 curves toward +X).
  - `curveRadius?: number`
  - `highlightContact?: boolean` — Highlight contact patches between wheel tread and rail head.
  - `showEffectiveDiameter?: boolean` — Show effective diameter rings on outer vs inner wheel.
  - `cutaway?: boolean` — Optional cutaway transparency on wheelset.
  - `liftY?: number` — Optional vertical lift (ONLY for geometry mutation testing).
  - `yawOffsetRad?: number` — Optional yaw offset in radians (ONLY for geometry mutation testing).
  - `palette?: PaletteId` — Palette token ID.

## Stage

### `BlueprintStage`
- **Signature:** `<BlueprintStage ...BlueprintStageProps />`
- **Props:**
  - `children: React.ReactNode`
  - `hud?: React.ReactNode`
  - `cameraPosition?: [number, number, number]`
  - `fov?: number`
  - `palette?: PaletteId`
  - `telemetry?: boolean`

## Camera

### `CameraRig`
- **Signature:** `<CameraRig ...CameraRigProps />`
- **Props:**
  - `mode: CameraMode`
  - `framing?: FramingPreset`
  - `startSec?: number`
  - `durationSec?: number`
  - `easing?: EasingMode`
  - `from?: [number, number, number]`
  - `to?: [number, number, number]`
  - `target?: [number, number, number]`
  - `targetFrom?: [number, number, number]`
  - `targetTo?: [number, number, number]`
  - `radius?: number`
  - `height?: number`
  - `startAngleDeg?: number`
  - `endAngleDeg?: number`
  - `fov?: number`
  - `focusBox?: FocusBox` — Used in mode="frameEntities": world bounding box to keep inside 9:16 safe zone.
  - `padding?: number` — Padding multiplier for frameEntities (>= 1.0). Defaults to 1.45.
  - `elevationDeg?: number` — Elevation angle in degrees for frameEntities. Defaults to 18.

## Drivers & Kinematics

### `computeWheelsetLayout`
Pure kinematic & geometric layout for WheelsetOnRail along a Z-axis straight or curved track. Computes world-space rail contact points, effective radii, and geometry constraints.
- **Signature:** `({ distance, lateralShift, wheelRadius, gauge, coneRatio, railHeadTopY, curveStartZ, curveRadius, liftY, yawOffsetRad, }: WheelsetLayoutInput) => WheelsetLayout`

### `computePistonCrankLayout`
Pure kinematic & geometric layout for PistonCrankAssembly.
- **Signature:** `(params: { crankAngleDeg: number; crankRadius?: number | undefined; rodLength?: number | undefined; position?: [number, number, number] | undefined; detachRodOffset?: [number, number, number] | undefined; }) => PistonCrankLayout`

### `gearRatioAngle`
Computes output gear angle in radians from input angle and tooth counts. Opposite sign represents meshing direction reversal.
- **Signature:** `(inputAngleRad: number, teethIn: number, teethOut: number) => number`

### `wheelAngleFromDistance`
Computes wheel rotation angle (radians) from linear travel distance and wheel radius. Negative sign rotates clockwise for +X forward motion around Z.
- **Signature:** `(distance: number, radius: number) => number`

### `wheelAngleDegFromDistance`
Computes wheel rotation angle in degrees from linear travel distance and wheel radius.
- **Signature:** `(distance: number, radius: number) => number`

### `springOscillation`
Computes spring length and normalized compression ratio [0, 1] from phase angle.
- **Signature:** `(phaseRad: number, restLength: number, amplitude: number) => { length: number; compressionRatio: number; }`

### `valveStateFromCrankAngle`
Derives 4-stroke intake/exhaust valve states, spark timing, and stroke phase purely from crankshaft angle in degrees (0-720 deg cycle).
- **Signature:** `(crankAngleDeg: number) => ValveCycleState`

### `formatIdNumber`
Formats numbers according to Indonesian locale (dots for thousands, commas for decimals).
- **Signature:** `(value: number, decimals?: number) => string`

### `useDriver`
Single-source driver hook. Derives a continuous physical quantity per frame and reports it to telemetry when enabled.
- **Signature:** `(config: DriverConfig) => DriverValue`

## Foreground & Parallax

### `ParallaxForeground`
Foreground parallax elements (trackside poles, depth markers, floating particles) that give 3D scenes spatial depth.
- **Signature:** `<ParallaxForeground ...ParallaxForegroundProps />`
- **Props:**
  - `distance?: number` — Travel distance (from useDriver) that scrolls foreground poles & markers past camera.
  - `poleSpacing?: number` — Spacing between foreground poles along X. Defaults to 4.5.
  - `poleCount?: number` — Number of pole pairs to render. Defaults to 5.
  - `zOffset?: number` — Z distance from track center. Defaults to 2.2.
  - `palette?: PaletteId` — Palette token ID.

## 3D Primitives

### `Group`
- **Signature:** `<Group ...GroupProps />`
- **Props:**
  - `position?: [number, number, number]`
  - `rotation?: [number, number, number]`
  - `scale?: [number, number, number] | number`
  - `children?: React.ReactNode`

### `Grid`
- **Signature:** `<Grid ...GridProps />`
- **Props:**
  - `size?: number`
  - `divisions?: number`
  - `position?: [number, number, number]`
  - `colorCenterLine?: string`
  - `colorGrid?: string`

### `Box`
- **Signature:** `<Box ...BoxProps />`
- **Props:**
  - `size?: [number, number, number]`

### `Cylinder`
- **Signature:** `<Cylinder ...CylinderProps />`
- **Props:**
  - `radiusTop?: number`
  - `radiusBottom?: number`
  - `height?: number`
  - `radialSegments?: number`
  - `openEnded?: boolean`
  - `thetaStart?: number`
  - `thetaLength?: number`

### `Sphere`
- **Signature:** `<Sphere ...SphereProps />`
- **Props:**
  - `radius?: number`
  - `widthSegments?: number`
  - `heightSegments?: number`

### `Torus`
- **Signature:** `<Torus ...TorusProps />`
- **Props:**
  - `radius?: number`
  - `tube?: number`
  - `radialSegments?: number`
  - `tubularSegments?: number`
  - `arc?: number`

### `Cone`
- **Signature:** `<Cone ...ConeProps />`
- **Props:**
  - `radius?: number`
  - `height?: number`
  - `radialSegments?: number`
  - `openEnded?: boolean`
  - `thetaStart?: number`
  - `thetaLength?: number`

### `Line3D`
3D cylindrical line segment between two world coordinates.
- **Signature:** `<Line3D ...Line3DProps />`
- **Props:**
  - `from: [number, number, number]`
  - `to: [number, number, number]`
  - `radius?: number`
  - `color?: string`
  - `palette?: PaletteId`

### `Arrow3D`
3D directional vector arrow from `from` to `to`.
- **Signature:** `<Arrow3D ...Arrow3DProps />`
- **Props:**
  - `headRadius?: number`
  - `headLength?: number`

### `Label3D`
3D marker plate used as an anchor/callout target in world space.
- **Signature:** `<Label3D ...Label3DProps />`
- **Props:**
  - `position: [number, number, number]`
  - `width?: number`
  - `height?: number`
  - `color?: string`
  - `palette?: PaletteId`

### `Ground`
- **Signature:** `<Ground ...GroundProps />`
- **Props:**
  - `size?: number`
  - `divisions?: number`
  - `y?: number`
  - `startSec?: number`
  - `durationSec?: number`

### `Rail`
- **Signature:** `<Rail ...RailProps />`
- **Props:**
  - `length?: number`
  - `gauge?: number`
  - `position?: [number, number, number]`
  - `highlighted?: boolean`
  - `startSec?: number`
  - `durationSec?: number`

### `Wheel`
- **Signature:** `<Wheel ...WheelProps />`
- **Props:**
  - `radius?: number`
  - `width?: number`
  - `flangeRadius?: number`
  - `flangeWidth?: number`
  - `side?: 'left' | 'right'`
  - `position?: [number, number, number]`
  - `spinRps?: number`
  - `highlightFlange?: boolean`
  - `startSec?: number`
  - `durationSec?: number`

### `Axle`
- **Signature:** `<Axle ...AxleProps />`
- **Props:**
  - `gauge?: number`
  - `wheelRadius?: number`
  - `position?: [number, number, number]`
  - `spinRps?: number`
  - `highlightFlange?: boolean`
  - `startSec?: number`
  - `durationSec?: number`

### `Pole`
- **Signature:** `<Pole ...PoleProps />`
- **Props:**
  - `height?: number`
  - `position?: [number, number, number]`
  - `withArm?: boolean`
  - `startSec?: number`
  - `durationSec?: number`

### `Spring`
- **Signature:** `<Spring ...SpringProps />`
- **Props:**
  - `position?: [number, number, number]`
  - `radius?: number`
  - `tubeRadius?: number`
  - `height?: number`
  - `turns?: number`
  - `amplitude?: number`
  - `freqHz?: number`
  - `highlighted?: boolean`
  - `startSec?: number`
  - `durationSec?: number`

## HUD & Zone Layout

### `KineticTitle`
Primary kinetic title (>= 44px) placed in the top safe zone.
- **Signature:** `<KineticTitle ...KineticTitleProps />`
- **Props:**
  - `id?: string`
  - `title: string`
  - `subtitle?: string`
  - `startSec?: number`
  - `zone?: HudZoneId`
  - `palette?: PaletteId`

### `StatCounter`
Dynamic counter ONLY for changing quantities. Bound to driver when `driver` is passed.
- **Signature:** `<StatCounter ...StatCounterProps />`
- **Props:**
  - `id?: string`
  - `label: string`
  - `driver?: DriverValue` — Bound single driver. When provided, value comes strictly from driver with NO independent easing.
  - `bindToDriver?: boolean`
  - `from?: number`
  - `to?: number`
  - `unit?: string`
  - `decimals?: number`
  - `startSec?: number`
  - `durationSec?: number`
  - `claimRef?: string`
  - `zone?: HudZoneId`
  - `palette?: PaletteId`

### `MeasureReveal`
Reveals a fixed dimension or engineering standard by extending a measure bar, then revealing the value without misleading count-up animation.
- **Signature:** `<MeasureReveal ...MeasureRevealProps />`
- **Props:**
  - `id?: string`
  - `label: string`
  - `valueText: string` — Fixed dimension/standard string (e.g. "1:20" or "1.435 mm"). No count-up.
  - `startSec?: number`
  - `durationSec?: number`
  - `claimRef?: string`
  - `zone?: HudZoneId`
  - `palette?: PaletteId`

### `DimensionLine`
Technical dimension bar with end ticks and id-ID formatted value.
- **Signature:** `<DimensionLine ...DimensionLineProps />`
- **Props:**
  - `id?: string`
  - `label: string`
  - `value: number`
  - `unit: string`
  - `decimals?: number`
  - `startSec?: number`
  - `zone?: HudZoneId`
  - `palette?: PaletteId`

### `Callout`
Technical callout badge (>= 26px), placed in zone or anchored to a screen point with optional leader line.
- **Signature:** `<Callout ...CalloutProps />`
- **Props:**
  - `id?: string`
  - `label: string`
  - `detail?: string`
  - `screenAnchor?: [number, number]` — Optional explicit screen position [x, y] (e.g. anchored to entity screen point).
  - `pointerTo?: [number, number]` — Optional target screen point [x, y] to draw a leader line from badge to part.
  - `claimRef?: string`
  - `zone?: HudZoneId`
  - `palette?: PaletteId`

### `ListReveal`
- **Signature:** `<ListReveal ...ListRevealProps />`
- **Props:**
  - `id?: string`
  - `items: string[]`
  - `activeIndex?: number`
  - `zone?: HudZoneId`
  - `palette?: PaletteId`

### `DateStamp`
- **Signature:** `<DateStamp ...DateStampProps />`
- **Props:**
  - `id?: string`
  - `dateText: string`
  - `zone?: HudZoneId`
  - `palette?: PaletteId`

### `Timeline`
- **Signature:** `<Timeline ...TimelineProps />`
- **Props:**
  - `id?: string`
  - `steps: string[]`
  - `progress: number`
  - `zone?: HudZoneId`
  - `palette?: PaletteId`

### `CompareCard`
- **Signature:** `<CompareCard ...CompareCardProps />`
- **Props:**
  - `id?: string`
  - `leftTitle: string`
  - `leftValue: string`
  - `rightTitle: string`
  - `rightValue: string`
  - `zone?: HudZoneId`
  - `palette?: PaletteId`

### `Waveform`
- **Signature:** `<Waveform ...WaveformProps />`
- **Props:**
  - `id?: string`
  - `label: string`
  - `bars?: number`
  - `zone?: HudZoneId`
  - `palette?: PaletteId`

### `HudLayout`
Full-screen 9:16 HUD overlay container.
- **Signature:** `<HudLayout ...HudLayoutProps />`
- **Props:**
  - `palette?: PaletteId`
  - `children: React.ReactNode`

### `HudZone`
Zone-based container that automatically stacks HUD items vertically without overlap inside its designated 9:16 safe band.
- **Signature:** `<HudZone ...HudZoneProps />`
- **Props:**
  - `zone: HudZoneId`
  - `gap?: number`
  - `align?: 'flex-start' | 'center' | 'flex-end'`
  - `palette?: PaletteId`
  - `children: React.ReactNode`

### `TelemetryHudBox`
Measures the rendered DOM bounding box of a HUD element and reports it to telemetry.
- **Signature:** `<TelemetryHudBox ...TelemetryHudBoxProps />`
- **Props:**
  - `id: string`
  - `component: string`
  - `zone: HudZoneId`
  - `text: string`
  - `driverName?: string`
  - `numericValue?: number`
  - `claimRef?: string`
  - `style?: React.CSSProperties`
  - `children: React.ReactNode`

## Motion & Core

### `formatNumberId`
- **Signature:** `(value: number, decimals?: number) => string`

### `TitleCard`
- **Signature:** `<TitleCard ...TitleCardProps />`
- **Props:**
  - `title: string`
  - `subtitle?: string`
  - `tag?: string`
  - `position?: 'top' | 'center' | 'bottom'`
  - `startSec?: number`
  - `durationSec?: number`

### `StatCounter`
- **Signature:** `<StatCounter ...StatCounterProps />`
- **Props:**
  - `label: string`
  - `from: number`
  - `to: number`
  - `unit?: string`
  - `decimals?: number`
  - `position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'`
  - `startSec?: number`
  - `durationSec?: number`

### `DimensionLine`
- **Signature:** `<DimensionLine ...DimensionLineProps />`
- **Props:**
  - `label: string`
  - `x1: number`
  - `y1: number`
  - `x2: number`
  - `y2: number`
  - `color?: string`
  - `startSec?: number`
  - `durationSec?: number`

### `Callout`
- **Signature:** `<Callout ...CalloutProps />`
- **Props:**
  - `title: string`
  - `body?: string`
  - `targetX: number`
  - `targetY: number`
  - `boxX: number`
  - `boxY: number`
  - `startSec?: number`
  - `durationSec?: number`

### `CaptionBar`
- **Signature:** `<CaptionBar ...CaptionBarProps />`
- **Props:**
  - `text: string`
  - `startSec?: number`
  - `durationSec?: number`

### `solveCrankSlider`
Exact kinematic solver for a vertical crank-slider mechanism in the XY plane. Piston moves along X = crankCenter[0]; crankshaft rotates around Z.
- **Signature:** `({ crankAngleRad, crankRadius, rodLength, crankCenter, }: CrankSliderInput) => CrankSliderSolution`

### `crankAngleFromTime`
Computes crank angle (radians) from scene time in seconds.
- **Signature:** `(sec: number, startSec?: number, durationSec?: number, rps?: number, initialAngleRad?: number) => number`

### `useSceneTime`
- **Signature:** `() => { sec: number; frame: number; fps: number; durationSec: number; }`

### `clamp01`
- **Signature:** `(value: number) => number`

### `applyEasing`
- **Signature:** `(t: number, mode?: EasingMode) => number`

### `getLocalProgress`
- **Signature:** `(sec: number, startSec?: number, durationSec?: number, easing?: EasingMode) => number`

### `spin`
Returns rotation angle in radians for continuous spinning.
- **Signature:** `(sec: number, startSec?: number, durationSec?: number, rps?: number) => number`

### `translatePath`
Interpolates a 3D point along a linear path from `from` to `to`.
- **Signature:** `(sec: number, startSec: number, durationSec: number, from: [number, number, number], to: [number, number, number], easing?: EasingMode) => [number, number, number]`

### `oscillate`
Returns a smooth sinusoidal oscillation offset in [-amplitude, +amplitude].
- **Signature:** `(sec: number, startSec?: number, durationSec?: number, amplitude?: number, freqHz?: number) => number`

### `highlight`
Returns a pulsing highlight intensity in [0, 1] during [startSec, startSec + durationSec].
- **Signature:** `(sec: number, startSec?: number, durationSec?: number, pulseHz?: number) => number`

### `TrainCar`
- **Signature:** `<TrainCar ...TrainCarProps />`
- **Props:**
  - `position?: [number, number, number]`
  - `from?: [number, number, number]`
  - `to?: [number, number, number]`
  - `easing?: EasingMode`
  - `gauge?: number`
  - `spinRps?: number`
  - `length?: number`
  - `startSec?: number`
  - `durationSec?: number`

## Telemetry

### `projectBox3ToScreen`
Projects a 3D world-space bounding box into 2D screen pixel coordinates [0..width, 0..height].
- **Signature:** `(box: Box3, camera: Camera, width: number, height: number) => ScreenBox | undefined`

### `TelemetryProvider`
Provides per-frame telemetry collection when `enabled` is true. Zero-overhead no-op when `enabled` is false.
- **Signature:** `<TelemetryProvider ...TelemetryProviderProps />`
- **Props:**
  - `enabled?: boolean`
  - `children: React.ReactNode`

### `TelemetryEmitter`
- **Signature:** `<TelemetryEmitter />`

### `TelemetryBridge`
- **Signature:** `<TelemetryBridge />`

### `useTelemetry`
- **Signature:** `() => TelemetryCollector`

### `TelemetryEntity`
Wraps a 3D assembly or focus object and reports its projected 2D screen bounding box, sub-part bounding boxes, geometry constraints, and part states when telemetry mode is enabled.
- **Signature:** `<TelemetryEntity ...TelemetryEntityProps />`
- **Props:**
  - `id: string` — Unique entity identifier (e.g. "wheelset", "piston_crank").
  - `role?: 'focus' | 'prop'` — Role in scene framing QC. Focus entities must stay inside 9:16 safe bounds.
  - `partStates?: Record<string, string | number | boolean>` — Current mechanical/visual part states reported per frame.
  - `partRefs?: Record<string, React.RefObject<THREE.Object3D | null>>` — Named 3D sub-part refs whose projected screen bounding boxes are reported.
  - `geometry?: Record<string, number | boolean>` — Pure geometry constraint measurements reported per frame.
  - `children: React.ReactNode`

## Transitions

### `SceneTransition`
Token-styled scene transition wrapper (fade-in/out or technical grid wipe).
- **Signature:** `<SceneTransition ...SceneTransitionProps />`
- **Props:**
  - `variant?: 'fade' | 'wipe-grid'` — Transition style matching design tokens.
  - `durationSec?: number` — Transition duration in seconds at start and end of scene. Defaults to 0.35.
  - `palette?: PaletteId` — Palette token ID.
  - `children: React.ReactNode`
