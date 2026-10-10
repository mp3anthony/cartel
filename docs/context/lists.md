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
Copies a finished shop or a current list into a new, unchecked list, with a prefilled name and the same "Share with" choice. Each item keeps its Quantity on both routes. From History it copies the full original snapshot of the shop and always attaches that shop's store; from list detail it copies current items and attaches a store only if the source has one. The source is never changed. _Decided in #106, not built:_ copying from History folds items that are the same (per **Item**) into one, Quantities summed and clamped to 99; old snapshots are never rewritten.
_Avoid_: Duplicate, clone, template, re-shop

**Remove list**:
Removes a list from view. The row is hidden, not destroyed.
_Avoid_: Delete list (the list is not erased)

### Items

**Item**:
One entry on a list, identified to the rest of the app by its normalised name. It carries a **Quantity**. _Decided in #106, not built:_ "same item" folds case, repeated inner spaces and accents ("jalapeno" = "jalapeño"), one definition used by lists, renames, copies and Item location matching. Names are stored with a leading capital (first letter upper-cased, the rest as typed), on add and rename. Existing duplicates are merged once: the oldest row survives with its position, ticked if any copy was ticked, Quantity the sum clamped to 99. Only one live item per name per list, enforced by the database.
_Avoid_: Product, entry, row (for the data)

**Quantity**:
A whole number from 1 to 99 on an item, with no units ("2", not "2 litres"). Every item starts at 1, including all items that existed before quantities. Changed from the Compact row: the small "+" at 1, or the "×N" chip (for example "×2") from 2 up, which opens the quantity editor. Shared lists: quantity changes are adjustments, so two people tapping "+" at the same moment both count. Kept when a list is reset, recorded in Shop history, and brought back by both copy routes (see Finish shopping and Shop history).
_Avoid_: Count, amount, units

**Check off**:
On list detail the check circle ticks an item and tapping the name renames it; in Shopping Mode tapping the name ticks it. The pin, "×", the quantity "+", the "×N" chip, the quantity editor and Confirm never toggle check. One tick covers the whole quantity; there is no partial state.
_Avoid_: Tick, complete, mark done

**Manual order**:
The order the user arranged by dragging the handle on the left of a row (list detail only; Shopping Mode has no handle). Stored as a fractional key and only read-sorted; checking off never reorders (route order in Shopping Mode is computed separately; _decided in #112, not built:_ it becomes the fixed Layout order).
_Avoid_: Sort, move up/down

**Remove** (item):
Removes one item from the list. A "×" on the row (list detail and Shopping Mode) swaps the row for an inline "Remove {item}?" with Cancel and Remove; nothing is removed until Remove is tapped. The row is hidden, not destroyed.
_Avoid_: Delete (for the user-facing action)

### Editing and rows

**Add-item composer**:
The one-line field at the top of a list: "Add an item" with a "+" button. Enter or "+" adds and keeps focus for the next item. Adding a name already on the list (same name matching as **Item**) does not create a second item: it raises that item's Quantity by 1 and shows a note under the composer ("Milk is now ×2", or "Milk is already ×99" at the ceiling) that stays until the next add or tick. If that item was ticked, it is unticked and raised. The same composer appears in Shopping Mode, at the top. The field uses iOS autocorrect and suggestions, and the name is capitalised on add.
_Avoid_: Quick add, input bar

**Rename**:
Tapping the name on list detail turns that row into a small field (Return or ✓ saves, ✕ cancels). One editor is open at a time, and dragging is off while it is open. Renaming onto another item's name on the list is rejected with a message and the editor stays open; a case-only change to the item's own name (bread to Bread) is allowed.
_Avoid_: Edit mode, inline edit sheet

**Location pin**:
The pin on a row opens the same field for the item's Item location at the attached store (add it, or propose a correction when it already has one). Shown in Shopping Mode and, only when a store is attached, on list detail.
_Avoid_: Pencil, tag button

**Compact row**:
The one-line item row shared by Shopping Mode and list detail: check circle, name, then (all optional) a right-aligned neutral item location pill (Shopping Mode only), the quantity control, the pin and the "×". Checked items stay in place. The quantity control shows in list detail and Shopping Mode: at quantity 1 only a small "+" shows; at 2 or more it shows a "×N" chip (for example "×2"). Tapping the chip turns the row into the **quantity editor**, "− N + Done", the same row-becomes-editor pattern as Rename: one editor is open at a time, and dragging is off while it is open. "+" is disabled at 99 and "−" at 1. The "×" still removes the whole item, whatever its quantity.
_Avoid_: Item card, list cell
