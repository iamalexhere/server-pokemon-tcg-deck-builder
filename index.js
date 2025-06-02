const crypto = require('node:crypto');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const users = require('./data.js');

const app = express();

app.use(cors())
app.use(bodyParser.json());

const secret = 'thisisasecret';

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

app.listen(3001, (err) => {
  if(err) {
    console.error(`Error: ${err.message}`);
  } else {
    console.log('Listening...');
  }
});
