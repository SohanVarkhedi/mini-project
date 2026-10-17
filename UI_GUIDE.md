# PhishVerse UI guide

The single source of truth for how the portals look, read and move. Every UI task follows this file.
If a UI/design/animation skill is available in your Claude Code session, use it too; where it
disagrees with this file, **this file wins**.

## 1. Three surfaces, one product

| Surface | Who / device | Character |
|---|---|---|
| **Game** (canvas, HUD, dialog, encounters) | Employee, any device | Existing pixel-art office. **Locked**: dialog box design, gold quest-highlight language, encounter layout. Do not restyle. |
| **Manager portal** | Laptop / projector, 1280–1920 px | A security operations console: calm, dense, scannable. Data first. |
| **Employee portal** | Phone first (360–430 px), also laptop | A personal quest log: one clear next step, encouraging, quick. |

Both portals share tokens and components. They differ in layout and density.

## 2. The subject drives the look

PhishVerse trains people to **read carefully**: spot `novac0rp.com` vs `novacorp.com`, an `.html`
"invoice", a caller ID that doesn't match. So the design is built on legibility:

- **Body/UI typeface: Atkinson Hyperlegible Next** (designed by the Braille Institute so that
  similar letters can't be confused). **Data typeface: Atkinson Hyperlegible Mono** for email
  addresses, domains, URLs, phone numbers, verify codes and numbers in tables.
- **Display typeface: Pixelify Sans**, used with restraint: page titles, level names, the
  certificate title, big result numbers. It ties the portals to the game. Never for body text.
- Load from Google Fonts: `Atkinson Hyperlegible Next` (400, 500, 700, 800),
  `Atkinson Hyperlegible Mono` (400, 600), `Pixelify Sans` (500, 700).
  Fallback stacks: `"Atkinson Hyperlegible Next", "Atkinson Hyperlegible", system-ui, sans-serif`;
  `"Atkinson Hyperlegible Mono", ui-monospace, Menlo, Consolas, monospace`.

### Signature elements (use exactly these, nowhere else)
1. **The gold next-step marker.** The same gold diamond ◆ that marks quests in the game marks the
   single next action on any portal screen ("Start Level 2", "Begin training", "Take the test").
   Rule: **at most one gold marker per screen.** Gold means "this is where you go next", nothing else.
2. **Inspected text.** Anywhere an address, domain or link is shown, render it with the `.addr`
   component (mono font). In reports and reviews, confusable characters are underlined in red
   with a tooltip ("zero, not the letter o"). This is the product's skill made visible.
3. **The live pipeline** (manager overview): people move between journey columns in real time when
   they progress on their own device. This is the demo's wow moment; make it smooth and exact.

## 3. Colour tokens

Defined once in `web/css/tokens.css` on `:root`, with a dark set under
`@media (prefers-color-scheme: dark)` and `[data-theme="dark"|"light"]` overrides (theme toggle:
System / Light / Dark, stored per device). The manager portal defaults to the system theme; the
game is always dark.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#F2F4F7` | `#0D1522` | Page background |
| `--surface` | `#FFFFFF` | `#141F31` | Panels, rows, drawers |
| `--surface-2` | `#E8ECF1` | `#1B2940` | Hover rows, inset areas, inputs |
| `--ink` | `#13203A` | `#E7ECF4` | Primary text |
| `--ink-2` | `#4B5870` | `#9DAAC0` | Secondary text |
| `--line` | `#D6DCE5` | `#26344D` | Borders, dividers |
| `--gold` | `#E3A21A` | `#F2B53A` | Next-step marker, primary button fill |
| `--gold-ink` | `#3A2800` | `#2A1D00` | Text on gold |
| `--safe` | `#1D8A57` | `#3CCB86` | Safe outcome, strengths, passed |
| `--caution` | `#B86E00` | `#F0A23C` | Acceptable / watch / overdue soon |
| `--danger` | `#C23B3B` | `#FF6E6E` | Compromise, weak spot, failed, overdue |
| `--info` | `#2B65D9` | `#73A7FF` | Links, informational states, false alarm |

Rules: semantic colours always come with an icon or text label (never colour alone). Gold is not a
generic accent. No gradients on UI surfaces, no glassmorphism in the portals (the game HUD keeps its
own look). Text contrast ≥ 4.5:1 in both themes.

## 4. Type scale and spacing

- Type scale (rem): 0.75 · 0.875 · 1 (body) · 1.125 · 1.375 · 1.75 · 2.25 (display, Pixelify) · 3 (result numbers).
  Line height 1.5 for body, 1.15 for display. Labels: 0.75rem, weight 700, letter-spacing 0.08em, uppercase.
  `font-variant-numeric: tabular-nums` on every number in tables, KPIs and timers.
- Spacing scale (px): 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64. Lay out with flex/grid `gap`, not margins.
- Radius: 6 (inputs, chips), 10 (panels), 999 (pills, avatars). Don't round everything the same.
- Max text width 65ch. Page side gutter ≥ 16 px at every width; no horizontal scroll ever.

## 5. Layouts

### Manager portal (desktop first)
```
┌──────┬─────────────────────────────────────────────────────────┐
│ rail │ top bar: page title · search · theme · live dot · me   │
│      ├─────────────────────────────────────────────┬───────────┤
│ Over │  KPI strip (4 compact stats, one line each)  │ Live      │
│ view │  Pipeline board: Assigned │ Playing │ Skills │ activity  │
│ Peo- │  report │ Training │ Test │ Certified       │ feed      │
│ ple  │  (people as chips, move live)                │ (newest   │
│ Prog │  Team skills heatmap (people × skills)       │  on top)  │
│ rams │                                              │           │
│ Repo │                                              │           │
└──────┴─────────────────────────────────────────────┴───────────┘
```
- Rail collapses to icons < 1280 px and to a top menu < 768 px; the feed moves below the board < 1100 px.
- People open in a **right-side drawer** (journey timeline, skills report, decisions, test attempts,
  certificate) so the board stays in view.
- Tables for lists of people; panels only for real objects (a program, a person, a certificate).

### Employee portal (phone first)
```
┌──────────────────────┐
│ Hi Meera        (av) │
│ Program card: due    │
│ date · manager note  │
├──────────────────────┤
│ Your journey         │
│ ● Game  ✓ 82%        │
│ ◆ Skills report  →   │  ← gold marker on the one next step
│ ○ Training (3 sims)  │
│ ○ Final test         │
│ ○ Certificate        │
├──────────────────────┤
│ Journey Skills Certs │  ← bottom nav on phones (≥ 44 px targets)
└──────────────────────┘
```
- On laptops the same content sits in a centred 720 px column with a top nav instead of bottom nav.
- The game opens full-screen from the journey and returns to it.

## 6. Components (build once in `web/css/components.css` + small JS helpers)
Buttons (primary = gold fill + gold-ink text; secondary = outline; quiet = text), status pill
(icon + label: Not started / In progress / Passed / Failed / Overdue), chip (person avatar + name),
field (label above, hint below, error below in danger colour with the fix), select, checkbox,
segmented control, tabs, table (sticky header, zebra on hover only), drawer (right, 480 px, full
screen on phones), modal (centred, only for confirmations), toast, skeleton loader, empty state
(one sentence + one action), avatar (initials), progress bar, progress ring, skill bar
(label + value + band: Strong / Watch / Weak), `.addr` inspected text, gold next-step marker,
live dot. A `/styleguide.html` page shows every component in both themes.

## 7. Motion (from Emil Kowalski's design-engineering rules)
- Tokens: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`; `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`;
  `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`. Never `ease-in` for UI. Never `transition: all`.
- Durations: press feedback 120 ms; popovers/toasts 180–220 ms; drawers 280 ms; pipeline card move
  320 ms (FLIP with `transform`). UI animations stay under 300 ms except that move.
- Buttons and pressable rows: `transform: scale(0.97)` on `:active`.
- Enter from `scale(0.96)` + `opacity: 0`, never from `scale(0)`. Exits faster than entries.
- Only animate `transform` and `opacity`. Use CSS transitions (interruptible) for live updates,
  not keyframes. Gate hover effects behind `@media (hover: hover) and (pointer: fine)`.
- Stagger list entry 40 ms per item, first load only; never block interaction.
- No animation on keyboard-driven navigation or on things seen dozens of times a session.
- New live-feed items slide in 8 px + fade (200 ms). A person moving columns: their chip glides
  to the new column and the column count ticks.
- `prefers-reduced-motion`: keep opacity/colour fades, remove movement, no confetti.
- Toasts follow Sonner's principles: one place (bottom-right desktop, top on phones), stack,
  pause timers when the tab is hidden, swipe/escape to dismiss.

## 8. Copy
Plain English, sentence case, active voice. Name things by what people do: "Assign training",
"Start the test", "Download certificate". A button's verb matches its toast ("Assigned to 3 people").
Errors say what went wrong and how to fix it, without apologising. Empty states invite one action.
Encouraging but honest with employees ("You're most at risk from urgent phone calls. Two short
simulations will help."). Never shame. Indian workplace context, fictional NovaCorp only.

## 9. Accessibility and devices
Visible focus ring (2 px `--info` + 2 px offset) on everything focusable; full keyboard use; ARIA
labels on icon buttons; `aria-live="polite"` on the activity feed and toasts; touch targets ≥ 44 px;
works at 360×740, 390×844, 768×1024, 1280×800, 1440×900, 1920×1080.
Every UI stage ends with Playwright screenshots of its screens at 390×844 and 1440×900 in light
and dark, saved to `test-results/screens/`, plus checks for no horizontal scroll and visible focus.
