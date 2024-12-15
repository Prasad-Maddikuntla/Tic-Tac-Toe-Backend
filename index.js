const express = require('express');
const { Server } = require('socket.io');
const MongoClient = require('mongodb').MongoClient;
const http = require('http'); // Import http module
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();

const host = process.env.HOST || '0.0.0.0';
const port = process.env.PORT || 3001;




app.use(cors({
  origin: [`http://localhost:3000`,`http://${host}:3000`,"http://115.99.19.93:3000"], // Allow requests from this origin
  methods: ["GET", "POST"],
  credentials: true
}));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000",`http://${host}:3000`,"http://115.99.19.93:3000"], // Match this with your frontend origin
    methods: ["GET", "POST"],
    credentials: true
  }
});


app.use(express.json());

const dbName = 'UsersDB';
const url = 'mongodb://localhost:27017';

const userRooms = new Map(); 
io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('joinRoom', (username) => {
    const roomName = `room_${username}`;
    socket.join(roomName);
    userRooms.set(socket.id, roomName);
    console.log(`${username} joined room ${roomName}`);
  });

  socket.on('sendMessage', (data) => {
    console.log("sendMessage", data);
    const roomName = userRooms.get(socket.id);
    io.to(`room_${data.targetUser}`).emit('receiveMessage', {...data, sentBy: 'targetUser'});
  });
});

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
