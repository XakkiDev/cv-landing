import test from 'node:test';
import assert from 'node:assert/strict';
import { bounceSamples } from '../src/bounce.js';

test('the ball falls, bounces lower each time and comes to rest on the floor', () => {
  const samples = bounceSamples();
  assert.equal(samples.length, 100);
  assert.ok(samples[0] < .59 && samples[0] > .58);
  assert.ok(samples.every(h => h >= 0));
  const firstBounce = Math.max(...samples.slice(20));
  assert.ok(firstBounce < .65 * .22 * 2);
  assert.ok(samples.at(-1) < .01);
});
