import { ComingNext } from "@/components/app/coming-next";

export const metadata = { title: "Weekly review" };

export default function Page() {
  return <ComingNext title="Weekly review" description="What went well, what to fix, and every rule you overrode this week." />;
}
