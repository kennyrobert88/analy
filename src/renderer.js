
let topSendersChart, trendsChart;
let currentSection = 'dashboard';
let dashboardWidgets = [];
let widgetCharts = {};
let editingWidgetId = null;

document.addEventListener('DOMContentLoaded', () => {
  if (typeof Chart === 'undefined') {
    console.error('Chart.js not loaded!');
    return;
  }
  console.log('Chart.js loaded successfully, version:', Chart.version);
  
  document.getElementById('connectBtn').addEventListener('click', handleConnect);
  document.getElementById('connectBtn2').addEventListener('click', handleConnect);
  document.getElementById('fetchBtn').addEventListener('click', handleFetchEmails);
  document.getElementById('customizeDashboardBtn').addEventListener('click', openAddWidgetModal);
  document.getElementById('refreshWidgetsBtn').addEventListener('click', refreshWidgetData);
  document.getElementById('analyzeBtn').addEventListener('click', handleAnalyze);
  document.getElementById('promptInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleAnalyze();
  });

  document.querySelectorAll('.suggestion').forEach(el => {
    el.addEventListener('click', () => {
      document.getElementById('promptInput').value = el.dataset.prompt;
      handleAnalyze();
    });
  });

  document.getElementById('logoutBtn').addEventListener('click', handleLogout);
  document.getElementById('logoutBtnTop').addEventListener('click', handleLogout);

  document.getElementById('closeModalBtn').addEventListener('click', closeModal);
  document.getElementById('cancelWidgetBtn').addEventListener('click', closeModal);
  document.getElementById('saveWidgetBtn').addEventListener('click', saveWidget);
  document.getElementById('deleteWidgetBtn').addEventListener('click', deleteWidget);

  // Wait a bit for everything to be ready
  setTimeout(() => {
    checkAuth();
    setupNavigation();
  }, 100);
});

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const section = item.dataset.section;
      navigateTo(section);
    });
  });
}

function navigateTo(section) {
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  const sel = '.nav-item[data-section="' + section + '"]';
  document.querySelector(sel).classList.add('active');

  const sectionIds = ['dashboard', 'senders', 'trends', 'ai-insights'];
  sectionIds.forEach(id => {
    document.getElementById(id).style.display = id === section ? 'block' : 'none';
  });

  const titles = {
    'dashboard': 'Dashboard',
    'senders': 'Top Senders',
    'trends': 'Trends',
    'ai-insights': 'AI Insights'
  };
  document.getElementById('breadcrumbPage').textContent = titles[section] || 'Dashboard';
  currentSection = section;

  document.getElementById('customizeDashboardBtn').style.display =
    section === 'dashboard' ? 'inline-flex' : 'none';
}

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

function closeModal() {
  document.getElementById('widgetModal').style.display = 'none';
  editingWidgetId = null;
}

async function saveWidget() {
  const title = document.getElementById('widgetTitle').value.trim();
  const chartType = document.getElementById('widgetType').value;
  const dataSource = document.getElementById('widgetDataSource').value;
  const width = parseInt(document.getElementById('widgetWidth').value);

  if (!title) {
    alert('Please enter a widget title');
    return;
  }

  if (editingWidgetId) {
    const widget = dashboardWidgets.find(w => w.id === editingWidgetId);
    if (widget) {
      widget.title = title;
      widget.chartType = chartType;
      widget.dataSource = dataSource;
      widget.width = width;
    }
  } else {
    dashboardWidgets.push({
      id: 'widget_' + Date.now(),
      type: 'chart',
      title,
      chartType,
      dataSource,
      width,
      height: 1,
      positionX: dashboardWidgets.length % 2,
      positionY: Math.floor(dashboardWidgets.length / 2),
      config: {}
    });
  }

  await window.electronAPI.saveDashboardWidgets(dashboardWidgets);
  closeModal();
  renderDashboard();
  setTimeout(() => loadAllWidgetData(), 200);
}

