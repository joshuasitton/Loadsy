import { suspectedDuplicates, type SuspectedDuplicate } from './duplicates';
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

/**
 * Objects that look listed in two rooms and have not been answered – see duplicates.ts.
 * They hold the gate like an unsure item does: left alone, the move is sized with the
 * object on the truck twice, and on the first measured room that alone chose a truck a
 * size too large.
 */
export function unresolvedDuplicates(move: Move): SuspectedDuplicate[] {
  return suspectedDuplicates(move, move.keptDuplicates);
}

/** The single source of truth for whether Screen 2's primary CTA may fire. */
export function canLeaveInventory(move: Move): boolean {
  return allItems(move).length > 0 && unresolvedCount(move) === 0 && unresolvedDuplicates(move).length === 0;
}

/**
 * Why the inventory cannot be left yet, or null when it can – the one sentence the
 * inventory screen, the dashboard and the truck screen all show. It was written three
 * times, and a new check added to one would have left the other two saying "done".
 */
export function inventoryBlockedReason(move: Move): string | null {
  if (allItems(move).length === 0) return 'Add at least one item before sizing a truck';
  const unsure = unresolvedCount(move);
  const twoRooms = unresolvedDuplicates(move).length;
  const parts = [
    unsure > 0 ? confidenceBannerCopy(unsure) : null,
    twoRooms > 0 ? `${twoRooms} ${twoRooms === 1 ? 'item looks' : 'items look'} listed in two rooms` : null,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(' · ');
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
