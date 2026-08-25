import type { InventoryItem, Move } from './types';
import { allItems } from './volume';

/**
 * Spec §3 Screen 2: the confidence banner and the disabled primary CTA are a
 * HARD requirement, and the disabled state must be programmatic — bound to this
 * count, never merely styled.
 *
 * Spec §6 Q3 (resolved): confidence applies only to AI-detected items. A manually
 * added item has `confidence: null` and can never be unresolved.
 */
export function isUnresolved(item: InventoryItem): boolean {
  return item.confidence === 'low' && !item.userEdited;
}

export function unresolvedItems(move: Move): InventoryItem[] {
  return allItems(move).filter(isUnresolved);
}

export function unresolvedCount(move: Move): number {
  return unresolvedItems(move).length;
}

/** The single source of truth for whether Screen 2's primary CTA may fire. */
export function canLeaveInventory(move: Move): boolean {
  return allItems(move).length > 0 && unresolvedCount(move) === 0;
}

export function confidenceBannerCopy(count: number): string {
  if (count === 0) return '';
  const noun = count === 1 ? 'item needs' : 'items need';
  return `${count} ${noun} a quick check`;
}

/** "Looks right" — accept the AI's numbers as-is. */
export function markConfirmed(item: InventoryItem): InventoryItem {
  return { ...item, userEdited: true };
}
