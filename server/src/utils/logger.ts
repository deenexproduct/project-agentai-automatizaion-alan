import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';

// Asegurarse de que el directorio de logs exista en el volume de Railway si estamos en prod
const LOG_DIR = process.env.NODE_ENV === 'production'
    ? '/app/wa-sessions/logs'
    : path.join(__dirname, '../../wa-sessions/logs');

if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Formato personalizado para los logs
const logFormat = winston.format.printf(({ level, message, timestamp, module, userId }) => {
    let logStr = `[${timestamp}] ${level.toUpperCase()}`;
    if (module) logStr += ` [${module}]`;
    if (userId) logStr += ` [User ${userId}]`;
    logStr += `: ${message}`;
    return logStr;
});

// Transport para consola (coloreado en dev, limpio en prod)
const consoleTransport = new winston.transports.Console({
    format: winston.format.combine(
        process.env.NODE_ENV === 'production' ? winston.format.uncolorize() : winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
    )
});

// Transport para rotación diaria en disco
const fileRotateTransport = new DailyRotateFile({
    filename: path.join(LOG_DIR, 'whatsapp-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m', // 20 megabytes por archivo max
    maxFiles: '14d', // Mantener logs por 14 días
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
    )
});

// Prevenir crashing si falla la escritura del log
fileRotateTransport.on('error', (error) => {
    console.error('Logger DailyRotateFile Error:', error);
});

export const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    transports: [
        consoleTransport,
        fileRotateTransport
    ]
});
