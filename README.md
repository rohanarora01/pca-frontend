# PAM — Process Adherence Monitor

A dark-theme dashboard for SAP P2P procurement process mining, connected to an n8n backend.

---

## Project Structure

```
PAM/
├── index.html          ← Main HTML shell (no inline CSS or JS)
├── css/
│   └── styles.css      ← All styles (dark theme, components, responsive)
├── js/
│   ├── config.js       ← ⚙️  ONLY file you need to edit for your environment
│   ├── demo-data.js    ← Realistic 40-order SAP demo dataset
│   ├── dashboard.js    ← All render functions (charts, tables, detail page)
│   └── app.js          ← State, navigation, API calls, modals
├── assets/             ← Drop icons / logos here if needed
└── README.md
```

---

## VS Code Setup (5 minutes)

### Step 1 — Install Live Server
- Open VS Code
- `Ctrl+Shift+X` → search **Live Server** by Ritwick Dey → Install

### Step 2 — Open the project folder
```
File → Open Folder → select the PAM folder
```

### Step 3 — Launch
Right-click `index.html` in the sidebar → **Open with Live Server**

Opens at: `http://127.0.0.1:5500`

---

## Connect to Your n8n Backend

Open `js/config.js` — this is the **only file** you ever need to change:

```js
const PAM_CONFIG = {
  WEBHOOK_ANALYSIS: 'https://n8n.sofiatechnology.ai/webhook/process-adherence-upload',
  WEBHOOK_ALERTS:   'https://n8n.sofiatechnology.ai/webhook/send-alerts',
  DEMO_MODE: false,   // set true to always use demo data
  ...
};
```

| Setting | What it does |
|---|---|
| `WEBHOOK_ANALYSIS` | Where your two CSV files get posted for analysis |
| `WEBHOOK_ALERTS`   | Where the "Send Critical Alerts" button POSTs order data |
| `DEMO_MODE: true`  | Bypasses the backend entirely — always shows demo data |

---

## Before Running Against Real Backend

1. **Activate the workflow** in n8n (toggle top-right)
2. Use the **production webhook URL** — not the test URL (no `/test/` in path)
3. **Re-link credentials** after importing the workflow JSON (OpenAI, Groq, SMTP)
4. Your CSV columns must have: `Ebeln` or `Case Key` (order ID), `Activity En` or `Activity De` (step name), `Eventtime` (timestamp)

---

## Adding the Alerts Webhook in n8n

Create a second workflow with:
- **Webhook** node at path `send-alerts` accepting POST JSON
- **Split In Batches** node to loop through `{{ $json.body.orders }}`
- Connect to your existing **Vendor Alert** email node

The frontend sends this shape:
```json
{
  "orders": [
    {
      "Order_Number": "4510001",
      "Customer": "Siemens AG",
      "Risk_Level": "CRITICAL",
      "Process_Status": "BLOCKED",
      "Block_Reason": "Critical step skipped: goods receipt posted",
      "root_cause": "...",
      "business_risk": "...",
      "recommendation": "..."
    }
  ]
}
```

---

## What Each Page Does

| Page | Content |
|---|---|
| **Dashboard** | KPIs, status cards (Blocked/Alert/Pass), deviation bar chart, risk donut, heatmap, top 10 risk orders |
| **Orders** | Full filterable/searchable table of all orders with status + risk filters |
| **Order Detail** | Metrics, Standard vs Actual flow comparison, detected deviations list, AI Root Cause + Business Risk + Recommendation |
| **Upload** | Drop Table A + Table B CSVs, run analysis, or load demo data |
