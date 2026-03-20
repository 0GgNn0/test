/**
 * 数据库模块
 * Database Module - In-Memory Store
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface User {
    id: number;
    username: string;
    password_hash: string;
    created_at: Date;
}

interface GameRecord {
    id: number;
    user_id: number;
    username: string;
    mode: string;
    result: string;
    kills: number;
    deaths: number;
    score: number;
    played_at: Date;
}

interface LeaderboardEntry {
    user_id: number;
    username: string;
    total_score: number;
    wins: number;
    games_played: number;
    updated_at: Date;
}

class InMemoryDatabase {
    private users: Map<number, User> = new Map();
    private gameRecords: GameRecord[] = [];
    private leaderboard: Map<number, LeaderboardEntry> = new Map();
    private userIdCounter = 1;
    private recordIdCounter = 1;

    init() {
        console.log('📦 In-Memory Database initialized');
    }

    createUser(username: string, passwordHash: string): number {
        const id = this.userIdCounter++;
        const user: User = {
            id,
            username,
            password_hash: passwordHash,
            created_at: new Date()
        };
        this.users.set(id, user);
        return id;
    }

    getUserByUsername(username: string): User | undefined {
        for (const user of this.users.values()) {
            if (user.username === username) {
                return user;
            }
        }
        return undefined;
    }

    getUserById(id: number): User | undefined {
        return this.users.get(id);
    }

    saveGameRecord(userId: number, username: string, data: {
        mode: string;
        result: string;
        kills: number;
        deaths: number;
        score: number;
    }) {
        const id = this.recordIdCounter++;
        const record: GameRecord = {
            id,
            user_id: userId,
            username,
            mode: data.mode,
            result: data.result,
            kills: data.kills,
            deaths: data.deaths,
            score: data.score,
            played_at: new Date()
        };
        this.gameRecords.push(record);
        this.updateLeaderboard(userId, username, data.result, data.score);
    }

    private updateLeaderboard(userId: number, username: string, result: string, score: number) {
        const isWin = result === 'win';
        const existing = this.leaderboard.get(userId);

        if (existing) {
            existing.total_score += score;
            existing.wins += isWin ? 1 : 0;
            existing.games_played += 1;
            existing.updated_at = new Date();
        } else {
            this.leaderboard.set(userId, {
                user_id: userId,
                username,
                total_score: score,
                wins: isWin ? 1 : 0,
                games_played: 1,
                updated_at: new Date()
            });
        }
    }

    getLeaderboard(limit: number = 10): LeaderboardEntry[] {
        const entries = Array.from(this.leaderboard.values());
        entries.sort((a, b) => b.total_score - a.total_score);
        return entries.slice(0, limit);
    }

    getUserRank(userId: number): { rank: number } | undefined {
        const entry = this.leaderboard.get(userId);
        if (!entry) return undefined;

        let rank = 1;
        for (const e of this.leaderboard.values()) {
            if (e.total_score > entry.total_score) {
                rank++;
            }
        }
        return { rank };
    }
}

const db = new InMemoryDatabase();

export function initDatabase() {
    return db.init();
}

export function getDatabase() {
    return db;
}

export function createUser(username: string, passwordHash: string) {
    return db.createUser(username, passwordHash);
}

export function getUserByUsername(username: string) {
    return db.getUserByUsername(username);
}

export function getUserById(id: number) {
    return db.getUserById(id);
}

export function saveGameRecord(userId: number, username: string, data: {
    mode: string;
    result: string;
    kills: number;
    deaths: number;
    score: number;
}) {
    return db.saveGameRecord(userId, username, data);
}

export function getLeaderboard(limit: number = 10) {
    return db.getLeaderboard(limit);
}

export function getUserRank(userId: number) {
    return db.getUserRank(userId);
}