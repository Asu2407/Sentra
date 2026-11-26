export function PunchCard({
  blocked,
  total,
}: {
  blocked: number;
  total: number;
}) {
  return (
    <section className="punch" id="record" aria-label="Attack test record">
      <p>
        <b>{blocked}</b> of <span>{total}</span> test attacks and plan conflicts
        were stopped. Each hole is one case; a ring is one that got through.
      </p>
      <div className="holes" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <i key={i} className={i < blocked ? "" : "m"} />
        ))}
      </div>
    </section>
  );
}
