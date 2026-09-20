const COLS = 10;
const ROWS = 20;
const CELL = 30;

const COLORS = {
  I: "#4dd9e0",
  O: "#e0d54d",
  T: "#b04de0",
  S: "#4de06b",
  Z: "#e04d4d",
  J: "#4d6fe0",
  L: "#e0954d",
};

const SHAPES = {
  I: [
    [0, 1], [1, 1], [2, 1], [3, 1],
  ],
  O: [
    [1, 0], [2, 0], [1, 1], [2, 1],
  ],
  T: [
    [1, 0], [0, 1], [1, 1], [2, 1],
  ],
  S: [
    [1, 0], [2, 0], [0, 1], [1, 1],
  ],
  Z: [
    [0, 0], [1, 0], [1, 1], [2, 1],
  ],
  J: [
    [0, 0], [0, 1], [1, 1], [2, 1],
  ],
  L: [
    [2, 0], [0, 1], [1, 1], [2, 1],
  ],
};

const PIECE_TYPES = Object.keys(SHAPES);

function rotateCells(cells, times) {
  let result = cells;
  for (let t = 0; t < times; t++) {
    result = result.map(([x, y]) => [3 - y, x]);
  }
  return result;
}

function normalize(cells) {
  const minX = Math.min(...cells.map((c) => c[0]));
  const minY = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y]) => [x - minX, y - minY]);
}

class Piece {
  constructor(type) {
    this.type = type;
    this.rotation = 0;
    this.x = 3;
    this.y = -1;
  }

  cells(rotation = this.rotation) {
    if (this.type === "O") return SHAPES.O;
    const rotated = rotateCells(SHAPES[this.type], rotation % 4);
    return normalize(rotated);
  }

  absoluteCells(rotation = this.rotation, offX = this.x, offY = this.y) {
    return this.cells(rotation).map(([x, y]) => [x + offX, y + offY]);
  }
}

class Board {
  constructor() {
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }

  isValid(cells) {
    for (const [x, y] of cells) {
      if (x < 0 || x >= COLS || y >= ROWS) return false;
      if (y >= 0 && this.grid[y][x]) return false;
    }
    return true;
  }

  lock(cells, color) {
    for (const [x, y] of cells) {
      if (y >= 0) this.grid[y][x] = color;
    }
  }

  findFullRows() {
    const rows = [];
    for (let y = 0; y < ROWS; y++) {
      if (this.grid[y].every((cell) => cell !== null)) rows.push(y);
    }
    return rows;
  }

  removeRows(rows) {
    const rowSet = new Set(rows);
    this.grid = this.grid.filter((_, y) => !rowSet.has(y));
    while (this.grid.length < ROWS) {
      this.grid.unshift(Array(COLS).fill(null));
    }
    return rows.length;
  }

  isRowAboveVisible() {
    return this.grid[0].some((cell) => cell !== null) || this.grid[1].some((cell) => cell !== null);
  }
}

function bag() {
  const types = [...PIECE_TYPES];
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }
  return types;
}

class Game {
  constructor() {
    this.boardCanvas = document.getElementById("board-canvas");
    this.boardCtx = this.boardCanvas.getContext("2d");
    this.nextCanvas = document.getElementById("next-canvas");
    this.nextCtx = this.nextCanvas.getContext("2d");
    this.holdCanvas = document.getElementById("hold-canvas");
    this.holdCtx = this.holdCanvas.getContext("2d");

    this.scoreEl = document.getElementById("score");
    this.levelEl = document.getElementById("level");
    this.linesEl = document.getElementById("lines");
    this.overlay = document.getElementById("overlay");
    this.overlayText = document.getElementById("overlay-text");
    this.startBtn = document.getElementById("start-btn");

    this.reset();
    this.bindInput();
    this.showOverlay("TETRIS\n\nEnterまたはボタンでスタート");
  }

  reset() {
    this.board = new Board();
    this.queue = [];
    this.refillQueue();
    this.current = this.spawnPiece();
    this.holdType = null;
    this.holdUsed = false;
    this.score = 0;
    this.level = 1;
    this.lines = 0;
    this.dropInterval = 1000;
    this.dropCounter = 0;
    this.lastTime = 0;
    this.running = false;
    this.paused = false;
    this.gameOver = false;
    this.isClearing = false;
    this.clearingRows = [];
    this.clearFlashTimer = 0;
    this.clearFlashDuration = 360;
    this.updateStats();
  }

  refillQueue() {
    while (this.queue.length < 5) {
      this.queue.push(...bag());
    }
  }

