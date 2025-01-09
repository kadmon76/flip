// script.js

let registeredUsers = [];
let userData = {};
let username = "";

// Word list with images and audio
const wordData = {
    dog:  { image: "/static/images/animals/dog.svg",  audio: "/static/sounds/words/dog.mp3"  },
    cat:  { image: "/static/images/animals/cat.svg",  audio: "/static/sounds/words/cat.mp3"  },
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

// Game stats, starting with 3 attempts
let gameStats = { attempts: 3 };

const usedWords = new Set();
const totalWords = Object.keys(wordData).length;

/* ======================
   CREATE LETTER BOXES
====================== */
function createLetterBoxes(word) {
    console.log("Creating letter boxes for:", word);
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
    console.log("Creating draggable letters for:", word);
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
            onDragEnd: function () {
                console.log("Dragging ended for letter:", this.target.textContent);
                snapLetterToBox(this.target);
            }
        });
    });
}

/* ===============
   SNAP LETTER
=============== */
function snapLetterToBox(letterDiv) {
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
        }
    });

    if (!droppedInBox) {
        console.log("Letter returned to container:", letterDiv.textContent);
        letterContainer.appendChild(letterDiv);
        letterDiv.classList.remove("in-box");
        gsap.set(letterDiv, { x: 0, y: 0, position: "relative" });
    }
}

/* ===============
   HANDLE ATTEMPTS
=============== */
function handleAttempts() {
    console.log("Handling attempts. Remaining attempts:", gameStats.attempts);
    const feedback = document.querySelector("#feedback");

    if (gameStats.attempts > 1) {
        gameStats.attempts--;
        feedback.textContent = `Try again! ${gameStats.attempts} attempts left.`;
        feedback.className = "feedback error child-text";
        updateLifeBar();
        
        // Play incorrect sound
        const incorrectSound = sounds.wrong[Math.floor(Math.random() * sounds.wrong.length)];
        incorrectSound.play();
    } else {
        feedback.textContent = "Out of attempts! Here's the correct answer.";
        feedback.className = "feedback error child-text";
        setTimeout(() => {
            revealAnswerAndFlip(false);
            setTimeout(() => {
                if (currentWordAudio) {
                    currentWordAudio.play();
                }
            }, 1000); // Play word sound after a delay to avoid overlap
        }, 1500);
    }
}

/* ===============
   UPDATE LIFE BAR
=============== */
function updateLifeBar() {
    console.log("Updating life bar. Attempts left:", gameStats.attempts);
    const hearts = document.querySelectorAll(".hearts span");
    hearts.forEach((heart, index) => {
        heart.textContent = index < gameStats.attempts ? "❤️" : "🖤";
    });
}

