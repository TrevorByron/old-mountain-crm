import { serve } from "inngest/next"

import { inngest } from "@/inngest/client"
import { scheduledAirtableSync, sendBroadcast } from "@/inngest/functions"

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [scheduledAirtableSync, sendBroadcast],
})
