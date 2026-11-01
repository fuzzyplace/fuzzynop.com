# Content — source of truth for site copy

**Direction from Z (2026-10-31):** understated. Don't name-drop anything — no employers, titles, conferences, clients, publications, or collaborators. Speak generally about vibe, capabilities, and what's next. No hype, no buzzwords, no "passionate about" lists. Let the work speak.

Copy lives in `src/content/site.ts`. Only publish what's in "Approved copy" below.

## Approved copy (Z's words, 2026-10-31)
> I spent my career as a hacker and an executive. Red teaming, building teams, leading at the top.
>
> I retired from that world, and what came after wasn't a pivot so much as a return: to art, to community, to the questions underneath all of it.
>
> I create things. Not as a job title, but as a way of thinking. Interfaces, rituals, small systems that sit at the edge of code and consciousness. I lead projects and I lead people, and I care about both in the same way.
>
> These days I'm working at the intersection of consciousness, wellness for hackers, AI safety, and cyborg psychology.
>
> The through-line of my whole career has been the same question: what happens when humans and machines meet, and how do we stay human in the process?

## Copy rules (Z, 2026-11-02)
- Z's voice: plain, direct, first person. Professional, human, a little dry. Never AI-sounding.
- **No em or en dashes anywhere on the page, share card or meta.** Use a period, comma, colon or slash. Enforced by `src/content/copy.test.ts`.
- No stock phrasing ("journey", "passionate", "leverage", "unlock", "where X meets Y"), no exclamation marks, no emoji.

## How it maps to the site (Z, 2026-11-02)
| Where | Copy | Source |
|---|---|---|
| Identity / title | Josh Schwartz / FuzzyNop | Z |
| Hero | "Team Builder, / Red Teamer, / Professional Bogeyman" + "Finding creative, empathetic security solutions for cyborgs." | Z |
| 01 Past | **Hacker / Executive.** "I started out tracking bad guys. Then I switched sides and played the adversary for a living." "Over time that grew into building teams and leading in the security space." | Z (shaped) |
| 02 Present | **The human side.** "Lately I’m working on how hackers take care of their own heads, what AI safety looks like from the human side, and what happens to our minds as machines start to seem more human." | Z (title from his words) |
| The question | "The through-line of my whole career has been the same question:" "What happens when humans and machines meet?" "And how do we stay human in the process?" | Z |
| 03 Future | **What I’m looking for.** "The chance to make a real impact, either building a team or guiding a project in:" Red teaming · AI safety · Consciousness exploration · Wellness for security professionals and hackers. "Or anything at the forefront of cyborg psychology." | Z (shaped) |
| 04 Contact | **Say hello.** "If you’re working on any of this, or think I could help, get in touch." CTA "Message me · LinkedIn" | drafted, Z to confirm |
| Elsewhere | Circuit tree: Work (LinkedIn), Make (SoundCloud, Spotify, Mixcloud) | Z |
| Hidden trust line | "Nothing here is secure." "He feels safe anyway." | Z |
| Footer | `0x90 0x90 0x90 · nothing happened here` | v1 (dash removed) |
| Meta / share | Title "Josh Schwartz / FuzzyNop"; description = tagline + hero line; OG image = tagline | derived |
| UI labels | Nav Past / Present / Future / Contact; "Elsewhere"; "Skip to content" | UI |

Retired from the page (still Z's words): the retirement/return-to-art paragraph, "I create things" paragraph and list, "These days" areas, "What would happen if".

## Allowed links (own profiles only)
- LinkedIn https://www.linkedin.com/in/joshuaaschwartz/
- SoundCloud https://soundcloud.com/fuzzynop
- Spotify https://open.spotify.com/artist/2KxitG0vU3vl3JaMcovgqM · Mixcloud https://www.mixcloud.com/FZZY/ (shown on the Make branch; Z to confirm Mixcloud)
- Public contact email: [TODO] — never personal Gmail without explicit OK.

## Background — reference only, DO NOT PUBLISH
Kept so Claude understands the person, not for the page. Don't surface names, employers, titles, venues, or projects from here unless Z explicitly asks.
- Long career in offensive security and security leadership: built and led red teams and large security orgs, held executive security roles at large internet companies; earlier consulting.
- Many years of conference talks on red teaming, social engineering, behavioral security (archive exists).
- After: art and immersive spaces, community building, teaching, game design, DJing, a hacker-wellness nonprofit, writing/journalism on cyborg psychology, AI safety work.
- v1 site (`legacy/v1/`) has the old, name-heavy version.
- Z's self-description (never on the page, not for meta copy): "a series of experiments at the boundaries of safety and security, where humans and machines meet."

## Never publish
Names of employers, clients, conferences, publications, collaborators, or organizations · home addresses · personal email/phone · relationships/family · health · job search · relocation · applications · finances.
