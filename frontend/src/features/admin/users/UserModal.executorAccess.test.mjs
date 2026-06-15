import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adminContainerPath = new URL("../AdminTabContainers.jsx", import.meta.url);
const userModalPath = new URL("./UserModal.jsx", import.meta.url);

test("user form uses executor access instead of legacy profile", async () => {
  const adminContainer = await readFile(adminContainerPath, "utf8");
  const userModal = await readFile(userModalPath, "utf8");

  const legacyScope = new RegExp("master" + "Scope");
  const legacyProfile = new RegExp("master" + "_profile");

  assert.doesNotMatch(adminContainer, legacyScope);
  assert.doesNotMatch(adminContainer, legacyProfile);
  assert.doesNotMatch(userModal, /MASTER_SCOPE_OPTIONS/);
  assert.doesNotMatch(userModal, legacyScope);
  assert.match(adminContainer, /executor_access:\s*accessPayloadFromForm\(userForm\.executorAccess\)/);
  assert.match(userModal, /executorAccess/);
});
