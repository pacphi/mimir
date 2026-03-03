export const SYSTEM_MOUNT_PATH = "/alt/home/developer";

/** Returns true if `path` conflicts with the system-managed home volume. */
export function isSystemVolumeConflict(path: string): boolean {
  const normalized = path.trim().replace(/\/+$/, "");
  return normalized === SYSTEM_MOUNT_PATH || normalized.startsWith(SYSTEM_MOUNT_PATH + "/");
}

export const SYSTEM_VOLUME_ERROR =
  `Mount path conflicts with the system-managed volume at ${SYSTEM_MOUNT_PATH}. ` +
  `This volume is provisioned automatically — do not configure it here.`;
