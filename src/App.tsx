import { Analytics } from '@vercel/analytics/react';
import { ArtDefs } from './art/ArtDefs';
import { Depth, HexLattice, SpiderLeg, Splatter } from './art/Decor';
import { PrintedPlate } from './art/PrintedPlate';
import { Puppeteer } from './art/Puppeteer';
import { Experiment } from './components/Experiment';
import { Honeycomb } from './components/HexShards';
import { Cta, PlateHeader } from './components/ui';
import { contact, experiments, hub, hubPlate, interlude, nav, site } from './content/site';
import { variants } from './content/variants';
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
        Skip to content
      </a>

      <header className="header-fade fixed inset-x-0 top-0 z-40">
        <div className="shell flex h-16 items-center justify-between">
          <a href="#top" className="type-label-large text-on-surface">FZNP</a>
          <nav aria-label="Primary">
            <ul className="hidden gap-8 md:flex">
              {nav.map((n) => (
                <li key={n.id}>
                  <a href={`#${n.id}`} className="type-label-medium text-gray-300 transition-colors duration-200 ease-standard hover:text-on-surface">
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

          {/* Interlude: the through-line question (?interlude=fold moves it into EXP. 04) */}
          {variants.interlude === 'keep' && (
            <div className="plate-slot relative">
              <Depth depth={-0.2} className="-left-6 -top-24">
                <Splatter size={240} seed={44} />
              </Depth>
              <PrintedPlate side="right" tone="ink" perch={0.12} className="mx-6 lg:mx-0 lg:-rotate-1">
                <p className="type-display-medium max-w-[18ch] text-on-surface">{interlude.question}</p>
                <p className="type-headline-medium mt-6 italic text-on-surface-variant">{interlude.followUp}</p>
              </PrintedPlate>
            </div>
          )}

          {/* EXP. 04 — in progress */}
          <div className="plate-slot relative grid lg:grid-cols-12">
            <Depth depth={0.3} className="-top-80 right-[12%] hidden md:block">
              <SpiderLeg length={540} t={15} tone="near" flip delay={3.5} />
            </Depth>
            <PrintedPlate id={experiments[3].id} side="left" className="mx-6 lg:col-span-7 lg:col-start-5 lg:mx-0">
              <Experiment exp={experiments[3]} hypothesis={variants.interlude === 'fold' ? [interlude.question, interlude.followUp] : undefined} />
            </PrintedPlate>
          </div>

          {/* ---- Hub: links, pieced together ---- */}
          <div className="plate-slot relative grid lg:grid-cols-12">
            <Depth depth={0.5} className="-left-40 -top-24">
              <HexLattice cols={6} rows={6} r={38} tone="far" seed={63} />
            </Depth>
            <PrintedPlate id="links" side="right" className="mx-6 lg:col-span-8 lg:col-start-1 lg:mx-0">
              <PlateHeader n="04" eyebrow={hubPlate.eyebrow} title={hubPlate.title} />
              <Honeycomb
                className="mt-10"
                variant="link"
                cols={4}
                label="Links"
                items={hub.map((h) => ({ label: h.label, href: h.href, meta: h.kind }))}
              />
            </PrintedPlate>
          </div>

          {/* ---- Contact: the one call to action ---- */}
          <div className="plate-slot relative grid lg:grid-cols-12">
            <Depth depth={0.2} className="-left-10 top-10 hidden lg:block">
              <Splatter size={150} seed={72} />
            </Depth>
            <PrintedPlate id="contact" side="left" tone="ink" className="mx-6 lg:col-span-5 lg:col-start-7 lg:mx-0">
              <PlateHeader n="05" eyebrow={contact.eyebrow} title={contact.title} tone="ink" />
              <Cta cta={site.cta} />
            </PrintedPlate>
          </div>
        </div>
      </main>

      <footer className="relative bg-ink">
        <div className="shell flex flex-col gap-2 py-8 md:flex-row md:justify-between">
          <p className="type-label-small text-secondary">© {new Date().getFullYear()} {site.name}</p>
          <p className="type-label-small text-secondary">{site.footerEgg}</p>
        </div>
      </footer>

      <Puppeteer />
      <Analytics />
    </>
  );
}
