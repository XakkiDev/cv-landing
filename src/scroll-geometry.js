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

/** Constrain two rolls to non-intersecting circles throughout the transition. */
export function scrollWindow({length, viewport, offset, progress, edge, core, thickness}) {
  const p=Math.max(0,Math.min(1,progress));
  const visible=Math.min(length,viewport*p);
  const maxOffset=Math.max(0,length-viewport-2*edge);
  const safeOffset=Math.max(0,Math.min(maxOffset,offset));
  const smooth = x => {const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
  // Both centres can be separated in Z as well as Y. 2Rmax is a conservative
  // limit, ensuring even the two largest possible rolls cannot intersect.
  const clearance=2*rollRadius(length,core,thickness)+thickness;
  const space=Math.max(0,visible-clearance);
  const edgeWeight=smooth(space/edge);
  const offsetWeight=smooth(space/(viewport*.5));
  const top=Math.min(length,safeOffset*offsetWeight+edge*edgeWeight);
  const bottom=Math.max(top,Math.min(length-edge*edgeWeight,top+visible));
  return {top,bottom,offset:safeOffset};
}
