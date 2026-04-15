import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, shell, Tray } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { closeDatabase, getDatabase } from './db/database'
import { registerAIHandlers } from './ipc/ai.ipc'
import { registerConfigHandlers } from './ipc/config.ipc'
import { registerGoalsHandlers } from './ipc/goals.ipc'
import { registerReportsHandlers } from './ipc/reports.ipc'
import { registerTasksHandlers } from './ipc/tasks.ipc'
import { registerTeamHandlers } from './ipc/team.ipc'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let overlayWindow: BrowserWindow | null = null

function getAppIconPath(): string {
  const logoPath = join(__dirname, '../../resources/logo.png')
  if (existsSync(logoPath)) return logoPath
  return join(__dirname, '../../resources/icon.png')
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    icon: getAppIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  win.on('closed', () => {
    overlayWindow = null
  })

  // Both close and minimize send the app to tray
  win.on('close', (event) => {
    if (tray) {
      event.preventDefault()
      win.hide()
    }
  })

  win.on('minimize', () => {
    win.hide()
  })

  // Show overlay when main hides, hide overlay when main shows
  win.on('hide', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.show()
    }
  })

  win.on('show', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.hide()
    }
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

function createOverlayWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 300,
    height: 520,
    minHeight: 200,
    maxHeight: 900,
    x: 20,
    y: 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    movable: true,
    resizable: true,
    skipTaskbar: true,
    show: false,
    icon: getAppIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/overlay.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/overlay.html'))
  }

  return win
}

function createTray(): void {
  let icon = nativeImage.createFromPath(getAppIconPath())

  // Windows tray needs exact 16x16 or 32x32, createEmpty as fallback
  if (icon.isEmpty()) {
    icon = nativeImage.createEmpty()
  } else {
    icon = icon.resize({ width: 16, height: 16 })
  }

  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Execd',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      },
    },
    {
      label: 'Show Overlay',
      click: () => {
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.show()
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        tray?.destroy()
        app.quit()
      },
    },
  ])

  tray.setToolTip('Execd')
  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

function fireTaskCheckNotification(): void {
  const db = getDatabase()
  const today = new Date().toISOString().slice(0, 10)

  const plan = db.prepare('SELECT locked FROM day_plans WHERE date = ?').get(today) as
    | { locked: number }
    | undefined

  if (plan && plan.locked === 1) {
    const rows = db
      .prepare("SELECT status FROM tasks WHERE scheduled_date = ? AND status != 'dropped'")
      .all(today) as { status: string }[]

    if (rows.length > 0) {
      const total = rows.length
      const completed = rows.filter((r) => r.status === 'completed').length
      const pending = total - completed
      const score = Math.round((completed / total) * 100)

      new Notification({
        title: 'Execd — Task Check',
        body: `${pending} task${pending !== 1 ? 's' : ''} remaining (${score}% complete)`,
      }).show()
    }
  }

  // Team follow-up reminder
  const pendingFollowups = db
    .prepare(
      `
    SELECT COUNT(*) as count FROM team_followups 
    WHERE scheduled_date = ? AND done = 0
  `,
    )
    .get(today) as { count: number }

  if (pendingFollowups.count > 0) {
    new Notification({
      title: 'Execd — Follow-up Reminder',
      body: `${pendingFollowups.count} team follow-up${pendingFollowups.count !== 1 ? 's' : ''} pending today`,
    }).show()
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.execd')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize database
  getDatabase()

  registerConfigHandlers()
  registerGoalsHandlers()
  registerAIHandlers()
  registerTasksHandlers()
  registerReportsHandlers()
  registerTeamHandlers()

  ipcMain.handle('overlay:open-main', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })

  ipcMain.handle('overlay:hide', () => {
    overlayWindow?.hide()
  })

  ipcMain.handle('capture-report', async (_, rect) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) throw new Error('No active window')

    const image = await win.webContents.capturePage(rect)

    return image.toPNG().toString('base64')
  })

  mainWindow = createMainWindow()
  createTray()

  overlayWindow = createOverlayWindow()

  setInterval(fireTaskCheckNotification, 60 * 60 * 1000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
    }

    if (!overlayWindow || overlayWindow.isDestroyed()) {
      overlayWindow = createOverlayWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    closeDatabase()
    app.quit()
  }
})

app.on('before-quit', () => {
  closeDatabase()
})

// Suppress unused variable warning — ipcMain will be used in next steps
ipcMain.on('ping', () => console.log('pong'))
