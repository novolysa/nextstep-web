import { deleteUsers } from "./users";

export default async function globalTeardown() {
  await deleteUsers();
}
