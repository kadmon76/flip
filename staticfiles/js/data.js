// data.js
// This script manages all data-related operations for the game.
// It includes functions to load, fetch, and process data from external files (e.g., JSON files).

export async function loadWordData(filePath) {
    console.log(`Loading word data from ${filePath}`);
    const response = await fetch(filePath);
    if (!response.ok) {
        throw new Error(`Failed to fetch data from ${filePath}`);
    }
    return await response.json();
}
