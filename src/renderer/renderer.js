
let topSendersChart, trendsChart, defaultHourlyChartInstance, defaultDailyChartInstance, calendarChartInstance;
let currentSection = 'dashboard';
let dashboardWidgets = [];
let widgetCharts = {};
let editingWidgetId = null;
let editingJobId = null;
let jobsCache = [];
let currentInboxEmails = [];

document.addEventListener('DOMContentLoaded', () => {
  if (typeof Chart === 'undefined') { console.error('Chart.js not loaded!'); return; }

  document.getElementById('connectBtn').addEventListener('click', handleConnect);
  document.getElementById('connectBtn2').addEventListener('click', handleConnect);
  document.getElementById('fetchBtn').addEventListener('click', handleFetchEmails);
  document.getElementById('customizeDashboardBtn').addEventListener('click', openAddWidgetModal);
  document.getElementById('refreshWidgetsBtn').addEventListener('click', refreshWidgetData);
  document.getElementById('generateInsightsBtn').addEventListener('click', generateAndShowInsights);
  document.getElementById('analyzeBtn').addEventListener('click', handleAnalyze);
  document.getElementById('promptInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') handleAnalyze(); });
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  document.querySelectorAll('.suggestion').forEach(el => {
    el.addEventListener('click', () => {
      document.getElementById('promptInput').value = el.dataset.prompt;
      handleAnalyze();
    });
  });

  document.getElementById('addJobBtn').addEventListener('click', openAddJobModal);
  document.getElementById('scanJobEmailsBtn').addEventListener('click', handleScanJobEmails);
  document.getElementById('analyzeJobsBtn').addEventListener('click', handleAnalyzeJobs);
  document.getElementById('exportJobsBtn').addEventListener('click', () => openExportModal('jobs'));
  document.getElementById('saveJobBtn').addEventListener('click', saveJob);
  document.getElementById('cancelJobBtn').addEventListener('click', closeJobModal);
  document.getElementById('closeJobModalBtn').addEventListener('click', closeJobModal);
  document.getElementById('deleteJobBtn').addEventListener('click', deleteJob);

  document.getElementById('logoutBtn').addEventListener('click', handleLogout);
  document.getElementById('logoutBtnTop').addEventListener('click', handleLogout);
  document.getElementById('exportBtn').addEventListener('click', () => openExportModal('emails'));

  document.getElementById('closeModalBtn').addEventListener('click', closeModal);
  document.getElementById('cancelWidgetBtn').addEventListener('click', closeModal);
  document.getElementById('saveWidgetBtn').addEventListener('click', saveWidget);
  document.getElementById('deleteWidgetBtn').addEventListener('click', deleteWidget);

  document.getElementById('inboxSearchBtn').addEventListener('click', loadInbox);
  document.getElementById('inboxSearch').addEventListener('keypress', (e) => { if (e.key === 'Enter') loadInbox(); });
  document.getElementById('backToInbox').addEventListener('click', showInboxList);

  document.getElementById('searchBtn').addEventListener('click', handleSearch);
  document.getElementById('searchQuery').addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSearch(); });

  document.getElementById('syncCalendarBtn').addEventListener('click', handleSyncCalendar);

  document.getElementById('closeTrainingModalBtn').addEventListener('click', closeTrainingModal);
  document.getElementById('cancelTrainingBtn').addEventListener('click', closeTrainingModal);
  document.getElementById('saveTrainingBtn').addEventListener('click', saveTrainingData);
  document.querySelectorAll('.training-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTrainingTab(tab.dataset.trainingType));
  });

  document.getElementById('closeExportModalBtn').addEventListener('click', closeExportModal);
  document.getElementById('cancelExportBtn').addEventListener('click', closeExportModal);
  document.getElementById('doExportBtn').addEventListener('click', doExport);

  window.electronAPI.onEmailsSynced((data) => {
    showToast(`${data.count} new email(s) synced`, 'info');
    if (currentSection === 'dashboard') loadExistingData();
  });

  setTimeout(() => { checkAuth(); setupNavigation(); initTheme(); }, 100);
});

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3500);
}

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(item.dataset.section);
    });
  });
}

function navigateTo(section) {
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  const sel = '.nav-item[data-section="' + section + '"]';
  document.querySelector(sel).classList.add('active');

  const sectionIds = ['dashboard', 'inbox', 'search', 'senders', 'trends', 'ai-insights', 'jobs', 'calendar'];
  sectionIds.forEach(id => {
    document.getElementById(id).style.display = id === section ? 'block' : 'none';
  });

  const titles = {
    dashboard: 'Dashboard', inbox: 'Inbox', search: 'Search', senders: 'Top Senders',
    trends: 'Trends', 'ai-insights': 'AI Insights', jobs: 'Job Applications', calendar: 'Calendar'
  };
  document.getElementById('breadcrumbPage').textContent = titles[section] || 'Dashboard';
  currentSection = section;

  const showCustomize = section === 'dashboard';
  document.getElementById('customizeDashboardBtn').style.display = showCustomize ? 'inline-flex' : 'none';

  if (section === 'inbox') loadInbox();
  if (section === 'jobs') loadJobApplications();
  if (section === 'calendar') loadCalendarData();
}

/* ── Theme ─────────────────────────────────────── */

function initTheme() {
  const saved = localStorage.getItem('analy-theme');
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('analy-theme', next);
}

/* ── Auth ──────────────────────────────────────── */

async function checkAuth() {
  const authenticated = await window.electronAPI.checkAuth();
  if (authenticated) showDashboard();
}

async function handleConnect() {
  try {
    updateSyncStatus('authenticating');
    const result = await window.electronAPI.startOAuthFlow();
    if (result.success) {
      updateSyncStatus('connected');
      showDashboard();
      loadExistingData();
      showToast('Connected to Gmail!', 'success');
    } else {
      updateSyncStatus('error');
      showToast('Authentication failed: ' + (result.error || 'Unknown error'), 'error');
    }
  } catch (err) {
    updateSyncStatus('error');
    showToast('Authentication error: ' + err.message, 'error');
  }
}

/* ── Dashboard ─────────────────────────────────── */

function showDashboard() {
  document.getElementById('authSection').style.display = 'none';
  document.getElementById('dashboardSection').style.display = 'block';
  document.getElementById('connectBtn').style.display = 'none';
  document.getElementById('connectBtn2').style.display = 'none';
  document.getElementById('fetchBtn').style.display = 'inline-flex';
  document.getElementById('customizeDashboardBtn').style.display = 'inline-flex';
  document.getElementById('exportBtn').style.display = 'inline-flex';
  document.getElementById('logoutBtn').style.display = 'flex';
  document.getElementById('logoutBtnTop').style.display = 'inline-flex';
  updateSyncStatus('connected');
  loadExistingData();
  loadDashboardWidgets();
}

