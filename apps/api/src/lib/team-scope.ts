/**
 * Team-scoped visibility helpers.
 */

import { db } from "./db.js";

interface InstanceFilter {
  OR?: Array<{ team_id: string | null } | { team_id: { in: string[] } }>;
}

export async function getVisibleInstanceFilter(
  userId: string,
  role: string,
): Promise<InstanceFilter | undefined> {
  if (role === "ADMIN") return undefined;

  let memberships: Array<{ team_id: string }>;
  try {
    memberships = await db.teamMember.findMany({
      where: { user_id: userId },
      select: { team_id: true },
    });
  } catch {
    return undefined;
  }

  const teamIds = memberships.map((m) => m.team_id);

  return {
    OR: [{ team_id: null }, ...(teamIds.length > 0 ? [{ team_id: { in: teamIds } }] : [])],
  };
}

const ROLE_RANK: Record<string, number> = {
  VIEWER: 0,
  DEVELOPER: 1,
  OPERATOR: 2,
  ADMIN: 3,
};

export async function getEffectiveRole(
  userId: string,
  globalRole: string,
  teamId: string | null,
): Promise<string> {
  if (!teamId || globalRole === "ADMIN") return globalRole;

  const membership = await db.teamMember.findUnique({
    where: { team_id_user_id: { team_id: teamId, user_id: userId } },
    select: { role: true },
  });

  if (!membership) return globalRole;

  const globalRank = ROLE_RANK[globalRole] ?? 0;
  const teamRank = ROLE_RANK[membership.role] ?? 0;

  return teamRank > globalRank ? membership.role : globalRole;
}
