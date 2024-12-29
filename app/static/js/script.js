let registeredUsers = []; // Array to hold registered usernames
let userData = {}; // Object to store user performance data
let username = ""; // Current logged-in user


// Word list with corresponding image and audio paths
const wordData = {
    "dog": {
        image: "/static/images/animals/dog.svg",
        audio: "/static/sounds/words/dog.mp3"
    },
    "cat": {
        image: "/static/images/animals/cat.svg",
        audio: "/static/sounds/words/cat.mp3"
    },
    "fish": {
        image: "/static/images/animals/fish.svg",
        audio: "/static/sounds/words/fish.mp3"
    },
    "bird": {
        image: "/static/images/animals/bird.svg",
        audio: "/static/sounds/words/bird.mp3"
    },
    "frog": {
        image: "/static/images/animals/frog.svg",
        audio: "/static/sounds/words/frog.mp3"
    }
};

let currentWord = "";
let currentWordAudio = null;

// Sound effects with multiple options
const sounds = {
    correct: [
        new Audio('/static/sounds/correct/correct1.mp3'),
        new Audio('/static/sounds/correct/correct2.mp3'),
        new Audio('/static/sounds/correct/correct3.mp3')
    ],
    wrong: [
        new Audio('/static/sounds/error/error1.mp3'),
        new Audio('/static/sounds/error/error2.mp3')
    ],
    dog: new Audio('/static/sounds/words/dog.mp3') // Add the audio file for the word
};

// Function to create letter boxes for the word
function createLetterBoxes(word) {
    const container = document.getElementById('letter-boxes');
    container.innerHTML = ''; // Clear existing boxes

    for (let i = 0; i < word.length; i++) {
        const box = document.createElement('div');
        box.className = 'letter-box';
        box.dataset.index = i; // Store the box index
        box.textContent = ''; // Ensure boxes are empty initially
        container.appendChild(box);
    }

    // Initialize dropzones for the boxes
    interact('.letter-box').dropzone({
        accept: '.draggable-letter', // Only accept draggable letters
        overlap: 0.5, // Letter must overlap 50% to drop
        ondrop(event) {
            const draggedElement = event.relatedTarget;
            const dropzone = event.target;
    
            // Handle moving a letter between boxes
            const currentParent = draggedElement.parentElement;
            if (currentParent && currentParent.classList.contains('letter-box')) {
                currentParent.textContent = ''; // Clear the old box
                currentParent.dataset.originalLetter = ''; // Reset box data
            }
    
            // Place the draggable letter into the new box
            if (!dropzone.hasChildNodes()) {
                dropzone.appendChild(draggedElement);
                draggedElement.style.transform = ''; // Reset position within the box
                draggedElement.setAttribute('data-x', 0);
                draggedElement.setAttribute('data-y', 0);
    
                // Apply the "in-box" class
                draggedElement.classList.add('in-box');
                dropzone.dataset.originalLetter = draggedElement.id; // Update box data
            }
        },
        ondragleave(event) {
            const draggedElement = event.relatedTarget;
            const dropzone = event.target;
    
            if (dropzone.contains(draggedElement)) {
                // Remove the letter from the box
                dropzone.removeChild(draggedElement);
                draggedElement.classList.remove('in-box');
    
                // Reattach the letter to the pool
                const pool = document.getElementById('available-letters');
                pool.appendChild(draggedElement);
    
                // Ensure it remains draggable
                draggedElement.style.transform = ''; // Reset position
                draggedElement.setAttribute('data-x', 0);
                draggedElement.setAttribute('data-y', 0);
            }
        },
    });
    
    
    

    console.log('Letter boxes created:', container.innerHTML); // Debugging log
}

// Function to create draggable letters
function createDraggableLetters(word) {
    const container = document.getElementById('available-letters');
    const shuffledLetters = word.split('').sort(() => Math.random() - 0.5);

    container.innerHTML = ''; // Clear existing letters
    shuffledLetters.forEach((letter, index) => {
        const letterDiv = document.createElement('div');
        letterDiv.className = 'draggable-letter';
        letterDiv.id = `letter-${index}`;
        letterDiv.textContent = letter;
        letterDiv.setAttribute('data-x', 0);
        letterDiv.setAttribute('data-y', 0);

        container.appendChild(letterDiv);
    });

    // Initialize draggable functionality for all letters
    interact('.draggable-letter').draggable({
        listeners: {
            move: dragMoveListener,
            end(event) {
                const target = event.target;
                const parentBox = target.parentElement;
    
                // If the letter is not in a valid box, return it to the pool
                if (!parentBox || !parentBox.classList.contains('letter-box')) {
                    const pool = document.getElementById('available-letters');
                    pool.appendChild(target);
    
                    // Reset position
                    target.style.transform = '';
                    target.setAttribute('data-x', 0);
                    target.setAttribute('data-y', 0);
    
                    // Remove the "in-box" class
                    target.classList.remove('in-box');
                }
            },
        },
        inertia: true,
    });
    
    console.log('Draggable functionality initialized for letters');

    console.log('Draggable letters created:', container.innerHTML); // Debugging log
}


