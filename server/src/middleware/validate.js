const ApiError = require('../utils/ApiError');

const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

/**
 * Declarative validation, used as validate(rules) before a controller runs.
 * Keeps input checking in one readable place instead of spread over routes.
 *
 *   validate({
 *     title:        { required: true, type: 'string', maxLength: 200 },
 *     estimated_hours: { required: true, type: 'number', min: 0.5, max: 200 },
 *     priority:     { type: 'enum', values: ['LOW','MEDIUM','HIGH','CRITICAL'] },
 *   })
 */
function validate(rules) {
  return (req, res, next) => {
    const payload = req.body ?? {};
    const errors = [];

    for (const [field, rule] of Object.entries(rules)) {
      let value = payload[field];

      if (isBlank(value)) {
        if (rule.required) {
          errors.push(`${field} is required`);
          continue;
        }
        if (value === undefined) continue;
        if (rule.default !== undefined) {
          value = rule.default;
        } else if (value === '') {
          continue;
        }
      }

      if (value === undefined || value === null) continue;

      switch (rule.type) {
        case 'number':
        case 'int': {
          const num = Number(value);
          if (Number.isNaN(num)) {
            errors.push(`${field} must be a number`);
            continue;
          }
          if (rule.type === 'int' && !Number.isInteger(num)) {
            errors.push(`${field} must be a whole number`);
            continue;
          }
          if (rule.min !== undefined && num < rule.min) errors.push(`${field} must be at least ${rule.min}`);
          if (rule.max !== undefined && num > rule.max) errors.push(`${field} must be at most ${rule.max}`);
          payload[field] = num;
          break;
        }
        case 'date': {
          const parsed = new Date(value);
          if (Number.isNaN(parsed.getTime())) {
            errors.push(`${field} must be a valid date`);
            continue;
          }
          payload[field] = parsed.toISOString().slice(0, 10);
          break;
        }
        case 'enum': {
          const list = Array.isArray(rule.values) ? rule.values : rule.values;
          if (!list.includes(value)) {
            errors.push(`${field} must be one of: ${list.join(', ')}`);
          }
          break;
        }
        case 'email': {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) errors.push(`${field} must be a valid email`);
          break;
        }
        case 'array': {
          if (!Array.isArray(value)) {
            errors.push(`${field} must be an array`);
            continue;
          }
          if (rule.minItems && value.length < rule.minItems) {
            errors.push(`${field} needs at least ${rule.minItems} item(s)`);
          }
          break;
        }
        case 'string':
        default: {
          if (typeof value === 'object') {
            errors.push(`${field} must be text`);
            continue;
          }
          if (rule.minLength && String(value).length < rule.minLength) {
            errors.push(`${field} must be at least ${rule.minLength} characters`);
          }
          if (rule.maxLength && String(value).length > rule.maxLength) {
            errors.push(`${field} must be at most ${rule.maxLength} characters`);
          }
          if (rule.pattern && !rule.pattern.test(String(value))) {
            errors.push(`${field} has an invalid format`);
          }
          break;
        }
      }
    }

    if (errors.length) return next(ApiError.badRequest('Validation failed', errors));

    req.body = payload;
    return next();
  };
}

module.exports = validate;