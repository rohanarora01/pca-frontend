# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

This is a static frontend — no build step, no package manager. Serve with VS Code Live Server:

1. Install the **Live Server** extension (Ritwick Dey)
2. Right-click `index.html` → **Open with Live Server**
3. Opens at `http://127.0.0.1:5500`

Alternatively, any static file server works: `python -m http.server 5500` or `npx serve .`

## Environment Configuration

**`js/config.js` is the only file that needs to change between environments.** Full settings:

- `WEBHOOK_ANALYSIS` — n8n endpoint that receives two CSV files and returns the JSON audit report
- `WEBHOOK_ALERTS` — n8n endpoint that receives JSON order data to trigger email alerts
- `DEMO_MODE: true` — bypasses the backend entirely; always uses the built-in demo dataset
- `ALERT_ON_RISK` — array of risk levels included when sending alerts (e.g. `['HIGH']`)
- `ALERT_ON_STATUS` — array of statuses included when sending alerts (e.g. `['BLOCKED']`)
- `APP_NAME`, `APP_SUBTITLE`, `ORG_NAME` — UI branding strings
- `PROGRESS_STEPS` — array of label strings shown during the analysis progress animation

**n8n backend requirements:** use the production webhook URL (no `/test/` in path) and ensure the workflow is activated. CSV input columns must include: `Ebeln` or `Case Key` (order ID), `Activity En` or `Activity De` (step name), `Eventtime` (timestamp).

## Architecture

The app is a single-page application using vanilla JS with no framework. Script load order in `index.html` is significant:

```
config.js → demo-data.js → dashboard.js → app.js
```

**`js/app.js`** — Global state (`appData`, `statusFilter`, `riskFilter`, `fileA`, `fileB`), navigation (`showPage()`), file upload handlers, the `runAnalysis()` fetch call to n8n, `loadDemoData()`, and the alert modal (`openAlertModal()` / `sendAlerts()`).

**`js/dashboard.js`** — All render functions: `renderDashboard()` (entry point after data loads), `renderCharts()` (Chart.js bar + donut), `renderOrdersTable()` (filterable/searchable), `showDetail()` (order detail page with flow comparison), `renderFlowBubbles()` (clickable process step filter), `renderTopSequences()` (sequence frequency analysis).

**`js/demo-data.js`** — `buildDemoData()` returns a fully-shaped data object identical to what the n8n backend returns. This is the reference schema for the expected API response.

**`js/config.js`** — Single `PAM_CONFIG` constant. No logic.

**`css/styles.css`** — All styles in one file. Dark theme uses CSS custom properties defined at `:root`.

## Data Flow

1. User uploads Table A (event log CSV) + Table B (master data CSV) on the Upload page
2. `runAnalysis()` POSTs both files as `FormData` to `WEBHOOK_ANALYSIS`
3. n8n processes and returns JSON; `renderDashboard(data)` is called with the result
4. `appData` is set globally; all pages read from it
5. On backend failure or `DEMO_MODE`, falls back to `buildDemoData()`

## Expected API Response Shape

The n8n backend must return JSON matching the shape produced by `buildDemoData()` in `demo-data.js`. Key fields per order object:

```js
{
  Order_Number, Customer, Process_Status, // 'BLOCKED' | 'ALERT' | 'PASS'
  Risk_Level,   // 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  Risk_Score, Deviation_Count, Total_Steps, Completed_Steps,
  Deviation_Counts: { CRITICAL, HIGH, MEDIUM, LOW },
  Deviation_Types,  // comma-separated string
  Deviations_Array: [{ Type, severity, step, position, detected_at }],
  Standard_Flow, Actual_Flow, Critical_Steps,
  Step_By_Step_Timeline: [{ step_number, step_name, decision, reason }],
  root_cause, business_risk, recommendation,
  Block_Step, Block_Reason
}
```

Top-level response fields: `status: 'success'`, `totalOrders`, `orders[]`, `statusSummary: { PASS, BLOCKED, ALERT }`, `heatmap: { CRITICAL, HIGH, MEDIUM, LOW }`, `insights[]` (optional top-risk subset).

## Alert Webhook Payload

When "Send Critical Alerts" is clicked, `sendAlerts()` POSTs to `WEBHOOK_ALERTS`:

```json
{ "orders": [{ "Order_Number", "Customer", "Risk_Level", "Process_Status", "Block_Reason", "root_cause", "business_risk", "recommendation" }] }
```

Orders are filtered by `PAM_CONFIG.ALERT_ON_RISK` and `PAM_CONFIG.ALERT_ON_STATUS`.
