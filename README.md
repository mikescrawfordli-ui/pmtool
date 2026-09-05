# Manning Board

A labor scheduler for multi-site commissioning work. It holds a roster per site,
runs everyone's travel or local rotation, and tells you the moment a skill drops
below what the site needs — or climbs above what it can use.

Built for ADC2 / ADC3 / ADC4, but every site, skill target, and person is
editable, so it carries forward to the next program.

---

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173
```

On Windows PowerShell, script execution is often blocked for `npm.ps1`. Use
`npm.cmd run dev` instead — it skips the PowerShell shim and needs no policy
change.

---

## Deploy it

Hosting is Firebase, and it deploys itself. Every push to `main` triggers
`.github/workflows/deploy.yml`, which builds and publishes to
`https://pm-tool-4d33e.web.app`. Pull requests get their own temporary preview URL.

The workflow needs one repository secret, `FIREBASE_SERVICE_ACCOUNT`. See
"First-time Firebase setup" below.

---

## Where your data lives

The plan lives in **Cloud Firestore**, in a single document at `boards/main`,
and it is shared by the whole crew. Open the board on any machine, sign in, and
you get the current plan; edits show up on everyone else's screen within a
second or so.

Sign-in is Google, and the list of people allowed to open the board is in
`firestore.rules`. That list is the entire security boundary — it is enforced
on Google's servers, so it cannot be worked around by editing the app or
calling the database directly. To add or remove someone, edit the list and
redeploy the rules:

```bash
npm.cmd run deploy:rules
```

Your browser also keeps a local copy in localStorage. That is a cache, not the
record: it makes the board paint instantly instead of flashing empty while the
network round-trips, and it keeps the plan readable if the connection drops.

**Setup → Export backup** still writes a `.json`, and it is still worth doing
before anything drastic. Firestore is not a substitute for a backup you hold.

### One board, last write wins

Everyone edits the same document. If two people change the roster at the same
moment, the later save wins and the earlier one is overwritten — there is no
merge. For a crew coordinating on one plan this is usually what you want, but
it is worth knowing before two people start editing different sites at once.

Writes are debounced by 800 ms, so typing a name is one save, not fifteen.

---

## First-time Firebase setup

Only needed once, and most of it is in the Firebase console.

1. **Create a web app.** Firebase console → Project settings (gear) → Your apps
   → Web. Copy the config object it gives you into `src/lib/firebase.js`,
   replacing the `PASTE_...` placeholders. These values are public by design —
   they name the project, they do not grant access to it, and Google documents
   them as safe to commit.

2. **Turn on Google sign-in.** Authentication → Sign-in method → Google →
   Enable.

3. **Create the database.** Firestore Database → Create database → production
   mode. Pick a region near the crew; it cannot be changed later.

4. **Add yourself to the crew list** in `firestore.rules`, then deploy the
   rules and hosting:

   ```bash
   npx.cmd firebase login
   npm.cmd run deploy
   ```

5. **Connect GitHub** so pushes deploy themselves:

   ```bash
   npx.cmd firebase init hosting:github
   ```

   This creates the service account and stores it as a repository secret. Name
   the secret `FIREBASE_SERVICE_ACCOUNT` to match the workflow, and let it
   overwrite the workflow file it offers to write.

6. **Check the authorized domains.** Authentication → Settings → Authorized
   domains should list `pm-tool-4d33e.web.app` and `localhost`. Sign-in fails with
   `auth/unauthorized-domain` if the domain serving the app is not there.

The project ID is `pm-tool-4d33e`, not `pm-tool` — Firebase appended a suffix
because the plain name was taken. `.firebaserc` and the deploy workflow both
use the full ID.

---

## The tabs

**Dashboard** — **Look ahead** is the first thing to read: a condensed strip of
the coming weeks showing only where trouble is, with the first problem named
and the next few listed in order. The window is adjustable from 4 weeks to the
whole program, which is what makes a long horizon usable.

Below it the coverage strip is the detail view: one row per skill, one cell
per week, showing the *worst day* of that week. Hatched red is below target.
Below it, charts for coverage against target, skill surplus and shortfall, and
crew size. The Bench depth table at the bottom is the one to read when something
won't go green — see "Why a gap won't close" below.

**Roster** — every person, with a checkbox per skill: RCx, ECx, MCx, Quality,
Injection, SCCAF, OFE, VT Weld. Add people, remove them, or move someone to another site
with the Site dropdown. Book time off with the Time off button — pick no days
for a whole week, or pick weekdays for single-day PTO. Days apply to every week
in the range, so "every Monday in October" is one booking. The Day off /
travel column holds each local's day-off cycle and each traveler's Long travel
setting.

**Schedule** — the week grid. Click any week to pin it as a home week; click
again to release it. Auto-balance is here too.

**Requirements** — how many of each skill the site needs per day, and whether
those people are **Dedicated**. Set a base number per skill, then override
individual weeks as the project moves through phases. The bulk row sets a whole
range at once.

