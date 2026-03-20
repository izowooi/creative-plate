import type { Metadata } from "next";
import { Newsreader, Sora } from "next/font/google";
import "./globals.css";

const sora = Sora({
  variable: "--font-sans",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pixel Parfait",
  description: "Replicate image playground with a clean, private-first interface.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${sora.variable} ${newsreader.variable}`}>{children}</body>
    </html>
  );
}
