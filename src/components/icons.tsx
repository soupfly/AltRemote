/**
 * Media and remote icons drawn with plain views, so they look the same on every phone
 * (emoji like ⏪ render as orange pictures on Samsung, and some symbols like ⏻ are
 * missing from Android fonts entirely).
 */
import React from 'react';
import { Text, View } from 'react-native';
import { useColors } from '../theme';

type Dir = 'left' | 'right';

interface IconProps {
  size?: number;
  color?: string;
}

function Triangle({ dir, size, color }: { dir: Dir; size: number; color: string }) {
  const half = size / 2;
  const depth = size * 0.8;
  return (
    <View
      style={{
        width: 0,
        height: 0,
        borderStyle: 'solid',
        backgroundColor: 'transparent',
        borderTopWidth: half,
        borderBottomWidth: half,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        ...(dir === 'right'
          ? { borderLeftWidth: depth, borderLeftColor: color }
          : { borderRightWidth: depth, borderRightColor: color }),
      }}
    />
  );
}

function Bar({ size, color }: { size: number; color: string }) {
  return <View style={{ width: Math.max(2, size * 0.22), height: size, backgroundColor: color, borderRadius: 1 }} />;
}

function Row({ children, gap = 1 }: { children: React.ReactNode; gap?: number }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap }}>{children}</View>;
}

function useTint(color?: string) {
  const colors = useColors();
  return color ?? colors.text;
}

export function PrevIcon({ size = 18, color }: IconProps) {
  const c = useTint(color);
  return (
    <Row>
      <Bar size={size} color={c} />
      <Triangle dir="left" size={size} color={c} />
    </Row>
  );
}

export function NextIcon({ size = 18, color }: IconProps) {
  const c = useTint(color);
  return (
    <Row>
      <Triangle dir="right" size={size} color={c} />
      <Bar size={size} color={c} />
    </Row>
  );
}

export function RewindIcon({ size = 18, color }: IconProps) {
  const c = useTint(color);
  return (
    <Row gap={0}>
      <Triangle dir="left" size={size} color={c} />
      <Triangle dir="left" size={size} color={c} />
    </Row>
  );
}

export function FastForwardIcon({ size = 18, color }: IconProps) {
  const c = useTint(color);
  return (
    <Row gap={0}>
      <Triangle dir="right" size={size} color={c} />
      <Triangle dir="right" size={size} color={c} />
    </Row>
  );
}

export function PlayPauseIcon({ size = 18, color }: IconProps) {
  const c = useTint(color);
  return (
    <Row gap={3}>
      <Triangle dir="right" size={size} color={c} />
      <Row gap={2}>
        <Bar size={size} color={c} />
        <Bar size={size} color={c} />
      </Row>
    </Row>
  );
}

export function MicIcon({ size = 24, color }: IconProps) {
  const c = useTint(color);
  const stroke = Math.max(2, Math.round(size / 12));
  return (
    <View style={{ width: size, height: size, alignItems: 'center' }}>
      {/* capsule */}
      <View
        style={{
          width: size * 0.36,
          height: size * 0.56,
          borderRadius: size * 0.18,
          backgroundColor: c,
        }}
      />
      {/* holder (U shape) */}
      <View
        style={{
          position: 'absolute',
          top: size * 0.3,
          width: size * 0.62,
          height: size * 0.42,
          borderWidth: stroke,
          borderTopWidth: 0,
          borderColor: c,
          borderBottomLeftRadius: size * 0.31,
          borderBottomRightRadius: size * 0.31,
        }}
      />
      {/* stem */}
      <View
        style={{
          position: 'absolute',
          top: size * 0.72,
          width: stroke,
          height: size * 0.2,
          backgroundColor: c,
        }}
      />
      {/* base */}
      <View
        style={{
          position: 'absolute',
          top: size * 0.9,
          width: size * 0.4,
          height: stroke,
          backgroundColor: c,
          borderRadius: 1,
        }}
      />
    </View>
  );
}

export function MuteIcon({ size = 22, color }: IconProps) {
  const c = useTint(color);
  return (
    <Row gap={0}>
      <View style={{ width: size * 0.22, height: size * 0.4, backgroundColor: c }} />
      <Triangle dir="left" size={size} color={c} />
      <Text style={{ color: c, fontSize: size * 0.8, fontWeight: '700', marginLeft: 3, lineHeight: size }}>
        ×
      </Text>
    </Row>
  );
}
