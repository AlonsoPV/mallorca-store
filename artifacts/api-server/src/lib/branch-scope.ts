export function filterByAccessibleBranches<T extends { branchId: number | null | undefined }>(
  items: T[],
  accessibleBranchIds: number[] | null,
  options?: { includeUnscoped?: boolean },
): T[] {
  if (accessibleBranchIds === null) return items;
  const allowed = new Set(accessibleBranchIds);
  return items.filter((item) => {
    if (item.branchId == null) return options?.includeUnscoped === true;
    return allowed.has(item.branchId);
  });
}

export function productVisibleInScope(
  availabilityBranchIds: number[],
  accessibleBranchIds: number[] | null,
): boolean {
  if (accessibleBranchIds === null) return true;
  if (accessibleBranchIds.length === 0) return false;
  const allowed = new Set(accessibleBranchIds);
  return availabilityBranchIds.some((id) => allowed.has(id));
}
