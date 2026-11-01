import { Analytics } from '@vercel/analytics/react';
import { ArtDefs } from './art/ArtDefs';
import { Depth, HexLattice, SpiderLeg, Splatter } from './art/Decor';
import { PrintedPlate } from './art/PrintedPlate';
import { Puppeteer } from './art/Puppeteer';
import { CircuitTree } from './components/CircuitTree';
import { Honeycomb } from './components/HexShards';
import { Cta, PlateHeader, Prose } from './components/ui';
import { before, contact, hubPlate, interlude, nav, now, practice, site } from './content/site';
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
          {/* ---- Before ---- */}
          <div className="plate-slot relative grid lg:grid-cols-12">
            <Depth depth={0.7} className="-left-48 -top-40">
              <HexLattice cols={8} rows={7} r={40} tone="far" seed={21} />
            </Depth>
            <Depth depth={0.15} className="-right-10 top-1/3 hidden lg:block">
              <Splatter size={170} seed={31} />
            </Depth>
            <PrintedPlate id="before" side="right" className="mx-6 lg:col-span-7 lg:mx-0">
              <PlateHeader n="01" eyebrow={before.eyebrow} title={before.title} />
              <Prose paragraphs={before.body} />
            </PrintedPlate>
          </div>

          {/* ---- Practice ---- */}
          <div className="plate-slot relative grid lg:grid-cols-12">
            <Depth depth={0.4} className="-top-72 left-[8%] hidden md:block">
              <SpiderLeg length={620} t={18} tone="mid" delay={2} />
            </Depth>
            <PrintedPlate id="practice" side="left" className="mx-6 lg:col-span-8 lg:col-start-5 lg:mx-0">
              <PlateHeader n="02" eyebrow={practice.eyebrow} title={practice.title} />
              <Prose paragraphs={practice.body} />
              <Honeycomb
                className="mt-12"
                variant="static"
                cols={4}
                label="Capabilities"
                items={practice.capabilities.map((c) => ({ label: c }))}
              />
            </PrintedPlate>
          </div>

          {/* ---- Interlude: the question ---- */}
          <div className="plate-slot relative">
            <Depth depth={-0.2} className="-left-6 -top-24">
              <Splatter size={240} seed={44} />
            </Depth>
            <PrintedPlate side="right" tone="ink" perch={0.12} className="mx-6 lg:mx-0 lg:-rotate-1">
              <p className="type-display-medium max-w-[18ch] text-on-surface">{interlude.question}</p>
              <p className="type-headline-medium mt-6 italic text-on-surface-variant">{interlude.followUp}</p>
            </PrintedPlate>
          </div>

          {/* ---- Now ---- */}
          <div className="plate-slot relative grid lg:grid-cols-12">
            <Depth depth={0.6} className="-right-56 -top-32">
              <HexLattice cols={7} rows={8} r={44} tone="far" seed={57} />
            </Depth>
            <Depth depth={0.3} className="-top-80 right-[12%] hidden md:block">
              <SpiderLeg length={540} t={15} tone="near" flip delay={3.5} />
            </Depth>
            <PrintedPlate id="now" side="right" className="mx-6 lg:col-span-7 lg:col-start-2 lg:mx-0">
              <PlateHeader n="03" eyebrow={now.eyebrow} title={now.title} />
              <p className="type-body-large text-on-paper-variant">{now.lede}</p>
              <ul className="mt-8 grid border-t border-ink/20 md:grid-cols-2">
                {now.areas.map((a) => (
                  <li key={a} className="flex items-center gap-4 border-b border-ink/20 py-5 md:odd:pr-6">
                    <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true" className="flex-none">
                      <polygon points="3.5,0.5 10.5,0.5 13.5,6 10.5,11.5 3.5,11.5 0.5,6" className="fill-ink" />
                    </svg>
                    <span className="type-headline-medium">{a}</span>
                  </li>
                ))}
              </ul>
            </PrintedPlate>
          </div>

          {/* ---- Links: the circuit tree (data: src/content/links.ts) ---- */}
          <div className="plate-slot relative grid lg:grid-cols-12">
            <Depth depth={0.5} className="-left-40 -top-24">
              <HexLattice cols={6} rows={6} r={38} tone="far" seed={63} />
            </Depth>
            <PrintedPlate id="links" side="right" className="mx-6 lg:col-span-8 lg:col-start-1 lg:mx-0">
              <PlateHeader n="04" eyebrow={hubPlate.eyebrow} title={hubPlate.title} />
              <CircuitTree className="mt-10" label={hubPlate.eyebrow} />
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
