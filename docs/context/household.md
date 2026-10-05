# Household

Who you shop with. A household is optional: the app is fully usable alone, and sharing starts only when someone creates or joins one.

## Language

### The group

**Household**:
The small group of people who share lists, reached from the menu item "Household" (or "Join or create a household" when you are not in one). A user belongs to at most one household. Created with "Create a household", joined with "Join household".
_Avoid_: Family, team, group, account

**Member**:
A person in a household. Every member has equal rank: any member can attach a store, share a list, copy from history or invite someone. There are no owners or admins of a household.
_Avoid_: Owner, admin, guest

**Solo use**:
Using Cartel with no household at all. The setup screen says "You can be the only member". Personal lists work fully without one.
_Avoid_: Free mode, single-user mode

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
