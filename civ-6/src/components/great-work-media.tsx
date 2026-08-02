import Link from "next/link";
import { ArrowUpRight, Gamepad2, Headphones, Landmark, Scale, UserRound } from "lucide-react";
import {
  greatWorkRulesetValues,
  type Entry,
  type GreatWorkRuleset,
} from "@/lib/content";
import { archiveAudioPath } from "@/lib/archive-media";
import { imageLicenseUrl } from "@/lib/presentation";

type GreatWork = NonNullable<Entry["greatWork"]>;

const holdingStatusLabels: Record<GreatWork["holding"]["status"], string> = {
  single: "단일 소장처",
  "in-situ": "원래 위치",
  distributed: "여러 소장처·판본",
  lost: "현전하지 않음",
  "not-applicable": "단일 소장처 없음",
  unknown: "소장 정보 불명",
};

const workRightsStatusLabels: Record<GreatWork["workRights"]["status"], string> = {
  "public-domain": "Public domain",
  copyrighted: "저작권 보호 중",
  mixed: "복합 권리",
  uncertain: "권리 상태 확인 필요",
};

const rulesetLabels: Record<GreatWorkRuleset, string> = {
  "Standard Rules": "기본 규칙",
  "Rise and Fall": "흥망성쇠",
  "Gathering Storm": "몰려드는 폭풍",
};

export function GreatWorkMedia({
  entry,
  showUnavailableAudio = false,
}: {
  entry: Pick<Entry, "slug" | "greatWork">;
  showUnavailableAudio?: boolean;
}) {
  const greatWork = entry.greatWork;
  if (!greatWork) return null;

  const creator = greatWork.creatorRef;
  const holding = greatWork.holding;
  const rights = greatWork.workRights;
  const audio = greatWork.audio;
  const gameContext = greatWork.gameContext;
  const audioSource = audio.status === "available"
    ? archiveAudioPath(entry) ?? audio.sourceFile
    : null;

  return (
    <section className="great-work-panel" aria-labelledby="great-work-context-title">
      <div className="great-work-panel-heading">
        <p className="eyebrow">Work context & rights</p>
        <h2 id="great-work-context-title">작품 정보와 이용 조건</h2>
      </div>

      <dl className="great-work-facts">
        <div>
          <dt><UserRound size={17} /> 게임 연결 위인</dt>
          <dd>
            {creator ? (
              <Link href={`/archive/${creator.slug}`}>{creator.name}<ArrowUpRight size={13} /></Link>
            ) : greatWork.creatorId}
          </dd>
        </div>
        <div>
          <dt><Landmark size={17} /> 소장·전승</dt>
          <dd>
            <strong>{holding.name || holdingStatusLabels[holding.status]}</strong>
            {holding.location ? <span>{holding.location}</span> : null}
            {holding.url ? (
              <a href={holding.url} target="_blank" rel="noreferrer">기관 기록<ArrowUpRight size={13} /></a>
            ) : null}
            {holding.note ? <p>{holding.note}</p> : null}
          </dd>
        </div>
        <div>
          <dt><Scale size={17} /> 작품 자체 권리</dt>
          <dd>
            <strong>{workRightsStatusLabels[rights.status]}</strong>
            {rights.jurisdiction ? <span>{rights.jurisdiction}</span> : null}
            {rights.note ? <p>{rights.note}</p> : null}
            {rights.source ? (
              <a href={rights.source} target="_blank" rel="noreferrer">권리 근거<ArrowUpRight size={13} /></a>
            ) : null}
          </dd>
        </div>
      </dl>

      <div className="great-work-attribution">
        <p><strong>역사적 표제</strong>{greatWork.historicalTitle}</p>
        <p><strong>귀속</strong>{greatWork.attribution}</p>
        {greatWork.creation.medium ? <p><strong>매체·형식</strong>{greatWork.creation.medium}</p> : null}
        {greatWork.creation.note ? <p><strong>연대 메모</strong>{greatWork.creation.note}</p> : null}
      </div>

      {gameContext ? (
        <div className="great-work-game-context">
          <div className="great-work-game-heading">
            <span className="great-work-game-icon"><Gamepad2 size={18} /></span>
            <div>
              <p>게임 맥락</p>
              <strong>{gameContext.gameEra}</strong>
              <span>{gameContext.pack}</span>
            </div>
          </div>
          <dl className="great-work-rulesets" aria-label="Ruleset별 작품 기본 산출">
            {greatWorkRulesetValues.map((ruleset) => {
              const yields = gameContext.rulesets[ruleset];
              return (
                <div key={ruleset}>
                  <dt>{rulesetLabels[ruleset]}<span>{ruleset}</span></dt>
                  <dd><span>문화 +{yields.culture}</span><span>관광 +{yields.tourism}</span></dd>
                </div>
              );
            })}
          </dl>
          {gameContext.note ? <p className="great-work-game-note">{gameContext.note}</p> : null}
        </div>
      ) : null}

      {audio.status === "available" && audioSource ? (
        <div className="great-work-audio">
          <div className="great-work-audio-copy">
            <span className="great-work-audio-icon"><Headphones size={18} /></span>
            <div>
              <p>자유 이용 가능 녹음</p>
              <strong>{audio.title}</strong>
              <span>{audio.credit}</span>
            </div>
          </div>
          <audio controls preload="metadata" src={audioSource} aria-label={`${audio.title} 오디오`} />
          <div className="great-work-audio-rights">
            <a href={imageLicenseUrl(audio.license)} target="_blank" rel="noreferrer">
              {audio.license}<ArrowUpRight size={12} />
            </a>
            <a href={audio.sourcePage} target="_blank" rel="noreferrer">
              녹음 원본과 크레디트<ArrowUpRight size={12} />
            </a>
          </div>
        </div>
      ) : audio.status === "unavailable" && showUnavailableAudio ? (
        <div className="great-work-audio is-unavailable">
          <div className="great-work-audio-copy">
            <span className="great-work-audio-icon"><Headphones size={18} /></span>
            <div><p>오디오 미수록</p><span>{audio.note}</span></div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
