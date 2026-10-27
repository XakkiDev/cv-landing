/** Arc-length based double roll. s and all dimensions use the same units. */
export function rolledPoint(distance, coreRadius, thickness) {
  const d = Math.max(0, distance);
  // One turn adds one paper thickness. The spiral arc length is approximated
  // by its circumferential term; the discarded radial term is very small.
  const radius = Math.sqrt(coreRadius * coreRadius + thickness * d / Math.PI);
  const angle = thickness > 0 ? 2 * Math.PI * (radius - coreRadius) / thickness : d / coreRadius;
  return { along: radius * Math.sin(angle), depth: radius * Math.cos(angle) - coreRadius, radius, angle };
}

export function sheetPoint(s, top, bottom, coreRadius, thickness) {
  if (s < top) {
    const p = rolledPoint(top - s, coreRadius, thickness);
    return { y: top - p.along, z: p.depth };
  }
  if (s > bottom) {
    const p = rolledPoint(s - bottom, coreRadius, thickness);
    return { y: bottom + p.along, z: p.depth };
  }
  return { y: s, z: 0 };
}