// Function to handle the dragging movement
function dragMoveListener(event) {
    const target = event.target;

    // Calculate new position
    const x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
    const y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;

    // Apply the transformation
    target.style.transform = `translate(${x}px, ${y}px)`;
    target.setAttribute('data-x', x);
    target.setAttribute('data-y', y);

    // Clear the parent box only if dragging out of a box
    const parentBox = target.parentElement;
    if (parentBox && parentBox.classList.contains('letter-box')) {
        parentBox.textContent = ''; // Clear the box
        parentBox.dataset.originalLetter = ''; // Reset the box's reference
    }
}







// Helper function to play a random sound from an array
function playRandomSound(soundArray) {
    const randomIndex = Math.floor(Math.random() * soundArray.length);
    soundArray[randomIndex].play();
}

// Add difficulty settings
const difficultySettings = {
    easy: {
        showCorrectLetters: true,
        hasWordAudio: true,
        name: "Easy"
    },
    medium: {
        showCorrectLetters: false,
        hasWordAudio: true,
        name: "Medium"
    },
    hard: {
        showCorrectLetters: false,
        hasWordAudio: false,
        name: "Hard"
    }
};

let currentDifficulty = 'easy'; // Default difficulty

// Add difficulty selector to HTML
function createDifficultySelector() {
    const container = document.getElementById('game-container');
    const selector = document.createElement('div');
    selector.className = 'difficulty-selector';
    selector.innerHTML = `
        <h3>Select Difficulty:</h3>
        <div class="difficulty-buttons">
            <button onclick="setDifficulty('easy')" class="difficulty-btn active">Easy</button>
            <button onclick="setDifficulty('medium')" class="difficulty-btn">Medium</button>
            <button onclick="setDifficulty('hard')" class="difficulty-btn">Hard</button>
        </div>
    `;
    container.insertBefore(selector, container.firstChild);
}

// Function to set difficulty
function setDifficulty(difficulty) {
    currentDifficulty = difficulty;
    
    // Update active button but don't disable yet
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase() === difficulty) {
            btn.classList.add('active');
        }
    });
}

// Add scoring and attempts system
let gameStats = {
    lives: 3
};

// Create lives display function
function createLivesDisplay() {
    const livesContainer = document.createElement('div');
    livesContainer.className = 'lives-container';
    livesContainer.innerHTML = `
        <div class="hearts">
            <span>❤️</span>
            <span>❤️</span>
            <span>❤️</span>
        </div>
    `;
    
    // Insert lives display after difficulty selector
    const difficultySelector = document.querySelector('.difficulty-selector');
    difficultySelector.after(livesContainer);
}

// Update lives display
function updateLivesDisplay() {
    const hearts = document.querySelectorAll('.hearts span');
    hearts.forEach((heart, index) => {
        if (index < gameStats.lives) {
            heart.textContent = '❤️';
        } else {
            heart.textContent = '🖤';
        }
    });
}

