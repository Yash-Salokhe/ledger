import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { getSettings } from "@/lib/data/settings";
import { ProfileForm, AccountsSection, RulesForm, DataSection, DangerZone } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[34px] font-bold tracking-[-0.03em]">Settings</h1>
        <p className="text-[15px] text-fg-3">Account, defaults, limits and your data.</p>
      </div>
      <Suspense fallback={<div className="grid gap-4 lg:grid-cols-2" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="h-[300px] animate-pulse rounded-xl bg-subtle" />)}</div>}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  const { user } = await requireSession();
  const s = await getSettings(user.id);
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <ProfileForm profile={s.profile} email={user.email} name={user.name} />
      <RulesForm rules={s.rules} tradesToday={s.tradesToday} />
      <AccountsSection accounts={s.accounts} />
      <DataSection />
      <DangerZone />
    </div>
  );
}
