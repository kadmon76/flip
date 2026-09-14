// static/js/debugPanel.js
console.log("Debug panel script loaded");
// debugPanel.js - Debug panel UI and functionality

// Create fallback for DataCollection if not loaded
if (typeof DataCollection === 'undefined') {
    console.warn("DataCollection not found, creating fallback");
    window.DataCollection = {
        getCurrentSession: function() { return null; },
        getGlobalWordStats: function() { return {}; },
        getGlobalLetterStats: function() { return {}; },
        getAllSessions: function() { return []; },
        exportSessionData: function() { return null; }
    };
}
const DebugPanel = (function() {
    // Panel elements
    let panel, closeBtn, tabButtons, tabContents;
    let isInitialized = false;
    
    // Initialize the panel
    function initialize() {
        console.log("DebugPanel initialize called");
        if (isInitialized) {
            console.log("DebugPanel already initialized, skipping");
            return;
        }
        
        createPanelElements();
        setupEventListeners();
        
        isInitialized = true;
        console.log('Debug panel initialized successfully');
    }
    
    // Create panel DOM elements
    function createPanelElements() {
        // Create main panel container if it doesn't exist
        panel = document.getElementById('debugPanel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'debugPanel';
            panel.className = 'debug-panel hidden';
            document.body.appendChild(panel);
        }
        
        // Create panel content
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
                <!-- Session Tab -->
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
                
                <!-- Words Tab -->
                <div id="wordsTab" class="tab-content">
                    <h3>Word Performance</h3>
                    <div class="difficulty-filter">
                        <label>Filter by difficulty:</label>
                        <select id="difficultyFilter">
                            <option value="all">All</option>
                            <option value="easy">Easy</option>
                            <option value="medium">Medium</option>
                            <option value="hard">Hard</option>
                        </select>
                    </div>
                    <div id="wordStats" class="data-table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Word</th>
                                    <th>Difficulty</th>
                                    <th>Attempts</th>
                                    <th>Success Rate</th>
                                    <th>Avg. Time</th>
                                </tr>
                            </thead>
                            <tbody id="wordStatsBody">
                                <tr>
                                    <td colspan="5">No word data available</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <!-- Letters Tab -->
                <div id="lettersTab" class="tab-content">
                    <h3>Letter Performance</h3>
                    <div id="letterStats" class="data-table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Letter</th>
                                    <th>Placement Count</th>
                                    <th>Error Count</th>
                                    <th>Error Rate</th>
                                </tr>
                            </thead>
                            <tbody id="letterStatsBody">
                                <tr>
                                    <td colspan="4">No letter data available</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    
                    <h3>Letter Heatmap</h3>
                    <div id="letterHeatmap" class="letter-heatmap">
                        <!-- Alphabet heatmap will be generated here -->
                    </div>
                </div>
                
                <!-- Confusions Tab -->
                <div id="confusionsTab" class="tab-content">
                    <h3>Letter Confusion Patterns</h3>
                    <div id="letterConfusions" class="data-table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Expected</th>
                                    <th>Actual</th>
                                    <th>Count</th>
                                    <th>Common Positions</th>
                                </tr>
                            </thead>
                            <tbody id="confusionsBody">
                                <tr>
                                    <td colspan="4">No confusion data available</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    
                    <h3>Confusion Matrix</h3>
                    <div id="confusionMatrix" class="confusion-matrix">
                        <!-- Confusion matrix will be generated here -->
                    </div>
                </div>
                
                <!-- Export Tab -->
                <div id="exportTab" class="tab-content">
                    <h3>Export Session Data</h3>
                    <p>Export the current session data for analysis or debugging.</p>
                    <button id="exportJsonBtn" class="export-btn">Export as JSON</button>
                    <button id="exportCsvBtn" class="export-btn">Export as CSV</button>
                    
                    <h3>Send to Server</h3>
                    <p>Send the current session data to the server for storage.</p>
                    <button id="sendToServerBtn" class="export-btn">Send to Server</button>
                    
                    <div id="exportOutput" class="export-output">
                        <pre>No data exported yet</pre>
                    </div>
                </div>
            </div>
            
            <div id="debugMessage" class="debug-message hidden"></div>
        `;
        
        // Set references to buttons and content areas
        closeBtn = document.getElementById('debugPanelClose');
        tabButtons = document.querySelectorAll('.tab-button');
        tabContents = document.querySelectorAll('.tab-content');
        
        // Create letter heatmap
        createLetterHeatmap();
    }
    
    // Set up event listeners
    function setupEventListeners() {
        // Close button
        closeBtn.addEventListener('click', hidePanel);
        
        // Tab switching
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabName = button.getAttribute('data-tab');
                switchTab(tabName);
            });
        });
        
        // Export buttons
        document.getElementById('exportJsonBtn').addEventListener('click', () => {
            exportData('json');
        });
        
        document.getElementById('exportCsvBtn').addEventListener('click', () => {
            exportData('csv');
        });
        
        document.getElementById('sendToServerBtn').addEventListener('click', () => {
            sendDataToServer();
        });
        
        // Difficulty filter
        document.getElementById('difficultyFilter').addEventListener('change', (e) => {
            filterWordStatsByDifficulty(e.target.value);
        });
    }
    
    // Create letter heatmap display
    function createLetterHeatmap() {
        const heatmapContainer = document.getElementById('letterHeatmap');
        const alphabet = 'abcdefghijklmnopqrstuvwxyz';
        
        heatmapContainer.innerHTML = '';
        
        alphabet.split('').forEach(letter => {
            const letterBox = document.createElement('div');
            letterBox.className = 'letter-box';
            letterBox.dataset.letter = letter;
            letterBox.textContent = letter;
            heatmapContainer.appendChild(letterBox);
        });
    }
    
    // Create confusion matrix display
    function createConfusionMatrix(confusions) {
        const matrixContainer = document.getElementById('confusionMatrix');
        const alphabet = 'abcdefghijklmnopqrstuvwxyz';
        
        // Clear container
        matrixContainer.innerHTML = '';
        
        // Create header row
        const headerRow = document.createElement('div');
        headerRow.className = 'matrix-row header-row';
        
        const cornerCell = document.createElement('div');
        cornerCell.className = 'matrix-cell corner-cell';
        cornerCell.textContent = '↓Expected / Actual→';
        headerRow.appendChild(cornerCell);
        
        alphabet.split('').forEach(letter => {
            const headerCell = document.createElement('div');
            headerCell.className = 'matrix-cell header-cell';
            headerCell.textContent = letter;
            headerRow.appendChild(headerCell);
        });
        
        matrixContainer.appendChild(headerRow);
        
        // Create data rows
        alphabet.split('').forEach(expectedLetter => {
            const row = document.createElement('div');
            row.className = 'matrix-row';
            
            const rowHeader = document.createElement('div');
            rowHeader.className = 'matrix-cell row-header';
            rowHeader.textContent = expectedLetter;
            row.appendChild(rowHeader);
            
            alphabet.split('').forEach(actualLetter => {
                const cell = document.createElement('div');
                cell.className = 'matrix-cell';
                
                // Key format used in confusions object
                const confusionKey = `${expectedLetter}->${actualLetter}`;
                const confusionCount = confusions[confusionKey] ? confusions[confusionKey].count : 0;
                
                if (confusionCount > 0) {
                    cell.textContent = confusionCount;
                    // Add heat based on count (adjust scale as needed)
                    const intensity = Math.min(confusionCount * 25, 255);
                    cell.style.backgroundColor = `rgba(255, 0, 0, ${intensity / 255})`;
                }
                
                row.appendChild(cell);
            });
            
            matrixContainer.appendChild(row);
        });
    }
    
    // Show/hide panel
    function showPanel() {
        panel.classList.remove('hidden');
        refreshAllData();
    }
    
    function hidePanel() {
        panel.classList.add('hidden');
    }
    
    function togglePanel() {
        console.log("Toggle panel called, current hidden state:", panel.classList.contains('hidden'));
        
        if (panel.classList.contains('hidden')) {
            console.log("Panel is hidden, showing it now");
            panel.classList.remove('hidden');
            console.log("After toggle, panel classes:", panel.className);
        } else {
            console.log("Panel is visible, hiding it now");
            panel.classList.add('hidden');
            console.log("After toggle, panel classes:", panel.className);
        }
        
        // Force a reflow by accessing offsetHeight
        panel.offsetHeight;
        
        console.log("Panel style transform:", window.getComputedStyle(panel).transform);
    }
    
    // Switch between tabs
    function switchTab(tabName) {
        // Update active tab button
        tabButtons.forEach(button => {
            if (button.getAttribute('data-tab') === tabName) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
        
        // Update active tab content
        tabContents.forEach(content => {
            if (content.id === `${tabName}Tab`) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });
        
        // Refresh data for the tab
        refreshTabData(tabName);
    }
    
    // Refresh data for a specific tab
    function refreshTabData(tabName) {
        switch (tabName) {
            case 'session':
                refreshSessionData();
                break;
            case 'words':
                refreshWordStats();
                break;
            case 'letters':
                refreshLetterStats();
                break;
            case 'confusions':
                refreshConfusionData();
                break;
            case 'export':
                refreshExportData();
                break;
        }
    }
    
    // Refresh all data in the panel
    function refreshAllData() {
        refreshSessionData();
        refreshWordStats();
        refreshLetterStats();
        refreshConfusionData();
        refreshExportData();
    }
    
    // Update session info display
    function updateSessionInfo(sessionData) {
        const sessionInfo = document.getElementById('sessionInfo');
        
        if (!sessionData) {
            sessionInfo.innerHTML = '<p>No active session</p>';
            return;
        }
        
        const startTime = new Date(sessionData.startTime);
        const endTime = sessionData.endTime ? new Date(sessionData.endTime) : null;
        const duration = endTime 
            ? ((endTime - startTime) / 1000).toFixed(1) 
            : ((new Date() - startTime) / 1000).toFixed(1);
        
        sessionInfo.innerHTML = `
            <div class="info-grid">
                <div class="info-label">Session ID:</div>
                <div class="info-value">${sessionData.id}</div>
                
                <div class="info-label">Theme:</div>
                <div class="info-value">${sessionData.theme || 'Not specified'}</div>
                
                <div class="info-label">Start Time:</div>
                <div class="info-value">${startTime.toLocaleTimeString()}</div>
                
                <div class="info-label">Duration:</div>
                <div class="info-value">${duration} seconds</div>
                
                <div class="info-label">Status:</div>
                <div class="info-value">${endTime ? 'Completed' : 'Active'}</div>
            </div>
        `;
    }
    
    // Update current word info display
    function updateCurrentWord(wordData) {
        const currentWordInfo = document.getElementById('currentWordInfo');
        
        if (!wordData) {
            currentWordInfo.innerHTML = '<p>No word loaded</p>';
            return;
        }
        
        currentWordInfo.innerHTML = `
            <div class="info-grid">
                <div class="info-label">Word:</div>
                <div class="info-value">${wordData.word}</div>
                
                <div class="info-label">Difficulty:</div>
                <div class="info-value">${wordData.difficulty}</div>
                
                <div class="info-label">Letter Count:</div>
                <div class="info-value">${wordData.word.length}</div>
            </div>
        `;
    }
    
    // Update attempt info display
    function updateAttemptInfo(attemptData) {
        const latestAttemptInfo = document.getElementById('latestAttemptInfo');
        
        if (!attemptData) {
            latestAttemptInfo.innerHTML = '<p>No attempts yet</p>';
            return;
        }
        
        const timestamp = new Date(attemptData.timestamp);
        
        latestAttemptInfo.innerHTML = `
            <div class="info-grid">
                <div class="info-label">Word:</div>
                <div class="info-value">${attemptData.word}</div>
                
                <div class="info-label">User Attempt:</div>
                <div class="info-value">${attemptData.userAttempt}</div>
                
                <div class="info-label">Success:</div>
                <div class="info-value ${attemptData.isCorrect ? 'success' : 'error'}">
                    ${attemptData.isCorrect ? 'Correct' : 'Incorrect'}
                </div>
                
                <div class="info-label">Time Taken:</div>
                <div class="info-value">${attemptData.timeTaken ? attemptData.timeTaken.toFixed(1) + ' sec' : 'N/A'}</div>
                
                <div class="info-label">Timestamp:</div>
                <div class="info-value">${timestamp.toLocaleTimeString()}</div>
            </div>
            
            <h4>Letter Analysis</h4>
            ${generateLetterAnalysisHTML(attemptData.letterAnalysis)}
        `;
    }
    
    // Generate HTML for letter analysis
    function generateLetterAnalysisHTML(analysis) {
        if (!analysis) return '<p>No letter analysis available</p>';
        
        const correctCount = analysis.correctLetters ? analysis.correctLetters.length : 0;
        const incorrectCount = analysis.incorrectLetters ? analysis.incorrectLetters.length : 0;
        const totalLetters = correctCount + incorrectCount;
        const accuracy = totalLetters > 0 ? ((correctCount / totalLetters) * 100).toFixed(1) : 0;
        
        let html = `
            <div class="letter-analysis-summary">
                <div class="analysis-stat">
                    <span class="stat-value">${correctCount}/${totalLetters}</span>
                    <span class="stat-label">Letters Correct</span>
                </div>
                <div class="analysis-stat">
                    <span class="stat-value">${accuracy}%</span>
                    <span class="stat-label">Accuracy</span>
                </div>
            </div>
            
            <div class="letter-comparison">
        `;
        
        // Show each letter with correct/incorrect indicators
        for (let i = 0; i < totalLetters; i++) {
            const correct = analysis.correctLetters.find(l => l.position === i);
            const incorrect = analysis.incorrectLetters.find(l => l.position === i);
            
            if (correct) {
                html += `<span class="letter correct">${correct.letter}</span>`;
            } else if (incorrect) {
                html += `
                    <span class="letter incorrect" title="${incorrect.expected} → ${incorrect.actual || 'missing'}">
                        ${incorrect.actual || '_'}
                    </span>
                `;
            }
        }
        
        html += '</div>';
        return html;
    }
    
    // Update letter placements display
    function updateLettersPlacements(letterData) {
        // This function could be used to show real-time letter placements
        // For now, we'll handle this data in the letter stats refresh
    }
    
    // Update letter confusion patterns display
    function updateLetterConfusion(letterAnalysis) {
        // This function updates confusion data when new attempts are made
        // Actual display refresh happens in refreshConfusionData()
    }
    
    // Update session statistics display
    function updateSessionStats(sessionData) {
        const sessionStats = document.getElementById('sessionStats');
        
        if (!sessionData || !sessionData.stats) {
            sessionStats.innerHTML = '<p>No statistics available</p>';
            return;
        }
        
        const stats = sessionData.stats;
        
        // Format stats for display
        sessionStats.innerHTML = `
            <div class="stats-cards">
                <div class="stat-card">
                    <div class="stat-value">${stats.totalWords}</div>
                    <div class="stat-label">Words Attempted</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.correctAttempts}/${stats.totalAttempts}</div>
                    <div class="stat-label">Correct Attempts</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.successRate ? stats.successRate.toFixed(1) + '%' : '0%'}</div>
                    <div class="stat-label">Success Rate</div>
                </div>
            </div>
            
            <h4>Performance by Difficulty</h4>
            <div class="data-table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Difficulty</th>
                            <th>Attempts</th>
                            <th>Correct</th>
                            <th>Success Rate</th>
                            <th>Avg. Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${generateDifficultyStatsHTML(stats.difficultyStats)}
                    </tbody>
                </table>
            </div>
        `;
    }
    
    // Generate HTML for difficulty stats
    function generateDifficultyStatsHTML(difficultyStats) {
        if (!difficultyStats || Object.keys(difficultyStats).length === 0) {
            return '<tr><td colspan="5">No difficulty data available</td></tr>';
        }
        
        let html = '';
        
        Object.keys(difficultyStats).forEach(difficulty => {
            const stats = difficultyStats[difficulty];
            html += `
                <tr>
                    <td>${difficulty}</td>
                    <td>${stats.total}</td>
                    <td>${stats.correct}</td>
                    <td>${stats.successRate.toFixed(1)}%</td>
                    <td>${stats.averageTime ? stats.averageTime.toFixed(1) + 's' : 'N/A'}</td>
                </tr>
            `;
        });
        
        return html;
    }
    
    // Refresh session data tab
// Find the refreshSessionData function and update it like this:
function refreshSessionData() {
    try {
        // Get the current session data from DataCollection
        const sessionData = DataCollection.getCurrentSession();
        
        // Update session info
        updateSessionInfo(sessionData);
        
        // Update current word - get from last word in session
        if (sessionData && sessionData.words && sessionData.words.length > 0) {
            updateCurrentWord(sessionData.words[sessionData.words.length - 1]);
        } else {
            updateCurrentWord(null);
        }
        
        // Update latest attempt - get from last attempt in session
        if (sessionData && sessionData.attempts && sessionData.attempts.length > 0) {
            updateAttemptInfo(sessionData.attempts[sessionData.attempts.length - 1]);
        } else {
            updateAttemptInfo(null);
        }
        
        // Update session stats if session is active
        if (sessionData && typeof GameDebug !== 'undefined' && GameDebug.calculateStats) {
            // Calculate fresh stats
            const stats = GameDebug.calculateStats();
            updateSessionStats({ stats: stats });
        } else {
            updateSessionStats(null);
        }
    } catch (e) {
        console.error("Error refreshing session data:", e);
        // Fallback to empty displays
        updateSessionInfo(null);
        updateCurrentWord(null);
        updateAttemptInfo(null);
        updateSessionStats(null);
    }
}
    
    // Refresh word stats tab
    function refreshWordStats() {
        const wordStats = DataCollection.getGlobalWordStats();
        const wordStatsBody = document.getElementById('wordStatsBody');
        
        if (!wordStats || Object.keys(wordStats).length === 0) {
            wordStatsBody.innerHTML = '<tr><td colspan="5">No word data available</td></tr>';
            return;
        }
        
        // Get the current filter value
        const difficultyFilter = document.getElementById('difficultyFilter').value;
        
        // Apply filter and generate HTML
        let html = '';
        
        Object.values(wordStats).forEach(word => {
            // Apply difficulty filter
            if (difficultyFilter !== 'all' && word.difficulty !== difficultyFilter) {
                return;
            }
            
            html += `
                <tr>
                    <td>${word.word}</td>
                    <td>${word.difficulty}</td>
                    <td>${word.totalAttempts}</td>
                    <td>${word.successRate.toFixed(1)}%</td>
                    <td>${word.averageTime.toFixed(1)}s</td>
                </tr>
            `;
        });
        
        if (html === '') {
            html = `<tr><td colspan="5">No words with difficulty '${difficultyFilter}'</td></tr>`;
        }
        
        wordStatsBody.innerHTML = html;
    }
    
    // Filter word stats by difficulty
    function filterWordStatsByDifficulty(difficulty) {
        refreshWordStats();
    }
    
    // Refresh letter stats tab
    function refreshLetterStats() {
        const letterStats = DataCollection.getGlobalLetterStats();
        const letterStatsBody = document.getElementById('letterStatsBody');
        
        if (!letterStats || Object.keys(letterStats).length === 0) {
            letterStatsBody.innerHTML = '<tr><td colspan="4">No letter data available</td></tr>';
            updateLetterHeatmap({});
            return;
        }
        
        // Generate table HTML
        let html = '';
        
        Object.values(letterStats).forEach(letter => {
            const errorRate = letter.placementCount > 0 
                ? ((letter.errorCount / letter.placementCount) * 100).toFixed(1) 
                : '0.0';
                
            html += `
                <tr>
                    <td>${letter.letter}</td>
                    <td>${letter.placementCount}</td>
                    <td>${letter.errorCount}</td>
                    <td>${errorRate}%</td>
                </tr>
            `;
        });
        
        letterStatsBody.innerHTML = html;
        
        // Update heatmap
        updateLetterHeatmap(letterStats);
    }
    
    // Update letter heatmap
    function updateLetterHeatmap(letterStats) {
        const letterBoxes = document.querySelectorAll('.letter-box');
        
        // Reset all letter boxes
        letterBoxes.forEach(box => {
            box.style.backgroundColor = '';
            box.classList.remove('has-data');
        });
        
        // If no data, return
        if (!letterStats || Object.keys(letterStats).length === 0) {
            return;
        }
        
        // Find max error rate for scaling
        let maxErrorRate = 0;
        Object.values(letterStats).forEach(letter => {
            const errorRate = letter.placementCount > 0 
                ? (letter.errorCount / letter.placementCount) * 100 
                : 0;
                
            maxErrorRate = Math.max(maxErrorRate, errorRate);
        });
        
        // Update letter boxes with heat colors
        letterBoxes.forEach(box => {
            const letter = box.dataset.letter;
            
            if (letterStats[letter]) {
                const stats = letterStats[letter];
                const errorRate = stats.placementCount > 0 
                    ? (stats.errorCount / stats.placementCount) * 100 
                    : 0;
                
                // Only color if there's data
                if (stats.placementCount > 0) {
                    // Scale color intensity based on error rate
                    const intensity = maxErrorRate > 0 
                        ? (errorRate / maxErrorRate) * 255 
                        : 0;
                    
                    box.style.backgroundColor = `rgba(255, ${255 - intensity}, ${255 - intensity}, 1)`;
                    box.classList.add('has-data');
                    
                    // Add tooltip with stats
                    box.title = `${letter.toUpperCase()}: ${stats.placementCount} uses, ${stats.errorCount} errors (${errorRate.toFixed(1)}% error rate)`;
                }
            }
        });
    }
    
    // Refresh confusion data tab
    function refreshConfusionData() {
        // Get all sessions to aggregate confusion data
        const sessions = DataCollection.getAllSessions();
        
        if (!sessions || sessions.length === 0) {
            document.getElementById('confusionsBody').innerHTML = 
                '<tr><td colspan="4">No confusion data available</td></tr>';
            return;
        }
        
        // Aggregate confusion data from all sessions
        const confusions = {};
        
        sessions.forEach(session => {
            if (!session.attempts) return;
            
            session.attempts.forEach(attempt => {
                if (!attempt.letterAnalysis || !attempt.letterAnalysis.confusions) return;
                
                attempt.letterAnalysis.confusions.forEach(confusion => {
                    const key = `${confusion.expected}->${confusion.actual}`;
                    
                    if (!confusions[key]) {
                        confusions[key] = {
                            expected: confusion.expected,
                            actual: confusion.actual,
                            count: 0,
                            positions: {}
                        };
                    }
                    
                    confusions[key].count++;
                    
                    // Track position-specific confusions
                    const posKey = `pos_${confusion.position}`;
                    confusions[key].positions[posKey] = 
                        (confusions[key].positions[posKey] || 0) + 1;
                });
            });
        });
        
        // Update confusions table
        updateConfusionsTable(confusions);
        
        // Update confusion matrix
        createConfusionMatrix(confusions);
    }
    
    // Update confusions table
    function updateConfusionsTable(confusions) {
        const confusionsBody = document.getElementById('confusionsBody');
        
        if (!confusions || Object.keys(confusions).length === 0) {
            confusionsBody.innerHTML = '<tr><td colspan="4">No confusion data available</td></tr>';
            return;
        }
        
        // Sort confusions by count (highest first)
        const sortedConfusions = Object.values(confusions).sort((a, b) => b.count - a.count);
        
        let html = '';
        
        sortedConfusions.forEach(confusion => {
            // Format positions data
            const positionsArr = [];
            Object.keys(confusion.positions).forEach(posKey => {
                const position = posKey.replace('pos_', '');
                const count = confusion.positions[posKey];
                positionsArr.push(`Pos ${position}: ${count}`);
            });
            
            html += `
                <tr>
                    <td>${confusion.expected}</td>
                    <td>${confusion.actual}</td>
                    <td>${confusion.count}</td>
                    <td>${positionsArr.join(', ')}</td>
                </tr>
            `;
        });
        
        confusionsBody.innerHTML = html;
    }
    
    // Refresh export data tab
    function refreshExportData() {
        // For now, just show a placeholder in the export output
        document.getElementById('exportOutput').innerHTML = 
            '<pre>Click an export button to generate data</pre>';
    }
    
    // Export data functions
    function exportData(format) {
        const sessionData = DataCollection.exportSessionData();
        
        if (!sessionData) {
            showMessage('No session data available to export', 'error');
            return;
        }
        
        const exportOutput = document.getElementById('exportOutput');
        
        if (format === 'json') {
            // Format the JSON with indentation for readability
            const jsonOutput = JSON.stringify(sessionData, null, 2);
            exportOutput.innerHTML = `<pre>${jsonOutput}</pre>`;
            
            // Provide download option
            downloadData(jsonOutput, 'spelling_session.json', 'application/json');
            
        } else if (format === 'csv') {
            // Create CSV format for the main session data
            let csvOutput = 'Session Data:\n';
            csvOutput += 'ID,Start Time,End Time,Theme,Duration (ms)\n';
            csvOutput += `${sessionData.session.id},${sessionData.session.startTime},${sessionData.session.endTime},${sessionData.session.theme},${sessionData.session.duration}\n\n`;
            
            // Add word attempts
            csvOutput += 'Word Attempts:\n';
            csvOutput += 'Word,User Attempt,Is Correct,Difficulty,Time Taken,Timestamp\n';
            
            sessionData.attempts.forEach(attempt => {
                csvOutput += `"${attempt.word}","${attempt.userAttempt}",${attempt.isCorrect},${attempt.difficulty},${attempt.timeTaken},${attempt.timestamp}\n`;
            });
            
            exportOutput.innerHTML = `<pre>${csvOutput}</pre>`;
            
            // Provide download option
            downloadData(csvOutput, 'spelling_session.csv', 'text/csv');
        }
        
        showMessage(`Data exported as ${format.toUpperCase()}`, 'success');
    }
    
    // Download data as a file
    function downloadData(data, filename, type) {
        const blob = new Blob([data], { type: type });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }
    
    // Send data to server
    function sendDataToServer() {
        const sessionData = DataCollection.exportSessionData();
        
        if (!sessionData) {
            showMessage('No session data available to send', 'error');
            return;
        }
        
        fetch('/spelling-game/debug/save-session/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken()
            },
            body: JSON.stringify(sessionData)
        })
        .then(response => response.json())
        .then(data => {
            console.log('Session saved:', data);
            showMessage('Session data saved successfully', 'success');
        })
        .catch(error => {
            console.error('Error saving session:', error);
            showMessage('Error saving session data', 'error');
        });
    }
    
    // Get Django CSRF token
    function getCSRFToken() {
        return document.querySelector('[name=csrfmiddlewaretoken]').value;
    }
    
    // Show message in the debug panel
    function showMessage(message, type = 'info') {
        const messageElement = document.getElementById('debugMessage');
        messageElement.textContent = message;
        messageElement.className = `debug-message ${type}`;
        messageElement.classList.remove('hidden');
        
        // Auto-hide after a few seconds
        setTimeout(() => {
            messageElement.classList.add('hidden');
        }, 3000);
    }
    
    // Public API
    return {
        initialize,
        showPanel,
        hidePanel,
        togglePanel,
        
        // Update methods
        updateSessionInfo,
        updateCurrentWord,
        updateAttemptInfo,
        updateLettersPlacements,
        updateLetterConfusion,
        updateSessionStats,
        
        // Utility methods
        showMessage
    };
})();