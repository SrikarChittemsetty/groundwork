import ReflectClient from "./ReflectClient";
import { aiEnabled } from "@/lib/features";

// Server wrapper: the AI toggle is server-side configuration, so the client
// never has to ask whether a feature exists — it's told.
export default function ReflectPage() {
  return <ReflectClient aiEnabled={aiEnabled()} />;
}
