import { useEffect, useState } from 'react'
import { supabase } from '../../../shared/lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend,
} from 'recharts'
import { FileText } from 'lucide-react'

const TRUST_REASON_LABELS = {
  claim_rejected: 'Claim rejected',
  repeat_rejections_30d: 'Repeat rejections (30d)',
  no_show_handoff: 'No-show at handoff',
  claim_approved_handoff_completed: 'Handoff completed',
  issc_dropoff_returned: 'ISSC drop-off returned',
  tip_credited: 'Tip credited',
}

const RESOLVED_VIA_LABELS = {
  handoff: 'Direct handoff',
  issc_dropoff: 'ISSC drop-off',
  issc_walkin_pickup: 'ISSC walk-in pickup',
  tip_credited: 'Tip led to recovery',
}

const COLORS = ['#06433C', '#2563eb', '#d97706', '#7c3aed', '#dc2626', '#0d8f82', '#db2777', '#475569']

const CATEGORY_COLORS = {
  'Electronics': '#06433C',
  'IDs & Cards': '#2563eb',
  'Bags': '#d97706',
  'Clothing': '#7c3aed',
  'Books & Notes': '#0d8f82',
  'Keys': '#ea580c',
  'Wallet': '#db2777',
  'Jewelry': '#4f46e5',
  'Documents': '#1e293b',
  'Other': '#6b7280',
}

// Title-cases each word but keeps short embedded acronyms (EPM, NRM, CEM,
// MT...) and small connector words (of/in/and/...) looking natural, e.g.
// "BACHELOR OF SCIENCE IN ENVIRONMENTAL SCIENCE (EPM)" ->
// "Bachelor of Science in Environmental Science (EPM)".
const SMALL_WORDS = new Set(['of', 'in', 'and', 'the', 'for', 'a', 'to'])
function titleCase(str) {
  if (!str) return str
  let wordIndex = 0
  return str.replace(/[A-Za-z]+/g, (word) => {
    const isFirst = wordIndex === 0
    wordIndex += 1
    const lower = word.toLowerCase()
    if (word.length <= 3 && word === word.toUpperCase() && !isFirst && !SMALL_WORDS.has(lower)) {
      return word
    }
    if (SMALL_WORDS.has(lower) && !isFirst) return lower
    return word[0].toUpperCase() + word.slice(1).toLowerCase()
  })
}

