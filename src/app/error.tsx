"use client";

import { useEffect } from "react";

// Client-side error boundary. Deliberately does not print the error message to
// the page: a stack trace or database error can echo back fragments of the
// user's own entries, and this app holds people's beliefs.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="shell">
      <h1>Something broke</h1>
      <p className="subtitle">
        Not your fault, and nothing was lost — your entries are saved. The
        details are in the browser console.
      </p>
      <div className="row">
        <button onClick={reset}>Try again</button>
        <a href="/values">
          <button className="ghost">Back to your values</button>
        </a>
      </div>
      {error.digest && (
        <p className="footnote" style={{ marginTop: 20 }}>
          Reference: {error.digest}
        </p>
      )}
    </main>
  );
}
