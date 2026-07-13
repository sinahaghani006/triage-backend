// Computes whole-years age from a birthDate, as of "now" (or an injectable
// reference date for testability).
function calculateAge(birthDate, now = new Date()) {
  const birth = new Date(birthDate);
  let age = now.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }
  return age;
}

module.exports = calculateAge;
