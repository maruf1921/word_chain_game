const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms = {};

// A simple in-memory word list cache for AI moves (for demo, you can extend or replace this)
let englishWordsCache = null;

async function fetchEnglishWords() {
    // For demo purposes, you could replace with a bigger dictionary or a local word list
    // Here we load from dictionaryapi just as placeholder - you might want a static word list for performance
    // We will simulate AI by picking valid words starting with required letter later
    if (englishWordsCache) return englishWordsCache;
    // Simulated cache: load from a static file or external API if you want
    // Here just return a fixed list of words (extend as needed)
    englishWordsCache = [
'apple','ant','anchor','arrow','astronaut',
'banana','ball','bat','book','bridge',
'cat','car','cup','cloud','candle',
'dog','desk','drum','duck','dolphin',
'egg','ear','eagle','engine','elbow',
'fish','fan','fork','fire','feather',
'goat','grape','gift','glass','giraffe',
'hat','hammer','house','horse','honey',
'ice','ink','igloo','island','iron',
'jam','jar','jacket','jeep','jungle',
'kite','kangaroo','key','kettle','kiwi',
'lion','lamp','leaf','ladder','lizard',
'moon','mouse','milk','map','mango',
'net','nose','nail','nest','nugget',
'owl','orange','octopus','oven','oil',
'pen','pot','pencil','parrot','pumpkin',
'queen','quilt','quill','quiz','quartz',
'rat','rose','ring','radio','robot',
'sun','sock','star','snake','shoe',
'top','tap','table','train','tiger',
'umbrella','unicorn','urn','umpire','utensil',
'van','vase','violin','vulture','volcano',
'water','whale','window','watch','wolf',
'xylophone','xenon','xerox','xylem','xenial',
'yak','yarn','yogurt','yolk','yard',
'zebra','zip','zoo','zero','zeppelin'
];

    return englishWordsCache;
}

app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join_room', async ({ roomId, username }) => {
        socket.join(roomId);

        if (!rooms[roomId]) {
            rooms[roomId] = {
                users: [],
                words: [],
                turn: 0,
                scores: {},
                usernames: {},
                timer: null,
                aiPlaying: false
            };
        }

        rooms[roomId].users.push(socket.id);
        rooms[roomId].scores[socket.id] = 0;
        rooms[roomId].usernames[socket.id] = username;

        // If only one player, enable AI opponent
        if (rooms[roomId].users.length === 1) {
            rooms[roomId].aiPlaying = true;
        } else {
            rooms[roomId].aiPlaying = false;
        }

        // Start game if at least one player (including AI)
        const starter = rooms[roomId].users[rooms[roomId].turn];
        io.to(roomId).emit('start_game', {
            starter,
            usernames: rooms[roomId].usernames,
            aiPlaying: rooms[roomId].aiPlaying
        });

        startTimer(roomId);
    });

    socket.on('submit_word', async ({ roomId, word }) => {
        const room = rooms[roomId];
        if (!room) return;

        const lowerWord = word.toLowerCase();

        if (room.words.includes(lowerWord)) {
            io.to(roomId).emit('invalid_word', 'Word already used!');
            return;
        }

        if (room.words.length > 0) {
            const lastWord = room.words[room.words.length - 1];
            if (lowerWord[0] !== lastWord.slice(-1)) {
                io.to(roomId).emit('invalid_word', `Word must start with '${lastWord.slice(-1)}'`);
                return;
            }
        }

        try {
            await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${lowerWord}`);
        } catch (err) {
            io.to(roomId).emit('invalid_word', 'Not a valid English word!');
            return;
        }

        room.words.push(lowerWord);

        // Bonus points calculation
        const bonus = 1 + Math.floor(Math.max(0, lowerWord.length - 3) / 3);
        room.scores[socket.id] += bonus;

        room.turn = 1 - room.turn;
        clearTimeout(room.timer);

        io.to(roomId).emit('word_accepted', {
            word: lowerWord,
            nextTurn: room.users[room.turn],
            scores: room.scores,
            usernames: room.usernames
        });

        if (room.aiPlaying && room.turn === 1) {
            // AI's turn - make AI move after delay
            setTimeout(() => aiMove(roomId), 3000);
        } else {
            startTimer(roomId);
        }
    });

    socket.on('rematch', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;

        room.words = [];
        room.turn = 0;
        room.scores = {};
        room.users.forEach(id => room.scores[id] = 0);

        const starter = room.users[room.turn];
        io.to(roomId).emit('start_game', {
            starter,
            usernames: room.usernames,
            aiPlaying: room.aiPlaying
        });
        startTimer(roomId);
    });

    function startTimer(roomId) {
        const room = rooms[roomId];
        if (!room) return;

        room.timer = setTimeout(() => {
            const loser = room.users[room.turn];
            io.to(roomId).emit('game_over', `${room.usernames[loser]} ran out of time!`);
        }, 20000);
    }

    async function aiMove(roomId) {
        const room = rooms[roomId];
        if (!room) return;

        const wordsList = await fetchEnglishWords();
        let lastWord = room.words.length > 0 ? room.words[room.words.length - 1] : null;
        const startLetter = lastWord ? lastWord.slice(-1) : null;

        // Filter valid AI words:
        let possibleWords = wordsList.filter(w => {
            if (room.words.includes(w)) return false; // not used
            if (startLetter && w[0] !== startLetter) return false;
            return true;
        });

        if (possibleWords.length === 0) {
            io.to(roomId).emit('game_over', 'AI cannot find a valid word. You win!');
            return;
        }

        const chosenWord = possibleWords[Math.floor(Math.random() * possibleWords.length)];

        // Push AI word and update score
        room.words.push(chosenWord);

        // AI socket id is special (we use 'AI')
        if (!room.scores['AI']) room.scores['AI'] = 0;

        const bonus = 1 + Math.floor(Math.max(0, chosenWord.length - 3) / 3);
        room.scores['AI'] += bonus;

        // AI turn back to player
        room.turn = 0;
        clearTimeout(room.timer);

        io.to(roomId).emit('word_accepted', {
            word: chosenWord,
            nextTurn: room.users[room.turn],
            scores: room.scores,
            usernames: room.usernames
        });

        startTimer(roomId);
    }

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Optional: handle user disconnect (clean rooms, etc.)
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
