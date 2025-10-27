import {
	app,
	BrowserWindow,
	ipcMain,
	Menu,
	shell,
	Tray,
	dialog,
	nativeImage,
} from 'electron';
import Store from 'electron-store';
import { imageSizeFromFile } from 'image-size/fromFile';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import started from 'electron-squirrel-startup';

if (started) app.quit();

const store = new Store();
const windows = new Map();

function getMimeType(filePath) {
	const ext = path.extname(filePath).toLowerCase();
	const mimeTypes = {
		'.png': 'image/png',
		'.jpg': 'image/jpeg',
		'.jpeg': 'image/jpeg',
		'.gif': 'image/gif',
		'.bmp': 'image/bmp',
		'.webp': 'image/webp',
		'.svg': 'image/svg+xml',
		'.ico': 'image/x-icon'
	};
	return mimeTypes[ext] || 'image/png';
}

function getHash(string) {
	return crypto.createHash('sha256')
	.update(string)
	.digest('hex');
}

function getFilesDir() {
	const devDir = path.resolve('files'); // dev (vite)
    const userDir = path.join(app.getPath('userData'), 'ImageSaved'); // packaged writable folder

    if (app.isPackaged) {
        if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
        return userDir;
    }
    return devDir;
}

function spawnWindow(key, config) {
	console.log('Spawning window for', key, 'with config:', config);

	const win = new BrowserWindow({
		icon: 'public/icon.ico',
		alwaysOnTop: true,
		transparent: true,
		frame: false,
		skipTaskbar: true,
		x: config.x || undefined,
		y: config.y || undefined,
		width: (config.scale / 100) * config.width,
		height: (config.scale / 100) * config.height,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
		},
	});

	win.hashId = key;

	if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
		win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
	} else {
		win.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
	}

	let timer = 0;
	win.on('move', () => {
		clearTimeout(timer);
		timer = setTimeout(() => {
			console.log('Saving state');
			const key = win.hashId;
			const bounds = win.getBounds();
			const value = store.get(key);
			store.set(key, {
				...value,
				x: bounds.x,
				y: bounds.y
			});
		}, 3000);
	});

	win.on('closed', () => {
		console.log('Window closed for', key);
		clearTimeout(timer);
		const value = store.get(key);
		store.set(key, {
			...value,
			active: false
		});
		windows.delete(key);
	});

	windows.set(key, win);
}

async function createWindow(fileName) {
	const key = getHash(fileName);
	const config = store.get(key, {
		name: fileName,
		active: true,
		scale: 100
	});
			
	if(!config.width || !config.height) {
		let width = 200;
		let height = 200;
			
		try {
			const dimensions = await imageSizeFromFile(path.join(getFilesDir(), fileName));
			width = dimensions.width;
			height = dimensions.height;
		} catch (error) {
			console.error('Error getting image dimensions:', error);
		}

		config.width = width;
		config.height = height;
		store.set(key, config);
	}

	if(config.active === false) return;
	spawnWindow(key, config);
}

function createExistsFileWindow() {
	fs.readdir(getFilesDir(), (err, files) => {
		if (err) {
			console.error('Error reading files directory:', err);
			return;
		}

		files = files.filter(item => !(/(^|\/)\.[^\/\.]/g).test(item));

		console.log(`Found ${files.length} files. Creating windows...`);

		files.map((name) => {
			console.log('Processing file:', name);
			createWindow(name);
		});
	});
}

