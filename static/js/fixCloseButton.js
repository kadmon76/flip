// fixCloseButton.js
console.log("Fix close button script loaded");

document.addEventListener('DOMContentLoaded', function() {
    // First attempt at page load
    setupCloseButton();
    
    // Try again after a short delay to catch dynamically created elements
    setTimeout(setupCloseButton, 1000);
});

function setupCloseButton() {
    console.log("Setting up close button handler");
    const closeBtn = document.getElementById('debugPanelClose');
    
    if (closeBtn) {
        console.log("Close button found, adding click handler");
        
        // Remove any existing listeners
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
        
        // Add new click listener
        newCloseBtn.addEventListener('click', function(e) {
            console.log("Close button clicked");
            e.preventDefault();
            e.stopPropagation();
            
            const panel = document.getElementById('debugPanel');
            if (panel) {
                console.log("Hiding panel via close button");
                panel.classList.add('hidden');
                panel.style.transform = 'translateX(100%)';
            }
        });
    } else {
        console.log("Close button not found yet");
    }
}