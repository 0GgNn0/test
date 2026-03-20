/**
 * 坦克大战游戏客户端
 * TankBattle Online - Game Client
 */

// ==================== 常量定义 ====================

// 坦克类型配置
const TANK_TYPES = {
    LIGHT: {
        id: 'light',
        name: '轻型坦克',
        icon: '⚡',
        hp: 100,
        speed: 5,
        damage: 15,
        fireRate: 300,
        color: '#2ecc71',
        special: '闪避率+20%',
        description: '速度快，体型小，难以击中'
    },
    MEDIUM: {
        id: 'medium',
        name: '中型坦克',
        icon: '🛡️',
        hp: 150,
        speed: 3,
        damage: 20,
        fireRate: 500,
        color: '#3498db',
        special: '穿甲弹',
        description: '平衡型，各项属性中等'
    },
    HEAVY: {
        id: 'heavy',
        name: '重型坦克',
        icon: '🏰',
        hp: 250,
        speed: 2,
        damage: 30,
        fireRate: 800,
        color: '#e74c3c',
        special: '护盾',
        description: '高血量，高伤害，移速较慢'
    },
    SNIPER: {
        id: 'sniper',
        name: '狙击坦克',
        icon: '🎯',
        hp: 80,
        speed: 2,
        damage: 50,
        fireRate: 1200,
        color: '#9b59b6',
        special: '隐身',
        description: '超远射程，一击必杀'
    },
    SUPPORT: {
        id: 'support',
        name: '支援坦克',
        icon: '❤️',
        hp: 120,
        speed: 3,
        damage: 10,
        fireRate: 400,
        color: '#f39c12',
        special: '维修光束',
        description: '辅助型，可治疗队友'
    }
};

// 子弹类型配置
const BULLET_TYPES = {
    NORMAL: {
        id: 'normal',
        name: '普通子弹',
        speed: 8,
        damage: 20,
        color: '#ecf0f1',
        size: 5
    },
    ARMOR_PIERCING: {
        id: 'armor_piercing',
        name: '穿甲弹',
        speed: 10,
        damage: 25,
        color: '#e74c3c',
        size: 6,
        penetrate: true
    },
    MISSILE: {
        id: 'missile',
        name: '追踪导弹',
        speed: 5,
        damage: 35,
        color: '#f39c12',
        size: 8,
        tracking: true
    },
    SHOTGUN: {
        id: 'shotgun',
        name: '霰弹',
        speed: 6,
        damage: 15,
        color: '#9b59b6',
        size: 4,
        count: 5,
        spread: 30
    },
    LASER: {
        id: 'laser',
        name: '激光',
        speed: 50,
        damage: 40,
        color: '#3498db',
        size: 3,
        instant: true
    }
};

// 游戏常量
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;
const TANK_SIZE = 40;
const BULLET_SIZE = 8;

// ==================== 游戏状态 ====================

class GameClient {
    constructor() {
        this.socket = null;
        this.canvas = null;
        this.ctx = null;
        this.currentScreen = 'auth-screen';
        this.selectedTank = 'light';
        this.currentBulletType = 'normal';
        this.username = '';
        this.userId = null;
        this.token = null;
        
        // 游戏状态
        this.gameState = {
            players: new Map(),
            bullets: [],
            gameStarted: false,
            roomId: null,
            roomName: ''
        };
        
        // 输入状态
        this.keys = {
            up: false,
            down: false,
            left: false,
            right: false,
            fire: false
        };
        
        // 本地玩家
        this.localPlayer = null;
        
        // 最后射击时间
        this.lastFireTime = 0;
        
        this.init();
    }
    
    init() {
        this.setupDOM();
        this.setupEventListeners();
        this.connectSocket();
    }
    
