// This file exports the Pokémon cards data for use in the server

let cards = [];

// Load cards from the JSON file if it exists
try {
  const fs = require('fs');
  const path = require('path');
  const cardsFilePath = path.join(__dirname, 'sm-cards.json');
  
  if (fs.existsSync(cardsFilePath)) {
    const cardsData = fs.readFileSync(cardsFilePath, 'utf8');
    cards = JSON.parse(cardsData);
    console.log(`Loaded ${cards.length} Pokémon cards from sm-cards.json`);
  } else {
    console.warn('sm-cards.json not found. Run fetch-sm-cards.js to generate the file.');
  }
} catch (error) {
  console.error('Error loading Pokémon cards:', error.message);
}

module.exports = cards;
