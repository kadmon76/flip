// script.js

let registeredUsers = [];
let userData = {};
let username = "";

// Word list with images and audio
const wordData = {
    dog: { image: "/static/images/animals/dog.svg", audio: "/static/sounds/words/dog.mp3" },
    cat: { image: "/static/images/animals/cat.svg", audio: "/static/sounds/words/cat.mp3" },
    fish: { image: "/static/images/animals/fish.svg", audio: "/static/sounds/words/fish.mp3" },
    bird: { image: "/static/images/animals/bird.svg", audio: "/static/sounds/words/bird.mp3" },
    frog: { image: "/static/images/animals/frog.svg", audio: "/static/sounds/words/frog.mp3" }
};

let currentWord = "";
let currentWordAudio = null;

const sounds = {
    correct: [
        new Audio('/static/sounds/correct/correct1.mp3'),
        new Audio('/static/sounds/correct/correct2.mp3')
    ],
    wrong: [
        new Audio('/static/sounds/error/error1.mp3'),
        new Audio('/static/sounds/error/error2.mp3')
    ]
};

const difficultySettings = {
    easy:   { showCorrectLetters: true,  hasWordAudio: true },
    medium: { showCorrectLetters: false, hasWordAudio: true },
    hard:   { showCorrectLetters: false, hasWordAudio: false },
};

// Game stats, starting with 3 lives
let gameStats = { lives: 3 };

const usedWords = new Set();
const totalWords = Object.keys(wordData).length;

/* ======================
   CREATE LETTER BOXES
====================== */
function createLetterBoxes(word) {
    const container = document.querySelector(".letter-boxes-container");
    container.innerHTML = "";
    word.split("").forEach((_, i) => {
        const box = document.createElement("div");
        box.className = "letter-box";
        box.dataset.index = i;
        container.appendChild(box);
    });
}

/* ======================
   CREATE DRAGGABLE LETTERS 
====================== */
function createDraggableLetters(word) {
    const container = document.querySelector(".available-letters-container");
    container.innerHTML = "";
    const shuffledLetters = word.split("").sort(() => Math.random() - 0.5);

    shuffledLetters.forEach(letter => {
        const letterDiv = document.createElement("div");
        letterDiv.className = "draggable-letter";
        letterDiv.textContent = letter;
        container.appendChild(letterDiv);

        Draggable.create(letterDiv, {
            type: "x,y",
            zIndexBoost: true,
            onDragStart: function() {
                // Little rotation for fun
                gsap.to(this.target, { 
                    rotation: 10, 
                    duration: 0.2, 
                    ease: "power1.out" 
                });
            },
            onDrag: function() {
                const letterBoxes = document.querySelectorAll(".letter-box");
                letterBoxes.forEach(box => {
                    if (this.hitTest(box, "50%")) {
                        box.classList.add("box-hovered");
                    } else {
                        box.classList.remove("box-hovered");
                    }
                });
            },
            onDragEnd: function() {
                gsap.to(this.target, { rotation: 0, duration: 0.2 });
                const letterBoxes = document.querySelectorAll(".letter-box");
                const letterContainer = document.querySelector(".available-letters-container");
                
                // Remove hovered states
                letterBoxes.forEach(box => box.classList.remove("box-hovered"));

                let droppedInBox = false;

                // Check if dropped on any letter box
                letterBoxes.forEach(box => {
                    if (this.hitTest(box, "50%")) {
                        box.appendChild(this.target);
                        this.target.classList.add("in-box");
                        gsap.set(this.target, {
                            x: 0,
                            y: 0,
                            position: "relative",
                            left: "0px",
                            top: "0px"
                        });
                        droppedInBox = true;
                        
                        // Tiny bounce animation for the box
                        gsap.fromTo(box, 
                            { y: -5 },
                            { 
                                y: 0, 
                                duration: 0.3, 
                                ease: "bounce.out" 
                            }
                        );
                    }
                });

                // If not dropped in a box, snap back to container
                if (!droppedInBox) {
                    letterContainer.appendChild(this.target);
                    this.target.classList.remove("in-box");
                    gsap.set(this.target, {
                        x: 0,
                        y: 0,
                        position: "relative",
                        left: "0px",
                        top: "0px"
                    });
                }
            }
        });
    });
}

/* ===============
   CHECK ANSWER
=============== */
function checkAnswer() {
    const feedback = document.querySelector("#feedback");
    const boxes = [...document.querySelectorAll(".letter-box")];

    // Check if all boxes are filled
    if (boxes.some(box => !box.textContent)) {
        feedback.textContent = "Please use all letters. We need them all! ✨";
        feedback.className = "feedback child-text";
        return;
    }

    const attempt = boxes.map(box => box.textContent).join("");

    if (attempt === currentWord) {
        feedback.textContent = "Yay! You got it right! ⭐";
        feedback.className = "feedback success child-text";
        playRandomSound(sounds.correct);
        showStarPop();
        showSuccess();
    } else {
        gameStats.lives--;
        feedback.textContent = "Uh oh, try again! ❌";
        feedback.className = "feedback error child-text";
        playRandomSound(sounds.wrong);
        updateLivesDisplay();

        if (gameStats.lives === 0) {
            endGame();
        }
    }
}

