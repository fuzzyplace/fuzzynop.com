import { useEffect, useState, type ComponentType } from 'react';
import { whenIdle } from './ticker';

/**
 * The character and his claw (PuppeteerStage.tsx), deferred: the stage is a separate chunk,
 * fetched and mounted once the page has painted and the main thread is idle (ahead of the
 * plates' deferred art), so it never competes with the hero for the first paint. Until then
 * nothing renders here (he isn't on the page yet; the claw brings him in as before).
 */
/** ms after the first render by which he is mounted, idle or not. */
const MOUNT_DEADLINE = 700;

export function Puppeteer() {
  const [Stage, setStage] = useState<ComponentType | null>(null);
  useEffect(() => {
    let live = true;
    // v2.12: fetch the chunk straight away (in parallel with the first paint).
    // v2.13: mount it when the main thread is idle OR after a hard deadline, whichever comes first: a busy
    // page keeps producing short idle slices and could hold him off screen for seconds
    const chunk = import('./PuppeteerStage');
    let mounted = false;
    const mount = () => {
      if (mounted) return;
      mounted = true;
      chunk.then((m) => {
        if (live) setStage(() => m.PuppeteerStage);
      });
    };
    const off = whenIdle(mount, true);
    const deadline = window.setTimeout(mount, MOUNT_DEADLINE);
    return () => {
      live = false;
      off();
      window.clearTimeout(deadline);
    };
  }, []);
  return Stage ? <Stage /> : null;
}
