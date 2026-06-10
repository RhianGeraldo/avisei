import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { companyId: reqCompanyId, unitId, groupName, groupJid, participants } = body;

    if (!unitId || !groupName || !groupJid || !participants) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!Array.isArray(participants)) {
      return NextResponse.json({ error: "Participants must be an array" }, { status: 400 });
    }

    let companyId = reqCompanyId;
    if (!companyId) {
      const { data: unitData } = await supabaseAdmin.from("units").select("company_id").eq("id", unitId).maybeSingle();
      if (!unitData?.company_id) {
        return NextResponse.json({ error: "Unit has no company_id" }, { status: 400 });
      }
      companyId = unitData.company_id;
    }

    const importedAt = new Date().toISOString();
    const groupObject = {
      jid: groupJid,
      name: groupName,
      imported_at: importedAt
    };

    let inserted = 0;
    let updated = 0;
    let failed = 0;

    // We fetch all current contacts for these numbers to know if we should insert or update
    const numbers = participants.map(p => {
      const jid = typeof p === 'string' ? p : p.PhoneNumber || p.JID || p.id || p.jid;
      return jid?.split('@')[0];
    }).filter(Boolean);

    // Fetch existing contacts from DB in chunks to avoid URL too long
    const CHUNK_SIZE = 100;
    const existingContactsMap = new Map();

    for (let i = 0; i < numbers.length; i += CHUNK_SIZE) {
      const chunk = numbers.slice(i, i + CHUNK_SIZE);
      const { data: existing, error } = await supabaseAdmin
        .from('contacts')
        .select('id, number, groups')
        .eq('company_id', companyId)
        .in('number', chunk);

      if (!error && existing) {
        for (const contact of existing) {
          existingContactsMap.set(contact.number, contact);
        }
      }
    }

    const toInsert = [];
    const toUpdate = [];

    for (const p of participants) {
      const jid = typeof p === 'string' ? p : p.PhoneNumber || p.JID || p.id || p.jid;
      const number = jid?.split('@')[0];
      const name = typeof p === 'object' ? p.DisplayName || p.name : null;

      if (!number) continue;

      const existingContact = existingContactsMap.get(number);

      if (existingContact) {
        // Check if group is already in groups array
        const currentGroups = Array.isArray(existingContact.groups) ? existingContact.groups : [];
        const alreadyInGroup = currentGroups.some((g: any) => g.jid === groupJid);

        if (!alreadyInGroup) {
          toUpdate.push({
            id: existingContact.id,
            groups: [...currentGroups, groupObject],
            updated_at: new Date().toISOString()
          });
        }
      } else {
        // Needs insert
        toInsert.push({
          company_id: companyId,
          unit_id: unitId,
          number: number,
          name: name,
          groups: [groupObject],
        });
      }
    }

    // Perform Upserts
    if (toInsert.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('contacts')
        .insert(toInsert);
      
      if (insertError) {
        console.error("Error inserting contacts", insertError);
        failed += toInsert.length;
      } else {
        inserted += toInsert.length;
      }
    }

    if (toUpdate.length > 0) {
      // Supabase js update multiple rows is tricky, we can use upsert
      // Since we know the IDs, we can just upsert. But we need all required fields for upsert if it behaves like insert.
      // Actually, bulk update can be done sequentially or via upsert if we select everything.
      // Better to just loop for simplicity, or upsert.
      for (const updateData of toUpdate) {
        const { error: updateError } = await supabaseAdmin
          .from('contacts')
          .update({ groups: updateData.groups, updated_at: updateData.updated_at })
          .eq('id', updateData.id);
        
        if (updateError) {
          failed++;
        } else {
          updated++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      stats: { inserted, updated, failed }
    });

  } catch (error: any) {
    console.error("Import contacts error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
