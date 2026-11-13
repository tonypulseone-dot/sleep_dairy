import test from "node:test";
import assert from "node:assert/strict";
import {
  telegramContact,
  validateProfile,
  matchesFilters,
  type ConsultantProfile,
} from "./showcase";
const profile: ConsultantProfile = {
  name: "Анна",
  approach: "Бережный подход",
  experienceYears: 5,
  photoUrl: "data:image/jpeg;base64,/9j/AA==",
  contactUrl: "@anna_sleep",
  services: [
    { kind: "consultation", title: "Встреча", price: 2000 },
    { kind: "support", title: "Две недели", price: 15000 },
  ],
};
test("Telegram contacts are normalized and reject unsafe URLs", () => {
  assert.equal(telegramContact("@anna_sleep"), "https://t.me/anna_sleep");
  for (const v of [
    "https://evil.test/anna_sleep",
    "javascript:alert(1)",
    "https://t.me/anna_sleep?start=a",
    "https://t.me/+invite",
  ])
    assert.throws(() => telegramContact(v));
});
test("price and service filters match the same service", () => {
  assert.equal(matchesFilters(profile, "support", 3000, null), false);
  assert.equal(matchesFilters(profile, "consultation", 3000, 5), true);
  assert.equal(matchesFilters(profile, "", null, 6), false);
});
test("submission requires a complete profile and never accepts SVG", () => {
  assert.equal(
    validateProfile(profile, true).contactUrl,
    "https://t.me/anna_sleep",
  );
  assert.throws(() => validateProfile({ ...profile, photoUrl: "" }, true));
  assert.throws(() => validateProfile({ ...profile, services: [] }, true));
  assert.throws(() =>
    validateProfile(
      { ...profile, photoUrl: "data:image/svg+xml;base64,abc" },
      false,
    ),
  );
  assert.throws(() =>
    validateProfile(
      { ...profile, services: [{ kind: "other", price: 1, title: "" }] },
      true,
    ),
  );
  assert.throws(() =>
    validateProfile({ ...profile, experienceYears: -1 }, true),
  );
  assert.equal(
    validateProfile(
      { ...profile, photoUrl: "", approach: "", contactUrl: "" },
      false,
    ).photoUrl,
    "",
  );
});