function checkAnswer() {
    const boxes = Array.from(document.getElementsByClassName('letter-box'));
    const feedback = document.getElementById('feedback');

    // Ensure all boxes are filled before checking
    if (!boxes.every(box => box.textContent)) {
        feedback.textContent = "Fill all boxes first!";
        feedback.className = "feedback error animate-shake";
        return;
    }

    const attempt = boxes.map(box => box.textContent).join('');

    // Handle correct answer
    if (attempt === currentWord) {
        boxes.forEach(box => {
            box.classList.add('correct');
            box.style.backgroundColor = "#4CAF50"; // Highlight correct letter
        });
        playRandomSound(sounds.correct);
        showSuccess();
    } else {
        // Handle wrong answer
        playRandomSound(sounds.wrong);
        gameStats.lives--;
        updateLivesDisplay();

        if (gameStats.lives <= 0) {
            // Game over logic
            setTimeout(() => {
                gameStats.lives = 3; // Reset lives
                updateLivesDisplay();
                loadNewWord();
            }, 1500);
        }

        // Difficulty-based logic for incorrect answers
        boxes.forEach((box, index) => {
            const correctLetter = currentWord[index];
            const placedLetter = box.textContent;

            if (placedLetter === correctLetter) {
                // Easy: Keep correct letters
                if (currentDifficulty === 'easy') {
                    box.classList.add('correct');
                } else if (currentDifficulty === 'medium') {
                    // Medium: Do not provide feedback for correct letters
                    box.textContent = '';
                    box.dataset.originalLetter = '';
                }
            } else {
                box.classList.add('incorrect');

                if (currentDifficulty !== 'hard') {
                    // Easy/Medium: Reset incorrect letters
                    const originalLetter = document.getElementById(box.dataset.originalLetter);
                    if (originalLetter) {
                        originalLetter.classList.remove('hidden');
                        originalLetter.style.transform = ''; // Reset position
                        originalLetter.setAttribute('data-x', 0);
                        originalLetter.setAttribute('data-y', 0);
                    }
                    setTimeout(() => {
                        box.textContent = '';
                        box.dataset.originalLetter = '';
                        box.classList.remove('incorrect');
                    }, 500);
                } else {
                    // Hard: Do not reset boxes or provide feedback
                    setTimeout(() => {
                        box.classList.remove('incorrect');
                    }, 500);
                }
            }
        });

        feedback.textContent = "Try again!";
        feedback.className = "feedback error";
    }
}


// Add visual elements for score and attempts
function createGameStats() {
    const statsContainer = document.createElement('div');
    statsContainer.className = 'game-stats';
    statsContainer.innerHTML = `
        <div class="hearts">
            <span>❤️</span>
            <span>❤️</span>
            <span>❤️</span>
        </div>
        <div class="score">Score: 0</div>
        <div class="streak">Streak: 0</div>
    `;
    
    document.getElementById('game-container').insertBefore(
        statsContainer,
        document.querySelector('.card')
    );
}

// Function to flip card and handle audio based on difficulty
window.flipCard = function() {
    const card = document.getElementById('card');

    if (!card.classList.contains('flipped')) {
        console.log('Flip card function called');
        card.classList.add('flipped'); // Flip the card

        // Show game elements and load the first word
        showGameElements();
        loadNewWord();
        createCheckButton();
    }
}

// Add tracking for used words
let usedWords = new Set();
const totalWords = Object.keys(wordData).length;

// Function to load a new word
function loadNewWord(showElements = true) {
    if (!currentWord) {
        // Dynamically select an unused word
        const availableWords = Object.keys(wordData).filter(word => !usedWords.has(word));
        if (availableWords.length === 0) {
            console.error('No more words available');
            showGameCompletion(); // Show game completion message
            return;
        }
        currentWord = availableWords[Math.floor(Math.random() * availableWords.length)];
        usedWords.add(currentWord);
    }

    console.log('Loading new word:', currentWord);

    // Set card image
    const cardImage = document.getElementById('card-image');
    cardImage.src = wordData[currentWord].image;
    cardImage.alt = `Image of ${currentWord}`;
    console.log('Card image set to:', cardImage.src);

    // Create letter boxes and draggable letters
    createLetterBoxes(currentWord);
    createDraggableLetters(currentWord);

    // Show game elements only if explicitly allowed
    if (showElements) {
        showGameElements();
    }

    // Reset feedback
    document.getElementById('feedback').textContent = '';
}



function createCheckButton() {
    const container = document.getElementById('game-container');
    let checkButton = document.getElementById('check-button');

    // If the button already exists, don't recreate it
    if (!checkButton) {
        checkButton = document.createElement('button');
        checkButton.textContent = 'Check Answer';
        checkButton.id = 'check-button';
        checkButton.addEventListener('click', checkAnswer);
        container.appendChild(checkButton);
    }

    // Ensure the button is visible
    checkButton.style.display = 'block';
}


// Function to show success and prepare next word
function showSuccess() {
    const feedback = document.getElementById('feedback');
    feedback.textContent = "Correct!";
    feedback.className = "feedback success animate";
    
    createConfetti();
    
    setTimeout(() => {
        // Hide game elements
        hideGameElements();
        // Flip card back
        document.getElementById('card').classList.remove('flipped');
        feedback.className = "feedback";
        // Clear current word to ensure a new one is loaded on next flip
        currentWord = "";
    }, 1500);
}

