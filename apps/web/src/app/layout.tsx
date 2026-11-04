import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MemeProof",
  description: "Public accountability passports for NEAR tokens.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
