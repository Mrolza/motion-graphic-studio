export { BLUEPRINT_TOKENS } from './tokens';
export {
  PALETTES,
  getThemeTokens,
  type PaletteId,
  type ThemeTokens,
} from './tokens/index';
export {
  useSceneTime,
  clamp01,
  applyEasing,
  getLocalProgress,
  spin,
  translatePath,
  oscillate,
  highlight,
  type EasingMode,
} from './motion';
export { useDriver, type DriverConfig, type DriverValue } from './drivers/useDriver';
export { TriggerProvider, useTrigger, type TriggerMap } from './drivers/useTrigger';
export {
  solveCrankSlider,
  crankAngleFromTime,
  gearRatioAngle,
  wheelAngleFromDistance,
  wheelAngleDegFromDistance,
  springOscillation,
  valveStateFromCrankAngle,
  formatIdNumber,
  normalizeUnit,
  formatValueWithUnit,
  type CrankSliderInput,
  type CrankSliderSolution,
  type StrokePhase,
  type ValveCycleState,
} from './drivers/kinematics';
export { BlueprintStage, type BlueprintStageProps } from './BlueprintStage';
export {
  CameraRig,
  type CameraRigProps,
  type CameraMode,
  type FramingPreset,
  type FocusBox,
} from './CameraRig';
export * from './primitives/index';
export { TrainCar, type TrainCarProps } from './TrainCar';
export {
  computeWheelsetLayout,
  computePistonCrankLayout,
  type WheelsetLayout,
  type WheelsetLayoutInput,
  type WheelsetGeometryConstraints,
  type PistonCrankLayout,
} from './drivers/geometry';
export { CurvedRail, type CurvedRailProps } from './assemblies/CurvedRail';
export { WheelsetOnRail, type WheelsetOnRailProps } from './assemblies/WheelsetOnRail';
export { RailCrossSection, type RailCrossSectionProps } from './assemblies/RailCrossSection';
export { EngineBlock, type EngineBlockProps } from './assemblies/EngineBlock';
export {
  PistonCrankAssembly,
  type PistonCrankAssemblyProps,
} from './assemblies/PistonCrankAssembly';
export { Suspension, type SuspensionProps } from './assemblies/Suspension';
export {
  StoryboardHudProvider,
  Hud,
  type StoryboardHudDataItem,
  type StoryboardHudProviderProps,
  type HudProps,
} from './hud/StoryboardHudContext';
export { DiagramOverlay, type DiagramOverlayProps } from './hud/DiagramOverlay';
export {
  ParallaxForeground,
  type ParallaxForegroundProps,
} from './foreground/ParallaxForeground';
export {
  SceneTransition,
  type SceneTransitionProps,
} from './transitions/SceneTransition';
export {
  TelemetryProvider,
  TelemetryBridge,
  TelemetryEmitter,
  useTelemetry,
  type TelemetryProviderProps,
} from './telemetry/TelemetryContext';
export { TelemetryEntity, type TelemetryEntityProps } from './telemetry/TelemetryEntity';
export { projectBox3ToScreen } from './telemetry/projection';
export {
  TELEMETRY_LOG_PREFIX,
  type ScreenBox,
  type TelemetryDriverSample,
  type TelemetryEntitySample,
  type TelemetryHudSample,
  type TelemetryFramePayload,
} from './telemetry/types';
export {
  HudLayout,
  HudZone,
  TelemetryHudBox,
  type HudZoneId,
  type HudLayoutProps,
  type HudZoneProps,
  type TelemetryHudBoxProps,
} from './hud/HudZones';
export {
  KineticTitle,
  StatCounter,
  MeasureReveal,
  DimensionLine,
  Callout,
  ExaggerationBadge,
  type KineticTitleProps,
  type StatCounterProps,
  type MeasureRevealProps,
  type DimensionLineProps,
  type CalloutProps,
  type ExaggerationBadgeProps,
} from './hud/HudCore';
export {
  ListReveal,
  DateStamp,
  Timeline,
  CompareCard,
  Waveform,
  type ListRevealProps,
  type DateStampProps,
  type TimelineProps,
  type CompareCardProps,
  type WaveformProps,
} from './hud/HudExtras';
export { TitleCard, CaptionBar, formatNumberId, type TitleCardProps, type CaptionBarProps } from './Hud2D';
export {
  KineticCaptions,
  type KineticCaptionsProps,
  type KineticCaptionItem,
  type KineticCaptionWord,
} from './hud/KineticCaptions';
export {
  EffectiveDiameterCompare,
  computeEffectiveCompareRadii,
  type EffectiveDiameterCompareProps,
  type CompareRadiiResult,
} from './hud/EffectiveDiameterCompare';
