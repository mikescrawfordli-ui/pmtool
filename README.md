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
with the Site dropdown. Book vacation with the Time off button.

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

Locals work every week and take **one Monday or Friday off every other week**.
That's why coverage is judged per day, not per week: a local's Friday off is
exactly the kind of thing that quietly drops you below your RCx minimum.

Setting a local's day off to **None** is treated as a deliberate decision, and
auto-balance will not hand the day back. That's the escape hatch when a target
can't otherwise be held.

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
travelers who are home and the locals on their day off. If the floor is 3 and you
need 4, no arrangement reaches 4.

Two of these showed up in your starting roster:

- **ADC2 injection.** One person on the whole site does injection testing, and
  he's a traveler, so ADC2 has no injection cover during his home weeks. Either
  cross-train an ADC2 local, or lend an injection-qualified person from ADC3 —
  ADC3 has four, two of them local, so it can spare one.
- **ADC2 RCx at 4/day.** Five people have RCx, but with one traveler home and one
  local on a Friday, only three are guaranteed. Adding injection to a local *and*
  setting both RCx locals to no day off gets ADC2 to a clean board; so does
  adding a sixth RCx person.

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
