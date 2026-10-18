# Household

Who you shop with. A household is optional: the app is fully usable alone, and sharing starts only when someone creates or joins one.

## Language

### The group

**Household**:
The small group of people who share lists, managed from the Household section of Settings (the gear in the bottom nav). A user belongs to at most one household. Created with "Create a household", joined with "Join household".
_Avoid_: Family, team, group, account

**Member**:
A person in a household. Every member has equal rank: any member can attach a store, share a list, copy from history or invite someone. There are no owners or admins of a household.
_Avoid_: Owner, admin, guest

**Solo use**:
Using Cartel with no household at all. The setup screen says "You can be the only member". Personal lists work fully without one.
_Avoid_: Free mode, single-user mode

### Settings

**Settings**:
The page behind the Settings gear in the bottom nav, labelled "Settings", shown whether or not you are in a household (it replaces the two states "Household" and "Join or create a household"). Sections: Household, Appearance, a Report issue control top right, and the version footer pinned to the bottom. Rejected: keeping a Household screen and moving Appearance, version and reporting elsewhere.
_Avoid_: Household screen, Profile, Account

**Household section**:
In a household: the household name at the top (read-only), the member count with a small circular icon-only refresh button beside it, and "Invite someone" / "Generate another code", then a secondary "Leave household" button under it that opens a confirm card in place (built in #90). Not in a household: a line saying you are on your own, with "Create a household" and "Join household" buttons that go to the existing setup screen. The household reloads every time Settings opens; the refresh icon covers the moment right after sending an invite code, because the member count is loaded once with no live subscription (rejected: Realtime, too big for #109; rejected: no refresh at all).

**Appearance**:
Light / Dark / System, shown to everyone on Settings, solo or not. See Theme in `brand.md`.

**Report issue**:
A single control, the bug icon plus a small "Report issue" label, top right of Settings and local to it (not a menu item). Replaces the "Report a bug or idea" pill and its Bug / Feature idea switch: non-technical users should not have to classify. The form keeps name, title, a reworded "what's going on" and the optional screenshot; "what should happen instead" is dropped and Device / OS is captured automatically. Issues filed from this form carry only the `from-app` label (no `bug` / `enhancement`); Ant decides bug vs feature at triage. The form is also reached from the Item location picker's "Missing one? Tell us" link (#154) with the title "Item location missing" pre-filled (a cleared title falls back to it) and the Store's name shown and sent only once it is known (never the Store ID); it is the same report (only `from-app`), so the Edge Function needs no change. Store missing reports keep their own `store-missing` label and are unaffected. The `report-feedback` Edge Function accepts the new `report` type and still accepts legacy `bug`/`feature` for cached older clients; `store_missing` is unchanged.
_Avoid_: Bug report, Feature idea (as user-facing types)

**Settings footer**:
Pinned to the bottom of Settings, two centred lines of small muted mono-style non-interactive text, in the format of Ant's app `funded`: `Cartel. v<version> · <Live|Preview|Dev>` then `© <current year> HazardousSchematics.com` (no space in the domain; year from the current date, never hardcoded). The build channel stays so Ant can tell preview from live (`docs/environment.md`).

### Joining

**Invite code**:
A code a member generates ("Invite someone", then "Generate another code") and another person types in ("I have a code"). Single-use and short-lived ("Works once, expires ..."). Shown as "Invite code".
_Avoid_: Invite link, join key, token

**Joining or moving household**:
Redeeming a code when you are already in a household is not a silent join: it fails ("You're already in a household. Leave it in Settings first, then try again.") rather than merging two households. To move, leave first, then join with a new code.
_Avoid_: Switch household, merge households

**Leave household**:
Settings' "Leave household" opens a confirm card in place (decision: `docs/adr/0009-leaving-a-household.md`). Shared lists and shop history stay with the household for the remaining members, and ownership of the leaver's shared lists passes to the earliest-joined member. The card offers an optional tick, on by default, to keep personal copies of the shared lists (hidden when there are none). A last member's leave deletes the household, its shared lists and its history, and the card says so ("Leave and delete household?"). The leaver's unused invite codes stay valid for about 24 hours and are not revoked, so the card says "you'll need an invite code", never "a new one". Afterwards the stack resets to a fresh Home plus Settings, with a one-time banner on Settings. Card and banner wording was the Planner's choice, not Ant's.
_Avoid_: Quit, exit, delete household

### Identity

**Anonymous identity**:
Every device gets an anonymous account on first open, with no sign-up or login wall. Session persistence is what keeps a household across restarts, so a stable origin matters (`docs/adr/0003-anonymous-auth-no-login-wall.md`).
_Avoid_: Guest account, login, user account
