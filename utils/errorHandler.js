// Centralized error handling utilities

const { log } = require('./helpers');

class AppError extends Error {
    constructor(message, statusCode = 500, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.timestamp = new Date().toISOString();
        
        Error.captureStackTrace(this, this.constructor);
    }
}

class ValidationError extends AppError {
    constructor(message, errors = []) {
        super(message, 400);
        this.errors = errors;
        this.type = 'ValidationError';
    }
}

class DatabaseError extends AppError {
    constructor(message, originalError = null) {
        super(message, 500);
        this.originalError = originalError;
        this.type = 'DatabaseError';
    }
}

class PaymentError extends AppError {
    constructor(message, code = null) {
        super(message, 402);
        this.code = code;
        this.type = 'PaymentError';
    }
}

class AuthenticationError extends AppError {
    constructor(message = 'Authentication failed') {
        super(message, 401);
        this.type = 'AuthenticationError';
    }
}

class AuthorizationError extends AppError {
    constructor(message = 'Access denied') {
        super(message, 403);
        this.type = 'AuthorizationError';
    }
}

class NotFoundError extends AppError {
    constructor(message = 'Resource not found') {
        super(message, 404);
        this.type = 'NotFoundError';
    }
}

class RateLimitError extends AppError {
    constructor(message = 'Too many requests') {
        super(message, 429);
        this.type = 'RateLimitError';
    }
}

// Error handler middleware for Express
const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;

    // Log error
    log('error', `${error.type || 'Error'}: ${error.message}`, {
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        stack: err.stack
    });

    // Default error response
    let statusCode = error.statusCode || 500;
    let message = error.message || 'Internal Server Error';

    // Handle specific error types
    if (error.type === 'ValidationError') {
        statusCode = 400;
        message = error.errors.length > 0 ? error.errors.join(', ') : message;
    }

    // Handle SQLite errors
    if (err.code === 'SQLITE_CONSTRAINT') {
        statusCode = 400;
        message = 'Database constraint violation';
    }

    // Handle JSON parsing errors
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        statusCode = 400;
        message = 'Invalid JSON format';
    }

    // Send error response
    if (req.accepts('html')) {
        // HTML response for web requests
        res.status(statusCode).render('error', {
            title: 'Error',
            error: process.env.NODE_ENV === 'development' ? err : { message },
            statusCode
        });
    } else {
        // JSON response for API requests
        res.status(statusCode).json({
            success: false,
            error: {
                message,
                statusCode,
                ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
            }
        });
    }
};

// Async error wrapper
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

// Telegram bot error handler
const telegramErrorHandler = (error, context = {}) => {
    log('error', 'Telegram bot error', {
        error: error.message,
        stack: error.stack,
        context
    });

    // Return user-friendly error message
    if (error instanceof ValidationError) {
        return 'Invalid input. Please check your data and try again.';
    }
    
    if (error instanceof PaymentError) {
        return 'Payment processing failed. Please try again or contact support.';
    }
    
    if (error instanceof DatabaseError) {
        return 'Database error occurred. Please try again later.';
    }
    
    if (error instanceof NotFoundError) {
        return 'The requested item was not found.';
    }
    
    // Generic error message
    return 'Something went wrong. Please try again later.';
};

// Database operation wrapper with error handling
const dbWrapper = async (operation, errorMessage = 'Database operation failed') => {
    try {
        return await operation();
    } catch (error) {
        log('error', errorMessage, error);
        throw new DatabaseError(errorMessage, error);
    }
};

// Payment operation wrapper with error handling
const paymentWrapper = async (operation, errorMessage = 'Payment operation failed') => {
    try {
        return await operation();
    } catch (error) {
        log('error', errorMessage, error);
        throw new PaymentError(errorMessage, error.code);
    }
};

// Validation wrapper
const validateAndThrow = (validation, data) => {
    const result = validation(data);
    if (!result.isValid) {
        throw new ValidationError('Validation failed', result.errors);
    }
    return true;
};

// Safe JSON parse
const safeJsonParse = (str, defaultValue = null) => {
    try {
        return JSON.parse(str);
    } catch (error) {
        log('warn', 'JSON parse failed', { str, error: error.message });
        return defaultValue;
    }
};

// Safe number conversion
const safeNumber = (value, defaultValue = 0) => {
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
};

// Safe string conversion
const safeString = (value, defaultValue = '') => {
    if (value === null || value === undefined) {
        return defaultValue;
    }
    return String(value);
};

module.exports = {
    // Error classes
    AppError,
    ValidationError,
    DatabaseError,
    PaymentError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    RateLimitError,
    
    // Error handlers
    errorHandler,
    asyncHandler,
    telegramErrorHandler,
    
    // Wrappers
    dbWrapper,
    paymentWrapper,
    validateAndThrow,
    
    // Utilities
    safeJsonParse,
    safeNumber,
    safeString
};
