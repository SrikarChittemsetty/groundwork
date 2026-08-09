import Link from "next/link";

export default function NotFound() {
  return (
    <main className="shell">
      <h1>Nothing here</h1>
      <p className="subtitle">
        That page doesn&apos;t exist — or it belonged to something you deleted.
      </p>
      <p>
        <Link href="/values">Back to your values</Link>
      </p>
    </main>
  );
}
