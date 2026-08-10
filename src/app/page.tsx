import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";

// Root lands on the interrogation, not the values list.
//
// Stating values is easy and mostly costless — everyone can list things they
// approve of. Being asked why until you run out of answers is the part that
// does the work, so it's what the front door opens onto.
export default async function Home() {
  const userId = await getUserId();
  redirect(userId ? "/positions" : "/login");
}