function showAuthScreen() {
  document.getElementById('authSection').style.display = 'block';
  document.getElementById('dashboardSection').style.display = 'none';
  document.getElementById('connectBtn').style.display = 'inline-flex';
  document.getElementById('connectBtn').textContent = 'Connect Gmail';
  document.getElementById('connectBtn').disabled = false;
  document.getElementById('connectBtn2').style.display = 'inline-flex';
  document.getElementById('fetchBtn').style.display = 'none';
  document.getElementById('customizeDashboardBtn').style.display = 'none';
  document.getElementById('exportBtn').style.display = 'none';
  document.getElementById('logoutBtn').style.display = 'none';
  document.getElementById('logoutBtnTop').style.display = 'none';
  updateSyncStatus('not-connected');
  resetCharts();
}

function updateSyncStatus(status) {
  const dot = document.getElementById('syncDot');
  const text = document.getElementById('syncStatus');
  dot.className = 'sync-dot';
  switch (status) {
    case 'connected': dot.classList.add('connected'); text.textContent = 'Connected'; break;
    case 'syncing': dot.classList.add('syncing'); text.textContent = 'Syncing...'; break;
    case 'authenticating': text.textContent = 'Authenticating...'; break;
    case 'waiting': text.textContent = 'Complete auth...'; break;
    case 'error': text.textContent = 'Error'; break;
    default: text.textContent = 'Not connected';
  }
}

async function handleFetchEmails() {
  try {
    updateSyncStatus('syncing');
    const result = await window.electronAPI.fetchEmails(false);
    updateSyncStatus('connected');
    if (result.count > 0) {
      showToast(`Fetched ${result.count} emails`, 'success');
      loadExistingData();
    } else {
      showToast(result.message || 'No new emails', 'info');
    }
  } catch (err) {
    updateSyncStatus('error');
    showToast('Fetch error: ' + err.message, 'error');
  }
}

async function handleLogout() {
  try {
    updateSyncStatus('syncing');
    await window.electronAPI.logout();
    showAuthScreen();
    showToast('Logged out successfully', 'info');
  } catch (err) {
    updateSyncStatus('error');
    showToast('Logout error: ' + err.message, 'error');
  }
}

/* ── Data Loading ──────────────────────────────── */

async function loadExistingData() {
  const [stats, emailsByDate, sendersStats, analysis, hourlyData] = await Promise.all([
    window.electronAPI.getEmailStats(),
    window.electronAPI.getEmailsByDate(),
    window.electronAPI.getSendersStats(),
    window.electronAPI.analyzeEmails(),
    window.electronAPI.getHourlyDistribution(),
  ]);

  updateStats(stats, emailsByDate, analysis);

  const today = new Date().toISOString().split('T')[0];
  const todayData = emailsByDate ? emailsByDate.find(d => d.date === today) : null;
  const todayCount = todayData ? todayData.count : 0;

  const todayEl = document.getElementById('todayEmails');
  const totalEl = document.getElementById('totalEmailsDashboard');
  const sendersEl = document.getElementById('uniqueSendersDashboard');
  const attachEl = document.getElementById('emailWithAttachments');

  if (todayEl) todayEl.textContent = todayCount;
  if (totalEl) totalEl.textContent = (stats.total || 0).toLocaleString();
  if (sendersEl) sendersEl.textContent = (stats.uniqueSenders || 0).toLocaleString();

  if (attachEl) {
    try {
      const dashStats = await window.electronAPI.getDashStats();
      attachEl.textContent = dashStats.emails_with_attachments || '0';
    } catch { attachEl.textContent = '-'; }
  }

  updateTopSendersChart(sendersStats, stats.total);
  updateSendersTable(sendersStats, stats.total);
  updateTrendsInsights(analysis, emailsByDate);
  updateTrendsChart(hourlyData);

  createDefaultCharts(emailsByDate, hourlyData);
  loadAllWidgetData();
}

async function generateAndShowInsights() {
  try {
    const insights = await window.electronAPI.generateProactiveInsights();
    renderProactiveInsights(insights);
    showToast('AI insights generated', 'success');
  } catch (err) {
    showToast('Error generating insights: ' + err.message, 'error');
  }
}

function renderProactiveInsights(insights) {
  const container = document.getElementById('proactiveInsights');
  container.innerHTML = '';
  if (!insights || insights.length === 0) {
    container.innerHTML = '<div class="callout"><div class="callout-icon">💡</div><div class="callout-content"><span>Generate AI insights to see patterns and anomalies in your email activity.</span></div></div>';
    return;
  }
  insights.forEach(insight => {
    const card = document.createElement('div');
    card.className = 'insight-card';
    const icons = { weekly_summary: '📊', volume_anomaly: '🔔', attachment_insight: '📎' };
    card.innerHTML = `
      <div class="insight-card-icon" style="background:var(--bg-active);">${icons[insight.type] || '💡'}</div>
      <div class="insight-card-content">
        <div class="insight-card-title">${insight.title || 'Insight'}</div>
        <div class="insight-card-text">${insight.content}</div>
        <div class="insight-card-time">${insight.generated_at ? new Date(insight.generated_at).toLocaleString() : 'Just now'}</div>
      </div>`;
    container.appendChild(card);
  });
}

/* ── Inbox ─────────────────────────────────────── */

async function loadInbox() {
  const query = document.getElementById('inboxSearch').value.trim();
  const list = document.getElementById('inboxList');
  const detail = document.getElementById('emailDetail');
  detail.style.display = 'none';
  list.style.display = 'block';

  list.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-tertiary);"><div class="loading-spinner" style="margin:0 auto 12px;"></div><p>Loading inbox...</p></div>';

  try {
    const filters = {};
    const emails = await window.electronAPI.searchEmails(query, filters);
    currentInboxEmails = emails;
    renderInboxList(emails);
  } catch (err) {
    list.innerHTML = `<div class="empty-dashboard"><p>Error loading inbox: ${err.message}</p></div>`;
  }
}

function renderInboxList(emails) {
  const list = document.getElementById('inboxList');
  list.innerHTML = '';

  if (!emails || emails.length === 0) {
    list.innerHTML = '<div class="empty-dashboard"><p>No emails found.</p></div>';
    return;
  }

  emails.slice(0, 100).forEach(email => {
    const item = document.createElement('div');
    item.className = 'inbox-item';
    const senderClean = email.sender ? (email.sender.match(/<(.+)>/)?.[1] || email.sender) : 'Unknown';
    const date = email.internal_date ? new Date(email.internal_date).toLocaleDateString() : '';
    const hasAttach = email.has_attachments ? '📎' : '';
    item.innerHTML = `
      <div class="inbox-item-left">
        <div class="inbox-item-sender">${escHtml(senderClean)}</div>
        <div class="inbox-item-subject">${escHtml(email.subject || '(no subject)')}</div>
        <div class="inbox-item-snippet">${escHtml((email.snippet || '').substring(0, 120))}</div>
      </div>
      <div class="inbox-item-right">
        <div class="inbox-item-date">${date} ${hasAttach}</div>
      </div>`;
    item.addEventListener('click', () => openEmailDetail(email.id));
    list.appendChild(item);
  });
}

