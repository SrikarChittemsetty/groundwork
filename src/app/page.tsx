import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";

// Where the front door opens.
//
// Signed in: the interrogation. Stating values is easy and mostly costless —
// everyone can list things they approve of. Being asked why until you run out
// of answers is the part that does the work, so that's what you land on.
//
// Signed out: the worked example, not the sign-in form. Someone arriving from
// a link has no idea what this is, and a login box asks them to commit before
// they know what they'd be committing to. The example shows a position taken
// apart to bedrock and what happens when the axiom underneath it moves, then
// offers the sign-up. /login is still there for people who already have an
// account and typed the address themselves.
export default async function Home() {
  const userId = await getUserId();
  redirect(userId ? "/positions" : "/example");
}
