export type ChaosState = "idle" | "thinking" | "sorted";

export function ChaosField({ state }: { state: ChaosState }) {
  return (
    <div
      className={`chaos-field chaos-${state}`}
      data-chaos-state={state}
      aria-hidden="true"
    >
      <span className="chaos-rule r1" />
      <span className="chaos-rule r2" />
      <span className="chaos-rule r3" />
    </div>
  );
}
