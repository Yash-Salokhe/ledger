import { ComingNext } from "@/components/app/coming-next";

export const metadata = { title: "Import trades" };

export default function Page() {
  return <ComingNext title="Import trades" description="CSV import with column mapping (MT5, Zerodha, IBKR and generic), then broker sync." />;
}