    setupDOM() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = CANVAS_WIDTH;
        this.canvas.height = CANVAS_HEIGHT;
    }
    
    setupEventListeners() {
        // 认证表单
        document.getElementById('auth-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAuth();
        });
        
        // Tab切换
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });
        
        // 键盘事件
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
        
        // 鼠标射击
        this.canvas.addEventListener('mousedown', () => this.keys.fire = true);
        this.canvas.addEventListener('mouseup', () => this.keys.fire = false);
        
        // 退出按钮
        document.getElementById('logout-btn').addEventListener('click', () => this.logout());
        
        // 创建房间
        document.getElementById('create-room-btn').addEventListener('click', () => this.createRoom());
        
        // 返回按钮
        document.getElementById('back-btn').addEventListener('click', () => this.showScreen('lobby-screen'));
        
        // 坦克选择
        this.renderTankSelection();
    }
    
    connectSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
        });
        
        // 认证事件
        this.socket.on('auth:success', (data) => {
            this.token = data.token;
            this.userId = data.userId;
            this.username = data.username;
            document.getElementById('current-user').textContent = data.username;
            this.showScreen('lobby-screen');
            this.loadLeaderboard();
        });
        
        this.socket.on('auth:error', (data) => {
            document.getElementById('auth-error').textContent = data.message;
        });
        
        // 房间事件
        this.socket.on('room:list', (rooms) => {
            this.renderRoomList(rooms);
        });
        
        this.socket.on('room:created', (room) => {
            this.joinRoom(room.id);
        });
        
        this.socket.on('room:joined', (room) => {
            this.gameState.roomId = room.id;
            this.gameState.roomName = room.name;
            this.showScreen('game-screen');
            this.startGame();
        });
        
        this.socket.on('room:playerJoined', (data) => {
            console.log('Player joined:', data);
        });
        
        this.socket.on('room:playerLeft', (data) => {
            this.gameState.players.delete(data.playerId);
        });
        
        // 游戏事件
        this.socket.on('game:state', (state) => {
            this.updateGameState(state);
        });
        
        this.socket.on('game:playerJoined', (player) => {
            this.gameState.players.set(player.id, player);
        });
        
        this.socket.on('game:playerLeft', (playerId) => {
            this.gameState.players.delete(playerId);
        });
        
        this.socket.on('game:bullet', (bullet) => {
            this.gameState.bullets.push(bullet);
        });
        
        this.socket.on('game:hit', (data) => {
            if (data.targetId === this.userId) {
                this.updateLocalPlayerHP(data.hp);
            }
        });
        
        this.socket.on('game:over', (data) => {
            this.gameOver(data);
        });
        
        // 排行榜
        this.socket.on('leaderboard:data', (data) => {
            this.renderLeaderboard(data);
        });
    }
    
    handleAuth() {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const isRegister = !document.querySelector('.tab-btn.active').dataset.tab;
        
        if (isRegister) {
            this.socket.emit('auth:register', { username, password });
        } else {
            this.socket.emit('auth:login', { username, password });
        }
    }
    
    switchTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
    }
    
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
        document.getElementById(screenId).classList.remove('hidden');
        this.currentScreen = screenId;
        
        if (screenId === 'lobby-screen') {
            this.socket.emit('room:list');
        }
    }
    
    logout() {
        this.socket.emit('auth:logout');
        this.token = null;
        this.userId = null;
        this.username = '';
        this.showScreen('auth-screen');
    }
    
    // ==================== 坦克选择 ====================
    
    renderTankSelection() {
        const grid = document.getElementById('tank-grid');
        grid.innerHTML = '';
        
        Object.values(TANK_TYPES).forEach(tank => {
            const card = document.createElement('div');
            card.className = `tank-card ${tank.id === this.selectedTank ? 'selected' : ''}`;
            card.innerHTML = `
                <div class="tank-icon" style="color: ${tank.color}">${tank.icon}</div>
                <div class="tank-name">${tank.name}</div>
                <div class="tank-stats">
                    ❤️ ${tank.hp} | ⚡ ${tank.speed} | 💥 ${tank.damage}
                </div>
            `;
            card.addEventListener('click', () => {
                this.selectedTank = tank.id;
                this.renderTankSelection();
            });
            grid.appendChild(card);
        });
    }
    
    // ==================== 房间系统 ====================
    
    renderRoomList(rooms) {
        const list = document.getElementById('room-list');
        list.innerHTML = '';
        
        if (rooms.length === 0) {
            list.innerHTML = '<p style="text-align: center; color: #7f8c8d;">暂无房间</p>';
            return;
        }
        
        rooms.forEach(room => {
            const item = document.createElement('div');
            item.className = 'room-item';
            item.innerHTML = `
                <div class="room-info">
                    <div class="room-name">${room.name}</div>
                    <div class="room-players">${room.playerCount}/8 玩家</div>
                </div>
                <button class="join-btn" ${room.playerCount >= 8 ? 'disabled' : ''}>
                    加入
                </button>
            `;
            item.querySelector('.join-btn').addEventListener('click', () => {
                this.joinRoom(room.id);
            });
            list.appendChild(item);
        });
    }
    
    createRoom() {
        const roomName = `${this.username}的房间`;
        this.socket.emit('room:create', { 
            name: roomName, 
            tankType: this.selectedTank 
        });
    }
    
    joinRoom(roomId) {
        this.socket.emit('room:join', { 
            roomId, 
            tankType: this.selectedTank 
        });
    }
    
    // ==================== 游戏逻辑 ====================
    
    startGame() {
        this.gameState.gameStarted = true;
        this.gameLoop();
    }
    
    handleKeyDown(e) {
        switch(e.key.toLowerCase()) {
            case 'w':
            case 'arrowup':
                this.keys.up = true;
                break;
            case 's':
            case 'arrowdown':
                this.keys.down = true;
                break;
            case 'a':
            case 'arrowleft':
                this.keys.left = true;
                break;
            case 'd':
            case 'arrowright':
                this.keys.right = true;
                break;
            case ' ':
                this.keys.fire = true;
                e.preventDefault();
                break;
            case '1':
                this.currentBulletType = 'normal';
                break;
            case '2':
                this.currentBulletType = 'armor_piercing';
                break;
            case '3':
                this.currentBulletType = 'missile';
                break;
            case '4':
                this.currentBulletType = 'shotgun';
                break;
            case '5':
                this.currentBulletType = 'laser';
                break;
        }
    }
    
    handleKeyUp(e) {
        switch(e.key.toLowerCase()) {
            case 'w':
            case 'arrowup':
                this.keys.up = false;
                break;
            case 's':
            case 'arrowdown':
                this.keys.down = false;
                break;
            case 'a':
            case 'arrowleft':
                this.keys.left = false;
                break;
            case 'd':
            case 'arrowright':
                this.keys.right = false;
                break;
            case ' ':
                this.keys.fire = false;
                break;
        }
    }
    
    sendInput() {
        if (!this.gameState.gameStarted) return;
        
        this.socket.emit('game:input', {
            up: this.keys.up,
            down: this.keys.down,
            left: this.keys.left,
            right: this.keys.right,
            fire: this.keys.fire,
            bulletType: this.currentBulletType
        });
    }
    
    updateGameState(state) {
        // 更新所有玩家
        state.players.forEach((player, id) => {
            this.gameState.players.set(id, player);
            if (id === this.userId) {
                this.localPlayer = player;
            }
        });
        
        // 更新子弹
        this.gameState.bullets = state.bullets || [];
        
        // 更新UI
        this.updateGameUI();
    }
    
    updateGameUI() {
        if (!this.localPlayer) return;
        
        const hpPercent = (this.localPlayer.hp / this.localPlayer.maxHp) * 100;
        document.getElementById('hp-fill').style.width = `${hpPercent}%`;
        document.getElementById('hp-text').textContent = `${this.localPlayer.hp}/${this.localPlayer.maxHp}`;
        
        const bulletInfo = BULLET_TYPES[this.currentBulletType.toUpperCase()];
        document.getElementById('ammo-type').textContent = bulletInfo ? bulletInfo.name : '普通';
        
        document.getElementById('room-info').textContent = this.gameState.roomName;
        document.getElementById('player-count').textContent = `${this.gameState.players.size} 玩家在线`;
    }
    
    updateLocalPlayerHP(hp) {
        if (this.localPlayer) {
            this.localPlayer.hp = hp;
            this.updateGameUI();
        }
    }
    
    gameOver(data) {
        alert(`游戏结束！\n结果: ${data.winner === this.userId ? '胜利！' : '失败'}\n击杀: ${data.kills}`);
        this.gameState.gameStarted = false;
        this.showScreen('lobby-screen');
    }
    
    // ==================== 渲染循环 ====================
    
    gameLoop() {
        if (!this.gameState.gameStarted) return;
        
        // 发送输入到服务器
        this.sendInput();
        
        // 清空画布
        this.ctx.fillStyle = '#0a0a0a';
        this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        // 绘制网格
        this.drawGrid();
        
        // 绘制所有玩家
        this.gameState.players.forEach(player => {
            this.drawTank(player);
        });
        
        // 绘制子弹
        this.gameState.bullets.forEach(bullet => {
            this.drawBullet(bullet);
        });
        
        requestAnimationFrame(() => this.gameLoop());
    }
    
    drawGrid() {
        this.ctx.strokeStyle = '#1a1a2e';
        this.ctx.lineWidth = 1;
        
        for (let x = 0; x < CANVAS_WIDTH; x += 50) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, CANVAS_HEIGHT);
            this.ctx.stroke();
        }
        
        for (let y = 0; y < CANVAS_HEIGHT; y += 50) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(CANVAS_WIDTH, y);
            this.ctx.stroke();
        }
    }
    
    drawTank(player) {
        const { x, y, angle, color, tankType } = player;
        const tankConfig = TANK_TYPES[tankType.toUpperCase()];
        
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(angle);
        
        // 坦克主体
        this.ctx.fillStyle = color || tankConfig.color;
        this.ctx.fillRect(-TANK_SIZE/2, -TANK_SIZE/2, TANK_SIZE, TANK_SIZE);
        
        // 坦克炮管
        this.ctx.fillStyle = '#2c3e50';
        this.ctx.fillRect(0, -4, TANK_SIZE/2 + 10, 8);
        
        // 坦克顶部
        this.ctx.fillStyle = '#34495e';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 12, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 玩家名称
        this.ctx.restore();
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(player.username || 'Player', x, y - TANK_SIZE/2 - 5);
        
        // 血条
        if (player.hp < player.maxHp) {
            const hpPercent = player.hp / player.maxHp;
            this.ctx.fillStyle = '#e74c3c';
            this.ctx.fillRect(x - 20, y + TANK_SIZE/2 + 5, 40, 4);
            this.ctx.fillStyle = '#2ecc71';
            this.ctx.fillRect(x - 20, y + TANK_SIZE/2 + 5, 40 * hpPercent, 4);
        }
    }
    
    drawBullet(bullet) {
        const config = BULLET_TYPES[bullet.type.toUpperCase()] || BULLET_TYPES.NORMAL;
        
        this.ctx.beginPath();
        this.ctx.arc(bullet.x, bullet.y, config.size, 0, Math.PI * 2);
        this.ctx.fillStyle = config.color;
        this.ctx.fill();
        
        // 拖尾效果
        this.ctx.beginPath();
        this.ctx.moveTo(bullet.x, bullet.y);
        this.ctx.lineTo(
            bullet.x - Math.cos(bullet.angle) * config.size * 2,
            bullet.y - Math.sin(bullet.angle) * config.size * 2
        );
        this.ctx.strokeStyle = config.color;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }
    
    // ==================== 排行榜 ====================
    
    loadLeaderboard() {
        this.socket.emit('leaderboard:get');
    }
    
    renderLeaderboard(data) {
        const tbody = document.getElementById('leaderboard-body');
        tbody.innerHTML = '';
        
        data.forEach((entry, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${entry.username}</td>
                <td>${entry.totalScore}</td>
                <td>${entry.wins}</td>
            `;
            tbody.appendChild(row);
        });
        
        this.showScreen('leaderboard-screen');
    }
}

// 初始化游戏
window.addEventListener('load', () => {
    window.game = new GameClient();
});
