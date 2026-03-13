// ═══════════════════════════════════════════════════════════
//  PAM DEMO DATA  —  realistic SAP P2P procurement dataset
//  This is what renders when no files are uploaded or when
//  DEMO_MODE = true in config.js
// ═══════════════════════════════════════════════════════════

function buildDemoData() {

  const standardFlow = [
    'purchase requisition created',
    'purchase requisition approved',
    'purchase order created',
    'purchase order approved',
    'goods receipt posted',
    'invoice received',
    'invoice verified',
    'payment processed'
  ];

  const criticalSteps = [
    'purchase requisition approved',
    'purchase order approved',
    'goods receipt posted',
    'invoice verified'
  ];

  const customers = [
    'Siemens AG', 'Bosch GmbH', 'BASF SE', 'Henkel AG',
    'Bayer AG', 'Volkswagen AG', 'Thyssenkrupp AG', 'Deutsche Post DHL',
    'Merck KGaA', 'Continental AG', 'Daimler Truck AG', 'Fresenius SE'
  ];

  const rcaBank = [
    {
      root_cause: 'Purchase order was approved and invoiced without prior goods receipt verification, bypassing the mandatory 3-way match control.',
      business_risk: 'High risk of payment for undelivered goods. Full PO value financially exposed. SOX compliance violation possible.',
      recommendation: 'Enforce 3-way match (PO + GR + Invoice) before payment approval. Configure hard block in SAP MM for invoice posting without GR.'
    },
    {
      root_cause: 'Invoice posted before purchase order received formal approval — classic maverick buying pattern indicating control bypass.',
      business_risk: 'Unauthorized spend outside approved budget. Incomplete audit trail; cannot confirm budget authorization was obtained.',
      recommendation: 'Configure SAP workflow to block invoice posting when PO status is "Pending Approval". Notify procurement manager via automated alert.'
    },
    {
      root_cause: 'Payment was processed without the invoice verification step, circumventing accounts payable segregation of duties.',
      business_risk: 'Duplicate payment risk. Potential vendor overpayment. GAAP and internal audit compliance violation.',
      recommendation: 'Implement hard block on payment posting until 3-way match confirmed. Review AP team segregation of duties matrix.'
    },
    {
      root_cause: 'Goods receipt step was entirely skipped — process jumped directly from PO approval to invoice processing.',
      business_risk: 'Cannot confirm physical delivery of goods. Risk of phantom GR receipts being backdated. Inventory record inaccurate.',
      recommendation: 'Mandatory GR confirmation required before invoice processing. Enable automatic GR/IR clearing account review in month-end close.'
    },
    {
      root_cause: 'Purchase requisition approval was bypassed — purchase order created directly without requisition, circumventing pre-commitment budget check.',
      business_risk: 'Spend outside approved budget. No pre-commitment check against cost center budget ceiling. Audit finding risk HIGH.',
      recommendation: 'Enable mandatory PR-to-PO linkage in SAP. Require budget owner digital approval on all PRs above €5,000 threshold.'
    },
    {
      root_cause: 'Process sequence inverted: invoice verification completed before goods receipt was confirmed, reversing standard P2P control order.',
      business_risk: 'Payment liability created before delivery confirmed. Potential for supplier disputes with no GR evidence to reference.',
      recommendation: 'Re-sequence SAP workflow to enforce GR before invoice verification. Add system validation checkpoint at invoice entry screen.'
    }
  ];

  // ── Build 40 realistic orders ──────────────────────────
  const orders = [];

  // Distribution: 8 BLOCKED, 14 ALERT, 18 PASS
  const statusDist = [
    ...Array(8).fill('BLOCKED'),
    ...Array(14).fill('ALERT'),
    ...Array(18).fill('PASS')
  ];

  // Spread orders across the last 90 days (newest = highest index)
  const today = new Date();

  for (let i = 0; i < 40; i++) {
    const status   = statusDist[i];
    const customer = customers[i % customers.length];
    const rca      = rcaBank[i % rcaBank.length];
    const orderNum = `45${String(100000 + i).slice(1)}`;

    const daysAgo = Math.round(90 - i * 2.2);
    const orderDateObj = new Date(today);
    orderDateObj.setDate(orderDateObj.getDate() - daysAgo);
    const orderDate = orderDateObj.toISOString().split('T')[0];

    let actualFlow   = [...standardFlow];
    let deviations   = [];
    let timeline     = standardFlow.map((s, idx) => ({
      step_number:  idx + 1,
      step_name:    s,
      decision:     'ALLOW',
      reason:       'Step executed normally',
      severity:     'LOW',
      would_block:  false
    }));
    let blocked       = false;
    let blockReason   = '';
    let blockStep     = '';
    let blockPosition = -1;

    if (status === 'BLOCKED') {
      // Skip goods receipt — most common critical skip
      const skipIdx = 4;
      actualFlow = actualFlow.filter((_, idx) => idx !== skipIdx);

      deviations.push({
        Type:        'CRITICAL_STEP_SKIPPED',
        step:        'goods receipt posted',
        severity:    'CRITICAL',
        detected_at: 'invoice received',
        position:    skipIdx + 1
      });

      timeline[skipIdx].decision    = 'BLOCK';
      timeline[skipIdx].severity    = 'CRITICAL';
      timeline[skipIdx].reason      = 'Critical step skipped: goods receipt posted';
      timeline[skipIdx].would_block = true;

      blocked       = true;
      blockReason   = 'Critical step skipped: goods receipt posted';
      blockStep     = 'invoice received';
      blockPosition = skipIdx + 1;

      // Some BLOCKED orders also have a wrong sequence
      if (i % 3 === 0) {
        deviations.push({
          Type:        'WRONG_SEQUENCE',
          step:        'invoice received → purchase order approved',
          severity:    'MEDIUM',
          detected_at: 'invoice received',
          position:    5
        });
      }
    }

    if (status === 'ALERT') {
      // Wrong sequence only
      if (i % 2 === 0) {
        deviations.push({
          Type:        'WRONG_SEQUENCE',
          step:        'invoice received → purchase order approved',
          severity:    'MEDIUM',
          detected_at: 'invoice received',
          position:    6
        });
        timeline[5].decision = 'ALERT';
        timeline[5].severity = 'MEDIUM';
        timeline[5].reason   = 'Wrong sequence: invoice received before PO fully approved';
      }
      // Destructive action on some
      if (i % 5 === 0) {
        deviations.push({
          Type:        'DESTRUCTIVE_ACTION',
          step:        'cancel purchase order line',
          severity:    'HIGH',
          detected_at: 'cancel purchase order line',
          position:    7
        });
        const tIdx = Math.min(6, timeline.length - 1);
        timeline[tIdx].decision = 'ALERT';
        timeline[tIdx].severity = 'HIGH';
        timeline[tIdx].reason   = 'Destructive action detected: line cancellation';
      }
      // Missing critical step at end on some
      if (i % 7 === 0) {
        deviations.push({
          Type:        'CRITICAL_STEP_MISSING',
          step:        'invoice verified',
          severity:    'CRITICAL',
          detected_at: 'END',
          position:    actualFlow.length + 1
        });
        actualFlow = actualFlow.filter(s => s !== 'invoice verified');
        blocked       = true;
        blockReason   = 'Missing critical step: invoice verified';
        blockStep     = 'END';
        blockPosition = actualFlow.length + 1;
      }
    }

    const critCount = deviations.filter(d => d.severity === 'CRITICAL').length;
    const highCount = deviations.filter(d => d.severity === 'HIGH').length;
    const medCount  = deviations.filter(d => d.severity === 'MEDIUM').length;
    const riskScore = (critCount * 20) + (highCount * 12) + (medCount * 6);

    let riskLevel = 'LOW';
    if (critCount > 0)      riskLevel = 'CRITICAL';
    else if (highCount > 0) riskLevel = 'HIGH';
    else if (medCount > 0)  riskLevel = 'MEDIUM';

    // BLOCKED orders escalated to BLOCKED status even if flagged via ALERT path
    const finalStatus = (status === 'BLOCKED' || blocked) ? 'BLOCKED' : status;

    orders.push({
      Order_Number:          orderNum,
      Order_Date:            orderDate,
      Customer:              customer,
      Process_Status:        finalStatus,
      Risk_Level:            riskLevel,
      Risk_Score:            riskScore,
      Status_Label:          finalStatus === 'BLOCKED' ? 'Process Blocked'
                           : finalStatus === 'ALERT'   ? 'Alert - Review Required'
                           :                             'Compliant',
      Total_Steps:           actualFlow.length,
      Completed_Steps:       timeline.filter(t => t.decision === 'ALLOW').length,
      Deviation_Count:       deviations.length,
      Deviation_Types:       [...new Set(deviations.map(d => d.Type))].join(', ') || 'None',
      Deviations_Array:      deviations,
      Deviation_Counts:      { CRITICAL: critCount, HIGH: highCount, MEDIUM: medCount, LOW: 0 },
      Missing_Critical_Steps: blocked && blockStep === 'END' ? ['invoice verified']
                             : status === 'BLOCKED'           ? ['goods receipt posted']
                             :                                  [],
      Critical_Missing_Count: (critCount > 0) ? critCount : 0,
      Blocked:               finalStatus === 'BLOCKED',
      Block_Reason:          blockReason,
      Block_Step:            blockStep,
      Block_Position:        blockPosition,
      Actual_Flow:           actualFlow,
      Standard_Flow:         standardFlow,
      Critical_Steps:        criticalSteps,
      Step_By_Step_Timeline: timeline,
      root_cause:    finalStatus !== 'PASS' ? rca.root_cause    : '',
      business_risk: finalStatus !== 'PASS' ? rca.business_risk : '',
      recommendation:finalStatus !== 'PASS' ? rca.recommendation: ''
    });
  }

  // ── Aggregate stats ────────────────────────────────────
  const blockedCount  = orders.filter(o => o.Process_Status === 'BLOCKED').length;
  const alertCount    = orders.filter(o => o.Process_Status === 'ALERT').length;
  const passCount     = orders.filter(o => o.Process_Status === 'PASS').length;
  const criticalCount = orders.filter(o => o.Risk_Level === 'CRITICAL').length;
  const highCount2    = orders.filter(o => o.Risk_Level === 'HIGH').length;
  const mediumCount   = orders.filter(o => o.Risk_Level === 'MEDIUM').length;
  const lowCount      = orders.filter(o => o.Risk_Level === 'LOW').length;

  return {
    status:       'success',
    totalOrders:  orders.length,
    heatmap: {
      CRITICAL: criticalCount,
      HIGH:     highCount2,
      MEDIUM:   mediumCount,
      LOW:      lowCount
    },
    statusSummary: {
      BLOCKED: blockedCount,
      ALERT:   alertCount,
      PASS:    passCount
    },
    insights: orders
      .filter(o => o.Process_Status !== 'PASS')
      .sort((a, b) => b.Risk_Score - a.Risk_Score)
      .slice(0, 10),
    orders
  };
}
