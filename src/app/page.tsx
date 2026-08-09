import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";

// Root: send authenticated users into the app, everyone else to login.
export default async function Home() {
  const userId = await getUserId();
  redirect(userId ? "/values" : "/login");
}
