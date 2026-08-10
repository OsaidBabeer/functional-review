// lib/companyContext.js
//
// WHY THIS FILE EXISTS ON ITS OWN:
// This is "static" knowledge — facts about BDC that almost never change.
// It's separate from function_submissions (which grows every upload) and
// review_rules (which grows every correction you make). Keeping it as
// plain code (not a database row) means it's version-controlled in Git —
// if you ever need to change it, you see exactly what changed and when.
//
// Every agent call (extraction AND review) includes this block, so the
// agent never has to be "told" what kind of company BDC is — it already knows.

export const COMPANY_CONTEXT = `
COMPANY CONTEXT — Al Balad Development Company (BDC)

BDC is wholly owned by Saudi Arabia's Public Investment Fund (PIF). It is the
master developer and asset manager of the Jeddah Historic District (Al-Balad),
a UNESCO World Heritage Site.

Critical distinction — READ CAREFULLY when reviewing any function's scope:
- BDC is NOT a standard commercial real estate developer. Its core mandate is
  heritage preservation and restoration of historic buildings, alongside
  commercial/residential/hospitality development around that heritage core.
- BDC does NOT execute physical work itself. It oversees, plans, and manages —
  restoration, construction, and facility work are delivered THROUGH CONTRACTORS
  and specialist partners, not by BDC staff on-site.
  This means: any function whose "Owns" section implies hands-on execution
  (e.g. "performs restoration," "carries out construction") is very likely
  mis-scoped — the correct ownership is almost always "manages/oversees the
  contractor delivering X," not "delivers X directly."
- BDC works under/alongside the Jeddah Historic District Program (Ministry of
  Culture) and coordinates with government/heritage authorities — so functions
  involving permitting, heritage compliance, or government relations often have
  a genuine external-interface dimension that's easy to miss when comparing
  BDC functions only against each other.

Use this context as a lens when reading "Owns / Does Not Own" and
"Responsibilities" sections — scope that sounds right for a normal developer
can still be wrong for BDC specifically.
`.trim();
