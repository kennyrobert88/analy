const { app, BrowserWindow, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function getIconPath() {
  const icons = {
    darwin: 'icon.icns',
    win32: 'icon.ico',
  };
  const iconDir = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '..', 'img');
  return path.join(iconDir, icons[process.platform] || 'icon.png');
}

function setupDockIcon() {
  if (!app.isPackaged && process.platform === 'darwin') {
    const iconPath = path.join(__dirname, '..', 'img/icon.png');
    if (fs.existsSync(iconPath)) {
      const dockIcon = nativeImage.createFromBuffer(fs.readFileSync(iconPath));
      app.dock.setIcon(dockIcon);
    }
  }
}

function createWindow() {
  const windowConfig = {
    width: 1200,
    height: 800,
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  if (process.platform === 'darwin') {
    windowConfig.titleBarStyle = 'hiddenInset';
    windowConfig.roundedCorners = true;
    windowConfig.vibrancy = 'under-window';
    windowConfig.transparent = false;
  }

  mainWindow = new BrowserWindow(windowConfig);
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

function getMainWindow() {
  return mainWindow;
}

module.exports = { createWindow, getMainWindow, setupDockIcon, getIconPath };
