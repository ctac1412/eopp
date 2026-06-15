import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const usersTabPath = new URL("./UsersTab.jsx", import.meta.url);
const adminContainerPath = new URL("../AdminTabContainers.jsx", import.meta.url);

test("users table opens edit on row click without modal navigation", async () => {
  const usersTab = await readFile(usersTabPath, "utf8");
  const adminContainer = await readFile(adminContainerPath, "utf8");

  assert.match(usersTab, /const openUser = \(user\) => onEdit\(user\);/);
  assert.match(usersTab, /onRow=\{\(user\) => \(\{/);
  assert.match(usersTab, /onClick: \(\) => openUser\(user\)/);
  assert.match(usersTab, /className: "users-table-row"/);
  assert.match(usersTab, /event\.stopPropagation\(\);[\s\S]*confirmDelete\(user\)/);
  assert.match(adminContainer, /const openEditUser = useCallback\(\(user\) =>/);
  assert.doesNotMatch(adminContainer, /userModalSequence/);
  assert.doesNotMatch(adminContainer, /openAdjacentUser/);
  assert.doesNotMatch(adminContainer, /onPreviousUser/);
  assert.doesNotMatch(adminContainer, /onNextUser/);
});
