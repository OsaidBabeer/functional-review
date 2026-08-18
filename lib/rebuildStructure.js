// lib/rebuildStructure.js
//
// Wipes org_units and reseeds it from a freshly parsed tree. Wholesale
// replace rather than trying to diff/patch individual rows — a diff
// approach is a lot more code for the same result, and a full replace
// plus a logged change_summary gives you the same audit trail with far
// less risk of subtle bugs (a mismatched row here, a stray duplicate
// there) from trying to be clever about partial updates.

import { supabase } from './supabase';

export async function rebuildStructure(tree, changeSummary, source) {
  await supabase.from('org_units').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  let divisionSort = 0;
  for (const division of tree) {
    const { data: divRow } = await supabase
      .from('org_units')
      .insert({ name: division.name, unit_type: 'division', sort_order: divisionSort++ })
      .select()
      .single();

    let deptSort = 0;
    for (const dept of division.children || []) {
      await supabase.from('org_units').insert({
        name: dept.name,
        unit_type: 'department',
        parent_id: divRow.id,
        sort_order: deptSort++,
      });
    }
  }

  await supabase.from('org_structure_log').insert({
    change_summary: `[Structure re-uploaded from ${source}] ${changeSummary}`,
  });
}
