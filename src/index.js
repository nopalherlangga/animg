window.electronAPI.onReceiveImage((imageData) => {
    document.body.innerHTML = `<img src="${imageData.data}"/>`;
});

window.addEventListener('DOMContentLoaded', () => {
    window.electronAPI.requestImage();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.close();
});