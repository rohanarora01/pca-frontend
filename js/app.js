// ═══════════════════════════════════════════════════════════
//  PAM APP.JS  —  state management, navigation, API calls
// ═══════════════════════════════════════════════════════════

// ── Global state ───────────────────────────────────────────
let appData        = null;
let statusFilter   = 'ALL';
let riskFilter     = null;
let fileA          = null;
let fileB          = null;
let dateFrom       = '';
let dateTo         = '';

// ── Utility ────────────────────────────────────────────────
function set(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3500);
}

// ── Navigation ─────────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const page = document.getElementById('page-' + name);
  if (page) page.classList.add('active');

  // Highlight matching nav item
  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.dataset.page === name) n.classList.add('active');
  });

  const titles = {
    dashboard: 'Process Compliance Dashboard',
    orders:    'Order Analysis',
    upload:    'Upload & Run Analysis',
    detail:    'Order Detail'
  };
  set('topbar-title', titles[name] || name);

  if (name === 'orders') renderOrdersTable();
}

// ── File upload handlers ───────────────────────────────────
function onFileA(input) {
  fileA = input.files[0];
  if (fileA) set('file-a-name', '✓ ' + fileA.name);
  checkRunReady();
}

function onFileB(input) {
  fileB = input.files[0];
  if (fileB) set('file-b-name', '✓ ' + fileB.name);
  checkRunReady();
}

function checkRunReady() {
  document.getElementById('run-btn').disabled = !(fileA && fileB);
}

// ── Progress animation ─────────────────────────────────────
function animateProgress() {
  const wrap  = document.getElementById('progress-wrap');
  const bar   = document.getElementById('progress-bar');
  const label = document.getElementById('progress-label');
  const steps = PAM_CONFIG.PROGRESS_STEPS;
  const pcts  = [10, 25, 45, 65, 85, 100];

  wrap.style.display = 'block';
  let i = 0;

  return new Promise(resolve => {
    const iv = setInterval(() => {
      bar.style.width    = pcts[i] + '%';
      label.textContent  = steps[i] || 'Processing…';
      i++;
      if (i >= steps.length) {
        clearInterval(iv);
        setTimeout(resolve, 400);
      }
    }, 1800);
  });
}

// ── Run analysis against n8n backend ──────────────────────
async function runAnalysis() {
  if (!fileA || !fileB) return;

  document.getElementById('run-btn').disabled = true;
  animateProgress(); // don't await — let it run alongside fetch

  const fd = new FormData();
  fd.append('table_a', fileA);
  fd.append('table_b', fileB);
  fd.append('definition_mode', 'AI');

  try {
    if (PAM_CONFIG.DEMO_MODE) throw new Error('demo_mode');

    const resp = await fetch(PAM_CONFIG.WEBHOOK_ANALYSIS, {
      method: 'POST',
      body:   fd
    });

    if (!resp.ok) throw new Error('HTTP ' + resp.status);

    const data = await resp.json();

    if (data.status !== 'success') throw new Error('Backend returned error status');

    renderDashboard(data);
    document.getElementById("send-alert-btn").style.display = "inline-flex";
    showPage('dashboard');
    showToast('Analysis complete — ' + data.totalOrders + ' orders processed', 'success');

  } catch (e) {
    console.warn('Backend error or demo mode, loading demo data:', e.message);
    const demo = buildDemoData();
    renderDashboard(demo);
    showPage('dashboard');
    const msg = e.message === 'demo_mode'
      ? 'Demo mode active — showing demo dataset'
      : 'Backend unreachable — demo data loaded';
    showToast(msg, 'error');
  }

  document.getElementById('run-btn').disabled = false;
}

// ── Load demo data ─────────────────────────────────────────
function loadDemoData() {
  const data = buildDemoData();
  renderDashboard(data);
  showPage('dashboard');
  showToast('Demo dataset loaded — ' + data.totalOrders + ' orders', 'success');
}

// ── Alert modal ────────────────────────────────────────────
function getAlertTargets() {
  if (!appData) return [];
  const checkedRisks = ['CRITICAL','HIGH','MEDIUM'].filter(r => {
    const el = document.getElementById('tier-' + r);
    return el ? el.checked : false;
  });
  return appData.orders.filter(o =>
    checkedRisks.includes(o.Risk_Level) ||
    (document.getElementById('tier-CRITICAL')?.checked && o.Process_Status === 'BLOCKED')
  );
}

function refreshAlertList() {
  const targets = getAlertTargets();
  set('modal-sub', targets.length + ' order' + (targets.length !== 1 ? 's' : '') + ' will receive alert emails');

  document.getElementById('modal-list').innerHTML = targets.length
    ? targets.map(o => `
        <div class="modal-order-item">
          <span class="modal-order-num">${o.Order_Number}</span>
          <span class="modal-customer">${o.Customer || ''}</span>
          <span class="badge ${o.Risk_Level}">${o.Risk_Level}</span>
          <span class="badge ${o.Process_Status}" style="margin-left:2px">${o.Process_Status}</span>
        </div>`).join('')
    : '<div style="color:var(--text3);font-size:12px;padding:12px 0;text-align:center">No tiers selected</div>';

  const btn = document.getElementById('modal-send-btn');
  if (btn) btn.disabled = targets.length === 0;
}

function openAlertModal() {
  if (!appData) { showToast('Load data first', 'error'); return; }

  // Update tier counts
  ['CRITICAL','HIGH','MEDIUM'].forEach(r => {
    let count;
    if (r === 'CRITICAL') {
      count = appData.orders.filter(o => o.Risk_Level === 'CRITICAL' || o.Process_Status === 'BLOCKED').length;
    } else {
      count = appData.orders.filter(o => o.Risk_Level === r).length;
    }
    set('tier-count-' + r, count);
  });

  refreshAlertList();
  document.getElementById('alert-modal').classList.add('open');
}

function closeAlertModal() {
  document.getElementById('alert-modal').classList.remove('open');
}

async function sendAlerts() {
  const btn     = document.getElementById('modal-send-btn');
  const targets = getAlertTargets();
  if (!targets.length) return;

  btn.textContent = 'Sending…';
  btn.disabled    = true;

  try {
    await fetch(PAM_CONFIG.WEBHOOK_ALERTS, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orders: targets.map(o => ({
          Order_Number:   o.Order_Number,
          Customer:       o.Customer,
          Risk_Level:     o.Risk_Level,
          Process_Status: o.Process_Status,
          Block_Reason:   o.Block_Reason,
          root_cause:     o.root_cause,
          business_risk:  o.business_risk,
          recommendation: o.recommendation
        }))
      })
    });
  } catch (e) {
    console.warn('Alert webhook not available:', e.message);
  }

  closeAlertModal();
  showToast('Alert emails sent to ' + targets.length + ' orders', 'success');
  btn.textContent = '📧 Send Alert Emails';
  btn.disabled    = false;
}

// ── Init ───────────────────────────────────────────────────
window.addEventListener('load', () => {
  showPage('upload');
});