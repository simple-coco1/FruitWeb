"use strict";

/* ==============================
   1. 游戏设置
============================== */

const ROWS = 15;
const COLS = 8;
const FRUIT_COUNT = 15;

const FRUITS = [
    "mg", "ll", "sz", "zg", "hm", "hl", "hmg",
    "mh", "ht", "kz", "21", "24", "25", "bl",
    "yt", "st", "wm", "pt", "jz", "xj", "pg"
];

const IMAGE_EXTENSIONS = [
    ".png", ".jpg", ".jpeg", ".webp", ".bmp"
];

const AUDIO_EXTENSIONS = [
    ".mp3", ".wav", ".ogg", ".flac"
];

const $ = id => document.getElementById(id);

const boardElement = $("board");
const remainingElement = $("remaining");
const timerElement = $("timer");
const comboElement = $("combo");
const statusElement = $("status");
const bestTimeElement = $("bestTime");
const recordsElement = $("records");
const victoryElement = $("victory");

let board = [];
let selected = null;
let startedAt = 0;
let stoppedAt = 0;
let finished = false;

let combo = 0;
let lastComboAt = 0;
let soundEnabled = true;

let bgmAudio = null;
let currentEffect = null;
let lastStatusTimer = null;

/* ==============================
   2. 图片加载
============================== */

function loadFruitImage(name, img) {
    let extensionIndex = 0;

    function tryImage() {
        if (extensionIndex >= IMAGE_EXTENSIONS.length) {
            img.hidden = true;

            const fallback = document.createElement("span");
            fallback.textContent = name;
            fallback.className = "fruit-fallback";

            img.parentElement.appendChild(fallback);
            return;
        }

        const extension = IMAGE_EXTENSIONS[extensionIndex];
        extensionIndex++;

        img.src = "assets/fruits/" + name + extension;
    }

    img.addEventListener("error", tryImage);
    tryImage();
}

/* ==============================
   3. 音频加载与播放
============================== */

function findAudio(name) {
    return new Promise(resolve => {
        let index = 0;

        function tryNext() {
            if (index >= AUDIO_EXTENSIONS.length) {
                resolve(null);
                return;
            }

            const path =
                "assets/music/" + name + AUDIO_EXTENSIONS[index];

            index++;

            const audio = new Audio();
            audio.preload = "auto";

            audio.addEventListener("canplay", () => {
                resolve(path);
            }, { once: true });

            audio.addEventListener("error", tryNext, { once: true });

            audio.src = path;
            audio.load();
        }

        tryNext();
    });
}

async function playEffect(name) {
    if (!soundEnabled) return;

    const path = await findAudio(name);
    if (!path || !soundEnabled) return;

    if (currentEffect) {
        currentEffect.pause();
        currentEffect.currentTime = 0;
    }

    currentEffect = new Audio(path);
    currentEffect.volume = 0.8;
    currentEffect.play().catch(() => {});
}

async function startBGM() {
    if (!soundEnabled) return;

    if (!bgmAudio) {
        const path = await findAudio("BGM3");

        if (!path || !soundEnabled) return;

        bgmAudio = new Audio(path);
        bgmAudio.loop = true;
        bgmAudio.volume = 0.35;
    }

    bgmAudio.play().catch(() => {});
}

/* ==============================
   4. 创建游戏棋盘
============================== */

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }

    return array;
}

function newGame() {
    const chosen = shuffleArray([...FRUITS]).slice(0, FRUIT_COUNT);
    const items = [];

    for (const fruit of chosen) {
        for (let i = 0; i < 8; i++) {
            items.push(fruit);
        }
    }

    shuffleArray(items);

    board = [];

    for (let r = 0; r < ROWS; r++) {
        board.push(items.slice(r * COLS, (r + 1) * COLS));
    }

    selected = null;
    finished = false;
    combo = 0;
    lastComboAt = 0;
    startedAt = Date.now();
    stoppedAt = 0;

    victoryElement.classList.add("hidden");

    renderBoard();
    updateInfo();
    showStatus("点击两个相同的水果进行消除");
}

/* ==============================
   5. 绘制棋盘
============================== */

