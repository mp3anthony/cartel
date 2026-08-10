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
  Lists: undefined;
  ListDetail: { listId: string };
  HouseholdSetup: undefined;
  Household: undefined;
  Locations: undefined;
};