function BarList({ data, barColor = '#06433C' }) {
  const maxValue = Math.max(...data.map((d) => d.value), 1)
  return (
    <div className="flex flex-col gap-2.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-xs font-medium text-text-primary">{d.name}</p>
              <p className="text-xs text-text-muted shrink-0">{d.value}</p>
            </div>
            <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${(d.value / maxValue) * 100}%`, background: barColor }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function StatCard({ label, value, sub, color }) {
  return (
    <div className="bg-surface-card border border-border rounded-xl p-4">
      <p className="text-xs text-text-muted mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color ?? 'text-text-primary'}`}>{value}</p>
      {sub && <p className="text-xs text-text-muted mt-1">{sub}</p>}
    </div>
  )
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState({ total: 0, resolved: 0, open: 0, claimed: 0, approved: 0, avgResolutionDays: null })
  const [categoryData, setCategoryData] = useState([])
  const [trendData, setTrendData] = useState([])
  const [topLocations, setTopLocations] = useState([])
  const [claimsFunnel, setClaimsFunnel] = useState({ pending: 0, approved: 0, rejected: 0, approvalRate: 0 })
  const [trustDistribution, setTrustDistribution] = useState([])
  const [avgTrustScore, setAvgTrustScore] = useState(null)
  const [reportTypeData, setReportTypeData] = useState([])
  const [resolvedViaData, setResolvedViaData] = useState([])
  const [tipsStats, setTipsStats] = useState({ total: 0, credited: 0, rate: 0 })
  const [trustEventReasons, setTrustEventReasons] = useState([])
  const [accountStatus, setAccountStatus] = useState({ active: 0, deactivated: 0 })
  const [accountsByProgram, setAccountsByProgram] = useState([])
  const [accountsByDepartment, setAccountsByDepartment] = useState([])
  const [accountsByYear, setAccountsByYear] = useState([])
  const [lostByDepartment, setLostByDepartment] = useState([])
  const [lostByProgram, setLostByProgram] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      await Promise.all([
        fetchStats(),
        fetchCategoryData(),
        fetchTrendData(),
        fetchTopLocations(),
        fetchClaimsFunnel(),
        fetchTrustDistribution(),
        fetchReportTypeAndResolution(),
        fetchTipsStats(),
        fetchTrustEventReasons(),
        fetchAccountsBreakdown(),
        fetchLostByDepartmentAndProgram(),
      ])
    } finally {
      setLoading(false)
    }
  }

  async function fetchStats() {
    const { data, error } = await supabase.from('reports').select('status, created_at, resolved_at')
    if (error || !data) return
    const total = data.length
    const resolved = data.filter((r) => r.status === 'resolved').length
    const open = data.filter((r) => r.status === 'open').length
    const claimed = data.filter((r) => r.status === 'claimed').length
    const approved = data.filter((r) => r.status === 'approved').length
    const resolvedWithDates = data.filter((r) => r.status === 'resolved' && r.resolved_at && r.created_at)
    const avgResolutionDays = resolvedWithDates.length > 0
      ? Math.round(resolvedWithDates.reduce((sum, r) => sum + (new Date(r.resolved_at) - new Date(r.created_at)) / (1000 * 60 * 60 * 24), 0) / resolvedWithDates.length)
      : null
    setStats({ total, resolved, open, claimed, approved, avgResolutionDays })
  }

  async function fetchCategoryData() {
    const { data, error } = await supabase.from('reports').select('category')
    if (error || !data) return
    const counts = {}
    for (const r of data) {
      const cat = r.category ?? 'Uncategorized'
      counts[cat] = (counts[cat] ?? 0) + 1
    }
    setCategoryData(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value })))
  }

  async function fetchTrendData() {
    const { data, error } = await supabase.from('reports').select('created_at').order('created_at', { ascending: true })
    if (error || !data) return
    const counts = {}
    for (const r of data) {
      const month = new Date(r.created_at).toLocaleString('default', { month: 'short', year: '2-digit' })
      counts[month] = (counts[month] ?? 0) + 1
    }
    setTrendData(Object.entries(counts).map(([month, count]) => ({ month, count })))
  }

  async function fetchTopLocations() {
    const { data, error } = await supabase.from('reports').select('location').not('location', 'is', null)
    if (error || !data) return
    const counts = {}
    for (const r of data) { if (r.location) counts[r.location] = (counts[r.location] ?? 0) + 1 }
    setTopLocations(Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([location, count]) => ({ location, count })))
  }

  async function fetchClaimsFunnel() {
    const { data, error } = await supabase.from('claims').select('status')
    if (error || !data) return
    const pending = data.filter((c) => c.status === 'pending').length
    const approved = data.filter((c) => c.status === 'approved').length
    const rejected = data.filter((c) => c.status === 'rejected').length
    const decided = approved + rejected
    const approvalRate = decided > 0 ? Math.round((approved / decided) * 100) : 0
    setClaimsFunnel({ pending, approved, rejected, approvalRate })
  }

  async function fetchTrustDistribution() {
    const { data, error } = await supabase.from('users').select('trust_score').eq('role', 'student')
    if (error || !data) return
    const bands = { '90-100': 0, '70-89': 0, 'Below 70': 0 }
    for (const u of data) {
      const s = u.trust_score ?? 100
      if (s >= 90) bands['90-100']++
      else if (s >= 70) bands['70-89']++
      else bands['Below 70']++
    }
    setTrustDistribution(Object.entries(bands).map(([band, value]) => ({ band, value })))
    setAvgTrustScore(data.length > 0 ? Math.round(data.reduce((sum, u) => sum + (u.trust_score ?? 100), 0) / data.length) : null)
  }

  async function fetchReportTypeAndResolution() {
    const { data, error } = await supabase.from('reports').select('type, status, resolved_via')
    if (error || !data) return
    const lost = data.filter((r) => r.type === 'lost').length
    const walkin = data.filter((r) => r.type === 'found_walkin').length
    setReportTypeData([
      { name: 'Reported lost by students', value: lost },
      { name: 'ISSC walk-in drop-offs', value: walkin },
    ])

    const counts = {}
    for (const r of data) {
      if (r.status === 'resolved' && r.resolved_via) counts[r.resolved_via] = (counts[r.resolved_via] ?? 0) + 1
    }
    setResolvedViaData(Object.entries(counts).map(([key, value]) => ({ name: RESOLVED_VIA_LABELS[key] ?? key, value })))
  }

  async function fetchTipsStats() {
    const { data, error } = await supabase.from('tips').select('credited_for_recovery')
    if (error || !data) return
    const total = data.length
    const credited = data.filter((t) => t.credited_for_recovery).length
    const rate = total > 0 ? Math.round((credited / total) * 100) : 0
    setTipsStats({ total, credited, rate })
  }

  async function fetchTrustEventReasons() {
    const { data, error } = await supabase.from('trust_score_events').select('reason')
    if (error || !data) return
    const counts = {}
    for (const e of data) counts[e.reason] = (counts[e.reason] ?? 0) + 1
    setTrustEventReasons(
      Object.entries(TRUST_REASON_LABELS).map(([key, name]) => ({ name, value: counts[key] ?? 0 }))
    )
  }

  async function fetchAccountsBreakdown() {
    // program/department come from the structured programs table now
    // (program_code/department_code, joined here for their short codes) -
    // the old free-text `program` column is only a pre-migration fallback
    // for any account that somehow still has no program_code set.
    const { data, error } = await supabase
      .from('users')
      .select('program, program_code, department_code, year_level, status, programs:program_code ( program_name, department_name )')
      .eq('role', 'student')
    if (error || !data) return

    setAccountStatus({
      active: data.filter((u) => u.status === 'active').length,
      deactivated: data.filter((u) => u.status === 'deactivated').length,
    })

    const progCounts = {}
    for (const u of data) {
      const p = titleCase(u.programs?.program_name) || u.program?.trim() || 'Unspecified'
      progCounts[p] = (progCounts[p] ?? 0) + 1
    }
    setAccountsByProgram(
      Object.entries(progCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value }))
    )

    const deptCounts = {}
    for (const u of data) {
      const d = u.programs?.department_name || 'Unspecified'
      deptCounts[d] = (deptCounts[d] ?? 0) + 1
    }
    setAccountsByDepartment(
      Object.entries(deptCounts).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }))
    )

    const yearCounts = {}
    for (const u of data) {
      const y = u.year_level?.trim() || 'Unspecified'
      yearCounts[y] = (yearCounts[y] ?? 0) + 1
    }
    setAccountsByYear(
      Object.entries(yearCounts)
        .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
        .map(([name, value]) => ({ name, value }))
    )
  }

  // How often each department/program's students actually file a lost
  // report - distinct from "Students by Department/Program" above (which is
  // just headcount). This is reports.reporter_id joined to the reporter's
  // own department_code/program_code, counting only type === 'lost' (a
  // student report), not ISSC walk-in intake which has no student reporter.
  async function fetchLostByDepartmentAndProgram() {
    const { data, error } = await supabase
      .from('reports')
      .select('type, reporter:users!reports_reporter_id_fkey(department_code, program_code, programs:program_code(department_name, program_name))')
      .eq('type', 'lost')
    if (error || !data) return

    const deptCounts = {}
    const progCounts = {}
    for (const r of data) {
      const dept = r.reporter?.programs?.department_name || 'Unspecified'
      deptCounts[dept] = (deptCounts[dept] ?? 0) + 1
      const prog = titleCase(r.reporter?.programs?.program_name) || 'Unspecified'
      progCounts[prog] = (progCounts[prog] ?? 0) + 1
    }
    setLostByDepartment(Object.entries(deptCounts).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value })))
    setLostByProgram(Object.entries(progCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value })))
  }

  function exportReport() {
    const resolutionRate = stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0
    const maxCategory = categoryData[0]?.value ?? 1
    const maxLocation = topLocations[0]?.count ?? 1
    const maxTrend = Math.max(...trendData.map((t) => t.count), 1)
    const maxProgram = accountsByProgram[0]?.value ?? 1
    const maxDepartment = accountsByDepartment[0]?.value ?? 1

    const lostRateByDepartment = lostByDepartment
      .map((d) => {
        const students = accountsByDepartment.find((a) => a.name === d.name)?.value ?? 0
        return { name: d.name, value: d.value, students, rate: students > 0 ? d.value / students : null }
      })
      .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1))
    const maxLostProgram = lostByProgram[0]?.value ?? 1
    const maxReason = Math.max(...trustEventReasons.map((r) => r.value), 1)
    const maxTrustBand = Math.max(...trustDistribution.map((t) => t.value), 1)
    const totalReportType = Math.max(reportTypeData.reduce((sum, r) => sum + r.value, 0), 1)

    const statusRows = [
      { status: 'Open', count: stats.open, color: '#2563eb' },
      { status: 'Claimed', count: stats.claimed, color: '#d97706' },
      { status: 'Approved', count: stats.approved, color: '#16a34a' },
      { status: 'Resolved', count: stats.resolved, color: '#06433C' },
    ]

    const claimsRows = [
      { status: 'Pending', count: claimsFunnel.pending, color: '#d97706' },
      { status: 'Approved', count: claimsFunnel.approved, color: '#16a34a' },
      { status: 'Rejected', count: claimsFunnel.rejected, color: '#dc2626' },
    ]

    const resolutionMethodRows = resolvedViaData
    const totalResolvedViaKnown = Math.max(resolvedViaData.reduce((sum, r) => sum + r.value, 0), 1)

    const printWindow = window.open('', '_blank')
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>CampusFind Analytics Report</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
          @page { size: A4 portrait; margin: 0; }
          * { margin: 0; padding: 0; box-sizing: border-box; }

          /* Screen layout */
          @media screen {
            body { background: #e5e7eb; min-height: 100vh; display: flex; flex-direction: column; align-items: center; font-family: 'Inter', -apple-system, sans-serif; color: #111827; font-size: 12px; }
            .save-hint { width: 100%; position: sticky; top: 0; z-index: 10; background: #f0fdf4; border-bottom: 2px solid #06433C; padding: 10px 24px; display: flex; align-items: center; justify-content: space-between; }
            .save-hint-text { font-size: 12px; color: #065f46; }
            .save-btn { background: #06433C; color: white; border: none; border-radius: 6px; padding: 8px 18px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; }
            .save-btn:hover { background: #0a5c53; }
            .page-wrapper { display: flex; flex-direction: column; align-items: center; gap: 24px; padding: 28px 24px; }
            .page { width: 210mm; min-height: 297mm; background: white; box-shadow: 0 4px 32px rgba(0,0,0,0.18); border-radius: 4px; display: flex; flex-direction: column; }
          }

          /* Print layout */
          @media print {
            .save-hint { display: none !important; }
            body { background: white; font-family: 'Inter', -apple-system, sans-serif; color: #111827; font-size: 12px; }
            .page-wrapper { padding: 0; gap: 0; }
            .page { width: 210mm; min-height: 297mm; background: white; display: flex; flex-direction: column; box-shadow: none; border-radius: 0; page-break-after: always; break-after: page; }
            .page:last-child { page-break-after: auto; break-after: auto; }
            .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .page-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .stat-card::before { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .bar-fill { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .trend-bar { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .status-card { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            thead tr { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .footer { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }

          /* Cover header (page 1 only) */
          .header { background: #06433C; color: white; padding: 22px 28px; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
          .header-left h1 { font-size: 17px; font-weight: 700; margin-bottom: 3px; }
          .header-left p { font-size: 10.5px; opacity: 0.75; }
          .header-right { text-align: right; font-size: 10.5px; opacity: 0.85; line-height: 1.6; }
          .header-badge { display: inline-block; background: rgba(255,255,255,0.15); border-radius: 4px; padding: 3px 9px; font-size: 9px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 6px; }

          /* Slim header (pages 2+) */
          .page-header { background: #f0fdf4; border-bottom: 2px solid #06433C; padding: 14px 28px; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
          .page-header-title { font-size: 13px; font-weight: 700; color: #06433C; }
          .page-header-sub { font-size: 9.5px; color: #065f46; opacity: 0.8; margin-top: 1px; }
          .page-header-right { font-size: 9.5px; color: #6b7280; text-align: right; }

          /* Body */
          .body { padding: 22px 28px; flex: 1; display: flex; flex-direction: column; gap: 22px; }

          /* Section title */
          .section-title { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #06433C; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
          .section-title::after { content: ''; flex: 1; height: 1px; background: #d1fae5; }
          .section-note { font-size: 9.5px; color: #6b7280; margin: -4px 0 10px; }

          /* Stats */
          .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
          .stat-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; position: relative; overflow: hidden; }
          .stat-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: #06433C; }
          .stat-label { font-size: 9.5px; color: #6b7280; font-weight: 500; margin-bottom: 5px; }
          .stat-value { font-size: 26px; font-weight: 700; color: #06433C; line-height: 1; }
          .stat-sub { font-size: 9.5px; color: #9ca3af; margin-top: 4px; }
          .stat-card.highlight::before { background: #10b981; }
          .stat-card.highlight .stat-value { color: #059669; }

          /* Status cards */
          .status-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
          .status-card { border-radius: 8px; padding: 12px 14px; text-align: center; border: 1px solid #e5e7eb; }
          .status-value { font-size: 22px; font-weight: 700; margin-bottom: 2px; }
          .status-label { font-size: 9.5px; color: #6b7280; font-weight: 500; }
          .status-pct { font-size: 9px; color: #9ca3af; margin-top: 2px; }

          /* Three col */
          .three-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 22px; }

          /* Bar chart */
          .bar-chart { display: flex; flex-direction: column; gap: 9px; }
          .bar-row { display: flex; align-items: center; gap: 8px; }
          .bar-label { font-size: 10.5px; color: #374151; width: 90px; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
          .bar-track { flex: 1; height: 9px; background: #f3f4f6; border-radius: 4px; overflow: hidden; }
          .bar-fill { height: 100%; border-radius: 4px; }
          .bar-count { font-size: 10.5px; font-weight: 600; color: #06433C; width: 26px; text-align: right; flex-shrink: 0; }

          /* Trend chart */
          .trend-chart { display: flex; align-items: flex-end; gap: 6px; height: 110px; }
          .trend-bar-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; justify-content: flex-end; }
          .trend-bar { width: 100%; background: #06433C; border-radius: 3px 3px 0 0; min-height: 3px; }
          .trend-label { font-size: 9px; color: #9ca3af; text-align: center; white-space: nowrap; }
          .trend-count { font-size: 9px; color: #06433C; font-weight: 600; }

          /* Table */
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          thead tr { background: #f0fdf4; }
          th { text-align: left; padding: 8px 10px; font-weight: 600; color: #065f46; font-size: 9.5px; border-bottom: 1px solid #d1fae5; }
          td { padding: 7px 10px; border-bottom: 1px solid #f3f4f6; color: #374151; }
          tr:last-child td { border-bottom: none; }
          .td-num { font-weight: 600; color: #06433C; }

          /* Footer */
          .footer { padding: 12px 28px; background: #f9fafb; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; font-size: 9.5px; color: #9ca3af; flex-shrink: 0; margin-top: auto; }
          .footer strong { color: #06433C; }
        </style>
      </head>
      <body>

        <!-- Save hint (screen only) -->
        <div class="save-hint">
          <span class="save-hint-text">📄 Preview — 6-page A4 report. Save as PDF to keep the page breaks.</span>
          <button class="save-btn" onclick="window.print()">🖨️ Save as PDF</button>
        </div>

        <div class="page-wrapper">

          <!-- ============ PAGE 1 — Cover + Overview ============ -->
          <div class="page">
            <div class="header">
              <div class="header-left">
                <div class="header-badge">Analytics Report</div>
                <h1>CampusFind Lost &amp; Found Management System</h1>
                <p>Northwestern Samar State University · ISSC Office · Academic Year ${new Date().getFullYear()}</p>
              </div>
              <div class="header-right">
                <div>Generated on</div>
                <div style="font-weight:600;">${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                <div style="opacity:0.7;">${new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>

            <div class="body">
              <div>
                <div class="section-title">Executive Summary</div>
                <div class="stats-grid">
                  <div class="stat-card">
                    <div class="stat-label">Total Reports</div>
                    <div class="stat-value">${stats.total}</div>
                    <div class="stat-sub">All time</div>
                  </div>
                  <div class="stat-card highlight">
                    <div class="stat-label">Resolved</div>
                    <div class="stat-value">${stats.resolved}</div>
                    <div class="stat-sub">${resolutionRate}% resolution rate</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-label">Currently Open</div>
                    <div class="stat-value">${stats.open}</div>
                    <div class="stat-sub">Awaiting finder</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-label">Avg. Resolution</div>
                    <div class="stat-value">${stats.avgResolutionDays !== null ? `${stats.avgResolutionDays}d` : '—'}</div>
                    <div class="stat-sub">Days to resolve</div>
                  </div>
                </div>
              </div>

              <div>
                <div class="section-title">Status Breakdown</div>
                <div class="status-grid">
                  ${statusRows.map((s) => `
                    <div class="status-card">
                      <div class="status-value" style="color:${s.color};">${s.count}</div>
                      <div class="status-label">${s.status}</div>
                      <div class="status-pct">${stats.total > 0 ? Math.round((s.count / stats.total) * 100) : 0}% of total</div>
                    </div>
                  `).join('')}
                </div>
              </div>

              <div>
                <div class="section-title">System Health</div>
                <div class="stats-grid">
                  <div class="stat-card">
                    <div class="stat-label">Claim Approval Rate</div>
                    <div class="stat-value">${claimsFunnel.approvalRate}%</div>
                    <div class="stat-sub">${claimsFunnel.approved} approved · ${claimsFunnel.rejected} rejected</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-label">Avg. Trust Score</div>
                    <div class="stat-value">${avgTrustScore ?? '—'}</div>
                    <div class="stat-sub">${accountStatus.active} active students</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-label">Tip Conversion</div>
                    <div class="stat-value">${tipsStats.rate}%</div>
                    <div class="stat-sub">${tipsStats.credited} of ${tipsStats.total} tips credited</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-label">Deactivated Accounts</div>
                    <div class="stat-value">${accountStatus.deactivated}</div>
                    <div class="stat-sub">graduated/inactive</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="footer">
              <div><strong>CampusFind</strong> · Lost &amp; Found Management System · NwSSU ISSC Office</div>
              <div>Page 1 of 6 · Confidential · ${new Date().getFullYear()}</div>
            </div>
          </div>

          <!-- ============ PAGE 2 — Claims, Trust & Resolution ============ -->
          <div class="page">
            <div class="page-header">
              <div>
                <div class="page-header-title">Claims, Trust &amp; Resolution</div>
                <div class="page-header-sub">How claims and trust activity are trending</div>
              </div>
              <div class="page-header-right">CampusFind Analytics Report<br/>${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            </div>

            <div class="body">
              <div class="three-col">
                <div>
                  <div class="section-title">Claims by Status</div>
                  <div class="bar-chart">
                    ${claimsRows.map((c) => `
                      <div class="bar-row">
                        <div class="bar-label">${c.status}</div>
                        <div class="bar-track">
                          <div class="bar-fill" style="width:${Math.round((c.count / Math.max(claimsFunnel.pending, claimsFunnel.approved, claimsFunnel.rejected, 1)) * 100)}%;background:${c.color};"></div>
                        </div>
                        <div class="bar-count">${c.count}</div>
                      </div>
                    `).join('')}
                  </div>
                </div>
                <div>
                  <div class="section-title">Trust Activity by Reason</div>
                  <div class="bar-chart">
                    ${trustEventReasons.map((r) => `
                      <div class="bar-row">
                        <div class="bar-label">${r.name}</div>
                        <div class="bar-track">
                          <div class="bar-fill" style="width:${Math.round((r.value / maxReason) * 100)}%;background:#06433C;"></div>
                        </div>
                        <div class="bar-count">${r.value}</div>
                      </div>
                    `).join('')}
                  </div>
                </div>
                <div>
                  <div class="section-title">How Items Get Resolved</div>
                  <div class="bar-chart">
                    ${resolutionMethodRows.length === 0
                      ? '<p style="font-size:10px;color:#9ca3af;">No resolved items yet.</p>'
                      : resolutionMethodRows.map((r) => `
                        <div class="bar-row">
                          <div class="bar-label">${r.name}</div>
                          <div class="bar-track">
                            <div class="bar-fill" style="width:${Math.round((r.value / totalResolvedViaKnown) * 100)}%;background:#0d8f82;"></div>
                          </div>
                          <div class="bar-count">${r.value}</div>
                        </div>
                      `).join('')}
                  </div>
                </div>
              </div>

              <div class="three-col" style="grid-template-columns: 1fr 1fr;">
                <div>
                  <div class="section-title">Student Trust Score Distribution</div>
                  <div class="bar-chart">
                    ${trustDistribution.length === 0
                      ? '<p style="font-size:10px;color:#9ca3af;">No trust score data yet.</p>'
                      : trustDistribution.map((t) => `
                        <div class="bar-row">
                          <div class="bar-label">${t.band}</div>
                          <div class="bar-track">
                            <div class="bar-fill" style="width:${Math.round((t.value / maxTrustBand) * 100)}%;background:#0a6b61;"></div>
                          </div>
                          <div class="bar-count">${t.value}</div>
                        </div>
                      `).join('')}
                  </div>
                </div>
                <div>
                  <div class="section-title">Lost Reports vs. ISSC Walk-in Drop-offs</div>
                  <div class="bar-chart">
                    ${reportTypeData.length === 0
                      ? '<p style="font-size:10px;color:#9ca3af;">No data yet.</p>'
                      : reportTypeData.map((r, i) => `
                        <div class="bar-row">
                          <div class="bar-label">${r.name}</div>
                          <div class="bar-track">
                            <div class="bar-fill" style="width:${Math.round((r.value / totalReportType) * 100)}%;background:${i === 0 ? '#06433C' : '#2563eb'};"></div>
                          </div>
                          <div class="bar-count">${r.value}</div>
                        </div>
                      `).join('')}
                  </div>
                </div>
              </div>
            </div>

            <div class="footer">
              <div><strong>CampusFind</strong> · Lost &amp; Found Management System · NwSSU ISSC Office</div>
              <div>Page 2 of 6 · Confidential · ${new Date().getFullYear()}</div>
            </div>
          </div>

          <!-- ============ PAGE 3 — Trends & Categories ============ -->
          <div class="page">
            <div class="page-header">
              <div>
                <div class="page-header-title">Trends &amp; Categories</div>
                <div class="page-header-sub">Report volume over time, by category and location</div>
              </div>
              <div class="page-header-right">CampusFind Analytics Report<br/>${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            </div>

            <div class="body">
              <div>
                <div class="section-title">Monthly Trend</div>
                ${trendData.length === 0
                  ? '<p style="font-size:10px;color:#9ca3af;">No data yet.</p>'
                  : `<div class="trend-chart">
                      ${trendData.map((t) => `
                        <div class="trend-bar-wrap">
                          <div class="trend-count">${t.count}</div>
                          <div class="trend-bar" style="height:${Math.round((t.count / maxTrend) * 90)}px;"></div>
                          <div class="trend-label">${t.month}</div>
                        </div>
                      `).join('')}
                    </div>`}
              </div>

              <div class="three-col" style="grid-template-columns: 1fr 1fr;">
                <div>
                  <div class="section-title">By Category</div>
                  <div class="bar-chart">
                    ${categoryData.length === 0
                      ? '<p style="font-size:10px;color:#9ca3af;">No data yet.</p>'
                      : categoryData.slice(0, 7).map((c, i) => `
                        <div class="bar-row">
                          <div class="bar-label">${c.name}</div>
                          <div class="bar-track">
                            <div class="bar-fill" style="width:${Math.round((c.value / maxCategory) * 100)}%;background:${CATEGORY_COLORS[c.name] ?? COLORS[i % COLORS.length]};"></div>
                          </div>
                          <div class="bar-count">${c.value}</div>
                        </div>
                      `).join('')}
                  </div>
                </div>
                <div>
                  <div class="section-title">Top Locations</div>
                  <div class="bar-chart">
                    ${topLocations.length === 0
                      ? '<p style="font-size:10px;color:#9ca3af;">No data yet.</p>'
                      : topLocations.map((l, i) => `
                        <div class="bar-row">
                          <div class="bar-label">${i + 1}. ${l.location}</div>
                          <div class="bar-track">
                            <div class="bar-fill" style="width:${Math.round((l.count / maxLocation) * 100)}%;background:#0d8f82;"></div>
                          </div>
                          <div class="bar-count">${l.count}</div>
                        </div>
                      `).join('')}
                  </div>
                </div>
              </div>
            </div>

            <div class="footer">
              <div><strong>CampusFind</strong> · Lost &amp; Found Management System · NwSSU ISSC Office</div>
              <div>Page 3 of 6 · Confidential · ${new Date().getFullYear()}</div>
            </div>
          </div>

          <!-- ============ PAGE 4 — Student Accounts ============ -->
          <div class="page">
            <div class="page-header">
              <div>
                <div class="page-header-title">Student Accounts</div>
                <div class="page-header-sub">Who's registered, by department, program and year level</div>
              </div>
              <div class="page-header-right">CampusFind Analytics Report<br/>${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            </div>

            <div class="body">
              <div>
                <div class="section-title">Students by Department</div>
                <div class="bar-chart">
                  ${accountsByDepartment.length === 0
                    ? '<p style="font-size:10px;color:#9ca3af;">No account data yet.</p>'
                    : accountsByDepartment.map((d) => `
                      <div class="bar-row">
                        <div class="bar-label" style="width:220px;">${d.name}</div>
                        <div class="bar-track">
                          <div class="bar-fill" style="width:${Math.round((d.value / maxDepartment) * 100)}%;background:#06433C;"></div>
                        </div>
                        <div class="bar-count">${d.value}</div>
                      </div>
                    `).join('')}
                </div>
              </div>

              <div>
                <div class="section-title">Students by Program/Course</div>
                <div class="bar-chart">
                  ${accountsByProgram.length === 0
                    ? '<p style="font-size:10px;color:#9ca3af;">No account data yet.</p>'
                    : accountsByProgram.map((p) => `
                      <div class="bar-row">
                        <div class="bar-label" style="width:260px;">${p.name}</div>
                        <div class="bar-track">
                          <div class="bar-fill" style="width:${Math.round((p.value / maxProgram) * 100)}%;background:#0d8f82;"></div>
                        </div>
                        <div class="bar-count">${p.value}</div>
                      </div>
                    `).join('')}
                </div>
              </div>

              <div>
                <div class="section-title">Students by Year Level</div>
                <div class="bar-chart">
                  ${accountsByYear.length === 0
                    ? '<p style="font-size:10px;color:#9ca3af;">No account data yet.</p>'
                    : accountsByYear.map((y) => `
                      <div class="bar-row">
                        <div class="bar-label" style="width:90px;">${y.name}</div>
                        <div class="bar-track">
                          <div class="bar-fill" style="width:${Math.round((y.value / Math.max(...accountsByYear.map((x) => x.value), 1)) * 100)}%;background:#0a6b61;"></div>
                        </div>
                        <div class="bar-count">${y.value}</div>
                      </div>
                    `).join('')}
                </div>
              </div>
            </div>

            <div class="footer">
              <div><strong>CampusFind</strong> · Lost &amp; Found Management System · NwSSU ISSC Office</div>
              <div>Page 4 of 6 · Confidential · ${new Date().getFullYear()}</div>
            </div>
          </div>

          <!-- ============ PAGE 5 — Lost Items by Department & Program ============ -->
          <div class="page">
            <div class="page-header">
              <div>
                <div class="page-header-title">Lost Items by Department &amp; Program</div>
                <div class="page-header-sub">Which groups file the most lost reports, and how often per student</div>
              </div>
              <div class="page-header-right">CampusFind Analytics Report<br/>${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            </div>

            <div class="body">
              <div>
                <div class="section-title">Which Departments Lose Items Most (per student)</div>
                <div class="section-note">Lost reports per student, not just raw count, so a bigger department doesn't look worse by headcount alone.</div>
                <table>
                  <thead>
                    <tr>
                      <th>Department</th>
                      <th>Reports Filed</th>
                      <th>Students</th>
                      <th>Reports / Student</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${lostRateByDepartment.length === 0
                      ? '<tr><td colspan="4" style="color:#9ca3af;text-align:center;padding:14px;">No lost reports yet.</td></tr>'
                      : lostRateByDepartment.map((d) => `
                        <tr>
                          <td>${d.name}</td>
                          <td class="td-num">${d.value}</td>
                          <td>${d.students}</td>
                          <td class="td-num">${d.rate !== null ? d.rate.toFixed(2) : '—'}</td>
                        </tr>
                      `).join('')}
                  </tbody>
                </table>
              </div>

              <div>
                <div class="section-title">Lost Reports by Program</div>
                <div class="bar-chart">
                  ${lostByProgram.length === 0
                    ? '<p style="font-size:10px;color:#9ca3af;">No lost reports yet.</p>'
                    : lostByProgram.map((p) => `
                      <div class="bar-row">
                        <div class="bar-label" style="width:260px;">${p.name}</div>
                        <div class="bar-track">
                          <div class="bar-fill" style="width:${Math.round((p.value / maxLostProgram) * 100)}%;background:#dc2626;"></div>
                        </div>
                        <div class="bar-count">${p.value}</div>
                      </div>
                    `).join('')}
                </div>
              </div>
            </div>

            <div class="footer">
              <div><strong>CampusFind</strong> · Lost &amp; Found Management System · NwSSU ISSC Office</div>
              <div>Page 5 of 6 · Confidential · ${new Date().getFullYear()}</div>
            </div>
          </div>

          <!-- ============ PAGE 6 — Monthly Report Log ============ -->
          <div class="page">
            <div class="page-header">
              <div>
                <div class="page-header-title">Monthly Report Log</div>
                <div class="page-header-sub">Full month-by-month breakdown of filed reports</div>
              </div>
              <div class="page-header-right">CampusFind Analytics Report<br/>${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            </div>

            <div class="body">
              <div>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Month</th>
                      <th>Reports Filed</th>
                      <th>% of Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${trendData.length === 0
                      ? '<tr><td colspan="4" style="color:#9ca3af;text-align:center;padding:14px;">No data available.</td></tr>'
                      : trendData.map((t, i) => `
                        <tr>
                          <td style="color:#9ca3af;">${i + 1}</td>
                          <td>${t.month}</td>
                          <td class="td-num">${t.count}</td>
                          <td>${stats.total > 0 ? Math.round((t.count / stats.total) * 100) : 0}%</td>
                        </tr>
                      `).join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <div class="footer">
              <div><strong>CampusFind</strong> · Lost &amp; Found Management System · NwSSU ISSC Office</div>
              <div>Page 6 of 6 · Confidential · ${new Date().getFullYear()}</div>
            </div>
          </div>

        </div>

      </body>
      </html>
`

    printWindow.document.write(html)
    printWindow.document.close()
  }

  const resolutionRate = stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl font-bold text-text-primary">Analytics</h2>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-surface-card border border-border rounded-xl p-4 animate-pulse h-20" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-surface-card border border-border rounded-xl p-4 animate-pulse h-64" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-text-primary">Analytics</h2>
        <button
          onClick={exportReport}
          className="flex items-center gap-1.5 px-4 h-9 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors"
        >
          <FileText size={14} />
          Export Report
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Reports" value={stats.total} />
        <StatCard label="Resolved" value={stats.resolved} sub={`${resolutionRate}% resolution rate`} color="text-status-open-text" />
        <StatCard label="Open" value={stats.open} color="text-brand-600" />
        <StatCard label="Avg Resolution" value={stats.avgResolutionDays !== null ? `${stats.avgResolutionDays}d` : '—'} sub="days to resolve" />
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Claim Approval Rate" value={`${claimsFunnel.approvalRate}%`} sub={`${claimsFunnel.approved} approved · ${claimsFunnel.rejected} rejected`} />
        <StatCard label="Avg Trust Score" value={avgTrustScore ?? '—'} sub={`${accountStatus.active} active students`} />
        <StatCard label="Tip Conversion" value={`${tipsStats.rate}%`} sub={`${tipsStats.credited} of ${tipsStats.total} tips credited`} />
        <StatCard label="Deactivated Accounts" value={accountStatus.deactivated} sub="graduated/inactive" />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-surface-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Claims by status</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={[
                { status: 'Pending', count: claimsFunnel.pending },
                { status: 'Approved', count: claimsFunnel.approved },
                { status: 'Rejected', count: claimsFunnel.rejected },
              ]}
              margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="status" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#0d8f82" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-surface-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Student trust score distribution</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <Pie data={trustDistribution} cx="50%" cy="46%" outerRadius={70} dataKey="value" nameKey="band" label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11} fontWeight={600}>
                {trustDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value, name, entry) => [value, entry.payload.band]} />
              <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8, lineHeight: '18px' }} formatter={(value, entry) => entry?.payload?.band ?? value} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-surface-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Trust score activity by reason</h3>
          {trustEventReasons.every((r) => r.value === 0) ? (
            <p className="text-xs text-text-muted">No trust score activity yet.</p>
          ) : (
            <BarList data={trustEventReasons} barColor="#06433C" />
          )}
        </div>

        <div className="bg-surface-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">How items actually get resolved</h3>
          {resolvedViaData.length === 0 ? (
            <p className="text-xs text-text-muted">No resolved items yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <Pie data={resolvedViaData} cx="50%" cy="46%" outerRadius={70} dataKey="value" nameKey="name" label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11} fontWeight={600}>
                  {resolvedViaData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8, lineHeight: '18px' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-surface-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Lost reports vs. ISSC walk-in drop-offs</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <Pie data={reportTypeData} cx="50%" cy="46%" outerRadius={70} dataKey="value" nameKey="name" label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11} fontWeight={600}>
                {reportTypeData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8, lineHeight: '18px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-surface-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Students by year level</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={accountsByYear} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#0a6b61" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-surface-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Students by department</h3>
          {accountsByDepartment.length === 0 ? (
            <p className="text-xs text-text-muted">No account data yet.</p>
          ) : (
            <BarList data={accountsByDepartment} barColor="#06433C" />
          )}
        </div>

        <div className="bg-surface-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Students by program/course</h3>
          {accountsByProgram.length === 0 ? (
            <p className="text-xs text-text-muted">No account data yet.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {accountsByProgram.map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-text-primary pr-2">{p.name}</p>
                      <p className="text-xs text-text-muted shrink-0 ml-2">{p.value}</p>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden">
                      <div className="h-full rounded-full bg-brand-600" style={{ width: `${(p.value / (accountsByProgram[0]?.value ?? 1)) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-surface-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-1">Which departments lose items most</h3>
          <p className="text-xs text-text-muted mb-4">Lost reports per student — not just raw count, so a bigger department doesn't look worse by headcount alone.</p>
          {lostByDepartment.length === 0 ? (
            <p className="text-xs text-text-muted">No lost reports yet.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {lostByDepartment
                .map((d) => {
                  const students = accountsByDepartment.find((a) => a.name === d.name)?.value ?? 0
                  const rate = students > 0 ? d.value / students : null
                  return { ...d, students, rate }
                })
                .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1))
                .map((d, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium text-text-primary">
                          {d.name}
                          {d.students > 0 && (
                            <span className="text-text-muted font-normal ml-1.5">
                              {d.rate.toFixed(2)} reports/student
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-text-muted shrink-0 ml-2">{d.value} reports · {d.students} students</p>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-status-rejected-text"
                          style={{
                            width: `${Math.min(((d.rate ?? 0) / Math.max(...lostByDepartment.map((x) => {
                              const s = accountsByDepartment.find((a) => a.name === x.name)?.value ?? 0
                              return s > 0 ? x.value / s : 0
                            }), 0.01)) * 100, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="bg-surface-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Lost reports by program/course</h3>
          {lostByProgram.length === 0 ? (
            <p className="text-xs text-text-muted">No lost reports yet.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {lostByProgram.map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-text-primary pr-2">{p.name}</p>
                      <p className="text-xs text-text-muted shrink-0 ml-2">{p.value}</p>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden">
                      <div className="h-full rounded-full bg-status-rejected-text" style={{ width: `${(p.value / (lostByProgram[0]?.value ?? 1)) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-surface-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Reports filed per month</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#06433C" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-surface-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Reports by category</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <Pie data={categoryData} cx="50%" cy="44%" outerRadius={75} dataKey="value" label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11} fontWeight={600}>
                {categoryData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.name] ?? COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8, lineHeight: '18px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Reports by status</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={[
                { status: 'Open', count: stats.open },
                { status: 'Claimed', count: stats.claimed },
                { status: 'Approved', count: stats.approved },
                { status: 'Resolved', count: stats.resolved },
              ]}
              margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="status" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#06433C" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-surface-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Top locations</h3>
          {topLocations.length === 0 ? (
            <p className="text-xs text-text-muted">No location data yet.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {topLocations.map((loc, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-[11px] font-bold text-text-muted w-4">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-text-primary truncate">{loc.location}</p>
                      <p className="text-xs text-text-muted shrink-0 ml-2">{loc.count}</p>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden">
                      <div className="h-full rounded-full bg-brand-600" style={{ width: `${(loc.count / (topLocations[0]?.count ?? 1)) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}