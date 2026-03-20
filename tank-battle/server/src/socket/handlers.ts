/**
 * Socket处理程序
 * Socket Event Handlers
 */

import { Server, Socket } from 'socket.io';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { 
    createUser, 
    getUserByUsername, 
    getUserById,
    saveGameRecord,
    getLeaderboard 
} from '../database/db.js';

// JWT密钥
const JWT_SECRET = process.env.JWT_SECRET || 'tankbattle-secret-key-change-in-production';

// 房间管理
interface Room {
    id: string;
    name: string;
    players: Map<string, Player>;
    maxPlayers: number;
    gameStarted: boolean;
    gameState: GameState;
}

interface Player {
    id: string;
    socketId: string;
    username: string;
    userId: number;
    tankType: string;
    x: number;
    y: number;
    angle: number;
    hp: number;
    maxHp: number;
    kills: number;
    deaths: number;
}

interface GameState {
    players: Map<string, Player>;
    bullets: Bullet[];
    lastUpdate: number;
}

interface Bullet {
    id: string;
    type: string;
    x: number;
    y: number;
    angle: number;
    speed: number;
    damage: number;
    ownerId: string;
}

// 坦克配置
const TANK_CONFIGS = {
    light: { hp: 100, speed: 5, damage: 15 },
    medium: { hp: 150, speed: 3, damage: 20 },
    heavy: { hp: 250, speed: 2, damage: 30 },
    sniper: { hp: 80, speed: 2, damage: 50 },
    support: { hp: 120, speed: 3, damage: 10 }
};

// 子弹配置
const BULLET_CONFIGS = {
    normal: { speed: 8, damage: 20 },
    armor_piercing: { speed: 10, damage: 25, penetrate: true },
    missile: { speed: 5, damage: 35, tracking: true },
    shotgun: { speed: 6, damage: 15, count: 5, spread: 30 },
    laser: { speed: 50, damage: 40, instant: true }
};

const rooms = new Map<string, Room>();
const userSockets = new Map<string, string>(); // userId -> socketId
const socketUsers = new Map<string, number>(); // socketId -> userId
const socketRooms = new Map<string, string>(); // socketId -> roomId

// 随机位置生成
function getRandomPosition() {
    return {
        x: 100 + Math.random() * 1000,
        y: 100 + Math.random() * 600
    };
}

// 创建新房间
function createRoom(name: string): Room {
    const room: Room = {
        id: uuidv4(),
        name,
        players: new Map(),
        maxPlayers: 8,
        gameStarted: false,
        gameState: {
            players: new Map(),
            bullets: [],
            lastUpdate: Date.now()
        }
    };
    rooms.set(room.id, room);
    return room;
}

// 获取房间列表
function getRoomList(): any[] {
    return Array.from(rooms.values()).map(room => ({
        id: room.id,
        name: room.name,
        playerCount: room.players.size,
        maxPlayers: room.maxPlayers
    }));
}

