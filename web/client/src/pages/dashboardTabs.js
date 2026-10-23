// Every dashboard section has its own address, so tabs can be bookmarked, shared and reloaded.
export const DASHBOARD_TABS = [
  { key: 'overview', path: '/dashboard', label: 'A. Exposure Overview', title: 'Exposure Overview' },
  { key: 'risk', path: '/dashboard/risk', label: 'B. Risk Prioritisation', title: 'Risk Prioritisation' },
  { key: 'inventory', path: '/dashboard/inventory', label: 'Inventory', title: 'Inventory' },
  { key: 'qkd', path: '/dashboard/qkd', label: 'C. QKD Laboratory', title: 'QKD Laboratory' },
  { key: 'migration', path: '/dashboard/migration', label: 'D. Migration & QKD vs PQC', title: 'Migration Roadmap' },
];

export const tabForPath = (path) => DASHBOARD_TABS.find((t) => t.path === path) || null;
