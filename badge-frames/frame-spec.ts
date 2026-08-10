/* Types for a badge frame_spec (see docs/badge-frames.json). */

export type Border =
  | "solid-bronze" | "solid-silver" | "solid-amber" | "solid-jade"
  | "gold" | "platinum" | "spectrum" | "gemstone"
  | "flame" | "ripple" | "electric" | "enso";

export type Glow = "none" | "soft" | "strong" | "radiant";

export type Anim =
  | "none" | "shimmer" | "rotating" | "pulse" | "breathing"
  | "flame-flicker" | "ripple" | "lightning";

export type ParticleKind = "ember" | "bubble" | "sparkle";

export interface ParticleSpec {
  kind: ParticleKind;
  color: string;   // hex
  count: number;
}

export type Motif =
  | "gem-shine" | "season-gem-shine" | "signature"
  | "laurel" | "crown" | "dragon-coil" | "torch-flame" | "enso-radiant"
  | "twin-rings" | "wax-seal" | "star-ribbon" | "crowned-blade"
  | "ten-stars" | "clash-lightning";

export interface FrameSpec {
  tier: 1 | 2 | 3 | 4 | 5;   // 1 Common … 5 Legendary/flagship
  border: Border;
  glow: Glow;
  anim: Anim;
  particle: ParticleSpec | null;
  motif: Motif | null;
}

export type FrameSpecMap = Record<string, FrameSpec>;