/* ===============
   RANDOM SOUND
=============== */
function playRandomSound(soundArray) {
    soundArray[Math.floor(Math.random() * soundArray.length)].play();
}

/* =================
   CONFETTI / STARS
================= */
function showStarPop() {
    const gameContainer = document.querySelector("#game-container");

    for (let i = 0; i < 8; i++) {
        let star = document.createElement("div");
        star.className = "star-confetti";
        star.textContent = "★";
        
        star.style.left = `${50 + Math.random() * 20 - 10}%`;
        star.style.top = `${40 + Math.random() * 20 - 10}%`;
        gameContainer.appendChild(star);

        gsap.fromTo(star,
            { scale: 0, opacity: 1 },
            { 
                scale: 1, 
                opacity: 0, 
                duration: 1.2 + Math.random(), 
                x: (Math.random() - 0.5) * 200, 
                y: (Math.random() - 0.5) * 200, 
                ease: "power2.out",
                onComplete: () => star.remove() 
            }
        );
    }
}

/* ===============
   SHOW SUCCESS
=============== */
function showSuccess() {
    setTimeout(() => {
        currentWord = "";
        loadNewWord();
    }, 1500);
}

/* ===============
   UPDATE LIVES
=============== */
function updateLivesDisplay() {
    // We assume there's a .hearts container with 3 <span> elements
    const hearts = document.querySelectorAll(".hearts span");
    hearts.forEach((heart, i) => {
        heart.textContent = i < gameStats.lives ? "❤️" : "🖤";
    });
}

/* ===============
   END GAME
=============== */
function endGame() {
    // Provide a clear message that the game is over
    const feedback = document.querySelector("#feedback");
    feedback.textContent = "Oh no! No more hearts left. Game Over! 💔";
    feedback.className = "feedback error child-text";

    // Optional: Play an end-game sound if you want
    // endGameSound.play();

    // Disable all draggable elements so user can’t continue playing
    Draggable.getAll().forEach(dragInstance => {
        dragInstance.disable();
    });

    // Also disable the "Check Answer" button
    document.querySelector("#check-btn").disabled = true;

    // Show the "Restart Game" button so the user can start again
    document.querySelector("#restart-btn").style.display = "inline-block";
}

/* ===============
   LOAD NEW WORD
=============== */
function loadNewWord() {
    const feedback = document.querySelector("#feedback");

    if (usedWords.size === totalWords) {
        showGameCompletion();
        return;
    }

    // Find next unused word
    currentWord = Object.keys(wordData).find(word => !usedWords.has(word));
    usedWords.add(currentWord);

    document.querySelector("#card-image").src = wordData[currentWord].image;

    // Clear feedback
    feedback.textContent = "";

    // Create letter boxes & letters for new word
    createLetterBoxes(currentWord);
    createDraggableLetters(currentWord);
}

/* ===============
   REGISTER USER
=============== */
function registerUser() {
    const input = document.querySelector("#username");
    if (input.value) {
        // Registration logic...
    } else {
        document.querySelector("#registration-feedback").textContent = "Enter a username!";
    }
}

/* =====================
   SHOW GAME COMPLETION
===================== */
function showGameCompletion() {
    const gameContainer = document.querySelector("#game-container");
    gameContainer.innerHTML = `<h1>Congratulations! You completed all ${totalWords} words!</h1>`;
}

/* ===============
   FLIP CARD
=============== */
function flipCard() {
    const card = document.querySelector("#card");
    if (!card.classList.contains("flipped")) {
        card.classList.add("flipped");
        loadNewWord();

        // Show hearts and the check button once the game truly starts
        document.querySelector(".hearts").style.display = "block";
        document.querySelector("#check-btn").style.display = "inline-block";
        updateLivesDisplay();
    }
}

/* ===============
   INIT GAME
=============== */
document.addEventListener("DOMContentLoaded", () => {
    // Flip card to start
    document.querySelector("#card").addEventListener("click", flipCard);

    // Check Answer button (initially hidden)
    document.querySelector("#check-btn").addEventListener("click", checkAnswer);

    // Restart button (initially hidden)
    document.querySelector("#restart-btn").addEventListener("click", restartGame);

    // Initialize empty letter boxes (no word before flipping)
    createLetterBoxes("");

    // Hearts will remain hidden until the card is flipped
    // so no call to updateLivesDisplay() here. We'll do it in flipCard.
});
// New function to restart the game
function restartGame() {
    // Reset the card flip
    const card = document.querySelector("#card");
    card.classList.remove("flipped");

    // Clear used words and reset lives
    usedWords.clear();
    gameStats.lives = 3;

    // Re-enable dragging for new game
    Draggable.getAll().forEach(dragInstance => {
        dragInstance.enable();
    });

    // Enable the "Check Answer" button again
    document.querySelector("#check-btn").disabled = false;

    // Hide the restart button and hearts, so the user sees them only when new game starts
    document.querySelector("#restart-btn").style.display = "none";
    document.querySelector(".hearts").style.display = "none";
    document.querySelector("#check-btn").style.display = "none";

    // Clear feedback
    const feedback = document.querySelector("#feedback");
    feedback.textContent = "";

    // Create empty letter boxes again
    createLetterBoxes("");
}