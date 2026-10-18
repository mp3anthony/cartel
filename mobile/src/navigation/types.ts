import type { HistoryParams } from '../lib/historyFilter';

/**
 * Every route's parameters, in one place. React Navigation cannot check a route
 * parameter it has not been told about, and a deep link is the one caller that can
 * arrive with any shape at all — an untyped param is `undefined` at runtime the
 * first time someone opens a hand-edited URL.
 *
 * This lives beside the navigator rather than inside `App.tsx` because the screens
 * need it to type their own props, and a screen importing the app's entry point to
 * get a type is a cycle waiting for someone to add a value to it.
 *
 * `Settings` is always registered (#109): it shows the household section either way,
 * so it needs no household. `HouseholdSetup` is listed here but only registered while
 * the user is in no household. That is a fact about the data, not about the route
 * table, and it stops a caller reaching the create/join forms while already in one.
 */
export type RootStackParamList = {
  /**
   * Home, as of #22. `Lists` moved out to its own route — see its own entry
   * below — and this is what the navigator's `initialRouteName` and the
   * linking config's empty path (`''`) both point at now.
   */
  Dashboard: undefined;
  Lists: undefined;
  ListDetail: { listId: string };
  /** `mode` picks the form: create (the default) or join with a code. Opened from Settings. */
  HouseholdSetup: { mode?: 'create' | 'join' } | undefined;
  /** The Settings page (#109); replaced the Household screen. */
  Settings: undefined;
  /**
   * `attachToListId` is Slice 5's addition. Absent, this screen behaves exactly as
   * Slice 4 left it — a plain browse/create index with an ephemeral selected
   * outline. Present, a finalized selection (row tap, merge-confirm, or a
   * just-created location) writes that location onto the named list instead of
   * merely outlining it, then returns to that list. `returnTo: 'Shopping'` (#89, set by
   * "Continue at another store") adds a "Keep the current store" button, and a store pick
   * or Keep lands on Home with a one-time confirmation (#103) instead of going back to
   * Shopping or the list; backing out returns to Shopping.
   * Only ever set via in-app
   * `navigation.navigate(...)`, never a URL — see `linking.config.screens` in
   * App.tsx for why it carries no path template of its own.
   */
  Locations: { attachToListId?: string; returnTo?: 'Shopping' } | undefined;
  /**
   * #65's per-location item catalog — browse (and correct) every
   * `location_items` row ever tagged at a store. `locationId` is real and
   * required, unlike `Locations`'s optional `attachToListId`: this screen is
   * meaningless without one, so there is no "absent" case to model here the
   * way `Locations`'s dual create-or-attach mode needs one.
   */
  LocationCatalog: { locationId: string };
  Shopping: { listId: string };
  /**
   * The History filter (#216), set in-app by Home's graph pop-ups; the linking path stays
   * `history`, so a link can carry the same query. Every part is optional and validated by
   * `parseHistoryFilter`; bad parts are ignored.
   */
  History: HistoryParams | undefined;
  /**
   * #69's feedback form. `fromScreen` names whichever screen opened it: `'Settings'`
   * (the default) or, since #154, the screens with the Item location picker
   * (`'Shopping'`, `'ListDetail'`, `'LocationCatalog'`). It is a real param rather than a
   * constant inside `FeedbackScreen` so a new entry point supplies its own name without
   * touching that screen. Optional, with a fallback in `FeedbackScreen`.
   *
   * `title` pre-fills the (still editable) title; `storeName` makes the form show a
   * read-only "Store: ..." line and send it as the first line of the report (#154's
   * "Item location missing"). `locationId` is only used to look the name up when
   * `storeName` is missing; it is never shown or sent. They are set in-app, but the router also maps URL
   * query strings onto params, so someone can hand-write them in a link. That is harmless:
   * they only pre-fill a form the user still reads and sends themselves, and the report
   * goes through the same checked path as any other.
   */
  Feedback: { fromScreen?: string; title?: string; storeName?: string; locationId?: string } | undefined;
  /** The "Store missing?" report form, reached from the Stores picker (#107). */
  StoreMissing: undefined;
};
