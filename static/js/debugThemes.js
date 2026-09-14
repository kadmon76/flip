// debugThemes.js - Debugging script for theme selection issues
console.log("Theme debugger script loaded");

document.addEventListener('DOMContentLoaded', function() {
    console.log("Theme debugger: Checking for theme buttons");
    
    // Check if theme buttons exist
    const themeButtons = document.querySelectorAll(".theme-btn");
    console.log("Theme buttons found:", themeButtons.length);
    
    // Log each button found
    themeButtons.forEach(button => {
        console.log("Found theme button:", button.dataset.theme);
        
        // Add a direct click handler to detect clicks
        button.addEventListener('click', function(e) {
            console.log("Theme button clicked directly:", e.target.dataset.theme);
            
            // Try to manually load the theme data
            fetch(`/static/data/${e.target.dataset.theme}.json`)
                .then(response => {
                    console.log("Theme data response:", response.status, response.statusText);
                    return response.json();
                })
                .then(data => {
                    console.log("Theme data loaded successfully:", Object.keys(data).length, "words");
                })
                .catch(error => {
                    console.error("Error loading theme data:", error);
                });
        });
    });
    
    // Check for theme container
    const themeContainer = document.getElementById("theme-container");
    console.log("Theme container found:", !!themeContainer);
    if (themeContainer) {
        console.log("Theme container display:", window.getComputedStyle(themeContainer).display);
    }
    
    // Test direct access to the JSON files
    console.log("Testing direct access to JSON files...");
    fetch('/static/data/animals.json')
        .then(response => {
            console.log("Animals JSON response:", response.status, response.statusText);
            return response.ok ? response.json() : null;
        })
        .then(data => {
            if (data) console.log("Animals data loaded, sample keys:", Object.keys(data).slice(0, 3));
        })
        .catch(error => {
            console.error("Error accessing animals.json:", error);
        });
        
    fetch('/static/data/transportation.json')
        .then(response => {
            console.log("Transportation JSON response:", response.status, response.statusText);
            return response.ok ? response.json() : null;
        })
        .then(data => {
            if (data) console.log("Transportation data loaded, sample keys:", Object.keys(data).slice(0, 3));
        })
        .catch(error => {
            console.error("Error accessing transportation.json:", error);
        });
});