import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

/** Inter (variable, self-hosted): no third-party font request, cached with the app's own assets. */
const inter = localFont({
  src: [
    { path: "../fonts/inter-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
    { path: "../fonts/inter-latin-ext-wght-normal.woff2", weight: "100 900", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Ledger", template: "%s · Ledger" },
  description: "A trading journal that grades your process, not just your P&L.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

/**
 * Sets data-theme before first paint so there is never a light→dark flash.
 * Order: saved choice ("light" | "dark") → system preference.
 */
const themeScript = `(function(){try{var s=localStorage.getItem("ledger-theme");var d=s?s==="dark":matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}})()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
