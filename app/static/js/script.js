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
    ],
};

const difficultySettings = {
    easy:   { showCorrectLetters: true, hasWordAudio: true },
    medium: { showCorrectLetters: false, hasWordAudio: true },
    hard:   { showCorrectLetters: false, hasWordAudio: false },
};

let currentDifficulty = "easy";
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
   + HOVER/HIGHLIGHT + ANIM
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
            
            // Give letters a slight tilt when picking them up
            onDragStart: function() {
                gsap.to(this.target, { 
                    rotation: 10, 
                    duration: 0.2, 
                    ease: "power1.out" 
                });
            },
            
            // Hover effect for letter boxes
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
                gsap.to(this.target, { rotation: 0, duration: 0.2 }); // reset rotation
                const letterBoxes = document.querySelectorAll(".letter-box");
                const letterContainer = document.querySelector(".available-letters-container");
                
                // Remove all hovered states after drop
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

                // If NOT dropped in a box, check if it’s on the container
                if (!droppedInBox) {
                    if (this.hitTest(letterContainer, "50%")) {
                        letterContainer.appendChild(this.target);
                        this.target.classList.remove("in-box");
                        gsap.set(this.target, {
                            x: 0,
                            y: 0,
                            position: "relative",
                            left: "0px",
                            top: "0px"
                        });
                    } else {
                        // Snap it back to the letter container
                        letterContainer.appendChild(this.target);
                        gsap.set(this.target, {
                            x: 0,
                            y: 0,
                            position: "relative",
                            left: "0px",
                            top: "0px"
                        });
                    }
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

    if (boxes.some(box => !box.textContent)) {
        feedback.textContent = "Fill all boxes first!";
        feedback.className = "feedback error";
        return;
    }

    const attempt = boxes.map(box => box.textContent).join("");
    if (attempt === currentWord) {
        feedback.textContent = "Correct!";
        feedback.className = "feedback success";
        playRandomSound(sounds.correct);

        // Show confetti or star pop
        showStarPop();

        showSuccess();
    } else {
        feedback.textContent = "Incorrect, try again!";
        feedback.className = "feedback error";
        playRandomSound(sounds.wrong);
        gameStats.lives--;
        updateLivesDisplay();
        if (gameStats.lives === 0) endGame();
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
    // Create a few floating stars near center of screen or box
    const gameContainer = document.querySelector("#game-container");

    for (let i = 0; i < 8; i++) {
        let star = document.createElement("div");
        star.className = "star-confetti";
        star.textContent = "★";
        
        // Random position offset
        star.style.left = `${50 + Math.random() * 20 - 10}%`;
        star.style.top = `${40 + Math.random() * 20 - 10}%`;

        gameContainer.appendChild(star);

        // Animate star outward and fade
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
    // Use your hearts logic as before
    // (Just make sure you have the .hearts element in your HTML or adapt as necessary)
    const hearts = document.querySelectorAll(".hearts span");
    hearts.forEach((heart, i) => {
        heart.textContent = i < gameStats.lives ? "❤️" : "🖤";
    });
}

/* ===============
   END GAME
=============== */
function endGame() {
    const feedback = document.querySelector("#feedback");
    feedback.textContent = "Game Over! No more lives!";
    feedback.className = "feedback error";
    // You might disable further interactions or do something fancy
}

/* ===============
   LOAD NEW WORD
=============== */
function loadNewWord() {
    if (usedWords.size === totalWords) {
        showGameCompletion();
        return;
    }

    currentWord = Object.keys(wordData).find(word => !usedWords.has(word));
    usedWords.add(currentWord);

    document.querySelector("#card-image").src = wordData[currentWord].image;
    createLetterBoxes(currentWord);
    createDraggableLetters(currentWord);
    document.querySelector("#feedback").textContent = "";
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
    }
}

/* ===============
   INIT GAME
=============== */
document.addEventListener("DOMContentLoaded", () => {
    document.querySelector("#card").addEventListener("click", flipCard);
    createLetterBoxes("");
    updateLivesDisplay();
});
