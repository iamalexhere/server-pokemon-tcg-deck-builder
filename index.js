const crypto = require('node:crypto');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const users = require('./data.js');
let decks = require('./decks.js');

// Create uploads directory for profile pictures if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

const app = express();

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Logger middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${req.method} ${req.url} - IP: ${req.ip}\n`;
  
  // Log to console
  console.log(logMessage.trim());
  
  // Log to file
  const logFile = path.join(logsDir, `${new Date().toISOString().split('T')[0]}.log`);
  fs.appendFileSync(logFile, logMessage);
  
  // Log request body for non-GET requests (excluding sensitive data)
  if (req.method !== 'GET' && req.body) {
    const safeBody = { ...req.body };
    if (safeBody.password) safeBody.password = '[REDACTED]';
    
    const bodyLog = `[${timestamp}] Request Body: ${JSON.stringify(safeBody)}\n`;
    console.log(bodyLog.trim());
    fs.appendFileSync(logFile, bodyLog);
  }
  
  // Capture response data
  const originalSend = res.send;
  res.send = function(data) {
    const responseLog = `[${timestamp}] Response: ${res.statusCode} ${data ? data.substring(0, 200) : ''}${data && data.length > 200 ? '...' : ''}\n`;
    console.log(responseLog.trim());
    fs.appendFileSync(logFile, responseLog);
    originalSend.apply(res, arguments);
  };
  
  next();
});

app.use(cors())
app.use(bodyParser.json({ limit: '10mb' })); // Increased limit for profile pictures

// Serve static files from the root directory (for default.png)
app.use(express.static(__dirname));

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Copy default profile picture to uploads if it doesn't exist there
const defaultPicSrc = path.join(__dirname, 'default.png');
const defaultPicDest = path.join(uploadsDir, 'default.png');
if (fs.existsSync(defaultPicSrc) && !fs.existsSync(defaultPicDest)) {
  fs.copyFileSync(defaultPicSrc, defaultPicDest);
  console.log('Copied default profile picture to uploads directory');
}

const secret = 'thisisasecret';

// Node.js equivalent of browser's btoa function (string to base64)
function btoa(str) {
  return Buffer.from(str).toString('base64');
}

// Node.js equivalent of browser's atob function (base64 to string)
function atob(base64) {
  return Buffer.from(base64, 'base64').toString();
}

function sign(data) {
  const plain = btoa(JSON.stringify(data))
  const sig = crypto
    .createHmac('sha512', secret)
    .update(plain)
    .digest('base64');
  return `${plain}.${sig}`
}

function verify(token) {
  const parts = token.split('.');
  if(parts.length !== 2) return null;

  const plain = parts[0];
  const receivedSig = parts[1];

  const recalculatedSig = crypto
    .createHmac('sha512', secret)
    .update(plain)
    .digest('base64');

  if(receivedSig === recalculatedSig) {
    return JSON.parse(atob(plain));
  } else {
    return null;
  }
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if(typeof username !== 'string' || username.length < 1) {
    res.status(401).json({
      message: 'username is required',
    });
    return;
  }

  if(typeof password !== 'string' || password.length < 1) {
    res.status(401).json({
      message: 'password is required',
    });
    return;
  }

  let id = null;
  for(let i = 0; i < users.length; i++) {
    // for obvious reasons, do not store password as plain text
    if(users[i].username === username 
      && users[i].password === password) { 
      id = i;
      break;
    }
  }

  if(id === null) {
    res.status(401).json({
      message: 'login failed',
    });
  } else {
    res.status(200).json({
      token: sign(users[id]),
    });
  }
});

// User Registration endpoint - placed before auth middleware
app.post('/api/register', (req, res) => {
  const { username, password, name } = req.body;

  // Validate input
  if (!username || typeof username !== 'string' || username.length < 3) {
    return res.status(400).json({ message: 'Username must be at least 3 characters' });
  }

  if (!password || typeof password !== 'string' || password.length < 4) {
    return res.status(400).json({ message: 'Password must be at least 4 characters' });
  }

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ message: 'Name is required' });
  }

  // Check if username already exists
  const userExists = users.some(user => user.username === username);
  if (userExists) {
    return res.status(400).json({ message: 'Username already exists' });
  }

  // Create new user
  const newUser = {
    name,
    username,
    password,
    profilePicture: '',
    pronouns: '',
    description: '',
    createdAt: new Date().toISOString()
  };

  users.push(newUser);

  res.status(201).json({
    message: 'User registered successfully',
    user: { username: newUser.username, name: newUser.name }
  });
});

app.use((req, res, next) => {
  if(!req.headers.authorization) {
    res.status(403).json({
      message: 'go login first, buddy!'
    });
  } else {
    const user = verify(req.headers.authorization);
    if(user === null) {
      res.status(403).json({
        message: 'go login first, buddy!'
      });
    } else {
      next();
    }
  }
});

app.get('/api/greet-me', (req, res) => {
  const user = verify(req.headers.authorization);
  res.status(200).json({
    message: `Hi ${user.name}!`,
  });
});

// User Registration endpoint moved before auth middleware

// Get User Profile endpoint
app.get('/api/profile', (req, res) => {
  const userData = verify(req.headers.authorization);
  
  // Find the user by username
  const userIndex = users.findIndex(u => u.username === userData.username);
  if (userIndex === -1) {
    return res.status(404).json({ message: 'User not found' });
  }
  
  const user = users[userIndex];
  
  // Format profile picture URL if it's a relative path
  let profilePicture = user.profilePicture;
  
  // If profilePicture starts with ./ or is just 'default.png', convert to absolute URL
  if (profilePicture && (profilePicture.startsWith('./') || profilePicture === 'default.png')) {
    // Remove ./ if present
    const pictureName = profilePicture.replace('./', '');
    profilePicture = `http://localhost:3001/${pictureName}`;
    console.log(`Converted profile picture path to: ${profilePicture}`);
  }
  
  // Return user profile data (excluding password)
  res.status(200).json({
    username: user.username,
    name: user.name,
    profilePicture: profilePicture,
    pronouns: user.pronouns,
    description: user.description
  });
});

