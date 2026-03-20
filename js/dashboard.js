// ═══════════════════════════════════════════════════════════
//  PAM DASHBOARD.JS  —  render functions for all UI sections
// ═══════════════════════════════════════════════════════════

let charts = {};
let selectedSequence  = null;
let selectedHeatmapRisk = null;

// ── Main dashboard render ──────────────────────────────────
function renderDashboard(data) {
  appData = data;

  const orders  = data.orders;
  const total   = orders.length;
  const pass    = data.statusSummary?.PASS    || orders.filter(o => o.Process_Status === 'PASS').length;
  const blocked = data.statusSummary?.BLOCKED || orders.filter(o => o.Process_Status === 'BLOCKED').length;
  const alert   = data.statusSummary?.ALERT   || orders.filter(o => o.Process_Status === 'ALERT').length;

  const allDevs       = orders.reduce((s, o) => s + (o.Deviation_Count || 0), 0);
  const avgDev        = total ? (allDevs / total).toFixed(1) : '—';
  const adherence     = total ? Math.round((pass / total) * 100) + '%' : '—';
  const nonCompliant  = blocked + alert;
  const criticalRate  = total ? Math.round((nonCompliant / total) * 100) + '%' : '—';

  // KPIs
  set('kpi-total',         total);
  set('kpi-adherence',     adherence);
  set('kpi-avg-dev',       avgDev);
  set('kpi-throughput',    total);
  set('kpi-critical-rate', criticalRate);

  // Status cards
  set('s-blocked', blocked);
  set('s-alert',   alert);
  set('s-pass',    pass);

  // Heatmap
  set('hm-critical', data.heatmap?.CRITICAL || 0);
  set('hm-high',     data.heatmap?.HIGH     || 0);
  set('hm-medium',   data.heatmap?.MEDIUM   || 0);
  set('hm-low',      data.heatmap?.LOW      || 0);

  renderCharts(data);
  renderInsightsTable(
    data.insights ||
    orders.filter(o => o.Process_Status !== 'PASS')
          .sort((a, b) => b.Risk_Score - a.Risk_Score)
          .slice(0, 10)
  );
  renderFlowBubbles(data);
  document.getElementById("flow-filter-card").style.display = "block";
  renderTopSequences(data);
  renderOrderHeatmap(data);

  // Wire heatmap cell clicks
  selectedHeatmapRisk = null;
  document.querySelectorAll('.heatmap-cell').forEach(cell => {
    const level = ['critical','high','medium','low'].find(l => cell.classList.contains(l));
    if (level) cell.onclick = () => filterByRiskHeatmap(level.toUpperCase(), cell);
  });
}

// ── Charts ─────────────────────────────────────────────────
function renderCharts(data) {
  const orders = data.orders;

  // Count deviation types across all orders
  const typeMap = {};
  orders.forEach(o => (o.Deviations_Array || []).forEach(d => {
    const t = (d.Type || d.type || 'OTHER').replace(/_/g, ' ');
    typeMap[t] = (typeMap[t] || 0) + 1;
  }));

  const typeLabels = Object.keys(typeMap);
  const typeValues = Object.values(typeMap);

  destroyChart('chart-dev-types');
  const ctxBar = document.getElementById('chart-dev-types');
  if (ctxBar) {
    charts['chart-dev-types'] = new Chart(ctxBar, {
      type: 'bar',
      data: {
        labels: typeLabels,
        datasets: [{
          data:            typeValues,
          backgroundColor: ['rgba(239,68,68,.75)', 'rgba(249,115,22,.75)', 'rgba(234,179,8,.75)', 'rgba(59,130,246,.75)'],
          borderRadius:    6,
          borderWidth:     0
        }]
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#5a6478', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,.04)' } },
          y: { ticks: { color: '#5a6478', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,.04)' } }
        }
      }
    });
  }

  destroyChart('chart-risk');
  const ctxDonut = document.getElementById('chart-risk');
  if (ctxDonut) {
    charts['chart-risk'] = new Chart(ctxDonut, {
      type: 'doughnut',
      data: {
        labels:   ['Critical', 'High', 'Medium', 'Low'],
        datasets: [{
          data:            [data.heatmap?.CRITICAL || 0, data.heatmap?.HIGH || 0, data.heatmap?.MEDIUM || 0, data.heatmap?.LOW || 0],
          backgroundColor: ['rgba(239,68,68,.85)', 'rgba(249,115,22,.85)', 'rgba(234,179,8,.85)', 'rgba(34,197,94,.85)'],
          borderWidth:     0,
          hoverOffset:     6
        }]
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        cutout:              '68%',
        plugins: {
          legend: {
            position: 'right',
            labels:   { color: '#8a96aa', font: { size: 11 }, padding: 12, boxWidth: 10 }
          }
        }
      }
    });
  }
}

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

