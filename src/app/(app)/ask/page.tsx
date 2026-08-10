import { notFound } from "next/navigation";
import AskClient from "./AskClient";
import { aiEnabled } from "@/lib/features";

// Ask exists only where inference does. With AI off the page is genuinely
// absent rather than present-but-broken — a disabled feature you can still
// navigate to is worse than one that isn't there.
export default function AskPage() {
  if (!aiEnabled()) notFound();
  return <AskClient />;
}
