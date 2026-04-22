import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authorizeUser } from "@/lib/auth/authorize-user";

/**
 * NextAuth (cookie/session) shares credential validation with POST /auth/login
 * and enables future use of getServerSession in RSC; primary API contract is
 * access + refresh JWT from /auth/register and /auth/login.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (!email || !password) {
          return null;
        }
        const user = await authorizeUser(email, password);
        if (!user) {
          return null;
        }
        return { id: user.id, email: user.email };
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.email = (token.email as string) ?? session.user.email;
      }
      return session;
    },
  },
};