// ── Insights table (top 10 risk orders on dashboard) ───────
function renderInsightsTable(insights) {
  set('insights-count', 'Top 5');
  const tbody = document.getElementById('insights-tbody');
  if (!insights || !insights.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty"><div class="empty-icon">✓</div><div class="empty-text">No deviations found</div></div></td></tr>`;
    return;
  }
  tbody.innerHTML = insights.map(o => `
    <tr onclick="showDetail('${o.Order_Number}')">
      <td><span class="order-num">${o.Order_Number}</span><br><span class="customer-sub">${o.Customer || o.Order_Number || ''}</span></td>
      <td><span class="badge ${o.Process_Status}">${o.Process_Status}</span></td>
      <td><span class="badge ${o.Risk_Level}">${o.Risk_Level}</span></td>
      <td>${deviationDots(o)}</td>
      <td class="root-cause-cell">${o.root_cause || '—'}</td>
      <td><button class="action-btn" onclick="event.stopPropagation();showDetail('${o.Order_Number}')">View →</button></td>
    </tr>
  `).join('');
}

// ── Orders page table ──────────────────────────────────────
function clearDateFilter() {
  const fromEl = document.getElementById('date-from');
  const toEl   = document.getElementById('date-to');
  if (fromEl) fromEl.value = '';
  if (toEl)   toEl.value   = '';
  renderOrdersTable();
}

function filterOrders(status, el) {
  statusFilter = status;
  document.querySelectorAll('#page-orders .filter-group:first-child .filter-chip')
          .forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderOrdersTable();
}

function filterRisk(risk, el) {
  riskFilter = (riskFilter === risk) ? null : risk;
  document.querySelectorAll('#page-orders .filter-group:nth-child(2) .filter-chip')
          .forEach(c => { c.classList.remove('active', 'critical', 'high', 'medium', 'low'); });
  if (riskFilter) el.classList.add('active', riskFilter.toLowerCase());
  renderOrdersTable();
}