// Update User Profile endpoint
app.put('/api/profile', (req, res) => {
  const userData = verify(req.headers.authorization);
  const { username, profilePicture, pronouns, description } = req.body;
  
  console.log(`Profile update request for user: ${userData.username}`);
  if (profilePicture) {
    console.log(`Profile picture included: ${profilePicture.substring(0, 30)}...`);
  }
  
  // Find the user by username
  const userIndex = users.findIndex(u => u.username === userData.username);
  if (userIndex === -1) {
    console.error(`User not found: ${userData.username}`);
    return res.status(404).json({ message: 'User not found' });
  }
  
  const user = users[userIndex];
  console.log(`Found user at index ${userIndex}: ${user.username}`);
  
  // Update user data
  if (username !== undefined && username !== user.username) {
    // Check if new username is already taken
    const usernameExists = users.some((u, idx) => idx !== userIndex && u.username === username);
    if (usernameExists) {
      console.error(`Username already exists: ${username}`);
      return res.status(400).json({ message: 'Username already exists' });
    }
    console.log(`Updating username from ${user.username} to ${username}`);
    user.username = username;
  }
  
  if (profilePicture !== undefined) {
    console.log(`Updating profile picture for ${user.username}`);
    
    // Handle base64 image data
    if (profilePicture && profilePicture.startsWith('data:image')) {
      try {
        // Extract the base64 data and file type
        const matches = profilePicture.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        
        if (matches && matches.length === 3) {
          const fileType = matches[1].split('/')[1];
          const base64Data = matches[2];
          const fileName = `${user.username}_${Date.now()}.${fileType}`;
          const filePath = path.join(uploadsDir, fileName);
          
          // Write the file to disk
          fs.writeFileSync(filePath, base64Data, { encoding: 'base64' });
          
          // Update user profile with the file URL
          user.profilePicture = `http://localhost:3001/uploads/${fileName}`;
          console.log(`Saved profile picture to: ${filePath}`);
        } else {
          console.error('Invalid image data format');
        }
      } catch (error) {
        console.error('Error saving profile picture:', error);
      }
    } else {
      // If it's a URL or path, save it as is
      user.profilePicture = profilePicture;
    }
  }
  
  if (pronouns !== undefined) {
    console.log(`Updating pronouns for ${user.username}: ${pronouns}`);
    user.pronouns = pronouns;
  }
  
  if (description !== undefined) {
    console.log(`Updating description for ${user.username}`);
    user.description = description;
  }
  
  // Return updated user data
  res.status(200).json({
    message: 'Profile updated successfully',
    user: {
      username: user.username,
      name: user.name,
      profilePicture: user.profilePicture,
      pronouns: user.pronouns,
      description: user.description
    }
  });
});

