"use server";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser } from "@/lib/db";
import { auditLog, strategy } from "@/lib/db/schema";
import { requireSession } from "@/lib/session";

const Step = z.object({ id: z.string().regex(/^[a-z0-9-]{1,64}$/), label: z.string().trim().min(1).max(140) });
const StrategyInput = z.object({
  name: z.string().trim().min(1, "Name your strategy.").max(80),
  description: z.string().trim().max(2000).optional(),
  checklist: z.array(Step).max(20),
});

export type PlaybookState = { error?: string } | undefined;

export async function createStrategy(_: PlaybookState, form: FormData): Promise<PlaybookState> {
  const { user } = await requireSession();
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Name your strategy." };
  const [row] = await withUser(user.id, (tx) => tx.insert(strategy).values({ userId: user.id, name: name.slice(0, 80), checklist: [] }).returning({ id: strategy.id }));
  redirect(`/playbook/${row.id}`);
}

/** Saves name, description and the ordered checklist. Step ids stay stable so past trades keep their ticks. */
export async function saveStrategy(id: string, input: z.input<typeof StrategyInput>) {
  const { user } = await requireSession();
  const p = StrategyInput.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the strategy." };
  const ids = new Set(p.data.checklist.map((c) => c.id));
  if (ids.size !== p.data.checklist.length) return { error: "Two checklist steps share an id." };
  await withUser(user.id, async (tx) => {
    await tx.update(strategy).set({ name: p.data.name, description: p.data.description || null, checklist: p.data.checklist })
      .where(and(eq(strategy.id, id), eq(strategy.userId, user.id)));
    await tx.insert(auditLog).values({ userId: user.id, actor: "user", action: "strategy.update", entity: "strategy", entityId: id });
  });
  revalidatePath(`/playbook/${id}`);
  return { ok: true as const };
}

export async function archiveStrategy(id: string) {
  const { user } = await requireSession();
  await withUser(user.id, (tx) => tx.update(strategy).set({ archivedAt: new Date() }).where(and(eq(strategy.id, id), eq(strategy.userId, user.id))));
  redirect("/playbook");
}
