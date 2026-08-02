export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-10 grid gap-5 md:mb-14 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.55fr)] md:items-end">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="section-title mt-4">{title}</h2>
      </div>
      {description ? <p className="max-w-lg text-[16px] leading-7 text-muted md:justify-self-end">{description}</p> : null}
    </div>
  );
}
