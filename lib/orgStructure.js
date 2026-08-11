// lib/orgStructure.js
//
// The APPROVED 2026 org structure — divisions, departments, and functions,
// exactly as approved. This is what a submitted function should be checked
// against: does it claim to sit somewhere the approved structure doesn't
// show? Does it claim ownership the approved structure places elsewhere?
//
// TO UPDATE: when a new approved structure is issued, edit this file,
// commit, redeploy. Nothing else in the app needs to change.

export const ORG_STRUCTURE = `
APPROVED ORGANIZATIONAL STRUCTURE — BDC, 2026
Reporting line: Board of Directors → CEO. Secretary General of BoD and Audit
Committee report to the Board, not the CEO, though Internal Audit and Board
Affairs coordinate with the CEO's office administratively.

CEO OFFICE — Board Affairs

INTERNAL AUDIT DIVISION
  Corporate Audit | Projects & Operational Audit | Audit Management Office

GOVERNANCE, RISK & COMPLIANCE (GRC) DIVISION
  Risk Management | Governance | Compliance | Legal | Cybersecurity

DEVELOPMENT DIVISION
  Development | Design

PROJECTS DIVISION
  Engineering | Construction | Project Control

COMMERCIAL DIVISION
  Property & Facility Management | Commercial Excellence

ASSET & PORTFOLIO MANAGEMENT DIVISION
  Asset & Portfolio Management | Hospitality

MARKETING DIVISION
  Marketing & Communication | Strategic Partnership

SHARED SERVICES DIVISION
  IT | Procurement | Human Capital | Admin | HSSE | Government & External Affairs

FINANCE DIVISION
  Accounting and Finance | Financial Reporting and Budgeting | Treasury

STRATEGY & INVESTMENT DIVISION
  Investment | Strategic Planning | EPMO | Organizational Excellence

Use this as ground truth for "where does this function actually sit, and
does its claimed scope match what's approved for that division." A
submission claiming ownership that the approved structure places in a
different division is a strong overlap/boundary signal, not a coincidence.
`.trim();
