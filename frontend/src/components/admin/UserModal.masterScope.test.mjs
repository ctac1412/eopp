import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adminPagePath = new URL("../../AdminPage.jsx", import.meta.url);
const userModalPath = new URL("./UserModal.jsx", import.meta.url);

test("user form wires master scope for global super masters", async () => {
  const adminPage = await readFile(adminPagePath, "utf8");
  const userModal = await readFile(userModalPath, "utf8");

  assert.match(adminPage, /masterScope:\s*"own_company"/);
  assert.match(adminPage, /scope:\s*userForm\.masterScope\s*\|\|\s*"own_company"/);
  assert.match(adminPage, /masterScope:\s*u\.master_profile\?\.scope\s*\|\|\s*"own_company"/);
  assert.match(userModal, /MASTER_SCOPE_OPTIONS/);
  assert.match(userModal, /all_companies/);
  assert.match(userModal, /form\.masterScope/);
});
