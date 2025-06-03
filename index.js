const crypto = require('node:crypto');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const users = require('./data.js');
let decks = require('./decks.js');
const cards = require('./cards.js');

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
  const requestTimestamp = new Date().toISOString();
  const logMessage = `[${requestTimestamp}] ${req.method} ${req.url} - IP: ${req.ip}\n`;
  
  // Log to console
  console.log(logMessage.trim());
  
  // Log to file
  const logFile = path.join(logsDir, `${new Date().toISOString().split('T')[0]}.log`);
  fs.appendFile(logFile, logMessage, (err) => {
    if (err) console.error('Error writing request log:', err);
  });
  
  // Log request body for non-GET requests (excluding sensitive data)
  if (req.method !== 'GET' && req.body) {
    const safeBody = { ...req.body };
    if (safeBody.password) safeBody.password = '[REDACTED]';
    
    const bodyLog = `[${requestTimestamp}] Request Body: ${JSON.stringify(safeBody)}\n`;
    console.log(bodyLog.trim());
    fs.appendFile(logFile, bodyLog, (err) => {
      if (err) console.error('Error writing request body log:', err);
    });
  }
  
  // Capture response data
  const originalSend = res.send;
  res.send = function(data) {
    const responseTimestamp = new Date().toISOString();
    const responseLog = `[${responseTimestamp}] Response: ${res.statusCode} ${data ? data.substring(0, 200) : ''}${data && data.length > 200 ? '...' : ''}\n`;
    console.log(responseLog.trim());
    fs.appendFile(logFile, responseLog, (err) => {
      if (err) console.error('Error writing response log:', err);
    });
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
      // Attach user to request object for subsequent route handlers
      req.user = user;
      next();
    }
  }
});

app.get('/api/greet-me', (req, res) => {
  // Use req.user from middleware instead of verifying token again
  res.status(200).json({
    message: `Hi ${req.user.name}!`,
  });
});

// User Registration endpoint moved before auth middleware

// Get User Profile endpoint
app.get('/api/profile', (req, res) => {
  // Use req.user from middleware instead of verifying token again
  const userData = req.user;
  
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
  // Use req.user from middleware instead of verifying token again
  const userData = req.user;
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
          
          // Write the file to disk asynchronously
          fs.writeFile(filePath, base64Data, { encoding: 'base64' }, (err) => {
            if (err) console.error('Error saving profile picture:', err);
            else console.log(`Saved profile picture to: ${filePath}`);
          });
          
          // Update user profile with the file URL
          user.profilePicture = `http://localhost:3001/uploads/${fileName}`;
        } else {
          console.error('Invalid image data format');
        }
      } catch (error) {
        console.error('Error saving profile picture:', error);
      }
    } else if (profilePicture) {
      // Validate URL if it's not a data URL
      try {
        // Check if it's a valid URL and from trusted domains
        const url = new URL(profilePicture);
        const trustedDomains = ['localhost:3001', 'localhost', '127.0.0.1']; // Add other trusted domains as needed
        
        if (trustedDomains.some(domain => url.host.includes(domain))) {
          user.profilePicture = profilePicture;
        } else {
          console.error(`Untrusted profile picture URL: ${url.host}`);
          return res.status(400).json({ message: 'Profile picture URL must be from a trusted source or a data URL' });
        }
      } catch (e) {
        console.error('Invalid URL format for profile picture');
        return res.status(400).json({ message: 'Invalid profile picture URL format' });
      }
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
  
  // If username was changed, generate a new token
  const responseData = {
    message: 'Profile updated successfully',
    user: {
      username: user.username,
      name: user.name,
      profilePicture: user.profilePicture,
      pronouns: user.pronouns,
      description: user.description
    }
  };
  
  // If username was changed, include a new token in the response
  if (username !== undefined && username !== userData.username) {
    responseData.token = sign(user);
  }
  
  // Return updated user data
  res.status(200).json(responseData);
});

