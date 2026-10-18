// Fails if the Leave household copy or the post-leave navigation plan drift (#90).
// Usage: node scripts/check-leave-household.mjs   (before a PR; not in CI)
//        TZ=Pacific/Auckland node scripts/check-leave-household.mjs   (also run with this)
// Needs Node 22.18+ or 23.6+ (runs the .ts source directly); older Node: add
// --experimental-strip-types.
//
// Checks leaveConfirmText and leftBannerText in mobile/src/lib/leaveHouseholdText.ts and
// planAfterLeave in mobile/src/navigation/afterLeave.ts.
// Does NOT check: the screen's wiring, the reset dispatch, the Banner, leaveHousehold's RPC
// mapping or any real navigation.
import { isDeepStrictEqual } from 'node:util';

import { leaveConfirmText, leftBannerText } from '../mobile/src/lib/leaveHouseholdText.ts';
import { planAfterLeave } from '../mobile/src/navigation/afterLeave.ts';

const failures = [];
const show = (v) => JSON.stringify(v);
function expect(label, got, want) {
  if (!isDeepStrictEqual(got, want)) failures.push(`${label}: got ${show(got)}, want ${show(want)}`);
}

const H = 'The Smiths';
const text = (sharedListCount, lastMember) => leaveConfirmText({ householdName: H, sharedListCount, lastMember });

// Not the last member.
const TAIL =
  "They stay with the other members. Your personal lists stay with you. To come back, you'll need an invite code.";
expect('member, null', text(null, false), {
  heading: 'Leave household?',
  body: `You'll lose access to the shared lists and the household's shop history. ${TAIL}`,
  copyLabel: 'Keep personal copies of the shared lists',
  confirmLabel: 'Leave household',
});
expect('member, 0', text(0, false), {
  heading: 'Leave household?',
  body: "You'll lose access to the household's shop history. It stays with the other members. Your personal lists stay with you. To come back, you'll need an invite code.",
  copyLabel: null,
  confirmLabel: 'Leave household',
});
expect('member, 1', text(1, false), {
  heading: 'Leave household?',
  body: `You'll lose access to 1 shared list and the household's shop history. ${TAIL}`,
  copyLabel: 'Keep a personal copy of the shared list',
  confirmLabel: 'Leave household',
});
expect('member, 3', text(3, false), {
  heading: 'Leave household?',
  body: `You'll lose access to 3 shared lists and the household's shop history. ${TAIL}`,
  copyLabel: 'Keep personal copies of the 3 shared lists',
  confirmLabel: 'Leave household',
});

// Last member.
const PERSONAL = 'Your personal lists stay with you.';
expect('last, null', text(null, true), {
  heading: 'Leave and delete household?',
  body: `You're the only member, so leaving deletes The Smiths, its shared lists and its shop history for good. ${PERSONAL}`,
  copyLabel: 'Keep personal copies of the shared lists',
  confirmLabel: 'Leave and delete',
});
expect('last, 0', text(0, true), {
  heading: 'Leave and delete household?',
  body: `You're the only member, so leaving deletes The Smiths and its shop history for good. ${PERSONAL}`,
  copyLabel: null,
  confirmLabel: 'Leave and delete',
});
expect('last, 1', text(1, true), {
  heading: 'Leave and delete household?',
  body: `You're the only member, so leaving deletes The Smiths, its 1 shared list and its shop history for good. ${PERSONAL}`,
  copyLabel: 'Keep a personal copy of the shared list',
  confirmLabel: 'Leave and delete',
});
expect('last, 3', text(3, true), {
  heading: 'Leave and delete household?',
  body: `You're the only member, so leaving deletes The Smiths, its 3 shared lists and its shop history for good. ${PERSONAL}`,
  copyLabel: 'Keep personal copies of the 3 shared lists',
  confirmLabel: 'Leave and delete',
});

for (const count of [null, 0, 1, 3]) {
  for (const last of [false, true]) {
    const t = text(count, last);
    expect(`copyLabel null only at 0 (${count}, ${last})`, t.copyLabel === null, count === 0);
    expect(`no "new invite code" (${count}, ${last})`, /new invite code/i.test(t.body), false);
  }
}

// Banners.
const banner = (outcome, copiedLists) => leftBannerText({ householdName: H, outcome, copiedLists });
expect('left', banner('left', 0), 'You left The Smiths.');
expect('deleted', banner('deleted', 0), 'You left The Smiths and it was deleted.');
expect('already_left', banner('already_left', 0), "You're no longer in The Smiths.");
expect('left, 1 copy', banner('left', 1), 'You left The Smiths. 1 list was copied to your lists.');
expect('left, 4 copies', banner('left', 4), 'You left The Smiths. 4 lists were copied to your lists.');
expect(
  'deleted, 2 copies',
  banner('deleted', 2),
  'You left The Smiths and it was deleted. 2 lists were copied to your lists.',
);
for (const outcome of ['left', 'deleted', 'already_left']) {
  for (const n of [0, 1, 5]) {
    expect(`banner no "new invite code" (${outcome}, ${n})`, /new invite code/i.test(banner(outcome, n)), false);
  }
}

// Navigation plan.
const settings = { name: 'Settings', key: 'Settings-abc' };
const plan = planAfterLeave({
  routes: [{ name: 'Dashboard', key: 'D1' }, { name: 'Lists', key: 'L1' }, { name: 'ListDetail', key: 'LD1' }, settings],
  index: 3,
});
expect('deep stack: shape', plan && [plan.routes.length, plan.index, plan.routes[0]], [2, 1, { name: 'Dashboard' }]);
expect('deep stack: Home has no key', plan && 'key' in plan.routes[0], false);
expect('deep stack: Settings is the same object', plan && plan.routes[1] === settings, true);

for (const routes of [[settings], [{ name: 'Dashboard', key: 'D1' }, settings]]) {
  const p = planAfterLeave({ routes, index: routes.length - 1 });
  expect(`short stack ${routes.length}`, p && [p.routes[0], p.routes[1] === settings, p.index], [{ name: 'Dashboard' }, true, 1]);
}

expect(
  'focused Dashboard',
  planAfterLeave({ routes: [{ name: 'Dashboard', key: 'D1' }], index: 0 }),
  null,
);
expect(
  'focused HouseholdSetup',
  planAfterLeave({ routes: [{ name: 'Dashboard' }, settings, { name: 'HouseholdSetup' }], index: 2 }),
  null,
);
expect('Settings below the focused screen', planAfterLeave({ routes: [settings, { name: 'Feedback' }], index: 1 }), null);

if (failures.length > 0) {
  console.error(`check-leave-household: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log('check-leave-household: all checks passed');
