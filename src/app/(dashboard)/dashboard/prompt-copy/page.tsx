import { redirect } from "next/navigation";

/** Legacy bookmark. Prompt and copy writes are retired from the dashboard. */
export default function PromptCopyPage() {
  redirect("/dashboard/devices");
}
