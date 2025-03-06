// // Add this to a new JS file: mobile-fix.js
// // Then add it to index.html with a regular script tag (not as a module)

// (function() {
//     // Wait for DOM to be ready
//     document.addEventListener("DOMContentLoaded", function() {
//       console.log("Mobile fix loading...");
      
//       // Add these critical inline styles 
//       const criticalStyles = `
//         /* Super critical mobile fixes */
//         .card__face--front {
//           position: relative !important;
//         }
        
//         #flip-overlay-button {
//           position: absolute !important;
//           top: 0 !important;
//           left: 0 !important;
//           width: 100% !important;
//           height: 100% !important;
//           background: linear-gradient(to bottom, #ffb3b3, #ff8080) !important;
//           color: white !important;
//           font-size: 28px !important;
//           font-weight: bold !important;
//           display: flex !important;
//           justify-content: center !important;
//           align-items: center !important;
//           text-align: center !important;
//           border-radius: 16px !important;
//           border: none !important;
//           z-index: 1000 !important;
//           cursor: pointer !important;
//           animation: pulsate 1.5s infinite alternate !important;
//           font-family: 'Fredoka One', cursive, sans-serif !important;
//           text-shadow: 0 2px 4px rgba(0,0,0,0.3) !important;
//           -webkit-tap-highlight-color: rgba(0,0,0,0) !important;
//         }
        
//         @keyframes pulsate {
//           0% { 
//             transform: scale(1);
//             box-shadow: 0 0 10px rgba(255,128,128,0.7);
//           }
//           100% { 
//             transform: scale(1.05);
//             box-shadow: 0 0 20px rgba(255,128,128,0.9);
//           }
//         }
        
//         /* Make sure letters are draggable on mobile */
//         .draggable-letter {
//           touch-action: none !important;
//           -webkit-user-select: none !important;
//           user-select: none !important;
//           will-change: transform !important;
//         }
//       `;
      
//       // Add the styles to the head
//       const styleEl = document.createElement('style');
//       styleEl.textContent = criticalStyles;
//       document.head.appendChild(styleEl);
      
//       // Wait for initial HTML to load
//       setTimeout(function() {
//         // Step 1: Create an unmissable flip button
//         addFlipButton();
        
//         // Step 2: Fix the draggable letters when they appear
//         setupLetterObserver();
        
//         // Step 3: Fix audio playback
//         fixAudioPlayback();
//       }, 500);
      
//       function addFlipButton() {
//         console.log("Adding flip button...");
//         const cardFront = document.querySelector(".card__face--front");
        
//         if (!cardFront) {
//           console.error("Card front not found");
//           return;
//         }
        
//         // Clear existing content (except h2)
//         const frontTitle = cardFront.querySelector("h2");
//         cardFront.innerHTML = "";
        
//         // Create overlay button
//         const flipButton = document.createElement("button");
//         flipButton.id = "flip-overlay-button";
//         flipButton.innerHTML = "TAP HERE<br>TO START";
        
//         // Add event listeners
//         flipButton.addEventListener("click", flipCardManually);
//         flipButton.addEventListener("touchend", function(e) {
//           e.preventDefault();
//           flipCardManually();
//         });
        
//         // Add to card front
//         cardFront.appendChild(flipButton);
//         if (frontTitle) {
//           cardFront.appendChild(frontTitle);
//         }
//       }
      
//       function flipCardManually() {
//         console.log("Manual flip triggered");
        
//         // Get card inner element
//         const cardInner = document.querySelector("#card .card__inner");
//         if (!cardInner) {
//           console.error("Card inner not found");
//           return;
//         }
        
//         // Add flipped class
//         if (!cardInner.classList.contains("is-flipped")) {
//           cardInner.classList.add("is-flipped");
          
//           // Call the game's load function
//           setTimeout(function() {
//             if (typeof window.loadNewWordWithReset === 'function') {
//               window.loadNewWordWithReset();
//             } else if (typeof loadNewWordWithReset === 'function') {
//               loadNewWordWithReset();
//             }
            
//             // Show game elements
//             const hearts = document.querySelector(".hearts");
//             const checkBtn = document.querySelector("#check-btn");
            
//             if (hearts) hearts.style.display = "block";
//             if (checkBtn) checkBtn.style.display = "inline-block";
//           }, 500);
//         }
//       }
      
//       function setupLetterObserver() {
//         console.log("Setting up letter observer...");
        
//         // Get the container
//         const letterContainer = document.querySelector(".available-letters-container");
//         if (!letterContainer) {
//           console.error("Letter container not found");
//           return;
//         }
        
//         // Create mutation observer
//         const observer = new MutationObserver(function(mutations) {
//           mutations.forEach(function(mutation) {
//             if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
//               // Process added letters
//               mutation.addedNodes.forEach(function(node) {
//                 if (node.classList && node.classList.contains("draggable-letter")) {
//                   initializeLetter(node);
//                 }
//               });
//             }
//           });
//         });
        
//         // Start observing
//         observer.observe(letterContainer, { 
//           childList: true 
//         });
//       }
      
//       function initializeLetter(letter) {
//         console.log("Initializing letter:", letter.textContent);
        
//         // Add mobile-friendly styles
//         letter.style.touchAction = "none";
//         letter.style.userSelect = "none";
//         letter.style.webkitUserSelect = "none";
        
//         // Check if GSAP is available
//         if (typeof Draggable !== 'undefined') {
//           // Remove any existing Draggable
//           const existing = Draggable.get(letter);
//           if (existing) existing.kill();
          
//           // Create new Draggable
//           Draggable.create(letter, {
//             type: "x,y",
//             zIndexBoost: true,
//             onDragEnd: function() {
//               // Use the game's snap function
//               if (typeof window.snapLetterToBox === 'function') {
//                 window.snapLetterToBox(this.target);
//               } else if (typeof snapLetterToBox === 'function') {
//                 snapLetterToBox(this.target);
//               }
//             }
//           });
//         }
//       }
      
//       function fixAudioPlayback() {
//         console.log("Setting up audio fix...");
        
//         // Fix for the card image audio
//         setTimeout(function() {
//           const cardImage = document.querySelector("#card-image");
//           if (!cardImage) return;
          
//           // Add click handler with iOS compatibility
//           cardImage.addEventListener("click", function() {
//             console.log("Card image clicked");
            
//             // Create silent audio to unlock iOS audio
//             const unlockAudio = new Audio("data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//EREAAAAAAA");
//             unlockAudio.play().then(function() {
//               // Now play the actual audio
//               if (window.currentWordAudio) {
//                 const audioClone = new Audio(window.currentWordAudio.src);
//                 audioClone.play();
//               }
//             }).catch(function() {
//               // Direct play as fallback
//               if (window.currentWordAudio) {
//                 window.currentWordAudio.play();
//               }
//             });
//           });
          
//           // Make it visually clear the image is clickable
//           cardImage.style.cursor = "pointer";
//           cardImage.style.border = "3px solid #ff8080";
//         }, 1000);
//       }
//     });
//   })();