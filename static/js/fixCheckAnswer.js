// This script patches the checkAnswer function to fix the currentDifficulty error
console.log("Fix checkAnswer script loaded");

// Create a new function to patch the checkAnswer function
function patchCheckAnswerFunction() {
    console.log("Attempting to patch checkAnswer function");
    
    // Check if the original function is available to patch
    if (typeof window.originalCheckAnswer === 'function') {
        console.log("Original checkAnswer function already saved, skipping patch");
        return;
    }
    
    // Try to find the checkAnswer function
    if (typeof checkAnswer === 'function') {
        // Save the original function
        window.originalCheckAnswer = checkAnswer;
        
        // Replace it with our patched version
        window.checkAnswer = function() {
            // Get the user's answer
            const userAnswer = getUserAttempt();
            
            // Check if it's correct
            const isCorrect = userAnswer.toLowerCase() === currentWord.toLowerCase();
            
            if (isCorrect) {
                console.log("[DEBUG] Correct answer detected in checkAnswer (patched):", userAnswer);
                
                // Play correct sound
                if (sounds && sounds.correct) {
                    const correctSound = sounds.correct[Math.floor(Math.random() * sounds.correct.length)];
                    correctSound.play();
                }
                
                // Proceed with correct answer flow
                if (typeof revealAnswerAndFlip === 'function') {
                    revealAnswerAndFlip(currentWord, wordData, usedWords, totalWords, loadNewWordWithReset, false);
                }
            } else {
                console.log("[DEBUG] Incorrect answer detected in checkAnswer (patched):", userAnswer);
                
                // Handle incorrect answer
                if (typeof handleIncorrectAnswer === 'function') {
                    handleIncorrectAnswer(boxes);
                }
            }
            
            // Debug tracking code - Fixed to use wordData instead of currentDifficulty
            if (typeof GameDebug !== 'undefined' && GameDebug.trackWordAttempt) {
                try {
                    // Get difficulty safely from wordData
                    let wordDifficulty = 'medium'; // Default value
                    if (wordData && currentWord && wordData[currentWord] && wordData[currentWord].difficulty) {
                        wordDifficulty = wordData[currentWord].difficulty;
                    }
                    
                    const attemptData = {
                        word: currentWord,
                        userAttempt: userAnswer,
                        isCorrect: isCorrect,
                        difficulty: wordDifficulty,
                        timeTaken: calculateTimeTaken ? calculateTimeTaken() : 0,
                        timestamp: new Date().toISOString()
                    };
                    
                    GameDebug.trackWordAttempt(attemptData);
                    console.log("Debug tracking succeeded with difficulty:", wordDifficulty);
                } catch (e) {
                    console.log("Debug tracking error (patched function):", e);
                }
            }
            
            // Call the original function (optional)
            // window.originalCheckAnswer();
        };
        
        console.log("checkAnswer function patched successfully");
    } else {
        console.log("checkAnswer function not found, cannot patch");
    }
}

// Run patch when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Wait a bit to ensure the original function is loaded
    setTimeout(patchCheckAnswerFunction, 500);
});