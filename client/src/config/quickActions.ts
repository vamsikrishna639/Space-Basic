import type { ModuleKey } from '@spacebasic/shared';

/**
 * The third Quick Action chip is cut off in the Home screenshot ("Bo…"). Decided: "Book meal" (decisions.md),
 * kept in this one constant so it can change in one place.
 */
export const BOOK_MEAL_LABEL = 'Book meal';

export type QuickActionIcon = 'calendar' | 'wrench' | 'utensils';

/** Home > Quick Actions, in screenshot order. Each opens its module (ComingSoon until the module is built). */
export const QUICK_ACTIONS: readonly { module: ModuleKey; label: string; icon: QuickActionIcon }[] = [
  { module: 'leave', label: 'Apply for leave', icon: 'calendar' },
  { module: 'tickets', label: 'Raise a ticket', icon: 'wrench' },
  { module: 'mess', label: BOOK_MEAL_LABEL, icon: 'utensils' },
];

/** Home > Apps, in screenshot order (titles come from the module registry). */
export const HOME_APPS: readonly ModuleKey[] = ['leave', 'tickets', 'announcements', 'mess'];
