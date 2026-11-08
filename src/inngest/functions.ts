import { runSync } from "@/lib/airtable/sync"

import { inngest } from "./client"

export const scheduledAirtableSync = inngest.createFunction(
  {
    id: "scheduled-airtable-sync",
    triggers: [{ cron: "*/15 * * * *" }],
    concurrency: { limit: 1 },
  },
  async ({ step }) => step.run("sync-airtable", () => runSync("schedule"))
)
