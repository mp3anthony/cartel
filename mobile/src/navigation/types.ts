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
 * `HouseholdSetup` and `Household` are both listed even though only one of them is
 * ever registered at a time. Which one exists is a fact about the data, not about
 * the route table, and the alternative — one route that branches inside — would let
 * a caller navigate to the household screen without a household.
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
  HouseholdSetup: undefined;
  Household: undefined;
  /**
   * `attachToListId` is Slice 5's addition. Absent, this screen behaves exactly as
   * Slice 4 left it — a plain browse/create index with an ephemeral "Selected"
   * badge. Present, a finalized selection (row tap, merge-confirm, or a
   * just-created location) writes that location onto the named list instead of
   * merely badging it, then returns to that list. Only ever set via in-app
   * `navigation.navigate(...)`, never a URL — see `linking.config.screens` in
   * App.tsx for why it carries no path template of its own.
   */
  Locations: { attachToListId?: string } | undefined;
  Shopping: { listId: string };
  History: undefined;
};