// Get Recent Decks endpoint
app.get('/api/decks/recent', (req, res) => {
  const userData = verify(req.headers.authorization);
  
  // Find user index
  const userIndex = users.findIndex(u => u.username === userData.username);
  if (userIndex === -1) {
    return res.status(404).json({ message: 'User not found' });
  }
  
  // Get user's decks and sort by last modified date
  const userDecks = decks
    .filter(deck => deck.userId === userIndex)
    .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified))
    .slice(0, 3); // Get top 3 most recent
  
  // Format decks for response
  const formattedDecks = userDecks.map(deck => ({
    id: deck.id,
    name: deck.name,
    imageUrl: deck.imageUrl,
    cardCount: deck.cards.reduce((total, card) => total + card.count, 0)
  }));
  
  res.status(200).json({
    decks: formattedDecks
  });
});

// Get Favorite Decks endpoint
app.get('/api/decks/favorites', (req, res) => {
  const userData = verify(req.headers.authorization);
  
  // Find user index
  const userIndex = users.findIndex(u => u.username === userData.username);
  if (userIndex === -1) {
    return res.status(404).json({ message: 'User not found' });
  }
  
  // Get user's favorite decks
  const userDecks = decks
    .filter(deck => deck.userId === userIndex && deck.favorite)
    .slice(0, 6); // Get up to 6 favorite decks
  
  // Format decks for response
  const formattedDecks = userDecks.map(deck => ({
    id: deck.id,
    name: deck.name,
    imageUrl: deck.imageUrl,
    cardCount: deck.cards.reduce((total, card) => total + card.count, 0)
  }));
  
  res.status(200).json({
    decks: formattedDecks
  });
});

// Get All Decks endpoint
app.get('/api/decks', (req, res) => {
  const userData = verify(req.headers.authorization);
  
  // Find user index
  const userIndex = users.findIndex(u => u.username === userData.username);
  if (userIndex === -1) {
    return res.status(404).json({ message: 'User not found' });
  }
  
  // Get query parameters for pagination and search
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 9;
  const search = req.query.search || '';
  
  // Filter decks by user and search term
  const userDecks = decks
    .filter(deck => {
      return deck.userId === userIndex && 
             (search === '' || deck.name.toLowerCase().includes(search.toLowerCase()));
    });
  
  // Calculate pagination
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const totalPages = Math.ceil(userDecks.length / limit);
  
  // Get paginated decks
  const paginatedDecks = userDecks.slice(startIndex, endIndex);
  
  // Format decks for response
  const formattedDecks = paginatedDecks.map(deck => ({
    id: deck.id,
    name: deck.name,
    imageUrl: deck.imageUrl,
    cardCount: deck.cards.reduce((total, card) => total + card.count, 0)
  }));
  
  res.status(200).json({
    decks: formattedDecks,
    totalPages
  });
});

// Get Deck by ID endpoint
app.get('/api/decks/:id', (req, res) => {
  const userData = verify(req.headers.authorization);
  const deckId = parseInt(req.params.id);
  
  // Find user index
  const userIndex = users.findIndex(u => u.username === userData.username);
  if (userIndex === -1) {
    return res.status(404).json({ message: 'User not found' });
  }
  
  // Find deck
  const deck = decks.find(d => d.id === deckId && d.userId === userIndex);
  if (!deck) {
    return res.status(404).json({ message: 'Deck not found' });
  }
  
  res.status(200).json({
    id: deck.id,
    name: deck.name,
    imageUrl: deck.imageUrl,
    cards: deck.cards,
    favorite: deck.favorite
  });
});

// Create Deck endpoint
app.post('/api/decks', (req, res) => {
  const userData = verify(req.headers.authorization);
  const { name, imageUrl = '' } = req.body;
  
  // Validate input
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ message: 'Deck name is required' });
  }
  
  // Find user index
  const userIndex = users.findIndex(u => u.username === userData.username);
  if (userIndex === -1) {
    return res.status(404).json({ message: 'User not found' });
  }
  
  // Generate new deck ID
  const newId = decks.length > 0 ? Math.max(...decks.map(d => d.id)) + 1 : 1;
  
  // Create new deck
  const newDeck = {
    id: newId,
    userId: userIndex,
    name,
    imageUrl,
    cards: [],
    favorite: false,
    lastModified: new Date().toISOString()
  };
  
  decks.push(newDeck);
  
  res.status(201).json({
    message: 'Deck created successfully',
    deck: {
      id: newDeck.id,
      name: newDeck.name,
      imageUrl: newDeck.imageUrl,
      cardCount: 0
    }
  });
});

