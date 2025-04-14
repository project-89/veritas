/**
 * Color utility functions for manipulating and transforming colors
 */

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

/**
 * Lightens a color by a specified amount
 * @param color Hex color string (e.g. "#FFFFFF")
 * @param amount Amount to lighten (0-1)
 * @returns Lightened hex color
 */
export function lightenColor(color: string, amount: number): string {
  // Remove the # if present
  const hex = color.replace('#', '');

  // Convert to RGB
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);

  // Lighten each component
  r = Math.min(255, Math.round(r + (255 - r) * amount));
  g = Math.min(255, Math.round(g + (255 - g) * amount));
  b = Math.min(255, Math.round(b + (255 - b) * amount));

  // Convert back to hex
  const rHex = r.toString(16).padStart(2, '0');
  const gHex = g.toString(16).padStart(2, '0');
  const bHex = b.toString(16).padStart(2, '0');

  return `#${rHex}${gHex}${bHex}`;
}

/**
 * Darkens a color by a specified amount
 * @param color Hex color string (e.g. "#FFFFFF")
 * @param amount Amount to darken (0-1)
 * @returns Darkened hex color
 */
export function darkenColor(color: string, amount: number): string {
  // Remove the # if present
  const hex = color.replace('#', '');

  // Convert to RGB
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);

  // Darken each component
  r = Math.max(0, Math.round(r * (1 - amount)));
  g = Math.max(0, Math.round(g * (1 - amount)));
  b = Math.max(0, Math.round(b * (1 - amount)));

  // Convert back to hex
  const rHex = r.toString(16).padStart(2, '0');
  const gHex = g.toString(16).padStart(2, '0');
  const bHex = b.toString(16).padStart(2, '0');

  return `#${rHex}${gHex}${bHex}`;
}

/**
 * Generates a contrasting text color (black or white) based on background color
 * @param backgroundColor Hex color string (e.g. "#FFFFFF")
 * @returns "#FFFFFF" for dark backgrounds, "#000000" for light backgrounds
 */
export function getContrastingTextColor(backgroundColor: string): string {
  // Remove the # if present
  const hex = backgroundColor.replace('#', '');

  // Convert to RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Calculate perceived brightness using YIQ formula
  // https://www.w3.org/TR/AERT/#color-contrast
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;

  // Return black for light backgrounds, white for dark backgrounds
  return brightness > 128 ? '#000000' : '#FFFFFF';
}

/**
 * Converts a hex color to an RGB object
 * @param color Hex color string (e.g. "#FFFFFF")
 * @returns RGB object { r, g, b }
 */
export function hexToRgb(color: string): { r: number; g: number; b: number } {
  // Remove the # if present
  const hex = color.replace('#', '');

  // Convert to RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  return { r, g, b };
}

/**
 * Converts an RGB object to a hex color string
 * @param rgb RGB object { r, g, b }
 * @returns Hex color string (e.g. "#FFFFFF")
 */
export function rgbToHex(rgb: { r: number; g: number; b: number }): string {
  // Convert to hex
  const rHex = Math.max(0, Math.min(255, rgb.r)).toString(16).padStart(2, '0');
  const gHex = Math.max(0, Math.min(255, rgb.g)).toString(16).padStart(2, '0');
  const bHex = Math.max(0, Math.min(255, rgb.b)).toString(16).padStart(2, '0');

  return `#${rHex}${gHex}${bHex}`;
}

/**
 * Calculates the color of an edge based on its type and weight
 * Similar to what's used in the visualization library
 * @param edgeType Edge type identifier
 * @param weight Weight of the edge (0-1)
 * @param baseColors Map of edge types to base colors
 * @returns A color string
 */
export function calculateEdgeColor(
  edgeType: string,
  weight: number,
  baseColors: Record<string, string>
): string {
  // Get base color from edge type
  const baseColor = baseColors[edgeType] || '#999999';

  // If it's a weak relationship, make it more transparent
  if (weight < 0.3) {
    return adjustColorOpacity(baseColor, 0.5);
  }

  return baseColor;
}
