/**
 * Sanitize an object to prevent prototype pollution
 * Creates a clean object without dangerous properties
 */
export function sanitizeObject(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item));
  }

  // Create clean object without prototype chain
  const clean: any = {};

  // Copy only safe properties
  for (const key of Object.keys(obj)) {
    // Block dangerous keys
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }

    // Recursively sanitize nested objects
    clean[key] = sanitizeObject(obj[key]);
  }

  return clean;
}
