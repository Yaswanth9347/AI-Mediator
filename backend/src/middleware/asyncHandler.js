
/**
 * Async Handler Wrapper
 * Wraps async route handlers to ensure errors are passed to Express error handling middleware.
 * Prevents unhandled rejections from crashing the process.
 */
export const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};