export function setupSocketHandlers(io: Server) {
    io.on('connection', (socket: Socket) => {
        console.log(`🔌 Client connected: ${socket.id}`);
        
        // 认证：登录
        socket.on('auth:login', async (data) => {
            try {
                const user = getUserByUsername(data.username) as any;
                
                if (!user || !bcrypt.compareSync(data.password, user.password_hash)) {
                    socket.emit('auth:error', { message: '用户名或密码错误' });
                    return;
                }
                
                const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
                
                userSockets.set(user.id, socket.id);
                socketUsers.set(socket.id, user.id);
                
                socket.emit('auth:success', {
                    token,
                    userId: user.id,
                    username: user.username
                });
            } catch (error) {
                socket.emit('auth:error', { message: '登录失败' });
            }
        });
        
        // 认证：注册
        socket.on('auth:register', async (data) => {
            try {
                const existingUser = getUserByUsername(data.username);
                if (existingUser) {
                    socket.emit('auth:error', { message: '用户名已存在' });
                    return;
                }
                
                const passwordHash = bcrypt.hashSync(data.password, 10);
                const userId = createUser(data.username, passwordHash);
                
                const token = jwt.sign({ userId, username: data.username }, JWT_SECRET, { expiresIn: '7d' });
                
                userSockets.set(userId, socket.id);
                socketUsers.set(socket.id, userId);
                
                socket.emit('auth:success', {
                    token,
                    userId,
                    username: data.username
                });
            } catch (error) {
                socket.emit('auth:error', { message: '注册失败' });
            }
        });
        
        // 认证：登出
        socket.on('auth:logout', () => {
            const userId = socketUsers.get(socket.id);
            if (userId) {
                userSockets.delete(userId);
            }
            socketUsers.delete(socket.id);
            
            // 离开房间
            const roomId = socketRooms.get(socket.id);
            if (roomId) {
                leaveRoom(socket, roomId);
            }
        });
        
        // 房间：获取列表
        socket.on('room:list', () => {
            socket.emit('room:list', getRoomList());
        });
        
        // 房间：创建
        socket.on('room:create', (data) => {
            const userId = socketUsers.get(socket.id);
            if (!userId) {
                socket.emit('room:error', { message: '请先登录' });
                return;
            }
            
            const user = getUserById(userId) as any;
            const room = createRoom(data.name || `${user.username}的房间`);
            
            joinRoom(socket, room.id, data.tankType);
            socket.emit('room:created', { id: room.id, name: room.name });
        });
        
        // 房间：加入
        socket.on('room:join', (data) => {
            const roomId = data.roomId;
            const room = rooms.get(roomId);
            
            if (!room) {
                socket.emit('room:error', { message: '房间不存在' });
                return;
            }
            
            if (room.players.size >= room.maxPlayers) {
                socket.emit('room:error', { message: '房间已满' });
                return;
            }
            
            joinRoom(socket, roomId, data.tankType);
        });
        
        // 游戏：输入
        socket.on('game:input', (data) => {
            const roomId = socketRooms.get(socket.id);
            if (!roomId) return;
            
            const room = rooms.get(roomId);
            if (!room || !room.gameStarted) return;
            
            const player = room.gameState.players.get(socket.id);
            if (!player) return;
            
            // 处理移动
            const speed = TANK_CONFIGS[player.tankType as keyof typeof TANK_CONFIGS].speed;
            
            if (data.up) player.y -= speed;
            if (data.down) player.y += speed;
            if (data.left) player.x -= speed;
            if (data.right) player.x += speed;
            
            // 边界检查
            player.x = Math.max(20, Math.min(1180, player.x));
            player.y = Math.max(20, Math.min(780, player.y));
            
            // 处理射击
            if (data.fire && canFire(socket.id, room)) {
                fireBullet(room, player, data.bulletType || 'normal');
            }
        });
        
        // 排行榜
        socket.on('leaderboard:get', () => {
            const leaderboard = getLeaderboard(20);
            socket.emit('leaderboard:data', leaderboard);
        });
        
        // 断开连接
        socket.on('disconnect', () => {
            console.log(`🔌 Client disconnected: ${socket.id}`);
            
            const userId = socketUsers.get(socket.id);
            if (userId) {
                userSockets.delete(userId);
            }
            socketUsers.delete(socket.id);
            
            const roomId = socketRooms.get(socket.id);
            if (roomId) {
                leaveRoom(socket, roomId);
            }
        });
    });
    
    // 游戏主循环
    setInterval(() => {
        rooms.forEach((room, roomId) => {
            if (!room.gameStarted) return;
            
            updateGame(room);
            io.to(roomId).emit('game:state', {
                players: Array.from(room.gameState.players.entries()).reduce((acc, [id, p]) => {
                    acc[id] = p;
                    return acc;
                }, {} as any),
                bullets: room.gameState.bullets
            });
        });
    }, 1000 / 60); // 60 FPS
}

function joinRoom(socket: Socket, roomId: string, tankType: string) {
    const room = rooms.get(roomId);
    if (!room) return;
    
    const userId = socketUsers.get(socket.id);
    const user = getUserById(userId!) as any;
    
    const pos = getRandomPosition();
    const config = TANK_CONFIGS[tankType as keyof typeof TANK_CONFIGS];
    
    const player: Player = {
        id: socket.id,
        socketId: socket.id,
        username: user.username,
        userId: user.id,
        tankType,
        x: pos.x,
        y: pos.y,
        angle: 0,
        hp: config.hp,
        maxHp: config.hp,
        kills: 0,
        deaths: 0
    };
    
    room.players.set(socket.id, player);
    room.gameState.players.set(socket.id, player);
    
    socket.join(roomId);
    socketRooms.set(socket.id, roomId);
    
    // 通知玩家加入
    socket.emit('room:joined', { id: room.id, name: room.name });
    socket.to(roomId).emit('room:playerJoined', { playerId: socket.id, username: user.username });
    
    // 如果房间满了，自动开始游戏
    if (room.players.size >= 2) {
        startGame(room);
    }
}

function leaveRoom(socket: Socket, roomId: string) {
    const room = rooms.get(roomId);
    if (!room) return;
    
    const player = room.players.get(socket.id);
    if (player) {
        // 保存游戏记录
        if (room.gameStarted) {
            saveGameRecord(player.userId, player.username, {
                mode: 'classic',
                result: 'loss',
                kills: player.kills,
                deaths: player.deaths,
                score: player.kills * 100
            });
        }
    }
    
    room.players.delete(socket.id);
    room.gameState.players.delete(socket.id);
    socket.leave(roomId);
    socketRooms.delete(socket.id);
    
    socket.to(roomId).emit('game:playerLeft', { playerId: socket.id });
    
    // 如果房间空了，删除房间
    if (room.players.size === 0) {
        rooms.delete(roomId);
    }
}

