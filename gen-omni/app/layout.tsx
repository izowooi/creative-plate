import type { Metadata } from "next";
import { Space_Grotesk, Syne } from "next/font/google";
import "./globals.css";

const bodyFont = Space_Grotesk({ subsets: ["latin"], variable: "--font-body" });
const displayFont = Syne({ subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "SceneShift — Gemini Omni 1.1 Studio",
  description: "내 얼굴과 캐릭터로 짧은 영화 장면을 다시 캐스팅하는 Gemini Omni 1.1 쇼케이스",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>{children}</body>
    </html>
  );
}
