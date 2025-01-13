# Flip Card Spelling Game - Progress Tracker

## Overview
This interactive spelling game is designed for 8-9-year-old children learning English as a second language. It uses playful visuals, audio, and feedback to make learning fun and effective.

---

## Current Features

### 1. Game Structure
- **Flip Card Mechanics**: 
  - Front: "Flip to Start".
  - Back: Image of the word to spell.
- **Letter Interaction**:
  - Drag-and-drop letters into boxes.
  - Snap letters into correct positions.
- **Feedback**:
  - Heart system for tracking attempts.
  - Success/failure messages and animations.
  - Audio playback for correct words.

### 2. Words & Assets
- A variety of animals with images and sounds:
  - **Words**: dog, cat, fish, bird, frog, rabbit, horse, lion, tiger, deer, wolf, bear.
  - **Assets**: SVG images and MP3 audio.

---

## Planned Features

### 1. Word Series (Folders)
Allow users to choose from different categories or series of words:
- **Series Ideas**:
  - **Animals**: Current series (e.g., dog, cat, lion).
  - **Fruits & Vegetables**: apple, banana, carrot.
  - **Everyday Objects**: chair, table, phone.

### 2. User Progress Tracking
- **Track User Advancement**:
  - Save progress, such as words completed and difficulty level.
- **Problem Word Identification**:
  - Record and display words the user struggles with for targeted practice.
- **Score & Achievement System**:
  - Add points for correct answers and unlock badges.

### 3. Enhanced Audio Learning
- **Syllable Emphasis**:
  - Add audio for each word that emphasizes syllables to improve spelling:
    - Example: "Rab-bit" or "Ti-ger".
- **Phonics Support**:
  - Include sounds for individual letters and phonemes.

### 4. Analytics & Reports
- Track and display:
  - Total words attempted.
  - Accuracy percentage.
  - Average time spent on each word.

---

## To-Do List

### Game Functionality
- [ ] Add folder selection for word series.
- [ ] Implement progress tracking and save/load functionality.
- [ ] Develop a system to identify and recommend "problem words."
- [ ] Integrate syllable-focused audio for existing words.

### Visual & Audio Enhancements
- [ ] Add folder icons and animations for series selection.
- [ ] Create celebratory effects for achievements and milestones.
- [ ] Enhance feedback animations (e.g., bounces, sparkles).

### Testing & Optimization
- [ ] Test progress tracking and save/load across sessions.
- [ ] Ensure drag-and-drop mechanics work on all devices.

---

## How to Add a New Series
1. Create a new folder in `wordData`:
   ```javascript
   const wordData = {
       animals: {
           dog: { image: "/static/images/animals/dog.svg", audio: "/static/sounds/words/dog.mp3" },
           cat: { image: "/static/images/animals/cat.svg", audio: "/static/sounds/words/cat.mp3" },
       },
       fruits: {
           apple: { image: "/static/images/fruits/apple.svg", audio: "/static/sounds/words/apple.mp3" },
       },
   };
