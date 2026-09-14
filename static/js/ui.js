// ui.js
// This script contains all functions related to updating and interacting with the user interface.
// Functions here create and manipulate HTML elements, handle animations, and manage the game's visual feedback.

import { playSwipeSound } from './script.js';
/* ======================
   CREATE LETTER BOXES
====================== */


export function createLetterBoxes(word) {
    const container = document.querySelector(".letter-boxes-container");
    container.innerHTML = "";

    const boxWidth = Math.min(window.innerWidth / word.length, 50); // Adjust size
    word.split("").forEach((_, i) => {
        const box = document.createElement("div");
        box.className = "letter-box";
        box.style.width = `${boxWidth}px`;
        box.style.height = `${boxWidth}px`;
        box.dataset.index = i;
        container.appendChild(box);
    });
}

/* ======================
   CREATE DRAGGABLE LETTERS
   ====================== */
   export function createDraggableLetters(word) {
    const container = document.querySelector(".available-letters-container");
    container.innerHTML = "";
    
    // ADD THIS: Force consistent device detection
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    const boxWidth = Math.min(window.innerWidth / word.length, 50);
    word.split("").sort(() => Math.random() - 0.5).forEach(letter => {
        const letterDiv = document.createElement("div");
        letterDiv.className = "draggable-letter";
        letterDiv.textContent = letter;
        letterDiv.style.width = `${boxWidth - 10}px`;
        letterDiv.style.height = `${boxWidth - 10}px`;
        letterDiv.style.fontSize = `${boxWidth / 2}px`;
        container.appendChild(letterDiv);

        // KEEP THIS: Already handling touch events correctly
        letterDiv.addEventListener('touchmove', function(e) {
            e.preventDefault();
        }, { passive: false });
        
        // ADD THIS: Force hardware acceleration consistently
        gsap.set(letterDiv, {
            willChange: "transform",
            z: 0.01,  // Force 3D rendering
            backfaceVisibility: "hidden"
        });

        Draggable.create(letterDiv, {
            // UPDATE THIS: Use consistent event type based on device detection
            type: isTouchDevice ? "touch" : "x,y",
            zIndexBoost: true,
            // ADD THIS: Disable inertia for consistent behavior
            inertia: false,
            dragClickables: true,
            lockAxis: false,
            cursor: "grab",
            // ADD THIS: Prevent context menu
            allowContextMenu: false,
            onPress: function(e) {
                if (e.pointerType === "touch") {
                    e.preventDefault();
                }
                
                gsap.set(this.target, { 
                    zIndex: 100,
                    autoAlpha: 1
                });
                
                this.target.classList.add("gsap-dragging");
                
                // ADD THIS: Add a consistent class on ALL devices
                document.body.classList.add("dragging-active");
                
                if (window.innerWidth <= 768) {
                    document.body.style.overflow = "hidden";
                }
            },
            // Keep your existing onDragStart, onDrag events...
            onDragEnd: function() {
                document.body.classList.remove("letter-dragging");
                // ADD THIS: Remove the consistent class
                document.body.classList.remove("dragging-active");
                this.target.classList.remove("gsap-dragging");
                
                if (window.innerWidth <= 768) {
                    document.body.style.overflow = "auto";
                }
                
                document.querySelectorAll(".letter-box").forEach(box => {
                    box.classList.remove("box-hovered");
                });
                
                gsap.set("#game-container", {
                    position: "relative",
                    top: "auto",
                    left: "auto",
                    xPercent: 0
                });
                
                snapLetterToBox(this.target);
                gsap.set(this.target, { zIndex: "auto" });
            }
        });
    });
}

/* ===============
   SNAP LETTER
=============== */

// Check if snapLetterToBox is firing correctly
export function snapLetterToBox(letterDiv) {
    console.log("Attempting to snap letter to box:", letterDiv.textContent);
    const letterBoxes = document.querySelectorAll(".letter-box");
    const letterContainer = document.querySelector(".available-letters-container");

    let droppedInBox = false;

    letterBoxes.forEach(box => {
        if (Draggable.hitTest(letterDiv, box, "50%") && box.children.length === 0) {
            console.log("Letter dropped in box:", letterDiv.textContent);
            box.appendChild(letterDiv);
            letterDiv.classList.add("in-box");
            gsap.set(letterDiv, { x: 0, y: 0, position: "relative" });
            droppedInBox = true;
            playSwipeSound(); // Play swipe sound on successful drop
            
            // Data collection for letter placement
            if (window.dataCollector && window.currentWord) {
                const position = parseInt(box.dataset.index, 10);
                const expectedLetter = window.currentWord[position];
                const placedLetter = letterDiv.textContent;
                
                // Calculate time taken if we recorded start time
                let timeTaken = null;
                if (letterDiv.dataset.dragStartTime) {
                    timeTaken = (Date.now() - letterDiv.dataset.dragStartTime) / 1000; // In seconds
                    delete letterDiv.dataset.dragStartTime; // Clean up
                }
                
                // Track this letter placement if trackLetterPlacement function exists
                if (typeof window.trackLetterPlacement === 'function') {
                    window.trackLetterPlacement(position, expectedLetter, placedLetter, timeTaken);
                }
            }
        }
    });

    if (!droppedInBox) {
        console.log("Letter returned to container:", letterDiv.textContent);
        letterContainer.appendChild(letterDiv);
        letterDiv.classList.remove("in-box");
        gsap.set(letterDiv, { x: 0, y: 0, position: "relative" });
        // Clear drag start time if we recorded it
        if (letterDiv.dataset.dragStartTime) {
            delete letterDiv.dataset.dragStartTime;
        }
    }
}


