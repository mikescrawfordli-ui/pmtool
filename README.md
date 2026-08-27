# Manning Board

A labor scheduler for multi-site commissioning work. It holds a roster per site,
runs everyone's travel or local rotation, and tells you the moment a skill drops
below what the site needs — or climbs above what it can use.

Built for ADC2 / ADC3 / ADC4, but every site, skill target, and person is
editable, so it carries forward to the next program.

---

## Deploy it

```bash
npm install
npm run dev        # http://localhost:5173
```

To put it online:

1. Push this folder to a new GitHub repository.
2. Go to vercel.com → **Add New → Project** → import that repository.
3. Vercel detects Vite on its own. Leave every setting alone and hit **Deploy**.

No login, no environment variables, no database to provision.

---

## Where your data lives

Everything is saved in your browser's local storage on the machine you're using.
Nothing is uploaded, and there's no account. Two consequences worth knowing:

- The plan **will not** follow you to a different computer or a different browser
  on its own.
- Clearing site data for the deployment URL erases it.

So: **Setup → Export backup** writes a `.json` you can keep in Drive or the repo,
and **Import backup** loads it anywhere. Do that before switching machines.

If you later want the plan shared live across a crew, the whole storage layer is
four functions in `src/lib/storage.js`. Swap them for `fetch()` calls against a
Vercel Postgres or KV store and nothing else in the app has to change. Keep in
mind that without a login, anyone with the URL could edit it.

---

## The five tabs

**Dashboard** — the coverage strip is the main event: one row per skill, one cell
per week, showing the *worst day* of that week. Hatched red is below target.
Below it, charts for coverage against target, skill surplus and shortfall, and
crew size. The Bench depth table at the bottom is the one to read when something
won't go green — see "Why a gap won't close" below.

**Roster** — every person, with a checkbox per skill: RCx, ECx, MCx, Quality,
Injection, SCCAF, OFE. Add people, remove them, or move someone to another site
with the Site dropdown. Book vacation with the Time off button. The Day off /
travel column holds each local's day-off cycle and each traveler's Long travel
setting.

**Schedule** — the week grid. Click any week to pin it as a home week; click
again to release it. Auto-balance is here too.

**Requirements** — how many of each skill the site needs per day. Set a base
number per skill, then override individual weeks as the project moves through
phases. The bulk row sets a whole range at once.

**Setup** — program start date and length, the consecutive-week cap, adding and
renaming sites, and backup/export.

---

## How the rotation actually works

Travelers run **3 weeks on, 1 week home** (change the cap on Setup). Rather than
a fixed repeating pattern, the app walks the weeks carrying a count of
consecutive weeks worked. Two things fall out of that:

- **Nobody can ever be scheduled past the cap.** It isn't a warning, it's
  structural. Verified against several hundred randomized vacation patterns.
- **Vacation resets the count.** Someone back from two weeks off gets a full
  fresh three-week run instead of an almost-immediate home week, so you don't
  lose their time twice.

### Travel days

By default a traveler flies in Sunday and out Friday night, so they are on site
all five days.

Tick **✈ Long travel** on the Roster for anyone whose flight is too long to do
that every week. They then alternate between two profiles, switching every
rotation:

| Rotation | Travel | On site |
|---|---|---|
| 1st | In Monday, out late Friday | Tue–Fri |
| 2nd | In Sunday, out Thursday night | Mon–Thu |
| 3rd | back to In Monday, out late Friday | Tue–Fri |

Each rotation costs one day on site, but the changeover between them gives a
long block at home — out Thursday night, not back until the following Monday —
instead of two short weekends. The dropdown next to the checkbox picks which
profile their **first** rotation uses; it alternates automatically after that,
and auto-balance will pick the phase that covers best unless you Lock them.

### Locals' days off

Locals work every week and take one Monday or Friday off on a recurring cycle.
Three controls, all per person:

- **How often** — Every 2 weeks, Every 3 weeks, or Never
- **Which day** — Monday or Friday
- **Which week** of the cycle it lands on

Auto-balance staggers the day and the week across your locals so their days off
don't collide, but it never changes the frequency you picked — including Never.
That makes Never the escape hatch when a target can't otherwise be held.

All of this is why coverage is judged per day, not per week: travel days and
locals' days off both land on Mondays and Fridays, which is exactly where a
minimum quietly breaks. The Dashboard's **Day-of-week detail** card shows the
focused week day by day so you can see those dips directly.

**Auto-balance** tries every rotation slot for every traveler and every day-off
slot for every local, over and over, keeping whatever arrangement scores best.
Missing people are weighted far above surplus people, which is above keeping crew
size steady week to week. Tick **Lock** on the Roster to pin someone's rotation
and make the balancer work around them. A 120-person, 52-week site balances in
about half a second.

---

## Why a gap won't close

Auto-balance rearranges people; it can't conjure them. When a red cell survives
a balance, the Dashboard says which of the two reasons applies.

**Not enough people** — fewer bodies have the skill than the target requires.
Tick the skill for someone else, or move someone in from an adjacent site.

**Target can't be held every day** — you have the headcount, but not on the worst
day. The Bench depth table shows the *guaranteed floor*: what's left after the
travelers who are home, the locals on their day off, and the long-travel people
in the air. If the floor is 3 and you need 4, no arrangement reaches 4. The
advice names which of those three is costing you the most.

Two of these showed up in your starting roster:

- **ADC2 injection.** One person on the whole site does injection testing, and
  he's a traveler, so ADC2 has no injection cover during his home weeks. Either
  cross-train an ADC2 local, or lend an injection-qualified person from ADC3 —
  ADC3 has four, two of them local, so it can spare one.
- **ADC2 RCx at 4/day.** Five people have RCx, but with one traveler home and one
  local on a Friday, only three are guaranteed. Adding injection to a local *and*
  setting both RCx locals to no day off gets ADC2 to a clean board; so does
  adding a sixth RCx person. Flagging RCx travelers as Long travel costs another
  body on the worst day, so watch that number if you turn it on there.

---

## Adding a skill column

Add the string to `SKILLS` in `src/lib/constants.js` and give it a label in
`SKILL_LABELS`. The roster checkboxes, requirements grid, coverage strip, charts,
and bench table all pick it up with no other changes.

---

## Notes on the seed roster

Names are stored as first name plus last initial, from the manning plan document.
**SCCAF and OFE are unchecked for everyone** — the source document doesn't track
them, so tick those columns yourself as you confirm who's qualified. Lift
certification marked "pending by 8/31/26" is counted as certified, since the
schedule starts in September; that's worth confirming before you rely on it.