async function deleteWidget() {
  if (!editingWidgetId) return;
  dashboardWidgets = dashboardWidgets.filter(w => w.id !== editingWidgetId);
  if (widgetCharts[editingWidgetId]) {
    widgetCharts[editingWidgetId].destroy();
    delete widgetCharts[editingWidgetId];
  }
  await window.electronAPI.saveDashboardWidgets(dashboardWidgets);
  closeModal();
  renderDashboard();
}

function editWidget(widgetId) {
  const widget = dashboardWidgets.find(w => w.id === widgetId);
  if (widget) openEditWidgetModal(widget);
}

async function removeWidget(widgetId) {
  if (!confirm('Remove this widget from the dashboard?')) return;
  dashboardWidgets = dashboardWidgets.filter(w => w.id !== widgetId);
  if (widgetCharts[widgetId]) {
    widgetCharts[widgetId].destroy();
    delete widgetCharts[widgetId];
  }
  await window.electronAPI.saveDashboardWidgets(dashboardWidgets);
  renderDashboard();
}

async function loadAllWidgetData() {
  console.log('[WIDGET LOAD] Loading all widget data from DB...');
  const [stats, emailsByDate, sendersStats, analysis, hourlyData] = await Promise.all([
    window.electronAPI.getEmailStats(),
    window.electronAPI.getEmailsByDate(),
    window.electronAPI.getSendersStats(),
    window.electronAPI.analyzeEmails(),
    window.electronAPI.getHourlyDistribution(),
  ]);

  console.log('[WIDGET LOAD] Stats:', stats);
  console.log('[WIDGET LOAD] Emails by date count:', emailsByDate ? emailsByDate.length : 0);
  console.log('[WIDGET LOAD] Senders stats count:', sendersStats ? sendersStats.length : 0);
  console.log('[WIDGET LOAD] Hourly data count:', hourlyData ? hourlyData.length : 0);

  updateStats(stats, emailsByDate, analysis);

  dashboardWidgets.forEach(widget => {
    console.log('[WIDGET LOAD] Updating widget:', widget.id, 'dataSource:', widget.dataSource);
    updateWidgetChart(widget, emailsByDate, sendersStats, analysis, hourlyData, stats);
  });

  updateTopSendersChart(sendersStats, stats.total);
  updateTrendsChart(hourlyData);
}

async function refreshWidgetData() {
  console.log('[WIDGET REFRESH] Refreshing all widget data...');
  await loadAllWidgetData();
  console.log('[WIDGET REFRESH] Done!');
}

