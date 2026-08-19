import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Edge-safe: adapter-less config, so Prisma is never bundled into the proxy.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: ["/dashboard/:path*"],
};
