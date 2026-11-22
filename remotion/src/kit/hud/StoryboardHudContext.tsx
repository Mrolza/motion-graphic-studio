import React, { createContext, useContext } from 'react';
import type { DriverValue } from '../drivers/useDriver';
import type { PaletteId } from '../tokens/index';
import { Callout, DimensionLine, KineticTitle, MeasureReveal, StatCounter } from './HudCore';
import { EffectiveDiameterCompare } from './EffectiveDiameterCompare';
import { CompareCard, DateStamp, ListReveal, Timeline } from './HudExtras';

export interface StoryboardHudDataItem {
  hud_id: string;
  component: string;
  props: Record<string, unknown>;
  claim_ref?: string;
  bind_to_driver?: boolean;
  quantity?: string;
  display?: 'value' | 'qualitative';
  illustrative?: boolean;
  when?: { driver_between: [number, number] };
}

const StoryboardHudContext = createContext<Map<string, StoryboardHudDataItem>>(new Map());

export interface StoryboardHudProviderProps {
  items?: StoryboardHudDataItem[];
  children: React.ReactNode;
}

/**
 * Provides storyboard-sanctioned HUD data items to <Hud id="..." /> components.
 */
export const StoryboardHudProvider: React.FC<StoryboardHudProviderProps> = ({
  items = [],
  children,
}) => {
  const map = new Map<string, StoryboardHudDataItem>();
  for (const item of items) {
    if (item.hud_id) map.set(item.hud_id, item);
  }
  return <StoryboardHudContext.Provider value={map}>{children}</StoryboardHudContext.Provider>;
};

export interface HudProps {
  /** Unique hud_id from storyboard.json. */
  id: string;
  /** Optional active driver for bind_to_driver StatCounter or `when.driver_between` gating. */
  driver?: DriverValue;
  /** Optional active index override for ListReveal. */
  activeIndex?: number;
  /** Optional screen pointer target [x, y] for Callout. */
  pointerTo?: [number, number];
  /** Palette token ID. */
  palette?: PaletteId;
}

/**
 * Data-driven HUD component. Reads text and numeric values exclusively from storyboard data.
 * Automatically hides when outside `when.driver_between`.
 */
export const Hud: React.FC<HudProps> = ({
  id,
  driver,
  activeIndex,
  pointerTo,
  palette = 'blueprint-navy',
}) => {
  const map = useContext(StoryboardHudContext);
  const item = map.get(id);
  if (!item) return null;

  if (item.when?.driver_between && driver) {
    const [minV, maxV] = item.when.driver_between;
    if (driver.value < minV || driver.value > maxV) {
      return null;
    }
  }

  const p = item.props ?? {};
  const str = (k: string, fallback = '') => (typeof p[k] === 'string' ? (p[k] as string) : fallback);
  const num = (k: string, fallback = 0) => (typeof p[k] === 'number' ? (p[k] as number) : fallback);

  switch (item.component) {
    case 'KineticTitle':
      return (
        <KineticTitle
          id={id}
          title={str('title') || str('text') || str('label')}
          subtitle={str('subtitle') || undefined}
          palette={palette}
        />
      );
    case 'MeasureReveal':
      return (
        <MeasureReveal
          id={id}
          label={str('label')}
          valueText={str('valueText') || String(p.value ?? '')}
          claimRef={item.claim_ref}
          palette={palette}
        />
      );
    case 'StatCounter':
      return (
        <StatCounter
          id={id}
          label={str('label')}
          driver={driver}
          bindToDriver={Boolean(driver) && Boolean(item.bind_to_driver ?? p.bind_to_driver ?? true)}
          display={item.display ?? (p.display === 'qualitative' ? 'qualitative' : 'value')}
          from={num('from', 0)}
          to={num('to', 100)}
          unit={str('unit', driver?.unit ?? '')}
          decimals={num('decimals', 0)}
          claimRef={item.claim_ref}
          palette={palette}
        />
      );
    case 'DimensionLine':
      return (
        <DimensionLine
          id={id}
          label={str('label')}
          value={num('value', 0)}
          unit={str('unit', 'mm')}
          decimals={num('decimals', 0)}
          palette={palette}
        />
      );
    case 'CompareCard':
      return (
        <CompareCard
          id={id}
          leftTitle={str('leftTitle')}
          leftValue={str('leftValue')}
          rightTitle={str('rightTitle')}
          rightValue={str('rightValue')}
          palette={palette}
        />
      );
    case 'ListReveal':
      return (
        <ListReveal
          id={id}
          items={Array.isArray(p.items) ? p.items.map(String) : []}
          activeIndex={activeIndex ?? num('activeIndex', 0)}
          palette={palette}
        />
      );
    case 'DateStamp':
      return <DateStamp id={id} dateText={str('dateText')} palette={palette} />;
    case 'Timeline':
      return (
        <Timeline
          id={id}
          steps={Array.isArray(p.steps) ? p.steps.map(String) : []}
          progress={driver?.progress ?? num('progress', 0)}
          palette={palette}
        />
      );
    case 'EffectiveDiameterCompare':
      return (
        <EffectiveDiameterCompare
          id={id}
          lateralShift={driver ? driver.value : num('lateralShift', 0)}
          palette={palette}
        />
      );
    case 'Callout':
    default:
      return (
        <Callout
          id={id}
          label={str('label') || str('text') || str('title')}
          detail={str('detail') || undefined}
          pointerTo={pointerTo}
          claimRef={item.claim_ref}
          palette={palette}
        />
      );
  }
};
