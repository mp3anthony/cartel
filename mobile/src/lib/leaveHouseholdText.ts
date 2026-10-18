/**
 * The words on Settings' "Leave household" card and its confirmation banner (#90). Pure,
 * so `scripts/check-leave-household.mjs` can pin them. `sharedListCount` is null while the
 * list index has not loaded; the copy then speaks of "the shared lists" without a number.
 * "You'll need an invite code" is deliberate: the leaver's unused codes stay valid ~24 h,
 * so the code they need may not be new.
 */
export type LeaveConfirmText = {
  heading: string;
  body: string;
  /** Null when there is nothing to copy (zero shared lists). */
  copyLabel: string | null;
  confirmLabel: string;
};

function listPhrase(count: number | null): string {
  if (count === null) return 'the shared lists';
  return count === 1 ? '1 shared list' : `${count} shared lists`;
}

export function leaveConfirmText(input: {
  householdName: string;
  sharedListCount: number | null;
  lastMember: boolean;
}): LeaveConfirmText {
  const { householdName, sharedListCount, lastMember } = input;
  const none = sharedListCount === 0;

  let copyLabel: string | null = null;
  if (!none) {
    if (sharedListCount === null) copyLabel = 'Keep personal copies of the shared lists';
    else if (sharedListCount === 1) copyLabel = 'Keep a personal copy of the shared list';
    else copyLabel = `Keep personal copies of the ${sharedListCount} shared lists`;
  }

  if (lastMember) {
    const what = none
      ? `${householdName} and its shop history`
      : `${householdName}, ${sharedListCount === null ? 'its shared lists' : `its ${listPhrase(sharedListCount)}`} and its shop history`;
    return {
      heading: 'Leave and delete household?',
      body: `You're the only member, so leaving deletes ${what} for good. Your personal lists stay with you.`,
      copyLabel,
      confirmLabel: 'Leave and delete',
    };
  }

  const body = none
    ? "You'll lose access to the household's shop history. It stays with the other members. Your personal lists stay with you. To come back, you'll need an invite code."
    : `You'll lose access to ${listPhrase(sharedListCount)} and the household's shop history. They stay with the other members. Your personal lists stay with you. To come back, you'll need an invite code.`;

  return { heading: 'Leave household?', body, copyLabel, confirmLabel: 'Leave household' };
}

export function leftBannerText(input: {
  householdName: string;
  outcome: 'left' | 'deleted' | 'already_left';
  copiedLists: number;
}): string {
  const { householdName, outcome, copiedLists } = input;
  const base =
    outcome === 'deleted'
      ? `You left ${householdName} and it was deleted.`
      : outcome === 'already_left'
        ? `You're no longer in ${householdName}.`
        : `You left ${householdName}.`;
  if (copiedLists <= 0) return base;
  return `${base} ${copiedLists === 1 ? '1 list was' : `${copiedLists} lists were`} copied to your lists.`;
}