// New function to hide game elements
function hideGameElements() {
    const letterBoxes = document.getElementById('letter-boxes');
    const availableLetters = document.getElementById('available-letters');
    const checkButton = document.getElementById('check-button');
    
    letterBoxes.innerHTML = '';
    availableLetters.innerHTML = '';
    letterBoxes.style.display = 'none';
    availableLetters.style.display = 'none';
    
    if (checkButton) {
        checkButton.remove();
    }
}

// New function to show game elements
function showGameElements() {
    const letterBoxes = document.getElementById('letter-boxes');
    const availableLetters = document.getElementById('available-letters');
    
    letterBoxes.style.display = 'flex';
    availableLetters.style.display = 'flex';
    console.log('Game elements are now visible');
}

function registerUser() {
    const username = document.getElementById('username').value;
    if (username) {
        fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        })
            .then(response => {
                if (!response.ok) throw new Error('Username already exists');
                return response.json();
            })
            .then(data => {
                registeredUsers.push(username);
                console.log('User registered:', data);
                document.getElementById('registration-feedback').innerText = "Registration successful!";
                setTimeout(showLoginContainer, 1000); // Show login section after successful registration
            })
            .catch(error => {
                document.getElementById('registration-feedback').innerText = error.message;
            });
    } else {
        document.getElementById('registration-feedback').innerText = 'Please enter a username.';
    }
}

function showLoginContainer() {
    document.getElementById('registration-container').style.display = 'none';
    document.getElementById('login-container').style.display = 'block';
    displayUserList();
}

function displayUserList() {
    const userListDiv = document.getElementById('user-list');
    userListDiv.innerHTML = ''; // Clear existing buttons
    registeredUsers.forEach(user => {
        const userButton = document.createElement('button');
        userButton.textContent = user;
        userButton.onclick = () => loginUser(user);
        userListDiv.appendChild(userButton);
    });
}
function loginUser(selectedUser) {
    username = selectedUser;
    document.getElementById('login-container').style.display = 'none';
    document.getElementById('game-container').style.display = 'block';

    fetch(`http://localhost:3000/user/${username}`)
        .then(response => {
            if (!response.ok) throw new Error('User not found');
            return response.json();
        })
        .then(data => {
            userData[username] = data || { score: 0, fails: 0 }; // Default values if no data exists
            console.log('User data loaded:', userData[username]);
            loadNewWord();
        })
        .catch(error => {
            console.error('Error:', error);
        });
}

// Function to create confetti effect
function createConfetti() {
    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        
        // Random position and animation delay
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.animationDelay = Math.random() * 3 + 's';
        confetti.style.backgroundColor = `hsl(${Math.random() * 360}, 50%, 50%)`;
        
        document.body.appendChild(confetti);
        
        // Remove confetti after animation
        setTimeout(() => confetti.remove(), 3000);
    }
}

// Add completion sound
const completionSound = new Audio('/static/sounds/correct/Congratulations.mp3');

// New function to show game completion
function showGameCompletion() {
    const gameContainer = document.getElementById('game-container');
    
    // Play completion sound
    completionSound.play();
    
    // Hide all game elements
    hideGameElements();
    const card = document.getElementById('card');
    card.style.display = 'none';
    
    // Create completion message
    const completionDiv = document.createElement('div');
    completionDiv.className = 'completion-message';
    completionDiv.innerHTML = `
        <h1>🎉 Congratulations! 🎉</h1>
        <p>You've completed all ${totalWords} words!</p>
        <button onclick="restartGame()">Play Again</button>
    `;
    gameContainer.appendChild(completionDiv);
    
    // Create special celebration effect
    createSpecialCelebration();
}

// Function to create special celebration effect
function createSpecialCelebration() {
    // Create more elaborate confetti
    for (let i = 0; i < 100; i++) {
        setTimeout(() => {
            const confetti = document.createElement('div');
            confetti.className = 'special-confetti';
            confetti.style.left = Math.random() * 100 + 'vw';
            confetti.style.animationDelay = Math.random() * 2 + 's';
            confetti.style.backgroundColor = `hsl(${Math.random() * 360}, 50%, 50%)`;
            
            // Random shapes
            const shapes = ['★', '●', '��', '♠', '♣', '♥'];
            confetti.innerHTML = shapes[Math.floor(Math.random() * shapes.length)];
            
            document.body.appendChild(confetti);
            setTimeout(() => confetti.remove(), 5000);
        }, i * 50);
    }
}