/* ===============
   UPDATE LIFE BAR
=============== */
export function updateLifeBar(gameStats) {
    console.log("Updating life bar. Attempts left:", gameStats.attempts);
    const hearts = document.querySelectorAll(".hearts span");
    hearts.forEach((heart, index) => {
        heart.textContent = index < gameStats.attempts ? "❤️" : "🖤";
    });
}

/* ===============
   REVEAL ANSWER AND FLIP
=============== */
export function revealAnswerAndFlip(currentWord, wordData, usedWords, totalWords, loadNewWordWithReset, playSound = true) {
    console.log("[DEBUG] revealAnswerAndFlip triggered for:", currentWord);

    const boxes = document.querySelectorAll(".letter-box");
    boxes.forEach((box, i) => {
        box.textContent = currentWord[i];
        gsap.to(box, { y: -10, duration: 0.5, ease: "bounce.out" });
    });

    if (playSound && wordData[currentWord]?.audio) {
        const wordAudio = new Audio(wordData[currentWord].audio);
        console.log(`[DEBUG] Word audio triggered. Function: revealAnswerAndFlip, Sound: ${wordAudio.src}`);
        wordAudio.play();
    }

    setTimeout(() => {
        if (usedWords.size < totalWords) {
            loadNewWordWithReset();
        } else {
            console.log("All words completed. Showing completion message.");
            showGameCompletion();
        }
    }, 2500); // Added more time to observe the word
}

/* ===============
   SHOW GAME COMPLETION
=============== */
export function showGameCompletion() {
    console.log("Game completed! Displaying congratulations message.");
    const feedback = document.querySelector("#feedback");
    feedback.textContent = "Congratulations! You've completed the game!";
    feedback.className = "feedback success child-text";

    // Add confetti effect
    for (let i = 0; i < 100; i++) {
        const star = document.createElement("div");
        star.className = "star-confetti";
        star.style.left = `${Math.random() * 100}%`;
        star.style.top = `${Math.random() * 100}%`;
        document.body.appendChild(star);

        setTimeout(() => {
            star.remove();
        }, 5000); // Remove confetti after 5 seconds
    }

    // Add restart button with a unique ID
    const checkBtn = document.querySelector("#check-btn");
    if (checkBtn) checkBtn.style.display = "none";

    const restartButton = document.createElement("button");
    restartButton.textContent = "Restart Game";
    restartButton.id = "restart-btn"; // Unique ID for restart button
    restartButton.onclick = restartGame;
    document.querySelector("#game-container").appendChild(restartButton);
    
    // End game session if data collection is active
    if (typeof window.endGameSession === 'function') {
        window.endGameSession();
    }
}

/* ===============
   EVENT HANDLERS
=============== */
export function setupCardClickHandler(flipCard) {
    const card = document.querySelector("#card");
    if (card) {
        card.addEventListener("click", function (event) {
            console.log("Card clicked. Event:", event);
            flipCard();
        });
    }
}

export function setupCheckButtonHandler(checkAnswer, lockCorrectLetters) {
    const checkButton = document.querySelector("#check-btn");
    if (checkButton) {
        checkButton.addEventListener("click", () => {
            console.log("Checking answer...");
            checkAnswer();
            lockCorrectLetters();
        });
    }
}


/**
 * Resize and animate letter boxes and letters dynamically based on screen size.
 * Ensure the word and the letter boxes stay on one line.
 * Maintain the square shape of empty letter boxes.
 * If the letters become too small, exclude the word.
 * @param {string} word - The current word being displayed.
 */
 export function resizeLetterBoxesAndLetters(word) {
    const container = document.querySelector(".letter-boxes-container");
    const letterContainer = document.querySelector(".available-letters-container");

    const maxBoxWidth = Math.min(window.innerWidth / word.length, 50);
    const minBoxWidth = 30;

    if (maxBoxWidth < minBoxWidth) {
        console.warn(`Word '${word}' is too long to fit on the screen. Skipping...`);
        container.innerHTML = "<p class='error-message'>This word is too long for the screen size.</p>";
        return;
    }

    container.style.display = "flex";
    container.style.flexWrap = "nowrap";
    container.style.justifyContent = "center";

    const boxes = container.querySelectorAll(".letter-box");
    boxes.forEach(box => {
        box.style.flex = "0 0 auto"; // Prevent flex shrinking
        box.style.width = `${maxBoxWidth}px`;
        box.style.height = `${maxBoxWidth}px`;
        box.style.lineHeight = `${maxBoxWidth}px`; // Center content vertically
        box.style.aspectRatio = "1 / 1"; // Force square shape
    });

    gsap.to(boxes, {
        fontSize: maxBoxWidth / 2,
        duration: 0.5,
        ease: "power1.out",
    });

    const letters = letterContainer.querySelectorAll(".draggable-letter");
    gsap.to(letters, {
        width: maxBoxWidth - 10,
        height: maxBoxWidth - 10,
        fontSize: maxBoxWidth / 2.5,
        duration: 0.5,
        ease: "power1.out",
    });
}
/**
 * Scale the entire game container to fit the screen size dynamically.
 */
 export function scaleGameToFitScreen() {
    const gameContainer = document.querySelector("#game-container");
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    // Calculate scaling factor
    const scale = Math.min(screenWidth / gameContainer.offsetWidth, screenHeight / gameContainer.offsetHeight);

    // Apply scaling using GSAP
    gsap.to(gameContainer, {
        scale: scale,
        transformOrigin: "center top",
        duration: 0.5,
    });
}