async function openEmailDetail(emailId) {
  const list = document.getElementById('inboxList');
  const detail = document.getElementById('emailDetail');
  list.style.display = 'none';
  detail.style.display = 'block';

  document.getElementById('detailBody').innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-tertiary);"><div class="loading-spinner" style="margin:0 auto 12px;"></div><p>Loading email...</p></div>';

  try {
    const result = await window.electronAPI.getEmailDetail(emailId);
    if (!result.success) throw new Error(result.error);
    const { email, body, attachments, thread } = result;

    document.getElementById('detailSubject').textContent = email.subject || '(no subject)';
    const senderClean = email.sender ? (email.sender.match(/<(.+)>/)?.[1] || email.sender) : 'Unknown';
    const date = email.internal_date ? new Date(email.internal_date).toLocaleString() : '';
    document.getElementById('detailMeta').innerHTML = `
      <strong>From:</strong> ${escHtml(senderClean)}<br>
      <strong>To:</strong> ${escHtml(email.recipients || '')}<br>
      <strong>Date:</strong> ${date}<br>
      <strong>ID:</strong> ${email.id}`;

    const labelsDiv = document.getElementById('detailLabels');
    labelsDiv.innerHTML = '';
    (email.labels || []).forEach(label => {
      const span = document.createElement('span');
      span.className = 'email-label';
      span.textContent = label;
      labelsDiv.appendChild(span);
    });

    let bodyText = body ? (body.body_text || body.body_html || '') : (email.snippet || '');
    bodyText = bodyText.replace(/<[^>]+>/g, '').trim();
    document.getElementById('detailBody').textContent = bodyText || '(No body content available)';

    const attachDiv = document.getElementById('detailAttachments');
    attachDiv.innerHTML = '';
    if (attachments && attachments.length > 0) {
      attachDiv.innerHTML = '<h3 style="font-size:14px;font-weight:600;color:var(--text-secondary);margin-bottom:8px;">Attachments</h3>';
      attachments.forEach(a => {
        const item = document.createElement('div');
        item.className = 'attachment-item';
        const size = a.size > 1024 ? `${(a.size / 1024).toFixed(1)} KB` : `${a.size} B`;
        item.innerHTML = `<span>📎</span><span>${escHtml(a.filename)}</span><span style="color:var(--text-tertiary);font-size:12px;">(${a.mime_type}, ${size})</span>`;
        attachDiv.appendChild(item);
      });
    }

    const threadDiv = document.getElementById('threadList');
    threadDiv.innerHTML = '';
    if (thread && thread.length > 1) {
      thread.forEach(t => {
        if (t.id === emailId) return;
        const item = document.createElement('div');
        item.className = 'thread-item';
        const tSender = t.sender ? (t.sender.match(/<(.+)>/)?.[1] || t.sender) : 'Unknown';
        const tDate = t.internal_date ? new Date(t.internal_date).toLocaleDateString() : '';
        item.innerHTML = `<div class="thread-item-subject">${escHtml(t.subject || '(no subject)')}</div><div class="thread-item-sender">${escHtml(tSender)} · ${tDate}</div>`;
        item.addEventListener('click', () => openEmailDetail(t.id));
        threadDiv.appendChild(item);
      });
    } else {
      threadDiv.innerHTML = '<div style="font-size:13px;color:var(--text-tertiary);">No other messages in this thread.</div>';
    }

    try {
      const fullResult = await window.electronAPI.fetchFullEmail(emailId);
      if (fullResult.success && fullResult.body) {
        const cleanBody = fullResult.body.replace(/<[^>]+>/g, '').trim();
        if (cleanBody) document.getElementById('detailBody').textContent = cleanBody;
      }
    } catch {}
  } catch (err) {
    document.getElementById('detailBody').innerHTML = `<p class="error" style="color:var(--danger);">Error: ${err.message}</p>`;
  }
}

function showInboxList() {
  document.getElementById('emailDetail').style.display = 'none';
  document.getElementById('inboxList').style.display = 'block';
}

/* ── Search ────────────────────────────────────── */

async function handleSearch() {
  const query = document.getElementById('searchQuery').value.trim();
  const sender = document.getElementById('filterSender').value.trim();
  const dateFrom = document.getElementById('filterDateFrom').value;
  const dateTo = document.getElementById('filterDateTo').value;
  const attachFilter = document.getElementById('filterAttachments').value;

  const resultsDiv = document.getElementById('searchResults');
  resultsDiv.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-tertiary);"><div class="loading-spinner" style="margin:0 auto 12px;"></div><p>Searching...</p></div>';

  try {
    const filters = {};
    if (sender) filters.sender = sender;
    if (dateFrom) filters.dateFrom = dateFrom;
    if (dateTo) filters.dateTo = dateTo;
    if (attachFilter === 'yes') filters.hasAttachments = true;
    if (attachFilter === 'no') filters.hasAttachments = false;

    const results = await window.electronAPI.searchEmails(query, filters);
    renderSearchResults(results);
  } catch (err) {
    resultsDiv.innerHTML = `<div class="empty-dashboard"><p>Search error: ${err.message}</p></div>`;
  }
}

function renderSearchResults(emails) {
  const div = document.getElementById('searchResults');
  div.innerHTML = '';

  if (!emails || emails.length === 0) {
    div.innerHTML = '<div class="empty-dashboard"><p>No emails match your search.</p></div>';
    return;
  }

  emails.slice(0, 100).forEach(email => {
    const item = document.createElement('div');
    item.className = 'inbox-item';
    const senderClean = email.sender ? (email.sender.match(/<(.+)>/)?.[1] || email.sender) : 'Unknown';
    const date = email.internal_date ? new Date(email.internal_date).toLocaleDateString() : '';
    item.innerHTML = `
      <div class="inbox-item-left">
        <div class="inbox-item-sender">${escHtml(senderClean)}</div>
        <div class="inbox-item-subject">${escHtml(email.subject || '(no subject)')}</div>
        <div class="inbox-item-snippet">${escHtml((email.snippet || '').substring(0, 120))}</div>
      </div>
      <div class="inbox-item-right">
        <div class="inbox-item-date">${date}</div>
        ${email.has_attachments ? '<span class="inbox-badge" style="background:var(--bg-hover);">📎</span>' : ''}
      </div>`;
    item.addEventListener('click', () => { navigateTo('inbox'); openEmailDetail(email.id); });
    div.appendChild(item);
  });
}

