# Todoist list/task-row UI — research notes

Researched 2026-09-20. Purpose: the owner cites Todoist's task list as the
reference wireframe for redesigning Cartel's Shopping Mode list and "add to
list" view (both currently bulky). Each Cartel item has: a checkbox, item name,
a per-store location/aisle pill, and edit affordances.

**Method and honesty note.** Todoist's official help center is text-only for
the most part and says surprisingly little about the pixel-level anatomy of a
row (row height, divider style, chip layout). Everything marked **[Verified]**
below is stated in a Todoist primary source cited inline. Anything marked
**[Not verified]** is either absent from those sources or I could not confirm
it from a primary source; I have not filled those gaps from memory or
third-party design teardowns, except where explicitly labelled. I could not
view screenshots (my tooling returns page text only), so visual claims rest on
what the docs say in words.

Sources are all first-party: Todoist help center, Todoist "Inspiration"
(official blog), Todoist 2026 changelog, plus Apple/Google/W3C for touch-target
guidance.

---

## 1. Anatomy of a task row (mobile and desktop)

**[Verified]**
- The row is a **circle checkbox on the left, followed by the task title**.
  Dates, labels and priority are attached to the task and shown with it.
  Source: [Introduction to tasks](https://www.todoist.com/help/articles/introduction-to-tasks-080OAXric).
- On **desktop**, hovering a row reveals a **drag handle on the left** (reorder)
  and a **three-dots menu next to the task name** (duplicate, move, delete,
  set priority, etc.). Same source, and
  [Set a priority](https://www.todoist.com/help/articles/set-a-priority-in-todoist-Wy82Jp)
  (three-dot menu offers priority).
- **Labels render in the row with a small label icon** — added to every label
  shown in task rows in the 14 May 2026 release. Source:
  [2026 Changelog](https://www.todoist.com/help/articles/2026-changelog-HD3jJAtLd).
  (Implication: labels in rows are small icon+text tags, not big filled pills.)
- The **due date is shown on the row, colour-coded** by urgency: red = overdue,
  green = today, brown = tomorrow, purple = within 2–7 days, uncoloured = 8+
  days out; colours are fixed. Source:
  [Schedule a date and time](https://www.todoist.com/help/articles/introduction-to-dates-and-time-q7VobO).
  (Implication: date is coloured *text*, not a pill.)
- **Sub-tasks** are nested under the parent, up to four indent levels; in list
  layout you drag right to indent. Source:
  [Use sub-tasks](https://www.todoist.com/help/todoist/features/use-sub-tasks-in-todoist-kMamDo).
- The **list layout** is "tasks and sections in a list, first task at the top" —
  the traditional format. Boards render tasks as cards instead, but that is a
  separate layout, not the default. Sources:
  [List layout](https://www.todoist.com/help/articles/use-the-list-layout-in-todoist-AMAhHMVRH),
  [Board layout](https://www.todoist.com/help/articles/use-the-board-layout-in-todoist-AiAVsyEI).

**[Not verified]** — the help center does not specify: which metadata sits on
line 1 vs a second line, row height in px, whether hairline dividers or cards
separate rows in list layout, or exact left-edge alignment. Common knowledge
(and my recollection of the product) is that the list layout is a flat list
with hairline separators, title on line 1 and a small secondary line of
date/labels/project underneath, but I have **not** confirmed that from a primary
source and it should be checked against real screenshots before being treated
as fact.

## 2. How metadata is shown and edited

**[Verified]**
- **Editing = tap/click the row to open the "task view".** On desktop, the task
  view has a left content area (name, description, sub-tasks, comments) and a
  right sidebar of attributes (project, assignee, due date, priority, labels,
  reminders). On mobile the same attributes are **tappable "chips"** — e.g.
  tap the Labels chip to add/remove labels, tap the Priority chip to set it.
  Sources:
  [Use the task view](https://www.todoist.com/help/articles/use-the-task-view-to-manage-tasks-in-todoist-eDeRDO0C),
  [Introducing: your new task view](https://www.todoist.com/inspiration/todoist-new-task-view)
  (each attribute gets its own row; attribute chips carry text labels rather
  than being icon-only, for accessibility; unused attributes stay "compact but
  visible").
- **Inline title/description edits** happen inside the task view. Quick edit is
  "click the task."
- **Hover-only on desktop:** drag handle and the three-dots menu (see §1).
  **Always visible:** checkbox, title, coloured date, labels.
- **Mobile swipe actions** exist and are user-configurable (Settings > General
  > Swipe actions). Options: Complete, Schedule, Delete, Reminders, Select
  (Android only). Default behaviour per the help center: swipe left-to-right
  completes; swipe right-to-left opens reschedule shortcuts (Tomorrow / Next
  Week). Sources:
  [Change your swipe actions](https://www.todoist.com/help/articles/how-to-change-your-swipe-actions-D5DQOQz6),
  [Introduction to tasks](https://www.todoist.com/help/articles/introduction-to-tasks-080OAXric).
- Right-click on desktop opens a context menu with reschedule shortcuts (same
  sources).

**[Not verified]** — whether pencil/calendar/comment icons appear on hover in
the current desktop row. The help center documents only the drag handle and the
three-dots menu on hover. (Older Todoist versions did show inline hover icons;
I have no primary source for the current state.)

## 3. Priority encoding and completion behaviour

**[Verified]**
- Priorities are P1 (red, highest), P2 (orange), P3 (blue), P4 (no colour /
  white, default). Priority is set via the task view chip, `p1`–`p3` typed in
  the title, or the three-dot menu. Source:
  [Set a priority](https://www.todoist.com/help/articles/set-a-priority-in-todoist-Wy82Jp).
  In Today/Upcoming, higher priority sorts nearer the top.
- **Completing a task removes it from the active list** ("move out of your
  active lists"); it awards karma and optionally plays a sound. Completed tasks
  can be shown again via Display > Completed tasks, where they appear at the
  bottom of their section, and un-completed by unticking. Sources:
  [Introduction to tasks](https://www.todoist.com/help/articles/introduction-to-tasks-080OAXric),
  [View completed tasks](https://www.todoist.com/help/articles/view-completed-tasks-in-todoist-J19h2s),
  [Glossary](https://www.todoist.com/help/articles/todoist-glossary-cA60laWMH).
  So the default is **disappear, not strike-through**.

**[Not verified]** — that the priority colour appears specifically as a coloured
ring/tinted fill on the circle checkbox (widely known, but the help text I
retrieved says only "colored indicators"), and the completion animation
(the help article states no animation details). Calendar layouts colour tasks by
priority by default per [Customize views](https://www.todoist.com/help/articles/customize-views-in-todoist-AoHhBxFdZ).

## 4. Quick-add behaviour

**[Verified]** — Source: [Use Task Quick Add](https://www.todoist.com/help/articles/use-task-quick-add-in-todoist-va4Lhpzz)
and [A cleaner, simpler Quick Add](https://www.todoist.com/help/articles/a-cleaner-simpler-quick-add-june-29-PuIpiLmLh).
- **Entry points:** an "Add task" control at the bottom of any list (and in the
  sidebar); keyboard `a` adds to the bottom, `Shift+A` to the top of a list
  (desktop, project view only) — per
  [Add or manage multiple tasks](https://www.todoist.com/help/articles/add-or-manage-multiple-tasks-in-todoist-PcPoskdUp)
  search snippet and the Quick Add page; global Quick Add is `Q` on desktop. On
  mobile, the **Dynamic Add button** is a floating button you can *drag to a
  position in the list* to insert a task at that spot (and slightly right for a
  sub-task, or to a screen edge for a section). It only works in list layout
  with no active sorting/grouping. Source:
  [Dynamic Add button](https://www.todoist.com/help/articles/use-the-dynamic-add-button-in-todoist-ysybl2M1).
- **Natural-language parsing** in a single text field: dates ("tomorrow at 4pm",
  recurring), labels (`%label`; `@label` still works but is being retired by
  end of 2026 per the page), projects (`#Project`), sections (`/Section`),
  priority (`p1`–`p3`), reminders (`!time`), assignee (`+name`, shared projects).
- **The composer opens clean** (redesign in the 20 Aug 2026 changelog): the
  name field alone at first; project/date/other action chips appear once you
  start typing; description is one click or `↓` away rather than always shown.
  Source: [2026 Changelog](https://www.todoist.com/help/articles/2026-changelog-HD3jJAtLd).
- **Multi-add:** pasting a multi-line list prompts "Add X tasks?" and splits
  it into separate tasks. Same Add-or-manage-multiple page.
- **Placement:** inline composer at the bottom of the list by default; top of
  list via shortcut/Dynamic Add drag.

**[Not verified]** — whether the composer keeps focus for rapid successive
entry after pressing Enter (widely how desktop behaves, but not stated in the
articles I retrieved).

## 5. Grouping, sections, sorting

**[Verified]**
- Sections split a project into parts; on desktop, hovering at the top or
  bottom of a list reveals an "Add section" affordance. Each section has a
  **collapse/expand arrow at the left of its name**. Reorder by long-press
  (mobile) or press-and-hold / three-dots (desktop). Sources:
  [Introduction to sections](https://www.todoist.com/help/articles/introduction-to-sections-rOrK0aEn),
  [Glossary](https://www.todoist.com/help/articles/todoist-glossary-cA60laWMH).
- **Display menu** offers layout (List/Board/Calendar), **grouping** (by date,
  date added, deadline, priority, label) and **sorting** (name, date, date
  added, deadline, priority, manual), plus filtering. Sub-tasks keep their order
  under grouping/sorting. Sources:
  [Customize views](https://www.todoist.com/help/articles/customize-views-in-todoist-AoHhBxFdZ),
  [Sort or group tasks](https://www.todoist.com/help/articles/sort-or-group-tasks-in-todoist-WFWD0hrb).
- Inline sub-task creation and drag-reorder require list layout with no
  sort/group applied — a hint that manual order and computed grouping are
  mutually exclusive in Todoist too.

**[Not verified]** — exact section-header typography/separator styling.

## 6. What transfers to a compact one-handed grocery list

Design judgements below are mine, marked as inference, and grounded in the
verified facts above.

**Transfers well**
1. **Circle checkbox left, title next, metadata small and secondary.** Verified
   Todoist structure. Keeps left-edge alignment simple and puts the primary
   action (check off) under the thumb.
2. **Metadata as text/icon, not filled pills.** Todoist shows dates as coloured
   text and labels as icon+text. Inference: Cartel's location tag can shrink
   from a bordered pill to a small muted-text tag (or a light-outline chip) on
   the *same line* as the item name when it fits, wrapping under the name only
   when long. This is the biggest saving in row height.
3. **Progressive disclosure for editing.** Todoist keeps the row read-only and
   moves editing to a detail surface (task view / chips) and a hover/three-dots
   menu. Inference: Cartel can replace multiple edit affordances with **one
   small pencil** that opens a compact sheet for name + location, and drop
   always-visible edit controls. On touch there is no hover, so the pencil (or
   tap-the-row) must be always visible or the whole row must be the edit target.
4. **Completion = remove from the active list, completed at the bottom on
   demand.** Fits shopping: checked items leave your eyes. (Cartel already
   tracks `checked_at`; a "show checked" toggle mirrors Todoist's Display >
   Completed tasks.) Trade-off: shoppers sometimes tap the wrong item, so keep
   an **undo** path — Todoist's docs do not describe an undo toast, so that part
   would be Cartel's own addition.
5. **Composer opens minimal; extras appear as you type.** Matches the "add to
   list" view: name field first; store/aisle chip appears after typing starts.
   Cartel's per-store location tag could be the analogue of Todoist's `#project`
   / `/section` shorthand (e.g. type an aisle keyword), but that is optional.
6. **Sections with a collapse arrow** map onto Cartel's route-ordered aisle/
   section groupings if the owner wants visual separation without extra
   chrome; hairline dividers between rows plus a small header label per group.
7. **Paste-a-list-to-add-many** is directly useful for grocery lists.
8. **Swipe to complete / configure** is proven on mobile; note the touch
   trade-off below.

**Trade-offs and cautions**
- **Touch targets.** Apple: a button needs a hit region of at least 44x44 pt
  ([Apple HIG — Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons),
  via search snippet). Material/Android accessibility: at least 48x48 dp, with
  about 8 dp of space between targets; the visible icon may be 24 dp with
  padding making up the rest
  ([Android Accessibility Help — Touch target size](https://support.google.com/accessibility/android/answer/7101858?hl=en)).
  WCAG 2.2 SC 2.5.8 (AA) sets an absolute floor of 24x24 CSS px unless spacing
  is sufficient
  ([W3C Understanding 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)).
  *Practical reading:* a dense row can still be ~44–48 px tall by making the
  **whole row (or the checkbox's padding box)** the hit region while the *visible*
  glyphs stay small (18–24 px circle). Do not shrink hit areas to match the
  visual density. The pencil icon should keep a 44 px hit box even if drawn at
  ~18 px, or be dropped in favour of tapping the row.
- **Two tap zones per row** (check vs edit) risks mis-taps when walking. Keep
  the checkbox zone large at the left and the pencil zone at the far right,
  separated by the title; avoid nesting one pressable inside another (Cartel's
  own `CheckTarget` doc comment already warns about this in `ui.tsx`).
- **Inline location pill on the name line** competes with long item names.
  Decide truncation rules (ellipsize name, keep tag intact, or wrap tag to
  line 2) up front — Todoist's rows are less constrained because most metadata
  is optional.
- **Hover patterns do not translate to touch.** Todoist's drag handle and
  three-dots are hover-revealed on desktop only; on mobile it substitutes swipe
  and tap-for-detail. Cartel's web build is used on phones, so design for touch
  first and treat hover as an enhancement.
- **Swipe conflicts** with browser/OS edge-swipe back gestures on the web/PWA
  build; Todoist's swipe is a native-app feature. (Inference, not sourced.)
- **Colour-coded metadata** (Todoist's date colours) is fixed and not
  customizable; if Cartel colour-codes store chains (its brand-colour work),
  keep contrast and don't rely on colour alone.

## Open items to confirm with real screenshots

- Actual row height and whether rows use dividers vs spacing in list layout.
- Whether metadata sits on the title line or a second line at typical phone
  widths.
- Priority ring rendering on the circle, and completion animation/undo toast.
- Whether Enter in Quick Add keeps the composer open for the next item.

## Source index

- https://www.todoist.com/help/articles/introduction-to-tasks-080OAXric
- https://www.todoist.com/help/articles/use-the-task-view-to-manage-tasks-in-todoist-eDeRDO0C
- https://www.todoist.com/inspiration/todoist-new-task-view
- https://www.todoist.com/help/articles/set-a-priority-in-todoist-Wy82Jp
- https://www.todoist.com/help/articles/view-completed-tasks-in-todoist-J19h2s
- https://www.todoist.com/help/articles/use-task-quick-add-in-todoist-va4Lhpzz
- https://www.todoist.com/help/articles/a-cleaner-simpler-quick-add-june-29-PuIpiLmLh
- https://www.todoist.com/help/articles/add-or-manage-multiple-tasks-in-todoist-PcPoskdUp
- https://www.todoist.com/help/articles/use-the-dynamic-add-button-in-todoist-ysybl2M1
- https://www.todoist.com/help/articles/introduction-to-sections-rOrK0aEn
- https://www.todoist.com/help/articles/customize-views-in-todoist-AoHhBxFdZ
- https://www.todoist.com/help/articles/sort-or-group-tasks-in-todoist-WFWD0hrb
- https://www.todoist.com/help/articles/use-the-list-layout-in-todoist-AMAhHMVRH
- https://www.todoist.com/help/articles/use-the-board-layout-in-todoist-AiAVsyEI
- https://www.todoist.com/help/todoist/features/use-sub-tasks-in-todoist-kMamDo
- https://www.todoist.com/help/articles/how-to-change-your-swipe-actions-D5DQOQz6
- https://www.todoist.com/help/articles/introduction-to-dates-and-time-q7VobO
- https://www.todoist.com/help/articles/todoist-glossary-cA60laWMH
- https://www.todoist.com/help/articles/2026-changelog-HD3jJAtLd
- https://developer.apple.com/design/human-interface-guidelines/buttons
- https://support.google.com/accessibility/android/answer/7101858?hl=en
- https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
