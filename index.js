import express from 'express';
import { Server } from 'socket.io';
import { MongoClient } from 'mongodb';
import http from 'http';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import { getLocalIP } from './functions/getIp.js';
import dotenv from 'dotenv';
dotenv.config();

const app = express();

const localIp = getLocalIP();
const host = localIp || process.env.HOST;
const port = process.env.PORT || 3001;

app.use(cors({
  origin: [
    `http://localhost:3000`,
    `http://${host}:3000`,
    "http://115.99.19.93:3000"
  ],
  methods: ["GET", "POST"],
  credentials: true
}));

app.use(express.json());

const dbName = 'UsersDB';
const url = 'mongodb://localhost:27017';

const userConnections = new Map(); // Maintain socket connections for users

// JWT Middleware for protected routes
// const authenticateToken = (req, res, next) => {
//   const token = req.headers['authorization']?.split(' ')[1];
//   if (!token) return res.status(401).json({ error: 'Access token required' });

//   jwt.verify(token, 'your-secret-key', (err, user) => {
//     if (err) return res.status(403).json({ error: 'Invalid token' });
//     req.user = user;
//     next();
//   });
// };

// Protected Example Route
// app.get('/protected', authenticateToken, (req, res) => {
//   res.json({ message: `Hello, ${req.user.username}!` });
// });

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      `http://${host}:3000`,
      "http://115.99.19.93:3000"
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Authenticate Socket.IO Connections
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication error'));

  jwt.verify(token, 'your-secret-key', (err, user) => {
    if (err) return next(new Error('Authentication error'));
    socket.user = user;
    next();
  });
});

io.on('connection', (socket) => {
  const { username } = socket.user;
  console.log(`${username} connected`);

  // Add socket to user's connections
  if (!userConnections.has(username)) {
    userConnections.set(username, new Set());
  }
  userConnections.get(username).add(socket.id);
  
  const userClientsConnections = userConnections.get(username);

   console.log(userClientsConnections)


  socket.on('sendMessage', (data) => {
    const { targetUser, text } = data;
    console.log(`Message from ${username} to ${targetUser}: ${text}`);
  
    // Retrieve target user's socket IDs
    const targetSockets = userConnections.get(targetUser);
    if (targetSockets && targetSockets.size > 0) {
      targetSockets.forEach((socketId) => {
        io.to(socketId).emit('receiveMessage', {
          text,
          sentBy: username,
          timestamp: new Date()
        });
      });
    } else {
      console.log(`User ${targetUser} is not connected.`);
    }
  });
  

  socket.on('disconnect', () => {
    console.log(`${username} disconnected`);
    userConnections.get(username)?.delete(socket.id);
    if (userConnections.get(username)?.size === 0) {
      userConnections.delete(username);
    }
  });
});

// Database operations and routes remain unchanged
app.get('/users', async (req, res) => {
  try {
    const client = new MongoClient(url, { useUnifiedTopology: true });
    await client.connect();
    const db = client.db(dbName);
    const users = db.collection('users');
    const allUsers = await users.find().toArray();
    client.close();
    res.json(allUsers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const client = new MongoClient(url, { useUnifiedTopology: true });
    await client.connect();
    const db = client.db(dbName);
    const users = db.collection('users');
    const existingUser = await users.findOne({ username });
    client.close();
    if (existingUser) {
      return res.status(400).json({ error: 'Username already in use' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newClient = new MongoClient(url);
    await newClient.connect();
    const newDb = newClient.db(dbName);
    const newUsers = newDb.collection('users');
    await newUsers.insertOne({ ...req.body, username, password: hashedPassword });
    newClient.close();
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const client = new MongoClient(url, { useUnifiedTopology: true });
    await client.connect();
    const db = client.db(dbName);
    const users = db.collection('users');
    const user = await users.findOne({ username });
    if (!user) {
      client.close();
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    client.close();
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const userDetails = {
      username: user.username,
      email: user._id,
    };
    const token = jwt.sign(userDetails, 'your-secret-key', { expiresIn: '1h' });
    res.json({ token, userDetails });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

server.listen(port, host, () => {
  console.log(`Server is running at http://${host}:${port}`);
});
