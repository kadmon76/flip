// dataCollection.js - Simple version for initial testing

// Ensure this file loads before other debug files
console.log("Loading DataCollection...");

// Create a simplified DataCollection object for testing
const DataCollection = (function() {
    // Basic storage
    const storage = {
        sessions: [],
        words: {},
        letters: {},
        currentSessionId: null
    };
    
    // Basic session tracking
    function logSessionStart(sessionData) {
        console.log("DataCollection: Session started", sessionData);
        storage.currentSessionId = sessionData.id;
        
        const session = {
            id: sessionData.id,
            startTime: sessionData.startTime,
            theme: sessionData.theme,
            words: [],
            attempts: [],
            letterPlacements: []
        };
        
        storage.sessions.push(session);
    }
    
    function logSessionEnd(sessionData) {
        console.log("DataCollection: Session ended", sessionData);
        const session = getCurrentSession();
        
        if (session) {
            session.endTime = sessionData.endTime;
        }
    }
    
    // Word tracking
    function logWordLoaded(wordData) {
        console.log("DataCollection: Word loaded", wordData);
        const session = getCurrentSession();
        
        if (session) {
            session.words.push(wordData);
        }
    }
    
    // Letter tracking
    function logLetterPlaced(letterData) {
        console.log("DataCollection: Letter placed", letterData);
        const session = getCurrentSession();
        
        if (session) {
            session.letterPlacements.push(letterData);
        }
    }
    
    // Word attempt tracking
    function logWordAttempt(attemptData) {
        console.log("DataCollection: Word attempt", attemptData);
        const session = getCurrentSession();
        
        if (session) {
            session.attempts.push(attemptData);
        }
    }
    
    // Helper function
    function getCurrentSession() {
        if (!storage.currentSessionId) return null;
        
        return storage.sessions.find(session => 
            session.id === storage.currentSessionId);
    }
    
    // Public API
    return {
        logSessionStart,
        logSessionEnd,
        logWordLoaded,
        logLetterPlaced,
        logWordAttempt,
        
        // Data retrieval
        getCurrentSession,
        getGlobalWordStats: function() { return storage.words; },
        getGlobalLetterStats: function() { return storage.letters; },
        getAllSessions: function() { return storage.sessions; },
        exportSessionData: function() { 
            const session = getCurrentSession();
            return session ? { session: session } : null;
        }
    };
})();

// Make sure it's globally available
window.DataCollection = DataCollection;
console.log("DataCollection loaded successfully");