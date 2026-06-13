import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const usersTabPath = new URL("./UsersTab.jsx", import.meta.url);
const adminPagePath = new URL("../../AdminPage.jsx", import.meta.url);

test("users table opens edit on row click without modal navigation", async () => {
  const usersTab = await readFile(usersTabPath, "utf8");
  const adminPage = await readFile(adminPagePath, "utf8");

  assert.match(usersTab, /const openUser = \(user\) => onEdit\(user\);/);
  assert.match(usersTab, /onRow=\{\(user\) => \(\{/);
  assert.match(usersTab, /onClick: \(\) => openUser\(user\)/);
  assert.match(usersTab, /className: "users-table-row"/);
  assert.match(usersTab, /event\.stopPropagation\(\);[\s\S]*onEdit\(user\)/);
  assert.match(adminPage, /const openEditUser = useCallback\(\(u\) =>/);
  assert.doesNotMatch(adminPage, /userModalSequence/);
  assert.doesNotMatch(adminPage, /openAdjacentUser/);
  assert.doesNotMatch(adminPage, /onPreviousUser/);
  assert.doesNotMatch(adminPage, /onNextUser/);
});
