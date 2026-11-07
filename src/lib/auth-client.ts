"use client";
import { createAuthClient } from "better-auth/react";
import { emailOTPClient, magicLinkClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

export const authClient = createAuthClient({
  plugins: [emailOTPClient(), magicLinkClient(), passkeyClient()],
});

export const { useSession, signIn, signUp, signOut } = authClient;
