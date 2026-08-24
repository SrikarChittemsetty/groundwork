// What you look at while the model works.
//
// These calls take ten to twenty seconds, because the model is asked to think
// and then to cite every step against the person's own entries. A disabled
// button reading "Working…" is not enough feedback for that long: the honest
// reading of a silent page is that it has hung, and someone trying the tool
// for the first time will leave rather than wait.
//
// So the wait says what is happening and roughly how long it takes. The
// explanation isn't filler — the slowness has a cause worth knowing, and
// "it's checking its work against your record" is the difference between a
// wait that feels broken and one that feels earned.
export default function Thinking({ what }: { what: string }) {
  return (
    <div className="card thinking" role="status" aria-live="polite">
      <div className="thinking-row">
        <span className="thinking-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <div>
          <div className="title">{what}</div>
          <div className="body-text">
            Usually ten to twenty seconds. Every step it writes has to name the
            entry of yours it rests on, which takes longer than an answer that
            doesn&apos;t have to show its work.
          </div>
        </div>
      </div>
    </div>
  );
}
