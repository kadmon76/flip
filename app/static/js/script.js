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
    ]
};

// Function to create letter boxes for the word
function createLetterBoxes(word) {
    const boxesContainer = document.getElementById('letter-boxes');
    boxesContainer.innerHTML = '';
    
    word.split('').forEach((letter, index) => {
        const box = document.createElement('div');
        box.className = 'letter-box';
        box.dataset.index = index;
        box.addEventListener('dragover', handleDragOver);
        box.addEventListener('drop', handleDrop);
        boxesContainer.appendChild(box);
    });
}

// Function to create draggable letters
function createDraggableLetters(word) {
    const container = document.getElementById('available-letters');
    const shuffledLetters = word.split('').sort(() => Math.random() - 0.5);
    
    container.innerHTML = '';
    shuffledLetters.forEach((letter, index) => {
        const letterDiv = document.createElement('div');
        letterDiv.className = 'draggable-letter';
        letterDiv.id = `letter-${index}`;
        letterDiv.textContent = letter;
        
        // Add touch events
        letterDiv.addEventListener('touchstart', handleTouchStart, { passive: false });
        letterDiv.addEventListener('touchmove', handleTouchMove, { passive: false });
        letterDiv.addEventListener('touchend', handleTouchEnd);
        
        // Keep mouse events for desktop
        letterDiv.addEventListener('mousedown', handleDragStart);
        letterDiv.addEventListener('dragend', handleDragEnd);
        letterDiv.setAttribute('draggable', 'true');
        
        container.appendChild(letterDiv);
    });
}

// Touch event handlers
function handleTouchStart(e) {
    e.preventDefault();
    this.classList.add('dragging');
    const touch = e.touches[0];
    this.initialX = touch.clientX - this.offsetLeft;
    this.initialY = touch.clientY - this.offsetTop;
}

function handleTouchMove(e) {
    e.preventDefault();
    if (!this.classList.contains('dragging')) return;
    
    const touch = e.touches[0];
    const currentX = touch.clientX - this.initialX;
    const currentY = touch.clientY - this.initialY;
    
    this.style.position = 'fixed';
    this.style.left = currentX + 'px';
    this.style.top = currentY + 'px';
    
    // Find the closest letter box
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
    
    // Highlight the closest empty box if it's close enough
    Array.from(letterBoxes).forEach(box => box.classList.remove('hover'));
    if (closestBox && closestDistance < 50) {
        closestBox.classList.add('hover');
    }
}

function handleTouchEnd(e) {
    this.classList.remove('dragging');
    this.style.position = '';
    this.style.left = '';
    this.style.top = '';
    
    const letterBoxes = document.getElementsByClassName('letter-box');
    const touch = e.changedTouches[0];
    let placed = false;
    
    Array.from(letterBoxes).forEach(box => {
        box.classList.remove('hover');
        const rect = box.getBoundingClientRect();
        if (!box.textContent &&
            touch.clientX >= rect.left && touch.clientX <= rect.right &&
            touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
            box.textContent = this.textContent;
            box.dataset.originalLetter = this.id;
            this.classList.add('hidden');
            placed = true;
        }
    });
    
    if (!placed) {
        this.style.transform = '';
    }
}

// Drag and Drop handlers
function handleDragStart(e) {
    e.dataTransfer.setData('text/plain', e.target.textContent);
    e.target.classList.add('dragging');
}

function handleDragOver(e) {
    e.preventDefault();
}

