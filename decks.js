// Sample deck data with cards from sm-cards.json
const fs = require('fs');
const path = require('path');

// Load the SM cards data
let smCards = [];
try {
  const cardsFilePath = path.join(__dirname, 'sm-cards.json');
  if (fs.existsSync(cardsFilePath)) {
    const cardsData = fs.readFileSync(cardsFilePath, 'utf8');
    smCards = JSON.parse(cardsData);
    console.log(`Loaded ${smCards.length} cards for sample decks`);
  }
} catch (error) {
  console.error('Error loading SM cards for sample decks:', error.message);
}

// Helper function to get random cards of a specific type
function getRandomCardsOfType(type, count) {
  const typeCards = smCards.filter(card => card.types && card.types.includes(type));
  const result = [];
  
  // If we don't have enough cards of this type, return what we have
  if (typeCards.length === 0) {
    return [{ id: 'sm1-1', count: 1 }]; // Fallback to a default card
  }
  
  // Get random cards of this type
  for (let i = 0; i < count && i < typeCards.length; i++) {
    const randomIndex = Math.floor(Math.random() * typeCards.length);
    const card = typeCards[randomIndex];
    
    // Check if we already added this card
    const existingCard = result.find(c => c.id === card.id);
    if (existingCard) {
      existingCard.count = Math.min(existingCard.count + 1, 4); // Max 4 of any card
    } else {
      result.push({ id: card.id, count: Math.floor(Math.random() * 3) + 1 }); // 1-3 copies
    }
    
    // Remove the card so we don't pick it again
    typeCards.splice(randomIndex, 1);
  }
  
  return result;
}

// Create sample decks with real SM cards
const sampleDecks = [
  {
    id: 1,
    userId: 0, // Corresponds to John Doe
    name: "John's Fire Deck",
    imageUrl: "",
    cards: getRandomCardsOfType('Fire', 10),
    favorite: true,
    lastModified: new Date().toISOString()
  },
  {
    id: 2,
    userId: 0,
    name: "John's Water Deck",
    imageUrl: "",
    cards: getRandomCardsOfType('Water', 8),
    favorite: false,
    lastModified: new Date(Date.now() - 86400000).toISOString() // 1 day ago
  },
  {
    id: 3,
    userId: 1, // Corresponds to Jane Doe
    name: "Jane's Electric Deck",
    imageUrl: "",
    cards: getRandomCardsOfType('Lightning', 12),
    favorite: true,
    lastModified: new Date().toISOString()
  },
  {
    id: 4,
    userId: 0,
    name: "John's Psychic Deck",
    imageUrl: "",
    cards: getRandomCardsOfType('Psychic', 9),
    favorite: true,
    lastModified: new Date().toISOString()
  },
  {
    id: 5,
    userId: 1,
    name: "Jane's Grass Deck",
    imageUrl: "",
    cards: getRandomCardsOfType('Grass', 10),
    favorite: false,
    lastModified: new Date(Date.now() - 172800000).toISOString() // 2 days ago
  }
];

module.exports = sampleDecks;
