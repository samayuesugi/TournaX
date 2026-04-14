export interface CosmeticMeta {
  id: string;
  name: string;
  emoji: string;
  cssValue: string;
  category: "frame" | "badge" | "handle_color" | "banner_animation";
}

const COSMETICS: CosmeticMeta[] = [
  { id: "frame-fire",    category: "frame",        name: "Fire Ring",    emoji: "🔥", cssValue: "ring-2 ring-orange-500 ring-offset-2 ring-offset-background" },
  { id: "frame-galaxy",  category: "frame",        name: "Galaxy Ring",  emoji: "🌌", cssValue: "ring-2 ring-purple-500 ring-offset-2 ring-offset-background" },
  { id: "frame-gold",    category: "frame",        name: "Gold Ring",    emoji: "✨", cssValue: "ring-2 ring-amber-400 ring-offset-2 ring-offset-background" },
  { id: "frame-neon",    category: "frame",        name: "Neon Ring",    emoji: "⚡", cssValue: "ring-2 ring-cyan-400 ring-offset-2 ring-offset-background" },
  { id: "frame-legend",  category: "frame",        name: "Legend Aura",  emoji: "👑", cssValue: "ring-2 ring-red-500 ring-offset-2 ring-offset-background shadow-[0_0_12px_2px_rgba(239,68,68,0.5)]" },
  { id: "badge-warrior",  category: "badge",       name: "Warrior",      emoji: "⚔️", cssValue: "⚔️" },
  { id: "badge-ghost",    category: "badge",       name: "Ghost",        emoji: "👻", cssValue: "👻" },
  { id: "badge-champion", category: "badge",       name: "Champion",     emoji: "🏆", cssValue: "🏆" },
  { id: "badge-dragon",   category: "badge",       name: "Dragon",       emoji: "🐲", cssValue: "🐲" },
  { id: "badge-legend",   category: "badge",       name: "Legend",       emoji: "👑", cssValue: "👑" },
  { id: "color-purple",  category: "handle_color", name: "Purple",       emoji: "💜", cssValue: "text-purple-400" },
  { id: "color-red",     category: "handle_color", name: "Red",          emoji: "❤️", cssValue: "text-red-400" },
  { id: "color-green",   category: "handle_color", name: "Green",        emoji: "💚", cssValue: "text-green-400" },
  { id: "color-cyan",    category: "handle_color", name: "Cyan",         emoji: "🩵", cssValue: "text-cyan-400" },
  { id: "color-gold",    category: "handle_color", name: "Gold",         emoji: "💛", cssValue: "text-amber-400" },
  { id: "banner-rainfall",   category: "banner_animation", name: "Color Rain",      emoji: "🌧️", cssValue: "rainfall" },
  { id: "banner-firestorm",  category: "banner_animation", name: "Firestorm",       emoji: "🔥", cssValue: "firestorm" },
  { id: "banner-star-night", category: "banner_animation", name: "Starry Snowfall", emoji: "🌌", cssValue: "star-night" },
];

const MAP = new Map(COSMETICS.map(c => [c.id, c]));

export function getCosmeticMeta(id: string | null | undefined): CosmeticMeta | null {
  if (!id) return null;
  return MAP.get(id) ?? null;
}

export function getFrameClass(frameId: string | null | undefined): string | undefined {
  return getCosmeticMeta(frameId)?.cssValue;
}

export function getBadgeEmoji(badgeId: string | null | undefined): string | undefined {
  return getCosmeticMeta(badgeId)?.emoji;
}

export function getHandleColorClass(colorId: string | null | undefined): string | undefined {
  return getCosmeticMeta(colorId)?.cssValue;
}