/* ── Senders & Trends ──────────────────────────── */

function updateSendersTable(data, total) {
  const tbody = document.getElementById('sendersTableBody');
  tbody.innerHTML = '';
  data.forEach((sender, index) => {
    const percentage = total > 0 ? ((sender.count / total) * 100).toFixed(1) : 0;
    const email = sender.sender.match(/<(.+)>/)?.[1] || sender.sender;
    const isTop = index < 3;
    const tr = document.createElement('tr');
    tr.innerHTML = '<td><span class="rank-badge ' + (isTop ? 'top' : '') + '">' + (index + 1) + '</span></td><td>' + email + '</td><td>' + sender.count.toLocaleString() + '</td><td><div class="percentage-bar"><div class="percentage-fill" style="width: ' + percentage + '%"></div></div><span style="margin-left: 8px; color: var(--text-secondary); font-size: 13px;">' + percentage + '%</span></td>';
    tbody.appendChild(tr);
  });
}

function updateTrendsInsights(analysis, emailsByDate) {
  const container = document.getElementById('trendsInsights');
  container.innerHTML = '';
  const insights = analysis.insights ? [...analysis.insights] : [];

  if (emailsByDate && emailsByDate.length > 1) {
    const sorted = [...emailsByDate].sort((a, b) => b.count - a.count);
    const busiestDay = sorted[0];
    const quietestDay = sorted[sorted.length - 1];
    insights.push('Busiest day: ' + busiestDay.date + ' with ' + busiestDay.count + ' emails');
    insights.push('Quietest day: ' + quietestDay.date + ' with ' + quietestDay.count + ' emails');
  }

  insights.forEach(insight => {
    const div = document.createElement('div');
    div.className = 'insight-item';
    div.innerHTML = '<span class="insight-icon">📊</span><span class="insight-text">' + insight + '</span>';
    container.appendChild(div);
  });
}

function updateStats(stats, emailsByDate, analysis) {
  const totalEl = document.getElementById('totalEmailsDashboard');
  const sendersEl = document.getElementById('uniqueSendersDashboard');
  if (totalEl) totalEl.textContent = stats.total ? stats.total.toLocaleString() : '0';
  if (sendersEl) sendersEl.textContent = stats.uniqueSenders ? stats.uniqueSenders.toLocaleString() : '-';

  const totalOriginal = document.getElementById('totalEmails');
  const sendersOriginal = document.getElementById('uniqueSenders');
  const dailyAvgEl = document.getElementById('dailyAvg');
  const topCatEl = document.getElementById('topCategory');

  if (totalOriginal) totalOriginal.textContent = stats.total ? stats.total.toLocaleString() : '0';
  if (sendersOriginal) sendersOriginal.textContent = stats.uniqueSenders ? stats.uniqueSenders.toLocaleString() : '-';
  if (dailyAvgEl && emailsByDate && emailsByDate.length > 0) {
    const totalDays = emailsByDate.length;
    const totalEmails = emailsByDate.reduce((sum, d) => sum + d.count, 0);
    dailyAvgEl.textContent = (totalEmails / totalDays).toFixed(1);
  }
  if (topCatEl && analysis && analysis.categories) {
    const cats = analysis.categories;
    const top = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
    if (top) {
      const labels = { newsletters: 'Newsletters', notifications: 'Notifications', personal: 'Personal', work: 'Work', other: 'Other' };
      topCatEl.textContent = labels[top[0]] || top[0];
    }
  }
}

/* ── Charts ────────────────────────────────────── */

function updateTopSendersChart(data, total) {
  if (!topSendersChart) {
    const canvas = document.getElementById('topSendersChart');
    if (!canvas) return;
    topSendersChart = new Chart(canvas, {
      type: 'bar',
      data: { labels: [], datasets: [{ label: 'Emails', data: [], backgroundColor: '#8b5cf6', borderRadius: 2 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: true }
    });
  }
  const labels = data.map(d => { const m = d.sender.match(/<(.+)>/); return m ? m[1] : d.sender; }).reverse();
  const counts = data.map(d => d.count).reverse();
  topSendersChart.data.labels = labels;
  topSendersChart.data.datasets[0].data = counts;
  topSendersChart.update();
}

function updateTrendsChart(data) {
  if (!trendsChart) {
    const canvas = document.getElementById('trendsChart');
    if (!canvas) return;
    trendsChart = new Chart(canvas, {
      type: 'line',
      data: { labels: [], datasets: [{ label: 'Emails by Hour', data: [], borderColor: '#2eaadc', tension: 0.4 }] },
      options: { responsive: true, maintainAspectRatio: true }
    });
  }
  if (!data) return;
  const hours = Array.from({ length: 24 }, (_, i) => i + ':00');
  const counts = data.map(d => d.count || 0);
  trendsChart.data.labels = hours;
  trendsChart.data.datasets[0].data = counts;
  trendsChart.update();
}

function createDefaultCharts(emailsByDate, hourlyData) {
  if (defaultHourlyChartInstance) { defaultHourlyChartInstance.destroy(); defaultHourlyChartInstance = null; }
  if (defaultDailyChartInstance) { defaultDailyChartInstance.destroy(); defaultDailyChartInstance = null; }

  const hourlyCanvas = document.getElementById('defaultHourlyChart');
  if (hourlyCanvas && hourlyData && hourlyData.length > 0) {
    const hours = Array.from({ length: 24 }, (_, i) => i + ':00');
    const counts = hourlyData.map(d => d.count || 0);
    defaultHourlyChartInstance = new Chart(hourlyCanvas, {
      type: 'line',
      data: {
        labels: hours,
        datasets: [{ label: 'Emails by Hour', data: counts, borderColor: '#2eaadc', backgroundColor: 'rgba(46, 170, 220, 0.1)', tension: 0.4, fill: true, pointRadius: 2, pointHoverRadius: 5 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 10 } } }, y: { grid: { color: '#f0f0f0' }, beginAtZero: true } } }
    });
  }

  const dailyCanvas = document.getElementById('defaultDailyChart');
  if (dailyCanvas && emailsByDate && emailsByDate.length > 0) {
    const labels = emailsByDate.map(d => d.date).reverse();
    const counts = emailsByDate.map(d => d.count).reverse();
    defaultDailyChartInstance = new Chart(dailyCanvas, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Emails', data: counts, backgroundColor: '#2eaadc', borderRadius: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 10 } } }, y: { grid: { color: '#f0f0f0' }, beginAtZero: true } } }
    });
  }
}

