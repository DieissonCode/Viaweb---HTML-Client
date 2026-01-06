// metrics.js
class MetricsCollector {
    constructor() {
        this.startTime = Date.now();
        this.eventCount = 0;
        this.commandCount = 0;
        this.errorCount = 0;
        this.lastEventTime = null;
        this.responseTimeSamples = [];
        this.maxSamples = 100;
        this.wsConnections = 0;
        this.activeConnections = 0;
    }

    recordEvent() {
        this.eventCount++;
        this.lastEventTime = Date.now();
    }

    recordCommand() {
        this.commandCount++;
    }

    recordError() {
        this.errorCount++;
    }

    recordResponseTime(timeMs) {
        this.responseTimeSamples.push(timeMs);
        if (this.responseTimeSamples.length > this.maxSamples) {
            this.responseTimeSamples.shift();
        }
    }

    recordConnection() {
        this.wsConnections++;
        this.activeConnections++;
    }

    recordDisconnection() {
        this.activeConnections = Math.max(0, this.activeConnections - 1);
    }

    getMetrics() {
        const uptime = Math.floor((Date.now() - this.startTime) / 1000);
        const avgResponseTime = this.responseTimeSamples.length > 0
            ? this.responseTimeSamples.reduce((a, b) => a + b, 0) / this.responseTimeSamples.length
            : 0;
        
        const eventsPerMinute = uptime > 0 ? (this.eventCount / (uptime / 60)).toFixed(2) : 0;

        return {
            uptime: uptime,
            uptimeFormatted: this.formatUptime(uptime),
            totalEvents: this.eventCount,
            totalCommands: this.commandCount,
            totalErrors: this.errorCount,
            eventsPerMinute: eventsPerMinute,
            avgResponseTime: avgResponseTime.toFixed(2),
            lastEventTime: this.lastEventTime ? new Date(this.lastEventTime).toISOString() : null,
            wsConnections: this.wsConnections,
            activeConnections: this.activeConnections,
            timestamp: new Date().toISOString()
        };
    }

    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        let parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        parts.push(`${secs}s`);
        
        return parts.join(' ');
    }

    reset() {
        this.startTime = Date.now();
        this.eventCount = 0;
        this.commandCount = 0;
        this.errorCount = 0;
        this.lastEventTime = null;
        this.responseTimeSamples = [];
    }
}

const metrics = new MetricsCollector();

module.exports = metrics;