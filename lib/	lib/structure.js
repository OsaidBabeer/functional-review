// lib/structure.js
import { supabase } from './supabase';

// Returns the structure as a nested tree: [{ id, name, type, children: [...] }]
export async function getStructureTree() {
  const { data: units } = await supabase
    .from('org_units')
    .select('*')
    .order('sort_order');

  const byId = {};
  (units || []).forEach((u) => (byId[u.id] = { ...u, children: [] }));
  const roots = [];
  (units || []).forEach((u) => {
    if (u.parent_id && byId[u.parent_id]) {
      byId[u.parent_id].children.push(byId[u.id]);
    } else {
      roots.push(byId[u.id]);
    }
  });
  return roots;
}

// Turns the tree into plain text for the chat agent's system prompt.
export function structureToText(tree) {
  return tree
    .map((division) => {
      const depts = division.children.map((d) => d.name).join(' | ') || '(no departments listed)';
      return `${division.name.toUpperCase()}\n  ${depts}`;
    })
    .join('\n\n');
}