**Setup** — program start date and length, the consecutive-week cap, adding and
renaming sites, and backup/export. Program length is in weeks with `+1 month` /
`+3 months` / `+6 months` shortcuts, up to five years. Adding weeks never
disturbs what is already planned.

**Access** — admins only. Who can open the board and at what level. See
"Who can get in" below.

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
and make the balancer work around them.

Scoring a day with dedicated skills means solving that day's assignment, which
is far more work than adding up counts. Hill climbing revisits the same day
composition constantly, so results are cached on the skill-sets present and
what the week demands — most lookups hit. A 120-person, 52-week site with five
dedicated skills balances in about a third of a second.

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

## Who can get in

Sign-in is Google. Who may open the board lives in the `members` collection in
Firestore, one document per person keyed by email, and admins manage it from
the **Access** tab — no redeploy, and nobody needs the Firebase console.

| Level | Can do |
|---|---|
| **Admin** | The whole app, plus adding and removing people and changing roles |
| **Content manager** | The whole app. Cannot change who has access |
| **Viewer** | Read only. Can look at everything and export, cannot change anything |

`firestore.rules` reads that same collection, so the rules are the enforcement
point: a viewer cannot write even by tampering with the browser, and someone
who is not on the list cannot read the board at all.

One address is hardcoded as `owner()` in the rules and always keeps admin
access. That is deliberate — it means no mistake on the Access tab, including
the last admin demoting themselves, can lock everybody out. It is the one thing
that needs a rules edit to change, and it must match `OWNER_EMAIL` in
`src/lib/firebase.js`.

### Time off, by week or by day

A whole-week booking takes someone off site for the week and **resets** their
consecutive-week counter, so they come back to a full fresh rotation.

A day booking keeps them on the rotation and only removes those weekdays.
Booking a Friday is not a week of leave, and counting it as one would both
understate the crew and hand out an unearned rotation reset. Day bookings stack
with a traveler's flight day and a local's day off, so someone on long travel
who books Friday works Tuesday to Thursday.

---

## Dedicated skills, and why the numbers changed

By default a skill target asks "is somebody qualified here?" — so one person
ticked for RCx, Injection and SCCAF counts once in each of those three rows on
the same day. That is the right question when the work is occasional and one
person can pick it up alongside their main job.

It is the wrong question when the work has to happen in parallel. Four people
on RCx means four people doing RCx and nothing else; the Injection tech has to
be a fifth body.

Tick **Dedicated** on the Requirements tab for those skills. A dedicated target
commits people to that skill alone, and the dashboard then counts bodies
actually doing the work rather than bodies capable of it. Skills left
undedicated share whoever the dedicated targets did not claim.

Turning Dedicated on will usually make coverage look worse. Nothing about the
crew changed — the old number was counting some people two or three times.

### How it is worked out

Deciding whether a set of dedicated targets can be met is an assignment
problem, not a sum. Say four people do RCx only, a fifth does RCx and
Injection, and the site wants 4 RCx plus 1 Injection. Handing RCx its four
people first might take the dual-skilled one and leave Injection empty, which
would report a shortfall that a different arrangement avoids.

So each day is solved as a bipartite matching (Kuhn's algorithm): every slot
tries to claim a free person, and failing that, takes an assigned one and
recursively re-homes whoever is displaced. That re-homing is what makes the
answer a true maximum. It is verified against brute-force enumeration over
random rosters.

The **Unassigned** row on the coverage strip is the slack left after every
dedicated target is served — the people free for soft skills, punch lists, and
whatever the week throws up.

### When dedicated targets collide

Checking skills one at a time misses the most common failure. If five people
hold RCx and one holds Injection, both targets look satisfiable on their own —
but if the Injection tech is one of the five, "4 dedicated RCx + 1 dedicated
Injection" needs five distinct bodies out of five, and a single absence breaks
it.

The dashboard checks every *combination* of dedicated skills for this and says
so directly, naming the skills that are competing and how many bodies short you
are. It is checked on raw headcount, so anything it reports is broken before
rotation is even considered.

---

## Adding a skill column

Add the string to `SKILLS` in `src/lib/constants.js` and give it a label in
`SKILL_LABELS` (the key is the storage name and needs no spaces; the label is
what people read, so `VTWeld` / `VT Weld`). Add it to the migration in
`src/lib/storage.js` — boards saved before the skill existed have no entry for
it, and the Requirements tab reads that entry directly. The roster checkboxes, requirements grid, coverage strip, charts,
and bench table all pick it up with no other changes.

---

## Notes on the seed roster

Names are stored as first name plus last initial, from the manning plan document.
**SCCAF and OFE are unchecked for everyone** — the source document doesn't track
them, so tick those columns yourself as you confirm who's qualified. Lift
certification marked "pending by 8/31/26" is counted as certified, since the
schedule starts in September; that's worth confirming before you rely on it.
