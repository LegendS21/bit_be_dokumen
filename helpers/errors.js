'use strict';

/**
 * Error yang memang disengaja (bukan bug) dan aman dikirim ke client.
 * Sama persis dengan yang dipakai service RBAC supaya bentuk response
 * error seragam antar service.
 */
class AppError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code || 'ERROR';
  }
}

const badRequest = (message, code = 'BAD_REQUEST') => new AppError(400, message, code);
const unauthorized = (message, code = 'UNAUTHORIZED') => new AppError(401, message, code);
const forbidden = (message, code = 'FORBIDDEN') => new AppError(403, message, code);
const notFound = (message, code = 'NOT_FOUND') => new AppError(404, message, code);
const conflict = (message, code = 'DUPLICATE') => new AppError(409, message, code);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict };
