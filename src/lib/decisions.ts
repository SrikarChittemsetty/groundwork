import { prisma } from "@/lib/db";

// Narrow an arbitrary JSON field to a list of value ids the user actually owns.
// Never trust ids from the client: an unchecked id would let someone link their
// decision to another user's value row.
export async function ownedValueIds(
  userId: string,
  raw: unknown
): Promise<string[]> {
  if (!Array.isArray(raw)) return [];
  const ids = raw.filter((v): v is string => typeof v === "string");
  if (ids.length === 0) return [];
  const owned = await prisma.value.findMany({
    where: { userId, id: { in: ids } },
    select: { id: true },
  });
  return owned.map((v) => v.id);
}
