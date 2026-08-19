import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Edge-safe auth configuration (no database adapter).
 * Used by middleware and merged into the full config in `auth.ts`.
 */
export const authConfig = {
  providers: [Google],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token?.id && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const onDashboard = nextUrl.pathname.startsWith("/dashboard");
      if (onDashboard) return isLoggedIn;
      return true;
    },
  },
} satisfies NextAuthConfig;
