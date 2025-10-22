window.electronAPI.onReceiveImage(imageData => {
    document.getElementById('preview').src = imageData.data;
});

window.addEventListener('DOMContentLoaded', () => {
    window.electronAPI.requestFiles();
});

let selectedFileId;
const placeholder = document.getElementById('placeholder');
const settings = document.getElementById('settings'); 
const scaleInput = document.getElementById('scale-range');
const toggleActive = document.getElementById('toggle-active');
const container = document.getElementById('items');

scaleInput.addEventListener('input', e => {
    const scaleValue = e.target.value;
    document.getElementById('scale-value').innerText = scaleValue;
    window.electronAPI.rescaleImage(selectedFileId, scaleValue);
});

function createFileItem(file) {
    const div = document.createElement('div');
    div.id = file.id;
    div.classList.add('item');
    div.innerHTML = `
        <div>
            <img src="./img.svg" width="24" height="24"/>
            <span>${file.name}</span>
        </div>
    `;
    div.addEventListener('click', () => {
        container.querySelectorAll('.item.selected').forEach(item => item.classList.remove('selected'));
        div.classList.add('selected');

        window.electronAPI.requestConfig(file.id);
    });
    container.appendChild(div);
}

window.electronAPI.onReceiveFiles(files => {
    files.forEach(file => {
        createFileItem(file);
    });
});

window.electronAPI.onReceiveConfig(config => {
    selectedFileId = config.id;
    window.electronAPI.requestImage(config.id);
    toggleActive.checked = config.active;
    toggleActive.parentElement.classList.toggle('active', config.active);
    scaleInput.value = config.scale;
    document.getElementById('scale-value').innerText = config.scale;
    settings.style.display = 'block';
    placeholder.style.display = 'none';
});

toggleActive.addEventListener('click', e => {
    e.currentTarget.parentElement.classList.toggle('active');
    window.electronAPI.toggleActive(selectedFileId, e.currentTarget.checked);
});

const fileInput = document.getElementById('file-input');
fileInput.addEventListener('click', () => {
    window.electronAPI.selectFile();
});

window.electronAPI.onStoreFileError(message => {
    alert(`Failed: ${message}`);
});

window.electronAPI.onNewFileStored(file => {
    createFileItem(file);
});

document.getElementById('delete-button').addEventListener('click', () => {
    if(confirm('Are you sure you want to delete this file? This action cannot be undone.')) {
        window.electronAPI.deleteFile(selectedFileId);
        selectedFileId = null;
        settings.style.display = 'none';
        placeholder.style.display = 'block';
    }
});

window.electronAPI.fileDeleted(id => {
    const item = document.getElementById(id);
    if(item) {
        item.remove();
    }
});