function resetCharts() {
  document.getElementById('totalEmails').textContent = '-';
  document.getElementById('uniqueSenders').textContent = '-';
  document.getElementById('dailyAvg').textContent = '-';
  document.getElementById('topCategory').textContent = '-';

  Object.keys(widgetCharts).forEach(id => { widgetCharts[id].destroy(); delete widgetCharts[id]; });
  if (defaultHourlyChartInstance) { defaultHourlyChartInstance.destroy(); defaultHourlyChartInstance = null; }
  if (defaultDailyChartInstance) { defaultDailyChartInstance.destroy(); defaultDailyChartInstance = null; }
  if (calendarChartInstance) { calendarChartInstance.destroy(); calendarChartInstance = null; }

  if (topSendersChart) { topSendersChart.data.labels = []; topSendersChart.data.datasets[0].data = []; topSendersChart.update(); }
  if (trendsChart) { trendsChart.data.labels = []; trendsChart.data.datasets[0].data = []; trendsChart.update(); }

  const sendersBody = document.getElementById('sendersTableBody');
  if (sendersBody) sendersBody.innerHTML = '';
  const trendsInsights = document.getElementById('trendsInsights');
  if (trendsInsights) trendsInsights.innerHTML = '';
  const aiResults = document.getElementById('aiResults');
  if (aiResults) {
    aiResults.innerHTML = '<div class="ai-empty-state"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M20.66 8A10 10 0 0 0 14 2v6.66z"/></svg><p>Ask a question to get AI-powered insights about your emails.</p></div>';
  }

  dashboardWidgets = [];
  renderEmptyDashboard();
  navigateTo('dashboard');
}

/* ── Dashboard Widgets ─────────────────────────── */

function openAddWidgetModal() {
  editingWidgetId = null;
  document.getElementById('modalTitle').textContent = 'Add Widget';
  document.getElementById('widgetTitle').value = '';
  document.getElementById('widgetType').value = 'bar';
  document.getElementById('widgetDataSource').value = 'emailsByDate';
  document.getElementById('widgetWidth').value = '1';
  document.getElementById('deleteWidgetBtn').style.display = 'none';
  document.getElementById('widgetModal').style.display = 'flex';
}

function openEditWidgetModal(widget) {
  editingWidgetId = widget.id;
  document.getElementById('modalTitle').textContent = 'Edit Widget';
  document.getElementById('widgetTitle').value = widget.title;
  document.getElementById('widgetType').value = widget.chartType;
  document.getElementById('widgetDataSource').value = widget.dataSource;
  document.getElementById('widgetWidth').value = widget.width.toString();
  document.getElementById('deleteWidgetBtn').style.display = 'inline-flex';
  document.getElementById('widgetModal').style.display = 'flex';
}

function closeModal() { document.getElementById('widgetModal').style.display = 'none'; editingWidgetId = null; }

async function saveWidget() {
  const title = document.getElementById('widgetTitle').value.trim();
  const chartType = document.getElementById('widgetType').value;
  const dataSource = document.getElementById('widgetDataSource').value;
  const width = parseInt(document.getElementById('widgetWidth').value);
  if (!title) { alert('Please enter a widget title'); return; }

  if (editingWidgetId) {
    const widget = dashboardWidgets.find(w => w.id === editingWidgetId);
    if (widget) { widget.title = title; widget.chartType = chartType; widget.dataSource = dataSource; widget.width = width; }
  } else {
    dashboardWidgets.push({ id: 'widget_' + Date.now(), type: 'chart', title, chartType, dataSource, width, height: 1, positionX: dashboardWidgets.length % 2, positionY: Math.floor(dashboardWidgets.length / 2), config: {} });
  }

  await window.electronAPI.saveDashboardWidgets(dashboardWidgets);
  closeModal();
  renderDashboard();
  setTimeout(() => loadAllWidgetData(), 200);
}

async function deleteWidget() {
  if (!editingWidgetId) return;
  dashboardWidgets = dashboardWidgets.filter(w => w.id !== editingWidgetId);
  if (widgetCharts[editingWidgetId]) { widgetCharts[editingWidgetId].destroy(); delete widgetCharts[editingWidgetId]; }
  await window.electronAPI.saveDashboardWidgets(dashboardWidgets);
  closeModal();
  renderDashboard();
}

function editWidget(widgetId) { const w = dashboardWidgets.find(w => w.id === widgetId); if (w) openEditWidgetModal(w); }

async function removeWidget(widgetId) {
  if (!confirm('Remove this widget from the dashboard?')) return;
  dashboardWidgets = dashboardWidgets.filter(w => w.id !== widgetId);
  if (widgetCharts[widgetId]) { widgetCharts[widgetId].destroy(); delete widgetCharts[widgetId]; }
  await window.electronAPI.saveDashboardWidgets(dashboardWidgets);
  renderDashboard();
}

async function loadAllWidgetData() {
  const [stats, emailsByDate, sendersStats, analysis, hourlyData] = await Promise.all([
    window.electronAPI.getEmailStats(),
    window.electronAPI.getEmailsByDate(),
    window.electronAPI.getSendersStats(),
    window.electronAPI.analyzeEmails(),
    window.electronAPI.getHourlyDistribution(),
  ]);
  updateStats(stats, emailsByDate, analysis);
  dashboardWidgets.forEach(widget => updateWidgetChart(widget, emailsByDate, sendersStats, analysis, hourlyData, stats));
  updateTopSendersChart(sendersStats, stats.total);
  updateTrendsChart(hourlyData);
}

async function refreshWidgetData() { await loadAllWidgetData(); }

