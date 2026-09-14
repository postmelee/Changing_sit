const electron = require('electron');
const url = require('url');
const path = require('path');
const {app, BrowserWindow, Menu} = electron;

let mainWindow;

// Listen for app to be ready
app.on('ready', function(){
    // Create new window
    mainWindow = new BrowserWindow({});
    // Load html into window
    mainWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'mainWindow.html'),
        protocol:'file:',
        slashes: true
    }));    

    // Build menu from template
    const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
    // Insert menu
    Menu.setApplicationMenu(mainMenu)
});
app.on('window-all-closed', () => {
    if (process.platform != 'darwin'){
        app.quit();
    }
})


// Create menu template
const mainMenuTemplate = [
]

if(process.env.NODE_ENV !== 'production'){
    mainMenuTemplate.push({
        label: 'Toggle DevTools',
        accelerator: process.platform == 'darwin' ? 'Command+I' :
        'Ctrl+I',
        click(item, focusedWindow){
            focusedWindow.toggleDevTools();
        }
    },
{
    role: 'reload'
})
}