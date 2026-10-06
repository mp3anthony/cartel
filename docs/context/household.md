# Household

Who you shop with. A household is optional: the app is fully usable alone, and sharing starts only when someone creates or joins one.

## Language

### The group

**Household**:
The small group of people who share lists, reached today from the gear at the header's right (the Household screen, or "Join or create a household" when you are not in one); decided in #109 (not built yet), it is reached through Settings. A user belongs to at most one household. Created with "Create a household", joined with "Join household".
_Avoid_: Family, team, group, account

**Member**:
A person in a household. Every member has equal rank: any member can attach a store, share a list, copy from history or invite someone. There are no owners or admins of a household.
_Avoid_: Owner, admin, guest

**Solo use**:
Using Cartel with no household at all. The setup screen says "You can be the only member". Personal lists work fully without one.
_Avoid_: Free mode, single-user mode

### Settings (decided in #109, not built yet)

Today the Household screen also holds Appearance, the version footer and the feedback pill, none of which are household things; #109 turns it into a Settings page. This section describes the decided design, not the current app.

**Settings**:
The page behind the gear at the header's right, labelled "Settings", shown whether or not you are in a household (it replaces the two states "Household" and "Join or create a household"). Sections: Household, Appearance, a Report issue control top right, and the version footer pinned to the bottom. Rejected: keeping a Household screen and moving Appearance, version and reporting elsewhere.
_Avoid_: Household screen, Profile, Account

**Household section**:
In a household: the household name at the top (read-only), the member count with a small circular icon-only refresh button beside it, and "Invite someone" / "Generate another code" (later also "Leave household", #90). Not in a household: a line saying you are on your own, with "Create a household" and "Join household" buttons that go to the existing setup screen. The household reloads every time Settings opens; the refresh icon covers the moment right after sending an invite code, because the member count is loaded once with no live subscription (rejected: Realtime, too big for #109; rejected: no refresh at all).

**Appearance**:
Light / Dark / System, shown to everyone on Settings, solo or not. See Theme in `brand.md`.

**Report issue**:
A single control, the bug icon plus a small "Report issue" label, top right of Settings and local to it (not a menu item). Replaces the "Report a bug or idea" pill and its Bug / Feature idea switch: non-technical users should not have to classify. The form keeps name, title, a reworded "what's going on" and the optional screenshot; "what should happen instead" is dropped and Device / OS is captured automatically. Issues filed from this form carry only the `from-app` label (no `bug` / `enhancement`); Ant decides bug vs feature at triage. Store missing reports keep their own `store-missing` label and are unaffected. Changes the `report-feedback` Edge Function, which today requires a type, "what should happen" and Device / OS; its `store_missing` path must keep working.
_Avoid_: Bug report, Feature idea (as user-facing types)

**Settings footer**:
Pinned to the bottom of Settings, two centred lines of small muted mono-style non-interactive text, in the format of Ant's app `funded`: `Cartel. v<version> · <Live|Preview|Dev>` then `© <current year> HazardousSchematics.com` (no space in the domain; year from the current date, never hardcoded). The build channel stays so Ant can tell preview from live (`docs/environment.md`).

### Joining

**Invite code**:
A code a member generates ("Invite someone", then "Generate another code") and another person types in ("I have a code"). Single-use and short-lived ("Works once, expires ..."). Shown as "Invite code".
_Avoid_: Invite link, join key, token

**Joining or moving household**:
Redeeming a code when you are already in a household is not a silent join: it fails ("You're already in a household. You can only be in one at a time.") rather than merging two households. There is no leave action yet; leaving a household is tracked in #90.
_Avoid_: Switch household, merge households

### Identity

**Anonymous identity**:
Every device gets an anonymous account on first open, with no sign-up or login wall. Session persistence is what keeps a household across restarts, so a stable origin matters (`docs/adr/0003-anonymous-auth-no-login-wall.md`).
_Avoid_: Guest account, login, user account