function updateWidgetChart(widget, emailsByDate, sendersStats, analysis, hourlyData, stats) {
  const canvasId = 'canvas_' + widget.id;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (widgetCharts[widget.id]) { widgetCharts[widget.id].destroy(); delete widgetCharts[widget.id]; }

  let chartConfig = null;
  const dataSource = widget.dataSource;

  try {
    if (dataSource === 'emailsByDate') {
      if (!emailsByDate || emailsByDate.length === 0) { canvas.parentNode.innerHTML = '<div style="text-align:center;padding:40px;color:#787774;">No data available</div>'; return; }
      const labels = emailsByDate.map(d => d.date).reverse();
      const counts = emailsByDate.map(d => d.count).reverse();
      chartConfig = { type: 'bar', data: { labels, datasets: [{ label: 'Emails', data: counts, backgroundColor: '#2eaadc', borderRadius: 2 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 10 } } }, y: { grid: { color: '#f0f0f0' }, beginAtZero: true } } } };
    } else if (dataSource === 'senders') {
      if (!sendersStats || sendersStats.length === 0) { canvas.parentNode.innerHTML = '<div style="text-align:center;padding:40px;color:#787774;">No data available</div>'; return; }
      const labels = sendersStats.map(d => { const m = d.sender.match(/<(.+)>/); return m ? m[1] : d.sender; }).reverse();
      const counts = sendersStats.map(d => d.count).reverse();
      const isPie = widget.chartType === 'pie' || widget.chartType === 'doughnut';
      chartConfig = {
        type: widget.chartType === 'horizontalBar' ? 'bar' : (widget.chartType || 'bar'),
        data: { labels, datasets: [{ label: 'Emails', data: counts, backgroundColor: '#8b5cf6', borderRadius: 2 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          indexAxis: widget.chartType === 'horizontalBar' ? 'y' : undefined,
          plugins: { legend: { display: isPie } },
          scales: isPie ? {} : { x: { grid: { display: false } }, y: { grid: { color: '#f0f0f0' }, beginAtZero: true } }
        }
      };
    } else if (dataSource === 'categories') {
      const cats = (analysis && analysis.categories) || {};
      if (Object.keys(cats).length === 0) { canvas.parentNode.innerHTML = '<div style="text-align:center;padding:40px;color:#787774;">No data available</div>'; return; }
      chartConfig = {
        type: widget.chartType === 'horizontalBar' ? 'bar' : (widget.chartType || 'doughnut'),
        data: { labels: ['Newsletters', 'Notifications', 'Personal', 'Work', 'Other'], datasets: [{ data: [cats.newsletters||0, cats.notifications||0, cats.personal||0, cats.work||0, cats.other||0], backgroundColor: ['#2eaadc', '#8b5cf6', '#22c55e', '#f59e0b', '#b4b4b0'], borderWidth: 0, spacing: 2 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: widget.chartType === 'doughnut' ? '65%' : undefined, plugins: { legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true, pointStyle: 'circle' } } } }
      };
    } else if (dataSource === 'hourlyDistribution') {
      if (!hourlyData || hourlyData.length === 0) { canvas.parentNode.innerHTML = '<div style="text-align:center;padding:40px;color:#787774;">No data available</div>'; return; }
      const hours = Array.from({ length: 24 }, (_, i) => i + ':00');
      const counts = hourlyData.map(d => d.count || 0);
      chartConfig = {
        type: widget.chartType === 'horizontalBar' ? 'bar' : (widget.chartType || 'line'),
        data: { labels: hours, datasets: [{ label: 'Emails by Hour', data: counts, borderColor: '#2eaadc', backgroundColor: widget.chartType === 'line' ? 'rgba(46,170,220,0.1)' : '#2eaadc', tension: 0.4, fill: widget.chartType === 'line', pointRadius: 2, pointHoverRadius: 5 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: widget.chartType === 'line' } }, scales: (widget.chartType !== 'pie' && widget.chartType !== 'doughnut') ? { x: { grid: { display: false }, ticks: { font: { size: 10 } } }, y: { grid: { color: '#f0f0f0' }, beginAtZero: true } } : {} }
      };
    }

    if (chartConfig) widgetCharts[widget.id] = new Chart(canvas, chartConfig);
  } catch (err) { console.error('Error creating chart:', err); canvas.parentNode.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444;">Error loading chart</div>'; }
}

async function loadDashboardWidgets() {
  dashboardWidgets = await window.electronAPI.getDashboardWidgets();
  if (dashboardWidgets.length === 0) initializeDefaultWidgets();
  else { renderDashboard(); setTimeout(() => loadAllWidgetData(), 500); }
}

function renderEmptyDashboard() {
  const grid = document.getElementById('dashboardGrid');
  grid.innerHTML = '<div class="empty-dashboard"><p>No widgets added yet. Click "Customize" to add charts to your dashboard.</p><button class="btn btn-primary" onclick="openAddWidgetModal()">Add Your First Widget</button></div>';
}

function renderDashboard() {
  const grid = document.getElementById('dashboardGrid');
  grid.innerHTML = '';
  if (dashboardWidgets.length === 0) { renderEmptyDashboard(); return; }
  dashboardWidgets.forEach(widget => {
    const widgetEl = document.createElement('div');
    widgetEl.className = 'dashboard-widget widget-width-' + widget.width;
    widgetEl.dataset.widgetId = widget.id;
    const header = document.createElement('div'); header.className = 'widget-header';
    const title = document.createElement('span'); title.className = 'widget-title'; title.textContent = widget.title; header.appendChild(title);
    const actions = document.createElement('div'); actions.className = 'widget-actions';
    const editBtn = document.createElement('button'); editBtn.className = 'widget-action-btn'; editBtn.title = 'Edit';
    editBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    editBtn.onclick = () => editWidget(widget.id); actions.appendChild(editBtn);
    const removeBtn = document.createElement('button'); removeBtn.className = 'widget-action-btn'; removeBtn.title = 'Remove';
    removeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    removeBtn.onclick = () => removeWidget(widget.id); actions.appendChild(removeBtn);
    header.appendChild(actions);
    const chartContainer = document.createElement('div'); chartContainer.className = 'widget-chart-container';
    const canvas = document.createElement('canvas'); canvas.id = 'canvas_' + widget.id; chartContainer.appendChild(canvas);
    widgetEl.appendChild(header); widgetEl.appendChild(chartContainer);
    grid.appendChild(widgetEl);
  });
}

function initializeDefaultWidgets() {
  if (dashboardWidgets.length > 0) return;
  dashboardWidgets = [
    { id: 'widget_default_1', type: 'chart', title: 'Emails by Day', chartType: 'bar', dataSource: 'emailsByDate', width: 1, height: 1, positionX: 0, positionY: 0, config: {} },
    { id: 'widget_default_2', type: 'chart', title: 'Emails by Hour', chartType: 'line', dataSource: 'hourlyDistribution', width: 1, height: 1, positionX: 1, positionY: 0, config: {} },
    { id: 'widget_default_3', type: 'chart', title: 'Top Senders', chartType: 'horizontalBar', dataSource: 'senders', width: 1, height: 1, positionX: 0, positionY: 1, config: {} },
    { id: 'widget_default_4', type: 'chart', title: 'Email Categories', chartType: 'doughnut', dataSource: 'categories', width: 1, height: 1, positionX: 1, positionY: 1, config: {} },
  ];
  window.electronAPI.saveDashboardWidgets(dashboardWidgets);
  renderDashboard();
  setTimeout(() => loadAllWidgetData(), 500);
}

/* ── AI Insights ───────────────────────────────── */

async function handleAnalyze() {
  const prompt = document.getElementById('promptInput').value.trim();
  if (!prompt) return;

  const resultsDiv = document.getElementById('aiResults');
  resultsDiv.innerHTML = '<div class="ai-result loading"><div class="loading-spinner"></div><span>Analyzing your emails...</span></div>';

  try {
    const result = await window.electronAPI.submitPrompt(prompt);
    resultsDiv.innerHTML = '';
    if (result.results) {
      result.results.forEach(r => {
        const div = document.createElement('div'); div.className = 'ai-result';
        div.innerHTML = '<p>' + r + '</p>'; resultsDiv.appendChild(div);
      });
    }
  } catch (err) {
    resultsDiv.innerHTML = '<div class="ai-result"><p class="error">Error: ' + err.message + '</p></div>';
  }
}

/* ── Job Applications ──────────────────────────── */

function openAddJobModal() {
  editingJobId = null;
  document.getElementById('jobModalTitle').textContent = 'Add Application';
  document.getElementById('jobTitleInput').value = '';
  document.getElementById('jobIdInput').value = '';
  document.getElementById('companyInput').value = '';
  document.getElementById('locationInput').value = '';
  document.getElementById('statusInput').value = 'applied';
  document.getElementById('dateInput').value = new Date().toISOString().split('T')[0];
  document.getElementById('notesInput').value = '';
  document.getElementById('deleteJobBtn').style.display = 'none';
  document.getElementById('jobModal').style.display = 'flex';
}

function openEditJobModal(job) {
  editingJobId = job.id;
  document.getElementById('jobModalTitle').textContent = 'Edit Application';
  document.getElementById('jobTitleInput').value = job.job_title;
  document.getElementById('jobIdInput').value = job.job_id || '';
  document.getElementById('companyInput').value = job.company_name;
  document.getElementById('locationInput').value = job.location || '';
  document.getElementById('statusInput').value = job.status;
  document.getElementById('dateInput').value = job.date_applied;
  document.getElementById('notesInput').value = job.notes || '';
  document.getElementById('deleteJobBtn').style.display = 'inline-flex';
  document.getElementById('jobModal').style.display = 'flex';
}

function closeJobModal() { document.getElementById('jobModal').style.display = 'none'; editingJobId = null; }

async function saveJob() {
  const jobTitle = document.getElementById('jobTitleInput').value.trim();
  const company = document.getElementById('companyInput').value.trim();
  const date = document.getElementById('dateInput').value;
  if (!jobTitle || !company || !date) { alert('Please fill in Job Title, Company Name, and Date Applied.'); return; }

  const app = {
    job_title: jobTitle, job_id: document.getElementById('jobIdInput').value.trim(),
    company_name: company, location: document.getElementById('locationInput').value.trim(),
    status: document.getElementById('statusInput').value, date_applied: date,
    notes: document.getElementById('notesInput').value.trim(),
  };

  if (editingJobId) await window.electronAPI.updateJobApplication(editingJobId, app);
  else await window.electronAPI.addJobApplication(app);
  closeJobModal();
  loadJobApplications();
}

async function deleteJob() {
  if (!editingJobId) return;
  if (!confirm('Delete this job application?')) return;
  await window.electronAPI.deleteJobApplication(editingJobId);
  closeJobModal();
  loadJobApplications();
}

async function loadJobApplications() {
  jobsCache = await window.electronAPI.getJobApplications();
  renderJobsTable(jobsCache);
  updateJobsStats(jobsCache);
}

function renderJobsTable(apps) {
  const tbody = document.getElementById('jobsTableBody');
  tbody.innerHTML = '';
  if (apps.length === 0) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-tertiary);padding:32px;">No applications tracked yet. Add your first one!</td></tr>'; return; }
  apps.forEach(job => {
    const tr = document.createElement('tr');
    const statusLabels = { applied: 'Applied', interview: 'Interview', rejected: 'Rejected', accepted: 'Accepted' };
    tr.innerHTML = `<td><strong>${escHtml(job.job_title)}</strong></td><td style="color:var(--text-secondary);font-size:13px;">${job.job_id ? escHtml(job.job_id) : '—'}</td><td>${escHtml(job.company_name)}</td><td style="color:var(--text-secondary);font-size:13px;">${job.location ? escHtml(job.location) : '—'}</td><td><span class="status-badge status-${job.status}">${statusLabels[job.status] || job.status}</span></td><td style="color:var(--text-secondary);font-size:13px;">${formatDate(job.date_applied)}</td><td><button class="job-action-btn" onclick="editJob(${job.id})">Edit</button><button class="job-action-btn" onclick="removeJob(${job.id})" style="color:#ef4444;">Delete</button></td>`;
    tbody.appendChild(tr);
  });
}

