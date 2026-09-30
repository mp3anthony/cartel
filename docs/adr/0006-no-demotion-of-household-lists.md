# A shared list cannot be made personal again

Sharing a personal list with the household is one-way; there is no demote function. Once members have seen and edited a list, pulling it back would take it from people who already use it. The need behind "make personal again" is met by copying ("Start new list from this") into a new personal list, leaving the original untouched.

It is enforced by the database, not the UI: `household_id` has no column-level UPDATE grant for `authenticated`, so after creation the only way to set it is `promote_to_household()`, which only ever sets it.