function updateWidgetChart(widget, emailsByDate, sendersStats, analysis, hourlyData, stats) {
  const canvasId = 'canvas_' + widget.id;
  const canvas = document.getElementById(canvasId);

  if (!canvas) {
    console.error('[WIDGET] Canvas not found:', canvasId);
    return;
  }

  console.log('[WIDGET] Updating widget:', widget.id, '| dataSource:', widget.dataSource, '| chartType:', widget.chartType);

  if (widgetCharts[widget.id]) {
    widgetCharts[widget.id].destroy();
    delete widgetCharts[widget.id];
  }

  let chartConfig = null;
  const dataSource = widget.dataSource;

  try {
    if (dataSource === 'emailsByDate') {
      console.log('[WIDGET] emailsByDate - labels:', emailsByDate ? emailsByDate.length : 0);
      if (!emailsByDate || emailsByDate.length === 0) {
        canvas.parentNode.innerHTML = '<div style="text-align:center;padding:40px;color:#787774;">No data available</div>';
        return;
      }
      const labels = emailsByDate.map(d => d.date).reverse();
      const counts = emailsByDate.map(d => d.count).reverse();
      chartConfig = {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{ label: 'Emails', data: counts, backgroundColor: '#2eaadc', borderRadius: 2 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 10 } } },
            y: { grid: { color: '#f0f0f0' }, beginAtZero: true }
          }
        }
      };
    } else if (dataSource === 'senders') {
      if (!sendersStats || sendersStats.length === 0) {
        canvas.parentNode.innerHTML = '<div style="text-align:center;padding:40px;color:#787774;">No data available</div>';
        return;
      }
      const labels = sendersStats.map(d => {
        const match = d.sender.match(/<(.+)>/);
        return match ? match[1] : d.sender;
      }).reverse();
      const counts = sendersStats.map(d => d.count).reverse();
      chartConfig = {
        type: (widget.chartType === 'horizontalBar') ? 'bar' : (widget.chartType || 'bar'),
        data: {
          labels: labels,
          datasets: [{ label: 'Emails', data: counts, backgroundColor: '#8b5cf6', borderRadius: 2 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: (widget.chartType === 'horizontalBar') ? 'y' : undefined,
          plugins: { legend: { display: (widget.chartType === 'pie' || widget.chartType === 'doughnut') } },
          scales: ((widget.chartType !== 'pie' && widget.chartType !== 'doughnut')) ? {
            x: { grid: { display: false } },
            y: { grid: { color: '#f0f0f0' }, beginAtZero: true }
          } : {}
        }
      };
    } else if (dataSource === 'categories') {
      const cats = (analysis && analysis.categories) || {};
      if (Object.keys(cats).length === 0) {
        canvas.parentNode.innerHTML = '<div style="text-align:center;padding:40px;color:#787774;">No data available</div>';
        return;
      }
      chartConfig = {
        type: (widget.chartType === 'horizontalBar') ? 'bar' : (widget.chartType || 'doughnut'),
        data: {
          labels: ['Newsletters', 'Notifications', 'Personal', 'Work', 'Other'],
          datasets: [{
            data: [cats.newsletters||0, cats.notifications||0, cats.personal||0, cats.work||0, cats.other||0],
            backgroundColor: ['#2eaadc', '#8b5cf6', '#22c55e', '#f59e0b', '#b4b4b0'],
            borderWidth: 0,
            spacing: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: (widget.chartType === 'doughnut') ? '65%' : undefined,
          plugins: { legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true, pointStyle: 'circle' } } }
        }
      };
    } else if (dataSource === 'hourlyDistribution') {
      if (!hourlyData || hourlyData.length === 0) {
        canvas.parentNode.innerHTML = '<div style="text-align:center;padding:40px;color:#787774;">No data available</div>';
        return;
      }
      const hours = Array.from({ length: 24 }, (_, i) => i + ':00');
      const counts = hourlyData.map(d => d.count || 0);
      chartConfig = {
        type: (widget.chartType === 'horizontalBar') ? 'bar' : (widget.chartType || 'line'),
        data: {
          labels: hours,
          datasets: [{
            label: 'Emails by Hour',
            data: counts,
            borderColor: '#2eaadc',
            backgroundColor: (widget.chartType === 'line') ? 'rgba(46,170,220,0.1)' : '#2eaadc',
            tension: 0.4,
            fill: (widget.chartType === 'line'),
            pointRadius: 2,
            pointHoverRadius: 5
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: (widget.chartType === 'line') } },
          scales: ((widget.chartType !== 'pie' && widget.chartType !== 'doughnut')) ? {
            x: { grid: { display: false }, ticks: { font: { size: 10 } } },
            y: { grid: { color: '#f0f0f0' }, beginAtZero: true }
          } : {}
        }
      };
    }

    if (chartConfig) {
      widgetCharts[widget.id] = new Chart(canvas, chartConfig);
      console.log('Chart created for widget:', widget.id, widget.dataSource);
    }
  } catch (err) {
    console.error('Error creating chart:', err);
    canvas.parentNode.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444;">Error loading chart</div>';
  }
}

async function checkAuth() {
  const authenticated = await window.electronAPI.checkAuth();
  if (authenticated) {
    showDashboard();
  }
}

