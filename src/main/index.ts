import { app, shell, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { getDatabase, closeDatabase } from './db/database'
import { registerConfigHandlers } from './ipc/config.ipc'
import { registerAIHandlers } from './ipc/ai.ipc'
import { registerGoalsHandlers } from './ipc/goals.ipc'
import { registerTasksHandlers } from './ipc/tasks.ipc'
import { registerReportsHandlers } from './ipc/reports.ipc'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let overlayWindow: BrowserWindow | null = null

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  win.on('close', (event) => {
    if (tray) {
      event.preventDefault()
      win.hide()
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
    width: 280,
    height: 380,
    x: 20,
    y: 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/overlay.html')
  } else {
    win.loadFile(join(__dirname, '../renderer/overlay.html'))
  }

  return win
}

function createTray(): void {
  const icon = nativeImage.createFromPath(join(__dirname, '../../resources/icon.png'))
  tray = new Tray(icon.resize({ width: 16, height: 16 }))

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Work Planner',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
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

  tray.setToolTip('Work Planner')
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

  if (!plan || plan.locked !== 1) return

  const rows = db
    .prepare("SELECT status FROM tasks WHERE scheduled_date = ? AND status != 'dropped'")
    .all(today) as { status: string }[]

  if (rows.length === 0) return

  const total = rows.length
  const completed = rows.filter((r) => r.status === 'completed').length
  const pending = total - completed
  const score = Math.round((completed / total) * 100)

  new Notification({
    title: 'ExecOS — Task Check',
    body: `${pending} task${pending !== 1 ? 's' : ''} remaining (${score}% complete)`,
  }).show()
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.work-planner')

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

  ipcMain.handle('overlay:open-main', () => {
    mainWindow?.show()
    mainWindow?.focus()
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
