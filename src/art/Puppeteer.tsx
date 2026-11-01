import { useEffect, useState, type ComponentType } from 'react';
import { whenIdle } from './ticker';

/**
 * The character and his claw (PuppeteerStage.tsx), deferred: the stage is a separate chunk,
 * fetched and mounted once the page has painted and the main thread is idle (ahead of the
 * plates' deferred art), so it never competes with the hero for the first paint. Until then
 * nothing renders here (he isn't on the page yet; the claw brings him in as before).
 */
export function Puppeteer() {
  const [Stage, setStage] = useState<ComponentType | null>(null);
  useEffect(() => {
    let live = true;
    const off = whenIdle(() => {
      import('./PuppeteerStage').then((m) => {
        if (live) setStage(() => m.PuppeteerStage);
      });
    }, true);
    return () => {
      live = false;
      off();
    };
  }, []);
  return Stage ? <Stage /> : null;
}