function renderOrdersTable() {
  if (!appData) return;

  const q      = (document.getElementById('order-search')?.value || '').toLowerCase();
  const dFrom  =  document.getElementById('date-from')?.value || '';
  const dTo    =  document.getElementById('date-to')?.value   || '';

  const filtered = appData.orders.filter(o => {
    if (statusFilter !== 'ALL' && o.Process_Status !== statusFilter) return false;
    if (riskFilter && o.Risk_Level !== riskFilter)                    return false;
    if (q && !o.Order_Number.toLowerCase().includes(q) &&
             !(o.Customer || '').toLowerCase().includes(q))           return false;
    const od = getOrderDate(o);
    if (dFrom && od && od < dFrom) return false;
    if (dTo   && od && od > dTo)   return false;
    return true;
  });

  set('orders-count', filtered.length + ' orders');

  const tbody = document.getElementById('orders-tbody');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty"><div class="empty-icon">◉</div><div class="empty-text">No orders match filters</div></div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(o => `
    <tr onclick="showDetail('${o.Order_Number}')">
      <td>
        <span class="order-num">${o.Order_Number}</span><br>
        <span class="customer-sub">${o.Customer || o.Order_Number || ''}</span>
      </td>
      <td><span class="mono-sm date-cell">${getOrderDate(o) || '—'}</span></td>
      <td><span class="badge ${o.Process_Status}">${o.Process_Status}</span></td>
      <td><span class="badge ${o.Risk_Level}">${o.Risk_Level}</span></td>
      <td class="mono-sm">${o.Total_Steps || 0}</td>
      <td>${deviationDots(o)}</td>
      <td class="dev-types-cell">${o.Deviation_Types || 'None'}</td>
      <td><button class="action-btn" onclick="event.stopPropagation();showDetail('${o.Order_Number}')">Detail →</button></td>
    </tr>
  `).join('');
}

// ── Field fallback helpers ──────────────────────────────────

// Fix 2: Order_Date — fall back to first_event_date or Eventtime
function getOrderDate(o) {
  const raw = o.Order_Date || o.first_event_date || o.Eventtime || '';
  return raw ? String(raw).substring(0, 10) : '';
}

// Fix 4: Deviation_Counts — recalculate from array if all zeros
function getDeviationCounts(o) {
  const dc = o.Deviation_Counts || {};
  if (dc.CRITICAL || dc.HIGH || dc.MEDIUM || dc.LOW) return dc;
  const arr = o.Deviations_Array || [];
  return {
    CRITICAL: arr.filter(d => d.severity === 'CRITICAL').length,
    HIGH:     arr.filter(d => d.severity === 'HIGH').length,
    MEDIUM:   arr.filter(d => d.severity === 'MEDIUM').length,
    LOW:      arr.filter(d => d.severity === 'LOW').length
  };
}

// ── Deviation dot indicator ────────────────────────────────
function deviationDots(o) {
  const dc = getDeviationCounts(o);
  let html = '<div class="deviation-bar">';
  for (let i = 0; i < (dc.CRITICAL || 0); i++) html += `<div class="dev-dot c" title="Critical"></div>`;
  for (let i = 0; i < (dc.HIGH     || 0); i++) html += `<div class="dev-dot h" title="High"></div>`;
  for (let i = 0; i < (dc.MEDIUM   || 0); i++) html += `<div class="dev-dot m" title="Medium"></div>`;
  for (let i = 0; i < (dc.LOW      || 0); i++) html += `<div class="dev-dot l" title="Low"></div>`;
  if (!o.Deviation_Count && !dc.CRITICAL && !dc.HIGH && !dc.MEDIUM && !dc.LOW) html += `<span class="no-dev">None</span>`;
  html += '</div>';
  return html;
}

// ── Order detail page ──────────────────────────────────────
function showDetail(orderNum) {
  if (!appData) return;
  const o = appData.orders.find(x => x.Order_Number === orderNum);
  if (!o) return;

  const standardFlow = o.Standard_Flow || [];
  const actualFlow   = o.Actual_Flow   || [];
  const deviations   = o.Deviations_Array || [];
  const dc           = getDeviationCounts(o);

  // Build two deviation maps:
  // deviationByStep    — keyed by d.step (where the deviation originates)
  // deviationByDetect  — keyed by d.detected_at (where it was caught in actual flow)
  const deviationByStep   = {};
  const deviationByDetect = {};
  deviations.forEach(d => {
    const stepKey   = (d.step || '').toLowerCase().trim();
    const detectKey = (d.detected_at || '').toLowerCase().trim();
    // Only index non-compound step names as step keys
    if (stepKey && !stepKey.includes('→')) {
      if (!deviationByStep[stepKey]) deviationByStep[stepKey] = [];
      deviationByStep[stepKey].push(d);
    }
    if (detectKey && detectKey !== 'end') {
      if (!deviationByDetect[detectKey]) deviationByDetect[detectKey] = [];
      deviationByDetect[detectKey].push(d);
    }
  });

  // Use n8n's Step_By_Step_Timeline if it has meaningful decisions,
  // otherwise rebuild from actualFlow + deviations
  const n8nTimeline = o.Step_By_Step_Timeline || [];
  const useN8nTimeline = n8nTimeline.length > 0 &&
    (deviations.length === 0 || n8nTimeline.some(t => t.decision !== 'ALLOW'));

  let timeline;
  if (useN8nTimeline) {
    timeline = n8nTimeline.map((t, i) => ({
      step_number: t.step_number || i + 1,
      step_name:   t.step_name,
      decision:    t.decision || 'ALLOW',
      reason:      t.reason   || ''
    }));
  } else {
    // Build sequence violation map — check actual flow against standard
    const seqViolations = new Set();
    for (let i = 1; i < actualFlow.length; i++) {
      const prev = standardFlow.map(s => s.toLowerCase()).indexOf(actualFlow[i - 1].toLowerCase());
      const curr = standardFlow.map(s => s.toLowerCase()).indexOf(actualFlow[i].toLowerCase());
      if (curr !== -1 && prev !== -1 && curr < prev) {
        seqViolations.add(actualFlow[i].toLowerCase());
      }
    }

    timeline = actualFlow.map((step, i) => {
      const stepLow = step.toLowerCase().trim();
      // Merge deviations from both maps (by step origin and by detection point)
      const devs = [
        ...(deviationByStep[stepLow]   || []),
        ...(deviationByDetect[stepLow] || [])
      ].filter((d, idx, arr) => arr.indexOf(d) === idx); // deduplicate

      const isBlocked    = stepLow === (o.Block_Step || '').toLowerCase().trim();
      const isSeqViolation = seqViolations.has(stepLow);
      const hasCritical  = devs.some(d => d.severity === 'CRITICAL');
      const hasHigh      = devs.some(d => d.severity === 'HIGH');
      const hasMedium    = devs.some(d => d.severity === 'MEDIUM');

      let decision = 'ALLOW';
      let reason   = '';

      if (isBlocked || hasCritical) {
        const critDev = devs.find(d => d.severity === 'CRITICAL');
        decision = 'BLOCK';
        reason   = critDev
          ? `${(critDev.Type || 'DEVIATION').replace(/_/g, ' ')}: ${critDev.step || o.Block_Reason || 'process blocked'}`
          : (o.Block_Reason || 'Process blocked here');
      } else if (isSeqViolation) {
        decision = 'ALERT';
        reason   = 'Step executed out of sequence';
      } else if (hasHigh) {
        const hDev = devs.find(d => d.severity === 'HIGH');
        decision = 'ALERT';
        reason   = (hDev?.Type || 'HIGH_RISK').replace(/_/g, ' ');
      } else if (hasMedium) {
        const mDev = devs.find(d => d.severity === 'MEDIUM');
        decision = 'WARN';
        reason   = (mDev?.Type || 'MEDIUM_RISK').replace(/_/g, ' ');
      }

      return { step_number: i + 1, step_name: step, decision, reason };
    });
  }

  // detect where process was blocked
  let blockedIndex = -1;
  timeline.forEach((t, i) => {
    if (t.decision === 'BLOCK') blockedIndex = i;
  });

  // Standard flow column
  const stdCol = standardFlow.map((s, i) => {
    const sLow       = s.toLowerCase().trim();
    const inActual   = actualFlow.some(a => a.toLowerCase().trim() === sLow);
    const isCritical = (o.Critical_Steps || []).some(c => c.toLowerCase().trim() === sLow);
    const cls        = !inActual ? 'err' : 'ok';
    // Find the deviation that references this step as missing/skipped
    const stepDevs   = deviationByStep[sLow] || [];
    const worstDev   = stepDevs.sort((a, b) => {
      const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
    })[0];
    return `
      <div class="flow-step">
        <div class="step-num ${cls}">${i + 1}</div>
        <div>
          <div class="step-name">${s}${isCritical ? ' <span class="crit-star">⭑</span>' : ''}</div>
          ${!inActual
            ? `<span class="step-badge BLOCK">✗ MISSING</span>
               ${worstDev ? `<div class="step-reason">${(worstDev.Type || 'DEVIATION').replace(/_/g, ' ')} · detected at: <em>${worstDev.detected_at || '?'}</em></div>` : ''}`
            : `<span class="step-badge ALLOW">✓ OK</span>`}
        </div>
      </div>`;
  }).join('');

  // Actual flow column
  const actCol = timeline.map(t => {
    const cls = t.decision === 'BLOCK' ? 'err' : t.decision === 'ALERT' ? 'warn' : t.decision === 'WARN' ? 'warn' : 'ok';
    const badgeLabel = t.decision === 'ALLOW' ? '✓ OK'
      : t.decision === 'BLOCK' ? '✗ BLOCKED'
      : t.decision === 'ALERT' ? '⚠ ALERT'
      : t.decision === 'WARN' ? '⚡ WARN'
      : t.decision;
    return `
      <div class="flow-step">
        <div class="step-num ${cls}">${t.step_number}</div>
        <div>
          <div class="step-name">${t.step_name}</div>
          <span class="step-badge ${t.decision}">${badgeLabel}</span>
          ${t.reason
            ? `<div class="step-reason">${t.reason}</div>`
            : ''}
        </div>
      </div>`;
  }).join('');

  // Deviations list
  const devList = deviations.length
    ? deviations.map(d => `
        <div class="dev-item ${d.severity}">
          <div><span class="dev-sev">${d.severity}</span></div>
          <div class="dev-info">
            <div class="dev-type">${(d.Type || d.type || '').replace(/_/g, ' ')}</div>
            <div class="dev-detail">
              Step: <strong>${d.step}</strong>
              · Position ${d.position || '?'}
              · Detected at: <em>${d.detected_at}</em>
            </div>
          </div>
        </div>`).join('')
    : `<div class="no-dev-msg">No deviations detected — process is fully compliant.</div>`;

  // AI insights section
  const hasAI = o.root_cause || o.business_risk || o.recommendation;
  const aiSection = hasAI ? `
    <div class="detail-card detail-full">
      <div class="detail-card-title">AI Insights &amp; Root Cause Analysis</div>
      <div class="ai-cards">
        <div class="ai-card rc">
          <div class="ai-card-title">🔍 Root Cause</div>
          <div class="ai-card-body">${o.root_cause || 'Not analysed'}</div>
        </div>
        <div class="ai-card br">
          <div class="ai-card-title">⚡ Business Risk</div>
          <div class="ai-card-body">${o.business_risk || 'Not analysed'}</div>
        </div>
        <div class="ai-card rm">
          <div class="ai-card-title">✦ Recommendation</div>
          <div class="ai-card-body">${o.recommendation || 'Not analysed'}</div>
        </div>
      </div>
    </div>` : '';

  document.getElementById('detail-content').innerHTML = `

    <!-- ORDER HEADER CARD -->
    <div class="detail-header-card">
      <div class="detail-header-left">
        <div class="detail-order-label">Order Number</div>
        <div class="detail-order-num">${o.Order_Number}</div>
        <div class="detail-customer">${o.Customer || o.Order_Number || ''}</div>
      </div>
      <div class="detail-header-badges">
        <span class="badge ${o.Process_Status} lg">${o.Process_Status}</span>
        <span class="badge ${o.Risk_Level} lg">${o.Risk_Level} RISK</span>
      </div>
    </div>

    <!-- METRICS -->
    <div class="detail-card detail-full">
      <div class="detail-card-title">Order Metrics</div>
      <div class="meta-grid">
        <div class="meta-item">
          <div class="meta-key">Total Steps</div>
          <div class="meta-val">${o.Total_Steps || 0}</div>
        </div>
        <div class="meta-item">
          <div class="meta-key">Completed Steps</div>
          <div class="meta-val">${o.Completed_Steps || 0}</div>
        </div>
        <div class="meta-item">
          <div class="meta-key">Deviations</div>
          <div class="meta-val" style="color:${(o.Deviation_Count || dc.CRITICAL || dc.HIGH || dc.MEDIUM || dc.LOW) ? 'var(--critical)' : 'var(--pass)'}">
            ${o.Deviation_Count || (dc.CRITICAL + dc.HIGH + dc.MEDIUM + dc.LOW) || 0}
          </div>
        </div>
        <div class="meta-item">
          <div class="meta-key">Risk Score</div>
          <div class="meta-val">${o.Risk_Score || 0}</div>
        </div>
        <div class="meta-item">
          <div class="meta-key">Block Step</div>
          <div class="meta-val">${o.Block_Step || '—'}</div>
        </div>
        <div class="meta-item">
          <div class="meta-key">Block Reason</div>
          <div class="meta-val meta-val-sm">${o.Block_Reason || '—'}</div>
        </div>
      </div>
    </div>

    <!-- FLOW COMPARISON -->
    <div class="detail-card detail-full">
      <div class="detail-card-title">Standard vs Actual Process Flow</div>
      <div class="flow-compare">
        <div>
          <div class="flow-col-title standard">⊞ Standard Flow (Expected)</div>
          <div class="flow-steps">${stdCol}</div>
        </div>
        <div>
          <div class="flow-col-title actual">⊟ Actual Flow (Observed)</div>
          <div class="flow-steps">${actCol}</div>
        </div>
      </div>
    </div>

    <!-- DETECTED DEVIATIONS -->
    <div class="detail-card detail-full">
      <div class="detail-card-title">Detected Deviations</div>
      <div class="dev-list">${devList}</div>
    </div>

    <!-- AI INSIGHTS -->
    ${aiSection}
  `;

  showPage('detail');
  document.querySelector('.main').scrollTop = 0;
}

// ── Standard Flow Sequential Filter ───────────────────────
let selectedFlowSteps = [];

function renderFlowBubbles(data) {
  const card = document.getElementById('flow-filter-card');
  const container = document.getElementById('flow-bubbles');
  if (!card || !container) return;

  const standardFlow = data.orders.find(o => o.Standard_Flow && o.Standard_Flow.length) ? data.orders.find(o => o.Standard_Flow && o.Standard_Flow.length).Standard_Flow : [];
  const criticalSteps = data.orders.find(o => o.Critical_Steps && o.Critical_Steps.length) ? data.orders.find(o => o.Critical_Steps && o.Critical_Steps.length).Critical_Steps : [];

  if (!standardFlow.length) { card.style.display = 'none'; return; }
  card.style.display = 'block';

  window._pamStandardFlow   = standardFlow;
  window._pamCriticalSteps  = criticalSteps;
  window._pamStepDevCounts  = {}; // populated below

  // For each step count: orders with deviations (problem count) AND compliant orders (pass count)
  const stepDevCounts  = window._pamStepDevCounts;
  const stepPassCounts = {};
  standardFlow.forEach(function(s) {
    const sLow = s.toLowerCase();
    stepDevCounts[s] = data.orders.filter(function(o) {
      return (o.Deviations_Array || []).some(function(d) {
        return (d.step        || '').toLowerCase() === sLow ||
               (d.detected_at || '').toLowerCase() === sLow;
      }) || (o.Block_Step || '').toLowerCase() === sLow;
    }).length;
    stepPassCounts[s] = data.orders.filter(function(o) {
      return o.Process_Status === 'PASS' &&
             (o.Actual_Flow || []).some(function(a) { return a.toLowerCase() === sLow; });
    }).length;
  });

  container.innerHTML = standardFlow.map(function(step, i) {
    const isCrit    = criticalSteps.some(function(c) { return c.toLowerCase() === step.toLowerCase(); });
    const dc        = stepDevCounts[step]  || 0;
    const passCount = stepPassCounts[step] || 0;
    const hasDevs   = dc > 0;
    const safeStep  = step.replace(/'/g, "\\'");
    // Badge: ⚠ N for problem steps, ✓ N for clean steps (compliant order count)
    const badgeClass = hasDevs ? ' dev-count-active' : ' pass-count-badge';
    const badgeText  = hasDevs ? ('⚠ ' + dc) : ('✓ ' + passCount);
    const tooltip    = hasDevs
      ? (isCrit ? '⭑ Critical · ' : '') + dc + ' orders with deviations — click to filter'
      : passCount + ' compliant orders at this step — click to view';
    const bubbleClass = 'flow-bubble' + (isCrit ? ' critical-step' : '');
    return (
      '<div class="flow-bubble-wrap">' +
        '<div class="' + bubbleClass + '"' +
             ' id="bubble-' + i + '"' +
             ' title="' + tooltip + '"' +
             ' onclick="selectFlowStep(\'' + safeStep + '\', ' + i + ')">' +
          '<span class="bubble-num">' + (i + 1) + '</span>' +
          ' ' + step + (isCrit ? ' <span class="bubble-crit">⭑</span>' : '') +
          '<span class="flow-bubble-count' + badgeClass + '">' + badgeText + '</span>' +
        '</div>' +
        (i < standardFlow.length - 1 ? '<div class="flow-bubble-arrow">→</div>' : '') +
      '</div>'
    );
  }).join('');

  selectedFlowSteps = [];
  updateFlowFilterUI();
}

function selectFlowStep(step, idx) {
  const pos = selectedFlowSteps.indexOf(step);
  if (pos !== -1) {
    selectedFlowSteps.splice(pos, 1); // toggle off
  } else {
    selectedFlowSteps.push(step);     // toggle on
  }
  updateFlowFilterUI();
  applyFlowFilter();
}

function updateFlowFilterUI() {
  const flow = window._pamStandardFlow || [];
  const clearBtn = document.getElementById('flow-clear-btn');
  const matchBadge = document.getElementById('flow-match-badge');
  const seqDisplay = document.getElementById('flow-selected-sequence');
  const fssSteps = document.getElementById('fss-steps');
  const hint = document.getElementById('flow-filter-hint');

  flow.forEach(function(step, i) {
    const bubble = document.getElementById('bubble-' + i);
    if (!bubble) return;
    const selIdx = selectedFlowSteps.indexOf(step);
    bubble.classList.remove('selected', 'seq-active', 'seq-dimmed');
    const numEl = bubble.querySelector('.bubble-num');
    if (selIdx !== -1) {
      bubble.classList.add('selected', 'seq-active');
      if (numEl) numEl.textContent = selIdx + 1;
    } else {
      if (numEl) numEl.textContent = i + 1;
      if (selectedFlowSteps.length > 0) bubble.classList.add('seq-dimmed');
    }
  });

  const hasFilter = selectedFlowSteps.length > 0;
  if (clearBtn) clearBtn.style.display = hasFilter ? 'inline-block' : 'none';
  if (matchBadge) matchBadge.style.display = 'none';

  if (seqDisplay && fssSteps) {
    seqDisplay.style.display = hasFilter ? 'flex' : 'none';
    if (hasFilter) {
      fssSteps.innerHTML = selectedFlowSteps.map(function(s, i) {
        return '<span class="fss-pill">' + s + '</span>' +
               (i < selectedFlowSteps.length - 1 ? '<span class="fss-arrow">→</span>' : '');
      }).join('');
    }
  }

  if (hint) {
    if (!hasFilter) {
      hint.innerHTML = '<span style="color:var(--critical)">⚠ N</span> = problem orders at step &nbsp;·&nbsp; <span style="color:var(--pass)">✓ N</span> = compliant orders &nbsp;·&nbsp; click any step to filter';
    } else {
      const devSelected  = selectedFlowSteps.filter(function(s) { return (window._pamStepDevCounts[s] || 0) > 0; });
      hint.innerHTML = devSelected.length > 0
        ? 'Showing orders with deviations at selected step' + (devSelected.length > 1 ? 's' : '')
        : 'Showing compliant orders passing through selected step' + (selectedFlowSteps.length > 1 ? 's' : '');
    }
  }
}

function applyFlowFilter() {
  if (!appData) return;

  if (selectedFlowSteps.length === 0) {
    renderInsightsTable(
      appData.insights ||
      appData.orders.filter(function(o) { return o.Process_Status !== 'PASS'; })
                    .sort(function(a,b) { return b.Risk_Score - a.Risk_Score; }).slice(0,10)
    );
    set('insights-count', 'Top 10');
    const badge = document.getElementById('flow-match-badge');
    if (badge) badge.style.display = 'none';
    return;
  }

  const devSteps  = selectedFlowSteps.filter(function(s) { return (window._pamStepDevCounts[s] || 0) > 0; });
  const passSteps = selectedFlowSteps.filter(function(s) { return (window._pamStepDevCounts[s] || 0) === 0; });

  let matched;
  let filterLabel;

  if (devSteps.length > 0) {
    // At least one selected step has deviations → show problem orders for those steps
    matched = appData.orders.filter(function(o) {
      return devSteps.some(function(step) {
        const sLow = step.toLowerCase();
        return (o.Deviations_Array || []).some(function(d) {
          return (d.step        || '').toLowerCase() === sLow ||
                 (d.detected_at || '').toLowerCase() === sLow;
        }) || (o.Block_Step || '').toLowerCase() === sLow;
      });
    });
    filterLabel = matched.length + ' orders with deviations';
  } else {
    // All selected steps are clean → show compliant (PASS) orders that went through those steps
    matched = appData.orders.filter(function(o) {
      if (o.Process_Status !== 'PASS') return false;
      return passSteps.every(function(step) {
        return (o.Actual_Flow || []).some(function(a) { return a.toLowerCase() === step.toLowerCase(); });
      });
    });
    filterLabel = matched.length + ' compliant orders';
  }

  const badge = document.getElementById('flow-match-badge');
  if (badge) {
    badge.style.display = 'inline-block';
    badge.textContent = matched.length + ' order' + (matched.length !== 1 ? 's' : '');
  }

  set('insights-count', filterLabel);
  renderInsightsTable(matched.sort(function(a,b) { return (b.Risk_Score||0) - (a.Risk_Score||0); }));
}

function clearFlowFilter() {
  selectedFlowSteps = [];
  updateFlowFilterUI();
  applyFlowFilter();
}

// ── Top 5 Sequences ────────────────────────────────────────
function renderTopSequences(data) {
  const card = document.getElementById('top-sequences-card');
  const list = document.getElementById('top-sequences-list');
  if (!card || !list) return;

  // Build sequence frequency map from actual flows
  const seqMap = {};
  data.orders.forEach(o => {
    const flow = (o.Actual_Flow || []);
    if (!flow.length) return;
    const key = flow.join(' → ');
    if (!seqMap[key]) seqMap[key] = { flow, count: 0, orders: [] };
    seqMap[key].count++;
    seqMap[key].orders.push(o.Order_Number);
  });

  const total = data.orders.length;
  const top5 = Object.values(seqMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  if (!top5.length) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  set('seq-count', top5.length + ' unique patterns shown');

  const rankColors = ['r1','r2','r3','',''];
  list.innerHTML = top5.map((seq, i) => {
    const pct = Math.round((seq.count / total) * 100);
    const pills = seq.flow.map((s, j) =>
      `<span class="seq-step-pill">${s}</span>${j < seq.flow.length-1 ? '<span class="seq-arrow">→</span>' : ''}`
    ).join('');
    return `
      <div class="seq-item" id="seq-item-${i}" onclick="selectSequence(${i})" title="Click to filter orders with this exact sequence">
        <div class="seq-rank ${rankColors[i]}">#${i+1}</div>
        <div class="seq-steps">${pills}</div>
        <div class="seq-meta">
          <div class="seq-count-num">${seq.count}</div>
          <div class="seq-count-lbl">orders</div>
          <div class="seq-pct">${pct}%</div>
        </div>
      </div>`;
  }).join('');

  // Store for filter use
  list._top5 = top5;
}

function selectSequence(idx) {
  const list = document.getElementById('top-sequences-list');
  const top5 = list._top5;
  if (!top5) return;

  document.querySelectorAll('.seq-item').forEach(el => el.classList.remove('seq-selected'));

  if (selectedSequence === idx) {
    selectedSequence = null;
    renderInsightsTable(
      appData.insights ||
      appData.orders.filter(o => o.Process_Status !== 'PASS')
                    .sort((a,b) => b.Risk_Score - a.Risk_Score).slice(0,10)
    );
    set('insights-count', 'Top 10');
    return;
  }

  selectedSequence = idx;
  document.getElementById(`seq-item-${idx}`)?.classList.add('seq-selected');

  const targetKey = top5[idx].flow.join(' → ');
  const filtered = appData.orders.filter(o => (o.Actual_Flow || []).join(' → ') === targetKey);
  set('insights-count', filtered.length + ' orders · sequence #' + (idx+1));
  renderInsightsTable(filtered.sort((a,b) => b.Risk_Score - a.Risk_Score));
}

// ── Heatmap cell click → filter insights table ─────────────
function filterByRiskHeatmap(level, el) {
  const allCells = document.querySelectorAll('.heatmap-cell');

  if (selectedHeatmapRisk === level) {
    selectedHeatmapRisk = null;
    allCells.forEach(c => c.classList.remove('active'));
    renderInsightsTable(
      appData.insights ||
      appData.orders.filter(o => o.Process_Status !== 'PASS')
                    .sort((a,b) => b.Risk_Score - a.Risk_Score).slice(0,10)
    );
    set('insights-count', 'Top 10');
    return;
  }

  selectedHeatmapRisk = level;
  allCells.forEach(c => c.classList.remove('active'));
  el.classList.add('active');

  const filtered = appData.orders
    .filter(o => o.Risk_Level === level)
    .sort((a,b) => b.Risk_Score - a.Risk_Score);
  set('insights-count', filtered.length + ' ' + level + ' risk orders');
  renderInsightsTable(filtered);
}

// ── Order Risk Heatmap (one tile per order, grouped by risk) ─
function renderOrderHeatmap(data) {
  const card = document.getElementById('order-heatmap-card');
  const body = document.getElementById('order-heatmap-body');
  if (!card || !body) return;
  card.style.display = 'block';

  const levels = ['CRITICAL','HIGH','MEDIUM','LOW'];
  const grouped = { CRITICAL: [], HIGH: [], MEDIUM: [], LOW: [] };

  data.orders.forEach(o => {
    const l = o.Risk_Level;
    if (grouped[l]) grouped[l].push(o);
  });

  // Sort within each group: BLOCKED first, then ALERT, then PASS; within that by Risk_Score
  const statusOrder = { BLOCKED: 0, ALERT: 1, PASS: 2 };
  levels.forEach(l => {
    grouped[l].sort((a, b) =>
      (statusOrder[a.Process_Status] ?? 3) - (statusOrder[b.Process_Status] ?? 3) ||
      (b.Risk_Score || 0) - (a.Risk_Score || 0)
    );
  });

  body.innerHTML = levels
    .filter(l => grouped[l].length > 0)
    .map(l => {
      const tiles = grouped[l].map(o => {
        const statusIcon = o.Process_Status === 'BLOCKED' ? '🚫' : o.Process_Status === 'ALERT' ? '⚠' : '✓';
        const date = getOrderDate(o);
        return `
          <div class="oh-tile oh-${l.toLowerCase()}${o.Process_Status === 'BLOCKED' ? ' oh-blocked' : ''}"
               onclick="showDetail('${o.Order_Number}')"
               title="${o.Order_Number}&#10;${o.Process_Status} · ${l} RISK${date ? '&#10;' + date : ''}">
            <div class="oh-tile-num">${o.Order_Number}</div>
            <div class="oh-tile-meta">
              <span class="oh-tile-icon">${statusIcon}</span>
              <span class="oh-tile-status">${o.Process_Status}</span>
            </div>
          </div>`;
      }).join('');

      return `
        <div class="oh-group">
          <div class="oh-group-label oh-lbl-${l.toLowerCase()}">
            ${l}
            <span class="oh-group-count">${grouped[l].length}</span>
          </div>
          <div class="oh-tiles">${tiles}</div>
        </div>`;
    }).join('');

  set('heatmap-order-count', data.orders.length + ' orders');
}
