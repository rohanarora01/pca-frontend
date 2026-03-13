// ═══════════════════════════════════════════════════════════
//  PAM CONFIG  —  change ONLY this file to switch environments
// ═══════════════════════════════════════════════════════════

const PAM_CONFIG = {

  // ── Your n8n webhook endpoints ──────────────────────────
  WEBHOOK_ANALYSIS: 'https://n8n.sofiatechnology.ai/webhook/process-adherence-upload',
  WEBHOOK_ALERTS:   'https://n8n.sofiatechnology.ai/webhook/send-alerts',

  // ── Set to true to always use demo data (bypass backend) ─
  DEMO_MODE: false,

  // ── Alert email settings ─────────────────────────────────
  // Risk levels that trigger alert emails when "Send Alerts" is clicked
  ALERT_ON_RISK:   ['HIGH'],
  ALERT_ON_STATUS: ['BLOCKED'],

  // ── UI settings ──────────────────────────────────────────
  APP_NAME:    'PAM',
  APP_SUBTITLE: 'Process Compliance Agent',
  ORG_NAME:    'OFI Services',

  // ── Analysis progress step labels ────────────────────────
  PROGRESS_STEPS: [
    'Parsing event log…',
    'Grouping orders by ID…',
    'Running AI process definition…',
    'Detecting deviations…',
    'Running AI root cause analysis…',
    'Formatting final output…'
  ]
};