function startGame(room: Room) {
    room.gameStarted = true;
    room.gameState.lastUpdate = Date.now();
    
    // 重置所有玩家位置和状态
    room.players.forEach(player => {
        const pos = getRandomPosition();
        player.x = pos.x;
        player.y = pos.y;
        player.hp = TANK_CONFIGS[player.tankType as keyof typeof TANK_CONFIGS].hp;
        player.maxHp = player.hp;
        player.kills = 0;
        player.deaths = 0;
    });
    
    room.gameState.bullets = [];
    
    // 通知游戏开始
    io.to(room.id).emit('game:start', {
        players: Array.from(room.players.values())
    });
}

const lastFireTime = new Map<string, number>();
const FIRE_COOLDOWN = 500;

function canFire(socketId: string, room: Room): boolean {
    const now = Date.now();
    const lastTime = lastFireTime.get(socketId) || 0;
    
    if (now - lastTime < FIRE_COOLDOWN) return false;
    
    lastFireTime.set(socketId, now);
    return true;
}

function fireBullet(room: Room, player: Player, bulletType: string) {
    const bulletConfig = BULLET_CONFIGS[bulletType as keyof typeof BULLET_CONFIGS];
    
    if (bulletType === 'shotgun') {
        // 霰弹：发射多发子弹
        for (let i = 0; i < 5; i++) {
            const angleOffset = (i - 2) * (30 * Math.PI / 180);
            room.gameState.bullets.push({
                id: uuidv4(),
                type: bulletType,
                x: player.x,
                y: player.y,
                angle: player.angle + angleOffset,
                speed: bulletConfig.speed,
                damage: bulletConfig.damage,
                ownerId: player.id
            });
        }
    } else {
        room.gameState.bullets.push({
            id: uuidv4(),
            type: bulletType,
            x: player.x,
            y: player.y,
            angle: player.angle,
            speed: bulletConfig.speed,
            damage: bulletConfig.damage,
            ownerId: player.id
        });
    }
}

function updateGame(room: Room) {
    // 更新子弹位置
    room.gameState.bullets = room.gameState.bullets.filter(bullet => {
        bullet.x += Math.cos(bullet.angle) * bullet.speed;
        bullet.y += Math.sin(bullet.angle) * bullet.speed;
        
        // 边界检查
        if (bullet.x < 0 || bullet.x > 1200 || bullet.y < 0 || bullet.y > 800) {
            return false;
        }
        
        // 碰撞检测
        for (const [id, player] of room.gameState.players) {
            if (id === bullet.ownerId) continue;
            
            const dx = bullet.x - player.x;
            const dy = bullet.y - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < 25) {
                // 命中
                player.hp -= bullet.damage;
                
                // 通知命中
                io.to(room.id).emit('game:hit', {
                    targetId: player.socketId,
                    hp: player.hp,
                    damage: bullet.damage
                });
                
                // 检查死亡
                if (player.hp <= 0) {
                    const attacker = room.gameState.players.get(bullet.ownerId);
                    if (attacker) {
                        attacker.kills++;
                    }
                    player.deaths++;
                    
                    // 复活
                    const pos = getRandomPosition();
                    player.x = pos.x;
                    player.y = pos.y;
                    player.hp = player.maxHp;
                    
                    io.to(room.id).emit('game:playerDied', {
                        playerId: player.socketId,
                        killerId: bullet.ownerId
                    });
                }
                
                return false;
            }
        }
        
        return true;
    });
    
    // 检查游戏结束
    const alivePlayers = Array.from(room.gameState.players.values()).filter(p => p.hp > 0);
    
    if (alivePlayers.length <= 1 && room.players.size > 1) {
        // 游戏结束
        const winner = alivePlayers[0];
        
        if (winner) {
            // 保存胜利记录
            saveGameRecord(winner.userId, winner.username, {
                mode: 'classic',
                result: 'win',
                kills: winner.kills,
                deaths: winner.deaths,
                score: winner.kills * 100 + 500
            });
            
            // 保存失败记录
            room.players.forEach(p => {
                if (p.id !== winner.id) {
                    saveGameRecord(p.userId, p.username, {
                        mode: 'classic',
                        result: 'loss',
                        kills: p.kills,
                        deaths: p.deaths,
                        score: p.kills * 100
                    });
                }
            });
        }
        
        io.to(room.id).emit('game:over', {
            winner: winner?.socketId,
            stats: Array.from(room.gameState.players.values()).map(p => ({
                username: p.username,
                kills: p.kills,
                deaths: p.deaths
            }))
        });
        
        // 重置游戏
        room.gameStarted = false;
    }
}
