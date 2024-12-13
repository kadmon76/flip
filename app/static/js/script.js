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
    const lettersContainer = document.getElementById('available-letters');
    lettersContainer.innerHTML = '';
    
    // Shuffle the letters
    const letters = word.split('').sort(() => Math.random() - 0.5);
    
    letters.forEach((letter, index) => {
        const letterDiv = document.createElement('div');
        letterDiv.className = 'draggable-letter';
        letterDiv.textContent = letter;
        letterDiv.draggable = true;
        letterDiv.id = `letter-${index}`; // Add unique ID
        letterDiv.addEventListener('dragstart', handleDragStart);
        letterDiv.addEventListener('dragend', handleDragEnd);
        lettersContainer.appendChild(letterDiv);
    });
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

// Update the checkAnswer function to use random sounds
function checkAnswer() {
    console.log('Checking answer...'); // Debug log
    const boxes = Array.from(document.getElementsByClassName('letter-box'));
    
    // First check if all boxes are filled
    if (!boxes.every(box => box.textContent)) {
        const feedback = document.getElementById('feedback');
        feedback.textContent = "Fill all boxes first!";
        feedback.className = "feedback error animate-shake";
        return;
    }

    const attempt = boxes.map(box => box.textContent).join('');
    console.log('Attempt:', attempt);
    console.log('Current word:', currentWord);
    
    if (attempt === currentWord) {
        // Correct answer
        boxes.forEach(box => box.classList.add('correct'));
        playRandomSound(sounds.correct);
        showSuccess();
    } else {
        // Wrong answer
        playRandomSound(sounds.wrong);
        boxes.forEach((box, index) => {
            if (box.textContent === currentWord[index]) {
                box.classList.add('correct');
            } else {
                box.classList.add('incorrect');
                // Get the original letter and make it visible again
                const originalLetter = document.getElementById(box.dataset.originalLetter);
                if (originalLetter) {
                    originalLetter.classList.remove('hidden');
                }
                
                // Clear the box after animation
                setTimeout(() => {
                    box.classList.remove('incorrect');
                    box.textContent = '';
                    box.dataset.originalLetter = '';
                }, 500);
            }
        });
    }
}

// Function to flip card and load new word
function flipCard() {
    const card = document.getElementById('card');
    if (!card.classList.contains('flipped')) {
        // If this is the first flip or after a success, load new word
        card.classList.add('flipped');
        loadNewWord();
        showGameElements(); // Show elements only after flip
    } else {
        // Only play the word audio when clicking on the image
        const cardImage = document.getElementById('card-image');
        if (e.target === cardImage && currentWordAudio) {
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
    
    // Get random word from remaining words
    currentWord = availableWords[Math.floor(Math.random() * availableWords.length)];
    usedWords.add(currentWord);
    
    // Load image
    const cardImage = document.getElementById('card-image');
    cardImage.src = wordData[currentWord].image;
    
    // Load audio but don't play it
    currentWordAudio = new Audio(wordData[currentWord].audio);
    
    // Add click event listener to the image for playing audio
    cardImage.onclick = (e) => {
        e.stopPropagation(); // Prevent card flip
        if (currentWordAudio) {
            currentWordAudio.play();
        }
    };
    
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
    
    // Pre-load the first word but don't show elements yet
    loadNewWord();
});
