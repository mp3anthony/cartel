# Lists

The shopping lists and what you do on them: who can see a list, how items are added, checked, ordered and removed, and the reusable row and editor primitives.

## Language

### Lists

**List**:
A named, ordered set of items. Created on the Lists screen; opened to a detail screen. Every list lasts until it is removed and can be shopped from again and again: Finish shopping resets its checks rather than ending it. There is no separate kind of "reusable" list and no finished or archived state.
_Avoid_: Basket, cart, reusable list, archived list, completed list

**Personal list**:
A list visible only to its owner. Marked everywhere by the person icon (spoken label "Personal"), never a text badge.
_Avoid_: Private list, my list

**Shared list**:
A list visible to every member of the owner's household. Marked everywhere by the house icon (spoken label "Shared with {household name}"), never a text badge. A new list can be created shared via the "Share with {household name}" checkbox.
_Avoid_: Household list (older spec wording), team list

**Share with household**:
Turning a personal list into a shared list. One-way: a shared list can never be made personal again. To get a personal version, copy the list instead (`docs/adr/0006-no-demotion-of-household-lists.md`).
_Avoid_: Promote (older spec wording), publish, unshare, demote

**Start new list from this** (copy):
Copies a finished shop or a current list into a new, unchecked list, with a prefilled name and the same "Share with" choice. From History it copies the full original snapshot of the shop and always attaches that shop's location; from list detail it copies current items and attaches a location only if the source has one. The source is never changed.
_Avoid_: Duplicate, clone, template, re-shop

**Remove list**:
Removes a list from view. The row is hidden, not destroyed.
_Avoid_: Delete list (the list is not erased)

### Items

**Item**:
One entry on a list, identified to the rest of the app by its normalised name (case-insensitive).
_Avoid_: Product, entry, row (for the data)

**Check off**:
On list detail the check circle ticks an item and tapping the name renames it; in Shopping Mode tapping the name ticks it. The pin, "×" and Confirm never toggle check.
_Avoid_: Tick, complete, mark done

**Manual order**:
The order the user arranged by dragging the handle on the left of a row (list detail only; Shopping Mode has no handle). Stored as a fractional key and only read-sorted; checking off never reorders (route order in Shopping Mode is computed separately).
_Avoid_: Sort, move up/down

**Remove** (item):
Removes one item from the list. A "×" on the row (list detail and Shopping Mode) swaps the row for an inline "Remove {item}?" with Cancel and Remove; nothing is removed until Remove is tapped. The row is hidden, not destroyed.
_Avoid_: Delete (for the user-facing action)

### Editing and rows

**Add-item composer**:
The one-line field at the top of a list: "Add an item" with a "+" button. Enter or "+" adds and keeps focus for the next item. The same composer appears in Shopping Mode, at the top.
_Avoid_: Quick add, input bar

**Rename**:
Tapping the name on list detail turns that row into a small field (Return or ✓ saves, ✕ cancels). One editor is open at a time, and dragging is off while it is open.
_Avoid_: Edit mode, inline edit sheet

**Location pin**:
The pin on a row opens the same field for the item's location at the attached store (tag it, or propose a correction when it already has one). Shown in Shopping Mode and, only when a store is attached, on list detail.
_Avoid_: Pencil, tag button

**Compact row**:
The one-line item row shared by Shopping Mode and list detail: check circle, name, then (all optional) a right-aligned neutral section pill (Shopping Mode only), the pin and the "×". Checked items stay in place.
_Avoid_: Item card, list cell
