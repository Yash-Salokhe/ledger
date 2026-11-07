import type { Metadata } from "next";
import { SignUpForm } from "./sign-up-form";
import { providers } from "@/lib/auth-providers";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return <SignUpForm providers={providers()} />;
}