function renderBoard() {
    boardElement.innerHTML = "";
    boardElement.style.gridTemplateColumns =
        "repeat(" + COLS + ", minmax(0, 1fr))";

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const tile = document.createElement("div");

            tile.className = "tile";
            tile.dataset.row = r;
            tile.dataset.col = c;

            const fruit = board[r][c];

            if (fruit === null) {
                tile.classList.add("empty");
            } else {
                const img = document.createElement("img");

                img.alt = fruit;
                img.draggable = false;

                tile.appendChild(img);
                loadFruitImage(fruit, img);

                if (
                    selected &&
                    selected.r === r &&
                    selected.c === c
                ) {
                    tile.classList.add("selected");
                }
            }

            tile.addEventListener("click", () => {
                handleClick(r, c);
            });

            boardElement.appendChild(tile);
        }
    }
}

/* ==============================
   6. 游戏信息与计时
============================== */

function formatTime(milliseconds) {
    const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;

    return String(minutes).padStart(2, "0") + ":" +
        String(rest).padStart(2, "0");
}

function updateInfo() {
    const remaining = board.flat().filter(x => x !== null).length;

    remainingElement.textContent = remaining;
    comboElement.textContent = combo;

    const end = finished ? stoppedAt : Date.now();

    timerElement.textContent = formatTime(end - startedAt);
}

function showStatus(message) {
    statusElement.textContent = message;

    if (lastStatusTimer) {
        clearTimeout(lastStatusTimer);
    }

    lastStatusTimer = setTimeout(() => {
        if (!finished) {
            statusElement.textContent =
                "点击两个相同的水果进行消除";
        }
    }, 2200);
}

/* ==============================
   7. 连接路径判断
   最多两个转弯，允许绕棋盘外围
============================== */

function findPath(start, end) {
    if (start.r === end.r && start.c === end.c) {
        return null;
    }

    if (board[start.r][start.c] !== board[end.r][end.c]) {
        return null;
    }

    const height = ROWS + 2;
    const width = COLS + 2;

    const s = { r: start.r + 1, c: start.c + 1 };
    const e = { r: end.r + 1, c: end.c + 1 };

    const directions = [
        [-1, 0],
        [0, 1],
        [1, 0],
        [0, -1]
    ];

    function blocked(r, c) {
        if (
            r === 0 || r === height - 1 ||
            c === 0 || c === width - 1
        ) {
            return false;
        }

        return board[r - 1][c - 1] !== null;
    }

    const queue = [];
    const visited = new Set();

    for (let d = 0; d < 4; d++) {
        const nr = s.r + directions[d][0];
        const nc = s.c + directions[d][1];

        if (nr < 0 || nr >= height || nc < 0 || nc >= width) {
            continue;
        }

        if (blocked(nr, nc) && !(nr === e.r && nc === e.c)) {
            continue;
        }

        queue.push({
            r: nr,
            c: nc,
            dir: d,
            turns: 0
        });

        visited.add(nr + "," + nc + "," + d + ",0");
    }

    let head = 0;

    while (head < queue.length) {
        const current = queue[head++];

        if (current.r === e.r && current.c === e.c) {
            return current;
        }

        for (let d = 0; d < 4; d++) {
            const nr = current.r + directions[d][0];
            const nc = current.c + directions[d][1];

            if (nr < 0 || nr >= height || nc < 0 || nc >= width) {
                continue;
            }

            const turns = current.turns +
                (d === current.dir ? 0 : 1);

            if (turns > 2) continue;

            if (blocked(nr, nc) && !(nr === e.r && nc === e.c)) {
                continue;
            }

            const key = nr + "," + nc + "," + d + "," + turns;

            if (visited.has(key)) continue;

            visited.add(key);

            queue.push({
                r: nr,
                c: nc,
                dir: d,
                turns
            });
        }
    }

    return null;
}

/* ==============================
   8. 点击与消除
============================== */

