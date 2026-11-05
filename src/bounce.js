/**
 * Heights of a ball dropped onto the floor, one sample per frame.
 * A closed-form replacement for a physics engine: gravity plus a restitution bounce is all the
 * "scroll drops onto the table" animation needs.
 */
export function bounceSamples({ startHeight = .65, radius = .06, restitution = .22, gravity = 9.81, fps = 60, frames = 100 } = {}) {
  const dt = 1 / fps;
  let y = startHeight, velocity = 0;
  const samples = [];
  for (let i = 0; i < frames; i++) {
    velocity -= gravity * dt;
    y += velocity * dt;
    if (y < radius) {
      y = radius;
      velocity = -velocity * restitution;
    }
    samples.push(Math.max(0, y - radius));
  }
  return samples;
}
