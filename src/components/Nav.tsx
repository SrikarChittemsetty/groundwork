"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";

const LINKS = [
  { href: "/values", label: "Values" },
  { href: "/log", label: "Log a decision" },
  { href: "/timeline", label: "Timeline" },
  { href: "/reflect", label: "Reflect" },
  { href: "/ask", label: "Ask" },
  { href: "/settings", label: "Settings" },
];

export default function Nav() {
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
          {LINKS.map((l) => (
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