function handleClick(r, c) {
    if (finished || board[r][c] === null) return;

    startBGM();

    if (!selected) {
        selected = { r, c };
        renderBoard();
        return;
    }

    if (selected.r === r && selected.c === c) {
        selected = null;
        renderBoard();
        return;
    }

    const first = selected;
    const second = { r, c };

    if (board[first.r][first.c] !== board[r][c]) {
        selected = second;
        renderBoard();
        showStatus("水果不同，请选择相同的水果");
        return;
    }

    const path = findPath(first, second);

    if (!path) {
        selected = second;
        renderBoard();
        showStatus("暂时无法连接，请换一组试试");
        return;
    }

    board[first.r][first.c] = null;
    board[second.r][second.c] = null;
    selected = null;

    const now = Date.now();

    combo = now - lastComboAt <= 2000 ? combo + 1 : 1;
    lastComboAt = now;

    if (combo >= 5) {
        playEffect("unbelievable");
    } else if (combo >= 3) {
        playEffect("excelent");
    } else if (combo >= 2) {
        playEffect("great");
    } else {
        playEffect("danxiaochu");
    }

    renderBoard();
    updateInfo();

    showStatus(
        combo >= 2 ? combo + " 连击！消除成功！" : "消除成功！"
    );

    if (board.flat().every(x => x === null)) {
        finishGame();
    }
}

/* ==============================
   9. 刷新剩余水果
============================== */

function shuffleRemaining() {
    if (finished) return;

    const remaining = board.flat().filter(x => x !== null);

    if (remaining.length < 2) return;

    shuffleArray(remaining);

    let index = 0;

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c] !== null) {
                board[r][c] = remaining[index++];
            }
        }
    }

    selected = null;

    renderBoard();
    updateInfo();
    showStatus("剩余水果已重新排列");
}

/* ==============================
   10. 通关与纪录
============================== */

function readRecords() {
    try {
        const data = JSON.parse(
            localStorage.getItem("fruitWebRecords") || "[]"
        );

        if (!Array.isArray(data)) return [];

        return data.filter(item =>
            item && Number.isFinite(item.time)
        );
    } catch {
        return [];
    }
}

function renderRecords() {
    const records = readRecords();

    recordsElement.innerHTML = "";

    if (records.length === 0) {
        const li = document.createElement("li");
        li.textContent = "还没有通关纪录";

        recordsElement.appendChild(li);
        bestTimeElement.textContent = "--:--";
        return;
    }

    bestTimeElement.textContent = formatTime(records[0].time);

    records.slice(0, 10).forEach((record, index) => {
        const li = document.createElement("li");

        li.textContent = (index + 1) + ". " +
            formatTime(record.time) + " · " +
            (record.date || "");

        recordsElement.appendChild(li);
    });
}

function finishGame() {
    finished = true;
    stoppedAt = Date.now();

    updateInfo();

    $("finalTime").textContent =
        formatTime(stoppedAt - startedAt);

    const records = readRecords();

    records.push({
        time: stoppedAt - startedAt,
        date: new Date().toLocaleDateString()
    });

    records.sort((a, b) => a.time - b.time);

    try {
        localStorage.setItem(
            "fruitWebRecords",
            JSON.stringify(records.slice(0, 10))
        );
    } catch (error) {
        console.warn("无法保存纪录", error);
    }

    renderRecords();
    playEffect("Victory");

    victoryElement.classList.remove("hidden");
    showStatus("恭喜通关！");
}

/* ==============================
   11. 按钮与初始化
============================== */

$("restartBtn").addEventListener("click", newGame);
$("refreshBtn").addEventListener("click", shuffleRemaining);
$("playAgainBtn").addEventListener("click", newGame);

$("soundBtn").addEventListener("click", () => {
    soundEnabled = !soundEnabled;

    $("soundBtn").textContent =
        soundEnabled ? "音效：开" : "音效：关";

    if (bgmAudio) {
        if (soundEnabled) {
            bgmAudio.play().catch(() => {});
        } else {
            bgmAudio.pause();
        }
    }

    showStatus(soundEnabled ? "音效已开启" : "音效已关闭");
});

document.addEventListener("pointerdown", startBGM, { once: true });
document.addEventListener("keydown", startBGM, { once: true });

setInterval(() => {
    if (board.length && !finished) {
        updateInfo();

        if (Date.now() - lastComboAt > 2000 && combo !== 0) {
            combo = 0;
            comboElement.textContent = combo;
        }
    }
}, 200);

renderRecords();
newGame();