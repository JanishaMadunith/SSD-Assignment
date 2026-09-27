const COMMON_PASSWORDS = new Set([
  '123456789012',
  'passwordpassword',
  'qwertyuiopas',
  'adminadminadmin',
  'letmeinletmein',
  'welcome123456',
]);

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 12) {
    return 'password must be at least 12 characters';
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return 'password is too common';
  }

  return null;
}

module.exports = { validatePassword };