// Change Password endpoint
app.put('/api/profile/password', (req, res) => {
  // Use req.user from middleware instead of verifying token again
  const userData = req.user;
  const { currentPassword, newPassword } = req.body;
  
  console.log(`Password change request for user: ${userData.username}`);
  
  // Validate request body
  if (!currentPassword || typeof currentPassword !== 'string') {
    console.error('Current password is required');
    return res.status(400).json({ message: 'Current password is required' });
  }
  
  if (!newPassword || typeof newPassword !== 'string') {
    console.error('New password is required');
    return res.status(400).json({ message: 'New password is required' });
  }
  
  if (newPassword.length < 4) {
    console.error('New password must be at least 4 characters');
    return res.status(400).json({ message: 'New password must be at least 4 characters' });
  }
  
  // Find the user
  const userIndex = users.findIndex(u => u.username === userData.username);
  if (userIndex === -1) {
    console.error(`User not found: ${userData.username}`);
    return res.status(404).json({ message: 'User not found' });
  }
  
  const user = users[userIndex];
  
  // Verify current password
  if (user.password !== currentPassword) {
    console.error('Current password is incorrect');
    return res.status(400).json({ message: 'Current password is incorrect' });
  }
  
  // Update password
  user.password = newPassword;
  console.log(`Password updated for user: ${user.username}`);
  
  // Return success message
  res.status(200).json({ message: 'Password updated successfully' });
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
  // Use req.user from middleware instead of verifying token again
  const userData = req.user;
  
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
  // Use req.user from middleware instead of verifying token again
  const userData = req.user;
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
  // Use req.user from middleware instead of verifying token again
  const userData = req.user;
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
  // Use req.user from middleware instead of verifying token again
  const userData = req.user;
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
  // Use req.user from middleware instead of verifying token again
  const userData = req.user;
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
  // Use req.user from middleware instead of verifying token again
  const userData = req.user;
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

// Get all cards endpoint (with pagination)
app.get('/api/cards', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 20;
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  
  // Return paginated results
  const paginatedCards = cards.slice(startIndex, endIndex);
  
  res.status(200).json({
    data: paginatedCards,
    page,
    pageSize,
    count: cards.length,
    totalPages: Math.ceil(cards.length / pageSize)
  });
});

// Get cards by set endpoint
app.get('/api/cards/set/:setId', (req, res) => {
  const setId = req.params.setId.toLowerCase();
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 20;
  
  // Filter cards by set ID
  const setCards = cards.filter(card => 
    card.set && card.set.id && card.set.id.toLowerCase() === setId
  );
  
  // Apply pagination
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedCards = setCards.slice(startIndex, endIndex);
  
  res.status(200).json({
    data: paginatedCards,
    page,
    pageSize,
    count: setCards.length,
    totalPages: Math.ceil(setCards.length / pageSize),
    set: setId
  });
});

// Search cards endpoint
app.get('/api/cards/search', (req, res) => {
  const { name, type, supertype, rarity, page = 1, pageSize = 20 } = req.query;
  const pageNum = parseInt(page);
  const size = parseInt(pageSize);
  
  // Filter cards based on search criteria
  let filteredCards = [...cards];
  
  if (name) {
    const searchName = name.toLowerCase();
    filteredCards = filteredCards.filter(card => 
      card.name && card.name.toLowerCase().includes(searchName)
    );
  }
  
  if (type) {
    const searchType = type.toLowerCase();
    filteredCards = filteredCards.filter(card => 
      card.types && card.types.some(t => t.toLowerCase().includes(searchType))
    );
  }
  
  if (supertype) {
    const searchSupertype = supertype.toLowerCase();
    filteredCards = filteredCards.filter(card => 
      card.supertype && card.supertype.toLowerCase().includes(searchSupertype)
    );
  }
  
  if (rarity) {
    const searchRarity = rarity.toLowerCase();
    filteredCards = filteredCards.filter(card => 
      card.rarity && card.rarity.toLowerCase().includes(searchRarity)
    );
  }
  
  // Apply pagination
  const startIndex = (pageNum - 1) * size;
  const endIndex = startIndex + size;
  const paginatedCards = filteredCards.slice(startIndex, endIndex);
  
  res.status(200).json({
    data: paginatedCards,
    page: pageNum,
    pageSize: size,
    count: filteredCards.length,
    totalPages: Math.ceil(filteredCards.length / size)
  });
});

// Get card by ID endpoint
app.get('/api/cards/:id', (req, res) => {
  const cardId = req.params.id;
  
  // Find card by ID
  const card = cards.find(c => c.id === cardId);
  
  if (!card) {
    return res.status(404).json({ message: 'Card not found' });
  }
  
  res.status(200).json({ data: card });
});

app.listen(3001, (err) => {
  if(err) {
    console.error(`Error: ${err.message}`);
  } else {
    console.log('Server started on port 3001');
    console.log(`Server time: ${new Date().toISOString()}`);
    console.log(`Log files location: ${logsDir}`);
    console.log(`Loaded ${cards.length} Pokémon cards`);
  }
});
