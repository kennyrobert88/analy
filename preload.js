const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  startOAuthFlow: () => ipcRenderer.invoke('start-oauth-flow'),
  checkAuth: () => ipcRenderer.invoke('check-auth'),
  fetchEmails: () => ipcRenderer.invoke('fetch-emails'),
  getEmailStats: () => ipcRenderer.invoke('get-email-stats'),
  getEmailsByDate: () => ipcRenderer.invoke('get-emails-by-date'),
  getSendersStats: () => ipcRenderer.invoke('get-senders-stats'),
  getHourlyDistribution: () => ipcRenderer.invoke('get-hourly-distribution'),
  analyzeEmails: () => ipcRenderer.invoke('analyze-emails'),
  submitPrompt: (prompt) => ipcRenderer.invoke('submit-prompt', prompt),
  logout: () => ipcRenderer.invoke('logout'),
  saveDashboardWidgets: (widgets) => ipcRenderer.invoke('save-dashboard-widgets', widgets),
  getDashboardWidgets: () => ipcRenderer.invoke('get-dashboard-widgets'),
});