function updateJobsStats(apps) {
  const stats = { total: apps.length, applied: 0, interview: 0, rejected: 0, accepted: 0 };
  apps.forEach(a => { stats[a.status]++; });
  document.getElementById('jobsTotal').textContent = stats.total;
  document.getElementById('jobsApplied').textContent = stats.applied;
  document.getElementById('jobsInterview').textContent = stats.interview;
  document.getElementById('jobsRejected').textContent = stats.rejected;
  document.getElementById('jobsAccepted').textContent = stats.accepted;
}

async function handleAnalyzeJobs() {
  const analysisDiv = document.getElementById('jobsAnalysis');
  analysisDiv.style.display = 'block';
  analysisDiv.innerHTML = '<div class="ai-result loading"><div class="loading-spinner"></div><span>Analyzing your job applications...</span></div>';
  try {
    const result = await window.electronAPI.analyzeJobApplications();
    analysisDiv.innerHTML = '';
    const header = document.createElement('div'); header.className = 'ai-result'; header.style.marginBottom = '8px'; header.style.fontWeight = '600'; header.textContent = result.summary; analysisDiv.appendChild(header);
    result.insights.forEach(insight => {
      const div = document.createElement('div'); div.className = 'ai-result';
      div.innerHTML = `<span style="margin-right:8px;">📊</span><span>${insight}</span>`; analysisDiv.appendChild(div);
    });
  } catch (err) { analysisDiv.innerHTML = `<div class="ai-result"><p class="error">Error: ${err.message}</p></div>`; }
}

