// ui.js
// This script contains all functions related to updating and interacting with the user interface.
// Functions here create and manipulate HTML elements, handle animations, and manage the game's visual feedback.

// Function to create a game card
export function createCard(data) {

    const card = document.createElement('div');
    card.className = 'game-card';
    card.innerHTML = `
        <div class="card-content">
            <p>${data.word}</p>
        </div>
    `;
    return card;
}

// Function to update the score display
export function updateScoreDisplay(score) {
    const scoreElement = document.getElementById('score-display');
    if (scoreElement) {
        scoreElement.textContent = `Score: ${score}`;
    }
}

// Function to display a message to the user
export function showMessage(message) {
    const messageElement = document.getElementById('game-message');
    if (messageElement) {
        messageElement.textContent = message;
        messageElement.style.visibility = 'visible';
    }
}

// Function to hide a message
export function hideMessage() {
    const messageElement = document.getElementById('game-message');
    if (messageElement) {
        messageElement.style.visibility = 'hidden';
    }
}

// Function to reset UI elements for a new game
export function resetUI() {
    const messageElement = document.getElementById('game-message');
    const scoreElement = document.getElementById('score-display');
    if (messageElement) {
        messageElement.textContent = '';
        messageElement.style.visibility = 'hidden';
    }
    if (scoreElement) {
        scoreElement.textContent = 'Score: 0';
    }
}