  spawnPiece() {
    this.refillQueue();
    const type = this.queue.shift();
    const piece = new Piece(type);
    return piece;
  }

  bindInput() {
    document.addEventListener("keydown", (e) => this.handleKey(e));
    this.startBtn.addEventListener("click", () => this.start());

    const bind = (id, fn) => {
      const el = document.getElementById(id);
      el.addEventListener("click", fn);
      el.addEventListener(
        "touchstart",
        (e) => {
          e.preventDefault();
          fn();
        },
        { passive: false }
      );
    };
    bind("btn-left", () => this.move(-1));
    bind("btn-right", () => this.move(1));
    bind("btn-down", () => this.softDrop());
    bind("btn-rotate", () => this.rotate(1));
    bind("btn-drop", () => this.hardDrop());
    bind("btn-hold", () => this.hold());
  }

  handleKey(e) {
    if (e.key === "Enter" && !this.running) {
      this.start();
      return;
    }
    if (!this.running || this.gameOver) return;

    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        this.move(-1);
        break;
      case "ArrowRight":
        e.preventDefault();
        this.move(1);
        break;
      case "ArrowDown":
        e.preventDefault();
        this.softDrop();
        break;
      case "ArrowUp":
        e.preventDefault();
        this.rotate(1);
        break;
      case "z":
      case "Z":
        this.rotate(-1);
        break;
      case " ":
        e.preventDefault();
        this.hardDrop();
        break;
      case "c":
      case "C":
        this.hold();
        break;
      case "p":
      case "P":
        this.togglePause();
        break;
    }
  }

  start() {
    this.reset();
    this.running = true;
    this.hideOverlay();
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  togglePause() {
    if (this.gameOver) return;
    this.paused = !this.paused;
    if (this.paused) {
      this.showOverlay("PAUSE\n\nPで再開");
    } else {
      this.hideOverlay();
      this.lastTime = performance.now();
    }
  }

  showOverlay(text) {
    this.overlayText.textContent = text;
    this.overlay.classList.remove("hidden");
    this.startBtn.style.display = this.gameOver || !this.running ? "inline-block" : "none";
  }

  hideOverlay() {
    this.overlay.classList.add("hidden");
  }

  move(dx) {
    if (this.isClearing) return;
    const cells = this.current.absoluteCells(this.current.rotation, this.current.x + dx, this.current.y);
    if (this.board.isValid(cells)) {
      this.current.x += dx;
    }
  }

  rotate(dir) {
    if (this.isClearing) return;
    const newRotation = (this.current.rotation + dir + 4) % 4;
    const kicks = [0, -1, 1, -2, 2];
    for (const kick of kicks) {
      const cells = this.current.absoluteCells(newRotation, this.current.x + kick, this.current.y);
      if (this.board.isValid(cells)) {
        this.current.rotation = newRotation;
        this.current.x += kick;
        return;
      }
    }
  }

  softDrop() {
    if (this.isClearing) return;
    if (this.tryMoveDown()) {
      this.score += 1;
      this.updateStats();
    }
  }

  hardDrop() {
    if (this.isClearing) return;
    let distance = 0;
    while (this.tryMoveDown()) distance++;
    this.score += distance * 2;
    this.updateStats();
    this.lockPiece();
  }

  tryMoveDown() {
    const cells = this.current.absoluteCells(this.current.rotation, this.current.x, this.current.y + 1);
    if (this.board.isValid(cells)) {
      this.current.y += 1;
      return true;
    }
    return false;
  }

  hold() {
    if (this.isClearing || this.holdUsed) return;
    this.holdUsed = true;
    const currentType = this.current.type;
    if (this.holdType === null) {
      this.holdType = currentType;
      this.current = this.spawnPiece();
    } else {
      const swapType = this.holdType;
      this.holdType = currentType;
      this.current = new Piece(swapType);
    }
    if (!this.board.isValid(this.current.absoluteCells())) {
      this.endGame();
    }
  }

  lockPiece() {
    this.board.lock(this.current.absoluteCells(), COLORS[this.current.type]);
    const fullRows = this.board.findFullRows();
    if (fullRows.length > 0) {
      this.isClearing = true;
      this.clearingRows = fullRows;
      this.clearFlashTimer = this.clearFlashDuration;
    } else {
      this.spawnNext();
    }
  }

  finishClear() {
    const cleared = this.board.removeRows(this.clearingRows);
    this.isClearing = false;
    this.clearingRows = [];
    this.applyScore(cleared);
    this.spawnNext();
  }

  spawnNext() {
    this.holdUsed = false;
    this.current = this.spawnPiece();
    if (!this.board.isValid(this.current.absoluteCells())) {
      this.endGame();
    }
  }

  applyScore(cleared) {
    const points = [0, 100, 300, 500, 800][cleared] || 0;
    this.score += points * this.level;
    this.lines += cleared;
    const newLevel = Math.floor(this.lines / 10) + 1;
    if (newLevel !== this.level) {
      this.level = newLevel;
      this.dropInterval = Math.max(100, 1000 - (this.level - 1) * 75);
    }
    this.updateStats();
  }

  endGame() {
    this.running = false;
    this.gameOver = true;
    this.showOverlay(`GAME OVER\n\nSCORE: ${this.score}\n\nもう一度プレイ`);
  }

  updateStats() {
    this.scoreEl.textContent = this.score;
    this.levelEl.textContent = this.level;
    this.linesEl.textContent = this.lines;
  }

  loop(time) {
    if (!this.running) return;
    if (!this.paused) {
      const delta = time - this.lastTime;
      this.lastTime = time;
      if (this.isClearing) {
        this.clearFlashTimer -= delta;
        if (this.clearFlashTimer <= 0) {
          this.finishClear();
        }
      } else {
        this.dropCounter += delta;
        if (this.dropCounter > this.dropInterval) {
          if (!this.tryMoveDown()) {
            this.lockPiece();
          }
          this.dropCounter = 0;
        }
      }
      this.draw();
    } else {
      this.lastTime = time;
    }
    requestAnimationFrame((t) => this.loop(t));
  }

  ghostY() {
    let y = this.current.y;
    while (true) {
      const cells = this.current.absoluteCells(this.current.rotation, this.current.x, y + 1);
      if (!this.board.isValid(cells)) break;
      y++;
    }
    return y;
  }

  draw() {
    const ctx = this.boardCtx;
    ctx.clearRect(0, 0, this.boardCanvas.width, this.boardCanvas.height);

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const color = this.board.grid[y][x];
        if (color) {
          this.drawCell(ctx, x, y, color);
        }
      }
    }

    if (this.isClearing) {
      const blink = Math.floor(this.clearFlashTimer / 90) % 2 === 0;
      if (blink) {
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        for (const y of this.clearingRows) {
          ctx.fillRect(0, y * CELL, COLS * CELL, CELL);
        }
      }
    }

    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL, 0);
      ctx.lineTo(x * CELL, ROWS * CELL);
      ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL);
      ctx.lineTo(COLS * CELL, y * CELL);
      ctx.stroke();
    }

    if (!this.isClearing) {
      const ghostY = this.ghostY();
      const ghostCells = this.current.absoluteCells(this.current.rotation, this.current.x, ghostY);
      for (const [x, y] of ghostCells) {
        if (y >= 0) this.drawCell(ctx, x, y, COLORS[this.current.type], true);
      }

      const cells = this.current.absoluteCells();
      for (const [x, y] of cells) {
        if (y >= 0) this.drawCell(ctx, x, y, COLORS[this.current.type]);
      }
    }

    this.drawPreview(this.nextCtx, this.nextCanvas, this.queue.slice(0, 4), true);
    this.drawPreview(this.holdCtx, this.holdCanvas, this.holdType ? [this.holdType] : [], false);
  }

  drawCell(ctx, x, y, color, ghost = false) {
    const px = x * CELL;
    const py = y * CELL;
    if (ghost) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 2, py + 2, CELL - 4, CELL - 4);
      return;
    }
    ctx.fillStyle = color;
    ctx.fillRect(px, py, CELL, CELL);
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, CELL - 2, CELL - 2);
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(px + 2, py + 2, CELL - 4, 4);
  }

  drawPreview(ctx, canvas, types, stacked) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const size = 20;
    types.forEach((type, i) => {
      const cells = normalize(SHAPES[type]);
      const offsetY = stacked ? i * 60 + 10 : 30;
      const offsetX = type === "I" ? 5 : 15;
      for (const [x, y] of cells) {
        const px = offsetX + x * size;
        const py = offsetY + y * size;
        ctx.fillStyle = COLORS[type];
        ctx.fillRect(px, py, size, size);
        ctx.strokeStyle = "rgba(0,0,0,0.3)";
        ctx.strokeRect(px + 1, py + 1, size - 2, size - 2);
      }
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.gameInstance = new Game();
});