async function handleScanJobEmails() {
  const container = document.getElementById('jobsScanResults');
  const body = document.getElementById('scanResultsBody');
  container.style.display = 'block';
  body.innerHTML = '<div class="ai-result loading"><div class="loading-spinner"></div><span>Scanning emails for job activity...</span></div>';
  try {
    const results = await window.electronAPI.scanJobEmails();
    body.innerHTML = '';
    if (results.length === 0) { body.innerHTML = '<div class="ai-result" style="color:var(--text-tertiary);">No job-related emails detected in your inbox.</div>'; return; }
    const catLabels = { application: 'Application', interview: 'Interview', rejection: 'Rejection', offer: 'Offer' };
    const catColors = { application: '#1a73e8', interview: '#f59e0b', rejection: '#dc2626', offer: '#16a34a' };
    results.forEach(r => {
      const card = document.createElement('div'); card.className = 'ai-result'; card.style.marginBottom = '8px';
      card.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;"><div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:14px;margin-bottom:2px;">${escHtml(r.subject || '(no subject)')}</div><div style="font-size:13px;color:var(--text-secondary);">${escHtml(r.sender || '')}</div></div><div style="display:flex;align-items:center;gap:8px;flex-shrink:0;"><span class="status-badge" style="background:${catColors[r.category]}20;color:${catColors[r.category]};">${catLabels[r.category] || r.category} (${r.confidence}%)</span><button class="btn btn-primary" style="font-size:12px;padding:4px 10px;" onclick="addFromScan('${r.emailId}')">Add</button></div></div>`;
      body.appendChild(card);
    });
  } catch (err) { body.innerHTML = `<div class="ai-result"><p class="error">Error: ${err.message}</p></div>`; }
}

async function addFromScan(emailId) {
  const results = await window.electronAPI.scanJobEmails();
  const match = results.find(r => r.emailId === emailId);
  if (!match) return;
  const sender = match.sender || '';
  const domainMatch = sender.match(/@([^>]+)/);
  const companyName = domainMatch ? domainMatch[1].split('.')[0] : 'Unknown';
  const companyClean = companyName.charAt(0).toUpperCase() + companyName.slice(1);
  const statusMap = { application: 'applied', interview: 'interview', rejection: 'rejected', offer: 'accepted' };
  const status = statusMap[match.category] || 'applied';
  const date = match.date ? new Date(match.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
  const jobTitle = (match.subject || 'Unknown Position').replace(/^(Re:|Fwd:|Thank you|Application|Invitation|Interview|Update)/i, '').trim().substring(0, 100);
  await window.electronAPI.addJobApplication({ job_title: jobTitle, job_id: '', company_name: companyClean, location: '', status, date_applied: date, notes: `Auto-detected from email: ${match.subject}` });
  loadJobApplications();
  handleScanJobEmails();
}

function editJob(id) { const job = jobsCache.find(a => a.id === id); if (job) openEditJobModal(job); }
async function removeJob(id) { if (!confirm('Delete this job application?')) return; await window.electronAPI.deleteJobApplication(id); loadJobApplications(); }

/* ── Calendar ──────────────────────────────────── */

async function handleSyncCalendar() {
  try {
    showToast('Syncing calendar...', 'info');
    const result = await window.electronAPI.fetchCalendarEvents();
    if (result.success) {
      showToast(`Synced ${result.count} calendar events`, 'success');
      loadCalendarData();
    } else {
      showToast('Calendar sync failed: ' + (result.error || 'Unknown'), 'error');
    }
  } catch (err) {
    showToast('Calendar error: ' + err.message, 'error');
  }
}

async function loadCalendarData() {
  const container = document.getElementById('calendarData');
  try {
    const correlation = await window.electronAPI.getCalendarCorrelation();
    if (!correlation || correlation.length === 0) {
      container.innerHTML = '<div class="empty-dashboard"><p>No calendar data yet. Sync your Google Calendar to see correlations with email activity.</p></div>';
      return;
    }
    container.innerHTML = '';
    correlation.slice(0, 10).forEach(c => {
      if (c.event_count > 0) {
        const div = document.createElement('div');
        div.className = 'calendar-insight';
        div.innerHTML = `<span>📅</span><div><strong>${c.date}</strong> — ${c.event_count} event(s), ${c.email_count} email(s)</div>`;
        container.appendChild(div);
      }
    });
    updateCalendarChart(correlation);
  } catch (err) {
    container.innerHTML = `<div class="empty-dashboard"><p>Error: ${err.message}</p></div>`;
  }
}

function updateCalendarChart(correlation) {
  if (calendarChartInstance) { calendarChartInstance.destroy(); calendarChartInstance = null; }
  const canvas = document.getElementById('calendarChart');
  if (!canvas || !correlation || correlation.length === 0) return;
  const sorted = [...correlation].sort((a, b) => a.date.localeCompare(b.date));
  const labels = sorted.map(c => c.date);
  const events = sorted.map(c => c.event_count || 0);
  const emails = sorted.map(c => c.email_count || 0);
  calendarChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Calendar Events', data: events, backgroundColor: '#8b5cf6', borderRadius: 2 },
        { label: 'Emails', data: emails, backgroundColor: '#2eaadc', borderRadius: 2 },
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 10 } } }, y: { grid: { color: '#f0f0f0' }, beginAtZero: true } } }
  });
}

/* ── Export ────────────────────────────────────── */

function openExportModal(defaultType) {
  document.getElementById('exportDataType').value = defaultType || 'emails';
  document.getElementById('exportModal').style.display = 'flex';
}

function closeExportModal() { document.getElementById('exportModal').style.display = 'none'; }

async function doExport() {
  const dataType = document.getElementById('exportDataType').value;
  const format = document.getElementById('exportFormat').value;
  closeExportModal();
  try {
    let result;
    if (dataType === 'emails') result = await window.electronAPI.exportData(format);
    else result = await window.electronAPI.exportJobApplications(format);
    if (result.success) showToast(`Exported to ${result.filePath}`, 'success');
    else showToast('Export cancelled', 'info');
  } catch (err) { showToast('Export error: ' + err.message, 'error'); }
}

/* ── Training Data ─────────────────────────────── */

function openTrainingModal() {
  document.getElementById('trainingModal').style.display = 'flex';
  loadTrainingEditor('categories');
}

function closeTrainingModal() { document.getElementById('trainingModal').style.display = 'none'; }

let currentTrainingType = 'categories';

async function loadTrainingEditor(type) {
  currentTrainingType = type;
  document.querySelectorAll('.training-tab').forEach(t => t.classList.toggle('active', t.dataset.trainingType === type));
  try {
    const result = await window.electronAPI.getTrainingData();
    if (result.success) {
      const data = result.data[type] || {};
      document.getElementById('trainingEditor').value = JSON.stringify(data, null, 2);
    }
  } catch (err) {
    document.getElementById('trainingEditor').value = 'Error loading training data: ' + err.message;
  }
}

function switchTrainingTab(type) { loadTrainingEditor(type); }

async function saveTrainingData() {
  try {
    const raw = document.getElementById('trainingEditor').value;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || Array.isArray(data)) throw new Error('Data must be an object with category arrays');
    await window.electronAPI.saveTrainingData(currentTrainingType, data);
    showToast('Training data saved and classifiers retrained!', 'success');
    closeTrainingModal();
  } catch (err) {
    alert('Invalid JSON: ' + err.message);
  }
}

/* ── Helpers ───────────────────────────────────── */

function escHtml(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
