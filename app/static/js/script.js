// script.js
import { createLetterBoxes, createDraggableLetters, setupCardClickHandler, setupCheckButtonHandler, updateLifeBar, revealAnswerAndFlip, resizeLetterBoxesAndLetters, scaleGameToFitScreen } from './ui.js';
import { loadWordData } from './data.js';

let wordData = {};
let currentTheme = "";
let currentWord = "";
let currentWordAudio = null;

let totalWords = 0;
// Swipe sounds array
const swipeSounds = [
    new Audio('/static/sounds/swipe/swipe1.mp3'),
    new Audio('/static/sounds/swipe/swipe2.mp3'),
    new Audio('/static/sounds/swipe/swipe3.mp3'),
    new Audio('/static/sounds/swipe/swipe4.mp3')
];
swipeSounds.forEach((sound, index) => {
    sound.addEventListener('error', (e) => {
        console.error(`Swipe sound ${index + 1} failed to load:`, e);
    });
    console.log(`Swipe sound ${index + 1} loaded:`, sound.src);
});

// Ensure that the playSwipeSound function is firing
export function playSwipeSound() {
    const randomSound = swipeSounds[Math.floor(Math.random() * swipeSounds.length)];
    randomSound.playbackRate = 1 + (Math.random() * 0.2 - 0.1); // Slight pitch variation
    randomSound.volume = 0.8 + (Math.random() * 0.2 - 0.1); // Slight volume variation
    randomSound.play()
        .then(() => console.log("Sound played successfully"))
        .catch(err => console.error("Sound playback error:", err));
}
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

const gameStats = { attempts: 3 };
const usedWords = new Set();

/*
 * Adjust game scaling dynamically for responsive design.
 */
function adjustGameScaling() {
    const gameContainer = document.querySelector("#game-container");
    const scaleFactor = Math.min(1, window.innerWidth / 600); // Scale proportionally
    gameContainer.style.transform = `scale(${scaleFactor})`;
    gameContainer.style.transformOrigin = "top center"; // Ensures scaling from the center
}

/* ===============
   EVENT LISTENERS
=============== */
// Handle dynamic scaling on window resize
window.addEventListener("resize", () => {
    scaleGameToFitScreen();
    if (currentWord) {
        resizeLetterBoxesAndLetters(currentWord);
    }
});

// Initialize the game on DOM content loaded
document.addEventListener("DOMContentLoaded", () => {
    console.log("Initializing game...");
    scaleGameToFitScreen();
    showThemeSelection();
});

/* ===============
   THEME SELECTION
=============== */
function showThemeSelection() {
    const themeContainer = document.querySelector("#theme-container");
    themeContainer.style.display = "block"; // Show theme selection menu

    const themeButtons = document.querySelectorAll(".theme-btn");
    themeButtons.forEach(button => {
        button.addEventListener("click", async (event) => {
            currentTheme = event.target.dataset.theme; // Get the selected theme
            console.log(`Theme selected: ${currentTheme}`);
            themeContainer.style.display = "none"; // Hide the theme selection menu

            try {
                // Dynamically load the selected theme data
                wordData = await loadWordData(`/static/data/${currentTheme}.json`);
                totalWords = Object.keys(wordData).length;
                console.log("Word data loaded:", wordData);

                // Start the game after loading the theme
                initializeGame();
            } catch (error) {
                console.error("Error loading theme data:", error);
            }
        });
    });
}

/* ===============
   INITIALIZE GAME
=============== */
function initializeGame() {
    console.log("Initializing game with theme:", currentTheme);

    const heartsContainer = document.querySelector(".hearts");
    heartsContainer.innerHTML = "";
    for (let i = 0; i < 3; i++) {
        const heart = document.createElement("span");
        heart.textContent = "❤️";
        heartsContainer.appendChild(heart);
    }

    const gameContainer = document.querySelector("#game-container");
    gameContainer.style.display = "block"; // Show game container

    createLetterBoxes("");
    setupCardClickHandler(flipCard);
    setupCheckButtonHandler(checkAnswer, lockCorrectLetters);
}

/* ===============
   FLIP CARD
=============== */
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

    // Resize letter boxes and letters with animation
    resizeLetterBoxesAndLetters(currentWord);
}

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
        revealAnswerAndFlip(currentWord, wordData, usedWords, totalWords, loadNewWordWithReset, false);
    } else {
        console.log("Incorrect answer provided:", userAnswer);
        handleIncorrectAnswer(boxes);
    }
}

function handleIncorrectAnswer(boxes) {
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

    console.log("Playing wrong sound..."); // Debug log

    // Play a random wrong sound
    const wrongSound = sounds.wrong[Math.floor(Math.random() * sounds.wrong.length)];
    if (wrongSound) {
        wrongSound.play().catch(err => console.error("Sound playback error:", err)); // Error handling
    } else {
        console.error("No wrong sound available in the sounds array."); // Additional debug log
    }

    handleAttempts();
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
        updateLifeBar(gameStats);
    } else {
        feedback.textContent = "Out of attempts! Here's the correct answer.";
        feedback.className = "feedback error child-text";
        revealAnswerAndFlip(currentWord, wordData, usedWords, totalWords, loadNewWordWithReset, false);
    }
}
function lockCorrectLetters() {
    console.log("Locking correct letters...");
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
   IMAGE CLICK: PLAY AUDIO
=============== */
const cardImage = document.querySelector("#card-image");
if (cardImage) {
    cardImage.addEventListener("click", () => {
        if (currentWordAudio) {
            console.log("Playing audio:", currentWordAudio.src);
            currentWordAudio.play().catch(err => {
                console.error("Error playing audio:", err);
            });
        } else {
            console.log("No audio set for the current word.");
        }
    });
}


