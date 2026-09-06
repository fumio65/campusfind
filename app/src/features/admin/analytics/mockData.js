export const mockAnalytics = {
  itemsReported: 312,
  claimApprovalRate: 71,
  avgTimeToRecoveryDays: 3.4,
  avgTrustScore: 94,
  reportsOverTime: [
    { month: 'Feb', count: 38 },
    { month: 'Mar', count: 52 },
    { month: 'Apr', count: 61 },
    { month: 'May', count: 77 },
    { month: 'Jun', count: 84 },
  ],
  trustDistribution: [
    { band: '90-100', value: 68 },
    { band: '70-89', value: 27 },
    { band: 'Below 70', value: 5 },
  ],
  claimsByCategory: [
    { category: 'Electronics', approved: 40, rejected: 8 },
    { category: 'IDs and cards', approved: 55, rejected: 5 },
    { category: 'Bags', approved: 22, rejected: 4 },
    { category: 'Apparel', approved: 18, rejected: 3 },
    { category: 'Documents', approved: 30, rejected: 6 },
  ],
}
