class Usage {
  constructor() {
    this.sessions = new Map();
    this.dailyStats = new Map();
  }

  trackSession(sessionId, userId, url) {
    const session = {
      id: sessionId,
      userId,
      url,
      startTime: new Date(),
      status: 'active',
      completedAt: null,
      fileSize: 0,
      totalFiles: 0
    };
    
    this.sessions.set(sessionId, session);
    this.updateDailyStats(userId);
    return session;
  }

  updateSession(sessionId, updates) {
    const session = this.sessions.get(sessionId);
    if (session) {
      Object.assign(session, updates);
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  completeSession(sessionId, fileSize, totalFiles) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'completed';
      session.completedAt = new Date();
      session.fileSize = fileSize;
      session.totalFiles = totalFiles;
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  updateDailyStats(userId) {
    const today = new Date().toISOString().split('T')[0];
    const stats = this.dailyStats.get(today) || {
      date: today,
      totalSessions: 0,
      uniqueUsers: new Set(),
      totalSizeGB: 0,
      totalFiles: 0
    };

    stats.totalSessions++;
    stats.uniqueUsers.add(userId);
    this.dailyStats.set(today, stats);
  }

  getStats() {
    const totalSessions = this.sessions.size;
    const activeSessions = Array.from(this.sessions.values()).filter(s => s.status === 'active').length;
    const completedSessions = Array.from(this.sessions.values()).filter(s => s.status === 'completed').length;
    
    const last7Days = Array.from(this.dailyStats.values())
      .slice(-7)
      .map(day => ({
        ...day,
        uniqueUsers: day.uniqueUsers.size
      }));

    return {
      totalSessions,
      activeSessions,
      completedSessions,
      last7Days
    };
  }

  getUserSessions(userId) {
    return Array.from(this.sessions.values()).filter(s => s.userId === userId);
  }
}

module.exports = new Usage();