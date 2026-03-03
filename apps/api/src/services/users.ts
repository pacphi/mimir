/**
 * User management service — CRUD operations for console users.
 */

import type { User, UserRole, Prisma } from "@prisma/client";
import bcrypt from "bcrypt";
import { db } from "../lib/db.js";

const BCRYPT_ROUNDS = 12;

// ─────────────────────────────────────────────────────────────────────────────
// Input types
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateUserInput {
  email: string;
  name?: string;
  password: string;
  role?: UserRole;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  password?: string;
  role?: UserRole;
  is_active?: boolean;
}

export interface ListUsersFilter {
  role?: UserRole;
  is_active?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

// ─────────────────────────────────────────────────────────────────────────────
// Service methods
// ─────────────────────────────────────────────────────────────────────────────

export async function createUser(input: CreateUserInput): Promise<User> {
  const password_hash = await hashPassword(input.password);
  return db.user.create({
    data: {
      email: input.email,
      name: input.name ?? null,
      password_hash,
      role: input.role ?? "DEVELOPER",
    },
  });
}

export async function listUsers(filter: ListUsersFilter): Promise<{
  users: User[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const where: Prisma.UserWhereInput = {};

  if (filter.role !== undefined) where.role = filter.role;
  if (filter.is_active !== undefined) where.is_active = filter.is_active;
  if (filter.search) {
    where.OR = [
      { email: { contains: filter.search, mode: "insensitive" } },
      { name: { contains: filter.search, mode: "insensitive" } },
    ];
  }

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { created_at: "desc" },
    }),
    db.user.count({ where }),
  ]);

  return {
    users,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getUserById(id: string): Promise<User | null> {
  return db.user.findUnique({ where: { id } });
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<User | null> {
  const existing = await db.user.findUnique({ where: { id } });
  if (!existing) return null;

  const data: Prisma.UserUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.email !== undefined) data.email = input.email;
  if (input.role !== undefined) data.role = input.role;
  if (input.is_active !== undefined) data.is_active = input.is_active;
  if (input.password !== undefined) data.password_hash = await hashPassword(input.password);

  return db.user.update({ where: { id }, data });
}

export async function deleteUser(id: string): Promise<User | null> {
  const existing = await db.user.findUnique({ where: { id } });
  if (!existing) return null;
  return db.user.delete({ where: { id } });
}

export async function getUserTeams(userId: string) {
  return db.teamMember.findMany({
    where: { user_id: userId },
    include: { team: true },
  });
}
