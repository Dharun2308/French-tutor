# Phase 3 design: Weak French, Active 10, and Tutor Mode

Status: **draft for owner approval — do not implement yet**

This phase turns review history into a short, useful speaking agenda. It does not
replace FSRS, change existing due dates, or add another daily maintenance task.

## Outcomes

After this phase, the learner can:

1. Open **Weak French** and see which personal lesson items need attention and why.
2. Bring an automatically refreshed **Active 10** into an iTalki lesson.
3. Pin an important item so it survives weekly refreshes, or replace an unhelpful pick.
4. Mark each target after the lesson as **Used naturally**, **Used with help**, or
   **Didn't use** in a few taps.
5. See recurring error categories backed by actual review attempts.

The phase adds no generative-AI calls. Ranking and aggregation are deterministic.

## Product rules

- FSRS remains the only scheduler. Weak scores never alter `due_at`.
- Tutor feedback is real-world mastery evidence, not a synthetic flashcard review.
- Active 10 refreshes automatically once per local calendar week. Pinning is optional.
- New lesson items can rank highly even before they have review history.
- Every score has a short explanation; the UI never exposes unexplained decimals.
- Only user-approved `learning_items` are eligible. Suspended items are excluded.
- No streaks, points, badges, leaderboards, or mandatory weekly workflow.

## Weak-item score

Create a pure module at `src/lib/items/weak-score.ts`. It returns a clamped score
from 0–100 plus component values and two short reason labels. Higher means more
useful to target now.

```text
score =
  40 * recallRisk
+ 25 * failureEvidence
+ 15 * correctionRecency
+ 20 * usefulness
- transferCredit
```

### Components

**Recall risk (0–1)**

- Reviewed item: `1 - retrievability(item, now)` from the existing FSRS wrapper.
- Never-reviewed item: `1`. It is unproven and should enter the first Active 10.

**Failure evidence (0–1)**

- Use up to the last 10 production reviews for the item.
- Severity: Again `1`, Hard `0.6`, Good/Easy `0`.
- Weight each observation by `2 ^ (-ageDays / 21)` so old failures fade.
- Divide the weighted severity sum by the total observation weight.
- With no reviews, use `0`; newness is already represented by recall risk.

**Correction recency (0–1)**

- Non-corrections: `0`.
- Corrections: `max(0.35, 2 ^ (-ageDays / 45))`.
- A tutor correction therefore stays somewhat important without permanently
  crowding out current weaknesses.

**Usefulness (0–1)**

```text
0.75 * ((priority - 1) / 4)
+ 0.25 * (min(encounterCount - 1, 3) / 3)
```

**Transfer credit (0–25 points)**

- Used naturally: 12 points.
- Used with help: 4 points.
- Didn't use: 0 points; it is not necessarily evidence of failure.
- Each event decays with a 42-day half-life; total credit is capped at 25.
- Natural use has a larger direct effect than one successful flashcard review, as
  required, but it does not manipulate FSRS state.

Tie-break order: higher score, higher priority, newer correction, lower item ID.
All time-dependent tests use a fixed `now`.

### Human-facing reasons

Map the largest components to plain labels such as:

- New from your lesson
- Recall is fading
- Missed recently
- Tutor correction
- Seen in several lessons
- Used naturally recently

Show at most two. Do not show the formula on the main page.

## Active 10

### Weekly behavior

- The current week begins Monday at 00:00 in `settings.timezone`.
- `GET /api/active-items` lazily creates the week if it does not exist.
- Copy still-pinned items from the most recent prior week, then fill remaining slots
  from the current weak ranking.
- Keep exactly 10 when at least 10 eligible items exist; otherwise show all eligible
  items and explain why the list is shorter.
- A pinned item counts toward the 10-item limit. At most 10 can be pinned.
- Pinning an item outside a full list replaces the lowest-scoring unpinned item.
- Unpinning leaves the item in this week's list but makes it replaceable at rollover.
- **Replace** swaps one unpinned item for the highest-ranked eligible item not already
  selected. It is optional and secondary to the automatic flow.
- Selection rows remain as weekly history. A rollover never edits an older week.

### UI

Add `/weak` with:

- Active 10 first: French, natural English, type, up to two reasons, pin/unpin.
- One **Tutor Mode** action, visually primary.
- An expandable **Why these?** explanation in plain language.
- A lower **Other weak items** list, limited to the next 10.
- A compact recurring-errors section.

Do not make Active 10 a second SRS queue. Existing due review stays at
`/practice/items`; an item may appear in Active 10 even when it is not due.

## Tutor Mode

Add `/tutor` as a phone-first page that is also readable when the phone is handed
to the tutor.

### Before/during the lesson

At the top, show this short instruction:

> Please create natural opportunities for me to use these expressions. Give me time
> to produce them before prompting, and correct me normally if I need help.

For each Active 10 item show:

- French target and natural English meaning.
- Tutor example or source correction when available.
- A subtle type badge; no FSRS statistics or weak-score numbers.

### After the lesson

Switch to a one-card-per-item check-in with three large controls:

- Used naturally
- Used with help
- Didn't use

Default nothing. Allow skipping items. One sticky **Save lesson feedback** button
submits the marked rows together. A generated `submissionId` makes retries
idempotent. On success, show how many natural/helped uses were recorded and link
back to Weak French.

Saving tutor feedback does not reschedule an item. Natural events increment the
existing `spontaneous_usage_count`; other outcomes remain available from event
history.

## Recurring errors

Phase 2 records verdicts but currently drops `errorType`, correction text, and the
grader's reason when saving `item_reviews`. Fix that gap first.

For every item review, persist:

