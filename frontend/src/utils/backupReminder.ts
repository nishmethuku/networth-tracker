export const BACKUP_KEY = "nw_last_backup";

export function readLastBackup(): string | null {
  try {
    return localStorage.getItem(BACKUP_KEY);
  } catch {
    return null;
  }
}
