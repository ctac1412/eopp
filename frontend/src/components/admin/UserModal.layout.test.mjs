import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const userModalPath = new URL("./UserModal.jsx", import.meta.url);
const stylesPath = new URL("../../styles/05-pages.css", import.meta.url);

test("user modal uses a three-quarter page layout", async () => {
  const userModal = await readFile(userModalPath, "utf8");
  const styles = await readFile(stylesPath, "utf8");

  assert.match(userModal, /width="75vw"/);
  assert.match(userModal, /className="users-modal users-modal--three-quarter"/);
  assert.match(userModal, /className="users-modal-form__fields"/);
  assert.match(userModal, /className="users-modal-form__access"/);
  assert.match(userModal, /import \{ Modal, Switch \} from "antd";/);
  assert.doesNotMatch(userModal, /users-modal-nav/);
  assert.doesNotMatch(userModal, /modalRender/);
  assert.match(styles, /\.users-modal-form__fields,[\s\S]*?\.users-modal-form__access\s*{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(styles, /\.users-modal-form\s+\.user-access-block\s*{[^}]*min-height:\s*238px/s);
  assert.match(styles, /\.users-modal-active-toggle/s);
  assert.doesNotMatch(styles, /\.users-modal-nav/s);
});