function handleDrop(e) {
    e.preventDefault();
    const letter = e.dataTransfer.getData('text/plain');
    const draggedElement = document.querySelector('.dragging');
    const box = e.target;
    
    if (box.classList.contains('letter-box') && !box.textContent) {
        box.textContent = letter;
        draggedElement.classList.add('hidden');
        box.dataset.originalLetter = draggedElement.id;
    }
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
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

// Modify checkAnswer function to include lives logic
function checkAnswer() {
    const boxes = Array.from(document.getElementsByClassName('letter-box'));
    
    if (!boxes.every(box => box.textContent)) {
        const feedback = document.getElementById('feedback');
        feedback.textContent = "Fill all boxes first!";
        feedback.className = "feedback error animate-shake";
        return;
    }

    const attempt = boxes.map(box => box.textContent).join('');
    
    if (attempt === currentWord) {
        // Correct answer
        boxes.forEach(box => box.classList.add('correct'));
        playRandomSound(sounds.correct);
        showSuccess();
    } else {
        // Wrong answer
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
        
        // Keep existing wrong answer handling
        if (difficultySettings[currentDifficulty].showCorrectLetters) {
            boxes.forEach((box, index) => {
                if (box.textContent === currentWord[index]) {
                    box.classList.add('correct');
                } else {
                    box.classList.add('incorrect');
                    const originalLetter = document.getElementById(box.dataset.originalLetter);
                    if (originalLetter) {
                        originalLetter.classList.remove('hidden');
                    }
                    setTimeout(() => {
                        box.classList.remove('incorrect');
                        box.textContent = '';
                        box.dataset.originalLetter = '';
                    }, 500);
                }
            });
        } else {
            // Medium/Hard mode - return all letters
            boxes.forEach(box => {
                box.classList.add('incorrect');
                const originalLetter = document.getElementById(box.dataset.originalLetter);
                if (originalLetter) {
                    originalLetter.classList.remove('hidden');
                }
                setTimeout(() => {
                    box.classList.remove('incorrect');
                    box.textContent = '';
                    box.dataset.originalLetter = '';
                }, 500);
            });
        }
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
function flipCard(e) {
    const card = document.getElementById('card');
    if (!card.classList.contains('flipped')) {
        // First flip - lock difficulty
        document.querySelectorAll('.difficulty-btn').forEach(btn => {
            btn.disabled = true; // Disable all buttons after first flip
        });
        
        card.classList.add('flipped');
        loadNewWord();
        showGameElements();
    } else {
        // Only play word audio if not in hard mode
        const cardImage = document.getElementById('card-image');
        if (e.target === cardImage && 
            currentWordAudio && 
            currentDifficulty !== 'hard') {
            currentWordAudio.play();
        }
    }
}

// Add tracking for used words
let usedWords = new Set();
const totalWords = Object.keys(wordData).length;

// Function to load a new word
function loadNewWord() {
    const availableWords = Object.keys(wordData).filter(word => !usedWords.has(word));
    
    // Check if all words have been used
    if (availableWords.length === 0) {
        showGameCompletion();
        return;
    }
    
    // Reset lives for new word
    gameStats.lives = 3;
    updateLivesDisplay();
    
    // Get random word from remaining words
    currentWord = availableWords[Math.floor(Math.random() * availableWords.length)];
    usedWords.add(currentWord);
    
    // Load image
    const cardImage = document.getElementById('card-image');
    cardImage.src = wordData[currentWord].image;
    
    // Only set up audio if not in hard mode
    if (currentDifficulty !== 'hard') {
        currentWordAudio = new Audio(wordData[currentWord].audio);
        // Add click event listener to the image for playing audio
        cardImage.onclick = (e) => {
            e.stopPropagation(); // Prevent card flip
            if (currentWordAudio) {
                currentWordAudio.play();
            }
        };
    } else {
        // Remove audio functionality in hard mode
        currentWordAudio = null;
        cardImage.onclick = (e) => {
            e.stopPropagation(); // Only prevent card flip
        };
    }
    
    // Create letter boxes and draggable letters
    createLetterBoxes(currentWord);
    createDraggableLetters(currentWord);
    
    // Create check button if it doesn't exist
    if (!document.getElementById('check-button')) {
        createCheckButton();
    }
    
    document.getElementById('feedback').textContent = "";
}

function createCheckButton() {
    const container = document.getElementById('game-container');
    const existingButton = document.getElementById('check-button');
    
    // Remove existing button if it exists
    if (existingButton) {
        existingButton.remove();
    }
    
    const checkBtn = document.createElement('button');
    checkBtn.textContent = 'Check Answer';
    checkBtn.id = 'check-button';
    checkBtn.addEventListener('click', checkAnswer);
    container.appendChild(checkBtn);
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
            const shapes = ['★', '●', '♦', '♠', '♣', '♥'];
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
    hideGameElements(); // Hide elements initially
    createDifficultySelector();
    createLivesDisplay(); // Add this line
    
    // Pre-load the first word but don't show elements yet
    loadNewWord();
});