// Update Deck endpoint
app.put('/api/decks/:id', (req, res) => {
  const userData = verify(req.headers.authorization);
  const deckId = parseInt(req.params.id);
  const { name, imageUrl, cards } = req.body;
  
  // Find user index
  const userIndex = users.findIndex(u => u.username === userData.username);
  if (userIndex === -1) {
    return res.status(404).json({ message: 'User not found' });
  }
  
  // Find deck index
  const deckIndex = decks.findIndex(d => d.id === deckId && d.userId === userIndex);
  if (deckIndex === -1) {
    return res.status(404).json({ message: 'Deck not found' });
  }
  
  // Update deck data
  if (name !== undefined) {
    decks[deckIndex].name = name;
  }
  
  if (imageUrl !== undefined) {
    decks[deckIndex].imageUrl = imageUrl;
  }
  
  if (cards !== undefined) {
    decks[deckIndex].cards = cards;
  }
  
  // Update last modified timestamp
  decks[deckIndex].lastModified = new Date().toISOString();
  
  // Calculate card count
  const cardCount = decks[deckIndex].cards.reduce((total, card) => total + card.count, 0);
  
  res.status(200).json({
    message: 'Deck updated successfully',
    deck: {
      id: decks[deckIndex].id,
      name: decks[deckIndex].name,
      imageUrl: decks[deckIndex].imageUrl,
      cardCount
    }
  });
});

// Delete Deck endpoint
app.delete('/api/decks/:id', (req, res) => {
  const userData = verify(req.headers.authorization);
  const deckId = parseInt(req.params.id);
  
  // Find user index
  const userIndex = users.findIndex(u => u.username === userData.username);
  if (userIndex === -1) {
    return res.status(404).json({ message: 'User not found' });
  }
  
  // Find deck index
  const deckIndex = decks.findIndex(d => d.id === deckId && d.userId === userIndex);
  if (deckIndex === -1) {
    return res.status(404).json({ message: 'Deck not found' });
  }
  
  // Remove deck
  decks.splice(deckIndex, 1);
  
  res.status(200).json({
    message: 'Deck deleted successfully'
  });
});

// Get Recent Decks endpoint
app.get('/api/decks/recent', (req, res) => {
  const userData = verify(req.headers.authorization);
  
  // Find user index
  const userIndex = users.findIndex(u => u.username === userData.username);
  if (userIndex === -1) {
    return res.status(404).json({ message: 'User not found' });
  }
  
  // Get user's decks and sort by last modified date
  const userDecks = decks
    .filter(deck => deck.userId === userIndex)
    .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified))
    .slice(0, 3); // Get top 3 most recent
  
  // Format decks for response
  const formattedDecks = userDecks.map(deck => ({
    id: deck.id,
    name: deck.name,
    imageUrl: deck.imageUrl,
    cardCount: deck.cards.reduce((total, card) => total + card.count, 0)
  }));
  
  res.status(200).json({
    decks: formattedDecks
  });
});

// Get Favorite Decks endpoint
app.get('/api/decks/favorites', (req, res) => {
  const userData = verify(req.headers.authorization);
  
  // Find user index
  const userIndex = users.findIndex(u => u.username === userData.username);
  if (userIndex === -1) {
    return res.status(404).json({ message: 'User not found' });
  }
  
  // Get user's favorite decks
  const userDecks = decks
    .filter(deck => deck.userId === userIndex && deck.favorite)
    .slice(0, 6); // Get up to 6 favorite decks
  
  // Format decks for response
  const formattedDecks = userDecks.map(deck => ({
    id: deck.id,
    name: deck.name,
    imageUrl: deck.imageUrl,
    cardCount: deck.cards.reduce((total, card) => total + card.count, 0)
  }));
  
  res.status(200).json({
    decks: formattedDecks
  });
});

// Add/Remove Favorite Deck endpoint
app.post('/api/decks/:id/favorite', (req, res) => {
  const userData = verify(req.headers.authorization);
  const deckId = parseInt(req.params.id);
  const { favorite } = req.body;
  
  if (typeof favorite !== 'boolean') {
    return res.status(400).json({ message: 'Favorite status must be a boolean' });
  }
  
  // Find user index
  const userIndex = users.findIndex(u => u.username === userData.username);
  if (userIndex === -1) {
    return res.status(404).json({ message: 'User not found' });
  }
  
  // Find deck index
  const deckIndex = decks.findIndex(d => d.id === deckId && d.userId === userIndex);
  if (deckIndex === -1) {
    return res.status(404).json({ message: 'Deck not found' });
  }
  
  // Update favorite status
  decks[deckIndex].favorite = favorite;
  
  res.status(200).json({
    message: `Deck ${favorite ? 'added to' : 'removed from'} favorites`,
    favorite
  });
});

app.listen(3001, (err) => {
  if(err) {
    console.error(`Error: ${err.message}`);
  } else {
    console.log('Server started on port 3001');
    console.log(`Server time: ${new Date().toISOString()}`);
    console.log(`Log files location: ${logsDir}`);
  }
});
