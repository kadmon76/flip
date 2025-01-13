// script.js
import { createLetterBoxes, createDraggableLetters, snapLetterToBox, updateLifeBar, revealAnswerAndFlip, showGameCompletion, setupCardClickHandler, setupCheckButtonHandler  } from './ui.js';


let registeredUsers = [];
let userData = {};
let username = "";

// Word list with images and audio
const wordData = {
    duck:{ image: "/static/images/animals/duck.svg", audio: "/static/sounds/words/duck.mp3"},
    rabbit:{ image: "/static/images/animals/rabbit.svg", audio: "/static/sounds/words/rabbit.mp3"},
    horse:{ image: "/static/images/animals/horse.svg", audio: "/static/sounds/words/horse.mp3"},
    mouse:{ image: "/static/images/animals/mouse.svg", audio: "/static/sounds/words/mouse.mp3"},
    deer:{ image: "/static/images/animals/deer.svg", audio: "/static/sounds/words/deer.mp3"},
    wolf:{ image: "/static/images/animals/wolf.svg", audio: "/static/sounds/words/wolf.mp3"},
    bear:{ image: "/static/images/animals/bear.svg", audio: "/static/sounds/words/bear.mp3"},
    tiger:{ image: "/static/images/animals/tiger.svg", audio: "/static/sounds/words/tiger.mp3"},
    lion: { image: "/static/images/animals/lion.svg", audio: "/static/sounds/words/lion.mp3"},
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
        updateLifeBar(gameStats);
        
        // Play incorrect sound
        const incorrectSound = sounds.wrong[Math.floor(Math.random() * sounds.wrong.length)];
        incorrectSound.play();
    } else {
        feedback.textContent = "Out of attempts! Here's the correct answer.";
        feedback.className = "feedback error child-text";
        setTimeout(() => {
            revealAnswerAndFlip(currentWord, wordData, usedWords, totalWords, loadNewWordWithReset, false);
            setTimeout(() => {
                if (currentWordAudio) {
                    currentWordAudio.play();
                }
            }, 1000); // Play word sound after a delay to avoid overlap
        }, 1500);
    }
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
    updateLifeBar(gameStats);
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
   RESTART GAME
=============== */
function restartGame() {
    console.log("Restarting the game...");
    usedWords.clear();

    // Select and remove the restart button
    const restartButton = document.querySelector("#restart-btn");
    if (restartButton) {
        restartButton.remove();
        console.log("Restart button removed.");
    }

    // Reset all draggable letters and boxes
    const allDraggableLetters = document.querySelectorAll(".draggable-letter");
    allDraggableLetters.forEach(letter => {
        letter.removeAttribute("draggable");
        letter.style.pointerEvents = "";
    });

    const allBoxes = document.querySelectorAll(".letter-box");
    allBoxes.forEach(box => {
        box.innerHTML = ""; // Clear any locked letters
    });

    // Create a new "Check Answer" button
    const newCheckBtn = document.createElement("button");
    newCheckBtn.textContent = "Check Answer";
    newCheckBtn.id = "check-btn";
    newCheckBtn.onclick = () => {
        checkAnswer();
        lockCorrectLetters(); // Reapply lock logic after check
    };
    document.querySelector("#game-container").appendChild(newCheckBtn);

    // Reset the game
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

    // Set up event handlers using the new functions from ui.js
    setupCardClickHandler(flipCard);
    setupCheckButtonHandler(checkAnswer, lockCorrectLetters);

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
        revealAnswerAndFlip(currentWord, wordData, usedWords, totalWords, loadNewWordWithReset, false); // Prevent word audio overlap
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
