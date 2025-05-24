const socket = io();

let roomId = '';
let username = '';
let isMyTurn = false;
let timerInterval;
let timeLeft = 20;
let aiPlaying = false;

function joinRoom() {
    username = document.getElementById('username').value.trim();
    roomId = document.getElementById('roomId').value.trim();

    if (!username || !roomId) {
        alert('Please enter username and room ID');
        return;
    }

    socket.emit('join_room', { roomId, username });
    document.getElementById('game').style.display = 'block';
}

socket.on('start_game', ({ starter, usernames, aiPlaying: isAi }) => {
    aiPlaying = isAi;
    document.getElementById('aiStatus').textContent = aiPlaying ? 'Playing against AI Bot' : '';
    updateScores(usernames, {});
    updateTurn(starter, usernames);
    resetTimer();
});

socket.on('word_accepted', ({ word, nextTurn, scores, usernames }) => {

    document.getElementById('log').innerHTML = `<p>✅ ${word}</p>` + document.getElementById('log').innerHTML;
    document.getElementById('lastWord').textContent = `Last word: ${word}`;
    updateScores(usernames, scores);
    updateTurn(nextTurn, usernames);
    resetTimer();
});
// socket.on('word_accepted', ({ word, nextTurn, scores, usernames: userMap }) => {
//     usernames = userMap;
//     document.getElementById('log').innerHTML = `<p>✅ ${word}</p>` + document.getElementById('log').innerHTML;
//     document.getElementById('lastWord').textContent = `Last word: ${word}`;
//     currentTurnId = nextTurn;
//     updateTurnInfo();
//     updateScoreBoard(scores);
//     startCountdown();
// });

socket.on('invalid_word', (msg) => {
    alert(`Invalid word: ${msg}`);
});

socket.on('game_over', (msg) => {
    alert(msg);
    clearInterval(timerInterval);
    isMyTurn = false;
});

function updateScores(usernames, scores) {
    const scoreBoard = document.getElementById('scoreBoard');
    scoreBoard.innerHTML = '';

    // Merge usernames and scores, including AI if playing
    let combinedScores = {...scores};
    for (const id in usernames) {
        if (!(id in combinedScores)) combinedScores[id] = 0;
    }
    if (aiPlaying) {
        combinedScores['AI'] = scores['AI'] || 0;
    }

    for (const id in combinedScores) {
        const name = (id === 'AI') ? 'AI Bot' : usernames[id] || id;
        const score = combinedScores[id];
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-center';
        li.textContent = name;
        const span = document.createElement('span');
        span.className = 'badge bg-primary rounded-pill';
        span.textContent = score;
        li.appendChild(span);
        scoreBoard.appendChild(li);
    }
}

function updateTurn(currentTurnId, usernames) {
    isMyTurn = (currentTurnId === socket.id);
    const turnInfo = document.getElementById('turnInfo');
    if (aiPlaying && currentTurnId === 'AI') {
        turnInfo.textContent = "AI Bot's turn...";
        isMyTurn = false;
    } else {
        const name = usernames[currentTurnId] || currentTurnId;
        turnInfo.textContent = isMyTurn ? 'Your turn!' : `Turn: ${name}`;
    }
}

function submitWord() {
    if (!isMyTurn) {
        alert("It's not your turn!");
        return;
    }
    const input = document.getElementById('wordInput');
    const word = input.value.trim();
    if (!word) {
        alert('Please enter a word');
        return;
    }
    socket.emit('submit_word', { roomId, word });
    input.value = '';
}

function addLog(message) {
    const log = document.getElementById('log');
    log.textContent += message + '\n';
    log.scrollTop = log.scrollHeight;
}

function rematch() {
    socket.emit('rematch', roomId);
    document.getElementById('lastWord').textContent = '';
}

function resetTimer() {
    clearInterval(timerInterval);
    timeLeft = 20;
    document.getElementById('timer').textContent = timeLeft;

    timerInterval = setInterval(() => {
        timeLeft--;
        document.getElementById('timer').textContent = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
        }
    }, 1000);
}