/* ===============
   REVEAL ANSWER AND FLIP
=============== */
function revealAnswerAndFlip(playSound = true) {
    console.log("Revealing answer and flipping card. Current word:", currentWord);
    const boxes = document.querySelectorAll(".letter-box");

    boxes.forEach((box, i) => {
        box.textContent = currentWord[i];
        gsap.to(box, { y: -10, duration: 0.5, ease: "bounce.out" });
    });

    if (playSound && wordData[currentWord]?.audio) {
        console.log("Playing word audio for:", currentWord);
        new Audio(wordData[currentWord].audio).play();
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
   LOCK LETTERS AFTER CHECKING
=============== */
function lockCorrectLetters() {
    const boxes = document.querySelectorAll(".letter-box");
    boxes.forEach((box, index) => {
        if (box.textContent === currentWord[index]) {
            const letterDiv = box.querySelector(".draggable-letter");
            if (letterDiv) {
                letterDiv.setAttribute("draggable", "false");
                letterDiv.style.pointerEvents = "none";
            }
        }
    });
}

/* ===============
   LOAD NEW WORD WITH RESET
=============== */
function loadNewWordWithReset() {
    console.log("Resetting and loading a new word.");
    gameStats.attempts = 3;
    updateLifeBar();
    loadNewWord();
}

/* ===============
   LOAD NEW WORD
=============== */
function loadNewWord() {
    console.log("Loading a new word. Words used so far:", usedWords);
    const feedback = document.querySelector("#feedback");

    if (usedWords.size === totalWords) {
        console.log("All words completed.");
        showGameCompletion();
        return;
    }

    currentWord = Object.keys(wordData).find(word => !usedWords.has(word));
    usedWords.add(currentWord);

    console.log("New word selected:", currentWord);
    document.querySelector("#card-image").src = wordData[currentWord].image;

    if (wordData[currentWord].audio) {
        currentWordAudio = new Audio(wordData[currentWord].audio);
    }

    feedback.textContent = "";
    createLetterBoxes(currentWord);
    createDraggableLetters(currentWord);

    // Log audio association
    console.log("Associated audio for the word:", currentWordAudio.src);
}

/* ===============
   SHOW GAME COMPLETION
=============== */
function showGameCompletion() {
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

    // Add restart button in place of the check button
    const checkBtn = document.querySelector("#check-btn");
    checkBtn.style.display = "none";

    const restartButton = document.createElement("button");
    restartButton.textContent = "Restart Game";
    restartButton.id = "check-btn";
    restartButton.onclick = restartGame;
    document.querySelector("#game-container").appendChild(restartButton);
}

/* ===============
   RESTART GAME
=============== */
function restartGame() {
    console.log("Restarting the game...");
    usedWords.clear();
    document.querySelector("#check-btn").remove();
    const newCheckBtn = document.createElement("button");
    newCheckBtn.textContent = "Check Answer";
    newCheckBtn.id = "check-btn";
    newCheckBtn.onclick = checkAnswer;
    document.querySelector("#game-container").appendChild(newCheckBtn);
    loadNewWordWithReset();
}

/* ===============
   INIT GAME
=============== */
document.addEventListener("DOMContentLoaded", () => {
    console.log("Initializing game...");
    document.querySelector("#check-btn").style.display = "none";

    // Flip card function
    function flipCard() {
        console.log("Flipping the card...");
        const card = document.querySelector("#card");
        if (!card.classList.contains("flipped")) {
            card.classList.add("flipped");
            loadNewWordWithReset();

            // Show hearts
            document.querySelector(".hearts").style.display = "block";

            // Show the check button only after flipping
            document.querySelector("#check-btn").style.display = "inline-block";
        }
    }

    // Event listener for card click
    document.querySelector("#card-image").addEventListener("click", function(event) {
        console.log("Image clicked. Playing audio.");
        if (currentWordAudio) {
            currentWordAudio.play();
        }
    });

    document.querySelector("#card").addEventListener("click", function(event) {
        console.log("Card clicked. Event:", event);
        console.log("Card element:", document.querySelector("#card"));
        flipCard();
    });

    document.querySelector("#check-btn").addEventListener("click", () => {
        console.log("Checking answer...");
        checkAnswer();
        lockCorrectLetters();
    });

    const heartsContainer = document.querySelector(".hearts");
    heartsContainer.innerHTML = "";
    for (let i = 0; i < gameStats.attempts; i++) {
        const heart = document.createElement("span");
        heart.textContent = "❤️";
        heartsContainer.appendChild(heart);
    }

    createLetterBoxes("");
});

/* ===============
   CHECK ANSWER
=============== */
function checkAnswer() {
    const boxes = document.querySelectorAll(".letter-box");
    const userAnswer = Array.from(boxes).map(box => box.textContent).join("");

    if (userAnswer.toLowerCase() === currentWord.toLowerCase()) {
        console.log("Correct answer provided:", userAnswer);
        const correctSound = sounds.correct[Math.floor(Math.random() * sounds.correct.length)];
        correctSound.play();
        revealAnswerAndFlip(false); // Prevent word audio overlap
    } else {
        console.log("Incorrect answer provided:", userAnswer);
        boxes.forEach((box, index) => {
            if (box.textContent !== currentWord[index]) {
                box.classList.add("shake", "highlight");
                gsap.to(box, { x: 10, y: -10, repeat: 1, yoyo: true, duration: 0.2 });
                setTimeout(() => {
                    box.classList.remove("shake", "highlight");
                    const letterDiv = box.querySelector(".draggable-letter");
                    if (letterDiv) {
                        document.querySelector(".available-letters-container").appendChild(letterDiv);
                        gsap.set(letterDiv, { x: 0, y: 0, position: "relative" });
                    }
                    box.textContent = "";
                }, 600);
            }
        });
        handleAttempts();
    }
}
