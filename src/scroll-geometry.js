/** Radius of a tightly wound roll with a constant separation between turns. */
export function rollRadius(length, core, thickness) {
  return Math.sqrt(core * core + Math.max(0, length) * thickness / Math.PI);
}

/**
 * A sheet enters a roll tangentially at its OUTSIDE. Following the sheet
 * towards its end decreases the radius by one thickness each turn.
 * The circular arc length approximation has error O((thickness/core)^2).
 */
export function rolledPoint(distance, length, core, thickness) {
  const d = Math.max(0, Math.min(distance, length));
  const outer = rollRadius(length, core, thickness);
  const radius = rollRadius(length - d, core, thickness);
  const angle = thickness > 0 ? 2 * Math.PI * (outer - radius) / thickness : d / core;
  return { along: radius * Math.sin(angle), depth: outer - radius * Math.cos(angle), radius, outer, angle };
}

export function sheetPoint(s, top, bottom, length, core, thickness) {
  if (s < top) {
    const p = rolledPoint(top - s, top, core, thickness);
    return { y: top - p.along, z: p.depth };
  }
  if (s > bottom) {
    const p = rolledPoint(s - bottom, length - bottom, core, thickness);
    return { y: bottom + p.along, z: p.depth };
  }
  return { y: s, z: 0 };
}
