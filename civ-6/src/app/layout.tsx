import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getSiteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "THE TURN — 게임 너머의 세계사",
    template: "%s — THE TURN",
  },
  description:
    "문명 VI 속 지도자, 문명, 도시, 위대한 인물과 걸작을 실제 역사와 연결하는 비공식 한국어 에디토리얼.",
  applicationName: "THE TURN",
  icons: { icon: "/mark.svg" },
  openGraph: {
    title: "THE TURN — 게임 너머의 세계사",
    description: "아는 만큼, 다음 턴이 달라집니다.",
    locale: "ko_KR",
    type: "website",
    images: [{ url: "/images/generated/history-objects-hero.png", width: 1774, height: 887 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "THE TURN — 게임 너머의 세계사",
    description: "아는 만큼, 다음 턴이 달라집니다.",
    images: ["/images/generated/history-objects-hero.png"],
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f4f3ee",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" data-scroll-behavior="smooth">
      <body id="top">
        <a className="skip-link" href="#main-content">본문으로 바로가기</a>
        <SiteHeader />
        <main id="main-content">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