// Function to restart game
function restartGame() {
    usedWords.clear();
    const completionMessage = document.querySelector('.completion-message');
    if (completionMessage) {
        completionMessage.remove();
    }
    
    // Re-enable difficulty buttons
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.disabled = false;
    });
    
    const card = document.getElementById('card');
    card.style.display = 'block';
    card.classList.remove('flipped');
    
    loadNewWord();
}

// Add this at the end of your script.js
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('ServiceWorker registration successful');
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}

// Make sure to initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const card = document.getElementById('card');
    card.addEventListener('click', flipCard);

    hideGameElements(); // Hide game elements initially
    createDifficultySelector();
    createLivesDisplay();

    // Load the first word without showing elements
    loadNewWord(false); // Pass a flag to avoid showing elements initially
});


// Touch event handlers for letter boxes
function handleBoxTouchStart(e) {
    if (!this.textContent) return; // Only handle filled boxes
    e.preventDefault();
    
    // Create a temporary draggable letter
    const tempLetter = document.createElement('div');
    tempLetter.className = 'draggable-letter dragging';
    tempLetter.textContent = this.textContent;
    tempLetter.id = this.dataset.originalLetter;
    document.body.appendChild(tempLetter);
    
    // Clear the original box
    const originalLetter = document.getElementById(this.dataset.originalLetter);
    if (originalLetter) {
        originalLetter.classList.remove('hidden');
    }
    this.textContent = '';
    this.dataset.originalLetter = '';
    
    // Position the temporary letter at touch position
    const touch = e.touches[0];
    tempLetter.style.position = 'fixed';
    tempLetter.style.left = (touch.clientX - 20) + 'px';
    tempLetter.style.top = (touch.clientY - 20) + 'px';
    
    // Store reference to temp letter
    this.tempLetter = tempLetter;
}

function handleBoxTouchMove(e) {
    if (!this.tempLetter) return;
    e.preventDefault();
    
    const touch = e.touches[0];
    this.tempLetter.style.left = (touch.clientX - 20) + 'px';
    this.tempLetter.style.top = (touch.clientY - 20) + 'px';
    
    // Find and highlight closest empty box
    const letterBoxes = document.getElementsByClassName('letter-box');
    let closestBox = null;
    let closestDistance = Infinity;
    
    Array.from(letterBoxes).forEach(box => {
        const rect = box.getBoundingClientRect();
        const distance = Math.hypot(
            touch.clientX - (rect.left + rect.width/2),
            touch.clientY - (rect.top + rect.height/2)
        );
        if (distance < closestDistance && !box.textContent) {
            closestDistance = distance;
            closestBox = box;
        }
    });
    
    Array.from(letterBoxes).forEach(box => box.classList.remove('hover'));
    if (closestBox && closestDistance < 50) {
        closestBox.classList.add('hover');
    }
}

function handleBoxTouchEnd(e) {
    if (!this.tempLetter) return;
    
    const touch = e.changedTouches[0];
    let placed = false;
    
    // Try to place in a letter box
    const letterBoxes = document.getElementsByClassName('letter-box');
    Array.from(letterBoxes).forEach(box => {
        box.classList.remove('hover');
        const rect = box.getBoundingClientRect();
        if (!box.textContent &&
            touch.clientX >= rect.left && touch.clientX <= rect.right &&
            touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
            box.textContent = this.tempLetter.textContent;
            box.dataset.originalLetter = this.tempLetter.id;
            document.getElementById(this.tempLetter.id).classList.add('hidden');
            placed = true;
        }
    });
    
    // If not placed, return to available letters
    if (!placed) {
        const originalLetter = document.getElementById(this.tempLetter.id);
        if (originalLetter) {
            originalLetter.classList.remove('hidden');
        }
    }
    
    // Remove temporary letter
    this.tempLetter.remove();
    this.tempLetter = null;
}

// Allow letters to be dragged out of the boxes
function handleBoxDragStart(e) {
    const letterId = this.dataset.originalLetter;
    const letter = document.getElementById(letterId);
    if (letter) {
        e.dataTransfer.setData('text/plain', letterId);
        this.classList.add('hover');
    }
}