async function loadExistingData() {
  console.log('[LOAD] ===== START loadExistingData() =====');
  const [stats, emailsByDate, sendersStats, analysis, hourlyData] = await Promise.all([
    window.electronAPI.getEmailStats(),
    window.electronAPI.getEmailsByDate(),
    window.electronAPI.getSendersStats(),
    window.electronAPI.analyzeEmails(),
    window.electronAPI.getHourlyDistribution(),
  ]);

  console.log('[LOAD] Stats received:', JSON.stringify(stats));
  console.log('[LOAD] Emails by date count:', emailsByDate ? emailsByDate.length : 0);

  updateStats(stats, emailsByDate, analysis);

  // Update today's email count
  const today = new Date().toISOString().split('T')[0];
  console.log('[LOAD] Today date:', today);

  const todayData = emailsByDate ? emailsByDate.find(d => d.date === today) : null;
  const todayCount = todayData ? todayData.count : 0;
  console.log('[LOAD] Today count:', todayCount);

  // Update DOM elements directly
  const todayEl = document.getElementById('todayEmails');
  const totalEl = document.getElementById('totalEmailsDashboard');
  const sendersEl = document.getElementById('uniqueSendersDashboard');

  console.log('[LOAD] DOM check - todayEl:', todayEl, '| totalEl:', totalEl, '| sendersEl:', sendersEl);

  if (todayEl) {
    todayEl.textContent = todayCount;
    console.log('[LOAD] ✅ Set todayEmails to:', todayCount);
  } else {
    console.error('[LOAD] ❌ todayEmails element NOT found!');
  }

  if (totalEl) {
    totalEl.textContent = stats.total || 0;
    console.log('[LOAD] ✅ Set totalEmailsDashboard to:', stats.total);
  } else {
    console.error('[LOAD] ❌ totalEmailsDashboard element NOT found!');
  }

  if (sendersEl) {
    sendersEl.textContent = stats.uniqueSenders || 0;
    console.log('[LOAD] ✅ Set uniqueSendersDashboard to:', stats.uniqueSenders);
  } else {
    console.error('[LOAD] ❌ uniqueSendersDashboard element NOT found!');
  }

  if (totalEl) {
    totalEl.textContent = stats.total || 0;
    console.log('[LOAD] ✅ Set totalEmailsDashboard to:', stats.total);
  } else {
    console.error('[LOAD] ❌ totalEmailsDashboard element NOT found!');
  }

  if (sendersEl) {
    sendersEl.textContent = stats.uniqueSenders || 0;
    console.log('[LOAD] ✅ Set uniqueSendersDashboard to:', stats.uniqueSenders);
  } else {
    console.error('[LOAD] ❌ uniqueSendersDashboard element NOT found!');
  }

  updateTopSendersChart(sendersStats, stats.total);
  updateSendersTable(sendersStats, stats.total);
  updateTrendsInsights(analysis, emailsByDate);
  updateTrendsChart(hourlyData);

  // Create default analytics charts
  createDefaultCharts(emailsByDate, hourlyData);

  loadAllWidgetData();
}

function createDefaultCharts(emailsByDate, hourlyData) {
  // Default Hourly Chart
  const hourlyCanvas = document.getElementById('defaultHourlyChart');
  if (hourlyCanvas && hourlyData && hourlyData.length > 0) {
    const hours = Array.from({ length: 24 }, (_, i) => i + ':00');
    const counts = hourlyData.map(d => d.count || 0);
    new Chart(hourlyCanvas, {
      type: 'line',
      data: {
        labels: hours,
        datasets: [{
          label: 'Emails by Hour',
          data: counts,
          borderColor: '#2eaadc',
          backgroundColor: 'rgba(46, 170, 220, 0.1)',
          tension: 0.4,
          fill: true,
          pointRadius: 2,
          pointHoverRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { grid: { color: '#f0f0f0' }, beginAtZero: true }
        }
      }
    });
  }

  // Default Daily Chart
  const dailyCanvas = document.getElementById('defaultDailyChart');
  if (dailyCanvas && emailsByDate && emailsByDate.length > 0) {
    const labels = emailsByDate.map(d => d.date).reverse();
    const counts = emailsByDate.map(d => d.count).reverse();
    new Chart(dailyCanvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Emails',
          data: counts,
          backgroundColor: '#2eaadc',
          borderRadius: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 10 } } },
          y: { grid: { color: '#f0f0f0' }, beginAtZero: true }
        }
      }
    });
  }
}

async function handleConnect() {
  try {
    updateSyncStatus('authenticating');
    const result = await window.electronAPI.startOAuthFlow();
    if (result.success) {
      updateSyncStatus('connected');
      showDashboard();
      loadExistingData();
    } else {
      updateSyncStatus('error');
    }
  } catch (err) {
    updateSyncStatus('error');
  }
}

