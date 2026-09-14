// This script forcefully creates and manages the debug panel
console.log("Fix Debug Panel script loaded");

document.addEventListener('DOMContentLoaded', function() {
    console.log("Running debug panel fix...");
    
    // Force create the panel if it doesn't exist
    let panel = document.getElementById('debugPanel');
    if (!panel) {
        console.log("Creating debug panel manually");
        
        // Create the panel
        panel = document.createElement('div');
        panel.id = 'debugPanel';
        panel.className = 'debug-panel hidden';
        
        // Basic structure
        panel.innerHTML = `
            <div class="debug-panel-header">
                <h2>Spelling Game Debug Panel</h2>
                <button id="debugPanelClose" class="close-btn">&times;</button>
            </div>
            <div class="debug-panel-tabs">
                <button class="tab-button active" data-tab="session">Current Session</button>
                <button class="tab-button" data-tab="words">Word Stats</button>
                <button class="tab-button" data-tab="letters">Letter Stats</button>
                <button class="tab-button" data-tab="confusions">Letter Confusions</button>
                <button class="tab-button" data-tab="export">Export Data</button>
            </div>
            <div class="debug-panel-content">
                <div id="sessionTab" class="tab-content active">
                    <h3>Current Session</h3>
                    <div id="sessionInfo" class="info-section">
                        <p>No active session</p>
                    </div>
                    
                    <h3>Current Word</h3>
                    <div id="currentWordInfo" class="info-section">
                        <p>No word loaded</p>
                    </div>
                    
                    <h3>Latest Attempt</h3>
                    <div id="latestAttemptInfo" class="info-section">
                        <p>No attempts yet</p>
                    </div>
                    
                    <h3>Session Statistics</h3>
                    <div id="sessionStats" class="info-section">
                        <p>No statistics available</p>
                    </div>
                </div>
                <div id="wordsTab" class="tab-content">
                    <!-- Basic tab content -->
                    <p>Word stats will appear here</p>
                </div>
                <div id="lettersTab" class="tab-content">
                    <!-- Basic tab content -->
                    <p>Letter stats will appear here</p>
                </div>
                <div id="confusionsTab" class="tab-content">
                    <!-- Basic tab content -->
                    <p>Confusion data will appear here</p>
                </div>
                <div id="exportTab" class="tab-content">
                    <!-- Basic tab content -->
                    <p>Export options will appear here</p>
                </div>
            </div>
            <div id="debugMessage" class="debug-message hidden"></div>
        `;
        
        // Add to document
        document.body.appendChild(panel);
        console.log("Debug panel created:", panel);
    }
    
    // Set up the debug button handler properly
    const debugButton = document.getElementById('debugButton');
    if (debugButton) {
        // Remove existing listeners to avoid duplicates
        const newButton = debugButton.cloneNode(true);
        debugButton.parentNode.replaceChild(newButton, debugButton);
        
        // Add our own handler
        newButton.addEventListener('click', function() {
            console.log("Debug button clicked (from fix script)");
            
            panel = document.getElementById('debugPanel');
            if (panel) {
                if (panel.classList.contains('hidden')) {
                    console.log("Showing panel with direct manipulation");
                    panel.classList.remove('hidden');
                    // Force styles to ensure visibility
                    panel.style.transform = 'translateX(0)';
                    panel.style.display = 'flex';
                    panel.style.flexDirection = 'column';
                    panel.style.right = '0';
                    panel.style.visibility = 'visible';
                    panel.style.zIndex = '10000';
                } else {
                    console.log("Hiding panel");
                    panel.classList.add('hidden');
                    panel.style.transform = 'translateX(100%)';
                }
            } else {
                console.log("Panel not found, cannot toggle");
            }
        });
        
        // Add a close button handler
        setTimeout(() => {
            const closeBtn = document.getElementById('debugPanelClose');
            if (closeBtn) {
                closeBtn.addEventListener('click', function() {
                    const panel = document.getElementById('debugPanel');
                    if (panel) {
                        panel.classList.add('hidden');
                        panel.style.transform = 'translateX(100%)';
                    }
                });
            }
        }, 100);
    }
});