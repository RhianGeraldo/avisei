"use server";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  createWarmerNumber,
  getWarmerNumberQr,
  toggleWarmerNumber,
  refreshChipProfile,
  deleteWarmerNumber,
  graduateWarmerNumber,
  processWarmerTick,
} from "@/lib/warmer.server";

export async function createNumberAction(params: { companyId?: string | null; name: string }) {
  try {
    const res = await createWarmerNumber(params.companyId, params.name);
    return { success: true, data: res };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getNumberQrAction(numberId: string) {
  try {
    const res = await getWarmerNumberQr(numberId);
    return { success: true, data: res };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function toggleNumberAction(params: { numberId: string; pause: boolean }) {
  try {
    await toggleWarmerNumber(params.numberId, params.pause);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function refreshChipProfileAction(numberId: string) {
  try {
    const updated = await refreshChipProfile(numberId);
    return { success: true, data: updated };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteNumberAction(numberId: string) {
  try {
    await deleteWarmerNumber(numberId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function graduateNumberAction(numberId: string) {
  try {
    await graduateWarmerNumber(numberId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function runWarmerTickAction() {
  try {
    const stats = await processWarmerTick({ force: true });
    return { success: true, stats };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
