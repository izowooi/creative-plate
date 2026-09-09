export function Cover({ small = false, title = '불씨를 건네는 아이' }: { small?: boolean; title?: string }) {
  return <div className={`book-cover ${small ? 'small-cover' : ''}`} aria-label={`${title} 표지`}>
    <span className="cover-edition">MY ORIGINAL NOVEL</span>
    <span className="cover-line" />
    <span className="cover-title">{title==='불씨를 건네는 아이'?<>불씨를<br />건네는<br /><em>아이</em></>:title}</span>
    <span className="cover-bottom">나의 이야기<br />한 문장씩 쌓이는 세계</span>
    <span className="cover-volume">01</span>
  </div>;
}
