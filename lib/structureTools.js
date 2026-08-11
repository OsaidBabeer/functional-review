// lib/structureTools.js
//
// This is the "action" side of the tool-use loop. Claude decides WHAT to do
// (via the tool call) — this file is what actually DOES it, against the
// real database. Keeping decision (Claude) and execution (this file)
// separate is deliberate: Claude can be wrong about names/matching, so
// every branch here reports back clearly instead of silently failing.

import { supabase } from './supabase';

async function findUnitByName(name) {
  const { data } = await supabase
    .from('org_units')
    .select('*')
    .ilike('name', name)
    .limit(1)
    .maybeSingle();
  return data;
}

export async function executeStructureTool(input) {
  const { action, unit_name, new_parent_name, unit_type, new_name, change_summary } = input;

  if (action === 'move') {
    const unit = await findUnitByName(unit_name);
    if (!unit) return { ok: false, message: `Couldn't find a unit named "${unit_name}" to move.` };

    let newParentId = null;
    if (new_parent_name) {
      const parent = await findUnitByName(new_parent_name);
      if (!parent) {
        return {
          ok: false,
          message: `Couldn't find "${new_parent_name}" to move "${unit_name}" under. If this is a brand new division, use the 'add' action first.`,
        };
      }
      newParentId = parent.id;
    }

    await supabase.from('org_units').update({ parent_id: newParentId }).eq('id', unit.id);
    await supabase.from('org_structure_log').insert({ change_summary });
    return { ok: true, message: `Moved "${unit_name}" under "${new_parent_name}".` };
  }

  if (action === 'rename') {
    const unit = await findUnitByName(unit_name);
    if (!unit) return { ok: false, message: `Couldn't find a unit named "${unit_name}" to rename.` };
    await supabase.from('org_units').update({ name: new_name }).eq('id', unit.id);
    await supabase.from('org_structure_log').insert({ change_summary });
    return { ok: true, message: `Renamed "${unit_name}" to "${new_name}".` };
  }

  if (action === 'add') {
    let parentId = null;
    if (new_parent_name) {
      const parent = await findUnitByName(new_parent_name);
      if (!parent) return { ok: false, message: `Couldn't find parent "${new_parent_name}".` };
      parentId = parent.id;
    }
    await supabase.from('org_units').insert({
      name: unit_name,
      unit_type: unit_type || (parentId ? 'department' : 'division'),
      parent_id: parentId,
    });
    await supabase.from('org_structure_log').insert({ change_summary });
    return { ok: true, message: `Added "${unit_name}".` };
  }

  if (action === 'remove') {
    const unit = await findUnitByName(unit_name);
    if (!unit) return { ok: false, message: `Couldn't find a unit named "${unit_name}" to remove.` };
    await supabase.from('org_units').delete().eq('id', unit.id);
    await supabase.from('org_structure_log').insert({ change_summary });
    return { ok: true, message: `Removed "${unit_name}".` };
  }

  return { ok: false, message: `Unknown action "${action}".` };
}

export const STRUCTURE_TOOL_DEFINITION = {
  name: 'update_org_structure',
  description:
    "Call this ONLY when the user states a real, confirmed change to BDC's approved org structure — a department moving to a different division, a rename, a new division/department being created, or one being removed. Do NOT call this for hypothetical questions, discussion, or anything about a function's scope/ownership — this tool changes the structural chart itself, not function reviews.",
  input_schema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['move', 'rename', 'add', 'remove'] },
      unit_name: { type: 'string', description: 'The exact current name of the division or department being changed.' },
      unit_type: { type: 'string', enum: ['division', 'department'] },
      new_parent_name: { type: 'string', description: "Required for 'move' and for 'add' when adding a department — the division/unit this now sits under." },
      new_name: { type: 'string', description: "Required for 'rename' — the new name." },
      change_summary: { type: 'string', description: 'One plain-English sentence describing the change, for the audit log.' },
    },
    required: ['action', 'unit_name', 'change_summary'],
  },
};
