import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Database, Gamepad2, LibraryBig, Scale } from "lucide-react";

export const metadata: Metadata = {
  title: "프로젝트와 편집 원칙",
  description: "THE TURN이 역사와 게임을 연결하고 출처를 다루는 방식을 설명합니다.",
};

const principles = [
  {
    icon: <LibraryBig size={22} strokeWidth={1.6} />,
    number: "01",
    title: "기록에서 시작합니다.",
    body: "백과사전과 박물관, 공공 아카이브 등 확인할 수 있는 자료를 교차해 직접 요약합니다. 원문을 길게 옮기지 않고, 모든 글 끝에서 참고 링크를 공개합니다.",
  },
  {
    icon: <Gamepad2 size={22} strokeWidth={1.6} />,
    number: "02",
    title: "게임과 역사를 구분합니다.",
    body: "게임의 능력이나 시대 구분은 재미를 위해 압축된 표현입니다. 실제 역사적 사실처럼 단정하지 않고, 무엇이 닮았고 무엇이 달라졌는지 별도 맥락으로 설명합니다.",
  },
  {
    icon: <Scale size={22} strokeWidth={1.6} />,
    number: "03",
    title: "한 사람만 영웅으로 만들지 않습니다.",
    body: "지도자의 업적뿐 아니라 제도, 동시대 사람들, 갈등과 논쟁도 함께 봅니다. 현대의 국경과 정체성을 과거에 그대로 투영하지 않도록 주의합니다.",
  },
  {
    icon: <Database size={22} strokeWidth={1.6} />,
    number: "04",
    title: "자료는 옮길 수 있게 보관합니다.",
    body: "읽을 수 있는 Markdown을 원본으로 보관하고 SQLite는 탐색을 위한 로컬 인덱스로만 만듭니다. 향후 Supabase로 이전해도 콘텐츠가 특정 데이터베이스에 갇히지 않습니다.",
  },
];

export default function AboutPage() {
  return (
    <>
      <section className="page-shell py-[clamp(80px,13vw,170px)]">
        <p className="eyebrow">About the turn</p>
        <h1 className="display-title mt-6 max-w-6xl">게임이 만든<br />역사의 입구.</h1>
        <div className="mt-12 grid gap-10 border-t border-line pt-10 md:grid-cols-2 md:gap-20">
          <p className="text-[clamp(1.35rem,3vw,2rem)] font-medium leading-[1.48] tracking-[-0.035em] text-ink">
            낯선 이름을 아는 얼굴로 바꾸면,<br />한 턴의 선택도 조금 다르게 보입니다.
          </p>
          <div className="space-y-5 text-[16px] leading-8 text-muted">
            <p>
              THE TURN은 Civilization VI를 플레이하다 만난 지도자, 문명, 도시, 위대한
              인물과 걸작을 실제 세계사와 연결하는 개인용 비공식 에디토리얼입니다.
            </p>
            <p>
              승률을 높이는 공략보다 감정이입을 깊게 하는 배경지식에 집중합니다. 게임을
              끄고 공부하는 시간이 아니라, 바로 다음 턴을 더 흥미롭게 만드는 짧고 정확한
              읽을거리를 지향합니다.
            </p>
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-surface py-[clamp(80px,11vw,140px)]">
        <div className="page-shell">
          <p className="eyebrow">Editorial principles</p>
          <h2 className="section-title mt-5">우리가 이야기를<br />정리하는 네 가지 방법.</h2>
          <div className="mt-14 grid gap-px overflow-hidden rounded-[28px] border border-line bg-line md:grid-cols-2">
            {principles.map((principle) => (
              <article key={principle.number} className="bg-surface p-7 sm:p-10 lg:p-12">
                <div className="flex items-center justify-between text-cobalt">
                  {principle.icon}<span className="text-xs font-bold tracking-[0.1em]">{principle.number}</span>
                </div>
                <h3 className="mt-14 text-[clamp(1.6rem,3vw,2.35rem)] font-semibold tracking-[-0.05em]">{principle.title}</h3>
                <p className="mt-5 max-w-lg text-[15px] leading-7 text-muted">{principle.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="page-shell py-[clamp(80px,12vw,150px)]">
        <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:gap-24">
          <div>
            <p className="eyebrow">Sources & rights</p>
            <h2 className="mt-5 text-[clamp(2.5rem,5vw,4.2rem)] font-semibold leading-[1.02] tracking-[-0.06em] [word-break:keep-all]">출처는 장식이 아니라<br />글의 일부입니다.</h2>
          </div>
          <div className="space-y-8 text-[16px] leading-8 text-muted">
            <div>
              <h3 className="mb-2 font-semibold text-ink">본문 자료</h3>
              <p>Wikipedia와 공공기관 자료를 출발점으로 삼고, 가능한 경우 박물관·백과사전·원문 아카이브를 함께 확인합니다. 각 상세 글에 실제 접근 가능한 URL을 남깁니다.</p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold text-ink">이미지와 오디오</h3>
              <p>Wikimedia Commons 등에서 Public Domain 또는 재사용 가능한 라이선스가 확인된 자료를 우선합니다. 작품 자체의 권리와 사진·디지털 복제본, 연주·녹음의 권리를 구분하고 제작자·기관·라이선스·원본 링크를 자료 가까이에 표시합니다.</p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold text-ink">게임 저작권</h3>
              <p>THE TURN은 2K 및 Firaxis Games와 관련 없는 비공식 팬 프로젝트입니다. Civilization과 관련 상표는 각 권리자에게 있으며, 게임 그래픽을 사이트의 브랜드 자산으로 사용하지 않습니다.</p>
            </div>
          </div>
        </div>

        <div className="mt-20 flex flex-col items-start justify-between gap-8 rounded-[28px] bg-ink p-8 text-white sm:p-12 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-bold tracking-[0.12em] text-[#7ea2ff]">READY FOR THE NEXT TURN?</p>
            <p className="mt-5 max-w-2xl text-[clamp(2rem,4vw,3.6rem)] font-semibold leading-[1.05] tracking-[-0.055em]">이제, 알고 싶은 이름을<br />하나 골라보세요.</p>
          </div>
          <Link href="/explore" className="primary-button shrink-0 gap-2 bg-white text-ink hover:text-white">아카이브 열기 <ArrowRight size={17} /></Link>
        </div>
      </section>
    </>
  );
}
