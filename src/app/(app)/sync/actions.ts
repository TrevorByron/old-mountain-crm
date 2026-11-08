"use server"

import { revalidatePath } from "next/cache"

import { hasCompletedImport, previewSync, runSync } from "@/lib/airtable/sync"
import { requireTeamMember } from "@/lib/auth"

export type SyncPreview = Awaited<ReturnType<typeof previewSync>>

export async function loadPreview(): Promise<{ ok: true; preview: SyncPreview } | { ok: false; error: string }> {
  await requireTeamMember()
  try {
    return { ok: true, preview: await previewSync() }
  } catch (error) {
    console.error("Airtable preview failed:", error)
    return { ok: false, error: "Couldn't read from Airtable. Check the token and base settings." }
  }
}

export async function commitSync() {
  await requireTeamMember()
  try {
    const trigger = (await hasCompletedImport()) ? "manual" : "first_import"
    const result = await runSync(trigger)
    revalidatePath("/sync")
    revalidatePath("/subscribers")
    return { ok: true as const, result }
  } catch (error) {
    console.error("Airtable sync failed:", error)
    revalidatePath("/sync")
    return { ok: false as const, error: "The sync failed. Details are in the run history." }
  }
}
