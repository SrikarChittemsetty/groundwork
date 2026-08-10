import { notFound } from "next/navigation";
import ReasonClient from "./ReasonClient";
import { aiEnabled } from "@/lib/features";

// Only exists where inference does. With AI off the interrogation on
// /positions is the whole tool, and it needs no model at all.
export default function ReasonPage() {
  if (!aiEnabled()) notFound();
  return <ReasonClient />;
}
