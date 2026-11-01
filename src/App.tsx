import { Analytics } from '@vercel/analytics/react';
import { ArtDefs } from './art/ArtDefs';
import { Depth, HexLattice, SpiderLeg, Splatter } from './art/Decor';
import { PrintedPlate } from './art/PrintedPlate';
import { Puppeteer } from './art/Puppeteer';
import { CircuitTree } from './components/CircuitTree';
import { Experiment } from './components/Experiment';
import { Cta } from './components/ui';
import { experiments, interlude, log, nav, next, site, ui } from './content/site';
import { Hero } from './sections/Hero';

/*
 * Composition: fog-lit stage, ink silhouettes at three depths, paper-cut plates printed by
 * rail-mounted arms as you scroll, and a ceiling arm that carries the character between them.
 * Orange = nozzle hot tip + print line only (plus focus ring / link-hover underline).
 */
export default function App() {
  return (
    <>
      <ArtDefs />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-paper focus:px-4 focus:py-2 focus:text-on-paper">
        {ui.skip}
      </a>

      <header className="header-fade fixed inset-x-0 top-0 z-40 pb-6">
        <div className="shell flex h-16 items-center justify-between">
          <a href="#top" className="type-label-large inline-flex min-h-11 items-center text-on-surface">
            {ui.mark}
            <span className="sr-only"> {ui.markName}</span>
          </a>
          <nav aria-label={ui.primaryNav}>
            <ul className="flex gap-5 md:gap-8">
              {nav.map((n) => (
                <li key={n.id}>
                  <a href={`#${n.id}`} className="type-label-small md:type-label-medium inline-flex min-h-11 items-center text-gray-300 transition-colors duration-200 ease-standard hover:text-on-surface">
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main id="main" className="relative">
        <Hero />

        <div className="shell relative pb-40">
          {/* ---- The experiment log (docs/NARRATIVE.md) ---- */}
          {/* EXP. 01 */}
          <div className="plate-slot relative grid lg:grid-cols-12">
            <Depth depth={0.7} className="-left-48 -top-40">
              <HexLattice cols={8} rows={7} r={40} tone="far" seed={21} />
            </Depth>
            <Depth depth={0.15} className="-right-10 top-1/3 hidden lg:block">
              <Splatter size={170} seed={31} />
            </Depth>
            <PrintedPlate id={experiments[0].id} side="right" className="mx-6 lg:col-span-7 lg:mx-0">
              <Experiment exp={experiments[0]} />
            </PrintedPlate>
          </div>

          {/* EXP. 02 */}
          <div className="plate-slot relative grid lg:grid-cols-12">
            <Depth depth={0.4} className="-top-72 left-[8%] hidden md:block">
              <SpiderLeg length={620} t={18} tone="mid" delay={2} />
            </Depth>
            <PrintedPlate id={experiments[1].id} side="left" className="mx-6 lg:col-span-6 lg:col-start-6 lg:mx-0">
              <Experiment exp={experiments[1]} />
            </PrintedPlate>
          </div>

          {/* EXP. 03 */}
          <div className="plate-slot relative grid lg:grid-cols-12">
            <Depth depth={0.6} className="-right-56 -top-32">
              <HexLattice cols={7} rows={8} r={44} tone="far" seed={57} />
            </Depth>
            <PrintedPlate id={experiments[2].id} side="right" className="mx-6 lg:col-span-7 lg:col-start-2 lg:mx-0">
              <Experiment exp={experiments[2]} />
            </PrintedPlate>
          </div>

          {/* EXP. 04 — in progress */}
          <div className="plate-slot relative grid lg:grid-cols-12">
            <Depth depth={0.3} className="-top-80 right-[12%] hidden md:block">
              <SpiderLeg length={540} t={15} tone="near" flip delay={3.5} />
            </Depth>
            <PrintedPlate id={experiments[3].id} side="left" className="mx-6 lg:col-span-7 lg:col-start-5 lg:mx-0">
              <Experiment exp={experiments[3]} hypothesis={[interlude.question, interlude.followUp]} />
            </PrintedPlate>
          </div>

          {/* EXP. 05 — the next run, with the visitor: the ways to start it */}
          <div className="plate-slot relative grid lg:grid-cols-12">
            <Depth depth={0.5} className="-left-40 -top-24">
              <HexLattice cols={6} rows={6} r={38} tone="far" seed={63} />
            </Depth>
            <Depth depth={0.2} className="-right-10 top-10 hidden lg:block">
              <Splatter size={150} seed={72} />
            </Depth>
            <PrintedPlate id={next.id} side="right" className="mx-6 lg:col-span-8 lg:col-start-3 lg:mx-0">
              <Experiment exp={next}>
                <Cta cta={site.cta} />
                <CircuitTree className="mt-10" label={log.linksLabel} />
              </Experiment>
            </PrintedPlate>
          </div>
        </div>
      </main>

      <footer className="relative bg-ink">
        <div className="shell flex flex-col gap-2 py-8 md:flex-row md:justify-between">
          <p className="type-label-small text-secondary">© {new Date().getFullYear()} {site.name}</p>
          <p className="type-label-small normal-case text-secondary">{site.footerEgg}</p>
        </div>
      </footer>

      <Puppeteer />
      <Analytics />
    </>
  );
}
