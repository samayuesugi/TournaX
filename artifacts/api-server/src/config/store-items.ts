export type CosmeticCategory = "frame" | "badge" | "handle_color";

export interface CosmeticItem {
  id: string;
  category: CosmeticCategory;
  name: string;
  description: string;
  emoji: string;
  cost: number;
  cssValue: string;
}

export const STORE_ITEMS: CosmeticItem[] = [
  { id: "frame-fire",    category: "frame", name: "Fire Ring",    description: "Burn bright with a blazing orange frame",    emoji: "🔥", cost: 50,  cssValue: "ring-2 ring-orange-500 ring-offset-2 ring-offset-background" },
  { id: "frame-galaxy",  category: "frame", name: "Galaxy Ring",  description: "Mysterious cosmic purple-blue border",        emoji: "🌌", cost: 80,  cssValue: "ring-2 ring-purple-500 ring-offset-2 ring-offset-background" },
  { id: "frame-gold",    category: "frame", name: "Gold Ring",    description: "Show off your status with gleaming gold",     emoji: "✨", cost: 100, cssValue: "ring-2 ring-amber-400 ring-offset-2 ring-offset-background" },
  { id: "frame-neon",    category: "frame", name: "Neon Ring",    description: "Electric cyan glow that stands out",          emoji: "⚡", cost: 120, cssValue: "ring-2 ring-cyan-400 ring-offset-2 ring-offset-background" },
  { id: "frame-legend",  category: "frame", name: "Legend Aura",  description: "Red champion aura for true legends",         emoji: "👑", cost: 200, cssValue: "ring-2 ring-red-500 ring-offset-2 ring-offset-background shadow-[0_0_12px_2px_rgba(239,68,68,0.5)]" },

  { id: "badge-warrior",  category: "badge", name: "Warrior",  description: "For those who never back down",           emoji: "⚔️", cost: 30,  cssValue: "⚔️" },
  { id: "badge-ghost",    category: "badge", name: "Ghost",    description: "Silent, deadly — impossible to catch",    emoji: "👻", cost: 40,  cssValue: "👻" },
  { id: "badge-champion", category: "badge", name: "Champion", description: "Proven winner across multiple tourneys",  emoji: "🏆", cost: 60,  cssValue: "🏆" },
  { id: "badge-dragon",   category: "badge", name: "Dragon",   description: "Rare prestige badge for elite players",   emoji: "🐲", cost: 80,  cssValue: "🐲" },
  { id: "badge-legend",   category: "badge", name: "Legend",   description: "The highest badge — for the chosen few",  emoji: "👑", cost: 100, cssValue: "👑" },

  { id: "color-purple", category: "handle_color", name: "Purple",  description: "Vibrant royal purple handle",        emoji: "💜", cost: 40,  cssValue: "text-purple-400" },
  { id: "color-red",    category: "handle_color", name: "Red",     description: "Bold danger-red handle",             emoji: "❤️", cost: 50,  cssValue: "text-red-400" },
  { id: "color-green",  category: "handle_color", name: "Green",   description: "Toxic neon-green handle",            emoji: "💚", cost: 50,  cssValue: "text-green-400" },
  { id: "color-cyan",   category: "handle_color", name: "Cyan",    description: "Ice-cold electric cyan handle",      emoji: "🩵", cost: 60,  cssValue: "text-cyan-400" },
  { id: "color-gold",   category: "handle_color", name: "Gold",    description: "Prestigious gold handle color",      emoji: "💛", cost: 70,  cssValue: "text-amber-400" },
];
