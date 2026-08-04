/**
 * Inline-SVG icon component — drop-in replacement for @expo/vector-icons Feather.
 *
 * Uses react-native-svg paths so no font file is required. Icons render instantly
 * on Android cold-start without any font-loading race condition.
 *
 * Usage: <SvgIcon name="home" size={24} color="#fff" />
 */
import React from 'react';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

export type SvgIconName =
  | 'alert-circle'
  | 'arrow-left'
  | 'calendar'
  | 'clock'
  | 'external-link'
  | 'eye'
  | 'eye-off'
  | 'home'
  | 'key'
  | 'log-out'
  | 'map-pin'
  | 'plus'
  | 'plus-circle'
  | 'wifi-off'
  | 'x';

interface Props {
  name: SvgIconName;
  size?: number;
  color?: string;
}

const STROKE_PROPS = {
  fill: 'none' as const,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  strokeWidth: 2,
};

export default function SvgIcon({ name, size = 24, color = 'currentColor' }: Props) {
  const s = { stroke: color, ...STROKE_PROPS };

  const renderPaths = () => {
    switch (name) {
      case 'alert-circle':
        return (
          <>
            <Circle cx="12" cy="12" r="10" {...s} />
            <Line x1="12" y1="8" x2="12" y2="12" {...s} />
            <Line x1="12" y1="16" x2="12.01" y2="16" {...s} />
          </>
        );
      case 'arrow-left':
        return (
          <>
            <Line x1="19" y1="12" x2="5" y2="12" {...s} />
            <Polyline points="12 19 5 12 12 5" {...s} />
          </>
        );
      case 'calendar':
        return (
          <>
            <Rect x="3" y="4" width="18" height="18" rx="2" ry="2" {...s} />
            <Line x1="16" y1="2" x2="16" y2="6" {...s} />
            <Line x1="8" y1="2" x2="8" y2="6" {...s} />
            <Line x1="3" y1="10" x2="21" y2="10" {...s} />
          </>
        );
      case 'clock':
        return (
          <>
            <Circle cx="12" cy="12" r="10" {...s} />
            <Polyline points="12 6 12 12 16 14" {...s} />
          </>
        );
      case 'external-link':
        return (
          <>
            <Path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" {...s} />
            <Polyline points="15 3 21 3 21 9" {...s} />
            <Line x1="10" y1="14" x2="21" y2="3" {...s} />
          </>
        );
      case 'eye':
        return (
          <>
            <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" {...s} />
            <Circle cx="12" cy="12" r="3" {...s} />
          </>
        );
      case 'eye-off':
        return (
          <>
            <Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" {...s} />
            <Line x1="1" y1="1" x2="23" y2="23" {...s} />
          </>
        );
      case 'home':
        return (
          <>
            <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" {...s} />
            <Polyline points="9 22 9 12 15 12 15 22" {...s} />
          </>
        );
      case 'key':
        return (
          <Path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" {...s} />
        );
      case 'log-out':
        return (
          <>
            <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" {...s} />
            <Polyline points="16 17 21 12 16 7" {...s} />
            <Line x1="21" y1="12" x2="9" y2="12" {...s} />
          </>
        );
      case 'map-pin':
        return (
          <>
            <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" {...s} />
            <Circle cx="12" cy="10" r="3" {...s} />
          </>
        );
      case 'plus':
        return (
          <>
            <Line x1="12" y1="5" x2="12" y2="19" {...s} />
            <Line x1="5" y1="12" x2="19" y2="12" {...s} />
          </>
        );
      case 'plus-circle':
        return (
          <>
            <Circle cx="12" cy="12" r="10" {...s} />
            <Line x1="12" y1="8" x2="12" y2="16" {...s} />
            <Line x1="8" y1="12" x2="16" y2="12" {...s} />
          </>
        );
      case 'wifi-off':
        return (
          <>
            <Line x1="1" y1="1" x2="23" y2="23" {...s} />
            <Path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" {...s} />
            <Path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" {...s} />
            <Path d="M10.71 5.05A16 16 0 0 1 22.56 9" {...s} />
            <Path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" {...s} />
            <Path d="M8.53 16.11a6 6 0 0 1 6.95 0" {...s} />
            <Line x1="12" y1="20" x2="12.01" y2="20" {...s} />
          </>
        );
      case 'x':
        return (
          <>
            <Line x1="18" y1="6" x2="6" y2="18" {...s} />
            <Line x1="6" y1="6" x2="18" y2="18" {...s} />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {renderPaths()}
    </Svg>
  );
}