- `error_type`
- `corrected_answer`
- `grade_reason`

When a production review is `MINOR_ERROR` or `WRONG` and `error_type` is neither
`none` nor `typo`, transactionally upsert an `error_patterns` projection. The
pattern key is `error_type + grammar_topic`, falling back to `error_type + general`
when the item has no grammar topic. The original `item_reviews` rows remain the
source of truth.

A pattern is displayed as recurring when it has at least two qualifying attempts
in the last 30 days. Accent errors require three attempts to avoid noise. Show:

- Friendly category label (for example, **Articles** or **Past participles**).
- Recent occurrence count and last-seen date.
- Up to three affected items with the learner attempt and corrected answer.

Do not use AI to invent or merge grammar diagnoses in this phase. The existing
grader enum is stable enough for the first version.

## Additive schema

All migration SQL must be handwritten and tested against a copy of `local.db`.
Do not run `drizzle-kit push` on production data.

### `item_reviews` additions

```text
error_type       text
corrected_answer text
grade_reason     text
```

### `active_selections`

```text
id               integer primary key
item_id          integer not null
week_start       integer not null
position         integer not null
source           text not null  -- auto | pinned | replacement
pinned           integer not null default false
score_snapshot   real not null
reasons_json     text not null default '[]'
selected_at      integer not null
unique(week_start, item_id)
unique(week_start, position)
index(week_start, pinned, position)
```

### `tutor_usage_events`

```text
id               integer primary key
submission_id    text not null
item_id          integer not null
week_start       integer not null
occurred_at      integer not null
outcome          text not null  -- natural | helped | not_used
unique(submission_id, item_id)
index(item_id, occurred_at)
```

### `error_patterns`

```text
id               integer primary key
pattern_key      text not null unique
error_type       text not null
grammar_topic    text not null default ''
total_count      integer not null default 0
first_seen_at    integer not null
last_seen_at     integer not null
last_item_id     integer
index(last_seen_at)
```

SQLite foreign-key cascades are not currently enabled. APIs that remove test data
must explicitly delete children; production Phase 3 adds no user-facing deletion.

## API surface

### `GET /api/items/weak?limit=20`

Returns ranked eligible items with score components, reason labels, and whether each
item belongs to the current Active 10. Scores are computed server-side.

### `GET /api/active-items`

Returns the current week and lazily creates its selection when absent.

### `PATCH /api/active-items`

Validated actions:

```json
{ "action": "pin", "itemId": 1 }
{ "action": "unpin", "itemId": 1 }
{ "action": "replace", "itemId": 1 }
```

Selection changes run in a transaction and preserve both unique constraints.

### `POST /api/tutor/usage`

```json
{
  "submissionId": "uuid",
  "weekStart": "ISO timestamp",
  "entries": [{ "itemId": 1, "outcome": "natural" }]
}
```

Insert-or-ignore by submission/item makes network retries safe. Increment
`spontaneous_usage_count` only for newly inserted natural events.

### `GET /api/error-patterns`

Returns only recurring patterns plus their recent example attempts. The endpoint
calculates the 30-day threshold from review history rather than trusting lifetime
projection counts.

## Implementation slices

### 3A — evidence and weak ranking

1. Add the three `item_reviews` evidence columns and pass grading data through the
   review page/API.
2. Add `weak-score.ts` and fixed-time unit tests.
3. Add the weak-items endpoint and read-only `/weak` ranking.

This slice has no selection or tutor writes and can be validated independently.

### 3B — Active 10 and Tutor Mode

1. Add `active_selections` and `tutor_usage_events` via additive migration.
2. Implement deterministic weekly selection, rollover, pin/unpin, and replacement.
3. Build `/tutor` and idempotent feedback submission.
4. Add Weak French/Tutor Mode entry points to the dashboard/navigation.

### 3C — recurring-error log

1. Add `error_patterns` and transactional upsert during item review.
2. Add the read endpoint and the compact Weak French section.
3. Verify thresholds with multiple errors across multiple items.

Each slice gets its own commit and production shipping gate.

## Tests and acceptance criteria

### Pure tests

- Score is clamped and deterministic.
- Recall decay, recent failures, corrections, encounters, and tutor feedback move
  the score in the intended direction.
- One natural-use event has more immediate score effect than one Good review.
- Weekly boundary honors `settings.timezone` and DST.
- Selection is stable for a week, carries pins, never duplicates items, and fills
  vacancies deterministically.

### API/data tests

- Tutor submission retry does not duplicate events or counters.
- A natural event increments `spontaneous_usage_count` once; other outcomes do not.
- Review evidence and pattern projection are written atomically.
- Suspended items never enter weak ranking or Active 10.
- Fewer than 10 eligible items produces a valid shorter selection.

### Manual verification

- Run all database tests on a temporary DB or disposable rows; retain batch 3 and
  the owner's 14 items unchanged.
- Render `/weak` and `/tutor` at 390×844, including long French phrases.
- Exercise pin, unpin, replace, week rollover, and a duplicated tutor submission.
- Confirm existing `/practice/items` FSRS due dates do not change after tutor feedback.
- Run `npx tsc --noEmit`, `npm test`, `npm run build`, restart the service, and check
  the production routes over the local loopback/Tailscale path.

## Explicitly deferred

- Listening mode and replay speeds (Phase 4).
- AI-generated variations and conversation practice (Phase 4).
- Mixed 10-minute sessions, weekly AI summaries, analytics, and TCF progression
  (Phase 5).
- Migrating existing verb/phrase SM-2 schedules to FSRS.
- Notifications, calendar integrations, tutor messaging, or automatic sharing.

