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
    correct: [new Audio('/static/sounds/correct/correct1.mp3'), new Audio('/static/sounds/correct/correct2.mp3')],
    wrong: [new Audio('/static/sounds/error/error1.mp3'), new Audio('/static/sounds/error/error2.mp3')],
};

const difficultySettings = {
    easy: { showCorrectLetters: true, hasWordAudio: true },
    medium: { showCorrectLetters: false, hasWordAudio: true },
    hard: { showCorrectLetters: false, hasWordAudio: false },
};

let currentDifficulty = "easy";
let gameStats = { lives: 3 };

const usedWords = new Set();
const totalWords = Object.keys(wordData).length;

// Create letter boxes
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

// Create draggable letters with improved drag-and-drop handling
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
        onDragEnd: function() {
          const letterBoxes = document.querySelectorAll(".letter-box");
          const letterContainer = document.querySelector(".available-letters-container");
          
          let droppedInBox = false;
  
          // 1) Check if dropped on any letter box
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
              // Optionally add some styling for "in-box"
              this.target.classList.add("in-box");
              droppedInBox = true;
            }
          });
  
          // 2) If NOT dropped in a box, check if it’s on the container
          if (!droppedInBox) {
            if (this.hitTest(letterContainer, "50%")) {
              // If dropped back onto the letter container
              letterContainer.appendChild(this.target);
              this.target.classList.remove("in-box");
              gsap.set(this.target, {
                x: 0,
                y: 0,
                position: "relative",
                left: "0px",
                top: "0px"
              });
              // this.target.classList.remove("in-box");
            } else {
              // 3) Otherwise, snap it back to the letter container
              letterContainer.appendChild(this.target);
              gsap.set(this.target, {
                x: 0,
                y: 0,
                position: "relative",
                left: "0px",
                top: "0px"
              });
              // this.target.classList.remove("in-box");
            }
          }
        }
      });
    });
  }
  
function moveLetterToContainer(draggableLetter, letterContainer) {
  // 1) Get the letter's current global bounding rectangle
  let rect = draggableLetter.getBoundingClientRect();
  let currentX = rect.left;
  let currentY = rect.top;

  // 2) Append to container
  letterContainer.appendChild(draggableLetter);

  // 3) Now get the letter’s new bounding rect
  //    and figure out how much we need to shift to keep it
  //    at the same spot visually
  let newRect = draggableLetter.getBoundingClientRect();
  let deltaX = currentX - newRect.left;
  let deltaY = currentY - newRect.top;

  // 4) Set its position so it looks like it never moved
  gsap.set(draggableLetter, {
    x: deltaX,
    y: deltaY,
    position: "absolute",  // or "fixed" if you prefer
    left: 0,
    top: 0
  });

  // 5) Now animate smoothly to 0,0 (the container’s top-left corner)
  gsap.to(draggableLetter, {
    x: 0,
    y: 0,
    duration: 1.5,
    ease: "power1.inOut",
    onComplete: () => {
      // If you prefer it "relative" after finishing:
      gsap.set(draggableLetter, {
        position: "relative", 
        left: "0px",
        top: "0px"
      });
    }
  });
}


// Check the player's answer
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

// Play random sound
function playRandomSound(soundArray) {
    soundArray[Math.floor(Math.random() * soundArray.length)].play();
}

// Show success and load next word
function showSuccess() {
    setTimeout(() => {
        currentWord = "";
        loadNewWord();
    }, 1500);
}

// Update lives display
function updateLivesDisplay() {
    const hearts = document.querySelectorAll(".hearts span");
    hearts.forEach((heart, i) => {
        heart.textContent = i < gameStats.lives ? "❤️" : "🖤";
    });
}

// Load new word
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

// Register new user
function registerUser() {
    const input = document.querySelector("#username");
    if (input.value) {
        // Registration logic...
    } else {
        document.querySelector("#registration-feedback").textContent = "Enter a username!";
    }
}

// Show game completion
function showGameCompletion() {
    const gameContainer = document.querySelector("#game-container");
    gameContainer.innerHTML = `<h1>Congratulations! You completed all ${totalWords} words!</h1>`;
}

// Flip card and start game
function flipCard() {
    const card = document.querySelector("#card");
    if (!card.classList.contains("flipped")) {
        card.classList.add("flipped");
        loadNewWord();
    }
}

// Initialize the game
document.addEventListener("DOMContentLoaded", () => {
    document.querySelector("#card").addEventListener("click", flipCard);
    createLetterBoxes("");
    updateLivesDisplay();
});
