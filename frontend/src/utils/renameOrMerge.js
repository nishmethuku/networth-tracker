import { ApiError, renameAccount } from "../api";

/** Renames an account. If the new name is already taken, offers to merge the two instead of just failing. */
export async function renameOrMerge(oldName, newName, householdId) {
  try {
    return await renameAccount(oldName, newName, householdId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      const ok = window.confirm(`${err.message} Merge "${oldName}" into it? Every holding in "${oldName}" moves over.`);
      if (ok) return await renameAccount(oldName, newName, householdId, true);
    }
    throw err;
  }
}