async function handleFetchEmails() {
  try {
    updateSyncStatus('syncing');
    const result = await window.electronAPI.fetchEmails(false);
    updateSyncStatus('connected');
    if (result.count > 0) {
      loadExistingData();
    }
  } catch (err) {
    updateSyncStatus('error');
  }
}


function showDashboard() {
  document.getElementById('authSection').style.display = 'none';
  document.getElementById('dashboardSection').style.display = 'block';
  document.getElementById('connectBtn').style.display = 'none';
  document.getElementById('connectBtn2').style.display = 'none';
  document.getElementById('fetchBtn').style.display = 'inline-flex';
  document.getElementById('customizeDashboardBtn').style.display = 'inline-flex';
  document.getElementById('logoutBtn').style.display = 'flex';
  document.getElementById('logoutBtnTop').style.display = 'inline-flex';
  updateSyncStatus('connected');

  // Load data immediately
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
  document.getElementById('logoutBtn').style.display = 'none';
  document.getElementById('logoutBtnTop').style.display = 'none';
  updateSyncStatus('not-connected');
  resetCharts();
}

async function loadDashboardWidgets() {
  dashboardWidgets = await window.electronAPI.getDashboardWidgets();
  if (dashboardWidgets.length === 0) {
    initializeDefaultWidgets();
  } else {
    renderDashboard();
    // Delay to ensure DOM is ready
    setTimeout(() => {
      loadAllWidgetData();
    }, 500);
  }
}

function renderEmptyDashboard() {
  const grid = document.getElementById('dashboardGrid');
  grid.innerHTML = '<div class="empty-dashboard"><p>No widgets added yet. Click "Customize" to add charts to your dashboard.</p><button class="btn btn-primary" onclick="openAddWidgetModal()">Add Your First Widget</button></div>';
}

function renderDashboard() {
  const grid = document.getElementById('dashboardGrid');
  grid.innerHTML = '';

  if (dashboardWidgets.length === 0) {
    renderEmptyDashboard();
    return;
  }

  dashboardWidgets.forEach(widget => {
    const widgetEl = document.createElement('div');
    widgetEl.className = 'dashboard-widget widget-width-' + widget.width;
    widgetEl.dataset.widgetId = widget.id;

    const header = document.createElement('div');
    header.className = 'widget-header';

    const title = document.createElement('span');
    title.className = 'widget-title';
    title.textContent = widget.title;
    header.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'widget-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'widget-action-btn';
    editBtn.title = 'Edit';
    editBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    editBtn.onclick = () => editWidget(widget.id);
    actions.appendChild(editBtn);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'widget-action-btn';
    removeBtn.title = 'Remove';
    removeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    removeBtn.onclick = () => removeWidget(widget.id);
    actions.appendChild(removeBtn);

    header.appendChild(actions);

    const chartContainer = document.createElement('div');
    chartContainer.className = 'widget-chart-container';
    const canvas = document.createElement('canvas');
    canvas.id = 'canvas_' + widget.id;
    chartContainer.appendChild(canvas);

    widgetEl.appendChild(header);
    widgetEl.appendChild(chartContainer);
    grid.appendChild(widgetEl);
  });

  console.log('Dashboard rendered, widgets:', dashboardWidgets.length);
}

async function handleLogout() {
  try {
    updateSyncStatus('syncing');
    await window.electronAPI.logout();
    showAuthScreen();
  } catch (err) {
    updateSyncStatus('error');
  }
}

function updateSyncStatus(status) {
  const dot = document.getElementById('syncDot');
  const text = document.getElementById('syncStatus');

  dot.className = 'sync-dot';
  switch (status) {
    case 'connected':
      dot.classList.add('connected');
      text.textContent = 'Connected';
      break;
    case 'syncing':
      text.textContent = 'Syncing...';
      break;
    case 'authenticating':
      text.textContent = 'Authenticating...';
      break;
    case 'waiting':
      text.textContent = 'Complete auth...';
      break;
    case 'error':
      text.textContent = 'Error';
      break;
    default:
      text.textContent = 'Not connected';
  }
}

