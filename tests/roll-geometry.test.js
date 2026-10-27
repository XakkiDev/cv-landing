import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateRollRadius } from '../dist/paper-scroll.js';

test('radius conserves rolled paper area and starts at the core', () => {
  const core = 18, thickness = .18, length = 3000;
  assert.equal(calculateRollRadius(0, core, thickness), core);
  const radius = calculateRollRadius(length, core, thickness);
  assert.ok(radius > core);
  assert.ok(Math.abs(Math.PI * (radius * radius - core * core) - length * thickness) < 1e-8);
  assert.equal(calculateRollRadius(-10, core, thickness), core);
});
