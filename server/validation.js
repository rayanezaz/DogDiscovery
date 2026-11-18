export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function text(value, label, min = 1, max = 200) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max)
    throw new HttpError(400, `${label} must be ${min}–${max} characters.`);
  return value.trim();
}
export function id(value) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1)
    throw new HttpError(400, 'Invalid record ID.');
  return Number(value);
}
export function choice(value, options, label) {
  if (!options.includes(value)) throw new HttpError(400, `Choose a valid ${label}.`);
  return value;
}
export function credentials(body, register = false) {
  const email = text(body.email, 'Email', 3, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  const password = body.password;
  if(typeof password !== 'string' || password.length < (register ? 8 : 1) || password.length > 128)
    throw new HttpError(400, `Password must be ${register ? 8 : 1}–128 characters.`);
  return { email, password, ...(register ? { name: text(body.name, 'Name', 2, 80) } : {}) };
}
export function dogInput(body) {
  if (body.age_months === '' || body.age_months == null || !Number.isInteger(Number(body.age_months)) || Number(body.age_months) < 0 || Number(body.age_months) > 360)
    throw new HttpError(400, 'Age must be between 0 and 360 months.');
  if (!Array.isArray(body.images) || body.images.length < 1 || body.images.length > 5 || body.images.some(x => typeof x !== 'string'))
    throw new HttpError(400, 'Add between 1 and 5 photos.');
  const traits = body.traits ?? [];
  if (!Array.isArray(traits) || traits.length > 6) throw new HttpError(400, 'Choose up to 6 personality traits.');
  return {
    name: text(body.name, 'Name', 1, 60), breed: text(body.breed, 'Breed', 2, 80),
    age_months: Number(body.age_months), size: choice(body.size, ['Small', 'Medium', 'Large'], 'size'),
    sex: choice(body.sex, ['Female', 'Male'], 'sex'), location: text(body.location, 'Location', 2, 100),
    description: text(body.description, 'Story', 20, 4000),
    traits: traits.map(x => text(x, 'Trait', 1, 30)), images: [...new Set(body.images)],
    status: choice(body.status ?? 'available', ['available', 'paused'], 'listing status'),
  };
}