function updateStats(stats, emailsByDate, analysis) {
  // Update dashboard stats cards
  const totalEl = document.getElementById('totalEmailsDashboard');
  const sendersEl = document.getElementById('uniqueSendersDashboard');
  
  if (totalEl) totalEl.textContent = stats.total ? stats.total.toLocaleString() : '0';
  if (sendersEl) sendersEl.textContent = stats.uniqueSenders ? stats.uniqueSenders.toLocaleString() : '-';

  // Update original stats if elements exist (for other pages)
  const totalOriginal = document.getElementById('totalEmails');
  const sendersOriginal = document.getElementById('uniqueSenders');
  const dailyAvgEl = document.getElementById('dailyAvg');
  const topCatEl = document.getElementById('topCategory');

  if (totalOriginal) totalOriginal.textContent = stats.total ? stats.total.toLocaleString() : '0';
  if (sendersOriginal) sendersOriginal.textContent = stats.uniqueSenders ? stats.uniqueSenders.toLocaleString() : '-';

  if (dailyAvgEl && emailsByDate && emailsByDate.length > 0) {
    const totalDays = emailsByDate.length;
    const totalEmails = emailsByDate.reduce((sum, d) => sum + d.count, 0);
    const avg = (totalEmails / totalDays).toFixed(1);
    dailyAvgEl.textContent = avg;
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
  const labels = data.map(d => {
    const match = d.sender.match(/<(.+)>/);
    return match ? match[1] : d.sender;
  }).reverse();
  const counts = data.map(d => d.count).reverse();

  topSendersChart.data.labels = labels;
  topSendersChart.data.datasets[0].data = counts;
  topSendersChart.update();
}

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

  const insights = analysis.insights || [];

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
        const div = document.createElement('div');
        div.className = 'ai-result';
        div.innerHTML = '<p>' + r + '</p>';
        resultsDiv.appendChild(div);
      });
    }
  } catch (err) {
    resultsDiv.innerHTML = '<div class="ai-result"><p class="error">Error: ' + err.message + '</p></div>';
  }
}

function resetCharts() {
  document.getElementById('totalEmails').textContent = '-';
  document.getElementById('uniqueSenders').textContent = '-';
  document.getElementById('dailyAvg').textContent = '-';
  document.getElementById('topCategory').textContent = '-';

  Object.keys(widgetCharts).forEach(id => {
    widgetCharts[id].destroy();
    delete widgetCharts[id];
  });

  if (topSendersChart) {
    topSendersChart.data.labels = [];
    topSendersChart.data.datasets[0].data = [];
    topSendersChart.update();
  }

  if (trendsChart) {
    trendsChart.data.labels = [];
    trendsChart.data.datasets[0].data = [];
    trendsChart.update();
  }

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

function initializeDefaultWidgets() {
  if (dashboardWidgets.length > 0) return;

  dashboardWidgets = [
    {
      id: 'widget_default_1',
      type: 'chart',
      title: 'Emails by Day',
      chartType: 'bar',
      dataSource: 'emailsByDate',
      width: 1,
      height: 1,
      positionX: 0,
      positionY: 0,
      config: {}
    },
    {
      id: 'widget_default_2',
      type: 'chart',
      title: 'Emails by Hour',
      chartType: 'line',
      dataSource: 'hourlyDistribution',
      width: 1,
      height: 1,
      positionX: 1,
      positionY: 0,
      config: {}
    },
    {
      id: 'widget_default_3',
      type: 'chart',
      title: 'Top Senders',
      chartType: 'horizontalBar',
      dataSource: 'senders',
      width: 1,
      height: 1,
      positionX: 0,
      positionY: 1,
      config: {}
    },
    {
      id: 'widget_default_4',
      type: 'chart',
      title: 'Email Categories',
      chartType: 'doughnut',
      dataSource: 'categories',
      width: 1,
      height: 1,
      positionX: 1,
      positionY: 1,
      config: {}
    }
  ];

  window.electronAPI.saveDashboardWidgets(dashboardWidgets);
  renderDashboard();
  setTimeout(() => loadAllWidgetData(), 500);
}

