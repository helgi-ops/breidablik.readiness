import { NextResponse } from "next/server";
import {
  getAvailableProviderDescriptors,
} from "@/lib/micropulse/integrations";
import {
  loadProviderCredentialMetadataRecords,
  loadSyncJobs,
  loadWebhookEvents,
  loadConnectionRuntimeStatuses,
  loadSyncHistory,
  reconcileConnectionHealth,
  refreshProviderRuntimeStatus,
} from "@/lib/micropulse/integrationsLive";

export const runtime = "nodejs";

export async function GET() {
  try {
    const providers = getAvailableProviderDescriptors().map((descriptor) => descriptor.provider);
    for (const provider of providers) {
      refreshProviderRuntimeStatus(provider);
    }
    const credentials = loadProviderCredentialMetadataRecords();
    const jobs = loadSyncJobs();
    const webhookEvents = loadWebhookEvents();
    const statuses = loadConnectionRuntimeStatuses();
    const history = loadSyncHistory();
    const { summary } = reconcileConnectionHealth();
    return NextResponse.json({
      ok: true,
      credentials,
      jobs,
      webhookEvents,
      statuses,
      history,
      healthSummary: summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

