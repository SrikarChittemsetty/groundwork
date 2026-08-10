"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";

// `ai: true` marks a link that only exists when inference is configured. The
// rest of the app is complete without them.
const LINKS = [
  { href: "/positions", label: "Positions" },
  { href: "/axioms", label: "Axioms" },
  { href: "/values", label: "Values" },
  { href: "/log", label: "Log a decision" },
  { href: "/timeline", label: "Timeline" },
  { href: "/patterns", label: "Patterns" },
  { href: "/reflect", label: "Reflect" },
  { href: "/circles", label: "Circles" },
  { href: "/ask", label: "Ask", ai: true },
  { href: "/settings", label: "Settings" },
];

export default function Nav({ aiEnabled }: { aiEnabled: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="topbar-wrap">
      <div className="topbar">
        <span className="brand">Values Mirror</span>
        <nav className="nav" aria-label="Main">
          {LINKS.filter((l) => aiEnabled || !l.ai).map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={pathname === l.href ? "active" : ""}
              aria-current={pathname === l.href ? "page" : undefined}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <span className="spacer" />
        <ThemeToggle />
        <button className="ghost" onClick={logout}>
          Sign out
        </button>
      </div>
    </header>
  );
}
