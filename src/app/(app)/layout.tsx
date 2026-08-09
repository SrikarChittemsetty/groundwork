import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import { getUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Layout for all authenticated pages. Middleware verifies the session cookie's
// signature, but it can't reach the database from the Edge runtime — so a
// cookie can still be cryptographically valid for a user who has since been
// deleted (e.g. account deleted in another tab). Catch that here and expire
// the session rather than rendering an app with no data behind it.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userId = await getUserId();
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) redirect("/api/auth/expire");

  return (
    <>
      <Nav />
      <main className="shell">{children}</main>
    </>
  );
}
