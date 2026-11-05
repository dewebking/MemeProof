import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "MemeProof — promises, with proof", template: "%s · MemeProof" },
  description: "Public accountability passports for NEAR tokens. Make measurable commitments, submit evidence, and build trust over time.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth"><body>{children}</body></html>;
}
