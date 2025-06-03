const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const API_KEY = process.env.POKEMON_TCG_API_KEY || '';
const BASE_URL = 'https://api.pokemontcg.io/v2';
const OUTPUT_FILE = path.join(__dirname, 'sm-cards.json');

// SM sets we want to fetch (SM1 through SM12)
const SM_SETS = [
  'sm1', 'sm2', 'sm3', 'sm4', 'sm5', 'sm6', 'sm7', 'sm8', 'sm9', 'sm10', 'sm11', 'sm12'
];

// Get options for API requests
const getOptions = () => {
  const options = {
    headers: {},
    timeout: 30000 // 30 seconds timeout
  };

  if (API_KEY) {
    options.headers['X-Api-Key'] = API_KEY;
  }

  return options;
};

// Function to fetch all cards from a specific set
async function fetchCardsFromSet(setId) {
  console.log(`Fetching cards from set ${setId}...`);
  let page = 1;
  let allCards = [];
  let hasMorePages = true;

  while (hasMorePages) {
    try {
      const response = await axios.get(
        `${BASE_URL}/cards?q=set.id:${setId}&page=${page}&pageSize=250`,
        getOptions()
      );

      const { data, page: currentPage, pageSize, count, totalCount } = response.data;
      
      if (!data || data.length === 0) {
        hasMorePages = false;
      } else {
        allCards = [...allCards, ...data];
        console.log(`  Retrieved ${data.length} cards from page ${currentPage} for set ${setId}`);
        
        // Check if we've reached the last page
        if (currentPage * pageSize >= count) {
          hasMorePages = false;
        } else {
          page++;
        }
      }
    } catch (error) {
      console.error(`Error fetching cards from set ${setId}, page ${page}:`, error.message);
      
      // If we get rate limited, wait a bit and try again
      if (error.response && error.response.status === 429) {
        console.log('Rate limited, waiting 5 seconds before retrying...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      } else {
        hasMorePages = false;
      }
    }
  }

  return allCards;
}

// Main function to fetch all cards from SM sets
async function fetchAllSMCards() {
  let allCards = [];
  
  for (const setId of SM_SETS) {
    try {
      const setCards = await fetchCardsFromSet(setId);
      allCards = [...allCards, ...setCards];
      console.log(`Fetched ${setCards.length} cards from set ${setId}`);
      
      // Wait a bit between sets to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error processing set ${setId}:`, error.message);
    }
  }

  return allCards;
}

// Execute the main function
console.log('Starting to fetch SM cards...');
fetchAllSMCards()
  .then(cards => {
    // Process cards to keep only necessary data
    const processedCards = cards.map(card => ({
      id: card.id,
      name: card.name,
      supertype: card.supertype,
      subtypes: card.subtypes,
      hp: card.hp,
      types: card.types,
      evolvesFrom: card.evolvesFrom,
      evolvesTo: card.evolvesTo,
      rules: card.rules,
      attacks: card.attacks,
      weaknesses: card.weaknesses,
      resistances: card.resistances,
      retreatCost: card.retreatCost,
      convertedRetreatCost: card.convertedRetreatCost,
      set: {
        id: card.set.id,
        name: card.set.name,
        series: card.set.series,
        printedTotal: card.set.printedTotal,
        total: card.set.total,
        releaseDate: card.set.releaseDate,
      },
      number: card.number,
      artist: card.artist,
      rarity: card.rarity,
      images: card.images,
    }));

    // Save to file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(processedCards, null, 2));
    console.log(`Successfully saved ${processedCards.length} cards to ${OUTPUT_FILE}`);
  })
  .catch(error => {
    console.error('Error fetching cards:', error.message);
  });
