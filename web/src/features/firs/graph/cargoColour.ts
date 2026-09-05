/**
 * The colour a cargo is painted in: the palette index the set assigns it in the economy,
 * resolved through the game palette (ADR-0008). The badge is lettered in the palette's own
 * darkest or lightest entry, whichever reads on that colour.
 */
import { gamePalette } from '../../../dataset';
import type { Cargo } from '../../../types';

export function cargoColour(cargo: Cargo | undefined, economyId: string): string | undefined {
  const index = cargo?.colour_by_economy[economyId];
  return index === undefined ? undefined : gamePalette[index];
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

const byLuminance = [...gamePalette].sort((a, b) => luminance(a) - luminance(b));
/** The palette's darkest and lightest entries: what a badge is lettered in. */
export const BADGE_TEXT_COLOURS: readonly [dark: string, light: string] = [
  byLuminance[0],
  byLuminance[byLuminance.length - 1],
];

export const badgeTextColour = (background: string) =>
  luminance(background) > 140 ? BADGE_TEXT_COLOURS[0] : BADGE_TEXT_COLOURS[1];
