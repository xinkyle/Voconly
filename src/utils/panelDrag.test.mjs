import test from 'node:test';
import assert from 'node:assert/strict';
import { createPanelDrag } from './panelDrag.ts';

test('drag uses screen deltas without accumulating window movement; saves after final move', async () => {
  const events = [];
  const drag = createPanelDrag({ x: 100, y: 200 }, {
    readOrigin: async () => ({ x: -500, y: 300 }),
    moveWindow: async position => { events.push(position); },
    save: async () => { events.push('saved'); },
  });
  drag.move({ x: 120, y: 220 });
  drag.move({ x: 150, y: 240 });
  await drag.finish({ x: 160, y: 250 });
  assert.deepEqual(events.at(-2), { x: -440, y: 350 });
  assert.equal(events.at(-1), 'saved');
});

test('release before origin lookup completes still applies the final position', async () => {
  let resolveOrigin;
  const positions = [];
  const drag = createPanelDrag({ x: 20, y: 30 }, {
    readOrigin: () => new Promise(resolve => { resolveOrigin = resolve; }),
    moveWindow: async position => { positions.push(position); },
    save: async () => {},
  });
  const finished = drag.finish({ x: 30, y: 15 });
  resolveOrigin({ x: 100, y: 200 });
  await finished;
  assert.deepEqual(positions.at(-1), { x: 110, y: 185 });
});

test('slow position updates stay ordered and movement after release is ignored', async () => {
  let releaseMove;
  const positions = [];
  const drag = createPanelDrag({ x: 0, y: 0 }, {
    readOrigin: async () => ({ x: 0, y: 0 }),
    moveWindow: async position => {
      positions.push(position);
      if (positions.length === 1) await new Promise(resolve => { releaseMove = resolve; });
    },
    save: async () => {},
  });
  drag.move({ x: 10, y: 10 });
  await new Promise(resolve => setImmediate(resolve));
  drag.move({ x: 20, y: 20 });
  const finished = drag.finish({ x: 30, y: 30 });
  drag.move({ x: 999, y: 999 });
  releaseMove();
  await finished;
  assert.deepEqual(positions, [{ x: 10, y: 10 }, { x: 30, y: 30 }]);
});
