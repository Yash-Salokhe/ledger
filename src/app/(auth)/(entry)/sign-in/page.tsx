import type { Metadata } from "next";
import { SignInForm } from "./sign-in-form";
import { providers } from "@/lib/auth-providers";

export const metadata: Metadata = { title: "Sign in" };

// Fully static: prerendered into the shell, served from the CDN.
export default function SignInPage() {
  return <SignInForm providers={providers()} />;
}
