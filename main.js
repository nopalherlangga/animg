import {
	app,
	BrowserWindow,
	ipcMain,
	Menu,
	nativeImage,
	shell,
	Tray,
	dialog,
} from 'electron';

import Store from 'electron-store';
import { imageSizeFromFile } from 'image-size/fromFile';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

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

function spawnWindow(key, config) {
	console.log('Spawning window for', key, 'with config:', config);

	const win = new BrowserWindow({
		icon: 'assets/icon.ico',
		alwaysOnTop: true,
		transparent: true,
		frame: false,
		skipTaskbar: true,
		x: config.x || undefined,
		y: config.y || undefined,
		width: (config.scale / 100) * config.width,
		height: (config.scale / 100) * config.height,
		webPreferences: {
			preload: path.resolve('preload.js')
		},
	});

	win.hashId = key;
	win.loadFile('src/index.html');

	// let timer = 0;
	win.on('move', () => {
		// clearTimeout(timer);
		// timer = setTimeout(() => {
		// 	console.log('Saving state');
		// 	const bounds = win.getBounds();
		// 	store.set(win.hashId, {
		// 		...config,
		// 		x: bounds.x,
		// 		y: bounds.y
		// 	});
		// }, 3000);

		const bounds = win.getBounds();
		store.set(win.hashId, {
			...config,
			x: bounds.x,
			y: bounds.y
		});
	});

	win.on('closed', () => {
		console.log('Window closed for', key);
		store.set(key, {
			...config,
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
			const dimensions = await imageSizeFromFile('files/' + file);
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
	fs.readdir('files', (err, files) => {
		if (err) {
			console.error('Error reading files directory:', err);
			return;
		}

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
		icon: 'assets/icon.ico',
		autoHideMenuBar: true,
		width: 600,
		height: 800,
		webPreferences: {
			preload: path.resolve('menu-preload.js')
		},
	});
	menuWin.loadFile('src/menu.html');
}

let tray = null
app.whenReady().then(() => {
	tray = new Tray('assets/icon.ico')

	let githubIcon = nativeImage.createFromPath('assets/github.png')
	githubIcon = githubIcon.resize({ width: 16, height: 16 })

	let appIcon = nativeImage.createFromPath('assets/icon.ico')
	appIcon = appIcon.resize({ width: 16, height: 16 })

	const contextMenu = Menu.buildFromTemplate([
		{ label: 'App Menu', type: 'normal', icon: appIcon, enabled: false },
		{ type: 'separator' },
		{ label: 'Settings', type: 'normal', click: () => { createMenuWindow() } },
		{ label: 'GitHub', type: 'normal', icon: githubIcon, click: () => { 
			shell.openExternal('https://github.com/nopalherlangga')
		}},
		{ type: 'separator' },
		{ label: 'Close App', type: 'normal', click: () => { app.quit() } },
	])
	tray.setToolTip('This is my application.')
	tray.setContextMenu(contextMenu)

	createExistsFileWindow();

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) {
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

	const imagePath = 'files/' + config.name;
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

	store.set(key, {
		...config,
		scale: scale
	});

	win.setBounds({
		width: newWidth,
		height: newHeight
	});
});

ipcMain.on('request-files', event => {
	const files = fs.readdirSync('files');
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
	const newConfig = {
		...config,
		active: isActive
	}
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

	if(fs.existsSync('files/' + fileName)) {
		event.reply('store-file-error', 'File already exists in the application.');
		return;
	}

	fs.copyFileSync(filePath, 'files/' + fileName);

	event.reply('new-file-stored', {
		id: getHash(fileName),
		name: fileName
	});
	createWindow(fileName);
});

ipcMain.on('delete-file', (event, key) => {
	const config = store.get(key);
	const filePath = 'files/' + config.name;
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