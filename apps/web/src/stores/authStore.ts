import { create } from "zustand";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "OPERATOR" | "DEVELOPER" | "VIEWER";
  image: string | null;
  email_verified: boolean;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  setUser: (user: AuthUser | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
}));
