export type EdgeType =
  | "PUBLISHED"
  | "SHARED"
  | "REFERENCED"
  | "INTERACTED"
  | "DISPUTED";

// Color schemes for different node types
export const NODE_COLORS = {
  content: {
    default: "#4299E1", // Blue
    highImpact: "#2B6CB0", // Dark Blue
    lowImpact: "#90CDF4", // Light Blue
  },
  source: {
    verified: "#48BB78", // Green
    unverified: "#ECC94B", // Yellow
    disputed: "#F56565", // Red
  },
  account: {
    influential: "#805AD5", // Purple
    normal: "#B794F4", // Light Purple
    suspicious: "#FC8181", // Light Red
  },
};

export const EDGE_COLORS: Record<EdgeType, string> = {
  PUBLISHED: "#2B6CB0", // Blue
  SHARED: "#48BB78", // Green
  REFERENCED: "#805AD5", // Purple
  INTERACTED: "#ECC94B", // Yellow
  DISPUTED: "#F56565", // Red
};

/**
 * Adjusts the opacity of a hex color
 * @param color Hex color string (e.g. "#FFFFFF")
 * @param opacity Opacity value between 0 and 1
 * @returns RGBA color string
 */
export function adjustColorOpacity(color: string, opacity: number): string {
  // Convert hex to rgba
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
} 