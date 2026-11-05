type Point = { x: number; y: number };

interface DragAdapter {
  readOrigin: () => Promise<Point>;
  moveWindow: (position: Point) => Promise<void>;
  save: () => Promise<void>;
}

// Only moves coordinates. Never starts a native window drag or requests focus.
export function createPanelDrag(start: Point, adapter: DragAdapter) {
  const origin = adapter.readOrigin();
  // A lookup can fail while the user is still holding the grip without moving.
  // The movement/finish promise reports it; attach a handler immediately as well.
  void origin.catch(() => {});
  let latest: Point | undefined;
  let worker: Promise<void> | undefined;
  let finished = false;

  const move = (point: Point): Promise<void> => {
    if (finished) return Promise.resolve();
    latest = point;
    if (!worker) {
      worker = (async () => {
        const position = await origin;
        // Serialize IPC calls and coalesce intermediate events from fast movement.
        while (latest) {
          const target = latest;
          latest = undefined;
          await adapter.moveWindow({
            x: position.x + target.x - start.x,
            y: position.y + target.y - start.y,
          });
        }
      })().finally(() => { worker = undefined; });
    }
    return worker;
  };

  return {
    move,
    async finish(point?: Point) {
      if (finished) return;
      const pending = point ? move(point) : worker;
      finished = true;
      await pending;
      await adapter.save();
    },
  };
}
