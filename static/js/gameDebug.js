// gameDebug.js - Connects game events to the debug system

// Create fallback for DataCollection if not loaded
if (typeof DataCollection === 'undefined') {
    console.warn("DataCollection not found, creating fallback");
    window.DataCollection = {
        logSessionStart: function() {},
        logSessionEnd: function() {},
        logWordLoaded: function() {},
        logLetterPlaced: function() {},
        logWordAttempt: function() {}
    };
}

// Create fallback for DebugPanel if not loaded
if (typeof DebugPanel === 'undefined') {
    console.warn("DebugPanel not found, creating fallback");
    window.DebugPanel = {
        updateSessionInfo: function() {},
        updateCurrentWord: function() {},
        updateAttemptInfo: function() {},
        updateSessionStats: function() {},
        updateLettersPlacements: function() {},
        updateLetterConfusion: function() {},
        showMessage: function() {}
    };
}

const GameDebug = (function() {
    // Keep track of session data
    let currentSession = {
        id: generateSessionId(),
        startTime: null,
        words: [],
        letterPlacements: [],
        attempts: []
    };
    
    // Event trackers
    function trackGameSessionStart(sessionData) {
        try {
            currentSession.startTime = sessionData.startTime;
            currentSession.theme = sessionData.theme;
            
            // Send to data collection
            DataCollection.logSessionStart(currentSession);
            
            // Update debug panel
            DebugPanel.updateSessionInfo(currentSession);
        } catch (e) {
            console.error("Error tracking game session start:", e);
        }
    }
    
    function trackGameSessionEnd(sessionData) {
        currentSession.endTime = sessionData.endTime;
        
        // Calculate session stats
        calculateSessionStats();
        
        // Send to data collection
        DataCollection.logSessionEnd(currentSession);
        
        // Update debug panel
        DebugPanel.updateSessionInfo(currentSession);
        DebugPanel.updateSessionStats(currentSession);
        
        // Send session data to server
        saveSessionToServer();
    }
    
    function trackWordLoaded(wordData) {
        const wordEvent = {
            word: wordData.word,
            difficulty: wordData.difficulty,
            timestamp: wordData.timestamp,
            attemptCount: 0,
            completed: false
        };
        
        currentSession.words.push(wordEvent);
        
        // Send to data collection
        DataCollection.logWordLoaded(wordEvent);
        
        // Update debug panel
        DebugPanel.updateCurrentWord(wordEvent);
    }
    
    function trackLetterPlaced(letterData) {
        const letterEvent = {
            letter: letterData.letter,
            position: letterData.position,
            word: letterData.word,
            timestamp: letterData.timestamp
        };
        
        currentSession.letterPlacements.push(letterEvent);
        
        // Send to data collection
        DataCollection.logLetterPlaced(letterEvent);
        
        // Update debug panel
        DebugPanel.updateLettersPlacements(letterEvent);
    }
    
    function trackWordAttempt(attemptData) {
        const attemptEvent = {
            word: attemptData.word,
            userAttempt: attemptData.userAttempt,
            isCorrect: attemptData.isCorrect,
            difficulty: attemptData.difficulty,
            timeTaken: attemptData.timeTaken,
            timestamp: attemptData.timestamp,
            // Analyze letter correctness
            letterAnalysis: analyzeLetterCorrectness(attemptData.word, attemptData.userAttempt)
        };
        
        currentSession.attempts.push(attemptEvent);
        
        // Update the current word's attempt count and completion status
        updateWordStatus(attemptEvent);
        
        // Send to data collection
        DataCollection.logWordAttempt(attemptEvent);
        
        // Update debug panel
        DebugPanel.updateAttemptInfo(attemptEvent);
        DebugPanel.updateLetterConfusion(attemptEvent.letterAnalysis);
    }
    
    // Helper functions
    function generateSessionId() {
        return 'session_' + new Date().getTime() + '_' + Math.floor(Math.random() * 10000);
    }
    
    function analyzeLetterCorrectness(correctWord, userAttempt) {
        const analysis = {
            correctLetters: [],
            incorrectLetters: [],
            confusions: [] // e.g., user typed 'b' instead of 'd'
        };
        
        // Convert to arrays for letter-by-letter comparison
        const correctArr = correctWord.split('');
        const userArr = userAttempt.split('');
        
        // Check each letter
        for (let i = 0; i < correctArr.length; i++) {
            if (i >= userArr.length) {
                // User didn't provide enough letters
                analysis.incorrectLetters.push({
                    expected: correctArr[i],
                    position: i,
                    actual: null
                });
            } else if (correctArr[i] === userArr[i]) {
                // Correct letter
                analysis.correctLetters.push({
                    letter: correctArr[i],
                    position: i
                });
            } else {
                // Incorrect letter
                analysis.incorrectLetters.push({
                    expected: correctArr[i],
                    position: i,
                    actual: userArr[i]
                });
                
                // Record confusion
                analysis.confusions.push({
                    expected: correctArr[i],
                    actual: userArr[i],
                    position: i
                });
            }
        }
        
        // Check if user provided too many letters
        for (let i = correctArr.length; i < userArr.length; i++) {
            analysis.incorrectLetters.push({
                expected: null,
                position: i,
                actual: userArr[i]
            });
        }
        
        return analysis;
    }
    
    function updateWordStatus(attemptEvent) {
        // Find the current word in the session
        const wordEvent = currentSession.words.find(word => 
            word.word === attemptEvent.word && !word.completed);
        
        if (wordEvent) {
            wordEvent.attemptCount++;
            wordEvent.completed = attemptEvent.isCorrect;
        }
    }
    
    function calculateSessionStats() {
        // Calculate overall stats
        currentSession.stats = {
            totalWords: currentSession.words.length,
            completedWords: currentSession.words.filter(w => w.completed).length,
            totalAttempts: currentSession.attempts.length,
            correctAttempts: currentSession.attempts.filter(a => a.isCorrect).length,
            averageAttemptsPerWord: currentSession.attempts.length / currentSession.words.length,
            
            // Success rates by difficulty
            difficultyStats: calculateDifficultyStats(),
            
            // Letter confusion patterns
            letterConfusions: calculateLetterConfusions(),
            
            // Session duration in seconds
            duration: currentSession.endTime 
                ? (new Date(currentSession.endTime) - new Date(currentSession.startTime)) / 1000
                : 0
        };
        
        return currentSession.stats;
    }
    
    function calculateDifficultyStats() {
        const difficultyStats = {};
        
        // Group attempts by difficulty
        currentSession.attempts.forEach(attempt => {
            const difficulty = attempt.difficulty;
            
            if (!difficultyStats[difficulty]) {
                difficultyStats[difficulty] = {
                    total: 0,
                    correct: 0,
                    successRate: 0
                };
            }
            
            difficultyStats[difficulty].total++;
            if (attempt.isCorrect) {
                difficultyStats[difficulty].correct++;
            }
        });
        
        // Calculate success rates
        Object.keys(difficultyStats).forEach(difficulty => {
            const stats = difficultyStats[difficulty];
            stats.successRate = stats.total > 0 
                ? (stats.correct / stats.total) * 100 
                : 0;
        });
        
        return difficultyStats;
    }
    
    function calculateLetterConfusions() {
        const confusions = {};
        
        // Aggregate all letter confusions
        currentSession.attempts.forEach(attempt => {
            if (attempt.letterAnalysis && attempt.letterAnalysis.confusions) {
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
            }
        });
        
        return confusions;
    }
    
    function saveSessionToServer() {
        // Prepare data for sending
        const sessionData = {
            session_id: currentSession.id,
            start_time: currentSession.startTime,
            end_time: currentSession.endTime,
            theme: currentSession.theme,
            words: currentSession.words,
            attempts: currentSession.attempts,
            stats: currentSession.stats
        };
        
        // Send to server
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
            DebugPanel.showMessage('Session data saved successfully');
        })
        .catch(error => {
            console.error('Error saving session:', error);
            DebugPanel.showMessage('Error saving session data', 'error');
        });
    }
    
    function getCSRFToken() {
        return document.querySelector('[name=csrfmiddlewaretoken]').value;
    }
    
    // Public API
    return {
        trackGameSessionStart,
        trackGameSessionEnd,
        trackWordLoaded,
        trackLetterPlaced,
        trackWordAttempt,
        
        // Debug methods
        getCurrentSession: function() {
            return currentSession;
        },
        
        calculateStats: function() {
            return calculateSessionStats();
        }
    };
})();