function createMenuWindow() {
	const menuWin = new BrowserWindow({
		title: 'Settings',
		icon: 'public/icon.ico',
		autoHideMenuBar: true,
		width: 600,
		height: 800,
		webPreferences: {
			preload: path.join(__dirname, 'menu-preload.js'),
		},
	});

	if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
		menuWin.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL + '/menu.html');
	} else {
		menuWin.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/menu.html`));
	}
}

let tray = null
app.whenReady().then(() => {
	const iconPath = process.env.NODE_ENV === 'development'
    ? path.join('public', 'icon.ico')
    : path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/icon.ico`);
	const icon = nativeImage.createFromPath(iconPath);
	tray = new Tray(icon);

	const contextMenu = Menu.buildFromTemplate([
		{ label: 'Settings', type: 'normal', click: () => { createMenuWindow() } },
		{ label: 'GitHub', type: 'normal', click: () => { 
			shell.openExternal('https://github.com/nopalherlangga/animg')
		}},
		{ type: 'separator' },
		{ label: 'Close App', type: 'normal', click: () => { app.quit() } },
	])
	tray.setToolTip('Animg');
	tray.setContextMenu(contextMenu);

	createMenuWindow();
	createExistsFileWindow();

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createMenuWindow();
			createExistsFileWindow();
		}
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('request-image', (event, key = null) => {
	let config;
	if(key === null) {
		const win = BrowserWindow.fromWebContents(event.sender);
		
		if (!win) {
			console.log('No window found');
			return;
		}
		config = store.get(win.hashId);
	} else {
		config = store.get(key);
	}

	const imagePath = path.join(getFilesDir(), config.name);
	const imageBuffer = fs.readFileSync(imagePath);
	const base64Image = imageBuffer.toString('base64');
	const mimeType = getMimeType(imagePath);

	event.reply('receive-image', {
		type: 'base64',
		data: `data:${mimeType};base64,${base64Image}`,
		mimeType: mimeType
	});
});

ipcMain.on('rescale-image', (event, key, scale) => {
	const win = windows.get(key);
	const config = store.get(key);

	const newWidth = Math.floor((scale / 100) * config.width);
	const newHeight = Math.floor((scale / 100) * config.height);

	store.set(key, { ...config, scale });

	win.setBounds({
		width: newWidth,
		height: newHeight
	});
});

ipcMain.on('request-files', event => {
	let files = fs.readdirSync(getFilesDir());
	files = files.filter(item => !(/(^|\/)\.[^\/\.]/g).test(item));
	const result = files.map(file => ({ id: getHash(file), name: file }));
	event.reply('receive-files', result);
});

ipcMain.on('request-config', (event, key) => {
	const config = store.get(key);
	event.reply('receive-config', {
		id: key,
		...config,
	});
});

ipcMain.on('toggle-active', (event, key, isActive) => {
	console.log('Toggling active for', key, 'to', isActive);

	const config = store.get(key);
	console.log(config)
	const newConfig = {
		...config,
		active: isActive
	}

	console.log(newConfig)
	
	store.set(key, newConfig);
	const win = windows.get(key);
	if(isActive) {
		if(!win) {
			spawnWindow(key, newConfig);
		}
	} else {
		if(win) {
			win.close();
			windows.delete(key);
		}
	}
});

ipcMain.on('select-file', async event => {
	const win = BrowserWindow.fromWebContents(event.sender);
	const result = await dialog.showOpenDialog(win, {
		properties: ['openFile'],
		filters: [
			{ name: 'Images', extensions: ['jpg', 'jpeg', 'jfif', 'png', 'gif', 'avif', 'svg', 'webp'] },
		]
	});

	if (result.canceled) {
		return null;
	}

	const filePath = result.filePaths[0];
	const fileName = path.basename(filePath);

	const targetPath = path.join(getFilesDir(), fileName);

	if(fs.existsSync(targetPath)) {
		event.reply('store-file-error', 'File already exists in the application.');
		return;
	}

	fs.copyFileSync(filePath, targetPath);

	event.reply('new-file-stored', {
		id: getHash(fileName),
		name: fileName
	});
	createWindow(fileName);
});

ipcMain.on('delete-file', (event, key) => {
	const config = store.get(key);
	const filePath = path.join(getFilesDir(), config.name);
	if(fs.existsSync(filePath)) {
		fs.unlinkSync(filePath);
	}
	store.delete(key);
	const win = windows.get(key);
	if(win) {
		win.close();
		windows.delete(key);
	}
	event.reply('file-deleted', key);
});